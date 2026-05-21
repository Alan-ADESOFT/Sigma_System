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
   - Coluna `user_id` (NULLABLE):
     - `user_id = NULL` → **broadcast** (todo time vê)
     - `user_id = $X`   → **pessoal** (só $X vê no sininho)
   - O sininho filtra `WHERE (user_id = $userId OR user_id IS NULL)`.
   - Helpers em `models/clientForm.js`:
     - `createNotification(tenantId, type, title, message, clientId, metadata, userId?)` — `userId` opcional. Sem ele = broadcast.
     - `createUserNotification(userId, tenantId, ...)` — atalho explícito quando a intenção é pessoal (força `userId` obrigatório).
   - Regra de bolso: notificação RESULTADO DE AÇÃO DO USER ou ENDEREÇADA A UM USER → pessoal. Evento do sistema relevante pra todo time → broadcast.

---

## 🏢 Arquitetura de Dados — Single Workspace

O Sigma é uma plataforma **single-workspace**. Isso significa:

- Existe **UM** `WORKSPACE_TENANT_ID` no `.env`, único pro time inteiro.
- A tabela `tenants` armazena **usuários** (não workspaces). Cada linha é uma pessoa que faz login.
- `resolveTenantId(req)` retorna SEMPRE o mesmo ID, independente de quem fez login.
- **`tenant_id` NÃO isola dados entre usuários.** Quem isola pessoa é `user_id` / `assigned_to` / `created_by` em colunas próprias.

### O que é COMPARTILHADO (todo time vê e edita)

Por padrão, **tudo** no Sigma é compartilhado. Qualquer pessoa do time pode ver, criar, editar e remover. Isso inclui (não exaustivo):

- **Clientes** (`marketing_clients`), contratos, parcelas, ficha completa
- **Financeiro** — receitas, despesas, categorias, parcelas, configs do bot de cobrança
- **Forms / Onboarding** — templates de mensagens, vídeo de boas-vindas, jornada de 15 dias, respostas dos clientes, configs de etapas, mensagens dos dias de descanso
- **Suporte / Tutoriais** — módulos, aulas, vídeos, anexos
- **Configurações do sistema** — settings (tabela `settings` key/value), templates do Jarvis, prompt library, modelos de IA selecionados
- **Brand books, Copy Generator, Image Generator, Ads, Social Media, Content Plan, Pipeline de Agentes**
- **Categorias de tasks, recorrências de tasks, task templates** (a CONFIG é compartilhada; só a TASK em si é pessoal — ver abaixo)
- **Indicações, base de dados, leads comerciais, pipeline comercial**

### O que é PESSOAL (cada user vê só o que é dele)

Apenas três áreas têm isolamento por usuário. Em todas, **além** do `tenant_id` padrão, é obrigatório filtrar por usuário:

| Domínio | Tabela(s) | Filtro pessoal |
|---|---|---|
| **Tasks individuais** | `client_tasks` | `WHERE assigned_to = $userId OR created_by = $userId` — toggle "Time" libera tudo |
| **Chat / interações Jarvis** | `jarvis_usage_log` | `WHERE user_id = $userId` |
| **Notificações (sininho)** | `system_notifications` | `WHERE (user_id = $userId OR user_id IS NULL)` |

**Preferências de UI** (ex: `user_task_preferences`) também são por usuário — `WHERE user_id = $userId`.

### Regra prática pra novas features

Antes de criar qualquer tabela ou endpoint, perguntar: **"Faz sentido o Alan ver o que o Brenno fez?"**

- **Sim, faz sentido** → compartilhado. Só `tenant_id` padrão, sem filtro adicional.
- **Não, é privado** → pessoal. Precisa de coluna `user_id` (ou equivalente) E filtro em todas as queries.

Quando em dúvida → **compartilhado por padrão**. É uma agência.

### Permissões (role-based) ≠ Isolamento de dados

Algumas áreas têm **gates de edição** baseados em `role` (`user` / `admin` / `god`). Isso controla quem pode editar, **não** quem vê. Exemplos:

- Suporte/Tutoriais: todo time vê; só admin/god cria/edita.
- Settings do sistema: todo time pode ver os efeitos; só god edita.
- Pipeline comercial: configurável por role.

`user.role` controla **permissão**. `user.id` controla **propriedade** quando aplicável. São coisas diferentes.

### Quando usar `resolveTenantId(req)`

Sempre. Em **todo** endpoint autenticado — mas isso não é "multi-tenancy", é apenas o jeito padrão de descobrir o workspace ID pra usar nas queries (que sempre filtram `WHERE tenant_id = $X` por consistência com o schema). **Não confundir com isolamento por usuário.**

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

---

## Gerador de Imagem

Modulo de geracao de imagens com brandbook por cliente. **Sprint v1.2 (abril 2026):**
o usuario nao escolhe mais o modelo nem o tipo de cada referencia. O sistema decide
automaticamente.

### Lineup de modelos (abril 2026)

Apenas 3 modelos no lineup ativo (autoMode escolhe):

- **Nano Banana 2** (`gemini-3.1-flash-image-preview`, Google Gemini) —
  multi-imagem nativo (ate 14 refs), versatil, default da maioria dos casos.
- **GPT Image 2** (`gpt-image-2`, OpenAI) — lider em tipografia + edicao
  pontual com alta fidelidade. **Probe runtime no boot** do worker testa
  disponibilidade na org; se 404, fallback automatico silencioso pra
  `gpt-image-1.5` -> `gpt-image-1`. Resultado cacheado em
  `image_settings.openai_image_model_resolved`.
- **Flux Kontext Pro** (`fal-ai/flux-pro/kontext`, fal.ai) — especialista em
  preservar pessoa exata da referencia.

Modelos legados (Imagen 3/4, GPT Image 1, etc) seguem suportados em
`infra/api/imageProviders/` para que jobs antigos no historico continuem
abrindo, mas nao aparecem mais no toggle das settings.

