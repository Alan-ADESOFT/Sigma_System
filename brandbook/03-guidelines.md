# 03 · Guidelines — Princípios e Regras de Uso

---

## 01 · Filosofia — 6 Princípios

### P1 — Centro de Comando
O usuário é um **operador em um centro de controle**. A interface deve transmitir poder, clareza e domínio — não apenas exibir dados. Cada tela deve parecer uma central de monitoramento de alta tecnologia.

### P2 — Feedback Instantâneo
Toda ação do usuário gera **resposta visual + sonora em menos de 100ms**. Nenhuma interação passa em silêncio. Cliques devem ter microanimação. Formulários devem confirmar ao submeter.

### P3 — Nada é Estático
**Tudo respira, pulsa e reage.** Waveforms, sync indicators, relógios ao vivo — o dashboard está sempre vivo. Elementos estáticos são exceção, não regra.

### P4 — Vermelho para Ação
O vermelho (`#ff0033`) é reservado **exclusivamente** para:
- Ações primárias (botão CTA)
- Destaques críticos
- Indicadores de alerta

Verde (`#22c55e`) para sucesso. Cinza (`#525252`) para tudo mais.

### P5 — Progressão Visível
Barras, anéis, contadores animados e scores com cor dinâmica. O usuário sempre sabe exatamente onde está e o que conquistou. Nunca mostrar número estático quando um count-up é possível.

### P6 — Dark Only
**Sem modo claro.** O sistema opera exclusivamente em dark — fundo `#050505` com vinheta radial. A claridade vem do contraste, não da cor de fundo.

---

## 02 · Do's & Don'ts

### Cores

| ✓ FAÇA | ✗ NUNCA FAÇA |
|---|---|
| Use bordas RGBA: `rgba(255,255,255,0.04)` | Nunca use bordas hex sólidas em cards |
| Use vermelho apenas para ação primária | Nunca use gradientes coloridos em bordas |
| Use `#050505` como fundo base | Nunca use fundo branco ou claro |
| Mantenha texto principal em `#f0f0f0` | Nunca use mais de 2 cores de destaque juntas |

### Tipografia

| ✓ FAÇA | ✗ NUNCA FAÇA |
|---|---|
| Use `JetBrains Mono` para todos os labels e métricas | Nunca misture mais de 2 famílias tipográficas |
| Use uppercase + letter-spacing em labels | Nunca use fonte serifada |
| Use `tabular-nums` em todos os números | Nunca omita uppercase em labels do sistema |
| Use Inter para texto de corpo | Nunca use `#ffffff` puro — use `#f0f0f0` |

### Animações

| ✓ FAÇA | ✗ NUNCA FAÇA |
|---|---|
| Anime `transform`, `opacity` e `filter` (GPU) | Nunca anime `width`, `height`, `top` ou `left` diretamente |
| Use `cubic-bezier(0.4, 0, 0.2, 1)` como base (250ms) | Nunca use transições em 0ms |
| Respeite `prefers-reduced-motion` | Nunca sobrecarregue com mais de 3 animações simultâneas |
| Toda transição mínima de 0.15s | Nunca use efeitos pesados sem `will-change` ou `transform` |

---

## 03 · Uso de Tokens

**Sempre use tokens semânticos — nunca valores primitivos no componente.**

```tsx
// ✓ CORRETO — usa token semântico
const style = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
}

// ✗ ERRADO — valor primitivo hard-coded
const style = {
  background: "#111111",              // não!
  border: "1px solid rgba(255,255,255,0.04)", // não!
  color: "#f0f0f0",                   // não!
}
```

> **Por quê**: Tokens semânticos permitem mudanças globais sem alterar cada componente. Valores hard-coded quebram a consistência e impossibilitam atualizações em escala.

---

## 04 · Tom de Voz — Como a Interface Fala

O SIGMA fala como um **sistema operacional inteligente** — direto, técnico, sem paternalismos. Sem exclamações excessivas, sem emojis em contexto operacional.

### Exemplos de Tom de Voz

**Sucesso:**
```
✓ USE: "> Post publicado com sucesso."
✗ EVITE: "Ótimo! Seu post foi publicado! 🎉🎉"
```

**Erro:**
```
✓ USE: "! Falha na conexão com API. Tentativa 1/3."
✗ EVITE: "Ops! Algo deu errado. Por favor, tente novamente."
```

