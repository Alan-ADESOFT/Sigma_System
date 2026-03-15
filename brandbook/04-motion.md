# 04 · Motion — Animações e Presets

---

## 01 · Curvas de Easing

> Toda transição usa **uma das 3 curvas do sistema**. Nunca use `linear` ou `ease` puro.

| Nome | Curva | Duração base | Uso |
|---|---|---|---|
| **UI Padrão** | `cubic-bezier(0.4, 0, 0.2, 1)` | 250-300ms | Hover, fade, slide — uso geral |
| **Bounce / Celebração** | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 350-400ms | Modais, pop-ups, achievements |
| **Entrada Suave** | `easeOut` | 300-400ms | Fade-in de elementos na página |

### Durações por Contexto

| Contexto | Range | Curva |
|---|---|---|
| Micro-interações (hover, press) | 80–150ms | `ease` |
| Transições de UI (fade, slide) | 200–350ms | `cubic-bezier(0.4,0,0.2,1)` |
| Entradas de página | 300–500ms | `ease-out` |
| Celebrações (achievement, toast) | 400–600ms | bounce |
| Animações infinitas (pulse, scan) | 1500–4000ms | `ease-in-out` |

---

## 02 · Presets de Animação

### fadeInUp (entrada padrão de elementos)

```tsx
// Framer Motion
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, ease: "easeOut" }}

// CSS puro
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up { animation: fadeInUp 0.4s ease-out both; }
```

---

### stagger-in (grid de cards, listas)

```tsx
// Framer Motion — delay 50ms por filho
{items.map((item, i) => (
  <motion.div
    key={i}
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.06, duration: 0.35, ease: "easeOut" }}
  >
    {item}
  </motion.div>
))}

// CSS puro com classes utilitárias
.stagger-1 { animation-delay:  50ms; }
.stagger-2 { animation-delay: 100ms; }
.stagger-3 { animation-delay: 150ms; }
.stagger-4 { animation-delay: 200ms; }
.stagger-5 { animation-delay: 250ms; }
.stagger-6 { animation-delay: 300ms; }
.stagger-7 { animation-delay: 350ms; }
.stagger-8 { animation-delay: 400ms; }
```

---

### scaleIn (modais, pop-ups)

```tsx
// Framer Motion
initial={{ opacity: 0, scale: 0.88 }}
animate={{ opacity: 1, scale: 1 }}
transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}

// CSS puro
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-scale-in { animation: scaleIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
```

---

### slideInLeft (sidebars, drawers)

```tsx
// CSS puro
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}
.animate-slide-in-left { animation: slideInLeft 0.4s ease-out both; }
```

---

### toastIn / toastOut (notificações)

```tsx
// Framer Motion — slide da direita
initial={{ x: "110%", opacity: 0, scale: 0.95 }}
animate={{ x: 0, opacity: 1, scale: 1 }}
exit={{ x: "110%", opacity: 0, scale: 0.9 }}
transition={{ type: "tween", duration: 0.35 }}
```

---

### countUp (métricas ao montar)

```tsx
useEffect(() => {
  const start = performance.now();
  const duration = 800;

  const animate = (now: number) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    setCount(Math.floor(eased * targetValue));
    if (progress < 1) requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);
}, []);
```

---

## 03 · Efeitos Especiais

### glowPulse — status indicators, CTAs

```css
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 4px rgba(255,0,51,0.3); }
  50%       { box-shadow: 0 0 16px rgba(255,0,51,0.6), 0 0 32px rgba(255,0,51,0.2); }
}
.animate-glow-pulse { animation: glowPulse 3s infinite; }
```

---

### radarPulse — indicadores de status online

```css
@keyframes radarPulse {
  0%   { transform: scale(1); opacity: 1; }
  100% { transform: scale(2.5); opacity: 0; }
}
.animate-radar-pulse { animation: radarPulse 2s ease-out infinite; }
```

**Uso:**
```tsx
<div className="relative w-10 h-10">
  <div className="absolute inset-0 rounded-full border border-[#ff0033] animate-radar-pulse" />
  <div className="absolute inset-0 rounded-full border border-[#ff0033] animate-radar-pulse stagger-3" />
  <div className="absolute inset-2 rounded-full bg-[#ff0033] opacity-80" />
</div>
```

---

### glitchShake — hover em elementos de destaque

```css
@keyframes glitchShake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-2px); }
  40%       { transform: translateX(2px); }
  60%       { transform: translateX(-1px); }
  80%       { transform: translateX(1px); }
}
```

