/**
 * pages/dashboard/content-plan.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Planejamento de Conteúdo — calendário editorial e organização de campanhas
 * ─────────────────────────────────────────────────────────────────────────────
 */

import DashboardLayout from '../../components/DashboardLayout';

export default function ContentPlanPage() {
  return (
    <DashboardLayout activeTab="content-plan">
      <div className="page-header">
        <h1 className="page-title">Planejamento de Conteúdo</h1>
        <p className="page-subtitle">Calendário editorial e organização de campanhas por período</p>
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
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#525252', letterSpacing: '0.08em' }}>
          // módulo em desenvolvimento
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#3a3a3a', marginTop: 8, letterSpacing: '0.06em' }}>
          Calendário · Semanas · Campanhas · Aprovações · Agendamentos
        </div>
      </div>
    </DashboardLayout>
  );
}
