/**
 * @fileoverview Endpoint: Gerar copy com IA (síncrono)
 * @route POST /api/copy/generate
 *
 * Wrapper fino sobre runGenerateCopy. Para fluxo async (não-bloqueante)
 * use POST /api/copy/jobs com kind='generate' e faça polling em
 * GET /api/copy/jobs/[id].
 *
 * Body: {
 *   sessionId: string,
 *   contentId: string,
 *   clientId?: string,
 *   structureId?: string,
 *   modelOverride?: string,
 *   promptRaiz: string,
 *   tone?: string,
 *   images?: Array<{ base64, mimeType }>,
 *   files?: Array<{ base64, mimeType, fileName }>
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { runGenerateCopy } from '../../../models/copy/copyJobRunner';

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { sessionId, clientId, structureId, modelOverride, promptRaiz, tone, images, files } = req.body;

  try {
    const result = await runGenerateCopy({
      tenantId, sessionId, clientId, structureId,
      modelOverride, promptRaiz, tone, images, files,
    });
    return res.json({
      success: true,
      data: { text: result.text, historyId: result.historyId },
      usage: result.usage,
    });
  } catch (err) {
    console.error('[ERRO][API:copy/generate]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
