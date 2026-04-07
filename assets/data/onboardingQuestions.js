/**
 * assets/data/onboardingQuestions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Estrutura COMPLETA das 15 etapas do onboarding SIGMA HACKER.
 *
 * Diferente do formulário antigo (formQuestions.js), aqui:
 *   · Cada "etapa" libera num dia específico (com 3 dias de descanso).
 *   · Cada etapa tem um vídeo introdutório obrigatório.
 *   · `agentNote` é uma nota interna pro agente de IA — NÃO renderiza pra o cliente.
 *   · `helpText` é um texto detalhado que abre num balão expansível ao clicar
 *     no ícone (i) — usado em perguntas mais abertas/genéricas pra orientar.
 *   · `required: true` é validado tanto no front quanto no back.
 *
 * Tipos de campo (mesmos do formQuestions.js):
 *   text       — input simples
 *   textarea   — multilinha
 *   radio      — seleção única (com `conditionalFields` opcional)
 *   checkbox   — seleção múltipla (`hasOther` libera "Outro")
 *   select     — dropdown
 *   number     — input numérico
 *   composite  — vários subcampos agrupados (composite.fields = [...])
 *   slider     — número 0-10 com visual de slider (front decide o render)
 *
 * Placeholder de pergunta livre no fim de toda etapa: id `_extra_<n>`
 * (campo opcional onde o cliente pode acrescentar qualquer coisa fora da pauta).
 *
 * Esta lista é o "default seed". O admin pode editar tudo pelo painel; quando
 * editado, os dados ficam em `onboarding_stages_config.questions_json`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const ONBOARDING_STAGES = [

  /* ═══════════════════════════════════════════════════════════
     ETAPA 1 — DIA 1 — IDENTIDADE DO NEGÓCIO
     12 perguntas. Pisca o pé na água: factuais, fáceis, sem dor.
     Ativa Sistema 1 (Kahneman) — entrada sem fricção.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 1,
    day: 1,
    title: 'Identidade do Negócio',
    description: 'Informações básicas — o alicerce de tudo.',
    timeEstimate: '~4 min',
    insight: 'Perguntas fáceis primeiro. O cérebro entra no jogo sem perceber.',
    questions: [
      { id: '1.1',  label: 'Qual o nome da sua empresa?', type: 'text',
        placeholder: 'Ex: FlowTech Soluções', required: true },

      { id: '1.2',  label: 'Qual o seu segmento ou nicho de atuação?', type: 'text',
        placeholder: 'Ex: odontologia estética, advocacia tributária, consultoria de TI...',
        required: true,
        helpText: 'Quanto mais específico, melhor. "Estética facial" é melhor do que "beleza". "Marcenaria sob medida pra casas de luxo" é melhor que "marcenaria". O nicho define a linguagem, o canal, a dor e o ciclo de venda.',
        agentNote: 'Nicho define linguagem, canal, dor, ciclo de venda.' },

      { id: '1.3',  label: 'Há quanto tempo a empresa existe?', type: 'radio',
        options: ['Menos de 1 ano', '1 a 3 anos', '3 a 5 anos', '5 a 10 anos', 'Mais de 10 anos'] },

      { id: '1.4',  label: 'Qual a cidade e estado onde atua?', type: 'text',
        placeholder: 'Ex: Manaus, AM', required: true,
        helpText: 'Se atende várias cidades, lista as principais. Se é 100% online sem foco geográfico, escreve "Brasil inteiro".' },

      { id: '1.5',  label: 'Atende presencialmente, online ou os dois?', type: 'radio',
        options: ['Presencialmente', 'Online', 'Os dois'], required: true },

      { id: '1.6',  label: 'Quantas pessoas trabalham na empresa?', type: 'radio',
        options: ['Só eu', '2 a 5', '6 a 15', '16 a 50', 'Mais de 50'], required: true,
        agentNote: '"Só eu" indica gargalo do dono — toda decisão passa por uma pessoa.' },

      { id: '1.7',  label: 'Tem CNPJ formalizado?', type: 'radio',
        options: ['Sim', 'Não', 'Em processo'] },

      { id: '1.8',  label: 'Qual o faturamento médio mensal?', type: 'select',
        hint: 'Confidencial — usado pra dimensionar a estratégia.',
        helpText: 'A gente precisa saber em que escala você está pra desenhar uma estratégia que faça sentido. Não tem julgamento. Escolha a faixa mais próxima da sua média dos últimos 3 meses.',
        options: ['Até R$ 5.000', 'R$ 5.000 a R$ 15.000', 'R$ 15.000 a R$ 30.000',
                  'R$ 30.000 a R$ 60.000', 'R$ 60.000 a R$ 100.000', 'Acima de R$ 100.000'],
        required: true,
        agentNote: 'Define nível de estratégia e em que andar da pirâmide de Maslow o cliente vive.' },

      { id: '1.9',  label: 'Qual o seu ticket médio?', type: 'text',
        placeholder: 'Ex: R$ 800 por venda, R$ 2.500/mês por cliente, R$ 15 mil por projeto...',
        required: true,
        helpText: 'Ticket médio = quanto um cliente paga, em média, por compra OU por mês de relação. Se você vende vários serviços com preços muito diferentes, dá uma média ponderada ou cita 2-3 ranges.',
        agentNote: 'Ticket alto = funil longo, consultivo. Ticket baixo = funil curto, impulsivo.' },

      { id: '1.10', label: 'Quantos clientes atende por mês?', type: 'text',
        placeholder: 'Ex: 30 clientes/mês, 5 a 10, varia muito...',
        helpText: 'Pode ser uma média aproximada. Se varia muito, escreve o range (ex: "8 a 15"). Se você é serviço recorrente, conta os clientes ativos.',
        agentNote: 'Cruzar com faturamento pra validar a sanidade do ticket informado.' },

      { id: '1.11', label: 'O negócio tem sazonalidade? Quais meses fortes e fracos?', type: 'textarea',
        placeholder: 'Ex: "Dezembro vende o dobro, janeiro é parado. Maio também sobe por causa do dia das mães."' },

      { id: '1.12', label: 'Quais ferramentas você usa no dia a dia?', type: 'checkbox',
        options: ['WhatsApp Business', 'Planilhas (Excel/Sheets)', 'CRM', 'ERP / sistema de gestão', 'Agenda online', 'Nenhuma'],
        hasOther: true,
        conditionalFields: [
          { trigger: { option: 'CRM' },
            field: { id: '1.12_crm', label: 'Qual CRM?', type: 'text', placeholder: 'Ex: HubSpot, RD Station, Pipedrive...' } },
        ],
        agentNote: '"Nenhuma" = oportunidade massiva de ganho operacional.' },

      { id: '_extra_1', label: 'Tem algo importante sobre sua empresa que não foi perguntado?', type: 'textarea',
        placeholder: 'Opcional. Use esse espaço para acrescentar qualquer coisa.', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 2 — DIA 2 — PRODUTOS E SERVIÇOS
     15 perguntas. O cliente pensa que sabe tudo sobre o que vende.
     A maioria descobre aqui que não sabe.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 2,
    day: 2,
    title: 'Produtos e Serviços',
    description: 'O que você vende — e o que dá realmente resultado.',
    timeEstimate: '~5 min',
    insight: 'O que mais vende ≠ o que dá mais lucro. A maioria nunca parou pra notar.',
    questions: [
      { id: '2.1',  label: 'Liste TODOS os seus produtos ou serviços.', type: 'textarea',
        placeholder: 'Um por linha. Ex:\n- Implante dentário\n- Clareamento\n- Limpeza profissional',
        required: true,
        helpText: 'Lista mesmo os que vendem pouco — eles podem virar gancho de conteúdo. Se tem combos/pacotes, lista também.' },

      { id: '2.2',  label: 'Qual é o que mais vende hoje?', type: 'text',
        placeholder: 'Ex: Limpeza de pele', required: true },

      { id: '2.3',  label: 'Qual dá mais lucro (margem)?', type: 'text',
        placeholder: 'Ex: Botox — sobra mais por hora trabalhada',
        helpText: 'Pode ser diferente do que mais vende. Lucro = preço menos custo direto (material + tempo). Se nunca parou pra calcular, dá um chute educado — esse exercício já vale.',
        agentNote: 'A maioria descobre aqui que o produto que mais vende NÃO é o mais lucrativo.' },

      { id: '2.4',  label: 'Qual está crescendo mais rápido nas vendas?', type: 'text',
        placeholder: 'Ex: Pacote de manutenção mensal' },

      { id: '2.5',  label: 'Qual vende bem de forma estável (sem altos e baixos)?', type: 'text',
        placeholder: 'Ex: Consulta inicial — todo mês entra o mesmo número' },

      { id: '2.6',  label: 'Algum produto que você pensa em parar de oferecer?', type: 'text',
        placeholder: 'Ex: Não — ou descreva qual e por quê' },

      { id: '2.7',  label: '% aproximado do faturamento por produto/serviço.', type: 'textarea',
        placeholder: 'Ex: "Limpeza de pele = 40%, Botox = 30%, Outros = 30%"',
        helpText: 'Não precisa ser exato. Uma estimativa ajuda a entender onde está o dinheiro de verdade. Se tem 1 produto que é 80% e os outros somam 20%, isso é informação importantíssima.' },

      { id: '2.8',  label: 'Qual produto você GOSTARIA de vender mais?', type: 'text',
        placeholder: 'Ex: O pacote anual — mas ninguém compra',
        helpText: 'Geralmente é o produto com maior margem ou maior potencial de escala. Se não vende, é porque a comunicação ou a oferta não está clara — vamos resolver.',
        agentNote: 'Desejo frustrado = oportunidade clara de reposicionamento.' },

      { id: '2.9',  label: 'Tem algum produto/serviço que o cliente NEM SABE que existe?', type: 'text',
        placeholder: 'Ex: Visita técnica grátis antes do orçamento',
        agentNote: 'Ouro escondido. Vai pro topo da estratégia de conteúdo.' },

      { id: '2.10', label: 'Como funciona o processo de compra hoje? (do contato ao fechamento)', type: 'textarea',
        placeholder: 'Ex: "Cliente manda DM → respondo → mando link de agendamento → faz visita → mando orçamento → fecha"',
        helpText: 'Descreve o caminho COMPLETO, mesmo que pareça óbvio. É aqui que a gente identifica onde tem fricção.' },

      { id: '2.11', label: 'Passo a passo de como você ENTREGA o serviço/produto.', type: 'textarea',
        placeholder: 'Ex: "Recebe pedido → confirma materiais → agenda → visita técnica → execução em 3 dias → entrega"',
        helpText: 'É o "como você faz" — a operação. Não precisa ser técnico, escreve do jeito que explicaria pra um cliente leigo. Aqui mora o seu método único.',
        agentNote: 'O mapa da operação. Aqui mora o método único.' },

      { id: '2.12', label: 'Qual etapa consome mais tempo ou custo?', type: 'text',
        placeholder: 'Ex: Orçamento — gasto 1h por proposta',
        agentNote: 'O GARGALO (Goldratt). Se otimizar isso, libera capacidade.' },

      { id: '2.13', label: 'Qual etapa o cliente MAIS valoriza?', type: 'text',
        placeholder: 'Ex: O acompanhamento pós-entrega' },

      { id: '2.14', label: 'Tem algum serviço novo que quer LANÇAR?', type: 'textarea',
        placeholder: 'Opcional. Se sim, descreva — pode entrar na estratégia.' },

      { id: '2.15', label: 'Depende de algum fornecedor crítico? Qual o impacto se ele sumir?', type: 'composite',
        helpText: 'Pensa: se o fornecedor falir/sumir amanhã, sua operação para? Quanto tempo aguenta? Isso vira plano de contingência.',
        fields: [
          { id: '2.15_qual', label: 'Quais fornecedores?', type: 'text', placeholder: 'Ex: Distribuidora X, fabricante Y' },
          { id: '2.15_impacto', label: 'Impacto se sumir', type: 'text', placeholder: 'Ex: Grave — sem operação por 30 dias' },
        ] },

      { id: '_extra_2', label: 'Tem algo sobre seus produtos que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 3 — DIA 3 — SEU CLIENTE
     14 perguntas. A pergunta MAIS importante de todo o briefing.
     "Sair de eu pra ele" — mudança de perspectiva.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 3,
    day: 3,
    title: 'Seu Cliente',
    description: 'Quem realmente compra — e quem você deveria atrair.',
    timeEstimate: '~6 min',
    insight: 'Sair de "eu" pra "ele". Ver pelos olhos do cliente muda tudo.',
    questions: [
      { id: '3.1',  label: 'Descreva seu cliente típico como uma pessoa real.', type: 'textarea',
        placeholder: 'Ex: "Mulher 30-45 anos, casada, 2 filhos, trabalha CLT, mora em condomínio classe B, posta família no Insta, tá começando a se preocupar com aparência e saúde"',
        required: true,
        helpText: 'Esquece "público-alvo" tipo "mulheres 25-50". Pensa numa pessoa real que você atendeu recentemente. Escreve como se estivesse contando pra um amigo. Idade, profissão, vida, hábitos, o que ela posta no Instagram, com quem conversa.',
        agentNote: 'Big Five implícito: extroversão, abertura, neuroticismo.' },

      { id: '3.2',  label: 'Faixa de renda do cliente?', type: 'radio',
        options: ['Classe C (até R$ 4.000)', 'Classe B (R$ 4.000 a R$ 12.000)', 'Classe A (acima de R$ 12.000)', 'Misto'] },

      { id: '3.3',  label: 'Cliente é PF (pessoa física) ou PJ (empresa)?', type: 'radio',
        options: ['B2C (consumidor final)', 'B2B (empresas)', 'Os dois'], required: true,
        agentNote: 'B2C = decisão emocional. B2B = emocional + dado.' },

      { id: '3.4',  label: 'Como ele chega até você hoje?', type: 'checkbox',
        options: ['Indicação', 'Instagram', 'Google', 'Localização da loja', 'Anúncios pagos', 'WhatsApp', 'Parcerias'],
        hasOther: true,
        helpText: 'Pode marcar várias. Pensa nos últimos 10 clientes — de onde eles vieram?' },

      { id: '3.5',  label: 'O que o cliente REALMENTE quer resolver quando procura você?', type: 'textarea',
        placeholder: 'Ex: "Não é só o dente bonito. É voltar a sorrir em foto sem mão na boca."',
        required: true,
        helpText: 'Isso é a pergunta MAIS importante do briefing inteiro. Vai além do óbvio. Ninguém compra furadeira — compra um buraco na parede. Ninguém compra dieta — compra confiança no espelho. O que está POR TRÁS do serviço que você vende?',
        agentNote: 'A PERGUNTA MAIS IMPORTANTE do briefing. Se a resposta for rasa, repergunta no agente.' },

      { id: '3.6',  label: 'Como ele se SENTE antes e depois de contratar?', type: 'textarea',
        placeholder: 'Ex: "Antes: ansioso, com vergonha. Depois: aliviado, confiante, querendo mostrar pra todo mundo."',
        helpText: 'Pensa em emoção, não em fato. Antes pode ser frustração, vergonha, medo, ansiedade. Depois é alívio, orgulho, confiança, leveza. Esse mapa vira copy de anúncio depois.',
        agentNote: 'Mapa emocional. Vai virar copy.' },

      { id: '3.7',  label: 'Contratar você muda como ele é VISTO pelos outros?', type: 'radio',
        options: ['Sim, muito', 'Um pouco', 'Não'],
        helpText: 'Status. Pensa: se ele postar uma foto usando seu serviço, os amigos vão admirar/desejar/comentar? Se sim, status é forte. Se não, o gancho da estratégia é outro.',
        agentNote: 'STATUS — vai virar gancho de narrativa.' },

      { id: '3.8',  label: 'Antes de contratar, ele fazia o quê?', type: 'radio',
        options: ['Tentava sozinho', 'Com outro fornecedor', 'Não fazia nada', 'Usava uma alternativa pior'],
        hasOther: true },

      { id: '3.9',  label: 'Qual o MOMENTO EXATO em que ele pensa "preciso resolver AGORA"?', type: 'textarea',
        placeholder: 'Ex: "Quando a roupa não fecha mais. Quando vê uma foto e não se reconhece."',
        helpText: 'É o gatilho — o estopim. Pode ser um evento (casamento, formatura), uma dor física, uma comparação, uma frustração acumulada. Esse momento vira o criativo de anúncio mais poderoso.',
        agentNote: 'O GATILHO. Vai virar criativo de tráfego.' },

      { id: '3.10', label: 'O que faz ele fechar com VOCÊ e não com a concorrência?', type: 'textarea',
        placeholder: 'Ex: "Atendimento próximo, eu respondo o WhatsApp na hora, mostro casos parecidos com o dele"',
        required: true,
        helpText: 'Não vale "preço bom" ou "qualidade". Pensa no que clientes elogiam quando você fecha. Por que ELE escolheu você quando podia ir em qualquer outro? A resposta verdadeira vem do cliente, não da sua percepção.',
        agentNote: 'Vantagem injusta percebida.' },

      { id: '3.11', label: 'O que faz ele NÃO fechar?', type: 'checkbox',
        options: ['Preço', 'Desconfiança', 'Não entendeu o serviço', 'Preferiu outro', 'Localização', 'Falta de prova'],
        hasOther: true,
        helpText: 'Marca todas que aparecem com frequência. Esse é o seu mapa de objeções — a gente usa pra criar conteúdo que mata cada uma antes do cliente nem perguntar.',
        agentNote: 'Mapa de objeções. Vai virar FAQ + script de vendas.' },

      { id: '3.12', label: 'Os clientes voltam?', type: 'radio',
        options: ['A maioria volta', 'Alguns voltam', 'Quase ninguém volta', 'Serviço é pontual (não volta mesmo)'] },

      { id: '3.13', label: 'Descreva o cliente PERFEITO. Aquele que dá lucro, paga em dia e indica.', type: 'textarea',
        placeholder: 'Ex: "Empresário 35-50, dono de salão, fatura R$ 30k+, já investiu em marketing antes, valoriza dado, paga à vista"',
        helpText: 'Esse é o cliente que você quer CLONAR. Geralmente representa 20% da base mas dá 80% do resultado. Descreve com detalhes pra a gente saber pra quem mirar a estratégia inteira.',
        agentNote: 'Dream 100 (Chet Holmes). Vai filtrar todo o tráfego.' },

      { id: '3.14', label: 'Quem você NÃO quer como cliente?', type: 'textarea',
        placeholder: 'Ex: "Quem pechinha, quem quer tudo pra ontem, quem não confia no processo"',
        helpText: 'Saber dizer não é estratégico. Filtrar quem não serve te economiza tempo, energia e estresse. A gente usa isso pra desenhar criativos que naturalmente repelem o cliente errado.',
        agentNote: 'Tribo = inclusão E exclusão. Saber dizer "não" é estratégico.' },

      { id: '_extra_3', label: 'Tem algo sobre seu cliente que ainda não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 4 — DIA 5 — MERCADO E CONCORRÊNCIA
     (Dia 4 = descanso. Esta etapa libera no dia 5.)
     11 perguntas. Aqui o cliente sai do "eu sou único".
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 4,
    day: 5,
    title: 'Mercado e Concorrência',
    description: 'Quem mais joga esse jogo e onde eles falham.',
    timeEstimate: '~4 min',
    insight: 'Ninguém é único. Mas todo mundo tem um espaço que ninguém ocupa.',
    questions: [
      { id: '4.1',  label: 'Liste 2 a 5 concorrentes diretos.', type: 'textarea' },
      { id: '4.2',  label: 'Cole o @ do Instagram de 2 a 3 desses concorrentes.', type: 'text',
        placeholder: '@concorrente1, @concorrente2',
        agentNote: 'ESSENCIAL pro agente de pesquisa de concorrência.' },
      { id: '4.3',  label: 'O que esses concorrentes fazem BEM?', type: 'textarea' },
      { id: '4.4',  label: 'Onde eles FALHAM?', type: 'textarea',
        agentNote: 'Territórios pra ocupar.' },
      { id: '4.5',  label: 'Como funciona o marketing deles? Qual o melhor conteúdo que postam?', type: 'textarea' },
      { id: '4.6',  label: 'Tem alguma experiência que NENHUM concorrente oferece e você poderia oferecer?', type: 'textarea' },
      { id: '4.7',  label: 'Tem algum concorrente que você ADMIRA? Por quê?', type: 'textarea' },
      { id: '4.8',  label: 'Seu preço comparado ao mercado:', type: 'radio',
        options: ['Mais barato', 'Na média', 'Mais caro'] },
      { id: '4.9',  label: 'Tem concorrente INDIRETO? (alguém que resolve o mesmo problema de outro jeito)', type: 'textarea' },
      { id: '4.10', label: 'É fácil uma nova empresa entrar e fazer o mesmo que você?', type: 'radio',
        options: ['Muito fácil', 'Médio', 'Difícil'] },
      { id: '4.11', label: 'Os clientes resolveriam o problema SEM contratar ninguém?', type: 'textarea' },
      { id: '_extra_4', label: 'Tem algo sobre seus concorrentes que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 5 — DIA 6 — FORÇAS E DIFERENCIAIS
     10 perguntas. Aqui sai o pitch natural.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 5,
    day: 6,
    title: 'Forças e Diferenciais',
    description: 'O que você tem que ninguém copia em 10 minutos.',
    timeEstimate: '~4 min',
    insight: 'O que você acha que é o seu diferencial geralmente NÃO é. A verdade vem do cliente.',
    questions: [
      { id: '5.1', label: 'Quais os 3 maiores PONTOS FORTES da sua empresa?', type: 'textarea' },
      { id: '5.2', label: 'Quais os 3 maiores PONTOS FRACOS?', type: 'textarea' },
      { id: '5.3', label: 'O que os clientes MAIS elogiam?', type: 'textarea',
        agentNote: 'A verdade vem do cliente, não da sua percepção.' },
      { id: '5.4', label: 'O que os clientes MAIS reclamam?', type: 'textarea' },
      { id: '5.5', label: 'Tem algum MÉTODO ou processo que SÓ VOCÊ faz desse jeito?', type: 'textarea',
        agentNote: 'Vantagem injusta. Vai virar nome próprio (ex: "Método X").' },
      { id: '5.6', label: 'Se tivesse que responder em 1 frase: "Por que te escolher e não o concorrente?"', type: 'textarea',
        agentNote: 'O PITCH NATURAL. É candidato a slogan ou USP.' },
      { id: '5.7', label: 'Tem algo na sua empresa que é DIFÍCIL DE COPIAR?', type: 'textarea' },
      { id: '5.8', label: 'A equipe está preparada pra crescer?', type: 'radio',
        options: ['Sim, totalmente', 'Mais ou menos', 'Precisa melhorar muito', 'Não tenho equipe'],
        condition: { questionId: '1.6', notValue: 'Só eu' } },
      { id: '5.9', label: 'Tem algum serviço que NINGUÉM no seu mercado oferece e você poderia?', type: 'textarea' },
      { id: '5.10', label: 'Tem algum público ou região que você não atende mas vê potencial?', type: 'textarea' },
      { id: '_extra_5', label: 'Tem algo sobre suas forças que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 6 — DIA 7 — CONTEXTO + PROVAS
     12 perguntas (4 de contexto + 8 de provas).
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 6,
    day: 7,
    title: 'Contexto e Provas',
    description: 'O cenário externo e as provas que você já tem.',
    timeEstimate: '~5 min',
    insight: 'Munição existente. Geralmente tem ouro guardado em pasta de WhatsApp.',
    questions: [
      { id: '6.1', label: 'Existe alguma lei ou regulamentação que afeta o seu negócio?', type: 'radio',
        options: ['Sim', 'Não', 'Não sei'],
        conditionalFields: [
          { trigger: { value: 'Sim' },
            field: { id: '6.1_qual', label: 'Qual?', type: 'text' } },
        ] },
      { id: '6.2', label: 'A economia tem afetado as vendas?', type: 'radio',
        options: ['Caíram bastante', 'Estamos resistentes', 'Normal', 'Vendendo mais'] },
      { id: '6.3', label: 'Alguma nova tecnologia mudando o seu mercado?', type: 'radio',
        options: ['Sim', 'Não', 'Não sei'],
        conditionalFields: [
          { trigger: { value: 'Sim' },
            field: { id: '6.3_qual', label: 'Qual tecnologia?', type: 'text' } },
        ] },
      { id: '6.4', label: 'Houve mudanças no comportamento do seu cliente nos últimos anos?', type: 'textarea' },
      { id: '7.1', label: 'Quantos clientes você já atendeu NO TOTAL?', type: 'text',
        agentNote: 'Prova social bruta. Vira "+800 clientes atendidos".' },
      { id: '7.2', label: 'Você tem DEPOIMENTOS de clientes guardados?', type: 'radio',
        options: ['Vários', 'Alguns', 'Não tenho organizado'],
        conditionalFields: [
          { trigger: { values: ['Vários', 'Alguns'] },
            field: { id: '7.2_onde', label: 'Onde estão?', type: 'text', placeholder: 'WhatsApp, Google, prints...' } },
        ] },
      { id: '7.3', label: 'Conta um caso de sucesso MARCANTE de um cliente. Como ele chegou e como ele saiu?', type: 'textarea',
        agentNote: 'Jornada do herói. Esse case vira anúncio, post e prova social.' },
      { id: '7.4', label: 'Já apareceu na mídia? Tem certificação? Prêmio?', type: 'textarea' },
      { id: '7.5', label: 'Há quanto tempo VOCÊ trabalha nesse mercado?', type: 'text' },
      { id: '7.6', label: 'Nota no Google Meu Negócio? Quantas avaliações?', type: 'text' },
      { id: '7.7', label: 'Tem perfil em portais de avaliação? (Reclame Aqui, GetNinjas, etc)', type: 'textarea' },
      { id: '7.8', label: 'Tem fotos/vídeos profissionais, antes-depois, bastidores?', type: 'textarea',
        agentNote: 'Munição existente. Sempre tem mais do que o cliente lembra.' },
      { id: '_extra_6', label: 'Tem algo sobre o contexto ou suas provas que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 7 — DIA 9 — IDENTIDADE VISUAL E NARRATIVA
     (Dia 8 = descanso. Etapa libera no dia 9.)
     11 perguntas. AQUI a etapa mais bonita do briefing.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 7,
    day: 9,
    title: 'Identidade Visual e Narrativa',
    description: 'A história que dá alma à marca.',
    timeEstimate: '~6 min',
    insight: 'A história POR QUÊ você abriu é o combustível de TUDO. Se for rasa, repergunta.',
    questions: [
      { id: '8.1', label: 'Tem logotipo profissional?', type: 'radio',
        options: ['Sim, feito por designer', 'Sim, mas amador', 'Não tenho'] },
      { id: '8.2', label: 'Tem paleta de cores, tipografia e manual de marca?', type: 'radio',
        options: ['Sim, completo', 'Tenho cores mas sem padrão', 'Não'] },
      { id: '8.3', label: 'Marca registrada no INPI?', type: 'radio',
        options: ['Sim', 'Não', 'Em processo', 'Não sei o que é'] },
      { id: '8.4', label: 'Cole 3 perfis de Instagram que você acha BONITOS (não precisam ser do seu nicho).', type: 'text',
        placeholder: '@perfil1, @perfil2, @perfil3' },
      { id: '8.5', label: 'Cole 1 perfil que você NÃO quer parecer.', type: 'text', placeholder: '@perfil' },
      { id: '8.6', label: 'A marca fala "você", "tu" ou "senhor/senhora"?', type: 'radio',
        options: ['Você', 'Tu', 'Senhor/Senhora', 'Depende do cliente'] },
      { id: '8.7', label: 'Em 3 palavras, qual a personalidade da sua marca?', type: 'text',
        placeholder: 'Ex: confiante, técnica, humana',
        agentNote: 'Arquétipo (Mark & Pearson).' },
      { id: '8.8', label: 'Se fizesse um Story agora pra falar do seu negócio, o que diria?', type: 'textarea' },
      { id: '8.9', label: 'POR QUE você abriu essa empresa? Conta a história desde o começo.', type: 'textarea',
        agentNote: 'Combustível da marca. Se vier rasa, o agente DEVE reperguntar com mais profundidade.' },
      { id: '8.10', label: 'Qual foi o momento MAIS DIFÍCIL desde que começou?', type: 'textarea',
        agentNote: 'Ato 2 da jornada do herói. Vira post de viralização.' },
      { id: '8.11', label: 'Tem alguma história que os clientes ADORAM ouvir sobre você?', type: 'textarea',
        agentNote: 'Núcleo da narrativa. Vai virar pillar content.' },
      { id: '_extra_7', label: 'Tem algo sobre sua identidade ou história que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 8 — DIA 10 — MARKETING ATUAL
     12 perguntas. Diagnóstico do que já está rodando.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 8,
    day: 10,
    title: 'Marketing Atual',
    description: 'O que você já tentou — e o que sobrou.',
    timeEstimate: '~5 min',
    insight: '"Poucos clientes do Instagram fecham" geralmente é problema comercial, não de conteúdo.',
    questions: [
      { id: '9.1', label: 'Você já investiu em marketing de alguma forma?', type: 'checkbox',
        options: ['Conteúdo orgânico', 'Tráfego pago', 'Site / SEO', 'E-mail marketing',
                  'Marketing offline', 'Influenciadores', 'Parcerias', 'Nenhum'],
        hasOther: true },
      { id: '9.2', label: 'O que FUNCIONOU?', type: 'textarea' },
      { id: '9.3', label: 'O que NÃO funcionou?', type: 'textarea' },
      { id: '9.4', label: 'Já trabalhou com outra agência? Por que parou?', type: 'radio',
        options: ['Sim, e tive boa experiência', 'Sim, mas foi ruim', 'Nunca trabalhei com agência'],
        conditionalFields: [
          { trigger: { values: ['Sim, e tive boa experiência', 'Sim, mas foi ruim'] },
            field: { id: '9.4_motivo', label: 'O que motivou a saída?', type: 'text' } },
        ] },
      { id: '9.5', label: 'Em quais plataformas você está ativo hoje?', type: 'checkbox',
        options: ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Google', 'Facebook'],
        hasOther: true,
        conditionalFields: [
          { trigger: { option: 'Instagram' },
            field: { id: '9.5_instagram', label: '@ do Instagram', type: 'text', placeholder: '@seuperfil' } },
        ] },
      { id: '9.6', label: 'Quantos seguidores no Instagram?', type: 'radio',
        options: ['Menos de 1k', '1k a 5k', '5k a 10k', '10k a 50k', 'Mais de 50k'] },
      { id: '9.7', label: 'O Instagram GERA VENDAS hoje?', type: 'radio',
        options: ['Sim, várias', 'Algumas', 'Poucas', 'Não gera nada'],
        agentNote: '"Poucas" geralmente é problema comercial — não de conteúdo.' },
      { id: '9.8', label: 'Quanto investe em tráfego pago por mês?', type: 'radio',
        options: ['Nunca investi', 'Até R$ 500', 'R$ 500 a R$ 2.000', 'R$ 2.000 a R$ 5.000', 'Mais de R$ 5.000'] },
      { id: '9.9', label: 'Tem site? Cole a URL.', type: 'text', placeholder: 'https://...' },
      { id: '9.10', label: 'Tem lista de contatos / clientes? Quantos?', type: 'textarea' },
      { id: '9.11', label: 'Sobre conteúdo em vídeo:', type: 'composite',
        fields: [
          { id: '9.11_camera', label: 'Tem câmera/celular bom?', type: 'text', placeholder: 'Sim/Não' },
          { id: '9.11_local',  label: 'Tem local pra gravar?', type: 'text', placeholder: 'Sim/Não' },
          { id: '9.11_aceita', label: 'Topa aparecer em vídeo?', type: 'text', placeholder: 'Sim/Não/Depende' },
        ] },
      { id: '9.12', label: 'De 0 a 10, quão satisfeito está com o marketing atual?', type: 'slider' },
      { id: '_extra_8', label: 'Tem algo sobre o marketing atual que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 9 — DIA 11 — DADOS, MÉTRICAS E SISTEMAS
     9 perguntas. Aqui sai a primeira oportunidade óbvia.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 9,
    day: 11,
    title: 'Dados, Métricas e Sistemas',
    description: 'Os números que você (provavelmente) não tem.',
    timeEstimate: '~4 min',
    insight: 'Se não sabe o CAC, é o primeiro entregável da Sigma. Sem isso, qualquer estratégia é chute.',
    questions: [
      { id: '10.1', label: 'Você sabe quanto custa trazer UM cliente novo?', type: 'radio',
        options: ['Sei exatamente', 'Tenho ideia aproximada', 'Não faço ideia'],
        conditionalFields: [
          { trigger: { value: 'Sei exatamente' },
            field: { id: '10.1_quanto', label: 'Quanto?', type: 'text', placeholder: 'R$ ___' } },
        ],
        agentNote: 'Primeiro entregável da agência. CAC é base de tudo.' },
      { id: '10.2', label: 'Quanto um cliente gasta com você ao longo de TODA a relação?', type: 'textarea',
        placeholder: 'LTV — vida útil do cliente.' },
      { id: '10.3', label: 'Quais NÚMEROS você acompanha hoje?', type: 'checkbox',
        options: ['Faturamento', 'Nº de clientes', 'Conversão', 'Retorno (ROI)', 'Custo por cliente', 'Nenhum'],
        hasOther: true },
      { id: '10.4', label: 'Tem rastreamento no site? (Pixel, GA4)', type: 'radio',
        options: ['Sim, os dois', 'Só um deles', 'Não', 'Não sei o que é'] },
      { id: '10.5', label: 'Suas ferramentas conversam entre si?', type: 'radio',
        options: ['Tudo integrado', 'Parcialmente', 'São ilhas', 'Não uso ferramentas'] },
      { id: '10.6', label: 'Quais tarefas se repetem TODO DIA na empresa?', type: 'textarea',
        agentNote: 'Mapa de automação. Vira agentes de IA na fase 2.' },
      { id: '10.7', label: 'Se pudesse automatizar UMA coisa hoje, qual seria?', type: 'textarea',
        agentNote: 'Dor operacional mais aguda. Quick win.' },
      { id: '10.8', label: 'Tem dados dos últimos 6-12 meses (vendas, leads, conteúdo)?', type: 'radio',
        options: ['Sim, organizados', 'Tenho alguns', 'Não tenho nada'] },
      { id: '10.9', label: 'Quando um lead chega no WhatsApp, em quanto tempo você responde?', type: 'radio',
        options: ['Menos de 5 minutos', '5 a 30 min', '30 min a 2h', 'Mais de 2h', 'Depende do dia'],
        agentNote: 'Tempo de resposta tem impacto exponencial em conversão.' },
      { id: '_extra_9', label: 'Tem algo sobre seus dados que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 10 — DIA 12 — JORNADA DO CLIENTE + COMERCIAL
     19 perguntas (10 de jornada + 9 comercial).
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 10,
    day: 12,
    title: 'Jornada e Comercial',
    description: 'O caminho do contato ao "sim" — e o que te trava.',
    timeEstimate: '~7 min',
    insight: 'Sem script de venda, qualquer narrativa boa morre na hora de fechar.',
    questions: [
      { id: '11.1', label: 'Descreva o CAMINHO completo do cliente (do primeiro contato à entrega).', type: 'textarea' },
      { id: '11.2', label: 'Quanto tempo o cliente demora pra decidir contratar?', type: 'radio',
        options: ['Mesmo dia', '1 a 3 dias', '1 a 2 semanas', 'Mais de 2 semanas'] },
      { id: '11.3', label: 'Antes de fechar, ele pesquisa? Onde?', type: 'checkbox',
        options: ['Google', 'Instagram', 'Pergunta pra amigos', 'Compara preços', 'Lê avaliações', 'Não pesquisa'] },
      { id: '11.4', label: 'Quais as principais OBJEÇÕES que aparecem nas conversas?', type: 'textarea' },
      { id: '11.5', label: 'Principal ponto de contato com o cliente:', type: 'radio',
        options: ['WhatsApp', 'Telefone', 'DM do Instagram', 'Loja física', 'Site / formulário'],
        hasOther: true },
      { id: '11.6', label: 'Em que MOMENTO você perde mais clientes?', type: 'radio',
        options: ['Por preço', 'No follow-up', 'Após a primeira compra', 'Não sei'],
        hasOther: true,
        agentNote: 'PONTO DE QUEBRA do funil. Foco da otimização.' },
      { id: '11.7', label: 'O que acontece DEPOIS que ele compra?', type: 'textarea' },
      { id: '11.8', label: 'Tem algum pós-venda?', type: 'radio',
        options: ['Sim, estruturado', 'Sem processo, mas faço algo', 'Não tenho'] },
      { id: '11.9', label: 'Os clientes INDICAM você?', type: 'radio',
        options: ['Frequentemente', 'Às vezes', 'Raramente'],
        conditionalFields: [
          { trigger: { values: ['Frequentemente', 'Às vezes'] },
            field: { id: '11.9_como', label: 'Como você incentiva?', type: 'text' } },
        ] },
      { id: '11.10', label: 'De cada 10 contatos novos, quantos FECHAM contigo?', type: 'text', placeholder: 'Ex: 3 de 10' },

      { id: '12.1', label: 'Quem VENDE na sua empresa?', type: 'radio',
        options: ['Eu mesmo', 'Equipe de vendas', 'Recepcionista/atendimento', 'Ninguém específico'],
        conditionalFields: [
          { trigger: { value: 'Equipe de vendas' },
            field: { id: '12.1_quantas', label: 'Quantas pessoas vendem?', type: 'text' } },
        ] },
      { id: '12.2', label: 'Tem um SCRIPT de vendas?', type: 'radio',
        options: ['Sim, documentado', 'Sim, mas só na cabeça', 'Cada um faz diferente', 'Não tenho'],
        agentNote: 'Sem script, a narrativa morre na hora do fechamento.' },
      { id: '12.3', label: 'Se um cliente NÃO RESPONDE, o que você faz?', type: 'radio',
        options: ['Faço follow-up sempre', 'Espero ele voltar', 'Desisto rápido', 'Tenho sequência automática', 'Nada'] },
      { id: '12.4', label: 'De cada 10 que AGENDAM uma conversa, quantos APARECEM?', type: 'text',
        agentNote: 'Acima de 30% no-show = urgência de confirmação automática.' },
      { id: '12.5', label: 'Após a compra, oferece MAIS alguma coisa? (upsell)', type: 'radio',
        options: ['Sim, sempre', 'Às vezes', 'Não'] },
      { id: '12.6', label: 'Você dá DESCONTO? Qual o critério?', type: 'textarea' },
      { id: '12.7', label: 'Formas de PAGAMENTO aceitas:', type: 'checkbox',
        options: ['Pix', 'Cartão de crédito', 'Débito', 'Boleto', 'Dinheiro', 'Parcelamento'] },
      { id: '12.8', label: 'Envia proposta formal ou fecha por mensagem?', type: 'radio',
        options: ['Proposta formal', 'Pelo WhatsApp', 'Depende do serviço'] },
      { id: '12.9', label: 'Quando um cliente SOME, você sabe POR QUÊ?', type: 'radio',
        options: ['Pergunto pra ele', 'Tenho ideia, mas não confirmo', 'Nunca perguntei'] },
      { id: '_extra_10', label: 'Tem algo sobre sua jornada/comercial que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 11 — DIA 14 — OBJETIVOS + ALINHAMENTO
     (Dia 13 = descanso. Etapa libera no dia 14.)
     18 perguntas (10 de objetivo + 8 de alinhamento).
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 11,
    day: 14,
    title: 'Objetivos e Alinhamento',
    description: 'Onde você quer chegar — e o que NÃO quer no caminho.',
    timeEstimate: '~7 min',
    insight: 'Saber o que NÃO fazer é tão importante quanto saber o que fazer.',
    questions: [
      { id: '13.1', label: 'Qual o principal OBJETIVO com marketing nos próximos meses?', type: 'checkbox',
        options: ['Mais clientes em geral', 'Vender um serviço específico', 'Aumentar ticket médio',
                  'Marca mais forte', 'Lançar produto novo', 'Expandir região', 'Fidelizar atuais'],
        hasOther: true },
      { id: '13.2', label: 'Faturamento que quer atingir em 6 e 12 meses?', type: 'composite',
        fields: [
          { id: '13.2_6m',  label: 'Em 6 meses', type: 'text', placeholder: 'R$ ___' },
          { id: '13.2_12m', label: 'Em 12 meses', type: 'text', placeholder: 'R$ ___' },
        ] },
      { id: '13.3', label: 'Quantos clientes/mês você considera "empresa saudável"?', type: 'text' },
      { id: '13.4', label: 'Onde você quer estar daqui a 3 e 5 ANOS? (negócio + estilo de vida)', type: 'textarea',
        agentNote: 'Estilo de vida define ambição da estratégia.' },
      { id: '13.5', label: 'O que você NÃO ABRE MÃO no seu negócio?', type: 'textarea',
        agentNote: 'Valores definem o tipo de tribo.' },
      { id: '13.6', label: 'Quanto pode investir em marketing por mês?', type: 'radio',
        options: ['Até R$ 1.000', 'R$ 1.000 a R$ 3.000', 'R$ 3.000 a R$ 5.000',
                  'R$ 5.000 a R$ 10.000', 'Mais de R$ 10.000'] },
      { id: '13.7', label: 'Em quanto tempo espera ver RESULTADO?', type: 'radio',
        options: ['30 dias', '60 dias', '90 dias', '6 meses', 'Entendo que é construção'] },
      { id: '13.8', label: 'Se orçamento não fosse problema, o que faria DIFERENTE no seu marketing?', type: 'textarea' },
      { id: '13.9', label: 'O que vai te fazer dizer "deu certo" no fim do projeto?', type: 'textarea' },
      { id: '13.10', label: 'Tem algum problema que se NÃO resolver em 30 dias vai custar caro?', type: 'textarea',
        agentNote: 'Urgência #1. Define o foco do primeiro mês.' },

      { id: '14.1', label: 'O que espera da Sigma nos primeiros 30 DIAS?', type: 'textarea' },
      { id: '14.2', label: 'Tem algo que você NÃO QUER que a gente faça?', type: 'textarea' },
      { id: '14.3', label: 'Quem é o ponto de contato e qual a autonomia dele?', type: 'composite',
        fields: [
          { id: '14.3_nome',     label: 'Nome', type: 'text' },
          { id: '14.3_contato',  label: 'WhatsApp/Email', type: 'text' },
          { id: '14.3_autonomia', label: 'Autonomia', type: 'text', placeholder: 'Decide sozinho / consulta sócio' },
        ] },
      { id: '14.4', label: 'Você consegue GRAVAR vídeos quando a gente pedir?', type: 'radio',
        options: ['Sim, sem problema', 'Depende do tipo', 'Difícil pra mim'] },
      { id: '14.5', label: 'Quanto TEMPO por semana pode dedicar ao marketing?', type: 'radio',
        options: ['Menos de 1h', '1 a 3h', '3 a 5h', 'Mais de 5h'] },
      { id: '14.6', label: 'Tem PARCERIAS com outros negócios?', type: 'textarea' },
      { id: '14.7', label: 'Já fez PESQUISA de satisfação com cliente?', type: 'radio',
        options: ['Regularmente', 'Uma vez', 'Nunca'] },
      { id: '14.8', label: 'Qual TAREFA, se sumisse, te daria +2h livres por dia?', type: 'textarea' },
      { id: '_extra_11', label: 'Tem algo sobre seus objetivos ou alinhamento que não foi perguntado?', type: 'textarea', required: false },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 12 — DIA 15 — FECHAMENTO
     4 perguntas. Curta. Conclusiva.
     A última pergunta prova ao cliente que o funil funcionou.
  ═══════════════════════════════════════════════════════════ */
  {
    stage: 12,
    day: 15,
    title: 'Fechamento',
    description: 'As últimas 4 perguntas. As mais importantes do briefing inteiro.',
    timeEstimate: '~3 min',
    insight: 'Se você percebeu algo novo, o briefing funcionou. Esse é o teste final.',
    questions: [
      { id: '15.1', label: 'O que cliente diz quando NÃO ESTÁ NA SUA SALA? (a marca real)', type: 'textarea',
        agentNote: 'A marca real, não a percebida pelo dono.' },
      { id: '15.2', label: 'Se pudesse parar UMA ação de marketing hoje, qual seria?', type: 'textarea' },
      { id: '15.3', label: 'Respondendo todo esse formulário, percebeu algo do seu negócio que NÃO via antes?', type: 'textarea',
        agentNote: 'PROVA que o funil funcionou. Vira gatilho de fechamento da venda da Sigma.' },
      { id: '15.4', label: 'Tem alguma coisa que NÃO foi perguntada e você sente que deveria ter sido?', type: 'textarea' },
      { id: '_extra_12', label: 'Quer deixar uma última observação para o time da Sigma?', type: 'textarea', required: false },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   DIAS DE DESCANSO — sem perguntas, só mensagem WhatsApp
   ───────────────────────────────────────────────────────────────────────────── */
export const REST_DAYS = {
  4:  'Tá indo muito bem. Suas respostas já mostram muita coisa. Amanhã: campo de batalha — concorrentes. Descansa hoje.',
  8:  'Metade. Você tá na frente de 99% dos empresários. Segunda metade: dados, números, vendas. Amanhã: história da sua marca. A etapa mais bonita. Prepara o coração.',
  13: 'Último respiro. Já olhou tudo com lupa. Amanhã e depois: objetivos e fechamento. Vamos terminar com força.',
};

/* ─────────────────────────────────────────────────────────────────────────────
   META — usados pelo backend e UI sem precisar contar à mão
   ───────────────────────────────────────────────────────────────────────────── */
export const TOTAL_STAGES = ONBOARDING_STAGES.length;          // 12 etapas reais
export const TOTAL_DAYS   = 15;                                // 15 dias contando descansos
export const REST_DAY_NUMBERS = [4, 8, 13];

/**
 * Conta o total de perguntas (excluindo os campos `_extra_*` opcionais).
 * Usado em UI para mostrar "X perguntas".
 */
export function countQuestions(stage) {
  if (!stage || !Array.isArray(stage.questions)) return 0;
  return stage.questions.filter(q => !q.id.startsWith('_extra_')).length;
}

/**
 * Retorna a próxima etapa após uma dada (pulando dias de descanso automaticamente).
 * Ex: stageNumber=3 → próxima=4 (que libera no dia 5, pulando o descanso do dia 4).
 */
export function getNextStage(stageNumber) {
  const idx = ONBOARDING_STAGES.findIndex(s => s.stage === stageNumber);
  if (idx < 0 || idx >= ONBOARDING_STAGES.length - 1) return null;
  return ONBOARDING_STAGES[idx + 1];
}
