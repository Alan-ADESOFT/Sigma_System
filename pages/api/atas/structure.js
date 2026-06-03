/**
 * pages/api/atas/structure.js
 * POST { text, referenceWeek? } → a IA quebra o texto cru da ata em afazeres
 * (cliente, descrição, responsável, dia). Reaproveita o parseBulkImport da
 * "Importar Ata" (mesma IA que já transforma texto em tarefas).
 */
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const { query } = require('../../../infra/db');
const { parseBulkImport } = require('../../../models/tasks/bulkImportAI');
const { ensureDefaultCategories } = require('../../../models/taskCategory.model');

function mondayIso(date = new Date()) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;

  try {
    const { text, referenceWeek } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ success: false, error: 'Texto vazio' });

    await ensureDefaultCategories(tenantId);
    const [users, clients, categories] = await Promise.all([
      query(`SELECT id, name FROM tenants WHERE is_active = true AND name IS NOT NULL ORDER BY name ASC`),
      query(`SELECT id, company_name FROM marketing_clients WHERE tenant_id = $1 ORDER BY company_name ASC`, [tenantId]),
      query(`SELECT id, name FROM task_categories WHERE tenant_id = $1 ORDER BY name ASC`, [tenantId]),
    ]);

    const result = await parseBulkImport({
      text, users, clients, categories,
      referenceWeek: referenceWeek || mondayIso(),
      fallbackUserId: user.id, tenantId,
    });

    const afazeres = (result.tasks || []).map((t) => ({
      client_id: t.client_id || null,
      category_id: t.category_id || null,
      description: t.title,
      assigned_to: t.assigned_to || null,
      due_date: t.due_date || null,
      next_week: false,
    }));

    return res.json({ success: true, afazeres, warnings: result.warnings || [] });
  } catch (err) {
    console.error('[ERRO][API:/api/atas/structure]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