### Modo automatico

Em `models/agentes/imagecreator/autoMode.js`. Sem chamada de LLM extra
(determinístico). Usa o output do `refClassifier` (Vision API classifica cada
ref subida em character/scene/inspiration + hasFace/isProduct):

| Condicao                                    | Modelo escolhido     |
|---------------------------------------------|----------------------|
| char + face + edit pontual (regex)          | gpt-image-2          |
| char + face (nova geracao)                  | flux-pro/kontext     |
| 3+ refs OU char+scene                       | nano-banana-2        |
| logo / poster / banner / tipografia (regex) | gpt-image-2          |
| default                                     | nano-banana-2        |

### Atalhos de teclado

- **Cmd/Ctrl+K** (workspace) — abre modal "Geracao livre".
- **Cmd/Ctrl+Enter** (textarea de descricao) — dispara geracao.
- **Cmd/Ctrl+E** (detail modal) — foca textarea de edicao inline.
- **Cmd/Ctrl+Shift+A** (qualquer lugar do modulo) — toggle "modo avancado"
  (mostra ModelSelector e seletor manual de modo por ref). Persistido em
  `localStorage('image:advanced')`. Nao documentado em UI — para debug.
- **Esc** — fecha o modal/menu de contexto aberto.
- **Setas <- ->** — navega entre thumbs no workspace e versoes no detail.
- **Botao direito numa thumb** — menu de contexto custom (Editar IA,
  Variacao, Download, Salvar template, Apagar).

### Configuracao

1. Configure as chaves em `/dashboard/settings/image` (todas criptografadas AES-256-GCM).
2. Crie um brandbook por cliente em `/dashboard/clients/[id]` aba **Brandbook**
   (3 caminhos: gerar com IA, upload PDF/HTML, manual).
3. Use `/dashboard/image` pra gerar — o brandbook ativo e injetado automaticamente
   e o modelo é escolhido pelo autoMode.

### Fluxo tecnico

```
POST /api/image/generate
  -> cria image_jobs row (status='queued')
  -> notifica imageJobEmitter (in-memory)

server/imageWorker.js (em background)
  -> optimizePrompt (cache MD5 hash, 24h padrao)
  -> calls infra/api/imageProviders/{vertex,openai,fal,gemini}
  -> salva imagem em public/uploads/generated/{tenantId}/{yyyy-mm}/
  -> gera thumbnail 256px webp
  -> marca job done + notifica sininho
```

### Estrutura de arquivos

- `models/agentes/imagecreator/`
  - `promptEngineer.js` — gera prompt otimizado, cache MD5 24h
  - `refClassifier.js` (v1.2) — classifica refs via Vision (gpt-4o-mini)
  - `autoMode.js` (v1.2) — decide modelo deterministicamente
  - `referenceVision.js` — descreve refs por modo
  - `brandbookExtractor.js`, `costCalculator.js`, `errorMessages.js`
  - `heuristicSelector.js`, `smartSelector.js` — preservados para compat
    reversa (jobs antigos no historico). NAO sao chamados pelo worker novo.
- `infra/api/imageProviders/`
  - `vertex.js`, `openai.js`, `fal.js`, `gemini.js` — adapters dos providers
  - `_probe.js` (v1.2) — resolve gpt-image-2 -> 1.5 -> 1 via /v1/models
- `infra/encryption.js` — AES-256-GCM com auth tag pra API keys
- `infra/cache.js` — cache em memoria com TTL
- `infra/imageRateLimit.js` — 3 camadas: concurrent + hourly + daily
- `infra/promptSanitizer.js` — detecta prompt injection patterns
- `server/imageWorker.js` — worker em background com polling adaptativo (2/5/10s)
- `pages/api/image/` — endpoints REST
- `pages/dashboard/image/` — workspace, visualizacao full, historico admin
- `components/image/` — UI: ImageGeneratorModal, ImageDetailModal, HistoryStrip,
  ContextMenu (v1.2), ReferenceUploader, ModelSelector (so em modo avancado), etc
- `hooks/useAdvancedMode.js` (v1.2) — toggle Cmd+Shift+A persistido

### Limites padrao

- Admin: 50 imagens/dia, 30/hora
- User: 30 imagens/dia, 10/hora
- 5 geracoes simultaneas por tenant
- 100 req/min por IP (proteca de burst)
- 20 templates por cliente
- Historico admin: 7 dias

### Variaveis de ambiente

- `IMAGE_ENCRYPTION_KEY` (obrigatorio em prod) — base64 32 bytes, gere com `openssl rand -base64 32`
- `GOOGLE_VERTEX_PROJECT_ID`, `GOOGLE_VERTEX_LOCATION` — fallback global
- `FAL_KEY`, `GEMINI_API_KEY` — fallback global
- `IMAGE_WORKER_ENABLED` — `false` desliga o worker (uso em CI/build)
- `IMAGE_MAX_REFERENCE_BYTES` (10 MB), `IMAGE_MAX_BRANDBOOK_BYTES` (25 MB)

### Diagnostico em producao

```bash
curl -H "x-internal-token: $INTERNAL_API_TOKEN" https://app.example.com/api/image/_health
```

Retorna snapshot do worker (jobs processados, erros, fila atual, cache hit rate, ultimo cleanup).

### Testes manuais

`scripts/test-brandbook-injection.js` — confirma que uma geracao para um
cliente com brandbook ativo realmente injeta as cores hex do brandbook no
prompt otimizado. Pre-requisito: `npm run dev` rodando e `ADMIN_TENANT_ID`
no .env.

```bash
node scripts/test-brandbook-injection.js <clientId>
# [PASS] brandbook injetado corretamente. 2/3 cores no prompt.
```

Falha exit 1 com diagnostico (cache divergente, brandbook nao carregado,
worker nao processando, etc).


