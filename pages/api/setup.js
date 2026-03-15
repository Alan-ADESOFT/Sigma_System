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

    return res.json({
      success: true,
      message: 'Banco configurado com sucesso!',
      alan:  { id: alan[0]?.id, email: alan[0]?.email, username: alan[0]?.username },
      admin: { id: tenant[0]?.id, email: tenant[0]?.email, name: tenant[0]?.name },
    });
  } catch (error) {
    console.error('[/api/setup] Erro:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
