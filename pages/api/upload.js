import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log('[INFO][API:/api/upload] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    // Parse multipart form data manualmente
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Extrair boundary do content-type
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'Content-Type invalido' });
    }

    const boundary = boundaryMatch[1];
    const parts = buffer.toString('binary').split(`--${boundary}`);

    let fileBuffer = null;
    let filename = 'upload.tmp';

    for (const part of parts) {
      if (part.includes('Content-Disposition') && part.includes('filename=')) {
        const filenameMatch = part.match(/filename="(.+?)"/);
        if (filenameMatch) filename = filenameMatch[1];

        // Separar headers do body (double CRLF)
        const headerEndIndex = part.indexOf('\r\n\r\n');
        if (headerEndIndex !== -1) {
          const bodyStr = part.substring(headerEndIndex + 4);
          // Remover trailing \r\n
          const cleanBody = bodyStr.replace(/\r\n$/, '');
          fileBuffer = Buffer.from(cleanBody, 'binary');
        }
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({ error: 'Nenhum arquivo encontrado' });
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = filename.split('.').pop() || 'tmp';
    const newFilename = `${uniqueSuffix}.${extension}`;

    const uploadDir = join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true }).catch(() => {});

    const filepath = join(uploadDir, newFilename);
    await writeFile(filepath, fileBuffer);

    // URL absoluta necessaria para a Meta API baixar a midia
    const baseUrl = (process.env.TUNNEL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const publicUrl = `${baseUrl}/uploads/${newFilename}`;
    console.log('[SUCESSO][API:/api/upload] Upload realizado', { filename: newFilename, publicUrl });
    return res.json({ url: publicUrl, localPath: `/uploads/${newFilename}`, success: true });
  } catch (error) {
    console.error('[ERRO][API:/api/upload] Erro no endpoint', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Erro interno ao salvar arquivo.' });
  }
}