## Central de Suporte (Tutoriais Internos)

Base de conhecimento interna do time, acessível por todos os usuários
autenticados via sidebar (categoria **SUPORTE**, antes da categoria SISTEMA).

**Hierarquia:** Módulos → Aulas → Mídias (vídeos e anexos).

- **Módulos** agrupam temas (ex: "Como usar o módulo de Tasks").
- **Aulas** são unidades dentro do módulo — cada uma tem título, descrição em
  texto livre (whiteSpace pre-wrap) e zero-ou-mais vídeos + anexos.
- **Mídias** podem ser vídeos (MP4/MOV/WebM, até 100MB) ou anexos
  (PDF/DOCX/imagens, até 25MB para docs / 10MB para imagens).

**Permissões:**
- Leitura: qualquer usuário autenticado.
- Criar/editar/excluir: apenas `admin` ou `god` (checagem server-side via
  `isAdmin` em `lib/api-auth.js`).

**Rotas:**
- `/dashboard/suporte` — grid de módulos.
- `/dashboard/suporte/[moduleId]` — módulo com aulas em acordeão (1 aberta
  por vez), player de vídeo principal, lista de vídeos extras, descrição da
  aula e materiais auxiliares com botão de download. Imagens abrem em lightbox.

**Endpoints:**
- `GET/POST /api/support/modules`
- `GET/PUT/DELETE /api/support/modules/[id]` (GET retorna estrutura aninhada
  com aulas + vídeos/anexos)
- `POST /api/support/lessons` · `PUT/DELETE /api/support/lessons/[id]`
- `POST /api/support/media`   · `PUT/DELETE /api/support/media/[id]`

**Upload:** `pages/api/upload.js` foi ampliado nessa sprint pra aceitar PDF e
DOCX além de imagens/vídeos. Os arquivos ficam em `public/uploads/{videos,
images, documents}/`.

**Dívida técnica conhecida:** quando um módulo, aula ou mídia é apagado, o
banco apaga os registros em cascata, mas os arquivos físicos em
`public/uploads/` **permanecem órfãos**. Um sprint futuro deve implementar
garbage collection (cron que varre os arquivos sem referência no banco).

## Histórico de alterações

### 2026-05-21 — PATCH single-workspace + notificações pessoais

Auditoria arquitetural corrigindo a confusão histórica entre "multi-tenancy"
e "single-workspace" no README e no código de notificações.

**Documentação:**
- README ganhou seção "🏢 Arquitetura de Dados — Single Workspace" explicando
  que `tenant_id` NÃO isola dados entre usuários (todos do time têm o mesmo).
  Isolamento por pessoa é via `user_id`/`assigned_to`/`created_by`.
- Lista do que é **compartilhado** (quase tudo) vs **pessoal** (Tasks, Jarvis,
  Notificações + preferências de UI).
- Distinção entre `role` (permissão de edição) e `user.id` (propriedade).
- Substituída a seção antiga "Multi-tenancy" que era enganosa.

**Schema (`infra/migrations/006_notifications_per_user_20260521.sql`):**
- `system_notifications.user_id TEXT` NULLABLE (REFERENCES `tenants` ON DELETE CASCADE).
  NULL = broadcast; preenchido = pessoal. Notificações antigas (sem `user_id`)
  viram broadcast retroativo — aceitável (operacionais por natureza).
- Índice composto `(user_id, read, created_at DESC)` pra o filtro do sininho.

**Model (`models/clientForm.js`):**
- `createNotification(tenantId, type, title, message, clientId, metadata, userId?)`
  — `userId` opcional como **7º** parâmetro (retrocompat: 38 call sites antigos
  continuam funcionando como broadcast sem alteração).
- Nova função `createUserNotification(userId, tenantId, ...)` — atalho explícito
  pra notificação pessoal, com `userId` obrigatório (throw se ausente).
- `getUnreadNotifications`, `getAllNotifications`, `markAllNotificationsRead`,
  `countUnread` agora EXIGEM `userId` e filtram com
  `WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)`.

**Endpoint (`pages/api/notifications/index.js`):**
- Usa `requireAuth(req)` pra extrair o `user.id`.
- Cache do contador agora é por usuário: `notif:count:${tenantId}:${userId}`
  (antes era global `notif:count:${tenantId}` — vazava entre users).
- Em broadcast, a invalidação usa só o prefixo `notif:count:${tenantId}`
  (cobre todas as variantes user-específicas).

**Call sites corrigidos (pessoais):**
- `pages/api/tasks/index.js` — "task atribuída" → `createUserNotification(assigned_to, tenantId, ...)`.
  **Bug pré-existente corrigido:** o código antigo passava `assigned_to`
  como se fosse `tenantId` no 1º arg — notificação nascia com `tenant_id`
  errado e ficava invisível.
- `pages/api/tasks/[id].js` — mesmo bug corrigido em 2 lugares:
  "task atribuída" quando muda assignee e "dependência liberada" pros
  assignees de tasks que estavam bloqueadas.
- `pages/api/cron/tasks-overdue.js` — "tarefas vencidas" agora pessoal pro user
  afetado (mesmo bug pré-existente).
- `pages/api/tasks/bulk-import/commit.js` — "tarefas atribuídas via importação"
  pessoal pra cada assignee (mesmo bug pré-existente).
- `pages/api/jarvis/confirm.js` — 6 call sites passam `user.id` no 7º arg:
  task criada, task recorrente, receita/despesa, pipeline, send_form,
  send_onboarding/resend_onboarding.

**Broadcasts permanecem** (sem `userId`): cliente criado, base apagada, form
preenchido, pipeline finalizado, Instagram conectado, anomalias de ads,
propostas comerciais, etc. — tudo que é evento do sistema relevante pro time.

