/**
 * POST /api/setup
 * Inicializa o banco de dados: executa schema.sql e insere o admin padrão.
 * Executar UMA VEZ após o deploy: npm run db:setup
 */

const { getDb } = require('../../infra/db');
const { hashPassword } = require('../../lib/auth');
const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/setup] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const sql = getDb();

    /* ── 1. Executar schema.sql ── */
    const schemaPath = path.join(process.cwd(), 'infra', 'schema.sql');
    const schemaSql  = fs.readFileSync(schemaPath, 'utf8');

    const statements = schemaSql
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await sql(stmt);
      } catch (e) {
        if (!e.message.includes('already exists')) {
          console.warn(`[Setup] Aviso: ${e.message}`);
        }
      }
    }

    /* ── 2. Migração: garantir coluna username (para bancos existentes) ── */
    try {
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS username TEXT UNIQUE`;
    } catch { /* já existe */ }

    /* ── 2b. Migração: tabelas do módulo Social Media ── */
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS content_folders (
          id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          description TEXT,
          color       TEXT NOT NULL DEFAULT '#ff0033',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
    } catch { /* já existe */ }

    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_folders_tenant  ON content_folders(tenant_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_folders_account ON content_folders(account_id)`;
    } catch { /* já existe */ }

    try {
      await sql`ALTER TABLE contents ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES content_folders(id) ON DELETE SET NULL`;
    } catch { /* já existe */ }

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS user_account_permissions (
          id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          user_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(user_id, account_id)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_uap_user    ON user_account_permissions(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_uap_account ON user_account_permissions(account_id)`;
    } catch { /* já existe */ }

    /* ── 3. Criar usuário Alan Dias (admin principal) ── */
    const alanPassword = hashPassword('A30012003_dias');
    await sql`
      INSERT INTO tenants (name, email, username, password, role, is_active)
      VALUES (
        'Alan Dias',
        'alan.diasm.jr@gmail.com',
        'alan.dias',
        ${alanPassword},
        'admin',
        true
      )
      ON CONFLICT (email) DO UPDATE
        SET password = ${alanPassword},
            username = COALESCE(tenants.username, 'alan.dias'),
            name     = 'Alan Dias',
            role     = 'admin',
            is_active = true
    `;

    /* ── 4. Criar tenant admin genérico do .env (retrocompatibilidade) ── */
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@dashboard.local';
    const adminName  = process.env.ADMIN_NAME  || 'Admin';

    await sql`
      INSERT INTO tenants (name, email, role)
      VALUES (${adminName}, ${adminEmail}, 'admin')
      ON CONFLICT (email) DO NOTHING
    `;

    const tenant = await sql`SELECT id, email, name FROM tenants WHERE email = ${adminEmail}`;
    const alan   = await sql`SELECT id, email, name, username FROM tenants WHERE email = 'alan.diasm.jr@gmail.com'`;

    console.log('[SUCESSO][API:/api/setup] Banco configurado', { alanId: alan[0]?.id, adminId: tenant[0]?.id });
    return res.json({
      success: true,
      message: 'Banco configurado com sucesso!',
      alan:  { id: alan[0]?.id, email: alan[0]?.email, username: alan[0]?.username },
      admin: { id: tenant[0]?.id, email: tenant[0]?.email, name: tenant[0]?.name },
    });
  } catch (error) {
    console.error('[ERRO][API:/api/setup] Erro no endpoint', { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, error: error.message });
  }
}
