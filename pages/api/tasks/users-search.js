const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { query } = require('../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const tenantId = await resolveTenantId(req);
  const { q } = req.query;

  try {
    let users;
    if (q && q.length >= 1) {
      const pattern = `%${q}%`;
      users = await query(
        `SELECT id, name, username, avatar_url
         FROM tenants
         WHERE id IN (
           SELECT id FROM tenants WHERE id = $1
           UNION
           SELECT id FROM tenants WHERE id != $1
         )
         AND is_active = true
         AND (name ILIKE $2 OR username ILIKE $2 OR email ILIKE $2)
         ORDER BY name ASC
         LIMIT 20`,
        [tenantId, pattern]
      );
    } else {
      users = await query(
        `SELECT id, name, username, avatar_url
         FROM tenants
         WHERE is_active = true
         ORDER BY name ASC
         LIMIT 20`,
        []
      );
    }

    return res.json({ success: true, users });
  } catch (err) {
    console.error('[ERRO][API:/api/tasks/users-search]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
