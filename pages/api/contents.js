const { getContents, saveContent, deleteContent } = require('../../models/content.model');
const { resolveTenantId } = require('../../infra/get-tenant-id');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const contents = await getContents(tenantId);
      return res.json({ success: true, contents });
    }

    if (req.method === 'POST') {
      const result = await saveContent(tenantId, req.body);
      return res.json(result);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'ID obrigatorio' });
      await deleteContent(tenantId, id);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[/api/contents] Erro:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
