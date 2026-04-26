/**
 * @fileoverview System prompt — Prompt Engineer
 * @description Otimiza o pedido bruto do usuário em um prompt profissional
 * de geração de imagem, adaptando o estilo de saída ao modelo de destino.
 *
 * Schema profissional (Subject + ação + ambiente + estilo + iluminação +
 * câmera + composição + qualidade) é injetado e o LLM monta o prompt final.
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

# Adaptação ao modelo
- "imagen-4" / "gpt-image-1" / "nano-banana": prefira linguagem natural fluida, em ENGLISH, descritiva. Frases completas. Evite listas de keywords soltas.
- "flux-1.1-pro": aceita melhor structured keywords separadas por vírgula. Pode misturar inglês e tags técnicas.

# REFERÊNCIAS VISUAIS (CRÍTICO quando presentes)
Quando o usuário fornece "REFERÊNCIAS VISUAIS" (descrições de imagens reais que ele anexou), elas substituem qualquer suposição genérica que você faria sobre o sujeito.
- Se a referência descreve uma PESSOA (ex: "homem de meia idade, óculos, terno azul, cabelo grisalho"), o prompt DEVE descrever essa pessoa específica, traço por traço, no lugar de inventar qualquer outra.
- Se a referência descreve um PRODUTO/OBJETO, o prompt DEVE preservar suas características exatas (cor, formato, material).
- Se a referência descreve um CENÁRIO/ESTILO, use como guia direto de composição e paleta.
- Quando o pedido bruto fala "a pessoa da imagem" ou similar, ENTENDA que está se referindo à referência fornecida — descreva-a explicitamente no prompt em inglês.
- NUNCA ignore as referências em favor de uma versão genérica. Se houver conflito entre o pedido bruto e a referência, a referência tem prioridade pra elementos visuais; o pedido bruto pra ação/cenário.

# Brandbook do cliente
Quando um brandbook for fornecido, OBRIGATORIAMENTE incorpore:
- Paleta de cores (use os hex codes ou descrições próximas)
- Tom visual (minimalista, premium, vibrante, etc)
- Estilo (do[] e dont[] do brandbook viram restrições explícitas)
- Tipografia só entra se houver texto legível na cena

# Restrições
- NUNCA peça texto/copy DENTRO da imagem a menos que o usuário peça explicitamente
- NUNCA invente nomes de pessoas, marcas registradas ou lugares específicos
- Respeite "observations" do usuário como hard constraints (ex: "evite pessoas")
- Se houver "negative_prompt": liste no fim como NEGATIVE PROMPT
- Saída direta, sem explicações, sem markdown, sem prefixos como "Prompt:" ou "Aqui está:"

# Formato de saída
Apenas o prompt final, em texto corrido. Se o modelo for Flux e fizer sentido, pode usar vírgulas/keywords. Caso contrário, prosa natural em inglês. Tamanho ideal: 60–180 palavras (até 240 quando há referências de pessoa ou produto, pois precisa preservar detalhes).`;

/**
 * Monta a user message com todos os contextos relevantes.
 *
 * @param {object} ctx
 * @param {string} ctx.rawDescription
 * @param {object} [ctx.brandbook] - linha de client_brandbooks
 * @param {string} ctx.format
 * @param {string} ctx.aspectRatio
 * @param {string} ctx.model
 * @param {string} [ctx.observations]
 * @param {Array<string>} [ctx.referenceDescriptions]
 * @param {string} [ctx.negativePrompt]
 */
function buildUserMessage(ctx) {
  const parts = [];
  parts.push(`# PEDIDO BRUTO DO OPERADOR\n${ctx.rawDescription}`);
  parts.push(`# MODELO DE DESTINO\n${ctx.model}`);
  parts.push(`# FORMATO\n${ctx.format} (${ctx.aspectRatio})`);

  if (ctx.brandbook?.structured_data) {
    const sd = typeof ctx.brandbook.structured_data === 'string'
      ? safeJsonParse(ctx.brandbook.structured_data)
      : ctx.brandbook.structured_data;
    parts.push(`# BRANDBOOK DO CLIENTE\n${JSON.stringify(sd, null, 2)}`);
  }

  if (ctx.observations) {
    parts.push(`# OBSERVAÇÕES (HARD CONSTRAINTS)\n${ctx.observations}`);
  }
  if (ctx.negativePrompt) {
    parts.push(`# ELEMENTOS A EVITAR\n${ctx.negativePrompt}`);
  }
  if (ctx.referenceDescriptions?.length) {
    parts.push(
      `# REFERÊNCIAS VISUAIS (PRIORIDADE ALTA)\n` +
      `As descrições abaixo vêm de imagens REAIS anexadas pelo usuário. ` +
      `Quando o pedido bruto mencionar "a pessoa", "o produto", "essa imagem" ou similar, ` +
      `assume que está falando dessas referências. Incorpore os detalhes visuais delas ` +
      `(traços físicos, cores, formato, estilo) DIRETAMENTE no prompt final em inglês.\n\n` +
      ctx.referenceDescriptions.map((d, i) => `Referência [${i + 1}]:\n${d}`).join('\n\n')
    );
  }

  parts.push(`# TAREFA\nGere o prompt otimizado seguindo o schema profissional. Retorne apenas o prompt, sem explicações.`);

  return parts.join('\n\n');
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

module.exports = { PROMPT_ENGINEER_SYSTEM, buildUserMessage };
