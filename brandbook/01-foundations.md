# 01 · Foundations — Bases do Design System

---

## Cores

### Brand — Vermelho Primário

| Token | Hex | Uso |
|---|---|---|
| `--brand-50` | `#fff0f3` | Tints extremamente sutis |
| `--brand-200` | `#ffc0cc` | Hover de superfícies secundárias |
| `--brand-300` | `#ff6680` | Gradientes de texto, destaques suaves |
| `--brand-400` | `#ff1a4d` | Hover de ação primária |
| `--brand-500` | `#ff0033` | **COR DOMINANTE** — botões primários, ícones de ação, glow |
| `--brand-600` | `#cc0029` | Gradient início (botão primary) |
| `--brand-700` | `#99001f` | Estados pressed/active |
| `--brand-800` | `#660014` | Tints de background muito sutis |
| `--brand-900` | `#33000a` | Overlays |
| `--brand-950` | `#1a0005` | Background de elementos críticos |

> **Regra**: `#ff0033` é reservado **exclusivamente** para ações primárias e destaques críticos. Nunca usar como cor decorativa.

---

### Dark Scale — Neutros

| Token | Hex | Uso |
|---|---|---|
| `--dark-50` | `#f0f0f0` | Texto principal (nunca `#ffffff`) |
| `--dark-100` | `#e0e0e0` | Texto heading secundário |
| `--dark-200` | `#d4d4d4` | Texto com ênfase |
| `--dark-300` | `#a3a3a3` | Texto secundário / corpo |
| `--dark-400` | `#737373` | Texto terciário |
| `--dark-500` | `#525252` | Labels, metadata, placeholders |
| `--dark-600` | `#2a2a2a` | Bordas mais visíveis |
| `--dark-700` | `#1a1a1a` | Thumb do scrollbar, superfícies |
| `--dark-800` | `#111111` | Fundo de cards |
| `--dark-900` | `#0a0a0a` | Sidebar, elementos elevados |
| `--dark-950` | `#050505` | **Background base do app** |

---

### Status

| Token | Hex | Uso |
|---|---|---|
| `--status-success` | `#22c55e` | Sucesso, online, confirmação |
| `--status-error` | `#ff3333` | Erro, destrutivo |
| `--status-warning` | `#f97316` | Alerta, pausado |
| `--status-info` | `#3b82f6` | Informação neutra |

---

### Regras de Aplicação de Cores

| Elemento | Valor |
|---|---|
| Background base | `#050505` + grid de circuito `rgba(255,0,51,0.025)` |
| Cards | `linear-gradient(145deg, rgba(17,17,17,0.95), rgba(10,10,10,0.98))` |
| Borda padrão | `rgba(255,255,255,0.04)` — **nunca hex sólido** |
| Borda hover | `rgba(255,0,51,0.15)` — vermelho sutil |
| Borda accent | `rgba(255,0,51,0.25)` — destaque |
| Scrollbar | `4px` · thumb `#1a1a1a` · hover `#ff0033` |
| Seleção de texto | `rgba(255,0,51,0.25)` + texto branco |

---

## Tokens Semânticos

> Sempre use tokens semânticos. **Nunca** use valores primitivos hard-coded no componente.

### Superfícies

```css
--surface-base:      #050505;       /* Fundo base do app */
--surface-elevated:  #0a0a0a;       /* Sidebar, fundo elevado */
--surface-card:      #111111;       /* Fundo de cards */
```

### Bordas

```css
--border-default:    rgba(255,255,255,0.04);  /* Borda padrão */
--border-subtle:     rgba(255,255,255,0.07);  /* Borda mais visível */
--border-accent:     rgba(255,0,51,0.15);     /* Borda de destaque */
--border-hover:      rgba(255,0,51,0.25);     /* Borda no hover */
```

### Texto

```css
--text-primary:      #f0f0f0;   /* Texto principal */
--text-secondary:    #a3a3a3;   /* Texto secundário */
--text-muted:        #525252;   /* Labels, metadata */
```

