/**
 * pages/dashboard/social-dashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboarding Social — visão geral de métricas e dados do perfil Instagram
 * ─────────────────────────────────────────────────────────────────────────────
 */

import DashboardLayout from '../../components/DashboardLayout';

export default function SocialDashboardPage() {
  return (
    <DashboardLayout activeTab="social-dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboarding Social</h1>
        <p className="page-subtitle">Métricas e dados do perfil Instagram em tempo real</p>
      </div>

      <div className="glass-card" style={{ padding: 40, textAlign: 'center', marginTop: 8 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(255,0,51,0.06)',
          border: '1px solid rgba(255,0,51,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,51,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="18" y="3" width="4" height="18" rx="1" />
            <rect x="10" y="8" width="4" height="13" rx="1" />
            <rect x="2" y="13" width="4" height="8" rx="1" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#525252', letterSpacing: '0.08em' }}>
          // módulo em desenvolvimento
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#3a3a3a', marginTop: 8, letterSpacing: '0.06em' }}>
          Seguidores · Alcance · Impressões · Engajamento · Stories
        </div>
      </div>
    </DashboardLayout>
  );
}
