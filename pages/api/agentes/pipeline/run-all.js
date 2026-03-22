/**
 * @fileoverview Endpoint: Rodar pipeline completo para um cliente
 * @route POST /api/agentes/pipeline/run-all
 *
 * Body: { clientId: string, triggeredByForm?: boolean }
 *
 * Dispara a execução de todos os agentes em sequência (background).
 * Retorna imediatamente com o jobId para polling de status.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { query, queryOne } from '../../../../infra/db';
import { orchestrate }     from '../../../../models/agentes/copycreator/orchestrator';
import { getExecutionOrder } from '../../../../models/agentes/copycreator/pipelineConfig';
import { createJobEmitter } from '../../../../infra/pipelineEmitter';

/**
 * Converte markdown básico para HTML (mesmo padrão do StageModal frontend)
 */
function markdownToHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-–—] (.+)$/gm, '\u2022 $1')
    .replace(/\n/g, '<br>');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  // Autenticação: aceita tenant normal OU token interno (para chamadas do form submit)
  let tenantId;
  const internalToken = req.headers['x-internal-token'];
  if (internalToken && internalToken === process.env.INTERNAL_API_TOKEN) {
    // Chamada interna — resolve tenant pelo clientId
    const { clientId } = req.body;
    const client = await queryOne('SELECT tenant_id FROM marketing_clients WHERE id = $1', [clientId]);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    tenantId = client.tenant_id;
  } else {
    tenantId = await resolveTenantId(req);
  }

  const { clientId } = req.body;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
  }

  // Verifica se o cliente existe e pertence ao tenant
  const client = await queryOne(
    'SELECT * FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
    [clientId, tenantId]
  );
  if (!client) {
    return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
  }

  // Verifica se já existe um pipeline rodando para este cliente
  const running = await queryOne(
    `SELECT id FROM pipeline_jobs WHERE client_id = $1 AND status = 'running' LIMIT 1`,
    [clientId]
  );
  if (running) {
    return res.status(409).json({ success: false, error: 'Já existe um pipeline em andamento para este cliente', jobId: running.id });
  }

  try {
    // Cria o registro de job
    const job = await queryOne(
      `INSERT INTO pipeline_jobs (tenant_id, client_id, total_agents, status)
       VALUES ($1, $2, $3, 'running') RETURNING id`,
      [tenantId, clientId, 8]
    );
    const jobId = job.id;

    console.log('[INFO][Pipeline] Pipeline iniciado', { jobId, clientId, company: client.company_name });

    // Dispara execução em background
    setImmediate(async () => {
      try {
        await runPipeline(tenantId, clientId, client, jobId);
      } catch (err) {
        console.error('[ERRO][Pipeline] Erro fatal no pipeline', { jobId, error: err.message });
        await queryOne(
          `UPDATE pipeline_jobs SET status = 'failed', error = $1, finished_at = now() WHERE id = $2`,
          [err.message, jobId]
        );
      }
    });

    return res.json({ success: true, jobId });
  } catch (err) {
    console.error('[ERRO][Pipeline] Erro ao iniciar pipeline', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Executa o pipeline completo em sequência
 */
async function runPipeline(tenantId, clientId, client, jobId) {
  const emitter = createJobEmitter(jobId);
  const executionOrder = getExecutionOrder();

  // Monta o userInput base com dados do cliente
  const clientJson = JSON.stringify({
    empresa:            client.company_name,
    nicho:              client.niche,
    produto_principal:  client.main_product,
    descricao_produto:  client.product_description,
    transformacao:      client.transformation,
    principal_problema: client.main_problem,
    ticket_medio:       client.avg_ticket,
    regiao:             client.region,
    objetivo:           client.comm_objective,
    email:              client.email,
    telefone:           client.phone,
    links:              client.important_links,
    servicos:           client.services,
    observacoes:        client.observations,
  }, null, 2);

  // Busca dados do formulário se existir
  let formData = '';
  const formResponse = await queryOne(
    `SELECT data FROM client_form_responses
     WHERE client_id = $1 AND status = 'submitted'
     ORDER BY submitted_at DESC LIMIT 1`,
    [clientId]
  );
  if (formResponse?.data) {
    formData = `\n\n─────────────────────────────────────\nDADOS DO FORMULÁRIO DO CLIENTE\n─────────────────────────────────────\n${JSON.stringify(formResponse.data, null, 2)}`;
  }

  const userInput = clientJson + formData;

  // Verifica se modo revisão está ativo
  const reviewSetting = await queryOne(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'review_mode_enabled'`,
    [tenantId]
  );
  const reviewMode = reviewSetting?.value === 'true';
  if (reviewMode) console.log('[INFO][Pipeline] Modo revisão ATIVO', { jobId });

  for (const { agentName, config } of executionOrder) {
    const startedAt = new Date().toISOString();

    try {
      // Modo revisão: pausar antes de cada agente (exceto o primeiro)
      if (reviewMode && config.order > 1) {
        console.log('[INFO][Pipeline] Aguardando revisão antes de', { jobId, agentName });
        await queryOne(
          `UPDATE pipeline_jobs SET status = 'awaiting_review', current_agent = $1 WHERE id = $2`,
          [agentName, jobId]
        );

        // Poll até ser aprovado (check a cada 3s, timeout 30min)
        const maxWait = 30 * 60 * 1000;
        const startWait = Date.now();
        let approved = false;
        while (Date.now() - startWait < maxWait) {
          await new Promise(r => setTimeout(r, 3000));
          const job = await queryOne('SELECT status FROM pipeline_jobs WHERE id = $1', [jobId]);
          if (job?.status === 'approved') {
            approved = true;
            await queryOne(`UPDATE pipeline_jobs SET status = 'running' WHERE id = $1`, [jobId]);
            break;
          }
          if (job?.status === 'failed') return; // pipeline foi cancelado externamente
        }
        if (!approved) {
          await queryOne(
            `UPDATE pipeline_jobs SET status = 'failed', error = 'Timeout de revisão (30min)', finished_at = now() WHERE id = $1`,
            [jobId]
          );
          return;
        }
        console.log('[INFO][Pipeline] Revisão aprovada, continuando', { jobId, agentName });
      }

      // Atualiza job: agente atual
      await queryOne(
        `UPDATE pipeline_jobs SET current_agent = $1, status = 'running' WHERE id = $2`,
        [agentName, jobId]
      );

      console.log('[INFO][Pipeline] Executando agente', { jobId, agentName, order: config.order });
      emitter.emit('event', { type: 'agent_start', agentName, agentIndex: config.order, timestamp: Date.now() });

      // Executa via orchestrate (loadDependenciesFromKB já carrega contexto automaticamente)
      const result = await orchestrate({
        agentName,
        tenantId,
        clientId,
        userInput,
        context: { '{DADOS_CLIENTE}': clientJson },
      });

      // Salva no marketing_stages (converte markdown → HTML para exibição no editor)
      const notesHtml = markdownToHtml(result.text);
      await queryOne(
        `INSERT INTO marketing_stages (client_id, stage_key, status, data, notes)
         VALUES ($1, $2, 'done', $3, $4)
         ON CONFLICT (client_id, stage_key)
         DO UPDATE SET status = 'done', data = EXCLUDED.data, notes = EXCLUDED.notes, updated_at = now()`,
        [clientId, config.stageKey, JSON.stringify({ agentOutput: result.text, agentName, generatedAt: new Date().toISOString() }), notesHtml]
      );

      // Salva versão snapshot (stage_versions)
      const latestVer = await queryOne(
        `SELECT version FROM stage_versions WHERE client_id = $1 AND stage_key = $2 ORDER BY version DESC LIMIT 1`,
        [clientId, config.stageKey]
      );
      const nextVer = (latestVer?.version || 0) + 1;
      const wc = result.text.split(/\s+/).filter(w => w.length > 0).length;
      await queryOne(
        `INSERT INTO stage_versions (client_id, stage_key, version, content, word_count, created_by)
         VALUES ($1, $2, $3, $4, $5, 'pipeline')`,
        [clientId, config.stageKey, nextVer, result.text, wc]
      );

      // Atualiza job: incrementa completed_agents e adiciona log
      const finishedAt = new Date().toISOString();
      await queryOne(
        `UPDATE pipeline_jobs
         SET completed_agents = completed_agents + 1,
             logs = logs || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify([{ agentName, status: 'done', startedAt, finishedAt }]), jobId]
      );

      emitter.emit('event', { type: 'agent_done', agentName, agentIndex: config.order, textLength: result.text.length, timestamp: Date.now() });
      console.log('[SUCESSO][Pipeline] Agente concluído', { jobId, agentName, resultLength: result.text.length });

    } catch (err) {
      console.error('[ERRO][Pipeline] Agente falhou', { jobId, agentName, error: err.message });

      const finishedAt = new Date().toISOString();
      await queryOne(
        `UPDATE pipeline_jobs
         SET status = 'failed',
             error = $1,
             current_agent = $2,
             logs = logs || $3::jsonb,
             finished_at = now()
         WHERE id = $4`,
        [
          `Falha no ${agentName}: ${err.message}`,
          agentName,
          JSON.stringify([{ agentName, status: 'failed', startedAt, finishedAt, error: err.message }]),
          jobId,
        ]
      );
      emitter.emit('event', { type: 'pipeline_error', message: err.message, agentName, timestamp: Date.now() });
      return; // Para o pipeline no primeiro erro
    }
  }

  // Pipeline concluído com sucesso
  await queryOne(
    `UPDATE pipeline_jobs SET status = 'completed', current_agent = NULL, finished_at = now() WHERE id = $1`,
    [jobId]
  );
  emitter.emit('event', { type: 'pipeline_done', timestamp: Date.now() });
  console.log('[SUCESSO][Pipeline] Pipeline completo', { jobId, clientId });
}
