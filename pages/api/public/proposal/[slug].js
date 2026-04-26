/**
 * pages/api/public/proposal/[slug].js
 *   GET (público — SEM auth) → retorna data da proposta para renderização.
 *
 * Importante:
 *   · Não expõe tenant_id, prospect_id ou ids internos.
 *   · Marca como expired automaticamente se passou da data.
 */

const proposals = require('../../../../models/comercial/proposal.model');
const { query } = require('../../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:public/proposal]', { slug: req.query?.slug });

  try {
    const { slug } = req.query;
    const row = await proposals.getProposalBySlug(slug);
    if (!row) {
      return res.status(404).json({ success: false, error: 'not_found' });
    }

    // Auto-expire
    if (row.expires_at && new Date(row.expires_at) < new Date()
        && row.status === 'published') {
      await query(
        `UPDATE comercial_proposals SET status = 'expired'
          WHERE id = $1 AND status = 'published'`,
        [row.id]
      );
      row.status = 'expired';
    }

    if (row.status === 'expired') {
      return res.status(410).json({ success: false, error: 'expired', expiresAt: row.expires_at });
    }
    if (row.status === 'draft') {
      return res.status(404).json({ success: false, error: 'not_found' });
    }

    // Sanitiza output — só campos públicos
    return res.json({
      success: true,
      proposal: {
        slug: row.slug,
        data: row.data || {},
        publishedAt: row.published_at,
        expiresAt: row.expires_at,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:public/proposal]', { error: err.message });
    return res.status(500).json({ success: false, error: 'internal' });
  }
}
