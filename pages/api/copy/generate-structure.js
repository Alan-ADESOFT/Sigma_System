/**
 * @fileoverview Endpoint: Gerar estrutura de copy via IA
 * @route POST /api/copy/generate-structure
 *
 * Body: {
 *   description: string,
 *   images?: Array<{ base64, mimeType }>,
 *   files?: Array<{ base64, mimeType, fileName }>
 * }
 *
 * Retorna: { success: true, data: { name, description, prompt_base, questions } }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { resolveModel } from '../../../models/ia/completion';
import { buildStructureGeneratorSystem } from '../../../models/copy/structurePrompt';
import { extractFromFile } from '../../../infra/api/fileReader';

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  await resolveTenantId(req);
  const { description, images, files } = req.body;

  if (!description?.trim()) {
    return res.status(400).json({ success: false, error: 'description obrigatoria' });
  }

  try {
    console.log('[INFO][API:copy/generate-structure] Gerando estrutura via IA');

    // Processa arquivos
    let filesContent = '';
    if (files?.length) {
      const fileTexts = [];
      for (const file of files) {
        const base64Data = file.base64.split(',')[1] || file.base64;
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await extractFromFile(buffer, file.mimeType, file.fileName);
        if (result.success && result.text) {
          fileTexts.push(`[${file.fileName}]\n${result.text.substring(0, 3000)}`);
        }
      }
      if (fileTexts.length) filesContent = fileTexts.join('\n---\n');
    }

    // Processa imagens
    let imagesDescription = '';
    if (images?.length) {
      const { analyzeMultipleImages } = require('../../../infra/api/vision');
      const imageUrls = images.map(img => img.base64);
      const visionResult = await analyzeMultipleImages(
        imageUrls,
        'Descreva as imagens — sao referencia para criar uma estrutura de copy.',
        { detail: 'high' }
      );
      if (visionResult.analysis) imagesDescription = visionResult.analysis;
    }

    // Monta prompt
    const systemPrompt = buildStructureGeneratorSystem({ filesContent, imagesDescription });

    // Chama IA (usa modelo forte para qualidade do prompt gerado)
    const model = resolveModel('medium');
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY nao configurada');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 4000,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: description.trim() },
        ],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || r.statusText);
    }

    const d = await r.json();
    let content = d.choices?.[0]?.message?.content || '';

    // Limpa possivel markdown (```json ... ```)
    content = content.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Parse JSON
    let structure;
    try {
      structure = JSON.parse(content);
    } catch {
      console.error('[ERRO][API:copy/generate-structure] JSON invalido', { content: content.substring(0, 200) });
      throw new Error('A IA retornou um formato invalido. Tente novamente com uma descricao mais clara.');
    }

    // Valida campos minimos
    if (!structure.name || !structure.prompt_base) {
      throw new Error('Estrutura gerada esta incompleta. Tente novamente.');
    }

    // Garante IDs unicos nas perguntas
    if (structure.questions?.length) {
      structure.questions = structure.questions.map((q, i) => ({
        id: q.id || ('q' + (i + 1)),
        label: q.label || '',
        placeholder: q.placeholder || '',
        required: !!q.required,
      }));
    }

    console.log('[SUCESSO][API:copy/generate-structure] Estrutura gerada', {
      name: structure.name,
      questionsCount: (structure.questions || []).length,
    });

    return res.json({ success: true, data: structure });

  } catch (err) {
    console.error('[ERRO][API:copy/generate-structure]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
