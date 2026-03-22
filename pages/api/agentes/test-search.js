/**
 * @fileoverview Endpoint de teste para deepSearch
 * @route GET /api/agentes/test-search
 * Chama deepSearch com query simples e retorna resultado bruto para diagnostico.
 * Protegido por INTERNAL_API_TOKEN.
 */

import { deepSearch } from '../../../models/ia/deepSearch';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  // Protecao por token interno
  const token = req.headers['x-internal-token'] || req.query.token;
  if (!process.env.INTERNAL_API_TOKEN || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token invalido' });
  }

  const query = req.query.q || 'marketing digital 2025 tendencias';

  try {
    console.log('[INFO][API:test-search] Iniciando teste de deepSearch', { query });
    const result = await deepSearch(query, 'Responda de forma concisa e objetiva em portugues.');
    console.log('[SUCESSO][API:test-search] Teste concluido', { textLength: result.text.length, citationsCount: result.citations.length });

    return res.json({
      success: true,
      provider: process.env.AI_SEARCH_PROVIDER || 'openai',
      query,
      data: {
        text: result.text,
        textLength: result.text.length,
        citations: result.citations,
        citationsCount: result.citations.length,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:test-search] Falha no teste', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