**Confirmação:**
```
✓ USE: "# Campanha agendada — 14/03 às 09:00."
✗ EVITE: "Sua campanha foi agendada com sucesso! Verifique sua caixa de entrada."
```

**Aviso:**
```
✓ USE: "AVISO: Token expira em 2h. Renovar agora."
✗ EVITE: "Lembre-se de renovar seu token para continuar usando o serviço!"
```

### Prefixos de Mensagem (estilo terminal)

| Prefixo | Uso |
|---|---|
| `> ` | Sucesso, operação concluída |
| `! ` | Erro, falha crítica |
| `# ` | Informação neutra, confirmação |
| `>> ` | Deploy, publicação em múltiplas redes |
| `*** ` | Milestone, conquista importante |
| `AVISO: ` | Warning que requer atenção |

---

## 05 · Acessibilidade

| Regra | Detalhe | Prioridade |
|---|---|---|
| `prefers-reduced-motion` | Todas as animações pesadas devem ser desabilitadas via media query | **Obrigatório** |
| Contraste mínimo | Texto `#f0f0f0` sobre `#050505` = ratio 13:1 (passa WCAG AAA) | **Obrigatório** |
| Focus rings | Todos os elementos interativos: `outline: 2px solid #ff0033` | **Obrigatório** |
| `aria-label` | Botões com apenas ícone devem ter aria-label descritivo | **Obrigatório** |
| Idioma | Toda a UI em Português Brasileiro. Exceções: termos técnicos universais (SCORE, SYNC, LOG) | Recomendado |

**Implementação de prefers-reduced-motion:**
```css
@media (prefers-reduced-motion: reduce) {
  .animate-glow-pulse,
  .animate-radar-pulse,
  .animate-sync-pulse,
  .animate-wave,
  .animate-crt,
  .skeleton {
    animation: none !important;
  }
}
```

---

## 06 · Quick Start — Checklist para Novo Componente

Ao criar qualquer novo componente, siga estes 10 passos:

| Passo | Elemento | Detalhe |
|---|---|---|
| 01 | **Container** | `glass-card` ou `glass-card-hover` com `p-5` |
| 02 | **Título** | `.section-title` (mono, uppercase, 0.75rem, `#525252`) |
| 03 | **Valores** | `.metric-value` + `neon-red` / `neon-green` conforme contexto |
| 04 | **Labels** | `.label-micro` (mono, uppercase, 0.625rem) |
| 05 | **Entrada** | `fadeInUp` 0.4s ou stagger-in com delay 50ms por filho |
| 06 | **Hover** | Mínimo `translateY(-2px)` + glow cascade |
| 07 | **Interação** | Som via Web Audio + visual + transição spring |
| 08 | **Loading** | Skeleton com shimmer vermelho |
| 09 | **Sucesso** | Toast success + confetti se relevante |
| 10 | **Erro** | Shake + glow vermelho + toast error com som grave |

---

## 07 · Estrutura de Seção Padrão

Todo bloco de seção dentro de uma página segue este padrão:

```tsx
<motion.section
  className="mb-14"
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
>
  {/* Header da seção */}
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-2">
      <span className="label-micro text-[#ff0033]">01 · SEÇÃO</span>
      <div className="h-[1px] w-8" style={{ background: "rgba(255,0,51,0.2)" }} />
    </div>
    <h2 className="page-title mb-1">Título da Seção</h2>
    <p className="text-xs text-[#525252] leading-relaxed">Subtítulo descritivo.</p>
  </div>

  {/* Conteúdo */}
  {/* ... */}
</motion.section>

{/* Divider entre seções */}
<div className="divider-sweep mb-14" />
```

**Divider sweep:**
```css
.divider-sweep {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(255,0,51,0.4) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: dividerSweep 4s linear infinite;
}
```

---

## 08 · Breadcrumb Padrão de Página

Todo page component deve iniciar com o breadcrumb estilo terminal:

```tsx
<div
  className="flex items-center gap-2 mb-8 text-xs text-[#525252]"
  style={{ fontFamily: "'JetBrains Mono', monospace" }}
>
  <Terminal size={12} className="text-[#ff0033]" />
  <span>C:\SIGMA\nome-da-secao&gt;</span>
  <span className="animate-cursor-blink text-[#ff0033]">_</span>
</div>
```
