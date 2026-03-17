/**
 * pages/dashboard/database.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Base de Dados — visualização e gestão de dados do sistema
 * ─────────────────────────────────────────────────────────────────────────────
 */

import DashboardLayout from '../../components/DashboardLayout';

export default function DatabasePage() {
  return (
    <DashboardLayout activeTab="database">
      <div className="page-header">
        <h1 className="page-title">Base de Dados</h1>
        <p className="page-subtitle">Visualização e gestão de dados armazenados no sistema</p>
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
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#525252', letterSpacing: '0.08em' }}>
          // módulo em desenvolvimento
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#3a3a3a', marginTop: 8, letterSpacing: '0.06em' }}>
          Tabelas · Registros · Filtros · Exportação · Auditoria
        </div>
      </div>
    </DashboardLayout>
  );
}
