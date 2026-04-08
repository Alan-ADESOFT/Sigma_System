const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { queryOne } = require('../../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const tenantId = await resolveTenantId(req);
  const { id } = req.query;
  const { groupId, groupName } = req.body;

  try {
    const client = await queryOne(
      `UPDATE marketing_clients
       SET whatsapp_group_id = $1, whatsapp_group_name = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, whatsapp_group_id, whatsapp_group_name`,
      [groupId || null, groupName || null, id, tenantId]
    );

    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    return res.json({ success: true, client });
  } catch (err) {
    console.error('[ERRO][API:/api/clients/[id]/whatsapp-group]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
