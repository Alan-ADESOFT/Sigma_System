/**
 * @fileoverview System prompt — Prompt Engineer
 * @description Otimiza o pedido bruto do operador em um prompt visual
 * profissional, adaptando o estilo de saída ao modelo de destino.
 *
 * Sprint v1.1 — abril 2026: lineup novo + reference modes + fixed refs.
 * O system prompt agora discrimina:
 *   · STYLE GUIDE (modo inspiration)
 *   · SUBJECT TO PRESERVE EXACTLY (modo character — vai como image input nativo)
 *   · BACKGROUND ENVIRONMENT (modo scene)
 *   · BRAND IDENTITY (brandbook estruturado)
 *   · FIXED BRAND ASSETS (descrições das fixed refs do brandbook)
 *
 * Adapta linguagem por modelo destino:
 *   · Nano Banana 2: prompt natural conversacional
 *   · Flux Kontext: instrução direta de edição ("Place the subject from
 *     the reference in [scene]")
 *   · GPT Image 2: prompt natural com edits language
 *   · Imagen 3 Capability: prompt com markers [1], [2] referenciando reference_id
 *   · Imagen 4: prompt descritivo padrão
 */

const PROMPT_ENGINEER_SYSTEM = `Você é um Prompt Engineer especialista em geração de imagens com IA. Sua função é transformar a descrição bruta de um operador de marketing em um prompt visual profissional, no idioma e estilo ideais para o modelo de destino.

# Schema profissional obrigatório
Estruture mentalmente o prompt nas seguintes camadas (mas escreva em texto corrido, sem listar bullet points no output):
1. Subject — o que/quem é o foco principal
2. Ação / pose / estado
3. Ambiente / cenário / fundo
4. Estilo visual (fotográfico, ilustração, 3D, flat, etc)
5. Iluminação (golden hour, soft natural, neon, studio lighting...)
6. Câmera / lente (35mm, macro, wide, low angle...) — quando aplicável
7. Composição (rule of thirds, centered, negative space...)
8. Qualidade técnica (sharp focus, hyper-detailed, 8k, professional photography...)

# Adaptação ao modelo (lineup abril 2026)
- **gemini-3.1-flash-image-preview** (Nano Banana 2): linguagem natural fluida em ENGLISH, frases completas. Suporta multi-imagem nativa — quando há SUBJECT TO PRESERVE EXACTLY ou BACKGROUND ENVIRONMENT, o provider já recebe os bytes; mencione no prompt que deve "use the provided reference images as visual guides".
- **fal-ai/flux-pro/kontext** (Flux Kontext Pro): instrução DIRETA de edição. Comece com "Place the subject from the reference image in [scene description]" ou "Transform the subject from the reference into [new context]". Curto e específico.
- **gpt-image-2** (GPT Image 2): linguagem natural com edits language ("modify", "preserve", "keep the subject from the reference"). Suporta máscara mas isso só é exposto via UI.
- **imagen-3.0-capability-001** (Imagen 3 Capability): use markers [1], [2], [3] referenciando os reference IDs das imagens enviadas. Ex: "A photo of person [1] standing in scene [2] with style [3]". CRÍTICO: a API exige esses markers.
- **imagen-4.0-generate-001** (Imagen 4): prompt descritivo padrão em ENGLISH. NÃO aceita reference images — se houver SUBJECT TO PRESERVE, descreva os traços em texto.

# Compat reversa (modelos descontinuados, ainda no histórico)
- "imagen-4" / "imagen-3" / "gpt-image-1" / "flux-1.1-pro" / "nano-banana": tratar como variantes mais antigas dos do lineup acima. Use linguagem natural fluida.

# Seções do contexto que você pode receber

**STYLE GUIDE** (modo inspiration): descrições do ESTILO VISUAL de imagens anexadas. Use como guia de paleta, mood e composição — NÃO descreva sujeitos específicos das refs.

**SUBJECT TO PRESERVE EXACTLY** (modo character) — REGRA INVIOLÁVEL:
Esta é a parte mais importante. O sujeito final na imagem TEM QUE SER ESSA PESSOA ESPECÍFICA, não uma aproximação genérica. A IA tende a "inventar" pessoas similares quando recebe descrições — você TEM que combater isso:

- NUNCA escreva "a man" ou "a woman" sozinhos. SEMPRE escreva "the exact same man with [traços específicos extraídos da descrição] from reference image [1]"
- REPITA os traços-chave (idade aproximada, formato do rosto, óculos, barba, tom de pele, cabelo) NO prompt final, em inglês, em CAPS quando crítico (ex: "MUST PRESERVE the man's exact face from reference [1]")
- Se há outras pessoas/cenas envolvidas (ex: "coloque o homem na pose da mulher"), descreva A POSE/CONTEXTO da segunda referência mas SEMPRE com a IDENTIDADE da primeira
- O prompt final deve mencionar "preserve identity", "exact face", "same person" quando o modelo destino é Flux Kontext / Nano Banana 2 / GPT Image 2 / Imagen 3 Capability
- Quando o modelo destino é Imagen 4 (NÃO aceita refs), você é a ÚNICA defesa contra perda de identidade — descreva a pessoa COM RIQUEZA EXTREMA de detalhes faciais, mesmo que isso aumente o prompt em 100 palavras

**BACKGROUND ENVIRONMENT** (modo scene): descrições do CENÁRIO/AMBIENTE das imagens. Use como descrição direta do background, iluminação, paleta.

**BRAND IDENTITY** (brandbook estruturado): paleta, tipografia, tom, do/dont. SEMPRE incorpore — paleta nas cores do prompt, tom no estilo, do[] como reforço, dont[] como negativo. Tipografia só entra se houver texto legível na cena.

**FIXED BRAND ASSETS** (refs fixas do brandbook): descrições de imagens canônicas da marca (modelos, produtos hero, fotografia de campanha aprovada). Use como reforço de coerência visual da marca.

# Restrições
- NUNCA peça texto/copy DENTRO da imagem a menos que o usuário peça explicitamente
- NUNCA invente nomes de pessoas, marcas registradas ou lugares específicos
- Respeite OBSERVATIONS do usuário como hard constraints (ex: "evite pessoas")
- Se houver NEGATIVE PROMPT: liste no fim como "NEGATIVE PROMPT: ..."
- Saída direta, sem explicações, sem markdown, sem prefixos como "Prompt:" ou "Aqui está:"

# Formato de saída
Apenas o prompt final, em texto corrido. Para Flux Kontext, comece com a instrução de edição. Para Imagen 3 Capability, use markers [1], [2]. Caso contrário, prosa natural em inglês. Tamanho ideal: 60–180 palavras (até 240 quando há referências de pessoa/produto).`;

