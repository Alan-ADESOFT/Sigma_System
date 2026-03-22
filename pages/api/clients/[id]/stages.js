import { getStagesByClient, upsertStage, updateStageNotes } from '../../../../models/marketing.model';
import { getClientById } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { createNotification } from '../../../../models/clientForm';

const VALID_STAGES = ['diagnosis', 'competitors', 'audience', 'avatar', 'positioning', 'offer'];
const VALID_STATUS = ['pending', 'in_progress', 'done'];

const STAGE_LABELS = {
  diagnosis: 'Diagnostico', competitors: 'Concorrentes', audience: 'Publico-Alvo',
  avatar: 'Avatar', positioning: 'Posicionamento', offer: 'Oferta',
};

export default async function handler(req, res) {
  console.log('[INFO][API:/api/clients/:id/stages] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);
  const { id: clientId } = req.query;

  if (!clientId) return res.status(400).json({ success: false, error: 'ID do cliente obrigatorio' });

  try {
    // Verifica se o cliente pertence ao tenant
    const client = await getClientById(clientId, tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente nao encontrado' });

    // GET /api/clients/[id]/stages → todas as etapas do cliente
    if (req.method === 'GET') {
      const stages = await getStagesByClient(clientId);
      console.log('[SUCESSO][API:/api/clients/:id/stages] Resposta enviada', { clientId, stageCount: stages.length });
      return res.json({ success: true, stages });
    }

    // POST /api/clients/[id]/stages → salva / atualiza uma etapa
    if (req.method === 'POST') {
      const { stage_key, data, status, notes } = req.body;

      if (!stage_key || !VALID_STAGES.includes(stage_key)) {
        return res.status(400).json({
          success: false,
          error: `stage_key invalido. Valores aceitos: ${VALID_STAGES.join(', ')}`
        });
      }

      if (status && !VALID_STATUS.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `status invalido. Valores aceitos: ${VALID_STATUS.join(', ')}`
        });
      }

      // Se apenas notes for passado, só atualiza as notes
      if (notes !== undefined && data === undefined && status === undefined) {
        const stage = await updateStageNotes(clientId, stage_key, notes);
        console.log('[SUCESSO][API:/api/clients/:id/stages] Notes atualizadas', { clientId, stage_key });
        return res.json({ success: true, stage });
      }

      const stage = await upsertStage(
        clientId,
        stage_key,
        data ?? null,
        status ?? 'in_progress',
        notes ?? null
      );
      console.log('[SUCESSO][API:/api/clients/:id/stages] Etapa salva', { clientId, stage_key, status: status ?? 'in_progress' });

      // Notificacao quando etapa e marcada como concluida
      if (status === 'done') {
        try {
          await createNotification(
            tenantId, 'stage_done', 'Etapa concluida',
            `A etapa "${STAGE_LABELS[stage_key] || stage_key}" de ${client.company_name} foi marcada como concluida.`,
            clientId, { stageKey: stage_key }
          );
        } catch {}
      }

      return res.json({ success: true, stage });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/clients/:id/stages] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
