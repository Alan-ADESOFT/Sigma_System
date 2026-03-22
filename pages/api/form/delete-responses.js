/**
 * pages/api/form/delete-responses.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Apaga respostas do formulário — rota protegida (requer sessão).
 * Pode apagar seções específicas ou todas as respostas.
 *
 * DELETE — Body: { clientId, sections?: number[] }
 *   sections omitido = apaga tudo
 *   sections = [1, 3] = apaga só etapas 1 e 3
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    await resolveTenantId(req);

    const { clientId, sections } = req.body;

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
    }

    console.log('[INFO][API:delete-responses] Deletando respostas', { clientId, sections });

    // Busca a response mais recente do cliente
    const response = await queryOne(
      `SELECT r.* FROM client_form_responses r
       JOIN client_form_tokens t ON t.id = r.token_id
       WHERE t.client_id = $1
       ORDER BY r.created_at DESC LIMIT 1`,
      [clientId]
    );

    if (!response) {
      return res.status(404).json({ success: false, error: 'Nenhuma resposta encontrada' });
    }

    if (!sections || sections.length === 0) {
      // Apaga TUDO — respostas, resumo IA, tokens e reseta form_done
      await query(`DELETE FROM client_form_responses WHERE token_id IN (SELECT id FROM client_form_tokens WHERE client_id = $1)`, [clientId]);
      await query(`DELETE FROM client_form_summaries WHERE client_id = $1`, [clientId]);
      await query(`DELETE FROM client_form_tokens WHERE client_id = $1`, [clientId]);
      await query(`UPDATE marketing_clients SET form_done = false, updated_at = now() WHERE id = $1`, [clientId]);

      console.log('[SUCESSO][API:delete-responses] Tudo limpo — respostas, resumo, tokens, form_done', { clientId });
      return res.json({ success: true, message: 'Todas as respostas foram apagadas.' });
    }

    // Apaga seções específicas
    const data = response.data || {};
    const keysToRemove = Object.keys(data).filter(key => {
      const stepNum = parseInt(key.split('.')[0], 10);
      return sections.includes(stepNum);
    });

    keysToRemove.forEach(key => delete data[key]);

    await query(
      `UPDATE client_form_responses SET data = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(data), response.id]
    );

    console.log('[SUCESSO][API:delete-responses] Seções apagadas', { clientId, sections, removedKeys: keysToRemove.length });
    return res.json({
      success: true,
      message: `${keysToRemove.length} respostas das etapas ${sections.join(', ')} foram apagadas.`,
    });
  } catch (err) {
    console.error('[ERRO][API:delete-responses]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
