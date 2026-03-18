import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../assets/style/login.module.css';
import { useNotification } from '../context/NotificationContext';

/* ── Mensagens flutuantes de fundo (estilo hacker) ── */
const HACKER_MSGS = [
  'INJECT PAYLOAD 0xFA4B...', 'BYPASSING KERNEL FIREWALL...',
  'PING 192.168.1.10 TTL=64', 'DECRYPTING HASH SHA-256...',
  'ACCESSING MAINFRAME ENCLAVE...', 'SSH root@192.168.1.1 -p 22',
  'INIT SIGMA PROTOCOL v4.2...', 'AUTH MODULE LOADED [OK]',
  'OVERFLOW BUFFER 0x7FFF...', 'NET SNIFF INTERFACE eth0',
  'KERNEL MODULE INSERTED OK', 'PORT SCAN 0-65535 DONE',
  'ESTABLISHING SECURE UPLINK', 'AES-256 KEY EXCHANGE DONE',
  'SIGMA.OS KERNEL 5.15.0-LTS', 'VERIFYING TOKEN INTEGRITY...',
];

/* ── Sequência de boot pós-login (8 etapas × 700ms ≈ 5.6s + 800ms redirect) ── */
const BOOT_SEQUENCE = [
  '[ OK  ] Iniciando kernel SIGMA 5.15.0...',
  '[ OK  ] Montando sistemas de arquivos remotos...',
  '[ OK  ] Iniciando módulos de segurança...',
  '[ OK  ] Verificando permissões de acesso...',
  '[WAIT ] Autenticando operador... por favor aguarde...',
  '[ OK  ] Descriptografando chave primária do operador...',
  '[ OK  ] Sincronizando módulos do sistema...',
  '[ OK  ] Carregando arquivos e programas [100%]',
];

