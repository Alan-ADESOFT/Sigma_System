/**
 * @fileoverview Endpoint: Salvar versão de etapa (snapshot ao concluir)
 * @route POST /api/clients/[id]/stages/save-version
 *
 * Cria um snapshot do conteúdo da etapa na tabela stage_versions.
 * Chamado quando o operador clica "Marcar Concluído" ou pelo pipeline.
 *
 * Body: { stageKey: string, content: string, createdBy?: 'user'|'pipeline' }
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
import { queryOne }        from '../../../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const clientId = req.query.id;
  const { stageKey, content, createdBy = 'user' } = req.body;

  if (!clientId || !stageKey || !content) {
    return res.status(400).json({ success: false, error: 'clientId, stageKey e content são obrigatórios' });
  }

  try {
    // Busca versão mais recente para incrementar
    const latest = await queryOne(
      `SELECT version FROM stage_versions
       WHERE client_id = $1 AND stage_key = $2
       ORDER BY version DESC LIMIT 1`,
      [clientId, stageKey]
    );
    const nextVersion = (latest?.version || 0) + 1;

    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    const row = await queryOne(
      `INSERT INTO stage_versions (client_id, stage_key, version, content, word_count, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, version`,
      [clientId, stageKey, nextVersion, content, wordCount, createdBy]
    );

    console.log('[SUCESSO][SaveVersion] Versão salva', { clientId, stageKey, version: nextVersion, createdBy });
    return res.json({ success: true, data: { id: row.id, version: row.version } });
  } catch (err) {
    console.error('[ERRO][SaveVersion]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
