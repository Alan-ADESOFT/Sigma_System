/**
 * pages/api/form/submit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Submissão final do formulário — rota pública (sem autenticação).
 * Marca token como usado, salva respostas, atualiza dados do cliente
 * e dispara o pipeline de agentes automaticamente (se dados suficientes).
 *
 * POST — Body: { token, data }
 * Retorna: { success, message }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, queryOne } from '../../../infra/db';
import { validateToken, submitForm, createNotification } from '../../../models/clientForm';

/**
 * Mapeia respostas do formulário para campos do marketing_clients
 * @param {object} data - Dados do formulário { '1.1': 'valor', ... }
 * @returns {object} Campos mapeados para UPDATE
 */
function mapFormToClient(data) {
  const mapped = {};

  // Etapa 1 — Empresa
  if (data['1.1']) mapped.company_name = data['1.1'];
  if (data['1.2']) mapped.niche = data['1.2'];
  if (data['1.4']) mapped.region = data['1.4'];
  if (data['1.9']) mapped.avg_ticket = data['1.9'];

  // Etapa 2 — Produtos
  if (data['2.1']) mapped.main_product = String(data['2.1']).split('\n')[0]?.trim() || data['2.1'];
  if (data['2.2']) mapped.product_description = data['2.2'];

  // Etapa 3 — Público (vai para extra_data)
  // Etapa 4 — Dores e desejos
  if (data['4.1']) mapped.main_problem = data['4.1'];
  if (data['2.3']) mapped.transformation = data['2.3'];

  // Extra data — informações complementares do formulário
  const extraKeys = ['1.3', '1.5', '1.6', '1.7', '1.8', '1.10', '1.11', '1.12',
    '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10', '2.11', '2.12', '2.13', '2.14', '2.15', '2.16',
    '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10', '3.11', '3.12', '3.13', '3.14',
    '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9', '4.10', '4.11', '4.12', '4.13', '4.14',
    '5.1', '5.2', '5.3', '5.4', '5.5', '5.6',
    '6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8', '6.9', '6.10', '6.11', '6.12', '6.13', '6.14', '6.15', '6.16',
    '7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7',
    '8.1', '8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.8', '8.9', '8.10', '8.11', '8.12', '8.13',
    '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8', '9.9', '9.10', '9.11',
    '10.1', '10.2', '10.3', '10.4', '10.5', '10.6', '10.7',
    '11.1', '11.2', '11.3', '11.4', '11.5', '11.6', '11.7', '11.8', '11.9',
  ];
  const extra = {};
  for (const k of extraKeys) {
    if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
      extra[k] = data[k];
    }
  }
  if (Object.keys(extra).length > 0) {
    mapped.extra_data = extra;
  }

  // Objetivo de comunicação
  if (data['8.2']) mapped.comm_objective = data['8.2'];

  return mapped;
}

export default async function handler(req, res) {
  console.log('[INFO][API:/api/form/submit] Requisição recebida', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { token, data } = req.body;

    if (!token || !data) {
      return res.status(400).json({ success: false, error: 'Token e data são obrigatórios' });
    }

    // Token deve estar 'pending' ou 'in_progress' para submeter
    const result = await validateToken(token);
    const canSubmit = result.valid || result.reason === 'in_progress';
    if (!canSubmit) {
      console.log('[INFO][API:/api/form/submit] Token inválido para submissão', { reason: result.reason });
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado', reason: result.reason });
    }

    const { id: tokenId, client_id: clientId, tenant_id: tenantId, company_name } = result.tokenData;

    // Submete o formulário (salva dados + marca token como usado)
    await submitForm(tokenId, clientId, tenantId, data);

    // Mapeia respostas do form para campos do cliente
    const mapped = mapFormToClient(data);
    if (Object.keys(mapped).length > 0) {
      const sets = [];
      const params = [];
      let idx = 1;

      for (const [col, val] of Object.entries(mapped)) {
        if (col === 'extra_data') {
          sets.push(`extra_data = COALESCE(extra_data, '{}'::jsonb) || $${idx++}::jsonb`);
          params.push(JSON.stringify(val));
        } else {
          sets.push(`${col} = $${idx++}`);
          params.push(val);
        }
      }
      sets.push('updated_at = now()');
      params.push(clientId);

      await query(
        `UPDATE marketing_clients SET ${sets.join(', ')} WHERE id = $${idx}`,
        params
      );
      console.log('[INFO][API:/api/form/submit] Dados do cliente atualizados via form', { clientId, fields: Object.keys(mapped) });
    }

    // Marca form_done = true e salva timestamp no extra_data
    await query(
      `UPDATE marketing_clients
       SET form_done = true,
           extra_data = COALESCE(extra_data, '{}') || $1::jsonb,
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify({ form_submitted_at: new Date().toISOString() }), clientId]
    );

    // Verifica condição mínima para disparar pipeline automático
    const clientNow = await queryOne('SELECT company_name, niche FROM marketing_clients WHERE id = $1', [clientId]);
    const canRunPipeline = clientNow?.company_name && clientNow?.niche;

    if (canRunPipeline && process.env.INTERNAL_API_TOKEN) {
      console.log('[INFO][API:/api/form/submit] Disparando pipeline automático', { clientId });

      // Notifica o operador com mensagem atualizada
      await createNotification(
        tenantId,
        'form_submitted',
        'Formulário preenchido — Pipeline iniciado',
        `${company_name || 'Cliente'} enviou o formulário de briefing. Pipeline de agentes iniciado automaticamente.`,
        clientId,
        { submittedAt: new Date().toISOString(), pipelineTriggered: true }
      );

      // Dispara pipeline em background (não bloqueia resposta)
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      setImmediate(async () => {
        try {
          const r = await fetch(`${baseUrl}/api/agentes/pipeline/run-all`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-token': process.env.INTERNAL_API_TOKEN,
            },
            body: JSON.stringify({ clientId, triggeredByForm: true }),
          });
          const d = await r.json();
          if (d.success) {
            console.log('[SUCESSO][API:/api/form/submit] Pipeline disparado', { clientId, jobId: d.jobId });
          } else {
            console.warn('[WARNING][API:/api/form/submit] Pipeline não iniciado', { clientId, error: d.error });
          }
        } catch (err) {
          console.error('[ERRO][API:/api/form/submit] Falha ao disparar pipeline', { clientId, error: err.message });
        }
      });
    } else {
      // Notifica sem pipeline
      await createNotification(
        tenantId,
        'form_submitted',
        'Formulário preenchido',
        `${company_name || 'Cliente'} acabou de enviar o formulário de briefing.`,
        clientId,
        { submittedAt: new Date().toISOString() }
      );

      if (!canRunPipeline) {
        console.log('[INFO][API:/api/form/submit] Condição mínima não atendida para pipeline', { clientId, hasName: !!clientNow?.company_name, hasNiche: !!clientNow?.niche });
      }
    }

    console.log('[SUCESSO][API:/api/form/submit] Formulário submetido com sucesso', { clientId });
    return res.json({ success: true, message: 'Formulário enviado com sucesso!' });
  } catch (err) {
    console.error('[ERRO][API:/api/form/submit] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
