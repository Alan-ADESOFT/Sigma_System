/**
 * @fileoverview Template — Planejamento de Conteudo
 *
 * Sprint Copy v2.1: wrapper fino que delega pro builder SIGMA.
 * O exportEnricher (Sonnet 4.6) ja decidiu a estrutura editorial — aqui
 * so empacotamos com a label correta.
 */

const { buildSigmaDocument } = require('./_shared');

function renderContentPlanning({ structured, client }) {
  return buildSigmaDocument({
    title: `${structured?.documentTitle || 'Planejamento'} — SIGMA`,
    documentTitle: structured?.documentTitle,
    documentSubtitle: structured?.documentSubtitle,
    sections: structured?.sections || [],
    clientName: client?.company_name || null,
    templateLabel: 'PLANEJAMENTO DE CONTEUDO',
  });
}

module.exports = { renderContentPlanning };
