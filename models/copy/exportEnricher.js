/**
 * @fileoverview Export Enricher — IA reorganiza a copy antes de renderizar
 * @description Sprint Copy v2.1 (maio/2026) — feedback do usuario.
 *
 * Antes do template HTML rodar, chamamos Claude Sonnet 4.6 pra:
 *   1. LER a copy bruta inteira
 *   2. DECIDIR a hierarquia editorial ideal pro template escolhido
 *      (landing/planning/freeform)
 *   3. REORGANIZAR em secoes tipadas (hero, section, callout, list, cta,
 *      quote, faq) sem inventar conteudo novo — so reorganiza/clarifica
 *   4. ENRIQUECER com kickers, eyebrows, callouts onde fizer sentido
 *   5. RETORNAR JSON estruturado que o renderer SIGMA empilha em layout
 *      editorial profissional
 *
 * Por que Sonnet 4.6 e nao Haiku 4.5? Tarefa exige juizo arquitetural
 * (decidir o que e hero, o que e prova, o que e CTA). Haiku faz parafrase
 * bem, mas erra na hierarquia. Custo extra desprezivel pra um export final
 * (~$0.06/doc vs $0.016 — diferenca = 4 centavos).
 *
 * Brandbook eh SEMPRE SIGMA (preto/branco/vermelho editorial). Nao usa
 * brandbook do cliente — feedback explicito do usuario.
 */

const { runCompletionWithModel } = require('../ia/completion');