### Ação

```css
--action-primary:    #ff0033;   /* CTA, botão primário */
--action-hover:      #ff1a4d;   /* Estado hover de ação */
```

---

## Tipografia

### Famílias

| Família | Uso |
|---|---|
| `JetBrains Mono` (monospace) | Labels, métricas, títulos, código, breadcrumbs, números |
| `Inter` (sans-serif) | Corpo de texto, descrições, parágrafos longos |

> **Regra**: Números sempre com `font-variant-numeric: tabular-nums` (classe `tabular-nums` no Tailwind).

### Escala Tipográfica

| Token | Tamanho | Peso | Letter-spacing | Família | Uso |
|---|---|---|---|---|---|
| `display` | `2rem` | `800` | `-0.02em` | mono | Títulos grandes, hero |
| `heading-lg` | `1.25rem` | `700` | `0.04em` | mono | Títulos de página |
| `heading-sm` | `1rem` | `600` | `0.02em` | sans | Subtítulos |
| `body` | `0.875rem` | `400` | `0` | sans | Texto de corpo |
| `label` | `0.75rem` | `600` | `0.1em` | mono | Labels de seção (uppercase) |
| `label-sm` | `0.6875rem` | `600` | `0.08em` | mono | Micro labels (uppercase) |
| `micro` | `0.625rem` | `600` | `0.12em` | mono | Metadata, status (uppercase) |

### Classes CSS de Tipografia

```css
/* Use estas classes — nunca recrie inline */
.label-micro  { font: 600 0.625rem/1 'JetBrains Mono'; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.label-sm     { font: 600 0.6875rem/1 'JetBrains Mono'; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.section-title{ font: 600 0.75rem/1 'JetBrains Mono'; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.page-title   { font: 700 1.25rem/1.2 'JetBrains Mono'; letter-spacing: 0.04em; color: var(--text-primary); }
```

### Efeitos de Texto

```css
/* Gradiente vermelho no texto */
.text-gradient {
  background: linear-gradient(135deg, #ff0033, #ff6680);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Glow neon vermelho */
.neon-red   { text-shadow: 0 0 4px rgba(255,0,51,0.4), 0 0 12px rgba(255,0,51,0.15); }

/* Glow neon verde */
.neon-green { text-shadow: 0 0 4px rgba(34,197,94,0.4), 0 0 12px rgba(34,197,94,0.15); }
```

---

## Sistema de Espaçamento

> Base: **4px**. Toda medida é múltiplo de 4.

| Escala | px | rem | Tailwind |
|---|---|---|---|
| 1 | 4px | 0.25rem | `p-1`, `m-1` |
| 2 | 8px | 0.5rem | `p-2`, `m-2` |
| 3 | 12px | 0.75rem | `p-3`, `m-3` |
| 4 | 16px | 1rem | `p-4`, `m-4` |
| 5 | 20px | 1.25rem | `p-5`, `m-5` |
| 6 | 24px | 1.5rem | `p-6`, `m-6` |
| 8 | 32px | 2rem | `p-8`, `m-8` |
| 10 | 40px | 2.5rem | `p-10`, `m-10` |
| 12 | 48px | 3rem | `p-12`, `m-12` |

**Padding padrão de página:** `p-8 md:p-10`
**Padding padrão de card:** `p-4` ou `p-5`
**Gap entre cards:** `gap-4`
**Gap entre seções:** `mb-14`

---

## Border Radius

| Token semântico | Valor | Uso |
|---|---|---|
| `radius-nano` | `2px` | Badges, tags pequenas |
| `radius-control` | `4px` | Botões pequenos, chips |
| `radius-input` | `6px` | Inputs, selects |
| `radius-card` | `12px` = `rounded-xl` | Cards padrão (`.glass-card`) |
| `radius-modal` | `16px` | Modais, drawers |
| `radius-pill` | `9999px` | Badges pill, avatares |
