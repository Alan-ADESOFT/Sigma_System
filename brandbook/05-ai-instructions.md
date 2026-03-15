# 05 · Instruções para IA — Como Criar Features no SIGMA

> Este arquivo é especificamente para modelos de IA. Leia antes de criar qualquer componente ou página.

---

## Identidade Visual em Resumo

```
Sistema: SIGMA Dashboard — Agência de Marketing
Estética: Terminal / HUD militar / Dark ops
Tema: Dark Only — sem modo claro
Accent: Vermelho #ff0033
Background: #050505
Tipografia: JetBrains Mono (titles/labels) + Inter (body)
```

---

## Template de Componente React/TSX

```tsx
"use client";

import { motion } from "framer-motion";
import { Terminal } from "lucide-react";

// Padrão de fade-up para seções
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.4, ease: "easeOut" as const },
});

export default function MinhaFeature() {
  return (
    <div className="p-8 md:p-10 max-w-4xl">

      {/* 1. Breadcrumb obrigatório */}
      <div
        className="flex items-center gap-2 mb-8 text-xs text-[#525252]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <Terminal size={12} className="text-[#ff0033]" />
        <span>C:\SIGMA\nome-da-pagina&gt;</span>
        <span className="animate-cursor-blink text-[#ff0033]">_</span>
      </div>

      {/* 2. Seção com header padrão */}
      <motion.section className="mb-14" {...fadeUp(0)}>

        {/* Header da seção */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="label-micro text-[#ff0033]">01 · SEÇÃO</span>
            <div className="h-[1px] w-8" style={{ background: "rgba(255,0,51,0.2)" }} />
          </div>
          <h2 className="page-title mb-1">Título da Seção</h2>
          <p className="text-xs text-[#525252] leading-relaxed">Descrição da seção.</p>
        </div>

        {/* Card de conteúdo */}
        <div className="glass-card p-5">
          {/* conteúdo aqui */}
        </div>

      </motion.section>

      {/* Divider entre seções */}
      <div className="divider-sweep mb-14" />

      {/* Próxima seção... */}

    </div>
  );
}
```

---

## Paleta de Cores para Copiar/Colar

```tsx
// Cores mais usadas
const SIGMA_COLORS = {
  // Vermelho brand
  red:        "#ff0033",
  redHover:   "#ff1a4d",
  redLight:   "#ff6680",
  redDark:    "#cc0029",

  // Fundos
  bgBase:     "#050505",
  bgElevated: "#0a0a0a",
  bgCard:     "#111111",

  // Textos
  textPrimary:   "#f0f0f0",
  textSecondary: "#a3a3a3",
  textMuted:     "#525252",

  // Status
  success: "#22c55e",
  error:   "#ff3333",
  warning: "#f97316",
  info:    "#3b82f6",

  // Bordas (sempre RGBA)
  borderDefault: "rgba(255,255,255,0.04)",
  borderSubtle:  "rgba(255,255,255,0.07)",
  borderAccent:  "rgba(255,0,51,0.15)",
  borderHover:   "rgba(255,0,51,0.25)",
} as const;
```

---

## Classes CSS Mais Usadas

```tsx
// Containers
"glass-card"              // card padrão
"glass-card glass-card-hover"  // card clicável
"circuit-grid"            // background com grid de circuito

// Tipografia
"label-micro"             // micro label (10px mono uppercase)
"label-sm"                // small label (11px mono uppercase)
"section-title"           // título de seção (12px mono uppercase)
"page-title"              // título de página (20px mono bold)
"text-gradient"           // gradiente vermelho no texto
"neon-red"                // glow vermelho no texto
"neon-green"              // glow verde no texto

// Animações
"animate-cursor-blink"    // cursor piscando
"animate-glow-pulse"      // glow pulsante (3s)
"animate-radar-pulse"     // radar expandindo (2s)
"animate-sync-pulse"      // opacity pulsante (2s)
"animate-logo-pulse"      // box-shadow pulsante (4s)
"animate-nav-glow"        // glow nav (2s)
"animate-fade-in-up"      // fade up (0.4s)
"animate-scale-in"        // scale in bounce (0.35s)
"animate-slide-in-left"   // slide da esquerda (0.4s)
"animate-wave"            // onda de áudio (1.2s)
"animate-crt"             // flicker CRT (8s)

// Skeleton
"skeleton"                // shimmer de loading

// Overlays
"hud-scanlines"           // scan lines global (fixed)
"hud-vignette"            // vinheta radial (fixed)

// Input
"sigma-input"             // input padrão do sistema

// Utilitários
"divider-sweep"           // divider animado entre seções
"tabular-nums"            // números alinhados
"stagger-1" até "stagger-8"  // delays de stagger
```

---

## Estrutura de Grid Recomendada

```tsx
// KPIs / Métricas
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">

// Cards de conteúdo
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

// Cards de cliente
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

// Tokens / Tabelas
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
```

---

## Regras de Implementação (para a IA seguir)

### Obrigatório em toda feature:
1. `"use client"` no topo se usar interatividade
2. Breadcrumb terminal no início da página
3. `motion.section` com `fadeUp()` para cada bloco
4. `divider-sweep` entre seções
5. `glass-card` como container de todo conteúdo
6. `label-micro` ou `section-title` acima de todo bloco de dados
7. Fonte mono em todas métricas e labels

### Proibido:
- Fundo branco ou cinza claro
- Borda com cor hex sólida (ex: `border: 1px solid #ff0033`)
- Texto `#ffffff` puro — usar `#f0f0f0`
- Fontes serifadas
- Animações em width/height diretamente
- Valores de cor hard-coded quando existe token semântico

### Ícones
Usar exclusivamente a biblioteca **Lucide React**.

### Biblioteca de animação
Usar **Framer Motion** para animações de entrada, hover e interação.

---

## Exemplo de Metrica Card Completa

```tsx
function MetricaCard({ label, value, change, isPositive }: {
  label: string
  value: string
  change: string
  isPositive: boolean
}) {
  return (
    <div className="glass-card p-4 relative overflow-hidden">
      {/* Barra decorativa no fundo */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,0,51,0.4), transparent)" }}
      />

      <div className="flex items-start justify-between mb-3">
        <div className="label-micro">{label}</div>
        <span
          className="text-[10px] font-mono"
          style={{
            color: isPositive ? "#22c55e" : "#ff1a4d",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {change}
        </span>
      </div>

      <div
        className="text-2xl font-black tabular-nums neon-red"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: "#ff0033",
        }}
      >
        {value}
      </div>
    </div>
  )
}
```
