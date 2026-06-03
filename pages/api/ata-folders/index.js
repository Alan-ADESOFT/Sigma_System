/**
 * pages/api/ata-folders/index.js
 * Pastas das atas. GET lista, POST cria. (compartilhado — qualquer usuário do workspace)
 */
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const model = require('../../../models/ataFolder.model');

export default async function handler(req, res) {
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;

  try {
    if (req.method === 'GET') {
      const folders = await model.listFolders(tenantId);
      return res.json({ success: true, folders });
    }
    if (req.method === 'POST') {
      const { name, color } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Nome obrigatório' });
      const folder = await model.createFolder(tenantId, { name, color, createdBy: user.id });
      return res.status(201).json({ success: true, folder });
    }
    return res.status(405).end();
  } catch (err) {
    if (/unique|duplicate/i.test(err.message)) return res.status(409).json({ success: false, error: 'Já existe uma pasta com esse nome' });
    console.error('[ERRO][API:/api/ata-folders]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
