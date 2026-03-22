/**
 * pages/dashboard/clients/[id].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Info Cliente — 7 abas reorganizadas:
 *   Informações · Base de Dados · Afazeres · Anexos · Financeiro · Observações · Respostas
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '../../../components/DashboardLayout';
import StageModal from '../../../components/StageModal';
import PipelineModal from '../../../components/PipelineModal';
import { useNotification } from '../../../context/NotificationContext';
import { FORM_STEPS } from '../../../assets/data/formQuestions';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'info',       label: 'Informações',   icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { key: 'database',   label: 'Base de Dados', icon: 'M4 7h16M4 12h16M4 17h7' },
  { key: 'afazeres',   label: 'Afazeres',      icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { key: 'anexos',     label: 'Anexos',        icon: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' },
  { key: 'financeiro', label: 'Financeiro',    icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { key: 'observacoes',label: 'Observações',   icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
  { key: 'respostas',  label: 'Respostas',     icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
];

const STAGES_META = [
  { key: 'diagnosis',   index: 1, label: 'Diagnóstico do Negócio',  desc: 'Organiza os dados do cadastro e gera uma análise estratégica do negócio, produto e mercado.' },
  { key: 'competitors', index: 2, label: 'Análise de Concorrentes',  desc: 'Pesquisa e analisa os principais concorrentes: preço, posicionamento, pontos fortes e fracos.' },
  { key: 'audience',    index: 3, label: 'Público-Alvo',            desc: 'Define o perfil do público: demográfico, psicográfico, comportamental e nível de consciência.' },
  { key: 'avatar',      index: 4, label: 'Construção do Avatar',    desc: 'Constrói o cliente ideal com dores reais, desejos, objeções e linguagem que ele usa.' },
  { key: 'positioning', index: 5, label: 'Posicionamento da Marca', desc: 'Define como a marca se diferencia: proposta de valor, vantagem competitiva e promessa.' },
];

const STATUS_CFG = {
  pending:     { label: 'Pendente',     color: '#525252', bg: 'rgba(82,82,82,0.12)',   border: 'rgba(82,82,82,0.3)'   },
  in_progress: { label: 'Em andamento', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  done:        { label: 'Concluído',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)'  },
};

/* ═══════════════════════════════════════════════════════════
   ATOMS
═══════════════════════════════════════════════════════════ */
function Avatar({ src, name, size = 56 }) {
  const [err, setErr] = useState(false);
  const ini = (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (src && !err) {
    return (
      <img src={src} onError={() => setErr(true)} alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: Math.round(size * 0.35), fontWeight: 700, color: '#ff6680',
    }}>
      {ini || '?'}
    </div>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`,
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', color: c.color,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.color }} />
      {c.label}
    </span>
  );
}

function TabIcon({ d }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* Máscara de telefone (11) 99999-9999 */
function maskPhone(v) {
  let d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

/* Box "Como funciona" — reutilizado em todas as abas (exceto Info) */
function HowItWorks({ children }) {
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8, marginBottom: 22,
      background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'rgba(165,180,252,0.75)', lineHeight: 1.75 }}>
        <strong style={{ color: 'rgba(165,180,252,0.95)', display: 'block', marginBottom: 4 }}>Como funciona</strong>
        {children}
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
      letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
        color: 'var(--text-secondary)', letterSpacing: '0.04em',
      }}>
        {children}
      </div>
      {action}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '22px 0' }} />;
}

function PlaceholderTab({ label }) {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
        // {label} — em breve
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   BOTÃO + POPUP: ENVIAR FORMULÁRIO VIA WHATSAPP (Z-API)
   1. Clica → gera token → abre popup com mensagem editável
   2. No popup o operador revisa/edita a mensagem
   3. Clica "Enviar" → dispara via Z-API (send-text)
   Fica na aba Respostas e na coluna Ações da listagem.
═══════════════════════════════════════════════════════════ */
function WhatsAppFormModal({ client, onClose, onSent }) {
  const { notify } = useNotification();
  const [step, setStep]       = useState('generating'); // 'generating' | 'ready' | 'sending' | 'done'
  const [link, setLink]       = useState('');
  const [message, setMessage] = useState('');
  const [error, setError]     = useState(null);

  // Ao abrir: gera o token e monta a mensagem template
  useEffect(() => {
    (async () => {
      try {
        console.log('[INFO][Frontend:WhatsAppFormModal] Gerando token', { clientId: client.id });
        notify('# Gerando link do formulário...', 'info');
        const res = await fetch('/api/form/generate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: client.id }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        setLink(json.link);
        setMessage(
          `⚠️ *SIGMA HACKER // ACESSO ATIVADO*\n\n` +
          `Olá, *${client.company_name}*.\n\n` +
          `Isso não é um formulário.\n` +
          `É um *raio-X do seu negócio*.\n\n` +
          `O que você escrever aqui… define o nível da estratégia que você vai receber.\n\n` +
          `⏱ 25 a 40 min\n` +
          `📋 11 etapas (pode pausar e continuar)\n\n` +
          `⸻\n\n` +
          `🔐 *RESTRIÇÃO DE ACESSO*\n\n` +
          `Esse link foi gerado só pra você.\n\n` +
          `1 pessoa.\n` +
          `1 dispositivo.\n` +
          `7 dias.\n\n` +
          `Se trocar de aparelho ou encaminhar…\n` +
          `o sistema bloqueia.\n\n` +
          `⸻\n\n` +
          `Aqui não entra resposta rasa.\n\n` +
          `Ou você joga no raso…\n` +
          `ou você extrai o que poucos têm acesso.\n\n` +
          `⸻\n\n` +
          `👉 *LINK DO FORMULÁRIO* 🔓\n` +
          `${json.link}`
        );
        setStep('ready');
        console.log('[SUCESSO][Frontend:WhatsAppFormModal] Token gerado', { link: json.link });
      } catch (err) {
        console.error('[ERRO][Frontend:WhatsAppFormModal] Falha ao gerar token', { error: err.message });
        notify('! Erro ao gerar link: ' + err.message, 'error');
        setError(err.message);
        setStep('ready');
      }
    })();
  }, []);

  async function handleSend() {
    if (!message.trim()) {
      notify('! Mensagem não pode estar vazia.', 'error');
      return;
    }

    const phone = client.phone.replace(/\D/g, '');
    const phoneWithCountry = phone.startsWith('55') ? phone : `55${phone}`;

    setStep('sending');
    setError(null);
    try {
      console.log('[INFO][Frontend:WhatsAppFormModal] Enviando via Z-API', { clientId: client.id });
      notify('# Enviando mensagem via WhatsApp...', 'info');

      const res = await fetch('/api/form/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          phone: phoneWithCountry,
          message,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setStep('done');
      notify('> Formulário enviado para ' + client.company_name + ' via WhatsApp.', 'success');
      console.log('[SUCESSO][Frontend:WhatsAppFormModal] Mensagem enviada', { clientId: client.id });
      if (onSent) onSent();

      // Fecha automaticamente após 1.5s
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      console.error('[ERRO][Frontend:WhatsAppFormModal] Falha no envio', { error: err.message });
      notify('! Falha ao enviar: ' + err.message, 'error');
      setError(err.message);
      setStep('ready');
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card animate-scale-in"
        style={{ width: '100%', maxWidth: 520, padding: '24px', position: 'relative' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .612.616l4.573-1.453A11.949 11.949 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.336 0-4.512-.752-6.278-2.03l-.346-.27-3.277 1.042 1.076-3.2-.293-.372A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Enviar Formulário
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                {client.company_name} · {client.phone ? maskPhone(client.phone) : 'sem telefone'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Estado: gerando */}
        {step === 'generating' && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Gerando link exclusivo...
            </div>
          </div>
        )}

        {/* Estado: pronto para editar/enviar */}
        {(step === 'ready' || step === 'sending') && (
          <>
            {/* Textarea editável */}
            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
              }}>
                Mensagem (editável)
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={step === 'sending'}
                rows={12}
                style={{
                  width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.78rem',
                  fontFamily: 'var(--font-sans)', outline: 'none', resize: 'vertical',
                  lineHeight: 1.55, minHeight: 200,
                }}
              />
            </div>

            {/* Erro */}
            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, marginBottom: 14,
                background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.15)',
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--error)',
              }}>
                ! {error}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{
                padding: '8px 16px', borderRadius: 6,
                background: 'rgba(17,17,17,0.9)', border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                fontWeight: 500, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={step === 'sending' || !message.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 6,
                  background: 'linear-gradient(135deg, #1a8c44, #25D366)',
                  border: '1px solid rgba(37,211,102,0.4)',
                  color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                  fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                  cursor: step === 'sending' ? 'not-allowed' : 'pointer',
                  opacity: step === 'sending' ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .612.616l4.573-1.453A11.949 11.949 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.336 0-4.512-.752-6.278-2.03l-.346-.27-3.277 1.042 1.076-3.2-.293-.372A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
                {step === 'sending' ? 'Enviando...' : 'Enviar via WhatsApp'}
              </button>
            </div>
          </>
        )}

        {/* Estado: enviado com sucesso */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px',
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem',
            }}>
              ✓
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>
              Mensagem enviada!
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {client.company_name} recebeu o formulário via WhatsApp.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Botão que abre o popup WhatsAppFormModal */
function SendFormButton({ client, onSent, size = 'md' }) {
  const { notify } = useNotification();
  const [showModal, setShowModal] = useState(false);

  function handleClick() {
    if (client.form_done) {
      notify('O formulario deste cliente ja foi preenchido.', 'error');
      return;
    }
    if (!client.phone) {
      notify('Cadastre o telefone do cliente antes de enviar.', 'error');
      return;
    }
    setShowModal(true);
  }

  const isSmall = size === 'sm';

  return (
    <>
      <button
        onClick={handleClick}
        title="Enviar formulário via WhatsApp"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: isSmall ? '6px 10px' : '8px 14px', borderRadius: 6,
          background: 'linear-gradient(135deg, var(--brand-600), var(--brand-500))',
          border: '1px solid rgba(255,0,51,0.4)',
          color: '#fff',
          fontFamily: 'var(--font-mono)', fontSize: isSmall ? '0.6rem' : '0.68rem', fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <svg width={isSmall ? 12 : 14} height={isSmall ? 12 : 14} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .612.616l4.573-1.453A11.949 11.949 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.336 0-4.512-.752-6.278-2.03l-.346-.27-3.277 1.042 1.076-3.2-.293-.372A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
        </svg>
        Enviar Formulário
      </button>
      {showModal && (
        <WhatsAppFormModal
          client={client}
          onClose={() => setShowModal(false)}
          onSent={() => { setShowModal(false); if (onSent) onSent(); }}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: RESPOSTAS DO FORMULÁRIO
   Mostra status do formulário e respostas quando submetido.
═══════════════════════════════════════════════════════════ */
function TabRespostas({ clientId, client }) {
  const { notify } = useNotification();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Carrega status do formulário ao montar
  useEffect(() => {
    loadStatus();
  }, [clientId]);

  async function loadStatus() {
    setLoading(true);
    try {
      console.log('[INFO][Frontend:TabRespostas] Carregando status do formulário', { clientId });
      const res = await fetch(`/api/clients/${clientId}/form-status`);
      const json = await res.json();

      if (json.success) {
        setStatus(json);
      } else {
        setStatus({ hasToken: false, formStatus: 'not_sent' });
      }
    } catch (err) {
      console.error('[ERRO][Frontend:TabRespostas] Falha ao carregar status', { error: err.message });
      setStatus({ hasToken: false, formStatus: 'not_sent' });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Carregando status do formulário...
        </div>
      </div>
    );
  }

  // ── Estado: nunca enviou ──
  if (!status || status.formStatus === 'not_sent') {
    return (
      <div>
      <HowItWorks>
        Envie o formulário de briefing para o cliente responder. As respostas serão usadas para construir a estratégia de marketing.
        O link é válido por 7 dias e pode ser enviado via WhatsApp diretamente pelo sistema.
      </HowItWorks>
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <div className="glass-card" style={{ maxWidth: 480, margin: '0 auto', padding: '40px 32px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
            background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Formulário não enviado
          </h3>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
            O cliente ainda não recebeu o link do formulário de briefing.
          </p>
          <SendFormButton client={client} onSent={() => loadStatus()} />
        </div>
      </div>
      </div>
    );
  }

  // ── Estado: enviado mas não abriu ──
  if (status.formStatus === 'sent') {
    return (
      <div style={{ maxWidth: 600 }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          {/* Badge */}
          <div style={{ marginBottom: 16 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 20, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--info)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--info)' }} />
              Link enviado — aguardando resposta
            </span>
          </div>

          {/* Info */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <Label>Válido até</Label>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                {status.token?.expiresAt
                  ? new Date(status.token.expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </div>
            </div>
          </div>

          {/* Progress bar 0% */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Progresso
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>0%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,0,51,0.1)' }}>
              <div style={{ width: '0%', height: '100%', borderRadius: 2, background: 'var(--brand-500)', transition: 'width 0.5s' }} />
            </div>
          </div>

          <SendFormButton client={client} onSent={() => loadStatus()} size="sm" />
        </div>
      </div>
    );
  }

  // ── Estado: rascunho (em andamento) ──
  if (status.formStatus === 'draft') {
    const pct = Math.round(((status.draft?.currentStep || 1) - 1) / 11 * 100);
    return (
      <div style={{ maxWidth: 600 }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          {/* Badge */}
          <div style={{ marginBottom: 16 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 20, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--warning)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--warning)' }} />
              Em andamento
            </span>
          </div>

          {/* Info */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <Label>Etapa atual</Label>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                {status.draft?.currentStep || 1} de 11
              </div>
            </div>
            <div>
              <Label>Válido até</Label>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                {status.token?.expiresAt
                  ? new Date(status.token.expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '—'}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Progresso
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--warning)' }}>{pct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,0,51,0.1)' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--warning)', transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Estado: submetido ──
  if (status.formStatus === 'submitted') {
    return (
      <SubmittedResponses
        clientId={clientId}
        status={status}
        onDeleted={() => loadStatus()}
        notify={notify}
      />
    );
  }

  return null;
}

/* Respostas submetidas — com resumo IA + botão de apagar + modal de confirmação */
function SubmittedResponses({ clientId, status, onDeleted, notify }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState('all'); // 'all' | 'sections'
  const [selectedSections, setSelectedSections] = useState([]);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Resumo IA
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryChecked, setSummaryChecked] = useState(false);

  // Verifica se já existe resumo ao montar
  useEffect(() => {
    fetch(`/api/form/generate-summary?clientId=${clientId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.summary) setSummary(d.summary);
        setSummaryChecked(true);
      })
      .catch(() => setSummaryChecked(true));
  }, [clientId]);

  async function handleGenerateSummary() {
    setSummaryLoading(true);
    setShowSummaryModal(true);
    try {
      const res = await fetch('/api/form/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const result = await res.json();
      if (result.success) {
        setSummary(result.summary);
        notify('Resumo gerado com sucesso!', 'success');
      } else {
        notify(result.error || 'Erro ao gerar resumo.', 'error');
        setShowSummaryModal(false);
      }
    } catch (err) {
      notify('Erro de conexão ao gerar resumo.', 'error');
      setShowSummaryModal(false);
    } finally {
      setSummaryLoading(false);
    }
  }

  const data = status.draft?.data || {};
  const steps = [
    { num: 1,  title: 'Sua Empresa' },
    { num: 2,  title: 'Produtos e Serviços' },
    { num: 3,  title: 'Seu Cliente' },
    { num: 4,  title: 'Mercado e Concorrência' },
    { num: 5,  title: 'Contexto Externo' },
    { num: 6,  title: 'Forças e Diferenciais' },
    { num: 7,  title: 'Provas e Autoridade' },
    { num: 8,  title: 'Marketing Atual' },
    { num: 9,  title: 'Jornada do Cliente' },
    { num: 10, title: 'Objetivos e Metas' },
    { num: 11, title: 'Alinhamento' },
  ];

  const CONFIRM_PHRASE = 'APAGAR RESPOSTAS';
  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!canConfirm) return;
    setDeleting(true);
    try {
      const body = { clientId };
      if (deleteMode === 'sections' && selectedSections.length > 0) {
        body.sections = selectedSections;
      }
      const res = await fetch('/api/form/delete-responses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        notify(result.message, 'success');
        setShowDeleteModal(false);
        setConfirmText('');
        setSelectedSections([]);
        onDeleted();
      } else {
        notify(result.error || 'Erro ao apagar respostas.', 'error');
      }
    } catch (err) {
      notify('Erro de conexão ao apagar respostas.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function toggleSection(num) {
    setSelectedSections(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  }

  /* Renderiza markdown de forma segura como React elements */
  function renderSummaryText(text) {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      const t = line.trim();
      if (!t) return <div key={i} style={{ height: 8 }} />;
      if (t.startsWith('## ')) return <h3 key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '20px 0 8px', borderBottom: '1px solid rgba(255,0,51,0.15)', paddingBottom: 6 }}>{t.slice(3)}</h3>;
      if (t.startsWith('- ') || t.startsWith('* ')) return <div key={i} style={{ paddingLeft: 14, position: 'relative', marginBottom: 4 }}><span style={{ position: 'absolute', left: 0, color: 'var(--brand-500)' }}>·</span>{t.slice(2)}</div>;
      const parts = t.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) return <p key={i} style={{ marginBottom: 6 }}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p}</strong> : p)}</p>;
      return <p key={i} style={{ marginBottom: 6 }}>{t}</p>;
    });
  }

  return (
    <div>
      <HowItWorks>
        Respostas do formulario de briefing preenchido pelo cliente. Use o resumo IA para uma visao rapida
        ou expanda cada secao para ver as respostas detalhadas.
      </HowItWorks>
      {/* ── Card Resumo IA (estilo pipeline card) ── */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="2" strokeLinecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Resumo Estrategico IA
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
            Analise completa das respostas do formulario com insights, dores e recomendacoes.
          </div>
        </div>
        {summaryChecked && (
          summary ? (
            <button onClick={() => setShowSummaryModal(true)} style={{
              padding: '8px 18px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, border: 'none',
              background: 'rgba(255,0,51,0.1)', color: '#ff6680',
              fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
            }}>
              Ver Resumo
            </button>
          ) : (
            <button onClick={handleGenerateSummary} disabled={summaryLoading} style={{
              padding: '8px 18px', borderRadius: 8, cursor: summaryLoading ? 'not-allowed' : 'pointer', flexShrink: 0, border: 'none',
              background: 'linear-gradient(135deg, #ff0033, #cc0029)', color: '#fff',
              fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
              boxShadow: '0 0 12px rgba(255,0,51,0.2)',
            }}>
              {summaryLoading ? 'Gerando...' : 'Gerar Resumo'}
            </button>
          )
        )}
      </div>

      {/* ── Modal do resumo IA ── */}
      {showSummaryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="glass-card animate-scale-in" style={{ maxWidth: 680, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
                  <circle cx="9" cy="15" r="1" /><circle cx="15" cy="15" r="1" />
                </svg>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Resumo Estratégico</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {summary && !summaryLoading && (
                  <button onClick={handleGenerateSummary} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', background: 'rgba(17,17,17,0.8)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Regenerar
                  </button>
                )}
                <button onClick={() => setShowSummaryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
            {/* Conteúdo */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {summaryLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 16 }}>
                  <div className="spinner" style={{ width: 28, height: 28 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Analisando respostas e gerando resumo estratégico...</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Isso pode levar até 30 segundos</span>
                </div>
              ) : summary ? (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {renderSummaryText(summary.summary)}
                </div>
              ) : null}
            </div>
            {/* Footer */}
            {summary && !summaryLoading && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.04)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Modelo: {summary.model_used || '—'}</span>
                <span>Gerado em {new Date(summary.updated_at || summary.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Badge verde + botão apagar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            borderRadius: 20, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--success)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'syncPulse 2s infinite' }} />
            Formulário recebido
          </span>
          {status.draft?.submittedAt && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: 12 }}>
              Recebido em {new Date(status.draft.submittedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <button
          onClick={() => { setShowDeleteModal(true); setDeleteMode('all'); setConfirmText(''); setSelectedSections([]); }}
          className="btn-danger btn"
          style={{ fontSize: '0.6rem', padding: '5px 12px', gap: 5 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Apagar respostas
        </button>
      </div>

      {/* Progress bar 100% */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Progresso
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--success)' }}>100%</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,0,51,0.1)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 2, background: 'var(--success)', transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Respostas por etapa */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(step => (
          <StepCard key={step.num} step={step} data={data} />
        ))}
      </div>

      {/* ── Modal de confirmação de exclusão ── */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div className="glass-card animate-scale-in" style={{ maxWidth: 460, width: '100%', padding: '28px 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff1a4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Apagar respostas
                </h3>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            {/* Modo: tudo ou seções */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => { setDeleteMode('all'); setSelectedSections([]); }}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  background: deleteMode === 'all' ? 'rgba(255,0,51,0.12)' : 'rgba(17,17,17,0.8)',
                  border: `1px solid ${deleteMode === 'all' ? 'rgba(255,0,51,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: deleteMode === 'all' ? 'var(--brand-500)' : 'var(--text-secondary)',
                }}
              >
                Apagar tudo
              </button>
              <button
                onClick={() => setDeleteMode('sections')}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  background: deleteMode === 'sections' ? 'rgba(255,0,51,0.12)' : 'rgba(17,17,17,0.8)',
                  border: `1px solid ${deleteMode === 'sections' ? 'rgba(255,0,51,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: deleteMode === 'sections' ? 'var(--brand-500)' : 'var(--text-secondary)',
                }}
              >
                Por etapa
              </button>
            </div>

            {/* Seletor de etapas (se modo sections) */}
            {deleteMode === 'sections' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
                {steps.map(s => (
                  <label key={s.num} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 6, cursor: 'pointer',
                    background: selectedSections.includes(s.num) ? 'rgba(255,0,51,0.08)' : 'rgba(17,17,17,0.6)',
                    border: `1px solid ${selectedSections.includes(s.num) ? 'rgba(255,0,51,0.2)' : 'rgba(255,255,255,0.04)'}`,
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedSections.includes(s.num)}
                      onChange={() => toggleSection(s.num)}
                      style={{ accentColor: '#ff0033' }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-primary)' }}>
                      {s.num}. {s.title}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Campo de confirmação por texto */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                Digite <span style={{ color: 'var(--brand-500)', fontWeight: 700 }}>APAGAR RESPOSTAS</span> para confirmar
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="APAGAR RESPOSTAS"
                className="sigma-input"
                style={{ fontSize: '0.78rem' }}
                autoComplete="off"
              />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={!canConfirm || deleting || (deleteMode === 'sections' && selectedSections.length === 0)}
                className="btn btn-danger"
                style={{
                  flex: 1,
                  opacity: (canConfirm && (deleteMode === 'all' || selectedSections.length > 0)) ? 1 : 0.4,
                  cursor: (canConfirm && (deleteMode === 'all' || selectedSections.length > 0)) ? 'pointer' : 'not-allowed',
                }}
              >
                {deleting ? (
                  <><span className="spinner" style={{ width: 12, height: 12 }} /> Apagando...</>
                ) : (
                  deleteMode === 'all' ? 'Apagar tudo' : `Apagar ${selectedSections.length} etapa(s)`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Busca o label real da pergunta no FORM_STEPS pelo ID (ex: "1.1" → "Qual o nome da sua empresa?") */
function getQuestionLabel(questionId) {
  const stepNum = parseInt(questionId.split('.')[0], 10);
  const stepData = FORM_STEPS.find(s => s.step === stepNum);
  if (!stepData) return questionId;
  const question = stepData.questions.find(q => q.id === questionId);
  return question ? question.label : questionId;
}

/* Card colapsável para cada etapa do formulário — usado dentro de TabRespostas */
function StepCard({ step, data }) {
  const [open, setOpen] = useState(false);

  // Filtra respostas desta etapa: chaves que começam com "X." onde X é o número
  const prefix = `${step.num}.`;
  const entries = Object.entries(data)
    .filter(([key]) => key.startsWith(prefix) && !key.includes('_'))
    .sort(([a], [b]) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      return na - nb;
    });

  const hasAnswers = entries.some(([, val]) => val && (typeof val === 'string' ? val.trim() : true));

  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '12px 16px', border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--text-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
            color: 'var(--brand-500)', width: 20, textAlign: 'center',
          }}>
            {String(step.num).padStart(2, '0')}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>
            {step.title}
          </span>
          {!hasAnswers && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-muted)' }}>
              (sem respostas)
            </span>
          )}
        </div>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {entries.length === 0 ? (
            <div style={{ padding: '12px 0', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              — Nenhuma resposta nesta etapa
            </div>
          ) : (
            entries.map(([key, val]) => (
              <div key={key} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontSize: '0.72rem', fontWeight: 500,
                  color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.4,
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--brand-500)', marginRight: 6 }}>
                    {key}
                  </span>
                  {getQuestionLabel(key)}
                </div>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: val ? 'var(--text-primary)' : 'var(--text-muted)',
                  lineHeight: 1.5, whiteSpace: 'pre-wrap', paddingLeft: 2,
                }}>
                  {Array.isArray(val) ? val.filter(v => v !== '__other__').join(', ') : (val === '__other__' ? '(outro)' : (val || '—'))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const INP = {
  width: '100%', padding: '8px 11px', boxSizing: 'border-box',
  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.8rem',
  fontFamily: 'var(--font-mono)', outline: 'none',
};

const DEFAULT_SERVICES = [
  'Planejamento de campanha',
  'Edição de foto',
  'Edição de vídeo',
  'Gerenciamento de rede social',
  'Gerenciamento de tráfego pago',
  'Arte digital',
];

/* ═══════════════════════════════════════════════════════════
   TAB: INFORMAÇÕES GERAIS
═══════════════════════════════════════════════════════════ */
function TabInfo({ client, onSave }) {
  const { notify } = useNotification();
  const [form, setForm] = useState({
    company_name:    client.company_name  || '',
    niche:           client.niche         || '',
    email:           client.email         || '',
    phone:           client.phone         || '',
    avg_ticket:      client.avg_ticket    || '',
    region:          client.region        || '',
    main_product:    client.main_product  || '',
    status:          client.status        || 'active',
    logo_url:        client.logo_url      || '',
    inactive_reason: client.extra_data?.inactive_reason || '',
  });
  const [links,    setLinks   ] = useState(client.important_links || []);

  /* ── Serviços: toggle format ── */
  const [customSvc, setCustomSvc] = useState('');
  const [services, setServices] = useState(() => {
    const existingNames = (client.services || []).map(s => typeof s === 'string' ? s : s.name);
    const merged = DEFAULT_SERVICES.map((name, i) => ({ id: `svc-${i}`, name, selected: existingNames.includes(name) }));
    existingNames.forEach((name, idx) => {
      if (!DEFAULT_SERVICES.includes(name)) merged.push({ id: `custom-${idx}`, name, selected: true });
    });
    return merged;
  });

  /* ── Ticket médio derivado do contrato (soma de todos os contratos ativos) ── */
  const [contractMonthly, setContractMonthly] = useState(null);
  useEffect(() => {
    console.log('[INFO][Frontend:ClientDetail] Buscando contratos para ticket médio', { clientId: client.id });
    fetch(`/api/clients/${client.id}/contracts`)
      .then(r => r.json())
      .then(j => {
        if (j.success && j.contracts && j.contracts.length > 0) {
          const total = j.contracts.reduce((sum, c) => {
            const mv = parseFloat(c.monthly_value) || 0;
            return sum + mv;
          }, 0);
          if (total > 0) setContractMonthly(total);
          console.log('[SUCESSO][Frontend:ClientDetail] Contratos carregados para ticket médio', { total, count: j.contracts.length });
        }
      })
      .catch((err) => {
        console.error('[ERRO][Frontend:ClientDetail] Falha ao buscar contratos para ticket médio', { error: err.message });
      });
  }, [client.id]);

  const [saving,   setSaving  ] = useState(false);
  const [saved,    setSaved   ] = useState(false);
  const [err,      setErr     ] = useState(null);
  const [uploading,setUploading] = useState(false);
  const fileRef = useRef(null);

  function h(f) { return e => { setForm(p => ({ ...p, [f]: e.target.value })); setSaved(false); }; }

  /* ── Logo upload ── */
  async function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { notify('Imagem máxima: 3 MB', 'error'); return; }
    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      console.log('[INFO][Frontend:ClientDetail] Enviando logo do cliente', { fileName: file.name });
      const res  = await fetch('/api/clients/upload-logo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, base64, mimeType: file.type }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setForm(p => ({ ...p, logo_url: json.url }));
      setSaved(false);
      console.log('[SUCESSO][Frontend:ClientDetail] Logo enviado com sucesso', { url: json.url });
      notify('Logo atualizado com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao enviar logo', { error: err.message });
      notify('Erro ao fazer upload: ' + err.message, 'error');
    }
    finally { setUploading(false); }
  }

  /* ── Links importantes ── */
  function addLink()           { setLinks(l => [...l, { label: '', url: '' }]); }
  function removeLink(i)       { setLinks(l => l.filter((_, j) => j !== i)); }
  function updateLink(i, f, v) { setLinks(l => l.map((x, j) => j === i ? { ...x, [f]: v } : x)); }

  /* ── Serviços ── */
  function toggleService(i) { setServices(s => s.map((svc, j) => j === i ? { ...svc, selected: !svc.selected } : svc)); setSaved(false); }
  function addCustomService() {
    const name = customSvc.trim();
    if (!name) return;
    setServices(s => [...s, { id: `svc-${Date.now()}`, name, selected: true }]);
    setCustomSvc('');
    setSaved(false);
  }
  function removeCustomService(i) { setServices(s => s.filter((_, j) => j !== i)); setSaved(false); }

  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      const selectedServices = services.filter(s => s.selected).map(s => ({ id: s.id, name: s.name }));
      const existingExtra = client.extra_data || {};
      const extra_data = form.inactive_reason
        ? { ...existingExtra, inactive_reason: form.inactive_reason }
        : { ...existingExtra, inactive_reason: existingExtra.inactive_reason || '' };
      const { inactive_reason, ...formWithoutReason } = form;
      console.log('[INFO][Frontend:ClientDetail] Salvando informações do cliente', { clientId: client.id });
      const res  = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formWithoutReason,
          avg_ticket: contractMonthly !== null ? String(contractMonthly) : form.avg_ticket,
          important_links: links,
          services: selectedServices,
          extra_data,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSave(json.client);
      setSaved(true);
      console.log('[SUCESSO][Frontend:ClientDetail] Informações do cliente salvas', { clientId: client.id });
      notify('Informações salvas com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao salvar informações do cliente', { error: err.message });
      notify('Erro ao salvar: ' + err.message, 'error');
      setErr(err.message);
    }
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 780 }}>

      {/* ── Logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
        <Avatar src={form.logo_url} name={form.company_name} size={72} />
        <div>
          <Label>Logo do negócio</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleLogoFile}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
            }}
          >
            {uploading ? 'Enviando...' : form.logo_url ? 'Trocar logo' : 'Escolher imagem'}
          </button>
          {form.logo_url && (
            <button
              onClick={() => { setForm(p => ({ ...p, logo_url: '' })); setSaved(false); }}
              style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem' }}
            >
              remover
            </button>
          )}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 4 }}>
            JPG, PNG, WEBP · máx 3 MB
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Identificação ── */}
      <SectionTitle>Identificação</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div>
          <Label>Empresa / Marca *</Label>
          <input value={form.company_name} onChange={h('company_name')} style={INP} />
        </div>
        <div>
          <Label>Nicho</Label>
          <input value={form.niche} onChange={h('niche')} placeholder="ex: Fitness, Saúde..." style={INP} />
        </div>
        <div>
          <Label>E-mail</Label>
          <input type="email" value={form.email} onChange={h('email')} placeholder="contato@empresa.com" style={INP} />
        </div>
        <div>
          <Label>Telefone</Label>
          <input value={maskPhone(form.phone)} onChange={e => { setForm(p => ({ ...p, phone: maskPhone(e.target.value) })); setSaved(false); }} placeholder="(11) 99999-9999" style={INP} />
        </div>
        <div>
          <Label>Região / Mercado</Label>
          <input value={form.region} onChange={h('region')} placeholder="Brasil, Online..." style={INP} />
        </div>
        <div>
          <Label>Ticket Médio (contrato)</Label>
          <input
            value={contractMonthly !== null ? fmtBRL(contractMonthly) : (form.avg_ticket || '—')}
            readOnly
            style={{ ...INP, opacity: 0.55, cursor: 'default' }}
          />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', marginTop: 3 }}>
            Derivado do valor mensal do contrato
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Links importantes ── */}
      <SectionTitle
        action={
          <button onClick={addLink} style={{
            padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid rgba(255,0,51,0.2)', background: 'rgba(255,0,51,0.05)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          }}>
            + Link
          </button>
        }
      >
        Links Importantes
      </SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {links.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '12px 0' }}>
            Nenhum link adicionado. Clique em "+ Link" para adicionar.
          </div>
        )}
        {links.map((lk, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Rótulo (ex: Site, Instagram...)"
              value={lk.label}
              onChange={e => updateLink(i, 'label', e.target.value)}
              style={{ ...INP, flex: '0 0 180px', width: 180 }}
            />
            <input
              placeholder="https://..."
              value={lk.url}
              onChange={e => updateLink(i, 'url', e.target.value)}
              style={{ ...INP, flex: 1 }}
            />
            <button onClick={() => removeLink(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: '1rem', padding: '0 4px', flexShrink: 0,
            }}>×</button>
          </div>
        ))}
      </div>

      <Divider />

      {/* ── Serviços Fechados ── */}
      <SectionTitle>Serviços Fechados</SectionTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {services.map((svc, i) => (
          <div key={svc.id || i} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
            background: svc.selected ? 'rgba(255,0,51,0.1)' : 'rgba(17,17,17,0.6)',
            border: svc.selected ? '1px solid rgba(255,0,51,0.4)' : '1px solid rgba(255,255,255,0.06)',
          }} onClick={() => toggleService(i)}>
            <div style={{
              width: 14, height: 14, borderRadius: 4, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: svc.selected ? 'rgba(255,0,51,0.25)' : 'transparent',
              border: svc.selected ? '1.5px solid #ff0033' : '1.5px solid rgba(255,255,255,0.12)',
            }}>
              {svc.selected && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: svc.selected ? '#ff6680' : 'var(--text-muted)' }}>
              {svc.name}
            </span>
            {!DEFAULT_SERVICES.includes(svc.name) && (
              <button type="button" onClick={e => { e.stopPropagation(); removeCustomService(i); }} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                padding: 0, marginLeft: 2, fontSize: '0.8rem', lineHeight: 1,
              }}>×</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24 }}>
        <input
          type="text" value={customSvc} onChange={e => setCustomSvc(e.target.value)}
          placeholder="Adicionar serviço personalizado..."
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomService(); } }}
          style={{ ...INP, flex: 1 }}
        />
        <button type="button" onClick={addCustomService} style={{
          padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
          color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
        }}>+</button>
      </div>

      {/* ── Erro + Salvar ── */}
      {err && (
        <div style={{
          padding: '8px 12px', borderRadius: 7, marginBottom: 14,
          background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)',
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ff6680',
        }}>
          {err}
        </div>
      )}
      <button onClick={handleSave} disabled={saving} style={{
        padding: '9px 24px', borderRadius: 7,
        border: saved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,0,51,0.3)',
        background: saved ? 'rgba(34,197,94,0.08)' : 'rgba(255,0,51,0.1)',
        color: saved ? '#22c55e' : '#ff6680',
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600,
        cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
      }}>
        {saving ? 'Salvando...' : saved ? '✓ Salvo' : 'Salvar alterações'}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: BASE DE DADOS — grade com as 6 etapas
═══════════════════════════════════════════════════════════ */
function TabDatabase({ client, stages, onStageUpdated, onOpenPipeline }) {
  const [openMeta, setOpenMeta] = useState(null);

  function getStage(key) { return stages.find(s => s.stage_key === key) || null; }

  const validStageKeys = new Set(STAGES_META.map(s => s.key));
  const doneCount = stages.filter(s => validStageKeys.has(s.stage_key) && s.status === 'done').length;
  const progress  = Math.min(100, Math.round((doneCount / STAGES_META.length) * 100));

  return (
    <div>
      <HowItWorks>
        Aqui ficam os rascunhos gerados pelo pipeline. Clique em uma etapa para editar o output com ajuda da IA.
        Use o botao abaixo para rodar o pipeline completo (requer formulario preenchido).
      </HowItWorks>

      {/* Card Pipeline */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.15)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="2" strokeLinecap="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Pipeline de Agentes</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
            Executa 7 agentes de IA em sequencia para gerar rascunhos de todas as etapas. Disponivel apos o formulario.
          </div>
        </div>
        <button onClick={() => onOpenPipeline?.()} style={{
          padding: '8px 18px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, border: 'none',
          background: client.form_done ? 'linear-gradient(135deg, #ff0033, #cc0029)' : 'rgba(82,82,82,0.15)',
          color: client.form_done ? '#fff' : '#525252',
          fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
          boxShadow: client.form_done ? '0 0 12px rgba(255,0,51,0.2)' : 'none',
        }}>
          {client.form_done ? '\u25B6 Rodar Pipeline' : 'Aguardando formulario'}
        </button>
      </div>

      {/* Barra de progresso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.4s ease',
            width: `${progress}%`,
            background: progress === 100
              ? 'linear-gradient(90deg,#22c55e,#16a34a)'
              : 'linear-gradient(90deg,#ff0033,#ff6680)',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {doneCount}/{STAGES_META.length} · {progress}%
        </span>
      </div>

      {/* Grade */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: 10 }}>
        {STAGES_META.map(meta => {
          const stage  = getStage(meta.key);
          const status = stage?.status || 'pending';
          const c      = STATUS_CFG[status];
          const hasNotes = !!stage?.notes;

          return (
            <div
              key={meta.key}
              onClick={() => setOpenMeta(meta)}
              className="glass-card glass-card-hover"
              style={{ padding: '15px 17px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{
                    width: 27, height: 27, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: status === 'done' ? 'rgba(34,197,94,0.1)' : 'rgba(255,0,51,0.06)',
                    border: status === 'done' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,0,51,0.12)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
                    color: status === 'done' ? '#22c55e' : '#ff6680',
                  }}>
                    {String(meta.index).padStart(2, '0')}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {meta.label}
                  </span>
                </div>
                <StatusBadge status={status} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 9 }}>
                {meta.desc}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: hasNotes ? '#22c55e' : '#525252' }}>
                  {hasNotes ? '● notas salvas' : '○ sem notas'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'rgba(255,102,128,0.5)' }}>
                  Abrir →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {openMeta && (
        <StageModal
          meta={openMeta}
          stage={getStage(openMeta.key)}
          clientId={client.id}
          clientData={client}
          onClose={() => setOpenMeta(null)}
          onSaved={(updated) => onStageUpdated(openMeta.key, updated)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: ANEXOS
═══════════════════════════════════════════════════════════ */
function TabAnexos({ clientId }) {
  const { notify } = useNotification();
  const [attachments, setAttachments] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [form,        setForm       ] = useState({ title: '', description: '' });
  const [file,        setFile       ] = useState(null);
  const [uploading,   setUploading  ] = useState(false);
  const [uploadErr,   setUploadErr  ] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    console.log('[INFO][Frontend:ClientDetail] Carregando anexos', { clientId });
    fetch(`/api/clients/${clientId}/attachments`)
      .then(r => r.json())
      .then(j => {
        if (j.success) setAttachments(j.attachments);
        console.log('[SUCESSO][Frontend:ClientDetail] Anexos carregados', { count: j.attachments?.length || 0 });
      })
      .catch(err => {
        console.error('[ERRO][Frontend:ClientDetail] Falha ao carregar anexos', { error: err.message });
        notify('Erro ao carregar anexos', 'error');
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!form.title.trim()) { setUploadErr('Título é obrigatório'); return; }
    if (!file) { setUploadErr('Selecione um arquivo'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadErr('Arquivo máximo: 10 MB'); return; }
    setUploading(true); setUploadErr(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      console.log('[INFO][Frontend:ClientDetail] Enviando anexo', { clientId, title: form.title, fileName: file.name });
      const res  = await fetch(`/api/clients/${clientId}/attachments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description, fileName: file.name, base64, mimeType: file.type }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setAttachments(p => [json.attachment, ...p]);
      setForm({ title: '', description: '' });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      console.log('[SUCESSO][Frontend:ClientDetail] Anexo enviado com sucesso', { title: form.title });
      notify('Anexo adicionado com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao enviar anexo', { error: err.message });
      notify('Erro ao enviar anexo: ' + err.message, 'error');
      setUploadErr(err.message);
    }
    finally { setUploading(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Remover este anexo?')) return;
    try {
      console.log('[INFO][Frontend:ClientDetail] Excluindo anexo', { clientId, attachmentId: id });
      const res = await fetch(`/api/clients/${clientId}/attachments?attachmentId=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || 'Erro ao excluir');
      setAttachments(p => p.filter(a => a.id !== id));
      console.log('[SUCESSO][Frontend:ClientDetail] Anexo excluído', { attachmentId: id });
      notify('Anexo removido com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao excluir anexo', { error: err.message });
      notify('Erro ao excluir anexo: ' + err.message, 'error');
    }
  }

  function fileIcon(mime = '') {
    if (mime.startsWith('image/')) return '🖼';
    if (mime.includes('pdf'))      return '📄';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    return '📎';
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div>
      <HowItWorks>
        Envie arquivos importantes do cliente: contratos, briefings, logos, materiais de referência.
        Tamanho máximo de 10 MB por arquivo. Todos os anexos ficam organizados por data de envio.
      </HowItWorks>

      {/* Formulário de upload */}
      <div className="glass-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Novo Anexo
        </div>
        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Título *</Label>
              <input value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))}
                placeholder="Ex: Contrato, Briefing..." style={INP} />
            </div>
            <div>
              <Label>Arquivo *</Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileRef} type="file" onChange={e => setFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }} />
                <button type="button" onClick={() => fileRef.current?.click()} style={{
                  flex: 1, padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,10,10,0.8)',
                  color: file ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {file ? file.name : 'Escolher arquivo...'}
                </button>
                {file && (
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', flexShrink: 0 }}>
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
              placeholder="Breve descrição opcional..." style={INP} />
          </div>
          {uploadErr && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#ff6680' }}>{uploadErr}</div>
          )}
          <div>
            <button type="submit" disabled={uploading} style={{
              padding: '8px 20px', borderRadius: 7, cursor: uploading ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,0,51,0.3)', background: 'rgba(255,0,51,0.1)',
              color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
            }}>
              {uploading ? 'Enviando...' : 'Adicionar Anexo'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de anexos */}
      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Carregando...</div>}
      {!loading && attachments.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', padding: '20px 0' }}>
          Nenhum anexo adicionado.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {attachments.map(a => (
          <div key={a.id} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: '1.3rem', flexShrink: 0 }}>{fileIcon(a.mime_type)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {a.title}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{a.file_name}</span>
                {a.file_size > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{formatSize(a.file_size)}</span>}
                {a.description && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>— {a.description}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{
                padding: '4px 10px', borderRadius: 5, textDecoration: 'none',
                border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.06)',
                color: '#60a5fa', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Abrir
              </a>
              <button onClick={() => handleDelete(a.id)} style={{
                padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid rgba(255,26,77,0.2)', background: 'rgba(255,26,77,0.05)',
                color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
              }}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: OBSERVAÇÕES — múltiplas com editar/deletar
═══════════════════════════════════════════════════════════ */
function TabObservacoes({ clientId }) {
  const { notify } = useNotification();
  const [observations, setObservations] = useState([]);
  const [loading,      setLoading     ] = useState(true);
  const [newText,      setNewText     ] = useState('');
  const [adding,       setAdding      ] = useState(false);
  const [editingId,    setEditingId   ] = useState(null);
  const [editText,     setEditText    ] = useState('');
  const [savingEdit,   setSavingEdit  ] = useState(false);

  useEffect(() => {
    console.log('[INFO][Frontend:ClientDetail] Carregando observações', { clientId });
    fetch(`/api/clients/${clientId}/observations`)
      .then(r => r.json())
      .then(j => {
        if (j.success) setObservations(j.observations);
        console.log('[SUCESSO][Frontend:ClientDetail] Observações carregadas', { count: j.observations?.length || 0 });
      })
      .catch(err => {
        console.error('[ERRO][Frontend:ClientDetail] Falha ao carregar observações', { error: err.message });
        notify('Erro ao carregar observações', 'error');
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleAdd() {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      console.log('[INFO][Frontend:ClientDetail] Adicionando observação', { clientId });
      const res  = await fetch(`/api/clients/${clientId}/observations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setObservations(p => [json.observation, ...p]);
      setNewText('');
      console.log('[SUCESSO][Frontend:ClientDetail] Observação adicionada', { observationId: json.observation?.id });
      notify('Observação adicionada com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao adicionar observação', { error: err.message });
      notify('Erro ao adicionar observação: ' + err.message, 'error');
    }
    finally { setAdding(false); }
  }

  async function handleEdit(id) {
    if (!editText.trim()) return;
    setSavingEdit(true);
    try {
      console.log('[INFO][Frontend:ClientDetail] Editando observação', { clientId, observationId: id });
      const res  = await fetch(`/api/clients/${clientId}/observations`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observationId: id, text: editText }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setObservations(p => p.map(o => o.id === id ? json.observation : o));
      setEditingId(null);
      console.log('[SUCESSO][Frontend:ClientDetail] Observação editada', { observationId: id });
      notify('Observação atualizada com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao editar observação', { error: err.message });
      notify('Erro ao editar observação: ' + err.message, 'error');
    }
    finally { setSavingEdit(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta observação?')) return;
    try {
      console.log('[INFO][Frontend:ClientDetail] Excluindo observação', { clientId, observationId: id });
      const res = await fetch(`/api/clients/${clientId}/observations?observationId=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || 'Erro ao excluir');
      setObservations(p => p.filter(o => o.id !== id));
      console.log('[SUCESSO][Frontend:ClientDetail] Observação excluída', { observationId: id });
      notify('Observação excluída com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao excluir observação', { error: err.message });
      notify('Erro ao excluir observação: ' + err.message, 'error');
    }
  }

  function startEdit(obs) {
    setEditingId(obs.id);
    setEditText(obs.text);
  }

  return (
    <div>
      <HowItWorks>
        Registre anotações, insights e pontos importantes sobre o cliente.
        Use para guardar informações de reuniões, decisões e lembretes. Pressione ⌘Enter para salvar rapidamente.
      </HowItWorks>

      {/* Nova observação */}
      <div className="glass-card" style={{ padding: '16px 18px', marginBottom: 18 }}>
        <Label>Nova observação</Label>
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
          rows={3}
          placeholder="Escreva uma observação... (⌘Enter para salvar)"
          style={{
            ...INP, resize: 'vertical', lineHeight: 1.6, marginBottom: 10,
          }}
        />
        <button onClick={handleAdd} disabled={adding || !newText.trim()} style={{
          padding: '7px 18px', borderRadius: 6, cursor: (adding || !newText.trim()) ? 'not-allowed' : 'pointer',
          border: '1px solid rgba(255,0,51,0.3)', background: 'rgba(255,0,51,0.1)',
          color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
          opacity: !newText.trim() ? 0.5 : 1,
        }}>
          {adding ? 'Salvando...' : 'Adicionar'}
        </button>
      </div>

      {/* Lista */}
      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Carregando...</div>}
      {!loading && observations.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', padding: '12px 0' }}>
          Nenhuma observação ainda.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {observations.map(obs => (
          <div key={obs.id} className="glass-card" style={{ padding: '14px 16px' }}>
            {editingId === obs.id ? (
              <div>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={3}
                  style={{ ...INP, resize: 'vertical', lineHeight: 1.6, marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleEdit(obs.id)} disabled={savingEdit} style={{
                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                    color: '#22c55e', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  }}>
                    {savingEdit ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => setEditingId(null)} style={{
                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.06)', background: 'transparent',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                  {obs.text}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                    {new Date(obs.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {obs.updated_at !== obs.created_at && ' (editado)'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(obs)} style={{
                      padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
                      color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                    }}>
                      Editar
                    </button>
                    <button onClick={() => handleDelete(obs.id)} style={{
                      padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                      border: '1px solid rgba(255,26,77,0.2)', background: 'rgba(255,26,77,0.04)',
                      color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                    }}>
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: FINANCEIRO (múltiplos contratos, serviços vinculados)
═══════════════════════════════════════════════════════════ */
function fmtBRL(v) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.split('T')[0] : d;
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

function TabFinanceiro({ clientId, clientServices }) {
  const { notify } = useNotification();
  const [contracts, setContracts] = useState([]);
  const [loading,   setLoading  ] = useState(true);
  const [showForm,  setShowForm ] = useState(false);
  const [saving,    setSaving   ] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const EMPTY_FORM = {
    monthly_value: '', num_installments: '12',
    first_due_date: '', notes: '', services: [],
  };
  const [form, setForm] = useState(EMPTY_FORM);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  function effectiveStatus(inst) {
    if (inst.status === 'paid') return 'paid';
    if (new Date(inst.due_date) < today) return 'overdue';
    return 'pending';
  }

  const instStatusCfg = {
    paid:    { label: 'Pago',      color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)'  },
    overdue: { label: 'Atrasado',  color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
    pending: { label: 'Pendente',  color: '#525252', bg: 'rgba(82,82,82,0.1)',    border: 'rgba(82,82,82,0.25)'   },
  };

  async function load() {
    setLoading(true);
    try {
      console.log('[INFO][Frontend:ClientDetail] Carregando contratos', { clientId });
      const j = await fetch(`/api/clients/${clientId}/contracts`).then(r => r.json());
      if (j.success) setContracts(j.contracts || []);
      console.log('[SUCESSO][Frontend:ClientDetail] Contratos carregados', { count: j.contracts?.length || 0 });
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao carregar contratos', { error: err.message });
      notify('Erro ao carregar contratos', 'error');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [clientId]);

  function handleValueMask(e) {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) { setForm(f => ({ ...f, monthly_value: '' })); return; }
    const cents = parseInt(raw);
    const formatted = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setForm(f => ({ ...f, monthly_value: formatted }));
  }

  function toggleFormService(name) {
    setForm(f => {
      const has = f.services.includes(name);
      return { ...f, services: has ? f.services.filter(s => s !== name) : [...f.services, name] };
    });
  }

  function openNewForm() {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(1);
    const nextFirstDue = d.toISOString().split('T')[0];
    setForm({ ...EMPTY_FORM, first_due_date: nextFirstDue, services: (clientServices || []).map(s => s.name) });
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(c) {
    const mv = parseFloat(c.monthly_value) || parseFloat(c.contract_value) / (c.num_installments || 12);
    setForm({
      monthly_value: mv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      num_installments: String(c.num_installments || 12),
      first_due_date: c.start_date ? c.start_date.split('T')[0] : '',
      notes: c.notes || '',
      services: Array.isArray(c.services) ? c.services : (typeof c.services === 'string' ? JSON.parse(c.services || '[]') : []),
    });
    setEditingId(c.id);
    setShowForm(true);
  }

  async function handleSaveContract(e) {
    e.preventDefault();
    const rawVal = parseFloat((form.monthly_value || '0').replace(/\./g, '').replace(',', '.')) || 0;
    if (!rawVal || !form.first_due_date) { notify('Valor mensal e data da primeira parcela são obrigatórios.', 'error'); return; }
    const firstDue = new Date(form.first_due_date + 'T12:00:00');
    const dueDay   = firstDue.getDate();
    setSaving(true);
    try {
      const payload = {
        monthly_value: rawVal,
        num_installments: parseInt(form.num_installments) || 12,
        due_day: dueDay,
        start_date: form.first_due_date,
        notes: form.notes || null,
        services: form.services,
      };

      if (editingId) {
        payload.contractId = editingId;
        console.log('[INFO][Frontend:ClientDetail] Atualizando contrato', { clientId, contractId: editingId });
        const res = await fetch(`/api/clients/${clientId}/contracts`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error);
        setContracts(p => p.map(c => c.id === editingId ? j.contract : c));
        console.log('[SUCESSO][Frontend:ClientDetail] Contrato atualizado', { contractId: editingId });
        notify('Contrato atualizado com sucesso', 'success');
      } else {
        console.log('[INFO][Frontend:ClientDetail] Criando novo contrato', { clientId, monthly_value: rawVal });
        const res = await fetch(`/api/clients/${clientId}/contracts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error);
        setContracts(p => [j.contract, ...p]);
        console.log('[SUCESSO][Frontend:ClientDetail] Contrato criado', { contractId: j.contract?.id });
        notify('Contrato criado com sucesso', 'success');
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao salvar contrato', { error: err.message });
      notify('Erro ao salvar contrato: ' + err.message, 'error');
    }
    finally { setSaving(false); }
  }

  async function handleDeleteContract(contractId) {
    if (!confirm('Tem certeza que deseja excluir este contrato e todas as suas parcelas?')) return;
    try {
      console.log('[INFO][Frontend:ClientDetail] Excluindo contrato', { clientId, contractId });
      const res = await fetch(`/api/clients/${clientId}/contracts`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setContracts(p => p.filter(c => c.id !== contractId));
      console.log('[SUCESSO][Frontend:ClientDetail] Contrato excluído', { contractId });
      notify('Contrato excluído com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao excluir contrato', { error: err.message });
      notify('Erro ao excluir contrato: ' + err.message, 'error');
    }
  }

  async function toggleInstallment(contractId, inst) {
    const newStatus = inst.status === 'paid' ? 'pending' : 'paid';
    try {
      console.log('[INFO][Frontend:ClientDetail] Atualizando status da parcela', { contractId, installmentId: inst.id, newStatus });
      const res = await fetch(`/api/clients/${clientId}/installments`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: inst.id, status: newStatus }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setContracts(p => p.map(c => {
        if (c.id !== contractId) return c;
        return { ...c, installments: c.installments.map(i => i.id === inst.id ? j.installment : i) };
      }));
      console.log('[SUCESSO][Frontend:ClientDetail] Parcela atualizada', { installmentId: inst.id, status: newStatus });
      notify(newStatus === 'paid' ? 'Parcela marcada como paga' : 'Pagamento da parcela desfeito', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao atualizar parcela', { error: err.message });
      notify('Erro ao atualizar parcela: ' + err.message, 'error');
    }
  }

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '40px 0' }}>
      // carregando...
    </div>
  );

  /* ── Preview do form ── */
  const rawMonthly = parseFloat((form.monthly_value || '0').replace(/\./g, '').replace(',', '.')) || 0;
  const numP = parseInt(form.num_installments) || 0;
  const totalPreview = rawMonthly * numP;

  /* ── Available service names from client ── */
  const availableServices = (clientServices || []).map(s => s.name);

  /* ── KPIs globais ── */
  const allInstallments = contracts.flatMap(c => c.installments || []);
  const totalPaid    = allInstallments.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
  const totalPending = allInstallments.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
  const totalAll     = contracts.reduce((s, c) => s + parseFloat(c.contract_value || 0), 0);
  const paidCount    = allInstallments.filter(i => i.status === 'paid').length;

  const kpiStyle = {
    card: { padding: '14px 18px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', flex: 1, minWidth: 120 },
    val:  { fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 },
    lbl:  { fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  };

  return (
    <div>
      <HowItWorks>
        Cada contrato é vinculado a serviços específicos. As parcelas são geradas automaticamente (valor mensal x quantidade).
        Você pode ter múltiplos contratos por cliente. Parcelas vencidas são marcadas como <strong style={{ color: '#f97316' }}>Atrasadas</strong> automaticamente.
      </HowItWorks>

      {/* KPIs */}
      {contracts.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={kpiStyle.card}>
            <div style={{ ...kpiStyle.val, color: '#22c55e' }}>{fmtBRL(totalPaid)}</div>
            <div style={kpiStyle.lbl}>Total Arrecadado</div>
          </div>
          <div style={kpiStyle.card}>
            <div style={{ ...kpiStyle.val, color: '#f97316' }}>{fmtBRL(totalPending)}</div>
            <div style={kpiStyle.lbl}>A Receber</div>
          </div>
          <div style={kpiStyle.card}>
            <div style={kpiStyle.val}>{fmtBRL(totalAll)}</div>
            <div style={kpiStyle.lbl}>Total Contratos</div>
          </div>
          <div style={kpiStyle.card}>
            <div style={{ ...kpiStyle.val, fontSize: '0.85rem' }}>{paidCount}/{allInstallments.length}</div>
            <div style={kpiStyle.lbl}>Parcelas Pagas</div>
          </div>
        </div>
      )}

      {/* Botão novo contrato */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Contratos ({contracts.length})
        </div>
        {!showForm && (
          <button onClick={openNewForm} style={{
            padding: '7px 16px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
          }}>
            + Novo Contrato
          </button>
        )}
      </div>

      {/* Formulário criar/editar */}
      {showForm && (
        <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>
            {editingId ? 'Editar Contrato' : 'Novo Contrato'}
          </div>
          <form onSubmit={handleSaveContract}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 14 }}>
              <div>
                <Label>Valor Mensal (R$)</Label>
                <input value={form.monthly_value} onChange={handleValueMask} placeholder="0,00" style={INP} />
              </div>
              <div>
                <Label>Quantidade de Parcelas</Label>
                <input type="number" min="1" max="120" value={form.num_installments}
                  onChange={e => setForm(f => ({ ...f, num_installments: e.target.value }))} style={INP} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Data da Primeira Parcela</Label>
                <input type="date" value={form.first_due_date}
                  onChange={e => setForm(f => ({ ...f, first_due_date: e.target.value }))} style={INP} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', marginTop: 3 }}>
                  As demais parcelas seguem o mesmo dia do mês
                </div>
              </div>
            </div>

            {/* Serviços vinculados */}
            <div style={{ marginBottom: 14 }}>
              <Label>Serviços Vinculados</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {availableServices.map(name => {
                  const sel = form.services.includes(name);
                  return (
                    <button key={name} type="button" onClick={() => toggleFormService(name)} style={{
                      padding: '5px 10px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s',
                      background: sel ? 'rgba(255,0,51,0.1)' : 'rgba(17,17,17,0.6)',
                      border: sel ? '1px solid rgba(255,0,51,0.4)' : '1px solid var(--border-default)',
                      color: sel ? '#ff6680' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                    }}>
                      {sel ? '✓ ' : ''}{name}
                    </button>
                  );
                })}
                {availableServices.length === 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                    Nenhum serviço cadastrado na aba Informações.
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Label>Observações</Label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ ...INP, resize: 'vertical' }} />
            </div>

            {rawMonthly > 0 && numP > 0 && (
              <div style={{
                padding: '10px 14px', marginBottom: 16, borderRadius: 7,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#22c55e' }}>
                  {numP}x de {fmtBRL(rawMonthly)} = {fmtBRL(totalPreview)}{form.first_due_date ? ` · 1ª parcela: ${form.first_due_date.split('-').reverse().join('/')}` : ''}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{
                padding: '8px 20px', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer',
                border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
                color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
              }}>
                {saving ? 'Salvando...' : editingId ? 'Atualizar Contrato' : 'Salvar Contrato'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} style={{
                padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.06)', background: 'transparent',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de contratos */}
      {contracts.length === 0 && !showForm && (
        <div className="glass-card" style={{ padding: '36px 28px', textAlign: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
            <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Nenhum contrato cadastrado para este cliente.
          </div>
        </div>
      )}

      {contracts.map(c => {
        const svcs = Array.isArray(c.services) ? c.services : (typeof c.services === 'string' ? JSON.parse(c.services || '[]') : []);
        const insts = c.installments || [];
        const cPaid = insts.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
        const cPending = insts.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
        const expanded = expandedId === c.id;
        const mv = parseFloat(c.monthly_value) || parseFloat(c.contract_value) / (c.num_installments || insts.length || 1);

        return (
          <div key={c.id} className="glass-card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
            {/* Header do contrato */}
            <div style={{
              padding: '14px 18px', cursor: 'pointer',
              borderBottom: expanded ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }} onClick={() => setExpandedId(expanded ? null : c.id)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={expanded ? '#ff6680' : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    <polyline points="9,18 15,12 9,6" />
                  </svg>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {fmtBRL(mv)}/mês · {c.num_installments || insts.length}x
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Total: {fmtBRL(c.contract_value)} · Início: {fmtDate(c.start_date)} · Dia {c.due_day}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 600,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    background: c.status === 'active' ? 'rgba(34,197,94,0.08)' : 'rgba(82,82,82,0.1)',
                    border: c.status === 'active' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(82,82,82,0.25)',
                    color: c.status === 'active' ? '#22c55e' : '#525252',
                  }}>
                    {c.status === 'active' ? 'Ativo' : c.status === 'completed' ? 'Concluído' : 'Cancelado'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#22c55e' }}>
                    {fmtBRL(cPaid)}
                  </span>
                  {cPending > 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#f97316' }}>
                      / {fmtBRL(cPending)}
                    </span>
                  )}
                </div>
              </div>
              {/* Tags de serviço */}
              {svcs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, marginLeft: 24 }}>
                  {svcs.map((s, i) => (
                    <span key={i} style={{
                      padding: '2px 7px', borderRadius: 4,
                      background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.15)',
                      fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#ff6680',
                    }}>
                      {typeof s === 'string' ? s : s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Conteúdo expandido */}
            {expanded && (
              <div>
                {/* Ações */}
                <div style={{ padding: '10px 18px', display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <button onClick={e => { e.stopPropagation(); openEditForm(c); }} style={{
                    padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)',
                    color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  }}>
                    Editar
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDeleteContract(c.id); }} style={{
                    padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(255,26,77,0.25)', background: 'rgba(255,26,77,0.05)',
                    color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  }}>
                    Excluir
                  </button>
                </div>

                {c.notes && (
                  <div style={{ padding: '10px 18px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {c.notes}
                  </div>
                )}

                {/* Tabela de parcelas */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {['#', 'Vencimento', 'Valor', 'Status', 'Pago em', ''].map(h => (
                          <th key={h} style={{
                            padding: '8px 14px', textAlign: h === '' ? 'right' : 'left',
                            fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {insts.map(inst => {
                        const eff = effectiveStatus(inst);
                        const cfg = instStatusCfg[eff];
                        return (
                          <tr key={inst.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                              {inst.installment_number}
                            </td>
                            <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {fmtDate(inst.due_date)}
                            </td>
                            <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                              {fmtBRL(inst.value)}
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                                fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                                letterSpacing: '0.05em', textTransform: 'uppercase',
                                background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                              }}>
                                {cfg.label}
                              </span>
                            </td>
                            <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {inst.paid_at ? new Date(inst.paid_at).toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                              {inst.status !== 'paid' ? (
                                <button onClick={() => toggleInstallment(c.id, inst)} style={{
                                  padding: '3px 10px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                                  border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                                  color: '#22c55e', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                                }}>
                                  Marcar Pago
                                </button>
                              ) : (
                                <button onClick={() => toggleInstallment(c.id, inst)} style={{
                                  padding: '3px 10px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                                  border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
                                  color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                                }}>
                                  Desfazer
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {insts.length === 0 && (
                    <div style={{ padding: '20px 18px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      Nenhuma parcela gerada.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function ClientInfoPage() {
  const { notify } = useNotification();
  const router       = useRouter();
  const { id }       = router.query;
  const [activeTab,  setActiveTab ] = useState('info');
  const [client,     setClient    ] = useState(null);
  const [stages,     setStages    ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [error,      setError     ] = useState(null);
  const [showPipelineModal, setShowPipelineModal] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      console.log('[INFO][Frontend:ClientDetail] Carregando dados do cliente e estágios', { clientId: id });
      const [cRes, sRes] = await Promise.all([
        fetch(`/api/clients/${id}`),
        fetch(`/api/clients/${id}/stages`),
      ]);
      const cJson = await cRes.json();
      const sJson = await sRes.json();
      if (!cJson.success) throw new Error(cJson.error || 'Cliente não encontrado');
      setClient(cJson.client);
      setStages(sJson.success ? sJson.stages : []);
      console.log('[SUCESSO][Frontend:ClientDetail] Dados do cliente carregados', { clientId: id, stagesCount: sJson.stages?.length || 0 });
    } catch (err) {
      console.error('[ERRO][Frontend:ClientDetail] Falha ao carregar dados do cliente', { error: err.message });
      notify('Erro ao carregar cliente: ' + err.message, 'error');
      setError(err.message);
    }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handleStageUpdated(key, updated) {
    setStages(p => p.map(s => s.stage_key === key ? { ...s, ...updated } : s));
  }

  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = stages.length > 0 ? Math.min(100, Math.round((doneCount / STAGES_META.length) * 100)) : 0;

  if (loading) return (
    <DashboardLayout activeTab="clients">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', padding: 40 }}>
        // carregando...
      </div>
    </DashboardLayout>
  );

  if (error) return (
    <DashboardLayout activeTab="clients">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ff6680', padding: 40 }}>
        // erro: {error}
      </div>
    </DashboardLayout>
  );

  if (!client) return null;

  const clientStatus = client.status === 'active' ? 'done' : client.status === 'inactive' ? 'pending' : 'in_progress';

  return (
    <DashboardLayout activeTab="clients">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Link href="/dashboard/clients" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: 'var(--text-muted)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,18 9,12 15,6" />
          </svg>
          Clientes
        </Link>
        <span style={{ color: '#2a2a2a', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>/</span>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
          {client.company_name}
        </span>
      </div>

      {/* Header do cliente */}
      <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Avatar src={client.logo_url} name={client.company_name} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
              <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {client.company_name}
              </h1>
              <StatusBadge status={clientStatus} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {client.niche  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{client.niche}</span>}
              {client.region && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{client.region}</span>}
              {client.email  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{client.email}</span>}
              {client.phone  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{maskPhone(client.phone)}</span>}
            </div>
          </div>
          {/* Pipeline progress */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: progress === 100 ? '#22c55e' : 'var(--text-primary)' }}>
              {progress}%
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              pipeline
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.04)',
        marginBottom: 24, overflowX: 'auto', gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 15px', border: 'none', cursor: 'pointer', background: 'transparent',
                flexShrink: 0,
                borderBottom: active ? '2px solid #ff0033' : '2px solid transparent',
                color: active ? '#ff6680' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: active ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              <TabIcon d={tab.icon} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div>
        {activeTab === 'info'       && <TabInfo client={client} onSave={setClient} />}
        {activeTab === 'database'   && (
          <TabDatabase client={client} stages={stages} onStageUpdated={handleStageUpdated} onOpenPipeline={() => setShowPipelineModal(true)} />
        )}
        {activeTab === 'afazeres'   && <PlaceholderTab label="Afazeres" />}
        {activeTab === 'anexos'     && <TabAnexos clientId={client.id} />}
        {activeTab === 'financeiro' && <TabFinanceiro clientId={client.id} clientServices={client.services || []} />}
        {activeTab === 'observacoes'&& <TabObservacoes clientId={client.id} />}
        {activeTab === 'respostas'  && <TabRespostas clientId={client.id} client={client} />}
      </div>

      {/* Pipeline Modal */}
      {showPipelineModal && client && (
        <PipelineModal
          client={client}
          onClose={() => setShowPipelineModal(false)}
          onComplete={() => {
            setShowPipelineModal(false);
            setActiveTab('database');
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}
