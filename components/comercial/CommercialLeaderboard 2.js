/**
 * components/comercial/CommercialLeaderboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tabela densa de top usuários.
 * Top 3 com medalhas (gold/silver/bronze) inline SVG.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../../assets/style/comercialDashboard.module.css';

function fmtBRL(n) {
  if (!n) return 'R$ 0';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function initials(name) {
  if (!name) return '·';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function MedalIcon({ rank }) {
  const cls = rank === 1 ? styles.medalGold
            : rank === 2 ? styles.medalSilver
            : styles.medalBronze;
  return (
    <span className={`${styles.medal} ${cls}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg>
    </span>
  );
}

export default function CommercialLeaderboard({ rows = [] }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
        Ninguém com atividade no período
      </div>
    );
  }

  return (
    <table className={styles.leaderboardTable}>
      <thead>
        <tr>
          <th style={{ width: 60, textAlign: 'center' }}>#</th>
          <th>Usuário</th>
          <th style={{ textAlign: 'right' }}>Leads</th>
          <th style={{ textAlign: 'right' }}>Ganhos</th>
          <th style={{ textAlign: 'right' }}>Valor</th>
          <th style={{ textAlign: 'right' }}>Propostas</th>
          <th style={{ textAlign: 'right' }}>Atividades</th>
          <th style={{ textAlign: 'right' }}>Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.userId || i}>
            <td className={styles.posCell}>
              {i < 3 ? <MedalIcon rank={i + 1} /> : (i + 1)}
            </td>
            <td>
              <div className={styles.userCell}>
                <div className="avatar">
                  {r.avatarUrl
                    ? <img src={r.avatarUrl} alt="" />
                    : <span>{initials(r.userName)}</span>}
                </div>
                <span className="name">{r.userName}</span>
              </div>
            </td>
            <td style={{ textAlign: 'right' }}>{r.leadsAssigned}</td>
            <td style={{ textAlign: 'right' }}>{r.leadsWon}</td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtBRL(r.leadsWonValue)}</td>
            <td style={{ textAlign: 'right' }}>{r.proposalsSent}</td>
            <td style={{ textAlign: 'right' }}>{r.activitiesCount}</td>
            <td className={styles.scoreCell} style={{ textAlign: 'right' }}>{r.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
