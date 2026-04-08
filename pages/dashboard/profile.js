/**
 * pages/dashboard/profile.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página de perfil do usuário — acessível por todos os cargos.
 * Permite editar dados pessoais, avatar e senha.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../context/NotificationContext';

const ROLE_LABELS = { god: 'GOD', admin: 'ADMIN', user: 'USER' };

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const { addNotification } = useNotification();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/profile');
        const d = await r.json();
        if (d.success && d.user) {
          setProfile(d.user);
          setName(d.user.name || '');
          setEmail(d.user.email || '');
          setUsername(d.user.username || '');
          setPhone(d.user.phone || '');
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    // Validação de senha
    if (newPassword && newPassword !== confirmPassword) {
      addNotification('As senhas não coincidem.', 'error');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      addNotification('A nova senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (newPassword && !currentPassword) {
      addNotification('Informe a senha atual.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = { name, email, username, phone };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      const r = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) {
        addNotification('Perfil atualizado.', 'success');
        setProfile(d.user);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        addNotification(d.error || 'Erro ao atualizar perfil.', 'error');
      }
    } catch {
      addNotification('Erro de conexão.', 'error');
    }
    setSaving(false);
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6, color: '#f0f0f0',
    fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
    outline: 'none', transition: 'border-color 0.15s',
  };
  const labelStyle = {
    fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--text-muted)', marginBottom: 4, display: 'block',
  };

  const initials = profile?.name
    ? profile.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : 'U';

  return (
    <DashboardLayout activeTab="profile">
      <div className="animate-fade-in-up" style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 className="page-title">Meu Perfil</h1>
          <p className="page-subtitle">Gerencie suas informações pessoais e credenciais.</p>
        </div>

        {loading ? (
          <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
            Carregando...
          </div>
        ) : (
          <>
            {/* Avatar */}
            <div className="glass-card" style={{ padding: 20, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} style={{
                  width: 64, height: 64, borderRadius: '50%', objectFit: 'cover',
                  border: '2px solid rgba(255,0,51,0.25)',
                }} />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'rgba(255,0,51,0.08)', border: '2px solid rgba(255,0,51,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', color: '#ff0033', fontWeight: 700 }}>
                    {initials}
                  </span>
                </div>
              )}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#f0f0f0', fontWeight: 600 }}>
                  {profile?.name}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {ROLE_LABELS[profile?.role] || profile?.role?.toUpperCase()} — membro desde {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}
                </div>
              </div>
            </div>

            {/* Dados pessoais */}
            <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--brand-500, #ff0033)', marginBottom: 16,
              }}>
                Dados Pessoais
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nome</label>
                  <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Username</label>
                    <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} placeholder="@username" />
                  </div>
                  <div>
                    <label style={labelStyle}>Telefone</label>
                    <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(99) 99999-9999" />
                  </div>
                </div>
              </div>
            </div>

            {/* Alterar senha */}
            <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--brand-500, #ff0033)', marginBottom: 16,
              }}>
                Alterar Senha
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Senha Atual</label>
                  <input style={inputStyle} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Sua senha atual" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Nova Senha</label>
                    <input style={inputStyle} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 caracteres" />
                  </div>
                  <div>
                    <label style={labelStyle}>Confirmar</label>
                    <input style={inputStyle} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" />
                  </div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="glass-card" style={{ padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                Cargo: <strong style={{ color: '#f0f0f0' }}>{ROLE_LABELS[profile?.role] || profile?.role?.toUpperCase()}</strong>
                <span style={{ marginLeft: 8, opacity: 0.5 }}>(apenas o God pode alterar cargos)</span>
              </div>
            </div>

            {/* Salvar */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 6,
                cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? 'rgba(255,0,51,0.3)' : 'rgba(255,0,51,0.9)',
                border: 'none', color: '#fff',
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                letterSpacing: '0.08em', transition: 'all 0.15s',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