const ENRICHER_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `PAPEL: Voce e um EDITOR estrutural — nao um redator. Sua unica funcao e
empacotar a copy do operador em sections tipadas pra renderizacao editorial,
SEM mudar uma palavra do conteudo.

═══ REGRA #0 (A MAIS IMPORTANTE — NUNCA QUEBRE) ═══

Voce NAO eh redator. Voce NAO reescreve. Voce SO REORGANIZA.

A copy do operador eh SAGRADA — palavras, tom, voz, expressoes informais,
piadas, idioma — TUDO permanece IDENTICO. Voce so decide onde parte e onde
junta. Pense como diagramador de revista, nao como copywriter.

Especificamente PROIBIDO:
- Traduzir (se ta em espanhol, fica em espanhol; ingles continua ingles)
- "Profissionalizar" tom informal (post de macaco continua sobre macaco)
- Trocar palavras por sinonimos "mais elegantes"
- Adicionar frases de transicao ou conectivos novos
- Inventar CTAs, callouts, quotes ou subtitles que nao existem
- Trocar nome da marca ("FlowTech" continua "FlowTech", nao vira "Sua Empresa")
- Reescrever titulos do markdown — se tem "## Introducao", o title da
  section eh "Introducao", literalmente
- Adicionar valores, beneficios ou caracteristicas nao mencionados
- Mudar a ordem dos paragrafos (mantenha sequencia original)

Permitido apenas:
- Quebrar 1 paragrafo longo em paragrafos menores (preservando palavras)
- Identificar listas com bullets ja existentes (-, •, *) e marcar como kind=list
- Identificar titulos markdown (#, ##, ###) e usar como title de section
- Escolher um eyebrow curto e descritivo NO IDIOMA DA COPY (1-2 palavras)
- Decidir o kind da section baseado no formato natural

═══ TIPOS DE SECAO (kinds) ═══

"hero"     → so use se o primeiro bloco da copy e claramente um titulo grande
             + subhead. Senao, comeca direto com "section". NAO crie hero
             quando nao existe.
"section"  → bloco normal. title = titulo do markdown OU primeira linha forte.
             content = paragrafos LITERAIS da copy original.
"list"     → bloco com 3+ bullets/numeros. items[] = textos LITERAIS dos itens.
"callout"  → so use se o operador EXPLICITAMENTE escreveu algo tipo "atencao",
             "importante", "nota:", "destaque". NAO crie callout do nada.
"quote"    → so use se o original tem aspas literais ("...") indicando
             citacao. NAO crie quote pegando uma frase forte.
"cta"      → so use se o original tem chamada explicita tipo "Clique", "Compre",
             "Inscreva-se", "Entre em contato". NAO crie CTA "porque ficaria
             bonito no fim".
"faq"      → so use se o original ja esta em formato Q&A.

═══ EYEBROW — REGRAS ═══

- 1 a 2 palavras CURTAS
- NO IDIOMA DA COPY (copy em espanhol → eyebrow em espanhol)
- DESCRITIVO da section (nao narrativo)
- Pode usar o titulo da section como base ("## Introducao" → eyebrow "INTRO")
- Se nao tem ideia, use generico do template:
  · landing  → "ABERTURA" / "PROBLEMA" / "SOLUCAO" / "OFERTA" / "CTA"
  · planning → "POST 01" / "POST 02" / etc, ou "ITEM 01" / "ITEM 02"
  · freeform → "INTRO" / "CONTEUDO" / "FECHAMENTO"

═══ EXEMPLO BEFORE/AFTER (siga FIELMENTE este padrao) ═══

ENTRADA:
"""
## Introduccion

Te has sentido como un mono tratando de resolver un cubo Rubik cuando se
trata de gestionar todos los procesos de tu empresa? En FlowTech, entendemos
que la tecnologia puede parecer un enigma.

## Cuerpo del Post

Imagina esto: Un grupo de monos discutiendo como optimizar procesos.

- Uno empieza a programar un CRM agil
- Otro mono ayuda con bots de mensajes
- Y por ultimo, el genio de las plataformas a medida
"""

SAIDA CORRETA (JSON):
{
  "documentTitle": "FlowTech",
  "documentSubtitle": null,
  "sections": [
    {
      "kind": "section",
      "eyebrow": "INTRODUCCION",
      "title": "Introduccion",
      "content": "Te has sentido como un mono tratando de resolver un cubo Rubik cuando se trata de gestionar todos los procesos de tu empresa? En FlowTech, entendemos que la tecnologia puede parecer un enigma."
    },
    {
      "kind": "section",
      "eyebrow": "CUERPO",
      "title": "Cuerpo del Post",
      "content": "Imagina esto: Un grupo de monos discutiendo como optimizar procesos."
    },
    {
      "kind": "list",
      "eyebrow": "EQUIPO",
      "items": [
        "Uno empieza a programar un CRM agil",
        "Otro mono ayuda con bots de mensajes",
        "Y por ultimo, el genio de las plataformas a medida"
      ]
    }
  ]
}

NOTE COMO:
- Idioma preservado (espanhol continua espanhol)
- Macacos permanecem macacos (tom informal/criativo intocado)
- Titulos do markdown viraram title das sections LITERALMENTE
- Bullets viraram items[] de uma list — texto IDENTICO
- Eyebrows em espanhol (INTRODUCCION/CUERPO/EQUIPO)
- Nada inventado, nenhum "hero", nenhum CTA, nenhum callout, nenhum subtitle

═══ TEMPLATE COMO HINT (nao manda) ═══

O \`template\` te diz a INTENCAO do operador, mas voce NAO deve forcar a
estrutura se a copy nao oferece:
- landing  → operador quer um doc tipo landing. Se a copy ja tem hero
             natural, use kind=hero no primeiro bloco. Senao, primeiro bloco
             eh section normal. Nao force CTA no fim se nao existe.
- planning → operador quer um cronograma. Cada bloco enumerado eh 1 section.
- freeform → quase sempre section corrido. Sem hero, sem CTA inventado.

═══ DOCUMENT TITLE ═══

documentTitle = nome do CLIENTE quando fornecido. Nao reinterpretar a copy
pra criar um titulo "criativo". Se nao tem nome de cliente, use o titulo
do primeiro bloco markdown da copy. Em ultimo caso, use "Documento de Copy".

documentSubtitle = OMITA na duvida. So use se o operador escreveu uma linha
explicativa curta logo depois do titulo principal.

═══ FORMATO DE SAIDA (JSON puro, sem fences markdown, sem explicacoes) ═══

{
  "documentTitle": "string",
  "documentSubtitle": "string ou null",
  "sections": [
    {
      "kind": "hero" | "section" | "callout" | "list" | "quote" | "cta" | "faq",
      "eyebrow": "string curto CAPS",
      "title": "string (LITERAL do markdown quando aplicavel; omit se kind=quote ou kind=list sem titulo)",
      "content": "string LITERAL da copy original — paragrafos preservados",
      "items": ["array — so kind=list — texto LITERAL"],
      "qa": [{"question":"...","answer":"..."}],
      "attribution": "string opcional (so kind=quote, se houver no original)"
    }
  ]
}

LEMBRE-SE: voce eh editor estrutural. Empacota, nao reescreve.`;

/**
 * Gera o documento estruturado a partir da copy bruta.
 *
 * @param {object} args
 * @param {string} args.copyText - markdown da sessao
 * @param {'landing'|'planning'|'freeform'} args.template
 * @param {string} [args.clientName] - so vai como contexto pro Sonnet
 * @param {string} args.tenantId
 * @param {string} [args.sessionId]
 * @param {string} [args.clientId]
 * @returns {Promise<{
 *   structured: object,
 *   modelUsed: string,
 *   tokensInput: number,
 *   tokensOutput: number,
 *   fromFallback: boolean
 * }>}
 */
