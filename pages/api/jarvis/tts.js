/**
 * @fileoverview POST /api/jarvis/tts
 * Sintetiza texto em voz via ElevenLabs. Retorna { audioBase64, mime }.
 * Se o usuário não habilitou voz ou não configurou a API key, retorna
 * { disabled: true } silenciosamente — o frontend simplesmente não toca.
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { verifyToken } from '../../../lib/auth';
import { getJarvisConfig } from '../../../models/jarvis/config';

const { logUsage } = require('../../../models/copy/tokenUsage');

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });

  const session = verifyToken(req.cookies?.sigma_token);
  if (!session) return res.status(401).json({ success: false, error: 'Não autenticado.' });

  try {
    const tenantId = await resolveTenantId(req);
    const cfg = await getJarvisConfig(tenantId);

    if (cfg.jarvis_voice_enabled !== 'true' || !cfg.jarvis_elevenlabs_key) {
      return res.json({ success: true, disabled: true });
    }

    const { text, voiceId } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'text obrigatório' });
    }

    const finalVoice = voiceId || cfg.jarvis_voice_id || '21m00Tcm4TlvDq8ikWAM';
    const cleaned = String(text).slice(0, 1500); // limite de payload da ElevenLabs

    const r = await fetch(`${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(finalVoice)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': cfg.jarvis_elevenlabs_key,
        'content-type': 'application/json',
        'accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: cleaned,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => '');
      console.error('[ERRO][API:/api/jarvis/tts] ElevenLabs', { status: r.status, err });
      return res.status(502).json({ success: false, error: 'Falha na síntese de voz.' });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const audioBase64 = buf.toString('base64');

    console.log('[SUCESSO][Jarvis:TTS] Síntese concluída', {
      model: 'eleven_multilingual_v2',
      charCount: cleaned.length,
      audioSizeBytes: buf.length,
    });

    // Registra uso do TTS no relatório de tokens (caracteres como proxy de tokens)
    logUsage({
      tenantId, modelUsed: 'eleven_multilingual_v2', provider: 'elevenlabs',
      operationType: 'jarvis_tts',
      tokensInput: cleaned.length, tokensOutput: 0,
      metadata: { charCount: cleaned.length, audioSizeBytes: buf.length },
    });

    return res.json({ success: true, audioBase64, mime: 'audio/mpeg' });
  } catch (err) {
    console.error('[ERRO][API:/api/jarvis/tts]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Erro interno na síntese.' });
  }
}
