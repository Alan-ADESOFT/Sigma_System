/**
 * components/financeiro/ChargeModal.jsx
 * Popup de cobrança MANUAL de uma parcela.
 *
 * Mostra a mensagem pré-preenchida (do template configurado em Config. Financeiro,
 * com as tags resolvidas) e EDITÁVEL. Só envia ao confirmar. Estilo inline para
 * casar com a página financeiro.js (que não usa CSS Modules).
 */

import { useState, useEffect } from 'react';

function resolveMessage(template, inst) {
  const dueStr = (inst.due_date || '').split('T')[0];
  const [y, m, d] = dueStr.split('-');
  const dataBR = d && m && y ? `${d}/${m}/${y}` : dueStr;
  const valor = (parseFloat(inst.value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueStr + 'T00:00:00');
  const diff = Math.floor((today - due) / 86400000);
  const vars = {
    nome: inst.company_name || '',
    numero: String(inst.installment_number || ''),
    data: dataBR,
    valor,
    dias_atraso: String(diff > 0 ? diff : 0),
  };
  let msg = template || '';
  for (const [k, v] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return msg;
}

/* Normaliza services do contrato (JSONB: array de strings, objetos {id,name},
   string JSON, ou com nulls de dados legados) → array de nomes únicos. */
function serviceNames(raw) {
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr || '[]'); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  const names = arr
    .map(s => (typeof s === 'string' ? s : (s && typeof s === 'object' ? s.name : null)))
    .filter(s => typeof s === 'string' && s.trim())
    .map(s => s.trim());
  return [...new Set(names)];
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
};
const modal = {
  width: '100%', maxWidth: 520, background: 'rgba(14,14,16,0.98)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden',
  boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
};
const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
};

export default function ChargeModal({ installment, template, onClose, onSent }) {
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const hasPhone = !!installment.phone;
  const hasGroup = !!installment.whatsapp_group_id;
  const [channel, setChannel] = useState(hasPhone ? 'personal' : (hasGroup ? 'group' : 'personal'));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dirty) setMessage(resolveMessage(template, installment));
  }, [template, installment, dirty]);

  const noTarget = !hasPhone && !hasGroup;

  async function handleSend() {
    if (!message.trim()) { setError('A mensagem não pode ficar vazia'); return; }
    setSending(true);
    setError(null);
    try {
      console.log('[INFO][Frontend:ChargeModal] Enviando cobrança', { installmentId: installment.id, channel });
      const j = await fetch('/api/financeiro/charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: installment.id, message, channel }),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error || 'Falha ao enviar');
      console.log('[SUCESSO][Frontend:ChargeModal] Cobrança enviada', { installmentId: installment.id });
      onSent && onSent();
    } catch (e) {
      console.error('[ERRO][Frontend:ChargeModal] Falha ao enviar cobrança', { error: e.message });
      setError(e.message);
      setSending(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Cobrar parcela
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {installment.company_name} · Parcela #{installment.installment_number}
            </div>
            {(() => {
              const svcs = serviceNames(installment.contract_services);
              if (svcs.length === 0) return null;
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {svcs.map((s, i) => (
                    <span key={i} style={{
                      padding: '2px 7px', borderRadius: 4,
                      background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.15)',
                      fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#ff6680',
                    }}>{s}</span>
                  ))}
                </div>
              );
            })()}
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: '1.1rem', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px' }}>
          {/* Canal */}
          {!noTarget && (hasPhone && hasGroup) && (
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Enviar para</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { v: 'personal', l: 'Número pessoal' },
                  { v: 'group', l: 'Grupo WhatsApp' },
                ].map(o => (
                  <button key={o.v} type="button" onClick={() => setChannel(o.v)} style={{
                    flex: 1, padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 600,
                    background: channel === o.v ? 'rgba(255,0,51,0.1)' : 'rgba(17,17,17,0.6)',
                    border: channel === o.v ? '1px solid rgba(255,0,51,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    color: channel === o.v ? '#ff6680' : 'var(--text-muted)',
                  }}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {noTarget ? (
            <div style={{
              padding: '14px', borderRadius: 8, background: 'rgba(249,115,22,0.08)',
              border: '1px solid rgba(249,115,22,0.25)', fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem', color: '#f97316',
            }}>
              Este cliente não tem telefone nem grupo de WhatsApp cadastrado. Cadastre na ficha do cliente para poder cobrar.
            </div>
          ) : (
            <>
              <div style={labelStyle}>Mensagem (editável)</div>
              <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); setDirty(true); }}
                rows={9}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '12px 14px',
                  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.74rem',
                  fontFamily: 'var(--font-mono)', lineHeight: 1.5, outline: 'none', resize: 'vertical',
                }}
              />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', marginTop: 6 }}>
                A mensagem já vem com os dados do cliente preenchidos. Ajuste o texto antes de enviar, se precisar.
              </div>
            </>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 7,
              background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)',
              fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: '#ff6680',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={sending} style={{
            padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
          }}>
            Cancelar
          </button>
          <button onClick={handleSend} disabled={sending || noTarget || !message.trim()} style={{
            padding: '8px 18px', borderRadius: 7,
            cursor: (sending || noTarget || !message.trim()) ? 'not-allowed' : 'pointer',
            border: '1px solid rgba(255,0,51,0.4)',
            background: (sending || noTarget) ? 'rgba(255,0,51,0.04)' : 'rgba(255,0,51,0.12)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
            opacity: (sending || noTarget || !message.trim()) ? 0.6 : 1,
          }}>
            {sending ? 'Enviando...' : 'Enviar cobrança'}
          </button>
        </div>
      </div>
    </div>
  );
}
