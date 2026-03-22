/**
 * @fileoverview Endpoint: Seed de estruturas de copy padrao
 * @route GET /api/copy/seed-structures
 *
 * Insere as 8 estruturas padrao para o tenant se nao existirem.
 * Protegido por INTERNAL_API_TOKEN.
 * Usa INSERT ... ON CONFLICT DO NOTHING (idempotente).
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';

const DEFAULT_STRUCTURES = [
  {
    name: 'Landing Page',
    description: 'LP completa e persuasiva com todas as secoes estrategicas',
    icon: 'layout',
    sort_order: 1,
    prompt_base: `Voce vai criar uma Landing Page completa e persuasiva.
Estruture em secoes: Hero (headline + subheadline + CTA), Problema,
Agitacao, Solucao, Como Funciona, Prova Social, Oferta Completa,
Garantia, FAQ (5 perguntas), CTA Final. Use os dados da base para
personalizar cada secao. Responda com o texto completo de cada secao.`,
    questions: [
      { id: 'q1', label: 'Qual o objetivo principal da LP?', placeholder: 'Ex: venda direta, captura de lead, agendamento...', required: true },
      { id: 'q2', label: 'Qual a oferta ou produto?', placeholder: 'Ex: curso de marketing, consultoria, mentoria...', required: true },
      { id: 'q3', label: 'Tem garantia? Qual?', placeholder: 'Ex: 7 dias, 30 dias, satisfacao garantida...', required: false },
      { id: 'q4', label: 'Preco ou faixa de preco?', placeholder: 'Ex: R$ 497 ou de R$ 997 por R$ 497', required: false },
    ],
  },
  {
    name: 'Calendario de Postagens',
    description: 'Planejamento de 30 dias com posts, reels e stories',
    icon: 'calendar',
    sort_order: 2,
    prompt_base: `Voce vai criar um calendario de postagens para 30 dias.
Forneca a quantidade de posts, reels e stories especificada.
Para cada item inclua: Dia, Tipo (post/reel/story), Tema,
Legenda completa, Hashtags sugeridas, Ideia visual.
Organize em formato de tabela por semana.`,
    questions: [
      { id: 'q1', label: 'Quantos posts por semana?', placeholder: 'Ex: 3 posts, 2 reels, 5 stories', required: true },
      { id: 'q2', label: 'Temas ou pilares de conteudo?', placeholder: 'Ex: educativo, bastidores, depoimentos, oferta...', required: false },
      { id: 'q3', label: 'Alguma data especial no periodo?', placeholder: 'Ex: Black Friday, lancamento dia 15...', required: false },
    ],
  },
  {
    name: 'Copy de Anuncio',
    description: 'Copies para anuncios pagos com variacoes A/B',
    icon: 'megaphone',
    sort_order: 3,
    prompt_base: `Voce vai criar copies de anuncio para redes pagas.
Gere 3 variacoes de copy para cada formato solicitado.
Cada copy deve ter: Headline principal, Texto do corpo, CTA claro.
Inclua versoes para: feed (texto curto), stories (impacto imediato)
e possivel roteiro de video (30s). Use gatilhos mentais e a
linguagem real do avatar para cada variacao.`,
    questions: [
      { id: 'q1', label: 'Qual o objetivo do anuncio?', placeholder: 'Ex: gerar leads, venda direta, reconhecimento...', required: true },
      { id: 'q2', label: 'Qual a oferta ou CTA principal?', placeholder: 'Ex: agendar consulta, baixar ebook, comprar agora...', required: true },
      { id: 'q3', label: 'Orcamento ou plataforma?', placeholder: 'Ex: Meta Ads, Google, TikTok...', required: false },
    ],
  },
  {
    name: 'Email Marketing',
    description: 'Sequencia de emails com assuntos A/B/C e CTAs',
    icon: 'mail',
    sort_order: 4,
    prompt_base: `Voce vai criar uma sequencia de emails.
Para cada email inclua: Assunto (3 opcoes A/B/C), Pre-header,
Corpo completo com saudacao personalizada, CTA principal e secundario.
Aplique copywriting de resposta direta. Tom: pessoal e direto.`,
    questions: [
      { id: 'q1', label: 'Quantos emails na sequencia?', placeholder: 'Ex: 3, 5, 7 emails', required: true },
      { id: 'q2', label: 'Qual o objetivo da sequencia?', placeholder: 'Ex: nutrir lead, vender produto, recuperar carrinho...', required: true },
    ],
  },
  {
    name: 'Roteiro de Reels',
    description: 'Roteiro completo com hook, desenvolvimento e CTA',
    icon: 'video',
    sort_order: 5,
    prompt_base: `Voce vai criar um roteiro completo de Reels.
Estruture em: Hook (primeiros 3 segundos — texto na tela + fala),
Desenvolvimento (conteudo principal dividido em blocos curtos),
CTA final (chamada para acao clara). Inclua sugestoes de legenda,
hashtags e trilha sonora. Formate como roteiro de filmagem.`,
    questions: [
      { id: 'q1', label: 'Qual o tema do Reel?', placeholder: 'Ex: dica rapida, antes e depois, tutorial...', required: true },
      { id: 'q2', label: 'Duracao desejada?', placeholder: 'Ex: 15s, 30s, 60s, 90s', required: false },
    ],
  },
  {
    name: 'Bio do Instagram',
    description: '3 versoes de bio: profissional, resultado e pessoal',
    icon: 'user',
    sort_order: 6,
    prompt_base: `Voce vai criar opcoes de bio para Instagram.
Gere 3 versoes: Profissional (foco em autoridade), Resultado
(foco na transformacao entregue), Pessoal (foco na conexao).
Cada bio deve ter: linha de impacto, o que faz / para quem,
prova social resumida, CTA e link. Maximo 150 caracteres por bio.`,
    questions: [
      { id: 'q1', label: 'Link principal da bio?', placeholder: 'Ex: linktr.ee/empresa, site.com.br', required: false },
      { id: 'q2', label: 'Principal conquista ou prova social?', placeholder: 'Ex: +500 alunos, 10 anos de mercado...', required: false },
    ],
  },
  {
    name: 'Pagina de Vendas (VSL)',
    description: 'Script de VSL + estrutura completa da pagina',
    icon: 'play-circle',
    sort_order: 7,
    prompt_base: `Voce vai criar o script de uma VSL (Video Sales Letter)
e a estrutura da pagina de vendas completa.
Script VSL (para narracao em video): Hook de abertura, Historia,
Problema, Agitacao, Solucao, Prova, Oferta, Garantia, CTA.
Estrutura da pagina: todos os elementos em ordem, com textos
completos para cada bloco.`,
    questions: [
      { id: 'q1', label: 'Qual o produto principal?', placeholder: 'Ex: curso, mentoria, servico...', required: true },
      { id: 'q2', label: 'Preco e condicoes?', placeholder: 'Ex: R$ 997 ou 12x R$ 97', required: true },
      { id: 'q3', label: 'Garantia oferecida?', placeholder: 'Ex: 7 dias incondicional', required: false },
      { id: 'q4', label: 'Bonus inclusos?', placeholder: 'Ex: ebook, comunidade, aula extra...', required: false },
    ],
  },
  {
    name: 'Sequencia de Stories',
    description: 'Sequencia de 7-10 stories com comeco, meio e fim',
    icon: 'smartphone',
    sort_order: 8,
    prompt_base: `Voce vai criar uma sequencia de stories.
Estruture em 7 a 10 stories sequenciais com: Numero do story,
Tipo (texto/imagem/enquete/quiz), Texto principal (maximo 3 linhas),
Call to action do story, Sugestao visual ou figurinha.
A sequencia deve ter comeco, meio e fim com gancho no ultimo story.`,
    questions: [
      { id: 'q1', label: 'Qual o objetivo dos stories?', placeholder: 'Ex: engajar, vender, educar, bastidores...', required: true },
      { id: 'q2', label: 'Quantos stories na sequencia?', placeholder: 'Ex: 7, 10, 15', required: false },
    ],
  },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  // Protecao por token interno
  const token = req.headers['x-internal-token'] || req.query.token;
  if (!process.env.INTERNAL_API_TOKEN || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token invalido' });
  }

  let tenantId;
  try {
    tenantId = await resolveTenantId(req);
  } catch {
    // Se nao tem sessao, pega o primeiro tenant (seed inicial)
    const first = await queryOne('SELECT id FROM tenants LIMIT 1');
    if (!first) return res.status(400).json({ success: false, error: 'Nenhum tenant encontrado' });
    tenantId = first.id;
  }

  try {
    console.log('[INFO][API:seed-structures] Inserindo estruturas padrao', { tenantId });

    let inserted = 0;
    for (const s of DEFAULT_STRUCTURES) {
      const existing = await queryOne(
        'SELECT id FROM copy_structures WHERE tenant_id = $1 AND name = $2',
        [tenantId, s.name]
      );
      if (!existing) {
        await queryOne(
          `INSERT INTO copy_structures (tenant_id, name, description, prompt_base, icon, sort_order, is_default, questions)
           VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING id`,
          [tenantId, s.name, s.description, s.prompt_base, s.icon, s.sort_order, JSON.stringify(s.questions || [])]
        );
        inserted++;
      }
    }

    console.log('[SUCESSO][API:seed-structures] Seed concluido', { tenantId, inserted, total: DEFAULT_STRUCTURES.length });
    return res.json({
      success: true,
      message: `${inserted} estrutura(s) inserida(s), ${DEFAULT_STRUCTURES.length - inserted} ja existia(m)`,
      inserted,
      total: DEFAULT_STRUCTURES.length,
    });
  } catch (err) {
    console.error('[ERRO][API:seed-structures]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
