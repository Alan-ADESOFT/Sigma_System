# 02 · Components — Catálogo de Componentes

> Todos os componentes são construídos com a metodologia **Atomic Design**: Átomos → Moléculas → Organismos.

---

## Glass Card (Base de Todos os Componentes)

Todo container de componente usa a classe `.glass-card`:

```css
.glass-card {
  background: linear-gradient(145deg, rgba(17,17,17,0.95), rgba(10,10,10,0.98));
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 0.75rem; /* 12px */
  position: relative;
  overflow: hidden;
}

/* Linha de brilho no topo do card */
.glass-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,0,51,0.2), transparent);
}

/* Versão com hover */
.glass-card-hover {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.glass-card-hover:hover {
  border-color: rgba(255,0,51,0.18);
  box-shadow:
    0 0 30px rgba(255,0,51,0.08),
    0 0 60px rgba(255,0,51,0.03),
    0 8px 32px rgba(0,0,0,0.5);
  transform: translateY(-3px);
}
```

---

## 01 · Átomos

### Button

4 variantes · 3 tamanhos · estados loading + disabled

**Estrutura JSX:**
```tsx
<motion.button
  whileHover={{ y: -1 }}
  whileTap={{ scale: 0.96 }}
  style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}
>
  {children}
</motion.button>
```

**Variantes de estilo:**

| Variante | Background | Border | Cor do texto | Glow hover |
|---|---|---|---|---|
| `primary` | `linear-gradient(135deg, #cc0029, #ff0033)` | `1px solid rgba(255,0,51,0.4)` | `#fff` | `0 0 20px rgba(255,0,51,0.3)` |
| `secondary` | `rgba(17,17,17,0.9)` | `1px solid rgba(255,255,255,0.06)` | `#a3a3a3` | — |
| `danger` | `rgba(255,0,51,0.08)` | `1px solid rgba(255,0,51,0.2)` | `#ff1a4d` | — |
| `ghost` | `transparent` | `1px solid transparent` | `#525252` | — |

**Tamanhos:**

| Size | Padding | Font-size |
|---|---|---|
| `sm` | `px-3 py-1.5` | `11px` |
| `md` | `px-4 py-2` | `12px` |
| `lg` | `px-6 py-2.5` | `14px` |

**Estado disabled:** `opacity: 0.4`, `cursor: not-allowed`
**Estado loading:** ícone `<Loader2 size={12} className="animate-spin" />`

---

### Badge

5 variantes de status · tipografia mono uppercase

```tsx
<span
  className="text-[9px] font-mono px-1.5 py-0.5 rounded"
  style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, letterSpacing: "0.06em", textTransform: "uppercase" }}
>
  {children}
</span>
```

| Variante | Background | Border | Cor |
|---|---|---|---|
| `default` | `rgba(82,82,82,0.1)` | `rgba(82,82,82,0.2)` | `#737373` |
| `success` | `rgba(34,197,94,0.1)` | `rgba(34,197,94,0.25)` | `#22c55e` |
| `error` | `rgba(255,0,51,0.1)` | `rgba(255,0,51,0.25)` | `#ff1a4d` |
| `warning` | `rgba(249,115,22,0.1)` | `rgba(249,115,22,0.25)` | `#f97316` |
| `info` | `rgba(59,130,246,0.1)` | `rgba(59,130,246,0.25)` | `#3b82f6` |

---

### Input

4 estados · glow focus vermelho · validação integrada

```css
.sigma-input {
  background: rgba(10,10,10,0.8);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 0.375rem;
  color: var(--text-primary);
  font-family: Inter, sans-serif;
  font-size: 0.875rem;
  padding: 0.5rem 0.75rem;
  width: 100%;
  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
}
.sigma-input::placeholder { color: #3a3a3a; }
.sigma-input:focus {
  border-color: rgba(255,0,51,0.5);
  box-shadow: 0 0 0 3px rgba(255,0,51,0.08), inset 0 0 8px rgba(255,0,51,0.015);
  outline: none;
}
```

**Estados:**
- **Padrão**: borda `rgba(255,255,255,0.06)`
- **Focus**: borda `rgba(255,0,51,0.5)` + box-shadow vermelho
- **Erro**: borda `rgba(255,0,51,0.5)` + mensagem com ícone X em `#ff1a4d`
- **Disabled**: `opacity: 0.4`