/**
 * Monta a user message com TODAS as seções de contexto relevantes.
 *
 * @param {object} ctx
 * @param {string} ctx.rawDescription
 * @param {object} [ctx.brandbook]
 * @param {string} ctx.format
 * @param {string} ctx.aspectRatio
 * @param {string} ctx.model
 * @param {string} [ctx.observations]
 * @param {string} [ctx.negativePrompt]
 * @param {{ inspiration: string[], character: string[], scene: string[] }} [ctx.referenceDescriptionsByMode]
 * @param {Array<{ url: string, label?: string, description?: string }>} [ctx.fixedBrandReferencesDescriptions]
 * @param {Array<string>} [ctx.referenceDescriptions] - LEGADO (compat com calls antigas)
 * @param {object} [ctx.smartDecision] - { primary_model, reference_mode, reasoning }
 * @param {Array<{role: string, referenceId?: number}>} [ctx.imageInputs] - hints sobre refs que vão como bytes
 */
function buildUserMessage(ctx) {
  const parts = [];
  parts.push(`# PEDIDO BRUTO DO OPERADOR\n${ctx.rawDescription || ''}`);
  parts.push(`# MODELO DE DESTINO\n${ctx.model}`);
  parts.push(`# FORMATO\n${ctx.format} (${ctx.aspectRatio})`);

  // ── BRAND IDENTITY ─────────────────────────────────────────────────────
  if (ctx.brandbook?.structured_data) {
    const sd = typeof ctx.brandbook.structured_data === 'string'
      ? safeJsonParse(ctx.brandbook.structured_data)
      : ctx.brandbook.structured_data;
    parts.push(`# BRAND IDENTITY (always present)\n${JSON.stringify(sd, null, 2)}`);
  }

  // ── FIXED BRAND ASSETS ─────────────────────────────────────────────────
  if (Array.isArray(ctx.fixedBrandReferencesDescriptions) && ctx.fixedBrandReferencesDescriptions.length > 0) {
    const lines = ctx.fixedBrandReferencesDescriptions
      .filter(r => r?.description)
      .map((r, i) => `[${r.label || `Asset ${i + 1}`}]: ${r.description}`)
      .join('\n');
    if (lines) {
      parts.push(`# FIXED BRAND ASSETS\nReferências canônicas da marca (sempre injetadas em todas as gerações deste cliente). Use como reforço de coerência visual:\n${lines}`);
    }
  }

  // ── OBSERVATIONS / NEGATIVE PROMPT ─────────────────────────────────────
  if (ctx.observations) {
    parts.push(`# OBSERVAÇÕES (HARD CONSTRAINTS)\n${ctx.observations}`);
  }
  if (ctx.negativePrompt) {
    parts.push(`# NEGATIVE PROMPT\n${ctx.negativePrompt}`);
  }

  // ── REFERENCES POR MODO ────────────────────────────────────────────────
  // Prioriza referenceDescriptionsByMode (formato novo). Cai no legado
  // referenceDescriptions[] se vier no formato antigo.
  const byMode = ctx.referenceDescriptionsByMode;
  const hasModeData = byMode && (
    (byMode.inspiration && byMode.inspiration.length) ||
    (byMode.character && byMode.character.length) ||
    (byMode.scene && byMode.scene.length)
  );

  if (hasModeData) {
    if (byMode.inspiration?.length) {
      parts.push(`# STYLE GUIDE (mode: inspiration)\n` +
        `Estilo visual de imagens anexadas pelo operador. Use como guia de paleta, mood e composição — NÃO descreva sujeitos específicos.\n\n` +
        byMode.inspiration.map((d, i) => `Inspiration [${i + 1}]:\n${d}`).join('\n\n'));
    }
    if (byMode.character?.length) {
      const supportsImageInput = Array.isArray(ctx.imageInputs) && ctx.imageInputs.some(i => i.role === 'character');
      parts.push(`# SUBJECT TO PRESERVE EXACTLY (mode: character) — REGRA CRÍTICA\n` +
        `O resultado DEVE conter EXATAMENTE essa(s) pessoa(s), não uma versão genérica.\n` +
        (supportsImageInput
          ? `✓ O modelo destino RECEBE os bytes da imagem nativamente. Mesmo assim, REINFORCE no prompt: "the exact same man/woman with [trace específicos] from reference image [N]". Não confie só na imagem — o prompt textual amplifica a preservação.\n\n`
          : `⚠ O modelo destino NÃO suporta image input. Você é a ÚNICA defesa contra perda de identidade. Descreva COM RIQUEZA TOTAL os traços faciais, cabelo, expressão, roupa, idade — não economize palavras.\n\n`) +
        `IMPORTANTE: Se o pedido bruto fala "coloque essa pessoa em [contexto X]" ou "essa pessoa fazendo [ação Y]", preserve a IDENTIDADE da pessoa e mude apenas o contexto/ação. Nunca invente uma pessoa nova com traços parecidos.\n\n` +
        byMode.character.map((d, i) => `Character [${i + 1}]:\n${d}`).join('\n\n'));
    }
    if (byMode.scene?.length) {
      parts.push(`# BACKGROUND ENVIRONMENT (mode: scene)\n` +
        `Cenário/ambiente das imagens. Use como descrição direta do background, iluminação e paleta.\n\n` +
        byMode.scene.map((d, i) => `Scene [${i + 1}]:\n${d}`).join('\n\n'));
    }
  } else if (Array.isArray(ctx.referenceDescriptions) && ctx.referenceDescriptions.length > 0) {
    // Legado: trata tudo como inspiration
    parts.push(`# STYLE GUIDE (legacy refs)\n` +
      ctx.referenceDescriptions.map((d, i) => `Reference [${i + 1}]:\n${d}`).join('\n\n'));
  }

  // ── SMART DECISION ─────────────────────────────────────────────────────
  if (ctx.smartDecision?.reasoning) {
    parts.push(`# SMART DECISION CONTEXT\n` +
      `Modelo escolhido: ${ctx.smartDecision.primary_model || ctx.model}\n` +
      `Reference mode: ${ctx.smartDecision.reference_mode || 'text-only'}\n` +
      `Razão: ${ctx.smartDecision.reasoning}`);
  }

  // ── HINT pra Imagen 3 Capability (markers obrigatórios) ────────────────
  if (ctx.model === 'imagen-3.0-capability-001' && Array.isArray(ctx.imageInputs) && ctx.imageInputs.length > 0) {
    const markers = ctx.imageInputs
      .map((i, idx) => `[${i.referenceId || idx + 1}] = ${i.role || 'reference'}`)
      .join(', ');
    parts.push(`# IMAGEN 3 CAPABILITY MARKERS\n` +
      `Use markers no prompt referenciando os reference IDs: ${markers}.\n` +
      `Exemplo: "A photo of person [1] standing in scene [2]".`);
  }

  parts.push(`# TAREFA\nGere o prompt otimizado seguindo o schema profissional, adaptando linguagem ao modelo de destino. Retorne apenas o prompt, sem explicações.`);

  return parts.join('\n\n');
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

module.exports = { PROMPT_ENGINEER_SYSTEM, buildUserMessage };
