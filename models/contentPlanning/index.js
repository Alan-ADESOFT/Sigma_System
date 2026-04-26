/**
 * models/contentPlanning/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-export central do módulo de Planejamento de Conteúdo.
 *
 * Uso:
 *   const cp = require('models/contentPlanning');
 *   await cp.plan.listPlans(tenantId, { clientId });
 *   await cp.creative.createCreative(tenantId, planId, fields);
 * ─────────────────────────────────────────────────────────────────────────────
 */

module.exports = {
  status:     require('./status'),
  plan:       require('./plan'),
  creative:   require('./creative'),
  shareToken: require('./shareToken'),
  version:    require('./version'),
  activity:   require('./activity'),
};
