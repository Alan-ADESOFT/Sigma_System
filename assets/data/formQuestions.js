/**
 * assets/data/formQuestions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Perguntas EXATAS do briefing SIGMA, organizadas por etapa.
 * Fonte: assets/form/formperguntas.txt
 *
 * Tipos de campo:
 *   text      — input de texto simples
 *   textarea  — campo multilinha
 *   select    — dropdown
 *   radio     — seleção única com opções visuais
 *   checkbox  — seleção múltipla
 *   number    — input numérico
 *   composite — múltiplos subcampos agrupados
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const FORM_STEPS = [

  /* ═══════════════════════════════════════════════════════════
     ETAPA 1 — SUA EMPRESA
  ═══════════════════════════════════════════════════════════ */
  {
    step: 1,
    title: 'Sua Empresa',
    description: 'Informações básicas sobre o seu negócio. O alicerce de tudo.',
    timeEstimate: '~3 minutos',
    questions: [
      {
        id: '1.1',
        label: 'Qual o nome da sua empresa?',
        type: 'text',
        placeholder: '',
        required: true,
      },
      {
        id: '1.2',
        label: 'Qual o seu segmento/nicho de atuação?',
        type: 'text',
        placeholder: 'Ex: odontologia, advocacia, estética, construção civil, alimentação...',
        required: true,
      },
      {
        id: '1.3',
        label: 'Há quanto tempo sua empresa existe?',
        type: 'radio',
        options: ['Menos de 1 ano', '1 a 3 anos', '3 a 5 anos', '5 a 10 anos', 'Mais de 10 anos'],
        required: false,
      },
      {
        id: '1.4',
        label: 'Qual a cidade e estado onde você atua?',
        type: 'text',
        placeholder: '',
        required: true,
      },
      {
        id: '1.5',
        label: 'Você atende presencialmente, online ou os dois?',
        type: 'radio',
        options: ['Presencialmente', 'Online', 'Os dois'],
        required: false,
      },
      {
        id: '1.6',
        label: 'Quantas pessoas trabalham na empresa?',
        type: 'radio',
        options: ['Só eu', '2 a 5', '6 a 15', '16 a 50', 'Mais de 50'],
        required: false,
      },
      {
        id: '1.7',
        label: 'Sua empresa tem CNPJ formalizado?',
        type: 'radio',
        options: ['Sim', 'Não', 'Em processo'],
        required: false,
      },
      {
        id: '1.8',
        label: 'Qual o faturamento médio mensal?',
        type: 'select',
        hint: 'Confidencial — para dimensionar estratégia',
        options: [
          'Até R$ 5.000',
          'R$ 5.000 a R$ 15.000',
          'R$ 15.000 a R$ 30.000',
          'R$ 30.000 a R$ 60.000',
          'R$ 60.000 a R$ 100.000',
          'Acima de R$ 100.000',
        ],
        required: false,
      },
      {
        id: '1.9',
        label: 'Qual o seu ticket médio?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '1.10',
        label: 'Quantos clientes você atende por mês?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '1.11',
        label: 'Seu negócio tem sazonalidade? Quais os meses fortes e fracos?',
        type: 'textarea',
        placeholder: 'Ex: "Dezembro vende o dobro, janeiro é parado."',
        required: false,
      },
      {
        id: '1.12',
        label: 'Quais ferramentas você usa no dia a dia?',
        type: 'checkbox',
        options: [
          'WhatsApp Business',
          'Planilhas (Excel / Google Sheets)',
          'CRM',
          'ERP / sistema de gestão',
          'Agenda online',
          'Nenhuma',
        ],
        hasOther: true,
        conditionalFields: [
          {
            trigger: { option: 'CRM' },
            field: {
              id: '1.12_crm',
              label: 'Qual CRM você usa?',
              type: 'text',
              placeholder: 'Qual CRM você usa?',
            },
          },
        ],
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 2 — PRODUTOS E SERVIÇOS
  ═══════════════════════════════════════════════════════════ */
  {
    step: 2,
    title: 'Produtos e Serviços',
    description: 'O que você vende, como vende e o que dá mais resultado.',
    timeEstimate: '~4 minutos',
    questions: [
      {
        id: '2.1',
        label: 'Liste todos os seus produtos/serviços.',
        type: 'textarea',
        placeholder: '',
        required: true,
      },
      {
        id: '2.2',
        label: 'Qual é o que mais vende hoje?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.3',
        label: 'Qual dá mais lucro?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.4',
        label: 'Qual está crescendo mais rápido?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.5',
        label: 'Qual vende bem de forma estável?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.6',
        label: 'Tem algum que você pensa em parar de oferecer?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.7',
        label: '% aproximado do faturamento por produto/serviço?',
        type: 'textarea',
        placeholder: 'Ex: "Limpeza de pele = 40%, Botox = 30%, Outros = 30%"',
        required: false,
      },
      {
        id: '2.8',
        label: 'Qual você gostaria de vender mais mas não consegue?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.9',
        label: 'Tem algum produto que o cliente nem sabe que existe?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.10',
        label: 'Como funciona o processo de compra?',
        type: 'textarea',
        placeholder: 'Ex: chega e compra na hora? Precisa de orçamento? Reunião?',
        required: false,
      },
      {
        id: '2.11',
        label: 'Descreva passo a passo sua entrega:',
        type: 'textarea',
        placeholder: 'Ex: "Cliente agenda → Avaliação → Executo → Acompanho por 7 dias"',
        required: false,
      },
      {
        id: '2.12',
        label: 'Qual etapa consome mais tempo ou gera mais custo?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.13',
        label: 'Qual etapa o cliente mais valoriza?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.14',
        label: 'Tem algum serviço que quer lançar?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.15',
        label: 'Você depende de fornecedores essenciais?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '2.16',
        label: 'Se esse fornecedor sumir, qual o impacto?',
        type: 'radio',
        options: [
          'Grave — meu negócio para',
          'Alto — teria grande dificuldade',
          'Médio — levaria tempo pra trocar',
          'Baixo — tenho alternativas fáceis',
        ],
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 3 — SEU CLIENTE
  ═══════════════════════════════════════════════════════════ */
  {
    step: 3,
    title: 'Seu Cliente',
    description: 'Quem realmente compra — e quem você deveria atrair.',
    timeEstimate: '~5 minutos',
    questions: [
      {
        id: '3.1',
        label: 'Quem é o seu cliente típico hoje?',
        type: 'textarea',
        hint: 'Descreva como uma pessoa real. Idade, sexo, profissão, estilo de vida.',
        placeholder: '',
        required: true,
      },
      {
        id: '3.2',
        label: 'Qual a faixa de renda?',
        type: 'select',
        options: [
          'Classe C (até R$ 4.000)',
          'Classe B (R$ 4.000 a R$ 12.000)',
          'Classe A (acima de R$ 12.000)',
          'Misto',
        ],
        required: false,
      },
      {
        id: '3.3',
        label: 'Seu cliente é pessoa física ou jurídica?',
        type: 'radio',
        options: ['Pessoa física (B2C)', 'Pessoa jurídica (B2B)', 'Os dois'],
        required: false,
      },
      {
        id: '3.4',
        label: 'Como o cliente chega até você?',
        type: 'checkbox',
        options: [
          'Indicação',
          'Instagram',
          'Google',
          'Passa na frente / localização',
          'Anúncios pagos',
          'WhatsApp',
          'Parcerias',
        ],
        hasOther: true,
        required: false,
      },
      {
        id: '3.5',
        label: 'O que ele realmente quer resolver na vida ou no negócio dele?',
        type: 'textarea',
        hint: 'Vá além do produto. Pense no resultado final que ele deseja.',
        placeholder: '',
        required: false,
      },
      {
        id: '3.6',
        label: 'Como ele se sente antes de te contratar? E depois?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '3.7',
        label: 'Contratar você muda como ele é visto pelos outros?',
        type: 'radio',
        options: ['Sim, muito', 'Um pouco', 'Não faz diferença'],
        required: false,
      },
      {
        id: '3.8',
        label: 'Antes de te contratar, o que ele fazia para resolver o problema?',
        type: 'radio',
        options: [
          'Fazia sozinho',
          'Usava outro fornecedor',
          'Não fazia nada',
          'Usava solução alternativa',
        ],
        hasOther: true,
        required: false,
      },
      {
        id: '3.9',
        label: 'Qual o momento exato que faz ele pensar "preciso resolver isso AGORA"?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '3.10',
        label: 'O que faz ele fechar com você e não com o concorrente?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '3.11',
        label: 'O que faz um cliente NÃO fechar?',
        type: 'checkbox',
        options: [
          'Preço',
          'Desconfiança',
          'Não entendeu o serviço',
          'Preferiu concorrente',
          'Localização',
        ],
        hasOther: true,
        required: false,
      },
      {
        id: '3.12',
        label: 'Você tem clientes que voltam?',
        type: 'radio',
        options: [
          'Maioria volta com frequência',
          'Alguns voltam eventualmente',
          'Quase ninguém volta',
          'Serviço pontual, sem recorrência',
        ],
        required: false,
      },
      {
        id: '3.13',
        label: 'Como seria o seu cliente perfeito?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '3.14',
        label: 'Quem você NÃO quer como cliente?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 4 — MERCADO E CONCORRÊNCIA
  ═══════════════════════════════════════════════════════════ */
  {
    step: 4,
    title: 'Mercado e Concorrência',
    description: 'O campo de batalha.',
    timeEstimate: '~5 minutos',
    questions: [
      {
        id: '4.1',
        label: 'Cite de 2 a 5 concorrentes diretos.',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.2',
        label: 'O que eles fazem bem?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.3',
        label: 'Onde eles falham?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.4',
        label: 'Como é o marketing deles?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.5',
        label: 'Qual tem o melhor conteúdo online? O que ele faz de diferente?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.6',
        label: 'Eles oferecem alguma experiência que você não oferece?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.7',
        label: 'Tem algum que você admira ou considera referência? Por quê?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.8',
        label: 'Como seu preço se compara ao deles?',
        type: 'radio',
        options: [
          'Mais barato que a maioria',
          'Na média do mercado',
          'Mais caro que a maioria',
        ],
        required: false,
      },
      {
        id: '4.9',
        label: 'Quais disputam o mesmo tipo de cliente? Quais atendem público diferente?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.10',
        label: 'Tem concorrente indireto?',
        type: 'textarea',
        placeholder: 'Ex: "Sou personal trainer, meu concorrente indireto é o app."',
        required: false,
      },
      {
        id: '4.11',
        label: 'Tem alguma marca de fora que você gostaria de se parecer em posicionamento?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.12',
        label: 'Seus clientes poderiam resolver o problema sem contratar ninguém?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '4.13',
        label: 'Quando um novo concorrente aparece, o que acontece?',
        type: 'radio',
        options: [
          'Sinto impacto e perco clientes',
          'Percebo mas não muda muito',
          'Nem faz diferença',
        ],
        required: false,
      },
      {
        id: '4.14',
        label: 'Quão fácil é para uma nova empresa oferecer o mesmo que você?',
        type: 'radio',
        options: [
          'Muito fácil — qualquer um entra',
          'Médio — precisa de investimento',
          'Difícil — tem barreiras fortes',
        ],
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 5 — CONTEXTO EXTERNO
  ═══════════════════════════════════════════════════════════ */
  {
    step: 5,
    title: 'Contexto Externo',
    description: 'As forças externas que afetam o seu negócio.',
    timeEstimate: '~3 minutos',
    questions: [
      {
        id: '5.1',
        label: 'Existe alguma lei ou regulamentação que afeta seu negócio?',
        type: 'radio',
        options: ['Sim', 'Não sei', 'Não se aplica'],
        conditionalFields: [
          {
            trigger: { value: 'Sim' },
            field: {
              id: '5.1_qual',
              label: 'Qual?',
              type: 'text',
              placeholder: 'Descreva a lei ou regulamentação',
            },
          },
        ],
        required: false,
      },
      {
        id: '5.2',
        label: 'Alguma política pública ou mudança de governo impacta seu setor?',
        type: 'radio',
        options: ['Sim, positivamente', 'Sim, negativamente', 'Não percebo impacto'],
        conditionalFields: [
          {
            trigger: { value: 'Sim, positivamente' },
            field: {
              id: '5.2_qual_pos',
              label: 'Qual?',
              type: 'text',
              placeholder: 'Descreva o impacto positivo',
            },
          },
          {
            trigger: { value: 'Sim, negativamente' },
            field: {
              id: '5.2_qual_neg',
              label: 'Qual?',
              type: 'text',
              placeholder: 'Descreva o impacto negativo',
            },
          },
        ],
        required: false,
      },
      {
        id: '5.3',
        label: 'A situação econômica está afetando suas vendas?',
        type: 'radio',
        options: [
          'Sim, vendas caíram',
          'Sim, clientes mais resistentes',
          'Não percebo diferença',
          'Estou vendendo mais',
        ],
        required: false,
      },
      {
        id: '5.4',
        label: 'Alguma nova tecnologia está mudando seu mercado?',
        type: 'radio',
        options: ['Sim', 'Ainda não, mas vejo vindo', 'Não percebo mudanças'],
        conditionalFields: [
          {
            trigger: { value: 'Sim' },
            field: {
              id: '5.4_qual',
              label: 'Qual?',
              type: 'text',
              placeholder: 'Descreva a tecnologia',
            },
          },
        ],
        required: false,
      },
      {
        id: '5.5',
        label: 'Questões ambientais ou de sustentabilidade afetam seu negócio?',
        type: 'radio',
        options: ['Sim, muito relevante', 'Um pouco', 'Não faz diferença'],
        required: false,
      },
      {
        id: '5.6',
        label: 'Você percebe mudanças de comportamento que afetam a demanda pelo que vende?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 6 — FORÇAS E DIFERENCIAIS
  ═══════════════════════════════════════════════════════════ */
  {
    step: 6,
    title: 'Forças e Diferenciais',
    description: 'O que te faz forte e onde está o diferencial real.',
    timeEstimate: '~5 minutos',
    questions: [
      {
        id: '6.1',
        label: 'Quais são seus 3 maiores pontos fortes?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.2',
        label: 'Quais são seus 3 maiores pontos fracos?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.3',
        label: 'O que o cliente mais elogia?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.4',
        label: 'O que o cliente mais reclama?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.5',
        label: 'Você tem algum método ou processo que é só seu?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.6',
        label: 'Outros concorrentes oferecem esse diferencial?',
        type: 'radio',
        options: ['Só eu tenho', 'Alguns têm algo parecido', 'É comum no mercado'],
        required: false,
      },
      {
        id: '6.7',
        label: '"Por que eu deveria te escolher e não o concorrente?"',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.8',
        label: 'Você tem algo difícil de copiar?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.9',
        label: 'Você tem processos que garantem qualidade sem você presente?',
        type: 'radio',
        options: [
          'Sim, tudo documentado',
          'Parcialmente',
          'Não — se eu paro, a qualidade cai',
        ],
        required: false,
      },
      {
        id: '6.10',
        label: 'Sua equipe está preparada pra entregar o diferencial prometido?',
        type: 'radio',
        options: ['Sim, totalmente', 'Mais ou menos', 'Preciso melhorar', 'Não tenho equipe'],
        required: false,
      },
      {
        id: '6.11',
        label: 'Tem algo que todo mundo faz no seu mercado mas que o cliente nem valoriza?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.12',
        label: 'Tem algo que você oferece demais e poderia simplificar?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.13',
        label: 'O que você gostaria de elevar muito acima do mercado?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.14',
        label: 'Que serviço ninguém oferece mas seus clientes adorariam ter?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.15',
        label: 'Tem alguma tendência que você ainda não está aproveitando?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '6.16',
        label: 'Tem algum público ou região que você não atende mas vê potencial?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 7 — PROVAS E AUTORIDADE
  ═══════════════════════════════════════════════════════════ */
  {
    step: 7,
    title: 'Provas e Autoridade',
    description: 'Munição de autoridade.',
    timeEstimate: '~3 minutos',
    questions: [
      {
        id: '7.1',
        label: 'Quantos clientes você já atendeu?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '7.2',
        label: 'Você tem depoimentos de clientes?',
        type: 'radio',
        options: ['Sim, vários', 'Alguns', 'Não tenho'],
        conditionalFields: [
          {
            trigger: { values: ['Sim, vários', 'Alguns'] },
            field: {
              id: '7.2_onde',
              label: 'Onde estão?',
              type: 'text',
              placeholder: 'Ex: Google, Instagram, WhatsApp...',
            },
          },
        ],
        required: false,
      },
      {
        id: '7.3',
        label: 'Tem algum caso de sucesso marcante?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '7.4',
        label: 'Já foi mencionado em alguma mídia?',
        type: 'radio',
        options: ['Sim', 'Não'],
        conditionalFields: [
          {
            trigger: { value: 'Sim' },
            field: {
              id: '7.4_qual',
              label: 'Qual?',
              type: 'text',
              placeholder: 'Descreva a mídia',
            },
          },
        ],
        required: false,
      },
      {
        id: '7.5',
        label: 'Tem certificação ou prêmio relevante?',
        type: 'radio',
        options: ['Sim', 'Não'],
        conditionalFields: [
          {
            trigger: { value: 'Sim' },
            field: {
              id: '7.5_qual',
              label: 'Qual?',
              type: 'text',
              placeholder: 'Descreva a certificação ou prêmio',
            },
          },
        ],
        required: false,
      },
      {
        id: '7.6',
        label: 'Já deu aula, palestra ou treinamento?',
        type: 'radio',
        options: ['Sim, regularmente', 'Já fiz algumas vezes', 'Nunca'],
        required: false,
      },
      {
        id: '7.7',
        label: 'Há quanto tempo você trabalha pessoalmente nesse mercado?',
        type: 'text',
        placeholder: '',
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 8 — MARKETING ATUAL
  ═══════════════════════════════════════════════════════════ */
  {
    step: 8,
    title: 'Marketing Atual',
    description: 'O que já foi tentado, o que funcionou e o que não funcionou.',
    timeEstimate: '~4 minutos',
    questions: [
      {
        id: '8.1',
        label: 'Você já investiu em marketing?',
        type: 'checkbox',
        options: [
          'Instagram orgânico',
          'Tráfego pago (Meta / Google Ads)',
          'Site ou landing page',
          'E-mail marketing',
          'Mídia offline',
          'Influenciadores',
          'Parcerias',
          'Nenhum',
        ],
        hasOther: true,
        required: false,
      },
      {
        id: '8.2',
        label: 'O que funcionou melhor para trazer clientes?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '8.3',
        label: 'O que você tentou e NÃO funcionou?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '8.4',
        label: 'Você já trabalhou com outra agência?',
        type: 'radio',
        options: ['Sim', 'Não'],
        conditionalFields: [
          {
            trigger: { value: 'Sim' },
            field: {
              id: '8.4_porque',
              label: 'Por que parou?',
              type: 'text',
              placeholder: 'O que motivou a mudança?',
            },
          },
        ],
        required: false,
      },
      {
        id: '8.5',
        label: 'Você tem perfil no Instagram?',
        type: 'text',
        placeholder: '@',
        required: false,
      },
      {
        id: '8.6',
        label: 'Quantos seguidores você tem hoje?',
        type: 'select',
        options: [
          'Menos de 1.000',
          '1.000 a 5.000',
          '5.000 a 10.000',
          '10.000 a 50.000',
          'Mais de 50.000',
        ],
        required: false,
      },
      {
        id: '8.7',
        label: 'Seu Instagram gera vendas?',
        type: 'radio',
        options: [
          'Gera vendas diretas',
          'Traz contatos mas poucos fecham',
          'É só vitrine — não converte',
        ],
        required: false,
      },
      {
        id: '8.8',
        label: 'Você já investiu em tráfego pago?',
        type: 'radio',
        options: [
          'Nunca investi',
          'Até R$ 500/mês',
          'R$ 500 a R$ 2.000/mês',
          'R$ 2.000 a R$ 5.000/mês',
          'Mais de R$ 5.000/mês',
        ],
        required: false,
      },
      {
        id: '8.9',
        label: 'Você tem site?',
        type: 'text',
        placeholder: 'URL do site',
        required: false,
      },
      {
        id: '8.10',
        label: 'Você tem lista de contatos? Aproximadamente quantos?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '8.11',
        label: 'Se sua marca fosse uma pessoa, qual seria a personalidade? (3 palavras)',
        type: 'text',
        placeholder: 'Ex: "Séria, confiável, elegante"',
        required: false,
      },
      {
        id: '8.12',
        label: 'Sua identidade visual transmite a mensagem que você quer passar?',
        type: 'radio',
        options: [
          'Sim, totalmente',
          'Mais ou menos — preciso ajustar',
          'Não — preciso refazer',
        ],
        required: false,
      },
      {
        id: '8.13',
        label: 'De 0 a 10, quão satisfeito você está com seu marketing hoje?',
        type: 'number',
        placeholder: '0 a 10',
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 9 — JORNADA DO CLIENTE
  ═══════════════════════════════════════════════════════════ */
  {
    step: 9,
    title: 'Jornada do Cliente',
    description: 'Onde o dinheiro está vazando.',
    timeEstimate: '~4 minutos',
    questions: [
      {
        id: '9.1',
        label: 'Descreva o caminho do cliente: do momento que descobre o problema até a compra. Passo a passo.',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '9.2',
        label: 'Quanto tempo ele leva pra decidir?',
        type: 'radio',
        options: ['No mesmo dia', '1 a 3 dias', '1 a 2 semanas', 'Mais de 2 semanas'],
        required: false,
      },
      {
        id: '9.3',
        label: 'O cliente pesquisa antes de comprar?',
        type: 'checkbox',
        options: [
          'Google',
          'Instagram',
          'Pergunta pra amigos',
          'Compara preços',
          'Lê avaliações online',
          'Não pesquisa',
        ],
        hasOther: true,
        required: false,
      },
      {
        id: '9.4',
        label: 'Com quantos concorrentes ele te compara antes de decidir?',
        type: 'radio',
        options: [
          'Nenhum — vem por indicação',
          '1 a 2',
          '3 ou mais',
          'Não sei',
        ],
        required: false,
      },
      {
        id: '9.5',
        label: 'Quais as principais objeções antes de comprar?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '9.6',
        label: 'Qual o principal ponto de contato?',
        type: 'radio',
        options: [
          'WhatsApp',
          'Telefone',
          'DM do Instagram',
          'Loja física',
          'Site',
        ],
        hasOther: true,
        required: false,
      },
      {
        id: '9.7',
        label: 'Em qual momento você perde mais clientes?',
        type: 'radio',
        options: [
          'Na hora do preço / orçamento',
          'No follow-up',
          'Depois da primeira compra',
          'Não sei',
        ],
        hasOther: true,
        required: false,
      },
      {
        id: '9.8',
        label: 'O que acontece depois que o cliente compra?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '9.9',
        label: 'Você tem processo de pós-venda?',
        type: 'radio',
        options: [
          'Sim, estruturado',
          'Faço algumas coisas sem processo',
          'Não tenho',
        ],
        required: false,
      },
      {
        id: '9.10',
        label: 'Seus clientes te indicam?',
        type: 'radio',
        options: ['Sim, frequentemente', 'Às vezes', 'Raramente'],
        conditionalFields: [
          {
            trigger: { values: ['Sim, frequentemente', 'Às vezes', 'Raramente'] },
            field: {
              id: '9.10_incentiva',
              label: 'Você incentiva indicações?',
              type: 'text',
              placeholder: 'Como?',
            },
          },
        ],
        required: false,
      },
      {
        id: '9.11',
        label: 'De cada 10 contatos, quantos fecham?',
        type: 'text',
        placeholder: '',
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 10 — OBJETIVOS E METAS
  ═══════════════════════════════════════════════════════════ */
  {
    step: 10,
    title: 'Objetivos e Metas',
    description: 'Sem destino claro, qualquer caminho serve.',
    timeEstimate: '~3 minutos',
    questions: [
      {
        id: '10.1',
        label: 'Qual o seu principal objetivo com o marketing agora?',
        type: 'checkbox',
        options: [
          'Atrair mais clientes',
          'Vender um serviço específico',
          'Aumentar o ticket médio',
          'Fortalecer a marca',
          'Lançar algo novo',
          'Expandir para outra região',
          'Fidelizar clientes atuais',
        ],
        hasOther: true,
        required: true,
      },
      {
        id: '10.2',
        label: 'Qual faturamento quer atingir em 6 meses?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '10.3',
        label: 'E em 12 meses?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '10.4',
        label: 'Qual número de clientes/mês deixa sua empresa saudável?',
        type: 'text',
        placeholder: '',
        required: false,
      },
      {
        id: '10.5',
        label: 'Você tem planos de expandir?',
        type: 'radio',
        options: ['Sim', 'Talvez no futuro', 'Não por enquanto'],
        conditionalFields: [
          {
            trigger: { value: 'Sim' },
            field: {
              id: '10.5_oque',
              label: 'O quê?',
              type: 'text',
              placeholder: 'Descreva o plano de expansão',
            },
          },
        ],
        required: false,
      },
      {
        id: '10.6',
        label: 'Se orçamento não fosse problema, qual seria a primeira coisa que você faria?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '10.7',
        label: 'O que precisa acontecer para você considerar esse projeto um sucesso?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════
     ETAPA 11 — ALINHAMENTO
  ═══════════════════════════════════════════════════════════ */
  {
    step: 11,
    title: 'Alinhamento',
    description: 'Garantindo que estamos jogando o mesmo jogo.',
    timeEstimate: '~3 minutos',
    questions: [
      {
        id: '11.1',
        label: 'O que você espera da Sigma nos primeiros 30 dias?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '11.2',
        label: 'Existe algo que você NÃO quer que a gente faça?',
        type: 'textarea',
        placeholder: 'Ex: "Não quero fazer dancinha"',
        required: false,
      },
      {
        id: '11.3',
        label: 'Quem vai ser o ponto de contato?',
        type: 'composite',
        fields: [
          {
            id: '11.3_nome',
            label: 'Nome',
            type: 'text',
            placeholder: 'Nome do responsável',
          },
          {
            id: '11.3_contato',
            label: 'Contato',
            type: 'text',
            placeholder: 'Telefone ou e-mail',
          },
        ],
        required: true,
      },
      {
        id: '11.4',
        label: 'Esse ponto de contato tem autonomia pra aprovar conteúdos?',
        type: 'radio',
        options: ['Sim, total', 'Parcial', 'Não — precisa de aprovação'],
        required: false,
      },
      {
        id: '11.5',
        label: 'Você consegue gravar conteúdos se a estratégia pedir?',
        type: 'radio',
        options: ['Sim, sem problema', 'Depende da frequência', 'Difícil — rotina muito corrida'],
        required: false,
      },
      {
        id: '11.6',
        label: 'Quanto tempo por semana você pode dedicar ao marketing?',
        type: 'radio',
        options: ['Menos de 1 hora', '1 a 3 horas', '3 a 5 horas', 'Mais de 5 horas'],
        required: false,
      },
      {
        id: '11.7',
        label: 'O que seu cliente diz sobre você quando você NÃO está na sala?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '11.8',
        label: 'Se você tivesse que parar UMA ação de marketing amanhã, qual seria?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
      {
        id: '11.9',
        label: 'Tem algo importante que não foi perguntado aqui?',
        type: 'textarea',
        placeholder: '',
        required: false,
      },
    ],
  },
];

/* Total de perguntas para cálculo de completion_pct */
export const TOTAL_QUESTIONS = 125;
