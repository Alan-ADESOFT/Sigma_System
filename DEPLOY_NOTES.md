# SIGMA — Notas de Deploy

## Hosting: Railway
- Build: `npm run build`
- Start: `npm start`
- Port: 3001 (definido nos scripts do package.json)
- Banco: PostgreSQL no Neon (variável `DATABASE_URL`)

## Variáveis de Ambiente Obrigatórias
```
DATABASE_URL
ADMIN_EMAIL
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_BASE_URL
SESSION_SECRET
INTERNAL_API_TOKEN
OPENAI_API_KEY
ANTHROPIC_API_KEY
AI_MODEL_WEAK / AI_MODEL_MEDIUM / AI_MODEL_STRONG / AI_MODEL_SEARCH
ZAPI_INSTANCE / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN
```

## Crons (configurar externamente)
Os crons são API routes protegidas com header `x-internal-token`.
Configurar via cron-job.org, GitHub Actions, ou qualquer serviço de cron externo.

| Rota | Método | Schedule | Descrição |
|------|--------|----------|-----------|
| `/api/cron/onboarding-daily` | POST | `0 11 * * *` (8h BRT) | Envia link da etapa do dia via WhatsApp |
| `/api/cron/form-reminder` | POST | `0 13 * * *` (10h BRT) | Lembrete de formulário não preenchido (5+ dias) |
| `/api/cron/task-recurrences` | POST | `0 10 * * *` (7h BRT) | Cria tasks recorrentes do dia |
| `/api/cron/tasks-morning` | POST | `0 11 * * *` (8h BRT) | Resumo matinal de tarefas via WhatsApp |
| `/api/cron/tasks-afternoon` | POST | `0 19 * * *` (16h BRT) | Lembrete vespertino de tarefas pendentes |
| `/api/cron/tasks-overdue` | POST | `0 11 * * *` (8h BRT) | Marca tarefas atrasadas + notificação |
| `/api/cron/finance-charges` | POST | `0 11 * * *` (8h BRT) | Cobranças de parcelas via WhatsApp |

Header obrigatório em todas: `x-internal-token: {valor de INTERNAL_API_TOKEN}`

## Schema do banco
Rodar `infra/schema.sql` contra o banco para garantir que todas as tabelas e colunas existem.
O arquivo é idempotente (IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).

## O que está oculto (TEMPORÁRIO)
Estes itens estão ocultos na sidebar mas os arquivos continuam no projeto:

- `components/DashboardLayout.js` → categorias SOCIAL MEDIA e TRÁFEGO (`hidden: true`)
- `pages/dashboard/clients/[id].js` → aba Instagram (comentada na linha 34)

## Para reativar Social Media / Tráfego
1. `DashboardLayout.js` → remover `hidden: true` de SOCIAL MEDIA e TRÁFEGO
2. `clients/[id].js` → descomentar a aba Instagram (linha 34)
3. Configurar variáveis META_APP_ID, META_APP_SECRET, INSTAGRAM_REDIRECT_URI no Railway
4. Ativar crons de Instagram no serviço de cron externo:
   - `/api/cron/instagram-publisher` → `*/10 * * * *` (a cada 10 min)
   - `/api/cron/instagram-refresh-tokens` → `0 11 * * *` (diário)
