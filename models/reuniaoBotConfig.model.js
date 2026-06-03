/**
 * models/reuniaoBotConfig.model.js
 * Configuração do comando /reuniao no WhatsApp (allowlist de segurança).
 * Armazenado via settings (key/value) por tenant.
 *
 *   reuniao_webhook_enabled  → 'true' | 'false'
 *   reuniao_allowed_groups   → JSON array de IDs de grupo (Z-API)
 *   reuniao_allowed_numbers  → JSON array de números (E.164 sem +)
 */

const { getSetting, setSetting } = require('./settings.model');

const KEYS = {
  enabled:         'reuniao_webhook_enabled',
  allowedGroups:   'reuniao_allowed_groups',
  allowedNumbers:  'reuniao_allowed_numbers',
  reminderEnabled: 'reuniao_reminder_enabled',
};

async function getReuniaoConfig(tenantId) {
  const [enabled, groups, numbers, reminderEnabled] = await Promise.all([
    getSetting(tenantId, KEYS.enabled),
    getSetting(tenantId, KEYS.allowedGroups),
    getSetting(tenantId, KEYS.allowedNumbers),
    getSetting(tenantId, KEYS.reminderEnabled),
  ]);
  return {
    enabled: enabled === 'true',
    allowedGroups: groups ? JSON.parse(groups) : [],
    allowedNumbers: numbers ? JSON.parse(numbers) : [],
    // Lembrete de reunião 1h antes (manda pros números/grupos acima). Off por padrão.
    reminderEnabled: reminderEnabled === 'true',
  };
}

async function saveReuniaoConfig(tenantId, cfg) {
  const ops = [];
  if (cfg.enabled !== undefined) ops.push(setSetting(tenantId, KEYS.enabled, String(cfg.enabled)));
  if (cfg.allowedGroups !== undefined) ops.push(setSetting(tenantId, KEYS.allowedGroups, JSON.stringify(cfg.allowedGroups)));
  if (cfg.allowedNumbers !== undefined) ops.push(setSetting(tenantId, KEYS.allowedNumbers, JSON.stringify(cfg.allowedNumbers)));
  if (cfg.reminderEnabled !== undefined) ops.push(setSetting(tenantId, KEYS.reminderEnabled, String(cfg.reminderEnabled)));
  await Promise.all(ops);
}

module.exports = { getReuniaoConfig, saveReuniaoConfig };
