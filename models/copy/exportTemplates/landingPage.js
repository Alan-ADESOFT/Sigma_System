/**
 * @fileoverview Template — Landing Page
 *
 * Sprint Copy v2.1: o template virou um wrapper FINO.
 * Toda a inteligencia editorial (decidir o que e hero/section/callout/cta)
 * mora no exportEnricher.js (Sonnet 4.6). Aqui apenas:
 *   1. Recebe o JSON estruturado ja enriquecido
 *   2. Passa pro builder SIGMA com label "LANDING PAGE"
 *
 * Identidade SIGMA fixa — nao usa brandbook do cliente (feedback do user).
 */

const { buildSigmaDocument } = require('./_shared');

function renderLandingPage({ structured, client }) {
  return buildSigmaDocument({
    title: `${structured?.documentTitle || 'Landing'} — SIGMA`,
    documentTitle: structured?.documentTitle,
    documentSubtitle: structured?.documentSubtitle,
    sections: structured?.sections || [],
    clientName: client?.company_name || null,
    templateLabel: 'LANDING PAGE · DOCUMENTO DE COPY',
  });
}

module.exports = { renderLandingPage };
