/**
 * pages/dashboard/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Redirect: /dashboard → /dashboard/overview
 *
 * O painel "Dashboard" original (lista de contas Instagram) foi removido
 * em favor da nova "Visão Geral". Este arquivo permanece como entrypoint
 * porque outras partes do app (login, redirects internos) ainda apontam
 * para /dashboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/dashboard/overview',
      permanent: false,
    },
  };
}

export default function DashboardRedirect() {
  return null;
}