**Validação dos cenários canônicos:**
- Alan cria cliente → Brenno vê ✅
- Alan cria task pra ele → Brenno NÃO vê na view "Eu" ✅
- Brenno conversa com Jarvis → Alan NÃO vê histórico ✅
- Pipeline finalizado → todo time vê (broadcast) ✅
- Alan atribui task ao Brenno → SÓ Brenno recebe notificação ✅
- Admin upou tutorial → todo time vê (gated só pra editar) ✅

### 2026-05-20 — Central de Suporte — Tutoriais internos (módulos > aulas > mídias)

**Schema (`infra/migrations/005_support_center_20260520.sql`):**
- `support_modules`, `support_lessons`, `support_media` — CASCADE total entre níveis.
- `support_media.kind` com CHECK em `('video', 'attachment')`.
- Triggers de `updated_at` nos 2 primeiros; índices em `(tenant_id, sort_order)`, `(module_id, sort_order)`, `(lesson_id, sort_order)` e `(lesson_id, kind)`.
- Espelhado em `infra/schema.sql`.

**Backend:**
- `models/support.model.js` — CRUD completo + `getModuleFull` aninhado em 2 queries (módulo+aulas e mídias filtradas por `ANY($1::text[])`), sem N+1. Ownership validators (`isModuleOfTenant`, `isLessonOfTenant`).
- 6 endpoints REST em `pages/api/support/` (modules, lessons, media). Multi-tenant via `resolveTenantId`. Mutations bloqueadas por `isAdmin(user)` server-side — front esconde botões, backend rejeita 403.
- `pages/api/upload.js` — whitelist ampliada pra `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`. Sniff de magic bytes pra PDF (`%PDF`), DOCX (PK zip header) e DOC legado (CFB header). Nova subpasta `documents/`, limite 25MB. Retorno ganhou `kind: 'document'`.

**Frontend:**
- `pages/dashboard/suporte/index.js` — grid responsivo 3/2/1 colunas com cards `glass-card`. Estado vazio com CTA pra admin. Botões edit/delete em hover (admin-only).
- `pages/dashboard/suporte/[moduleId].js` — breadcrumb + header do módulo + acordeão de aulas (uma aberta por vez). Aula expandida mostra player principal (`preload="metadata"`), lista vertical de vídeos extras, descrição (`whiteSpace: pre-wrap`), grid de anexos. Imagens abrem lightbox simples (modal full-screen, ESC fecha).
- `components/SupportModuleModal.jsx` — criar/editar módulo com seletor visual de ícone (lista alinhada ao `ICONS` exportado pelo `DashboardLayout`).
- `components/SupportLessonModal.jsx` — criar/editar aula (título + descrição multi-linha + sort_order).
- `components/SupportMediaModal.jsx` — tabs Vídeo/Anexo. Reusa `MediaUploader` (que agora aceita preset `'document'` + qualquer CSV de MIMEs arbitrário).
- `components/SupportMediaCard.jsx` — card visual por tipo: PDF (vermelho), DOC (azul), imagem (verde com miniatura clicável), genérico. Botão "Baixar" via `<a download>`.
- `assets/style/support.module.css` — único CSS module com todos os estilos (cards, acordeão, mídia, lightbox, modais, skeletons). Zero hex hardcoded — só CSS variables.

**Componentes ampliados:**
- `components/MediaUploader.js` — `accept` agora aceita também strings CSV livres (ex: `"application/pdf,image/png"`), além dos presets `image|video|both|document`. Limite dinâmico por tipo (`maxBytesFor` / `limitLabelFor`).
- `components/DashboardLayout.js` — `ICONS` virou export nomeado (`export const ICONS`) pra ser reutilizado nas páginas de suporte. Categoria SUPORTE adicionada antes da SISTEMA (tag `21c`, `minRole: 'user'`, ícone `book` que já existia).

**Privacidade:** `WHERE tenant_id = $X` em **todas** as queries do model. Endpoints checam ownership via `isModuleOfTenant`/`isLessonOfTenant` antes de inserir/atualizar. Mutations sempre por `isAdmin(user)` server-side.

**Dívida técnica:** ao apagar módulo/aula/mídia, o banco apaga em cascata mas os arquivos físicos em `public/uploads/` ficam órfãos. Garbage collection fica pra sprint futuro.

### 2026-05-20 — Forms v2 — Navegação por dias, vídeo de boas-vindas, incentivo diário, anti-duplicação no Jarvis

**Schema (`infra/migrations/004_forms_v2_welcome_video_20260520.sql`):**
- `marketing_clients.responsible_name TEXT` — nome do contato responsável (opcional).
- `marketing_clients.onboarding_greeting_with TEXT NOT NULL DEFAULT 'company'` — toggle de saudação. CHECK em `('company','responsible')`.
- Espelhado em `infra/schema.sql`.
- 4 novas chaves em `settings` (não exigem DDL — key/value): `onboarding_welcome_video_url`, `onboarding_welcome_video_filename`, `onboarding_welcome_video_description`, `onboarding_msg_incentive`. Documentadas em `DEPLOY_NOTES.md`.

**Página do cliente — seletor de dias (`/onboarding/[token]`):**
- `components/OnboardingDayNavigator.jsx` + `assets/style/dayNavigator.module.css`. Grid 5×3 desktop, carrossel horizontal mobile (`< 720px`, `scroll-snap`).
- `<DayCapsule />` único renderer (regra de componentização). Status por cor: verde (respondida), azul (hoje), amarelo (catch-up), 🔒 (futuro), 💤 (descanso).
- Dia clicado: passado respondido → `<ReadOnlyStageView />` (novo export do `OnboardingStageView.js`); futuro → `<LockedDayView />` com data de liberação; descanso → mensagem; today/catch-up → fluxo normal editável.
- Cache de 60s no GET sem `day`. Pós-submit, o front força `cache: 'no-store'` pra invalidar.

