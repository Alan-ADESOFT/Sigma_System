# SIGMA Design System — Brandbook

> Guia completo de identidade visual e linguagem de design do dashboard SIGMA (agência de marketing). Este documento é a **fonte da verdade** para qualquer IA ou desenvolvedor criar novas features com front-end consistente.

---

## Visão Geral

**SIGMA** é um dashboard dark-only com estética de terminal/HUD militar. A interface transmite poder, controle e precisão. O usuário é tratado como um operador em um centro de comando.

| Atributo | Valor |
|---|---|
| Tema | Dark Only (sem modo claro) |
| Accent | Vermelho `#ff0033` |
| Tipografia principal | JetBrains Mono (labels, títulos, métricas) |
| Tipografia corpo | Inter (descrições, textos longos) |
| Grid base | 4px |
| Fundo base | `#050505` |

---

## Índice

| Arquivo | Conteúdo |
|---|---|
| [`01-foundations.md`](./01-foundations.md) | Cores, tipografia, espaçamento, radius, tokens semânticos |
| [`02-components.md`](./02-components.md) | Átomos, moléculas, organismos — catálogo completo |
| [`03-guidelines.md`](./03-guidelines.md) | Princípios, do's & don'ts, tom de voz, acessibilidade |
| [`04-motion.md`](./04-motion.md) | Animações, easing, presets, efeitos especiais |
| [`globals.css`](./globals.css) | CSS global completo com todas as classes e tokens |

---

## Regra de Ouro para IAs

Ao criar qualquer nova feature ou componente, siga **obrigatoriamente**:

1. **Background base**: `#050505` com grid de circuito `rgba(255,0,51,0.025)`
2. **Cards**: classe `glass-card` — `linear-gradient(145deg, rgba(17,17,17,0.95), rgba(10,10,10,0.98))` com borda `rgba(255,255,255,0.04)`
3. **Vermelho apenas para ação primária** — nunca decorativo
4. **Todas as fontes mono** para labels, métricas e títulos → `JetBrains Mono`
5. **Animação obrigatória** nas entradas → `fadeInUp` 400ms ou stagger 50ms/filho
6. **Nunca usar** valores primitivos hard-coded → use sempre `var(--token)`
7. **Bordas sempre RGBA** — nunca hex sólido em cards
8. **Texto branco puro (#ffffff) proibido** → usar `#f0f0f0`
