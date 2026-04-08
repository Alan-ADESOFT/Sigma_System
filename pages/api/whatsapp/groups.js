const { resolveTenantId } = require('../../../infra/get-tenant-id');

// Cache em memória (5 minutos)
let _groupsCache = null;
let _groupsCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  await resolveTenantId(req); // auth check

  try {
    const now = Date.now();
    if (_groupsCache && (now - _groupsCacheAt) < CACHE_TTL) {
      return res.json({ success: true, groups: _groupsCache });
    }

    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;

    if (!instance || !token || !clientToken) {
      return res.status(500).json({ success: false, error: 'Z-API não configurada' });
    }

    const url = `https://api.z-api.io/instances/${instance}/token/${token}/groups?page=1&pageSize=100`;
    const response = await fetch(url, {
      headers: { 'Client-Token': clientToken },
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('[ERRO][API:/api/whatsapp/groups]', response.status, errBody);
      return res.status(502).json({ success: false, error: 'Falha ao buscar grupos da Z-API' });
    }

    const data = await response.json();
    const groups = (data || []).filter(g => g.isGroup === true).map(g => ({
      id: g.id,
      name: g.name || g.subject || 'Grupo sem nome',
      participants: g.participants?.length || 0,
    }));

    _groupsCache = groups;
    _groupsCacheAt = now;

    return res.json({ success: true, groups });
  } catch (err) {
    console.error('[ERRO][API:/api/whatsapp/groups]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