**Endpoint novo (`pages/api/onboarding/day-snapshot.js`):**
- Sem auth — token controla acesso (igual `current-stage`).
- `GET ?token=` → lista os 15 dias em UMA query consolidada (LEFT JOIN config × responses) — sem N+1.
- `GET ?token=&day=N` → detalhe do dia (com flag `readOnly` derivada de `submitted`).

**Aceleração do formulário:**
- `COUNTDOWN_SECONDS: 10 → 3` em `OnboardingStageView` (zero se vídeo já assistido).
- `OnboardingVideoPlayer` agora é lazy: `IntersectionObserver` (rootMargin 200px) — só monta o `<video>`/`<iframe>` quando entra no viewport. Cleanup no unmount.
- Preload da próxima etapa via `requestIdleCallback` (fallback `setTimeout(1500)`) dentro do `OnboardingStageView` — aquece o cache HTTP do `/day-snapshot?day=currentDay+1`.
- `pages/api/onboarding/current-stage.js` reduziu queries de ~5 → 3: query consolidada `stages_config LEFT JOIN responses`. `console.time('[PERF][current-stage]')` pra medir em produção.

**Vídeo de boas-vindas global (admin):**
- Nova section "VÍDEO DE BOAS-VINDAS GLOBAL" na tab Mensagens de `pages/dashboard/onboarding-config.js`. Reusa `<MediaUploader accept="video" multiple={false} />` (sem duplicar component).
- Upload via `/api/upload` (até 100MB, salva em `public/uploads/videos/`).
- Preview com `<video controls>`. Botões "Substituir" e "Remover". Caption editável com placeholder `{NOME}`.
- Novo template `onboarding_msg_incentive` no array `MSG_TEMPLATES` (incentivo diário às 10h).

**Ficha do cliente — saudação personalizada:**
- Campo `responsible_name` + toggle `onboarding_greeting_with` em `TabInfo` de `pages/dashboard/clients/[id].js`. Aviso amarelo quando toggle = "responsável" mas o campo está vazio.
- `models/client.model.js.updateClient` aceita os 2 campos novos.
- Helper centralizado `getClientGreetingName(client)` em `models/onboarding.js`. Mirror no front (`greetingNameFor`) pra mensagens do modal — fallback seguro pra `company_name` se o toggle apontar pra responsável vazio.
- Aplicado em: cron diário (`onboarding-daily.js`), cron de incentivo, modal WhatsApp do InfoCliente, fluxo do Jarvis (`send_onboarding`/`resend_onboarding`).

**Modal WhatsApp do InfoCliente — envia link + vídeo:**
- Após `send-whatsapp` dar sucesso, chama `POST /api/onboarding/send-welcome-video` (novo endpoint) que busca settings, monta caption e dispara `sendVideo` na Z-API. Falha do vídeo NÃO bloqueia o fluxo — `activate-first` ainda roda.
- Botão WhatsApp continua sumindo quando `formStatus !== 'not_sent'`. Trava local; reenvio sai pelo Jarvis.

**Z-API — wrapper `sendVideo` (`infra/api/zapi.js`):**
- Novo `sendVideo(phone, videoUrl, caption)` mapeado pro endpoint `/send-video` da Z-API.

**Jarvis — trava anti-duplicação:**
- `cmdEnviarFormulario` agora consulta `onboarding_progress`:
  - Sem progress / `not_started` → `confirmAction: 'send_onboarding'` (1º envio, ativa jornada).
  - `active`/`paused` → `confirmAction: 'resend_onboarding'` (aviso explícito, NÃO mexe em `started_at`).
  - `completed` → erro amigável sem confirmação.
- `pages/api/jarvis/confirm.js` ganhou os 2 novos action handlers; `resend_onboarding` loga em `onboarding_notifications_log` com `type='manual_resend'` (auditoria).
- `JarvisOrb.js` mostra labels específicos por action + linhas de preview ("Importante: contagem NÃO será resetada").
- `models/jarvis/tools.js` descreve a regra na própria tool (a IA vê via system prompt).

**Cron novo `onboarding-incentive` (`pages/api/cron/onboarding-incentive.js`):**
- Horário: 10h BRT (cron UTC `0 13 * * *`).
- Cutuca SÓ quem não respondeu a etapa do `currentDay`. Skip: dias de descanso, sem phone, já notificado hoje (UNIQUE em `onboarding_notifications_log (client_id, day_number, type)` com `type='incentive'`).
- Renderiza template `onboarding_msg_incentive` ou default; substitui `{NOME}` via `getClientGreetingName`, `{ETAPA}` e `{LINK}`.

**Privacidade:** o `day-snapshot` valida o token e só retorna dados do progress correspondente — nunca outro cliente. Token expirado retorna 410.

**`started_at` é sagrado.** Reenviar (botão InfoCliente ou Jarvis confirmado) NUNCA mexe em `started_at`. Reset só via ferramenta admin "Controle de Dias" (`/api/onboarding/admin/set-day`).

### 2026-05-20 — Tasks v2 — Checklist default, modo Time por cliente, importação em massa via IA, bot 2× ao dia

**Schema (`infra/migrations/003_tasks_v2_checklist_20260520.sql`):**
- `client_tasks.due_time TIME` — horário opcional, ordenação/filtro no Checklist.
- `client_tasks.recurrence_id TEXT REFERENCES task_recurrences(id) ON DELETE SET NULL` — identifica tasks geradas por recorrência; permite ao Checklist separar "Recorrentes" / "Não-recorrentes" sem heurística. O cron `task-recurrences` agora grava esse campo.
- `user_task_preferences (user_id, default_view)` — persiste view padrão por usuário (default global = `checklist`). Endpoint `GET/PUT /api/users/preferences`.
- `infra/schema.sql` espelhado, lista de triggers de `updated_at` atualizada.

