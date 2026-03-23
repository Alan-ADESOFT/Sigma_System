/**
 * @fileoverview Endpoint: Transcrever audio via OpenAI Whisper
 * @route POST /api/copy/transcribe
 *
 * Body: { audio: string (base64), mimeType: string }
 * Retorna: { success: true, text: string }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';

export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  await resolveTenantId(req); // valida autenticacao

  const { audio, mimeType } = req.body;
  if (!audio) {
    return res.status(400).json({ success: false, error: 'audio obrigatorio (base64)' });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(500).json({ success: false, error: 'OPENAI_API_KEY nao configurada' });
  }

  try {
    console.log('[INFO][API:copy/transcribe] Transcrevendo audio');

    const base64Data = audio.includes(',') ? audio.split(',')[1] : audio;
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = (mimeType || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';

    // Monta multipart/form-data manualmente
    const boundary = '----WhisperBoundary' + Date.now();
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
        `Content-Type: ${mimeType || 'audio/webm'}\r\n\r\n`
      ),
      buffer,
      Buffer.from(
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper-1\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `pt\r\n` +
        `--${boundary}--\r\n`
      ),
    ]);

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || r.statusText);
    }

    const d = await r.json();
    console.log('[SUCESSO][API:copy/transcribe] Audio transcrito', { length: (d.text || '').length });

    return res.json({ success: true, text: d.text || '' });
  } catch (err) {
    console.error('[ERRO][API:copy/transcribe]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