async function enrichForExport({
  copyText, template, clientName, tenantId, sessionId, clientId,
}) {
  if (!copyText || !copyText.trim()) {
    return { structured: _fallbackStructure(copyText, template, clientName), modelUsed: null, tokensInput: 0, tokensOutput: 0, fromFallback: true };
  }

  const trimmedCopy = copyText.slice(0, 12_000);

  // Lembrete curto antes do JSON — reforco final pra Sonnet nao "interpretar"
  const userMessage = `LEMBRETE: preserve IDIOMA, TOM, PALAVRAS e ORDEM da rawCopy abaixo. Apenas empacote em sections. Eyebrows no idioma da copy. Nao traduza, nao reescreva, nao invente CTAs/callouts.

${JSON.stringify({
  template,
  clientName: clientName || null,
  rawCopy: trimmedCopy,
}, null, 2)}`;

  try {
    const result = await runCompletionWithModel(
      ENRICHER_MODEL,
      SYSTEM_PROMPT,
      userMessage,
      4000,
      {
        tenantId,
        clientId: clientId || null,
        sessionId: sessionId || null,
        operationType: 'copy_export_enrich',
      }
    );
    const text = String(result.text || '').trim();
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);

    if (!parsed?.documentTitle || !Array.isArray(parsed?.sections)) {
      throw new Error('JSON invalido: faltam documentTitle ou sections');
    }

    // Safety net: se Sonnet "resumiu" (output muito menor que input),
    // provavelmente reescreveu em vez de empacotar. Tolera ate 50% de
    // reducao (cabecalhos markdown saem do content, espacos colapsam),
    // mas abaixo disso desconfia e cai no fallback deterministico.
    const totalChars = parsed.sections.reduce((acc, sec) => {
      const content = String(sec.content || '');
      const items = Array.isArray(sec.items) ? sec.items.join(' ') : '';
      const qa = Array.isArray(sec.qa) ? sec.qa.map(q => `${q.question || ''} ${q.answer || ''}`).join(' ') : '';
      return acc + content.length + items.length + qa.length;
    }, 0);
    const ratio = totalChars / Math.max(1, trimmedCopy.length);
    if (ratio < 0.5) {
      console.warn('[WARN][exportEnricher] output muito reduzido, suspeita de reescrita — fallback', {
        ratio: ratio.toFixed(2), input: trimmedCopy.length, output: totalChars,
      });
      return {
        structured: _fallbackStructure(copyText, template, clientName),
        modelUsed: result.modelUsed || ENRICHER_MODEL,
        tokensInput: result.usage?.input || 0,
        tokensOutput: result.usage?.output || 0,
        fromFallback: true,
      };
    }

    console.log('[SUCESSO][exportEnricher] estrutura gerada', {
      tenantId, sessionId,
      sections: parsed.sections.length,
      title: parsed.documentTitle,
      tokens: result.usage?.total,
      contentRatio: ratio.toFixed(2),
    });

    return {
      structured: parsed,
      modelUsed: result.modelUsed || ENRICHER_MODEL,
      tokensInput: result.usage?.input || 0,
      tokensOutput: result.usage?.output || 0,
      fromFallback: false,
    };
  } catch (err) {
    console.warn('[WARN][exportEnricher] LLM falhou — usando fallback determinstico', {
      error: err.message,
    });
    return {
      structured: _fallbackStructure(copyText, template, clientName),
      modelUsed: null,
      tokensInput: 0,
      tokensOutput: 0,
      fromFallback: true,
    };
  }
}

/**
 * Fallback: parser markdown determinstico que faz quebra basica em sections.
 * Usado quando Sonnet 4.6 falha — garante que o export sempre acontece.
 */
function _fallbackStructure(copyText, template, clientName) {
  const text = String(copyText || '').trim();
  const lines = text.split('\n');
  const sections = [];
  let current = { kind: 'section', eyebrow: 'CONTEUDO', title: '', content: [] };

  for (const raw of lines) {
    const line = raw.trim();
    const m2 = line.match(/^##\s+(.+)$/);
    const m1 = line.match(/^#\s+(.+)$/);
    if (m1 || m2) {
      if (current.content.length || current.title) {
        sections.push({ ...current, content: current.content.join(' ').trim() });
      }
      current = {
        kind: m1 ? 'hero' : 'section',
        eyebrow: m1 ? 'ABERTURA' : 'SECAO',
        title: (m1 ? m1[1] : m2[1]).trim(),
        content: [],
      };
    } else if (line) {
      current.content.push(line);
    } else if (current.content.length) {
      current.content.push('');
    }
  }
  if (current.content.length || current.title) {
    sections.push({ ...current, content: current.content.join(' ').replace(/\s+/g, ' ').trim() });
  }
  if (sections.length === 0) {
    sections.push({ kind: 'section', eyebrow: 'CONTEUDO', title: 'Documento', content: text });
  }

  return {
    documentTitle: clientName ? `${clientName}` : 'Documento de Copy',
    documentSubtitle: template === 'landing' ? 'Landing Page'
                    : template === 'planning' ? 'Planejamento de Conteudo'
                    : 'Copy editorial',
    sections,
  };
}

module.exports = { enrichForExport, ENRICHER_MODEL };