**Nova view Checklist (default):**
- `components/ChecklistView.jsx` + `assets/style/checklist.module.css`.
- Layout doc-style: tabs de dia (SEG-SEX; SAB/DOM aparecem só se tiver task), seção `// ATRASADAS` fixa no topo, seções `// RECORRENTES` / `// NÃO-RECORRENTES` em modo Eu, agrupamento por cliente em modo Time (com "Internas / Sem cliente" no fim).
- Filtros: Sem filtro | Prioridade | Hora (com tasks sem hora indo pro final).
- Checkbox risca tarefa concluída; clicar no texto abre `TaskDetailModal` reusado. Dependências bloqueiam visualmente o checkbox e o backend (`updateTask`) valida — sem dupla regra.
- `<ChecklistRow />` único renderer de linha — modo Eu vs Time muda só via props (mostra cliente vs avatar do responsável; recorrente ganha badge ↻).

**Toggle de view (3 opções) + default por usuário:**
- `Checklist | Kanban | Lista` no header. Checklist primeiro (default global).
- Página de tasks carrega `/api/users/preferences` no mount; troca de view dispara `PUT` em background (otimista).

**Modo Time agrupa por cliente:**
- Vale para Checklist e Lista. Kanban segue com colunas por dia (mudar quebra a leitura do board — fora de escopo).

**Importação em massa via IA (`Importar Ata`):**
- `components/BulkImportModal.jsx` (passo 1 — upload texto/arquivo .txt/.md/.docx/.pdf, máx 5MB) + `components/BulkImportPreview.jsx` (passo 2 — preview editável agrupado por responsável).
- `POST /api/tasks/bulk-import/parse` extrai texto (mammoth/pdf-parse), carrega contexto (users, clients, categorias) e chama `models/tasks/bulkImportAI.parseBulkImport`. Usa `runCompletion('medium', ..., { operationType: 'tasks_bulk_import' })` — tracking automático no `ai_token_usage`.
- Prompt instrui a IA a NÃO inventar usuário/cliente; quando não dá pra resolver responsável → fallback = criador da importação + warning.
- `POST /api/tasks/bulk-import/commit` recebe array final editado e usa `taskModel.createMany` (INSERT batch atômico via VALUES multi-row). Notifica responsáveis (uma notificação agregada por usuário). `created_by` é sempre o usuário do cookie, nunca vindo do client.

**Bot WhatsApp passa a 2 lembretes/dia (matinal + vespertino):**
- `pages/api/cron/tasks-overdue.js` — removido envio Z-API. Continua marcando `overdue` no banco e disparando sininho. Crons `tasks-morning` (8h) e `tasks-afternoon` (16h) seguem ativos.
- `pages/dashboard/settings/tasks.js` — campo "Mensagem de tarefas atrasadas" virou "Mensagem da tarde" (mapeado em cima de `message_overdue` por baixo pra evitar migração de coluna; o cron afternoon já usa esse template). Idem para o template global.

**Multi-tenancy:** todos os endpoints novos (`/api/users/preferences`, `/api/tasks/bulk-import/*`) chamam `resolveTenantId(req)` + `requireAuth(req)`. `created_by` na importação é forçado pro `user.id` do cookie.

**Reaproveitamento:** Checklist usa helpers do `pages/dashboard/tasks/index.js` (`isoDate`, `addDays`, `isOverdue`, `taskDueIso`) via props — zero drift de fuso. `TaskDetailModal` e `CreateTaskModal` reusados sem reescrita (CreateTaskModal ganhou só `initialDueDate` opcional).

### 2026-05-06 — Copy v2.1 — Export editorial SIGMA (fix `spawn ENOEXEC` + IA enricher)

**Bug fix `spawn ENOEXEC` no PDF (dev macOS/Windows):**
- `infra/api/pdfRenderer.js` agora detecta ambiente. Em prod Linux/Railway usa `@sparticuz/chromium`. Em dev macOS/Windows usa o Chrome do sistema (busca em `/Applications/Google Chrome.app/...`, `C:\Program Files\Google\Chrome\...` etc) ou respeita `PUPPETEER_EXECUTABLE_PATH`.
- Mensagem de erro útil quando Chrome não é encontrado.

**IA-first export (Sonnet 4.6 enricher):**
- Novo `models/copy/exportEnricher.js` chama `claude-sonnet-4-6` ANTES da renderização. Recebe a copy bruta + template + nome do cliente, devolve JSON estruturado: `{ documentTitle, documentSubtitle, sections: [{ kind, eyebrow, title, content, items, qa, attribution }] }`.
- Section kinds: `hero`, `section`, `callout`, `list`, `quote`, `cta`, `faq`. Cada um tem layout dedicado.
- System prompt impede invenção de conteúdo — IA reorganiza, escolhe hierarquia, decide o que vira hero/callout/CTA, mas usa só palavras presentes na copy.
- Fallback determinístico se Sonnet falhar (parser markdown legado).
- Por que Sonnet 4.6 e não Haiku 4.5: tarefa exige juízo arquitetural; diferença de custo é só ~$0.044/export. Operationtype novo: `copy_export_enrich`.

**Brandbook SIGMA fixo (feedback do usuário):**
- Removido `getActiveBrandbook` do flow de export. Identidade hardcoded em `models/copy/exportTemplates/_shared.js`: preto `#0a0a0a`, branco `#ffffff`, vermelho `#ff0033`, Inter (corpo) + JetBrains Mono (eyebrows).
- Visual editorial: cover com brand mark + título grande + subhead + meta tripartite (cliente/data/sistema). Sections numeradas estilo livro de design (`01 / DIAGNÓSTICO`), divisores horizontais finos, callouts com barra lateral vermelha, CTA invertido (fundo preto), quotes com aspa vermelha gigante.
- Templates `landingPage.js` / `contentPlanning.js` / `freeform.js` viraram wrappers finos — diferem só pela `templateLabel` na cover.
- DOCX (`exportDocx.js`) reescrito do zero: também consome o JSON estruturado, com mesma identidade SIGMA via `Packer/Document/Paragraph/TextRun`.

