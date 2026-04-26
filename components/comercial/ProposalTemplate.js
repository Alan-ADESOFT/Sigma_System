/**
 * components/comercial/ProposalTemplate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderiza a proposta dinâmica seguindo o template SIGMA × <Cliente>.
 *
 * Recebe `data` (JSONB completo da proposta) + `slug`, `status` opcionais.
 * Adapta-se a campos ausentes (oculta seções vazias).
 *
 * Campos suportados em `data`:
 *   - client_name, client_logo_url, doc_id, doc_hash, signed_by
 *   - issued_at, valid_until, cover_pitch
 *   - cover_industry, cover_modality
 *   - hero_stats: [{ value, sub_value?, label }]
 *   - pain_points: [{ num?, name, desc, stat? }]      (novo)
 *   - diagnostic_text                                 (legado, fallback)
 *   - quote_block: { text, source }                   (novo)
 *   - opportunity_text                                (legado, fallback)
 *   - pillars: [{ icon_num, title, desc, bullets[] }]
 *   - scope_items: [{ name, description, frequency, badge_type }]
 *   - timeline: [{ phase, title, desc }]
 *   - projection_stats: [{ label, value, desc }]
 *   - projection_disclaimer
 *   - investment: { full_price, parcelado_count, parcelado_value, items[],
 *                   cash_value?, cash_savings?, parcelado_label?, cycle_label?, setup_note? }
 *   - next_steps: [{ step_number, title, desc }]
 *   - final_title, final_message, final_tagline       (novos, opcionais)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../../assets/proposta.module.css';

/* ─── Helpers ─────────────────────────────────────────────────── */
function fmtBRL(n) {
  if (n == null) return '';
  try {
    return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  } catch { return `R$ ${n}`; }
}
function fmtBRLBare(n) {
  if (n == null) return '';
  try {
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  } catch { return String(n); }
}
function fmtDateBR(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('pt-BR'); }
  catch { return iso; }
}
function safeFileName(s) {
  return String(s || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/* Inline emphasis: divide texto em <em>...</em> e demais. */
function ProseInline({ text }) {
  if (!text) return null;
  const parts = String(text).split(/<em>([\s\S]*?)<\/em>/);
  return parts.map((p, i) => i % 2 === 0 ? p : <em key={i}>{p}</em>);
}

/* Quebra texto por \n\n em <p> + suporte a <em> inline */
function ProseBlock({ text, className }) {
  if (!text) return null;
  const paragraphs = String(text).trim().split(/\n\s*\n/).filter(Boolean);
  return (
    <div className={className || styles.prose}>
      {paragraphs.map((p, i) => <p key={i}><ProseInline text={p} /></p>)}
    </div>
  );
}

function badgeClass(type) {
  if (type === 'mensal' || type === 'incluido' || type === 'mensual') return `${styles.badge} ${styles.badgeMensal}`;
  if (type === 'unico' || type === 'extra' || type === 'exclusivo') return `${styles.badge} ${styles.badgeUnico}`;
  return `${styles.badge} ${styles.badgeDefault}`;
}
function badgeLabel(type) {
  if (type === 'mensal' || type === 'incluido') return 'Mensal';
  if (type === 'unico' || type === 'extra' || type === 'exclusivo') return 'Exclusivo';
  return type || 'Padrão';
}

/* SVG estática da projeção — opcional, decorativa */
function ProjectionChart() {
  return (
    <svg className={styles.chartSvg} viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="propGradLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff6680" />
          <stop offset="1" stopColor="#ff0033" />
        </linearGradient>
        <linearGradient id="propGradFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff0033" stopOpacity="0.4" />
          <stop offset="1" stopColor="#ff0033" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
        <line x1="0" y1="50"  x2="400" y2="50"  />
        <line x1="0" y1="100" x2="400" y2="100" />
        <line x1="0" y1="150" x2="400" y2="150" />
        <line x1="0" y1="200" x2="400" y2="200" />
      </g>
      <line x1="20" y1="200" x2="380" y2="195" stroke="#525252" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="385" y="195" fill="#525252" fontSize="9" fontFamily="JetBrains Mono">ATUAL</text>
      <path d="M 20 200 Q 100 195 160 165 T 280 80 T 380 20" fill="none" stroke="url(#propGradLine)" strokeWidth="3" />
      <path d="M 20 200 Q 100 195 160 165 T 280 80 T 380 20 L 380 240 L 20 240 Z" fill="url(#propGradFill)" />
      <text x="385" y="20" fill="#ff0033" fontSize="10" fontFamily="JetBrains Mono" fontWeight="700">SIGMA</text>
      <g fill="#525252" fontSize="9" fontFamily="JetBrains Mono">
        <text x="20" y="255">M1</text>
        <text x="100" y="255">M3</text>
        <text x="180" y="255">M6</text>
        <text x="260" y="255">M9</text>
        <text x="340" y="255">M12</text>
      </g>
    </svg>
  );
}

/* ─── Componente principal ─────────────────────────────────────── */
export default function ProposalTemplate({ data, slug, status = 'published' }) {
  if (!data) return null;

  // Backward compat: pain_points novos OU diagnostic_text legado
  const painPoints = Array.isArray(data.pain_points) && data.pain_points.length > 0 ? data.pain_points : null;
  const quoteBlock = data.quote_block && typeof data.quote_block === 'object' && data.quote_block.text ? data.quote_block : null;
  const heroStats  = Array.isArray(data.hero_stats) && data.hero_stats.length > 0 ? data.hero_stats : null;

  // Constrói rail (apenas seções com conteúdo)
  const rail = [{ id: 'cover', num: '00' }];
  if (painPoints || data.diagnostic_text)        rail.push({ id: 'diag', num: String(rail.length).padStart(2, '0') });
  if (quoteBlock || data.opportunity_text)       rail.push({ id: 'opp', num: String(rail.length).padStart(2, '0') });
  if (data.pillars?.length)                      rail.push({ id: 'pillars', num: String(rail.length).padStart(2, '0') });
  if (data.scope_items?.length)                  rail.push({ id: 'scope', num: String(rail.length).padStart(2, '0') });
  if (data.timeline?.length)                     rail.push({ id: 'timeline', num: String(rail.length).padStart(2, '0') });
  if (data.projection_stats?.length)             rail.push({ id: 'projection', num: String(rail.length).padStart(2, '0') });
  if (data.investment?.full_price != null)       rail.push({ id: 'invest', num: String(rail.length).padStart(2, '0') });
  if (data.next_steps?.length)                   rail.push({ id: 'next', num: String(rail.length).padStart(2, '0') });

  const firstSecAfterCover = rail.find((r) => r.id !== 'cover');
  const clientUpper = (data.client_name || 'CLIENTE').toUpperCase();
  const fileName = safeFileName(data.client_name);
  const statusLabel = status === 'published' ? 'LIVE' : (status || 'draft').toUpperCase();
  const issuedYear  = data.issued_at ? new Date(data.issued_at).getFullYear() : new Date().getFullYear();

  return (
    <div className={styles.page}>
      {/* ═════ TOPBAR ═════ */}
      <div className={styles.topbar}>
        <div className={styles.left}>
          <span className={styles.dot} />
          <span>SIGMA</span>
          <span>×</span>
          <span className={styles.live}>{clientUpper}</span>
        </div>
        <div className={styles.right}>
          {data.doc_id && <span>DOC#: <b>{data.doc_id}</b></span>}
          <span>STATUS <b>{statusLabel}</b></span>
          <span>CONFIDENCIAL</span>
        </div>
      </div>

      {/* ═════ SIDE RAIL ═════ */}
      <nav className={styles.rail} aria-label="Navegação da proposta">
        {rail.map(({ id, num }) => (
          <a key={id} href={`#${id}`}><i /><span>{num}</span></a>
        ))}
      </nav>

      {/* ═════ HERO / COVER ═════ */}
      <section className={styles.hero} id="cover">
        <div className={styles.heroStamp}>
          <div className={styles.row}>
            <span>PROP_ID</span>
            <span className={styles.id}>{data.doc_id || (slug ? `#${slug.slice(0, 14).toUpperCase()}` : '#—')}</span>
          </div>
          {data.issued_at && (
            <div className={styles.row}><span>EMITIDO</span><span>{fmtDateBR(data.issued_at)}</span></div>
          )}
          {data.valid_until && (
            <div className={styles.row}><span>VÁLIDO ATÉ</span><span>{fmtDateBR(data.valid_until)}</span></div>
          )}
          <div className={styles.row}>
            <span>STATUS</span>
            <span className={styles.ok}>● {statusLabel}</span>
          </div>
        </div>

        <div className={styles.container}>
          <div className={styles.breadcrumb}>
            <span>C:\SIGMA\propostas&gt;</span>
            <span className={styles.arrow}>»</span>
            <span>open {fileName}.exe</span>
            <span className={styles.blink} />
          </div>

          <div className={styles.label}>// PROPOSTA COMERCIAL · CONFIDENCIAL</div>
          <div className={styles.heroClientTag}>Preparado exclusivamente para</div>

          <h1>
            SIGMA <span className={styles.x}>×</span><br />
            <span className={styles.red}>{clientUpper}</span>
          </h1>

          {data.cover_pitch && <p className={styles.lead}>{data.cover_pitch}</p>}

          {heroStats && (
            <div className={styles.heroStats}>
              {heroStats.slice(0, 4).map((s, i) => (
                <div key={i} className={styles.stat}>
                  <div className={styles.num}>
                    {s.value}{s.sub_value && <sub>{s.sub_value}</sub>}
                  </div>
                  <div className={styles.lbl}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.metaGrid}>
            <div className={styles.item}>
              <div className={styles.lbl}>Cliente</div>
              <div className={styles.val}>{clientUpper}</div>
            </div>
            {data.cover_industry && (
              <div className={styles.item}>
                <div className={styles.lbl}>Setor</div>
                <div className={styles.val}>{data.cover_industry.toUpperCase()}</div>
              </div>
            )}
            <div className={styles.item}>
              <div className={styles.lbl}>Apresentado por</div>
              <div className={styles.val}>SIGMA <b>// AGÊNCIA HACKER</b></div>
            </div>
            {data.cover_modality && (
              <div className={styles.item}>
                <div className={styles.lbl}>Modalidade</div>
                <div className={styles.val}>CICLO <b>{data.cover_modality.toUpperCase()}</b></div>
              </div>
            )}
          </div>

          {firstSecAfterCover && (
            <a href={`#${firstSecAfterCover.id}`} className={styles.heroCta}>
              <span>Iniciar diagnóstico</span>
              <span className={styles.arr}>→</span>
            </a>
          )}
        </div>

        <div className={styles.heroAuth}>
          <span>// SIGNED · {(data.signed_by || 'SIGMA').toUpperCase()} · SIGMA AGÊNCIA HACKER</span>
          <span className={styles.status}>SECURE CHANNEL</span>
          {data.doc_hash && <span className={styles.hash}>{data.doc_hash}</span>}
        </div>
      </section>

      {(painPoints || data.diagnostic_text) && <div className={styles.divider} />}

      {/* ═════ 01 · DIAGNÓSTICO ═════ */}
      {(painPoints || data.diagnostic_text) && (
        <section className={styles.section} id="diag">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 01 · DIAGNÓSTICO</div>
            <h2 className={styles.secTitle}>O <em>cenário</em> que você está vivendo.</h2>

            {data.diagnostic_text && (
              <div className={styles.secSub}>
                <ProseBlock text={data.diagnostic_text} />
              </div>
            )}

            {painPoints && (
              <div className={styles.painGrid}>
                {painPoints.map((p, i) => (
                  <div key={i} className={styles.pain}>
                    <div className={styles.num}>// PROBLEMA {p.num || String(i + 1).padStart(2, '0')}</div>
                    <div className={styles.name}>{p.name}</div>
                    {p.desc && <div className={styles.desc}>{p.desc}</div>}
                    {p.stat && <div className={styles.stat}>› {p.stat}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {(quoteBlock || data.opportunity_text) && <div className={styles.divider} />}

      {/* ═════ 02 · OPORTUNIDADE ═════ */}
      {(quoteBlock || data.opportunity_text) && (
        <section className={styles.section} id="opp">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 02 · OPORTUNIDADE</div>
            <h2 className={styles.secTitle}>A <em>verdade</em> que ninguém te conta.</h2>

            {data.opportunity_text && (
              <div className={styles.secSub}>
                <ProseBlock text={data.opportunity_text} />
              </div>
            )}

            {quoteBlock && (
              <div className={styles.quoteBlock}>
                <p className={styles.text}><ProseInline text={quoteBlock.text} /></p>
                {quoteBlock.source && <div className={styles.src}>— {quoteBlock.source}</div>}
              </div>
            )}
          </div>
        </section>
      )}

      {data.pillars?.length > 0 && <div className={styles.divider} />}

      {/* ═════ 03 · PILARES ═════ */}
      {data.pillars?.length > 0 && (
        <section className={styles.section} id="pillars">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 03 · A PROPOSTA SIGMA</div>
            <h2 className={styles.secTitle}>{data.pillars.length} pilares. <em>Um sistema único.</em></h2>
            <p className={styles.secSub}>
              A SIGMA não vende serviço solto. Entrega um sistema integrado — onde
              estratégia, conteúdo e tráfego trabalham como uma única máquina de crescimento.
            </p>

            <div className={styles.pillars}>
              {data.pillars.map((p, i) => (
                <div key={i} className={styles.pillar}>
                  <div className={styles.icon}>{p.icon_num || String(i + 1).padStart(2, '0')}</div>
                  <h3>{p.title}</h3>
                  {p.desc && <p className={styles.desc}>{p.desc}</p>}
                  {p.bullets?.length > 0 && (
                    <ul>{p.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data.scope_items?.length > 0 && <div className={styles.divider} />}

      {/* ═════ 04 · ESCOPO DETALHADO ═════ */}
      {data.scope_items?.length > 0 && (
        <section className={styles.section} id="scope">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 04 · ESCOPO DETALHADO</div>
            <h2 className={styles.secTitle}>O que entra na <em>caixa</em>.</h2>
            <p className={styles.secSub}>
              Tudo que será entregue, com frequência e modalidade. Sem letras miúdas,
              sem &quot;consultar comercial&quot;. O que está aqui, está fechado.
            </p>

            <div className={styles.tableWrapper}>
              <table className={styles.scopeTable}>
                <thead>
                  <tr>
                    <th>ENTREGA</th>
                    <th>FREQUÊNCIA</th>
                    <th>MODALIDADE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scope_items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        <div className={styles.itemName}>
                          {String(i + 1).padStart(2, '0')} · {it.name}
                        </div>
                        {it.description && <div className={styles.itemDesc}>{it.description}</div>}
                      </td>
                      <td><span className={styles.freq}>{it.frequency || '—'}</span></td>
                      <td><span className={badgeClass(it.badge_type)}>{badgeLabel(it.badge_type)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {data.timeline?.length > 0 && <div className={styles.divider} />}

      {/* ═════ 05 · CRONOGRAMA ═════ */}
      {data.timeline?.length > 0 && (
        <section className={styles.section} id="timeline">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 05 · CICLO</div>
            <h2 className={styles.secTitle}>Como funciona o <em>ciclo</em>.</h2>
            <p className={styles.secSub}>
              A SIGMA opera em ciclos com fases claras. Cada fase tem foco específico
              dentro do plano — execução cirúrgica e revisão estratégica.
            </p>

            <div className={styles.timeline}>
              {data.timeline.map((step, i) => (
                <div key={i} className={styles.tlStep}>
                  <div className={styles.week}>{step.phase}</div>
                  <h4>{step.title}</h4>
                  {step.desc && <p>{step.desc}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data.projection_stats?.length > 0 && <div className={styles.divider} />}

      {/* ═════ 06 · PROJEÇÃO ═════ */}
      {data.projection_stats?.length > 0 && (
        <section className={styles.section} id="projection">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 06 · PROJEÇÃO</div>
            <h2 className={styles.secTitle}>O <em>cenário</em> ao fim do ciclo.</h2>
            <p className={styles.secSub}>
              Projeção baseada em médias de clientes SIGMA com escopo similar.
              Não é promessa — é a curva matemática que esse sistema tende a entregar.
            </p>

            <div className={styles.projection}>
              <div className={styles.projStats}>
                {data.projection_stats.map((s, i) => (
                  <div key={i} className={styles.projStat}>
                    <div className={styles.lbl}>{s.label}</div>
                    <div className={styles.val}>{s.value}</div>
                    {s.desc && <div className={styles.statDesc}>{s.desc}</div>}
                  </div>
                ))}
              </div>
              <ProjectionChart />
              {data.projection_disclaimer && (
                <div className={styles.projDisclaimer}>// {data.projection_disclaimer}</div>
              )}
            </div>
          </div>
        </section>
      )}

      {data.investment?.full_price != null && <div className={styles.divider} />}

      {/* ═════ 07 · INVESTIMENTO ═════ */}
      {data.investment?.full_price != null && (
        <section className={styles.section} id="invest">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 07 · INVESTIMENTO</div>
            <h2 className={styles.secTitle}>
              Pacote <em>{data.cover_modality?.toLowerCase() || 'completo'}</em> SIGMA.
            </h2>
            <p className={styles.secSub}>
              Um único pacote, completo, fechado. Tudo o que {data.client_name || 'você'} precisa pra
              construir presença digital de autoridade. Sem upsell escondido, sem letra miúda.
            </p>

            <div className={styles.plans}>
              <div className={`${styles.plan} ${styles.planFeatured}`}>
                <div className={styles.planName}>PACOTE ÚNICO</div>
                <div className={styles.planTitle}>
                  {(data.cover_modality?.toUpperCase() || 'COMPLETO')} SIGMA
                </div>
                <div className={styles.price}>
                  <span className={styles.currency}>R$</span>
                  {fmtBRLBare(data.investment.full_price)}
                  <small> · {data.investment.cycle_label || 'ciclo completo'}</small>
                </div>
                {data.investment.setup_note && (
                  <div className={styles.setup}>{data.investment.setup_note}</div>
                )}

                {(data.investment.parcelado_count > 0 || data.investment.cash_value != null) && (
                  <div className={styles.priceSplit}>
                    {data.investment.cash_value != null && (
                      <div className={styles.priceCardCash}>
                        <div className={`${styles.priceCardLabel} ${styles.cashLabel}`}>À VISTA</div>
                        <div className={`${styles.priceCardValue} ${styles.cashValue}`}>{fmtBRL(data.investment.cash_value)}</div>
                        {data.investment.cash_savings != null && (
                          <div className={styles.priceCardSub}>economia de {fmtBRL(data.investment.cash_savings)}</div>
                        )}
                      </div>
                    )}
                    {data.investment.parcelado_count > 0 && data.investment.parcelado_value != null && (
                      <div className={styles.priceCardInst}>
                        <div className={`${styles.priceCardLabel} ${styles.instLabel}`}>PARCELADO</div>
                        <div className={`${styles.priceCardValue} ${styles.instValue}`}>
                          {data.investment.parcelado_count}× {fmtBRL(data.investment.parcelado_value)}
                        </div>
                        <div className={styles.priceCardSub}>{data.investment.parcelado_label || 'sem juros'}</div>
                      </div>
                    )}
                  </div>
                )}

                {data.investment.items?.length > 0 && (
                  <ul>
                    {data.investment.items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                )}

                {data.next_steps?.length > 0 && (
                  <a href="#next" className={styles.cta}>QUERO AVANÇAR COM A SIGMA</a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {data.next_steps?.length > 0 && <div className={styles.divider} />}

      {/* ═════ 08 · NEXT STEPS ═════ */}
      {data.next_steps?.length > 0 && (
        <section className={styles.section} id="next">
          <div className={styles.container}>
            <div className={styles.secTag}><span className={styles.line} /> 08 · PRÓXIMOS PASSOS</div>
            <h2 className={styles.secTitle}>Como <em>começamos</em>.</h2>
            <p className={styles.secSub}>
              O processo é simples. Sem burocracia. Em poucos dias após o &quot;sim&quot;,
              {data.client_name ? ` ${data.client_name} ` : ' você '} já está no sistema SIGMA.
            </p>

            <div className={styles.nextGrid}>
              {data.next_steps.map((s, i) => (
                <div key={i} className={styles.nextCard}>
                  <div className={styles.step}>{s.step_number || String(i + 1).padStart(2, '0')}</div>
                  <h4>{s.title}</h4>
                  {s.desc && <p>{s.desc}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═════ FINAL ═════ */}
      {(data.final_title || data.final_message || data.final_tagline) && (
        <section className={styles.final}>
          <div className={styles.container}>
            {data.final_title && (
              <h2><ProseInline text={data.final_title} /></h2>
            )}
            {data.final_message && <p>{data.final_message}</p>}
            {data.final_tagline && (
              <p className={styles.finalTagline}>
                ▸ <ProseInline text={data.final_tagline} />
              </p>
            )}

            <div className={styles.signature}>
              <div>
                <div className={styles.line}>PROPOSTO POR</div>
                <b>{(data.signed_by || 'SIGMA').toUpperCase()}</b>
              </div>
              {data.issued_at && (
                <div>
                  <div className={styles.line}>DATA</div>
                  <b>{fmtDateBR(data.issued_at)}</b>
                </div>
              )}
              {data.cover_modality && (
                <div>
                  <div className={styles.line}>CONTRATO</div>
                  <b>CICLO {data.cover_modality.toUpperCase()}</b>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <div>SIGMA © {issuedYear} · MARKETING DE VANTAGEM</div>
        {data.doc_id && <div>DOC {data.doc_id} · CONFIDENCIAL · {clientUpper}</div>}
      </footer>
    </div>
  );
}

/* Re-export do componente expirado pra ser usado pela página pública */
export function ExpiredScreen({ kind = 'expired' }) {
  const isExpired = kind === 'expired';
  return (
    <div className={styles.expiredScreen}>
      <div className={styles.expiredCard}>
        <div className={styles.expiredIcon}>
          {isExpired ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>
        <div className={styles.expiredTitle}>
          {isExpired ? 'Esta proposta expirou' : 'Proposta não encontrada'}
        </div>
        <div className={styles.expiredDesc}>
          {isExpired
            ? 'O link da proposta passou da data de validade. Solicite uma nova versão ao seu contato comercial SIGMA.'
            : 'O link que você abriu não existe ou foi removido. Confira com seu contato comercial SIGMA se o endereço está correto.'}
        </div>
      </div>
    </div>
  );
}
