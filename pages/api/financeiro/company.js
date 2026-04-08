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
  console.log('[INFO][API:/api/financeiro/company] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const { month, year, type, dateFrom, dateTo, period, categoryId } = req.query;
      let sql = `SELECT cf.*, fc.name AS category_name, fc.color AS category_color, fc.type AS category_type
                 FROM company_finances cf
                 LEFT JOIN finance_categories fc ON fc.id = cf.category_id
                 WHERE cf.tenant_id = $1`;
      const params = [tenantId];
      let idx = 2;

      if (type && (type === 'income' || type === 'expense')) {
        sql += ` AND cf.type = $${idx++}`;
        params.push(type);
      }
      if (categoryId) {
        sql += ` AND cf.category_id = $${idx++}`;
        params.push(categoryId);
      }

      // Period shortcuts
      if (period) {
        const now = new Date();
        let from, to;
        if (period === '7d') {
          from = new Date(now); from.setDate(from.getDate() - 7);
        } else if (period === '30d') {
          from = new Date(now); from.setDate(from.getDate() - 30);
        } else if (period === '90d') {
          from = new Date(now); from.setDate(from.getDate() - 90);
        } else if (period === 'this_month') {
          from = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'last_month') {
          from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          to = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (period === 'this_year') {
          from = new Date(now.getFullYear(), 0, 1);
        }
        if (from) {
          sql += ` AND cf.date >= $${idx++}`;
          params.push(from.toISOString().split('T')[0]);
        }
        if (to) {
          sql += ` AND cf.date <= $${idx++}`;
          params.push(to.toISOString().split('T')[0]);
        }
      } else {
        // Free date range filters
        if (dateFrom) {
          sql += ` AND cf.date >= $${idx++}`;
          params.push(dateFrom);
        }
        if (dateTo) {
          sql += ` AND cf.date <= $${idx++}`;
          params.push(dateTo);
        }
        // Legacy year/month filters
        if (year && !dateFrom && !dateTo) {
          sql += ` AND EXTRACT(YEAR FROM cf.date) = $${idx++}`;
          params.push(parseInt(year));
        }
        if (month) {
          sql += ` AND EXTRACT(MONTH FROM cf.date) = $${idx++}`;
          params.push(parseInt(month));
        }
      }

      sql += ' ORDER BY cf.date DESC, cf.created_at DESC';
      const rows = await query(sql, params);
      console.log('[SUCESSO][API:/api/financeiro/company] Resposta enviada', { count: rows.length });
      return res.json({ success: true, records: rows });
    }

    if (req.method === 'POST') {
      const { type, category, category_id, description, value, date, notes } = req.body;
      if (!type || !description || !value || !date) {
        return res.status(400).json({ success: false, error: 'type, description, value e date são obrigatórios' });
      }
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ success: false, error: 'type deve ser income ou expense' });
      }

      // Se category_id enviado, buscar nome para compatibilidade retroativa
      let catName = category || null;
      if (category_id) {
        const cat = await queryOne(`SELECT name FROM finance_categories WHERE id = $1 AND tenant_id = $2`, [category_id, tenantId]);
        if (cat) catName = cat.name;
      }

      const row = await queryOne(
        `INSERT INTO company_finances (tenant_id, type, category, category_id, description, value, date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [tenantId, type, catName, category_id || null, description, parseFloat(value), date, notes || null]
      );
      console.log('[SUCESSO][API:/api/financeiro/company] Registro criado', { recordId: row.id, type });
      return res.status(201).json({ success: true, record: row });
    }

    if (req.method === 'PUT') {
      const { id, type, category, category_id, description, value, date, notes } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

      // Se category_id enviado, buscar nome para compatibilidade retroativa
      let catName = category !== undefined ? category : null;
      if (category_id) {
        const cat = await queryOne(`SELECT name FROM finance_categories WHERE id = $1 AND tenant_id = $2`, [category_id, tenantId]);
        if (cat) catName = cat.name;
      }

      const row = await queryOne(
        `UPDATE company_finances SET
           type        = COALESCE($2, type),
           category    = COALESCE($3, category),
           category_id = COALESCE($4, category_id),
           description = COALESCE($5, description),
           value       = COALESCE($6, value),
           date        = COALESCE($7, date),
           notes       = COALESCE($8, notes),
           updated_at  = now()
         WHERE id = $1 AND tenant_id = $9 RETURNING *`,
        [id, type || null, catName, category_id !== undefined ? (category_id || null) : null,
         description || null, value ? parseFloat(value) : null, date || null,
         notes !== undefined ? notes : null, tenantId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
      console.log('[SUCESSO][API:/api/financeiro/company] Registro atualizado', { recordId: id });
      return res.json({ success: true, record: row });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });
      await query(`DELETE FROM company_finances WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      console.log('[SUCESSO][API:/api/financeiro/company] Registro removido', { id });
      return res.json({ success: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/financeiro/company] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