function EyeIcon({ open }) {
  if (open) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function Login() {
  const router     = useRouter();
  const { notify } = useNotification();

  const [credential, setCredential] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [bootStep,   setBootStep]   = useState(0);
  const [logs,       setLogs]       = useState([]);

  /* Gera mensagens hacker flutuantes em intervalo */
  useEffect(() => {
    const id = setInterval(() => {
      setLogs(prev => {
        const next = [...prev, {
          id:   Date.now(),
          text: HACKER_MSGS[Math.floor(Math.random() * HACKER_MSGS.length)],
          top:  `${5  + Math.random() * 88}%`,
          left: `${2  + Math.random() * 88}%`,
        }];
        return next.slice(-20);
      });
    }, 1200);
    return () => clearInterval(id);
  }, []);

  /* ── Submissão: chama API de login ── */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      console.log('[INFO][Frontend:Login] Enviando credenciais para /api/auth/login', { credential: credential.trim() });
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credential.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        console.error('[ERRO][Frontend:Login] Falha na autenticação', { status: res.status, error: data.error });
        notify(data.error || 'Falha ao autenticar. Tente novamente.', 'error');
        setSubmitting(false);
        return;
      }

      console.log('[SUCESSO][Frontend:Login] Login realizado com sucesso', { credential: credential.trim() });

      /* Login ok — inicia animação de boot */
      setLoading(true);
      setSubmitting(false);

      let step = 0;
      const bootId = setInterval(() => {
        step++;
        setBootStep(step);
        if (step >= BOOT_SEQUENCE.length) {
          clearInterval(bootId);
          setTimeout(() => router.push('/dashboard'), 800);
        }
      }, 700);

    } catch (err) {
      console.error('[ERRO][Frontend:Login] Erro de conexão ao tentar login', { error: err.message });
      notify('Erro de conexão. Verifique sua rede.', 'error');
      setSubmitting(false);
    }
  };

  /* ── Tela de boot (exibida após login bem-sucedido) ── */
  if (loading) {
    return (
      <div className={styles.bootScreen}>
        <Head><title>SIGMA | Inicializando...</title></Head>
        <div className="hud-scanlines" />
        <div className="hud-vignette" />

        <div style={{ width: '100%', maxWidth: 640, position: 'relative', zIndex: 10 }}>
          {/* Cabeçalho do OS */}
          <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #1a1a1a' }}>
            <div style={{ fontSize: '0.7rem', color: '#525252', marginBottom: 4 }}>
              SIGMA OS — Versão 5.15.0-LTS
            </div>
            <div style={{ fontSize: '0.7rem', color: '#525252' }}>
              © Corporação SIGMA. Todos os direitos reservados.
            </div>
          </div>

          {/* Linhas de boot */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {BOOT_SEQUENCE.slice(0, bootStep).map((line, i) => (
              <div key={i} className="animate-fade-in-up" style={{
                fontSize: '0.72rem',
                fontFamily: "'JetBrains Mono', monospace",
                color: line.includes('[WAIT') ? '#f97316' : '#a3a3a3',
              }}>
                {line}
              </div>
            ))}

            {/* Cursor piscando */}
            {bootStep < BOOT_SEQUENCE.length && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: '0.72rem', color: '#525252' }}>_</span>
                <span className="animate-cursor-blink" style={{ fontSize: '0.72rem', color: '#ff0033' }}>▋</span>
              </div>
            )}

            {/* Mensagem final de boas-vindas */}
            {bootStep >= BOOT_SEQUENCE.length && (
              <div className="animate-fade-in-up" style={{
                marginTop: 16, fontSize: '0.8rem', color: '#22c55e',
                fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              }}>
                [ OK  ] Bem vindo, {credential || 'Operador'}. Acesso concedido._
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Página de login ── */
  return (
    <div className={`${styles.page} circuit-grid`}>
      <Head><title>SIGMA | Login</title></Head>

      {/* ── Background animado ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', backgroundColor: '#020202' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(255,0,51,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,51,0.06) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
        <div className="animate-line-scan" style={{ zIndex: 1 }} />
        <div className="animate-line-scan" style={{ animationDelay: '2s', zIndex: 1 }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(255,0,51,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, background: 'radial-gradient(circle, rgba(255,0,51,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -100, width: 400, height: 400, background: 'radial-gradient(circle, rgba(255,0,51,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Nós de radar */}
        {[
          { top: '15%', left: '10%', delay: '0s',   size: 10 },
          { top: '70%', left: '8%',  delay: '0.8s', size: 8  },
          { top: '30%', left: '80%', delay: '0.3s', size: 10 },
          { top: '80%', left: '75%', delay: '1.2s', size: 8  },
          { top: '55%', left: '45%', delay: '0.6s', size: 12 },
          { top: '10%', left: '55%', delay: '1.5s', size: 8  },
          { top: '85%', left: '35%', delay: '0.9s', size: 8  },
          { top: '20%', left: '35%', delay: '1.8s', size: 6  },
        ].map((node, idx) => (
          <div key={idx} style={{ position: 'absolute', top: node.top, left: node.left, width: node.size, height: node.size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', width: node.size * 0.35, height: node.size * 0.35, borderRadius: '50%', background: 'rgba(255,0,51,0.7)', boxShadow: '0 0 6px rgba(255,0,51,0.5)' }} />
            <div className="animate-radar-pulse" style={{ position: 'absolute', width: node.size, height: node.size, borderRadius: '50%', border: '1px solid rgba(255,0,51,0.4)', animationDelay: node.delay }} />
            <div className="animate-radar-pulse" style={{ position: 'absolute', width: node.size, height: node.size, borderRadius: '50%', border: '1px solid rgba(255,0,51,0.25)', animationDelay: `calc(${node.delay} + 0.5s)` }} />
          </div>
        ))}

        {/* Colchetes HUD */}
        {[
          { top: 12,    left: 12,  borderTop:    '1px solid rgba(255,0,51,0.3)', borderLeft:  '1px solid rgba(255,0,51,0.3)' },
          { top: 12,    right: 12, borderTop:    '1px solid rgba(255,0,51,0.3)', borderRight: '1px solid rgba(255,0,51,0.3)' },
          { bottom: 12, left: 12,  borderBottom: '1px solid rgba(255,0,51,0.3)', borderLeft:  '1px solid rgba(255,0,51,0.3)' },
          { bottom: 12, right: 12, borderBottom: '1px solid rgba(255,0,51,0.3)', borderRight: '1px solid rgba(255,0,51,0.3)' },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: 28, height: 28, ...s, pointerEvents: 'none' }} />
        ))}

        <div className="hud-scanlines" style={{ opacity: 0.5 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)', pointerEvents: 'none' }} />
      </div>

      {/* Mensagens hacker flutuantes */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}>
        {logs.map(log => (
          <div key={log.id} className="animate-fade-in-up" style={{ position: 'absolute', top: log.top, left: log.left, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {log.text}
          </div>
        ))}
      </div>

      {/* ── Card de login ── */}
      <div className={`glass-card animate-scale-in ${styles.card}`}>
        {/* Linha de destaque no topo */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,0,51,0.4), transparent)', borderRadius: '12px 12px 0 0' }} />

        {/* Cabeçalho */}
        <div style={{ marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 18, color: '#ff0033' }}>S</span>
            <div className="animate-radar-pulse" style={{ position: 'absolute', inset: 0, borderRadius: 10, border: '1px solid rgba(255,0,51,0.4)' }} />
          </div>

          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '1.1rem', color: '#f0f0f0', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
            SIGMA <span style={{ color: '#ff0033' }}>HACKER</span>
          </div>
          <div className="label-micro" style={{ marginTop: 6 }}>Sistema Operacional Interno</div>
        </div>

        {/* Tag de seção */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
          <span className="label-micro" style={{ color: '#ff0033' }}>EFETUE O LOGIN</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,0,51,0.2), transparent)' }} />
          <div className="animate-sync-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
        </div>

        {/* Formulário */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* E-mail ou username */}
          <div>
            <label className="label-micro" style={{ display: 'block', marginBottom: 6 }}>
              E-mail ou Usuário
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: '#ff0033' }}>{'>'}</span>
              <input type="text" required value={credential} onChange={e => setCredential(e.target.value)} placeholder="operador@sigma.tech ou alan.dias" className="sigma-input" style={{ paddingLeft: 26 }} autoComplete="username" />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label className="label-micro" style={{ display: 'block', marginBottom: 6 }}>
              Senha Operacional
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: '#ff0033' }}>*</span>
              <input type={showPw ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" className="sigma-input" style={{ paddingLeft: 26, paddingRight: 40 }} autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#525252', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#f0f0f0'} onMouseLeave={e => e.currentTarget.style.color = '#525252'}>
                <EyeIcon open={showPw} />
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 8, width: '100%', padding: '0.7rem',
              background: submitting ? 'rgba(255,0,51,0.5)' : '#ff0033',
              border: 'none', borderRadius: 6, color: '#f0f0f0',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={e => { if (!submitting) { e.currentTarget.style.background = '#ff1a4d'; e.currentTarget.style.boxShadow = '0 0 24px rgba(255,0,51,0.3)'; } }}
            onMouseLeave={e => { if (!submitting) { e.currentTarget.style.background = '#ff0033'; e.currentTarget.style.boxShadow = 'none'; } }}
          >
            {submitting ? (
              <>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                Autenticando...
              </>
            ) : 'Iniciar Sessão'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 5, color: '#525252' }}>●</span>
          <span className="label-micro">v1.0 · Acesso Restrito · Monitorado</span>
        </div>
      </div>
    </div>
  );
}