**Input com prefixo:**
```tsx
<div className="relative">
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ff0033] text-xs font-mono">@</span>
  <input className="sigma-input" style={{ paddingLeft: "1.75rem" }} />
</div>
```

---

### StatusDot

Indicadores de estado com pulse animation

```tsx
<div className="relative flex items-center justify-center w-3 h-3">
  {/* Dot central */}
  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
  {/* Anel pulsante */}
  <div className="absolute w-3 h-3 rounded-full animate-radar-pulse" style={{ background: color, opacity: 0.3 }} />
</div>
```

| Estado | Cor | Classe de texto |
|---|---|---|
| Online / Ativo | `#22c55e` | `text-[#22c55e]` |
| Alerta / Erro | `#ff0033` | `text-[#ff0033]` |
| Pausado / Aviso | `#f97316` | `text-[#f97316]` |
| Offline / Inativo | `#525252` | `text-[#525252]` |

---

## 02 · Moléculas

### MetricCard (KPI)

KPI com count-up · sparkline · trend indicator · glow bar

**Estrutura:**
```tsx
<div className="glass-card p-4 relative overflow-hidden">
  {/* Glow bar no fundo */}
  <div className="absolute bottom-0 left-0 right-0 h-[2px]"
    style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />

  {/* Header: label + trend */}
  <div className="flex items-start justify-between mb-3">
    <div className="label-micro">{label}</div>
    <div style={{ color: isUp ? "#22c55e" : "#ff1a4d", fontFamily: "JetBrains Mono" }}>
      <TrendingUp size={9} /> {change}
    </div>
  </div>

  {/* Valor principal — neon */}
  <div className="text-2xl font-black tabular-nums mb-2"
    style={{ fontFamily: "JetBrains Mono", color, textShadow: `0 0 8px ${color}40` }}>
    {value}
  </div>

  {/* Sparkline */}
  <div className="flex items-end gap-0.5 h-6">
    {barData.map((h, i) => (
      <div key={i} className="flex-1 rounded-sm"
        style={{ height: `${h * 10}%`, background: i === last ? color : `${color}30` }} />
    ))}
  </div>
</div>
```

**Cores por contexto:**
- Seguidores: `#ff0033`
- Alcance: `#ff6680`
- Engajamento (negativo): `#ff1a4d`
- Geral: `#cc0029`

---

### ClientCard

Card de cliente com 3D tilt · classification bar · status badge

```tsx
<motion.div
  className="glass-card glass-card-hover overflow-hidden"
  whileHover={{ rotateX: 1, rotateY: 1 }}
  style={{ perspective: "800px" }}
>
  {/* Barra de classificação no topo */}
  <div className="h-0.5 w-full"
    style={{ background: `linear-gradient(90deg, ${statusColor}80, ${statusColor}20, transparent)` }} />

  <div className="p-4">
    {/* Nome + status badge */}
    {/* Métricas em grid 2 colunas */}
  </div>
</motion.div>
```

**Status:**
| Status | Label | Cor | Background |
|---|---|---|---|
| `ativo` | `OPS ATIVAS` | `#ff0033` | `rgba(255,0,51,0.08)` |
| `nominal` | `NOMINAL` | `#22c55e` | `rgba(34,197,94,0.06)` |
| `inativo` | `INATIVO` | `#525252` | `rgba(82,82,82,0.06)` |

---

### Toast

5 tipos · auto-dismiss · som via Web Audio API

**Estrutura base:**
```tsx
<div
  className="flex items-center gap-3 px-4 py-3 rounded-lg"
  style={{
    background: "rgba(10,10,10,0.95)",
    border: `1px solid ${borderColor}`,
    boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 16px ${borderColor}`,
  }}
>
  <Icon size={14} style={{ color }} />
  <span className="text-xs font-mono">
    <span className="opacity-50">{prefix}</span>
    {mensagem}
  </span>
