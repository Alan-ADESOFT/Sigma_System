/**
 * @fileoverview Endpoint: Versões de etapa (snapshots manuais)
 * @route GET /api/clients/[id]/kb-versions?stageKey=xxx
 *
 * Versões são criadas quando o operador clica "Marcar Concluído"
 * ou quando o pipeline automático finaliza uma etapa.
 * Diferente do Histórico (log de execuções da IA), as versões
 * representam o conteúdo aprovado pelo operador.
 *
 * @route GET ?stageKey=xxx           → lista todas as versões
 * @route GET ?stageKey=xxx&version=N → retorna texto completo de uma versão
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { query, queryOne } from '../../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const clientId = req.query.id;
  const { stageKey, version } = req.query;

  if (!clientId || !stageKey) {
    return res.status(400).json({ success: false, error: 'clientId e stageKey são obrigatórios' });
  }

  try {
    // Versão específica — retorna texto completo
    if (version) {
      const row = await queryOne(
        `SELECT id, version, content, word_count, created_by, created_at
         FROM stage_versions
         WHERE client_id = $1 AND stage_key = $2 AND version = $3
         LIMIT 1`,
        [clientId, stageKey, parseInt(version)]
      );

      if (!row) {
        return res.status(404).json({ success: false, error: 'Versão não encontrada' });
      }

      return res.json({
        success: true,
        data: {
          id: row.id,
          text: row.content,
          version: row.version,
          wordCount: row.word_count,
          createdBy: row.created_by,
          generatedAt: row.created_at,
        },
      });
    }

    // Lista todas as versões (sem texto completo — só metadados + preview)
    const rows = await query(
      `SELECT id, version, content, word_count, created_by, created_at
       FROM stage_versions
       WHERE client_id = $1 AND stage_key = $2
       ORDER BY version DESC`,
      [clientId, stageKey]
    );

    const versions = rows.map(row => ({
      id: row.id,
      version: row.version,
      wordCount: row.word_count,
      createdBy: row.created_by,
      generatedAt: row.created_at,
      preview: (row.content || '').substring(0, 200) + ((row.content || '').length > 200 ? '...' : ''),
    }));

    return res.json({ success: true, data: versions });
  } catch (err) {
    console.error('[ERRO][API:kb-versions]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
