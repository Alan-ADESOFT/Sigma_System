# Deploy Checklist — SIGMA Marketing

Checklist completo para subir a plataforma em produção no domínio
**https://hack.sigmagencia.com** com Railway + Neon + cron-job.org.

Marque os itens à medida que avança. A ordem importa: cada bloco depende do anterior.

---

## 0. Pré-requisitos

- [ ] Conta no [Railway](https://railway.com) com projeto criado
- [ ] Conta no [Neon](https://neon.tech) com banco provisionado (`DATABASE_URL` pronta)
- [ ] Conta no [cron-job.org](https://console.cron-job.org) (free tier serve)
- [ ] Acesso ao painel **Meta for Developers** (app `1144185011066620`)
- [ ] Acesso ao painel **Z-API** (instância `3D1470F33B6A40357634EEE17BD0D626`)
- [ ] Acesso ao registrar do domínio `sigmagencia.com` para apontar `hack.` no DNS
- [ ] `git push` da branch `main` feito (último commit: bugs copy + single-workspace)

---

## 1. Banco de dados (Neon)

- [ ] Aplicar `infra/schema.sql` no SQL Editor do Neon
      *(idempotente — pode rodar de novo a qualquer momento)*
- [ ] Aplicar `infra/migrations_consolidate.sql` **uma única vez**
      (consolida dados legados sob `WORKSPACE_TENANT_ID`)
- [ ] Confirmar que tabelas críticas existem:
      `tenants`, `marketing_clients`, `copy_generation_jobs`,
      `image_jobs`, `system_notifications`, `instagram_scheduled_posts`
- [ ] Confirmar que `WORKSPACE_TENANT_ID` (`a1e4526a-...`) existe na tabela `tenants`:
      ```sql
      SELECT id, email, name FROM tenants WHERE id = 'a1e4526a-bb02-448f-879b-6e16a54b3afd';
      ```
- [ ] Anotar a connection string do Neon (`DATABASE_URL`) — vai pro Railway

---

## 2. Railway — service setup

- [ ] Criar service **"web"** conectado ao repo, branch `main`
- [ ] **Settings → Build** → Build command: `npm install && npm run build`
- [ ] **Settings → Deploy** → Start command: `npm start`
      *(o `package.json` já lê `PORT` injetada; se não, ajustar para `next start -p ${PORT:-3002}`)*
- [ ] **Settings → Networking** → gerar domínio `*.up.railway.app` (temporário, pra testar)
- [ ] **Settings → Resources** → começa com 512MB RAM / 1 vCPU; aumenta se travar build
- [ ] **Settings → Region** → preferir `us-east` (mais próximo do Neon `sa-east-1` ainda funciona OK)

---

## 3. Railway — environment variables

Cole estas no painel **Variables** do service web. Valores marcados com `<...>` você
preenche; os outros já estão no seu `.env` local.

### Banco e auth
- [ ] `DATABASE_URL` = connection string do Neon (com `?sslmode=require`)
- [ ] `WORKSPACE_TENANT_ID` = `a1e4526a-bb02-448f-879b-6e16a54b3afd`
- [ ] `SESSION_SECRET` = `<gerar com openssl rand -hex 32>`
- [ ] `INTERNAL_API_TOKEN` = `<gerar com openssl rand -hex 48>` *(rotacionado)*

### URLs
- [ ] `NEXT_PUBLIC_APP_URL` = `https://hack.sigmagencia.com`
- [ ] `NEXT_PUBLIC_BASE_URL` = `https://hack.sigmagencia.com`

### IA
- [ ] `OPENAI_API_KEY` = `<rotacionada em platform.openai.com>`
- [ ] `ANTHROPIC_API_KEY` = `<rotacionada em console.anthropic.com>`
- [ ] `AI_MODEL_WEAK` = `gpt-4o-mini`
- [ ] `AI_MODEL_MEDIUM` = `gpt-4o`
- [ ] `AI_MODEL_STRONG` = `claude-opus-4-20250514`
- [ ] `AI_MODEL_SEARCH` = `gpt-4o-mini`
- [ ] `AI_MODEL_VISION` = `gpt-4o`
- [ ] `AI_VISION_MAX_SIZE_BYTES` = `10485760`
- [ ] `AI_FILE_MAX_SIZE_BYTES` = `20971520`

### Meta / Instagram
- [ ] `META_APP_ID` = `1144185011066620`
- [ ] `META_APP_SECRET` = `<rotacionado em developers.facebook.com>`
- [ ] `INSTAGRAM_APP_ID` = `1709431460466163`
- [ ] `INSTAGRAM_APP_SECRET` = `<rotacionado>`
- [ ] `META_REDIRECT_URI` = `https://hack.sigmagencia.com/api/instagram/callback`

### Z-API (WhatsApp)
- [ ] `ZAPI_INSTANCE` = `3D1470F33B6A40357634EEE17BD0D626`
- [ ] `ZAPI_TOKEN` = `<rotacionado no painel Z-API>`
- [ ] `ZAPI_CLIENT_TOKEN` = `<rotacionado>`

### Apify
- [ ] `APIFY_TOKEN` = `<rotacionado>`
- [ ] `APIFY_GOOGLE_MAPS_ACTOR` = `compass~crawler-google-places`

### Comercial — limites
- [ ] `COMERCIAL_RATE_LIMIT_ANALYSIS_PER_DAY` = `20`
- [ ] `COMERCIAL_RATE_LIMIT_PROPOSAL_AI_PER_DAY` = `30`
- [ ] `COMERCIAL_RATE_LIMIT_WHATSAPP_PER_DAY` = `100`
- [ ] `COMERCIAL_RATE_LIMIT_BULK_WHATSAPP` = `50`
- [ ] `COMERCIAL_BULK_WHATSAPP_DELAY_MS` = `3000`

### Gerador de Imagem
- [ ] `IMAGE_ENCRYPTION_KEY` = chave atual (não trocar, ou re-encripta tudo)
- [ ] `IMAGE_WORKER_ENABLED` = `true` *(Railway é single-instance, ok)*
- [ ] `IMAGE_MAX_REFERENCE_BYTES` = `10485760`
- [ ] `IMAGE_MAX_BRANDBOOK_BYTES` = `26214400`

### Streaming
- [ ] `ENABLE_STREAMING` = `true`
- [ ] `NEXT_PUBLIC_ENABLE_STREAMING` = `true`

### **NÃO** setar
- ❌ `PORT` — Railway injeta sozinho
- ❌ `TUNNEL_URL` — só desenvolvimento local
- ❌ `NEXT_RUNTIME` — Next.js define como `nodejs` automaticamente
- ❌ `ADMIN_EMAIL` / `ADMIN_NAME` — cosméticos após single-workspace

---

## 4. Railway — Volume persistente para uploads

> ⚠️ Sem isso, **toda imagem gerada / logo / anexo desaparece a cada redeploy**.
> O filesystem do container é efêmero por padrão.

- [ ] **Settings → Volumes** → **+ New Volume**
- [ ] **Mount path**: `/app/public/uploads`
- [ ] **Size**: começa com `5 GB` (sobe se necessário)
- [ ] Service redeploya automaticamente após criar
- [ ] Validar que existe testando `mkdir -p` via shell do Railway:
      ```bash
      railway run "mkdir -p public/uploads/logos public/uploads/attachments public/uploads/generated && ls public/uploads"
      ```
- [ ] Confirmar que upload de logo persiste após redeploy
      *(faz upload, redeploy via push fictício, recarrega — logo deve continuar lá)*

> **Nota sobre escala**: este modelo (filesystem local) só funciona em
> single-instance. Quando precisar de múltiplas réplicas, migrar para S3/R2.
> Não é prioridade hoje.

---

## 5. Custom domain (`hack.sigmagencia.com`)

- [ ] **Railway → Settings → Networking → + Custom Domain**
- [ ] Domain: `hack.sigmagencia.com`
- [ ] Railway mostra um `CNAME` target (algo tipo `xyz.up.railway.app`)
- [ ] No registrador DNS do `sigmagencia.com`, adicionar registro:
      - Type: `CNAME`
      - Name: `hack`
      - Value: `<target-do-railway>.up.railway.app`
      - TTL: `300` (5 min)
- [ ] Aguardar propagação DNS (1 min a 1h) — Railway emite cert SSL automático
- [ ] `https://hack.sigmagencia.com` carrega a tela de login → ✅
- [ ] Status do certificado SSL: `Active` no painel Railway

---

## 6. Meta App (Facebook for Developers)

App: `1144185011066620`. Painel: https://developers.facebook.com/apps/1144185011066620

- [ ] **Settings → Basic** → confirmar:
      - App Domains: `hack.sigmagencia.com`
      - Privacy Policy URL: `https://hack.sigmagencia.com/privacy` (criar se não houver)
      - Category: Business
- [ ] **Use Cases → Instagram → Settings** (ou Instagram Basic Display, dependendo do app):
      - **Valid OAuth Redirect URIs**: adicionar `https://hack.sigmagencia.com/api/instagram/callback`
      - **Deauthorize Callback URL**: opcional
- [ ] **Use Cases → Marketing API → Permissions**: confirmar `ads_read`, `ads_management` aprovadas
      *(necessárias para o módulo de Ads)*
- [ ] **App Review → App Mode**: subir para **Live** quando passar a review
      *(em Development só funciona com testers cadastrados)*
- [ ] Testers (se ainda em Development): **Roles → Roles** → adicionar emails
- [ ] Testar OAuth: `https://hack.sigmagencia.com/dashboard/social` → "Conectar Instagram"
      → autoriza → redirect bate em `/api/instagram/callback` → conta aparece

---

## 7. Z-API (WhatsApp)

Painel: https://app.z-api.io

- [ ] **Instâncias** → confirmar instância `3D1470F33B6A40357634EEE17BD0D626` ativa
- [ ] **Configurações → Tokens** → rotacionar `Token` e `Client-Token` se vazaram
- [ ] **Conexão** → QR Code escaneado e status "Conectado"
- [ ] Testar via app: `Dashboard → Tasks → criar task com lembrete WhatsApp`
      *(o cron `tasks-morning` envia; ou força executando o cron manualmente)*
- [ ] (Opcional) **Webhooks** → se quiser receber mensagens, configurar endpoint
      *(o projeto hoje só envia, não tem inbox)*

---

## 8. Primeiro usuário admin

A migração single-workspace cria a tabela `tenants` com usuários, mas você precisa
de pelo menos um admin pra fazer login. Se ainda não tiver:

- [ ] Conectar no Neon SQL Editor e rodar:
      ```sql
      -- Hash de senha gerado via scrypt (use uma senha forte)
      -- Você pode gerar pelo endpoint /api/auth/setup ou inserir manualmente
      INSERT INTO tenants (id, email, name, password, role)
      VALUES (
        'a1e4526a-bb02-448f-879b-6e16a54b3afd',
        'alan.diasm.jr@gmail.com',
        'Alan Dias',
        -- gerar com: node -e "const {scryptSync,randomBytes}=require('crypto'); const s=randomBytes(16); const h=scryptSync('SUASENHA',s,64); console.log(s.toString('hex')+':'+h.toString('hex'))"
        '<salt>:<hash>',
        'god'
      )
      ON CONFLICT (id) DO UPDATE SET role = 'god';
      ```
- [ ] Login em `https://hack.sigmagencia.com/login` → ✅
- [ ] Validar role `god` no menu (acesso total a settings)

---

## 9. Cron jobs (cron-job.org)

> Detalhes operacionais em conversa anterior. Resumo prático abaixo.

Para cada um dos 10 jobs:
- Method: `POST`
- Header: `x-internal-token: <INTERNAL_API_TOKEN>`
- Time zone: `UTC`
- Notificação: `Notify on failure` ✅

| Title | URL relativa | Cron UTC |
|---|---|---|
- [ ] SIGMA — task-recurrences | `/api/cron/task-recurrences` | `0 10 * * *`
- [ ] SIGMA — tasks-morning | `/api/cron/tasks-morning` | `0 11 * * *`
- [ ] SIGMA — tasks-overdue | `/api/cron/tasks-overdue` | `0 11 * * *`
- [ ] SIGMA — finance-charges | `/api/cron/finance-charges` | `0 11 * * *`
- [ ] SIGMA — comercial-proposals-expiring | `/api/cron/comercial-proposals-expiring` | `0 12 * * *`
- [ ] SIGMA — onboarding-daily | `/api/cron/onboarding-daily` | `0 12 * * *`
- [ ] SIGMA — tasks-afternoon | `/api/cron/tasks-afternoon` | `0 19 * * *`
- [ ] SIGMA — form-reminder | `/api/cron/form-reminder` | `0 21 * * *`
- [ ] SIGMA — comercial-cleanup | `/api/cron/comercial-cleanup` | `0 4 * * *`
- [ ] SIGMA — instagram-refresh-tokens | `/api/cron/instagram-refresh-tokens` | `0 3 * * *`

- [ ] Após criar todos, dispara cada um manualmente (3 dots → "Execute now")
      e confirma `200` no History
- [ ] Validar via curl em lote (substitua o token):
      ```bash
      TOKEN="<INTERNAL_API_TOKEN>"
      for path in task-recurrences tasks-morning tasks-overdue finance-charges \
                  comercial-proposals-expiring onboarding-daily tasks-afternoon \
                  form-reminder comercial-cleanup instagram-refresh-tokens; do
        echo -n "[$path] "
        curl -sS -o /dev/null -w "%{http_code}\n" \
          -X POST "https://hack.sigmagencia.com/api/cron/$path" \
          -H "x-internal-token: $TOKEN"
      done
      ```
      *(deve sair `200` em todas as 10 linhas)*

---

## 10. Smoke tests pós-deploy

Validações finais. Faça **logado** em `https://hack.sigmagencia.com`.

### Núcleo
- [ ] Login + logout funcionando
- [ ] Dashboard carrega sem erro de console
- [ ] Sidebar mostra todos os módulos (Clients, Copy, Image, Ads, Comercial, Tasks)

### Pipeline IA
- [ ] Criar cliente teste → preencher dados básicos
- [ ] Rodar pipeline 7-agentes (`Pipeline → Run all`)
- [ ] SSE streaming funciona (logs aparecem em tempo real)
- [ ] Stages 1–5 concluem sem erro
- [ ] Token usage aparece em `/dashboard/tokens`

### Copy
- [ ] Gerar copy do zero (background job + toast "gerando em segundo plano")
- [ ] Sininho recebe notificação ao concluir
- [ ] "Aplicar" (modificar) também roda em background
- [ ] "Melhorar" (botão estrelinha) preserva formatação markdown ✅

### Image Generator
- [ ] Setar API key de pelo menos 1 provider em `Settings → Image`
- [ ] Gerar imagem teste — arquivo grava em `public/uploads/generated/` (volume)
- [ ] Recarregar página: imagem ainda visível ✅
- [ ] Redeploy fictício (`git commit --allow-empty -m "test" && git push`):
      imagem AINDA visível após o boot ✅ *(prova que volume persiste)*

### Aprovação pública (content planning)
- [ ] Criar plano com 1 criativo, gerar share token
- [ ] Abrir link público em aba anônima
- [ ] Reprovar → **textarea de motivo aparece** (não pula direto pra "reprovado") ✅
- [ ] Submeter motivo → status fica "reprovado"

### Ads
- [ ] Conectar conta Meta Ads via OAuth
- [ ] Insights carregam para conta de teste
- [ ] Anomalias detectam (se houver)

### Crons
- [ ] Verificar History de cada cron 24h depois → todos com `200`
- [ ] Notificações aparecem corretamente no sininho

---

## 11. Pós-deploy — segurança e monitoramento

- [ ] **Rotacionar todas as chaves** que circularam fora de canal seguro:
      OpenAI, Anthropic, Meta secret, Z-API, Apify, Neon password
- [ ] Confirmar que `.env` local **NÃO** está commitado (`git check-ignore .env`)
- [ ] Configurar alertas Railway: **Settings → Notifications** → email em deploy fail / OOM
- [ ] Configurar alerta Neon: **Settings → Email Alerts** → quota / connection limit
- [ ] (Opcional) Plugar Sentry / LogRocket para frontend errors
- [ ] (Opcional) Logflare / BetterStack para logs estruturados do Railway
- [ ] Backup automático Neon: **Settings → Branching** → cria branch diária
- [ ] Documentar credenciais novas em vault da empresa (1Password / Bitwarden)

---

## 12. Operação contínua (rotinas)

- [ ] Conferir History dos crons no cron-job.org **1x por semana**
      (ver se algo falha silenciosamente)
- [ ] `/dashboard/tokens` **1x por mês** — entender custo IA
- [ ] Volume Railway **1x por mês** — se chegar perto do limite, sobe ou migra pra S3
- [ ] Token Instagram dura 60 dias; o cron `instagram-refresh-tokens` cuida disso,
      mas verificar `/dashboard/social` se algum cliente caiu pra reconnectar manual

---

> **Última atualização**: documento criado durante a virada para single-workspace
> e implementação dos jobs assíncronos de copy. Atualize quando algo mudar
> (novo cron, novo provider de imagem, mudança de schema crítica).
