/**
 * models/comercial/sigmaScore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reuso do score "atacabilidade" para fontes que não passam pelo wrapper Apify
 * (CSV, criação manual). Mantém a fórmula em um único lugar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Score 0-100 indicando quão "atacável" é o lead pela Sigma.
 * Fórmula:
 *   + (rating < 4.5 && review_count > 10) → 25  (tem reviews ruins)
 *   + (!has_website)                       → 30 (sem site)
 *   + (review_count >= 50) → 15 | (>=20) → 10
 *   + (rating >= 4.0) → 15 (não é uma porcaria)
 *   + (phone) → 15 (dá pra ligar)
 */
function calculateSigmaScore(lead) {
  if (!lead) return 0;
  let score = 0;

  const rating  = Number(lead.google_rating || 0);
  const reviews = Number(lead.review_count  || 0);
  const hasSite = !!lead.has_website || !!(lead.website && String(lead.website).trim());
  const hasPhone = !!lead.phone;

  if (rating > 0 && rating < 4.5 && reviews > 10) score += 25;
  if (!hasSite) score += 30;
  if (reviews >= 50) score += 15;
  else if (reviews >= 20) score += 10;
  if (rating >= 4.0) score += 15;
  if (hasPhone) score += 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { calculateSigmaScore };
