/**
 * pages/api/onboarding/prepare.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/onboarding/prepare
 * Body: { clientId }
 *
 * Cria (ou retorna) o `onboarding_progress` do cliente SEM ativar a jornada.
 * Usado pelo modal "Enviar Formulário" na tela do cliente (dashboard):
 *
 *   1. Operador clica "Enviar Formulário"
 *   2. Este endpoint é chamado → gera o token + link
 *   3. Modal mostra o link na mensagem editável (pro operador revisar)
 *   4. Operador clica "Enviar" → aí sim /api/onboarding/activate-first é
 *      chamado, que marca status='active' e loga a notificação do dia 1.
 *
 * Separamos em dois passos pra que, se o operador abrir o modal e fechar
 * sem enviar, o cliente NÃO fique com onboarding ativo sem ter recebido
 * nada. O registro fica em 'not_started' até o envio efetivo.
 *
 * Retorno: { success, token, link, companyName }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getOrCreateProgress } from '../../../models/onboarding';

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { queryOne } = require('../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const { clientId } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
    }

    console.log('[INFO][API:onboarding/prepare] start', { clientId });

    // Valida que o cliente existe e pertence ao tenant
    const client = await queryOne(
      `SELECT id, company_name, phone FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const progress = await getOrCreateProgress(clientId, tenantId);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    const link = `${baseUrl}/onboarding/${progress.token}`;

    console.log('[SUCESSO][API:onboarding/prepare] link gerado', { clientId, hasToken: !!progress.token });

    return res.json({
      success: true,
      token: progress.token,
      link,
      companyName: client.company_name,
      phone: client.phone,
      status: progress.status,
    });
  } catch (err) {
    console.error('[ERRO][API:onboarding/prepare]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
