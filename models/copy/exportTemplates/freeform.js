/**
 * @fileoverview Template — Copy Avulso (freeform editorial)
 *
 * Sprint Copy v2.1: wrapper fino. Identidade SIGMA fixa.
 */

const { buildSigmaDocument } = require('./_shared');

function renderFreeform({ structured, client }) {
  return buildSigmaDocument({
    title: `${structured?.documentTitle || 'Copy'} — SIGMA`,
    documentTitle: structured?.documentTitle,
    documentSubtitle: structured?.documentSubtitle,
    sections: structured?.sections || [],
    clientName: client?.company_name || null,
    templateLabel: 'COPY EDITORIAL',
  });
}

module.exports = { renderFreeform };
