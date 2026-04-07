/**
 * components/Skeleton.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Componentes de skeleton reutilizaveis para loading states.
 * Usa a classe .skeleton de globals.css (shimmer animation).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function Skeleton({ width, height = 16, borderRadius = 4, style }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

export function SkeletonCard({ lines = 3, style }) {
  return (
    <div className="glass-card" style={{ padding: '20px 24px', ...style }}>
      <Skeleton width="40%" height={14} style={{ marginBottom: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height={10}
          style={{ marginBottom: 8 }}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} width={`${100 / cols}%`} height={12} />
          ))}
        </div>
      ))}
    </div>
  );
}
