/**
 * @fileoverview Endpoint: Modificar/melhorar copy existente (síncrono)
 * @route POST /api/copy/improve
 *
 * Wrapper fino sobre runImproveCopy. Para fluxo async (não-bloqueante)
 * use POST /api/copy/jobs com kind='improve' e faça polling em
 * GET /api/copy/jobs/[id].
 *
 * Body: {
 *   sessionId: string,
 *   currentOutput: string,
 *   instruction: string,
 *   clientId?: string,
 *   modelOverride?: string,
 *   tone?: string,
 *   images?: Array<{ base64, mimeType }>,
 *   files?: Array<{ base64, mimeType, fileName }>
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { runImproveCopy } from '../../../models/copy/copyJobRunner';

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { sessionId, currentOutput, instruction, clientId, modelOverride, tone, images, files } = req.body;

  try {
    const result = await runImproveCopy({
      tenantId, sessionId, currentOutput, instruction, clientId,
      modelOverride, tone, images, files,
    });
    return res.json({
      success: true,
      data: { text: result.text, historyId: result.historyId },
      usage: result.usage,
    });
  } catch (err) {
    console.error('[ERRO][API:copy/improve]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
