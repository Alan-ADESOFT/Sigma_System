/**
 * pages/api/financeiro/company.js
 * CRUD para custos e ganhos da empresa (company_finances)
 * GET    → lista com filtros opcionais (month, year, type)
 * POST   → cria novo registro
 * PUT    → atualiza registro
 * DELETE → remove registro
 */

import { query, queryOne } from '../../../infra/db';
import { resolveTenantId } from '../../../infra/get-tenant-id';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const { month, year, type } = req.query;
      let sql = `SELECT * FROM company_finances WHERE tenant_id = $1`;
      const params = [tenantId];
      let idx = 2;

      if (type && (type === 'income' || type === 'expense')) {
        sql += ` AND type = $${idx++}`;
        params.push(type);
      }
      if (year) {
        sql += ` AND EXTRACT(YEAR FROM date) = $${idx++}`;
        params.push(parseInt(year));
      }
      if (month) {
        sql += ` AND EXTRACT(MONTH FROM date) = $${idx++}`;
        params.push(parseInt(month));
      }

      sql += ' ORDER BY date DESC, created_at DESC';
      const rows = await query(sql, params);
      return res.json({ success: true, records: rows });
    }

    if (req.method === 'POST') {
      const { type, category, description, value, date, notes } = req.body;
      if (!type || !description || !value || !date) {
        return res.status(400).json({ success: false, error: 'type, description, value e date são obrigatórios' });
      }
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ success: false, error: 'type deve ser income ou expense' });
      }

      const row = await queryOne(
        `INSERT INTO company_finances (tenant_id, type, category, description, value, date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [tenantId, type, category || null, description, parseFloat(value), date, notes || null]
      );
      return res.status(201).json({ success: true, record: row });
    }

    if (req.method === 'PUT') {
      const { id, type, category, description, value, date, notes } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

      const row = await queryOne(
        `UPDATE company_finances SET
           type        = COALESCE($2, type),
           category    = COALESCE($3, category),
           description = COALESCE($4, description),
           value       = COALESCE($5, value),
           date        = COALESCE($6, date),
           notes       = COALESCE($7, notes),
           updated_at  = now()
         WHERE id = $1 AND tenant_id = $8 RETURNING *`,
        [id, type || null, category !== undefined ? category : null, description || null,
         value ? parseFloat(value) : null, date || null, notes !== undefined ? notes : null, tenantId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
      return res.json({ success: true, record: row });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });
      await query(`DELETE FROM company_finances WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      return res.json({ success: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[/api/financeiro/company]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
