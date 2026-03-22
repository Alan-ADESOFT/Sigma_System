/**
 * pages/api/form/generate-token.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gera um token único para o cliente acessar o formulário público.
 * O operador chama essa rota antes de enviar o link ao cliente.
 *
 * POST — Body: { clientId }
 * Retorna: { success, token, expiresAt, link }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { getClientById } from '../../../models/client.model';
import { generateFormToken } from '../../../models/clientForm';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/form/generate-token] Requisição recebida', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
    }

    // Confirma que o cliente existe e pertence ao tenant
    const client = await getClientById(clientId, tenantId);
    if (!client) {
      console.log('[ERRO][API:/api/form/generate-token] Cliente não encontrado', { clientId, tenantId });
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const tokenRow = await generateFormToken(tenantId, clientId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    const link = `${baseUrl}/form/${tokenRow.token}`;

    console.log('[SUCESSO][API:/api/form/generate-token] Token gerado', { clientId, tokenId: tokenRow.id });
    return res.status(201).json({
      success: true,
      token: tokenRow.token,
      tokenId: tokenRow.id,
      expiresAt: tokenRow.expires_at,
      link,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/form/generate-token] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
