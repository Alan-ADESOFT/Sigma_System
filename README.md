# SIGMA Marketing — Plataforma de Marketing Estrategico com IA

Sistema completo de marketing estrategico alimentado por agentes de IA. Gera diagnosticos, analises de concorrentes, perfis de publico, avatares e posicionamento de marca de forma automatizada.

---

## Arquitetura

```
Next.js (Pages Router) + PostgreSQL (Neon) + OpenAI/Anthropic APIs
```

| Camada | Tecnologia | Descricao |
|--------|-----------|-----------|
| Frontend | Next.js + CSS Modules | Dashboard dark theme (brandbook SIGMA) |
| Backend | Next.js API Routes | REST endpoints, SSE streaming |
| Banco | PostgreSQL (Neon) | Multi-tenant, schema em `infra/schema.sql` |
| IA | OpenAI + Anthropic | Roteamento automatico por model ID |
| Busca Web | OpenAI Responses API / Perplexity | Pesquisa com citations |
| WhatsApp | Z-API | Envio de links de formulario |

---

## Estrutura de Pastas

```
/
├── assets/
│   ├── data/                    # Dados estaticos (perguntas do form, frases fake)
│   └── style/                   # CSS Modules + globals.css
├── brandbook/                   # Design system documentado (tokens, motion, guidelines)
├── components/                  # Componentes React reutilizaveis
│   ├── DashboardLayout.js       # Layout principal com sidebar + notificacoes
│   ├── StageModal.js            # Editor de etapa (output + modificar com IA)
│   ├── PipelineModal.js         # Modal do pipeline (blur, fake typing, SSE)
│   └── FormWizard.js            # Formulario publico multi-step
├── context/
│   └── NotificationContext.js   # Sistema de toasts (clicavel, com acao)
├── infra/
│   ├── api/                     # Wrappers de APIs externas
│   │   ├── openai.js            # Chat Completions + Responses API (web search)
│   │   ├── anthropic.js         # Messages API
│   │   ├── perplexity.js        # Sonar models (busca alternativa)
│   │   ├── vision.js            # Analise de imagens via Vision API
│   │   ├── fileReader.js        # Extracao de texto de PDF/DOCX/TXT
│   │   ├── scraper.js           # Scraping de URLs
│   │   └── zapi.js              # WhatsApp via Z-API
│   ├── db.js                    # Pool PostgreSQL (query, queryOne)
│   ├── schema.sql               # DDL completo do banco
│   ├── get-tenant-id.js         # Resolucao de tenant por sessao
│   ├── pipelineEmitter.js       # EventEmitter para SSE do pipeline
│   ├── rateLimit.js             # Rate limiting por tenant/acao
│   └── constants.js             # Constantes do sistema
├── models/
│   ├── ia/
│   │   ├── completion.js        # Roteador OpenAI/Anthropic (weak/medium/strong)
│   │   ├── deepSearch.js        # Roteador de busca (OpenAI/Perplexity)
│   │   └── markdownHelper.js    # Instrucoes de formatacao para prompts
│   ├── agentes/
│   │   └── copycreator/
│   │       ├── prompts/         # Prompts de cada agente (7 arquivos)
│   │       ├── agentRunner.js   # Executor principal de agente
│   │       ├── orchestrator.js  # Orquestracao (search -> analysis)
│   │       └── pipelineConfig.js# Ordem, dependencias e KB de cada agente
│   ├── clientForm.js            # Tokens, rascunhos, submissoes do formulario
│   ├── marketing.model.js       # CRUD de etapas de marketing
│   └── ...                      # Outros models (account, content, settings)
└── pages/
    ├── api/
    │   ├── agentes/
    │   │   ├── pipeline/
    │   │   │   ├── run-all.js   # POST - Dispara pipeline completo
    │   │   │   └── status.js    # GET  - Status do pipeline
    │   │   ├── generate.js      # POST - Rodar agente individual
    │   │   ├── apply-modification.js # POST - Modificar output com IA
    │   │   ├── improve-text.js  # POST - Polir texto (acentos, gramatica)
    │   │   ├── format-output.js # POST - Auto-formatar markdown
    │   │   ├── stream-log.js    # GET  - SSE de eventos do pipeline
    │   │   └── test-search.js   # GET  - Teste de deepSearch
    │   ├── clients/[id]/
    │   │   ├── export.js        # GET  - Exportar DOCX/PDF
    │   │   ├── stages.js        # GET/POST - Etapas do cliente
    │   │   └── reset-database.js# POST - Apagar dados do cliente
    │   └── form/
    │       ├── submit.js        # POST - Submissao do formulario publico
    │       └── send-whatsapp.js # POST - Enviar link via WhatsApp
    ├── dashboard/
    │   ├── database.js          # Pagina principal — cards de clientes + pipeline
    │   ├── clients/             # Cadastro e detalhe de clientes
    │   └── ...                  # Outras paginas do dashboard
    └── form/[token].js          # Formulario publico (link unico por cliente)
```

---

## Pipeline de Agentes

O pipeline executa 7 agentes em sequencia para gerar a base estrategica completa de um cliente:

