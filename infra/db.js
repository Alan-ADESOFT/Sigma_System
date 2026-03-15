const { neon } = require('@neondatabase/serverless');

// Pool de conexao Neon - uma unica instancia reutilizada
let _sql = null;

function getDb() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL nao configurada. Configure no .env');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Helper: executa query e retorna rows
async function query(text, params = []) {
  const sql = getDb();
  return sql(text, params);
}

// Helper: retorna primeira row ou null
async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

module.exports = { getDb, query, queryOne };