</div>
```

**Animação de entrada/saída:**
```tsx
initial={{ x: "110%", opacity: 0, scale: 0.95 }}
animate={{ x: 0, opacity: 1, scale: 1 }}
exit={{ x: "110%", opacity: 0, scale: 0.9 }}
transition={{ type: "tween", duration: 0.35 }}
```

**Tipos:**
| Tipo | Prefixo | Cor | Border |
|---|---|---|---|
| `success` | `> ` | `#4ade80` | `rgba(34,197,94,0.3)` |
| `error` | `! ` | `#ff1a4d` | `rgba(255,0,51,0.3)` |
| `info` | `# ` | `#a3a3a3` | `rgba(255,255,255,0.1)` |
| `deploy` | `>> ` | `#ff6680` | `rgba(255,0,51,0.4)` |
| `milestone` | `*** ` | `#fbbf24` | `rgba(255,165,0,0.4)` |

---

## 03 · Organismos

### DashboardHeader

Breadcrumb terminal · waveform animado · sync indicator

```tsx
<div className="flex items-center justify-between px-4 py-3 rounded-lg"
  style={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.04)" }}>

  {/* Breadcrumb estilo terminal */}
  <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#525252" }}>
    <span className="text-[#ff0033]">C:\SIGMA\</span>
    <span>pagina-atual</span>
    <span className="text-[#ff0033]">&gt;</span>
    <span className="animate-cursor-blink text-[#ff0033]">_</span>
  </div>

  <div className="flex items-center gap-4">
    {/* Waveform */}
    <div className="flex items-center gap-[2px] h-3">
      {[0,1,2,3].map(i => (
        <div key={i} className="w-[2px] bg-[#ff0033] rounded-full animate-wave"
          style={{ height: "12px", animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>

    {/* Sync indicator */}
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-sync-pulse" />
      <span className="label-micro text-[#22c55e]">SYNC</span>
    </div>
  </div>
</div>
```

---

### TerminalBar

Barra de status inferior com logs ao vivo

```tsx
<div className="flex items-center justify-between px-4 py-2 rounded"
  style={{ background: "rgba(5,5,5,0.95)", border: "1px solid rgba(255,255,255,0.04)" }}>
  <div className="flex items-center gap-4">
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
      <span className="label-micro text-[#22c55e]">SERVER ONLINE</span>
    </div>
    <span className="label-micro">247 posts · :3000</span>
  </div>
</div>
```

**Formato de log:**
```
{timestamp}  {mensagem}
14:23:01     POST publicado — @cliente_01     (verde #4ade80)
14:22:47     Agendamento criado — 3 posts     (cinza #525252)
14:21:30     AVISO: Token expira em 2h        (laranja #f97316)
```

---

### Skeleton (Loading State)

Shimmer com acento vermelho · 1.8s de duração

```css
.skeleton {
  background: linear-gradient(
    90deg,
    #111 0%, #1a1a1a 40%,
    rgba(255,0,51,0.06) 50%,
    #1a1a1a 60%, #111 100%
  );
  background-size: 200% 100%;
  animation: skeletonShimmer 1.8s infinite;
  border-radius: 0.25rem;
}
```

**Uso:**
```tsx
{/* Card skeleton */}
<div className="glass-card p-4 space-y-3">
  <div className="skeleton h-3 w-32 rounded" />
  <div className="skeleton h-6 w-24 rounded" />
  <div className="flex gap-1">
    {Array.from({ length: 10 }).map((_, i) => (
      <div key={i} className="skeleton flex-1 h-4 rounded-sm" />
    ))}
  </div>
</div>
```

---

## Catálogo Completo

| Componente | Tipo | Variantes | Status |
|---|---|---|---|
| Button | Átomo | primary, secondary, danger, ghost | STABLE |
| Badge | Átomo | default, success, error, warning, info | STABLE |
| Input | Átomo | default, focus, error, disabled | STABLE |
| StatusDot | Átomo | online, alerta, pausado, offline | STABLE |
| MetricCard | Molécula | sparkline + progress ring | STABLE |
| ClientCard | Molécula | ativo, nominal, inativo | STABLE |
| Toast | Molécula | success, error, info, deploy, milestone | STABLE |
| DashboardHeader | Organismo | waveform + breadcrumb + sync | STABLE |
| TerminalBar | Organismo | expandível + logs | STABLE |
| Skeleton | Organismo | card, grid, table | STABLE |