```
1. Agente 1  — Diagnostico do Negocio        (medium)   [texto]
2. Agente 2A — Pesquisa de Concorrentes       (medium)   [busca web]
3. Agente 2B — Analise de Concorrentes        (medium)   [texto]
4. Agente 3  — Publico-Alvo                   (medium)   [texto]
5. Agente 4A — Pesquisa de Avatar             (medium)   [busca web]
6. Agente 4B — Construcao do Avatar           (strong)   [texto]
7. Agente 5  — Posicionamento da Marca        (strong)   [texto]
```

### Fluxo de Dependencias

```
Agente 1 ─┬─> Agente 2A ─> Agente 2B ─┬─> Agente 3 ─┬─> Agente 4A ─> Agente 4B ─┬─> Agente 5
           │                            │              │                             │
           └── diagnostico              └── concorr.   └── publico-alvo             └── avatar
```

Cada agente recebe automaticamente os outputs dos agentes anteriores via Knowledge Base (KB).
As dependencias sao definidas em `models/agentes/copycreator/pipelineConfig.js`.

### Modelos de IA

| Nivel | Variavel de Ambiente | Uso |
|-------|---------------------|-----|
| weak | `AI_MODEL_WEAK` | Formatacao, improve-text, tarefas simples |
| medium | `AI_MODEL_MEDIUM` | Agentes 1-4A, modificacoes |
| strong | `AI_MODEL_STRONG` | Agentes 4B e 5 (mais estrategicos) |
| search | `AI_MODEL_SEARCH` | Web search (OpenAI Responses API) |

O roteamento OpenAI vs Anthropic e automatico — se o model ID contem "claude" vai para Anthropic, senao OpenAI.

---

## Formulario Publico

Cada cliente recebe um link unico (`/form/[token]`) para preencher o briefing:

1. Salva rascunho automaticamente (localStorage + servidor)
2. Ao submeter, marca `form_done = true` no cliente
3. Dispara o pipeline automaticamente se as condicoes forem atendidas
4. Envia notificacao interna ao operador

O link pode ser enviado via WhatsApp (Z-API) diretamente pelo dashboard.

---

## Rate Limiting

| Acao | Limite | Janela | Endpoint |
|------|--------|--------|----------|
| Pipeline | 5 execucoes | 30 minutos | `/api/agentes/pipeline/run-all` |
| Modificacao com IA | 50 chamadas | 24 horas | `/api/agentes/apply-modification` |

Implementado via tabela `rate_limit_log` no banco (`infra/rateLimit.js`).
Retorna HTTP 429 com mensagem descritiva e `retryAfter` em segundos.

---

## Export

O sistema exporta a base estrategica em dois formatos:

- **DOCX**: Documento profissional com capa SIGMA, sumario, secoes formatadas (via lib `docx`)
- **PDF (HTML)**: Pagina HTML estilizada com CSS de impressao e botao `window.print()`

Endpoint: `GET /api/clients/[id]/export?format=docx|pdf&onlyDone=true`

---

## Variaveis de Ambiente

```env
# Banco
DATABASE_URL="postgresql://..."

# Admin
ADMIN_EMAIL="email"

# URLs
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_BASE_URL="http://localhost:3000"

# IA
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
AI_MODEL_WEAK="gpt-4o-mini"
AI_MODEL_MEDIUM="gpt-4o"
AI_MODEL_STRONG="claude-opus-4-20250514"
AI_MODEL_SEARCH="gpt-4o-mini"

# Perplexity (opcional)
PERPLEXITY_API_KEY=""
PERPLEXITY_MODEL="sonar-pro"
AI_SEARCH_PROVIDER="openai"  # ou "perplexity"

# WhatsApp
ZAPI_INSTANCE="..."
ZAPI_TOKEN="..."
ZAPI_CLIENT_TOKEN="..."

# Seguranca
INTERNAL_API_TOKEN="..."
```

Veja `.env.example` para a lista completa.

---

## Notificacoes

1. **Toasts (frontend)** — via `useNotification()` do `NotificationContext`
   - Suporte a click (redirecionar), acao (botao no toast)
   - Duracoes por tipo: success=4s, error=6s, pipeline=8s

2. **Notificacoes internas (banco)** — tabela `system_notifications`
   - Tipos: `form_submitted`, `form_started`, `pipeline_done`, `token_expired`
   - Exibidas no dropdown de notificacoes do header

---

## Multi-tenancy

Todas as queries filtram por `tenant_id`. O tenant e resolvido automaticamente pela sessao do usuario via `infra/get-tenant-id.js`. Cada tenant tem seus proprios clientes, agentes e dados isolados.

---

## Comandos

```bash
npm install          # Instalar dependencias
npm run dev          # Rodar em desenvolvimento (porta 3000)
npm run build        # Build de producao
npm start            # Rodar build de producao
```

---

## Design System

O brandbook completo esta em `/brandbook/`:
- `01-foundations.md` — Cores, tipografia, espacamento, radius
- `02-components.md` — Glass cards, botoes, inputs, badges
- `03-guidelines.md` — Regras de uso e padroes de codigo
- `04-motion.md` — Animacoes, easings, efeitos especiais
- `05-ai-instructions.md` — Instrucoes para geracao de UI com IA

Tokens CSS em `:root` no `globals.css`. Nunca usar hex hard-coded nos componentes.