**Uso com Framer Motion:**
```tsx
// Ao fazer hover
animate={{ x: [-2, 2, -1, 1, 0], transition: { duration: 0.3, times: [0, 0.2, 0.5, 0.8, 1] } }}
```

---

### waveBar — waveform do header

```css
@keyframes waveBar {
  0%, 100% { transform: scaleY(0.3); }
  50%       { transform: scaleY(1); }
}
.animate-wave { animation: waveBar 1.2s ease-in-out infinite; }
```

**Uso:**
```tsx
<div className="flex items-center gap-[2px] h-3">
  {[0,1,2,3].map(i => (
    <div
      key={i}
      className="w-[2px] bg-[#ff0033] rounded-full animate-wave"
      style={{ height: "12px", animationDelay: `${i * 0.15}s` }}
    />
  ))}
</div>
```

---

### syncPulse — indicador de conexão live

```css
@keyframes syncPulse {
  0%, 100% { opacity: 0.3; }
  50%       { opacity: 1; }
}
.animate-sync-pulse { animation: syncPulse 2s infinite; }
```

---

### crtFlicker + scanlines — overlay global

```css
@keyframes crtFlicker {
  0%, 92%, 94%, 96%, 100% { opacity: 1; }
  93% { opacity: 0.97; }
  95% { opacity: 0.95; }
}

/* Overlay de scan lines */
.hud-scanlines {
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
  );
  pointer-events: none;
  z-index: 9999;
  animation: crtFlicker 8s infinite;
}
```

---

### skeletonShimmer — loading states

```css
@keyframes skeletonShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #111 0%, #1a1a1a 40%,
    rgba(255,0,51,0.06) 50%,
    #1a1a1a 60%, #111 100%
  );
  background-size: 200% 100%;
  animation: skeletonShimmer 1.8s infinite;
}
```

---

### lineScan — linha de scan CRT

```css
@keyframes lineScan {
  0%   { top: -2px; }
  100% { top: 100%; }
}
/* Elemento: position absolute, height 1px, background rgba(255,0,51,0.15) */
```

---

### logoPulse — logo no sidebar

```css
@keyframes logoPulse {
  0%, 100% { box-shadow: 0 0 12px rgba(255,0,51,0.3), 0 0 24px rgba(255,0,51,0.1); }
  50%       { box-shadow: 0 0 20px rgba(255,0,51,0.6), 0 0 40px rgba(255,0,51,0.2); }
}
.animate-logo-pulse { animation: logoPulse 4s infinite; }
```

---

### bootGlitch — tela de boot

```css
@keyframes bootGlitch {
  0%, 94%, 100% { filter: none; transform: none; }
  95% { filter: hue-rotate(90deg) brightness(1.2); transform: translateX(2px); }
  97% { filter: hue-rotate(-90deg) brightness(0.8); transform: translateX(-2px); }
  99% { filter: brightness(1.5); transform: translateX(0); }
}
```

---

## 04 · Biblioteca Completa de Animações

| Animação | Duração | Uso | Trigger |
|---|---|---|---|
| `fadeInUp` | 400ms | Entrada padrão de elementos | mount |
| `slideInLeft` | 400ms | Sidebar, drawers, listas | mount |
| `scaleIn` | 350ms | Modais, dialogs, popovers | mount |
| `stagger-in` | 50ms/filho | Grids, listas de cards | mount |
| `glitchShake` | 300ms | Hover em elementos de destaque | hover |
| `glowPulse` | 3s ∞ | Status indicators, CTAs | sempre |
| `radarPulse` | 2s ∞ | Indicadores de status online | sempre |
| `navGlowPulse` | 2s ∞ | Item ativo da navegação | active |
| `logoPulse` | 4s ∞ | Logo mark no sidebar | sempre |
| `waveBar` | 1.2s ∞ | Waveform no header | sempre |
| `syncPulse` | 2s ∞ | Indicador de conexão live | sempre |
| `crtFlicker` | 8s ∞ | Overlay scan lines global | sempre |
| `countUp` | 800ms | Métricas e KPIs ao montar | mount |
| `toastIn/Out` | 350ms | Notificações do sistema | event |
| `skeletonShimmer` | 1.8s ∞ | Loading states | loading |
| `dividerSweep` | 4s ∞ | Dividers entre seções | sempre |
| `lineScan` | variável | Linha de scan CRT | sempre |
| `bootGlitch` | 300ms | Tela de boot | evento único |
