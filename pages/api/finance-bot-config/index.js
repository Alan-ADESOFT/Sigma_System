/**
 * pages/api/finance-bot-config/index.js
 * Configuração do bot de cobrança financeira (admin only)
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const { getBotConfig, saveBotConfig, getDefaultMessages } = require('../../../models/financeBotConfig.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const config = await getBotConfig(tenantId);
      const defaults = getDefaultMessages();
      return res.json({ success: true, config, defaults });
    }

    if (req.method === 'POST') {
      await saveBotConfig(tenantId, req.body);
      const config = await getBotConfig(tenantId);
      return res.json({ success: true, config });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:finance-bot-config]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
