// infra/get-tenant-id.js
// ─────────────────────────────────────────────────────────────────────────────
// Resolve o tenant ID do request.
// Modelo single-workspace: TODOS os usuários autenticados pertencem ao mesmo
// workspace, definido por WORKSPACE_TENANT_ID no .env.
//
// IMPORTANTE: A tabela `tenants` armazena USUÁRIOS, não workspaces. Cada linha
// é uma pessoa que faz login. O isolamento por usuário (ex: tasks pessoais)
// deve ser feito via `assigned_to`/`created_by` nos models, NÃO via tenant_id.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o tenant ID (workspace global) para qualquer request.
 * Header `x-tenant-id` ainda é respeitado para cron jobs e testes de integração.
 *
 * @param {object} req - Request do Next.js
 * @returns {Promise<string>}
 */
async function resolveTenantId(req) {
  const headerId = req?.headers?.['x-tenant-id'];
  if (headerId) return headerId;

  const id = process.env.WORKSPACE_TENANT_ID;
  if (!id) {
    throw new Error(
      '[FATAL] WORKSPACE_TENANT_ID não configurado no .env. ' +
      'Defina o ID do tenant que servirá como workspace único da plataforma.'
    );
  }
  return id;
}

// Mantida pra compatibilidade com chamadas legadas; sem efeito real.
function clearTenantCache() {}

module.exports = { resolveTenantId, clearTenantCache };
