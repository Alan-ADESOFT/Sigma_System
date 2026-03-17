/**
 * pages/dashboard/form.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Form — formulários e captação de dados
 * ─────────────────────────────────────────────────────────────────────────────
 */

import DashboardLayout from '../../components/DashboardLayout';

export default function FormPage() {
  return (
    <DashboardLayout activeTab="form">
      <div className="page-header">
        <h1 className="page-title">Forms Dados</h1>
        <p className="page-subtitle">Formulários e captação de dados estruturados</p>
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
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#525252', letterSpacing: '0.08em' }}>
          // módulo em desenvolvimento
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#3a3a3a', marginTop: 8, letterSpacing: '0.06em' }}>
          Criação de Forms · Respostas · Integrações · Exportação
        </div>
      </div>
    </DashboardLayout>
  );
}