**UI:**
- `ExportCopyModal`: toggle "Aplicar brandbook do cliente" virou indicador "Identidade SIGMA editorial" (disabled, só informativo).
- `ExportPreviewModal`: texto loading "Sonnet 4.6 estruturando..." em vez de "Renderizando layout com brandbook". Sidebar mostra "Estruturado por: Claude Sonnet 4.6".

**Smoke test:**
```sql
SELECT operation_type, COUNT(*), SUM(tokens_total), SUM(estimated_cost_usd)
FROM ai_token_usage
WHERE created_at > now() - interval '5 minutes' AND operation_type = 'copy_export_enrich'
GROUP BY operation_type;
```

### 2026-05-06 — Image v2 (Arte Guia, Smart Selector inteligente, qualidade premium)

**Fase 1 — Latência:**
- `MAX_CONCURRENT_GLOBAL` do `imageWorker` subiu de 5 → 10 (configurável via env `IMAGE_WORKER_MAX_CONCURRENT`).
- `loadImageInputsForProvider` e `ensureFixedRefsDescriptions`: serial → `Promise.all`.
- `describeReferencesByMode`: 3 modos (inspiration/character/scene) agora rodam em paralelo via `Promise.all`. Character ainda gera 1 chamada Vision por imagem, mas as imagens entre si também rodam paralelas.
- TTL do cache do Prompt Engineer ampliado de 24h → 48h (default em `image_settings.prompt_reuse_window_hours`). Log `[INFO][PromptEngineer] cache HIT` em caps com `tokensUsed=0` pra facilitar grep de hit-rate.

**Fase 1 — Smart Selector via LLM:**
- `models/agentes/imagecreator/smartSelector.js` agora usa `claude-sonnet-4-6` por padrão (~$0.003/decisão). Pode ser override via `settings.smart_mode_model` pra cair pro `gpt-4o-mini`.
- System prompt enriquecido em `prompts/smartSelector.js` com regras de Arte Guia + categoria do pedido (feed/story/ad/banner) + Nano Banana 2 vs GPT Image 2 vs Flux Kontext.
- Fallback: se LLM falhar (timeout, JSON inválido, modelo fora dos enabled), cai pro `autoMode.decide` determinístico (mantido em disco).
- Worker (`server/imageWorker.js`) chama `smartSelectStrategy` em vez de `autoModeDecide`. autoMode permanece como fallback.

**Fase 2 — Arte Guia (templates de inspiração):**
- 2 tabelas novas em `infra/schema.sql` + `infra/migrations/002_inspiration_templates.sql`: `image_inspiration_templates` (globais por tenant) + `client_inspiration_templates` (por cliente). Coluna nova `low_quality_warning` + `quality_check` em `image_jobs`.
- `models/inspirationTemplate.model.js` — CRUD compartilhado (scope=global|client) com `incrementUsageCount` (fire-and-forget) e `ensureAIDescription` (Vision lazy via `image_template_describe`).
- Endpoints `GET/POST/PUT/DELETE /api/image/templates/global` e `/api/image/templates/client/[clientId]`.
- Settings page `/dashboard/settings/image-templates` (entrada nova no sidebar). Upload em batch, edição inline de título e categoria, ativar/desativar.
- 3 componentes: `InspirationTemplatesUpload` (botão reutilizável), `InspirationTemplatesGallery` (grid inline) e `InspirationPickerModal` (seleção multi com 3 seções: refs fixas + cliente + globais).
- **UI rename**: tab "Brandbook" virou "Arte Guia" no `pages/dashboard/clients/[id].js`. Chave técnica `brandbook` preservada em todo o código/banco/API. Apenas labels visíveis mudaram. `BrandbookTab` ganhou 3ª seção embaixo do editor com galeria de templates do cliente.
- `ImageGeneratorModal`: botão "+ Escolher da Arte Guia" abaixo do `ReferenceUploader` abre o picker. Imagens escolhidas viram refs `mode='inspiration'` levando `templateId`/`templateScope` no metadata. Backend incrementa `usage_count` fire-and-forget.

**Fase 3 — Qualidade premium:**
- `quality: high` default na geração (worker usa `settings.quality_default || 'high'`).
- Smart Selector recebe contexto de templates (`inspirationTemplateContext`) e o prompt entende a regra: 2+ templates + brandbook ativo + composição complexa → Nano Banana 2.
- Prompt Engineer aceita `inspirationTemplateDescriptions` (array vindo de `ensureAIDescription`). System prompt ganhou bloco `# INSPIRATION TEMPLATES (Arte Guia — style references)` com regra "use como guia, não copie literalmente". Hash de cache também inclui essas descrições.
- Worker chama `ensureAIDescription` em paralelo pra cada template escolhido (Vision lazy — só gera na primeira vez, depois cache no banco).
- `qualityCheck.js`: `sharp.metadata()` + Laplacian variance em thumb 256px. Se resolução real < 70% do esperado OU variância < 80, seta `low_quality_warning=true` e grava detalhes em `quality_check` JSON. Não bloqueia entrega.

**Tracking de tokens (auditoria completa):**
- Novos `operation_type` no dashboard: `image_template_describe`, `image_template_categorize`, `image_ref_classifier`.
- Cobertura atual: `image_generation`, `image_prompt_engineer`, `image_smart_selector`, `image_title_generator`, `image_brandbook_extract`, `image_brandbook_generate`, `image_brandbook_fixed_ref_describe`, `image_reference_describe_*`, `image_ref_classifier`, `image_template_describe`.

**Custos esperados:**
- Smart Selector LLM: ~$0.003/decisão × 100 jobs/dia = ~$9/mês.
- `quality: high` default: ~+30% no custo de geração (varia por modelo). Override via `settings.quality_default`.
- Vision lazy de templates: 1× por template (cacheado) × N templates × $0.005 ≈ desprezível em uso normal.

