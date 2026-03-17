import { getStagesByClient, upsertStage, updateStageNotes } from '../../../../models/marketing.model';
import { getClientById } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';

const VALID_STAGES = ['diagnosis', 'competitors', 'audience', 'avatar', 'positioning', 'offer'];
const VALID_STATUS = ['pending', 'in_progress', 'done'];

export default async function handler(req, res) {
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
        return res.json({ success: true, stage });
      }

      const stage = await upsertStage(
        clientId,
        stage_key,
        data ?? null,
        status ?? 'in_progress',
        notes ?? null
      );
      return res.json({ success: true, stage });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error(`[/api/clients/${clientId}/stages] Erro:`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
