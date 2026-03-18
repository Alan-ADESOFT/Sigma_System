const { getContents, saveContent, deleteContent } = require('../../models/content.model');
const { resolveTenantId } = require('../../infra/get-tenant-id');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/contents] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const contents = await getContents(tenantId);
      console.log('[SUCESSO][API:/api/contents] Resposta enviada', { count: contents.length });
      return res.json({ success: true, contents });
    }

    if (req.method === 'POST') {
      const result = await saveContent(tenantId, req.body);
      console.log('[SUCESSO][API:/api/contents] Conteúdo salvo', { success: result.success });
      return res.json(result);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'ID obrigatorio' });
      await deleteContent(tenantId, id);
      console.log('[SUCESSO][API:/api/contents] Conteúdo removido', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/contents] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