**Smoke test pós-deploy:**
```sql
SELECT operation_type, COUNT(*), SUM(tokens_total), SUM(estimated_cost_usd)
FROM ai_token_usage
WHERE created_at > now() - interval '10 minutes'
  AND operation_type LIKE 'image_%'
GROUP BY operation_type
ORDER BY COUNT(*) DESC;

SELECT id, model, low_quality_warning, quality_check->>'blurScore' AS blur,
       quality_check->>'reasons' AS reasons
FROM image_jobs
WHERE created_at > now() - interval '10 minutes'
  AND status = 'done'
ORDER BY created_at DESC LIMIT 10;
```

### 2026-05-06 — Copy v2, Fases 2–4 (background-first, streaming, export profissional)

**Fase 2 — Histórico em tempo real + streaming + melhoria em background:**
- Streaming SSE real durante geração: o runner usa `runCompletionStreamWithModel`/`runCompletionStream` e grava `partial_text` em `copy_generation_jobs` a cada ~60 chars/400ms.
- Endpoint `GET /api/copy/jobs/[id]/stream` (SSE, polling do banco a 400ms): emite `status`, `chunk`, `done`, `error`. Heartbeat de 15s pra sobreviver a proxies. `X-Accel-Buffering: no`.
- `CopyWorkspace` abre EventSource primeiro; se nenhum evento chegar em 3s, paraleliza polling de 800ms (o primeiro `done` vence). `reloadHistory()` virou helper único — chamado depois de gerar, melhorar e exportar.
- Badge `EXECUTANDO EM SEGUNDO PLANO` / `STREAMING` no header enquanto há `activeJobId`.
- Melhoria de texto agora roda em background como `kind: 'improve_text'` (`runImproveText` em `copyJobRunner`). O endpoint legado `/api/agentes/improve-text` continua funcionando, mas a UI usa o job novo.
- Cache TTL 60s em `loadClientContext` (sem invalidação manual — janela aceita).

**Fase 3 — Export HTML→PDF/DOCX com pré-visualização e brandbook:**
- Tabela nova `copy_export_jobs` (em `infra/schema.sql` + `infra/migrations/001_copy_v2_export_and_streaming.sql`). Idempotente.
- Botão "Exportar" no toolbar do CopyWorkspace abre `ExportCopyModal` (3 templates × 2 formatos × brandbook on/off) → `ExportPreviewModal` mostra HTML em iframe → botões "Baixar PDF/DOCX" disparam o job.
- `POST /api/copy/export`:
  - `format='preview'` → retorna HTML síncrono (~200ms).
  - `format='pdf'|'docx'` → cria `copy_export_jobs`, dispara via `setImmediate`, retorna `202 + jobId`. `GET /api/copy/export/[jobId]` faz polling.
- 3 templates HTML (`models/copy/exportTemplates/{landingPage,contentPlanning,freeform}.js`) + helpers (`_shared.js` com `applyBrandbook`, `markdownToHtml`, `baseStyles`, `buildDocument`).
- 3 espelhos DOCX (`models/copy/exportDocx.js`) reaproveitando o parser markdown→docx do export legado de clientes.
- Render PDF via `puppeteer-core` + `@sparticuz/chromium` (singleton de browser, A4 20/18mm, footer numerado, `document.fonts.ready` antes de imprimir, `page-break-inside: avoid` em todo card/seção).
- Storage em `public/uploads/exports/{tenantId}/{yyyy-mm}/{jobId}.{ext}`.
- Brandbook do cliente carrega via `getActiveBrandbook` — fallback automático pra identidade SIGMA (`#ff0033`/Inter/JetBrains Mono) com aviso amarelo no preview quando não encontrado.

**Fase 4 — Cleanup + docs:**
- Cleanup diário (>7 dias) registrado em `server/instrumentation.js` — chama `cleanupOldExports()` 5min após boot e a cada 24h.
- README + CLAUDE.md atualizados com seção dedicada a Copy v2 e tracking dos novos `operation_type`.

**Smoke test pós-deploy:**
```sql
-- Verificar tracking pós-geração + melhoria + export PDF
SELECT operation_type, COUNT(*), SUM(tokens_total), SUM(estimated_cost_usd)
FROM ai_token_usage
WHERE created_at > now() - interval '5 minutes'
GROUP BY operation_type;

-- Verificar jobs de export ativos
SELECT id, template, format, status, duration_ms, result_size_bytes
FROM copy_export_jobs
ORDER BY created_at DESC LIMIT 10;
```

### 2026-05-06 — Copy v2, Fase 1
- Adicionados ao seletor de modelos do Copy: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `gpt-5.5`. Legados (`claude-opus-4-5`, `claude-sonnet-4-5`, `gpt-4o`, `gpt-4o-mini`) mantidos pra compatibilidade de histórico.
- Tabela `PRICES` em `models/copy/tokenUsage.js` atualizada com os novos modelos.
- Auditoria completa de tracking de tokens no módulo Copy. `logUsage` adicionado em: `pages/api/copy/transcribe.js`, `pages/api/copy/generate-structure.js`, `pages/api/agentes/format-output.js`, `pages/api/agentes/improve-text.js`, `models/copy/copyPrompt.js → formatCopyOutput()` e `infra/api/vision.js` (analyzeImage / analyzeMultipleImages — opcional via `options.tenantId`).
- Novos `operation_type` no dashboard de tokens: `copy_structure_generate`, `copy_transcribe`, `copy_improve_text`, `copy_format_output`, `copy_vision`, `copy_export_planning`, `improve_text`.
- Smoke test:
  ```sql
  SELECT operation_type, COUNT(*), SUM(tokens_total), SUM(estimated_cost_usd)
  FROM ai_token_usage
  WHERE created_at > now() - interval '5 minutes'
  GROUP BY operation_type;
  ```
