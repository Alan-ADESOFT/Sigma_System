/**
 * components/FormWizard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wizard de 11 etapas do briefing SIGMA.
 * Etapa 0 = boas-vindas, 1-11 = perguntas, 'done' = obrigado.
 * Renderiza campos, gerencia navegação e integra com o sistema de rascunho.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FORM_STEPS, TOTAL_QUESTIONS } from '../assets/data/formQuestions';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/form.module.css';

/* ═══════════════════════════════════════════════════════════
   ÍCONES SVG — sem dependência de lib externa
═══════════════════════════════════════════════════════════ */

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconClock({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconSave({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function IconShield({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════ */

export default function FormWizard({ token, clientData, draft }) {
  const { notify } = useNotification();

  // 0 = boas-vindas, 1-11 = etapas, 'done' = obrigado
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Indicador "✓ Salvo" no canto do card
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef(null);

  // Debounce ref para localStorage
  const debounceRef = useRef(null);

  /* ── Restaura rascunho se o draft vier do pai ── */
  useEffect(() => {
    if (draft?.data && Object.keys(draft.data).length > 0) {
      console.log('[FORM] Restaurando rascunho', { step: draft.currentStep });
      setFormData(draft.data);
      setCurrentStep(draft.currentStep || 1);
    }
  }, [draft]);

  /* ── Conta perguntas respondidas para o percentual real ── */
  const answeredCount = Object.values(formData).filter(v =>
    v !== '' && v !== null && v !== undefined &&
    !(Array.isArray(v) && v.length === 0)
  ).length;

  const completionPct = Math.round((answeredCount / TOTAL_QUESTIONS) * 100);

  // Dados da etapa atual
  const stepData = FORM_STEPS[currentStep - 1] || null;

  /* ── Salva rascunho no localStorage com debounce 800ms ── */
  const saveDraftLocal = useCallback((data, step) => {
    if (!token) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        localStorage.setItem(`form_draft_${token}`, JSON.stringify({
          data,
          currentStep: step,
          savedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }));
        console.log('[FORM] Rascunho local salvo', { step });
      } catch (err) {
        console.warn('[FORM] Erro ao salvar rascunho local', err);
      }
    }, 800);
  }, [token]);

  /* ── Salva rascunho no servidor (ao trocar de etapa) ── */
  const saveDraftToServer = useCallback(async (data, step) => {
    if (!token) return;
    try {
      const res = await fetch('/api/form/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, data, currentStep: step }),
      });
      const result = await res.json();
      if (result.success) {
        console.log('[FORM] Rascunho salvo no servidor');
        // Indicador visual no card
        setShowSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
      }
    } catch (err) {
      // Falha silenciosa — não bloqueia, mas avisa se o dispositivo ficar offline
      console.warn('[FORM] Falha ao salvar no servidor', err.message);
      notify('Rascunho salvo apenas neste dispositivo. Verifique sua conexão.', 'warning', 3500);
    }
  }, [token, notify]);

  /* ── Atualiza campo individual ── */
  const handleFieldChange = useCallback((questionId, value) => {
    setFormData(prev => {
      const next = { ...prev, [questionId]: value };
      saveDraftLocal(next, currentStep);
      return next;
    });
  }, [currentStep, saveDraftLocal]);

  /* ── Navegação ── */
  const handleNextStep = useCallback(() => {
    if (currentStep === 0) {
      // Marca token como in_progress ao iniciar o preenchimento
      fetch('/api/form/mark-started', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
      setCurrentStep(1);
      return;
    }

    saveDraftToServer(formData, currentStep);

    if (currentStep < 11) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep, formData, saveDraftToServer]);

  const handlePrevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  /* ── Submit final ── */
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    console.log('[FORM] Enviando formulário...', { answeredCount });

    try {
      const res = await fetch('/api/form/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, data: formData }),
      });
      const result = await res.json();

      if (result.success) {
        console.log('[FORM] Formulário enviado com sucesso');
        notify('Formulario enviado! Retornaremos em breve.', 'success');
        try { localStorage.removeItem(`form_draft_${token}`); } catch {}
        setCurrentStep('done');
      } else {
        console.error('[FORM] Erro no submit', result);
        notify('Erro ao enviar. Seus dados estao salvos. Tente novamente.', 'error');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('[FORM] Erro de conexão no submit', err);
      notify('Erro de conexão. Seus dados estão salvos. Verifique sua internet e tente novamente.', 'error', 6000);
      setIsSubmitting(false);
    }
  }, [token, formData, answeredCount, notify]);

  /* ── Limpa timers ao desmontar ── */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  /* ── Renderização condicional ── */
  if (currentStep === 0) {
    return <WelcomeScreen onStart={handleNextStep} />;
  }

  if (currentStep === 'done') {
    return <ThankYouScreen />;
  }

  /* ── Wizard ativo (etapas 1-11) ── */
  return (
    <>
      {/* Barra de progresso fixa no topo */}
      <div className={styles.progressBarTrack}>
        <div
          className={styles.progressBarFill}
          style={{ width: `${(currentStep / 11) * 100}%` }}
        />
      </div>

      {/* Label de progresso */}
      <div className={styles.progressLabel}>
        Etapa {currentStep} de 11 — {completionPct}% concluído
      </div>

      {/* Banner de rascunho */}
      <div className={styles.draftBanner}>
        <span className={styles.draftBannerIcon}><IconSave size={13} /></span>
        Rascunho salvo. Seus dados ficam neste dispositivo por 30 dias.
      </div>

      {/* Card do wizard */}
      <div className={styles.wizardCard}>
        {/* Indicador "✓ Salvo" */}
        <span className={`${styles.saveIndicator} ${showSaved ? styles.visible : ''}`}>
          ✓ Salvo
        </span>

        {/* Header da etapa */}
        {stepData && (
          <div className={styles.stepHeader}>
            <div className={styles.stepNumber}>ETAPA {currentStep} DE 11</div>
            <h2 className={styles.stepTitle}>{stepData.title}</h2>
            <p className={styles.stepDescription}>{stepData.description}</p>
            <div className={styles.stepDivider} />
          </div>
        )}

        {/* Perguntas da etapa */}
        <div>
          {stepData && stepData.questions.map(q => (
            <QuestionField
              key={q.id}
              question={q}
              value={formData[q.id]}
              formData={formData}
              onChange={handleFieldChange}
            />
          ))}
        </div>

        {/* Navegação */}
        <div className={styles.navButtons}>
          <button
            className={styles.btnPrev}
            onClick={handlePrevStep}
            disabled={currentStep <= 1}
          >
            ← Anterior
          </button>

          {currentStep < 11 ? (
            <button className={styles.btnNext} onClick={handleNextStep}>
              Próxima Etapa →
            </button>
          ) : (
            <button
              className={`${styles.btnNext} ${isSubmitting ? styles.loading : ''}`}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className={styles.submitSpinner} />
                  Enviando...
                </>
              ) : (
                'Enviar Respostas →'
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   QUESTION FIELD — renderiza o campo correto baseado no tipo
═══════════════════════════════════════════════════════════ */

function QuestionField({ question, value, formData, onChange }) {
  const q = question;

  return (
    <div className={styles.fieldGroup}>
      {/* Label — não mostra para composite (cada subcampo tem seu label) */}
      {q.type !== 'composite' && (
        <label className={styles.fieldLabel}>
          {q.label}
          {q.required && <span className={styles.required}>*</span>}
        </label>
      )}

      {/* Renderiza o campo baseado no tipo */}
      {q.type === 'text' && (
        <InputText question={q} value={value} onChange={onChange} />
      )}

      {q.type === 'textarea' && (
        <InputTextarea question={q} value={value} onChange={onChange} />
      )}

      {q.type === 'select' && (
        <InputSelect question={q} value={value} onChange={onChange} />
      )}

      {q.type === 'number' && (
        <InputNumber question={q} value={value} onChange={onChange} />
      )}

      {q.type === 'radio' && (
        <RadioGroup question={q} value={value} formData={formData} onChange={onChange} />
      )}

      {q.type === 'checkbox' && (
        <CheckboxGroup question={q} value={value} formData={formData} onChange={onChange} />
      )}

      {q.type === 'composite' && (
        <CompositeField question={q} formData={formData} onChange={onChange} />
      )}

      {/* Hint abaixo do campo */}
      {q.hint && <p className={styles.fieldHint}>{q.hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CAMPOS INDIVIDUAIS
═══════════════════════════════════════════════════════════ */

/* ── Input Text ── */
function InputText({ question, value, onChange }) {
  return (
    <input
      type="text"
      className={styles.inputText}
      value={value || ''}
      onChange={e => onChange(question.id, e.target.value)}
      placeholder={question.placeholder || ''}
      autoComplete="off"
    />
  );
}

/* ── Textarea ── */
function InputTextarea({ question, value, onChange }) {
  return (
    <textarea
      className={styles.inputTextarea}
      value={value || ''}
      onChange={e => onChange(question.id, e.target.value)}
      placeholder={question.placeholder || ''}
      rows={4}
    />
  );
}

/* ── Select ── */
function InputSelect({ question, value, onChange }) {
  return (
    <select
      className={styles.inputSelect}
      value={value || ''}
      onChange={e => onChange(question.id, e.target.value)}
    >
      <option value="">Selecione...</option>
      {question.options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

/* ── Number ── */
function InputNumber({ question, value, onChange }) {
  return (
    <input
      type="number"
      className={styles.inputNumber}
      value={value || ''}
      onChange={e => onChange(question.id, e.target.value)}
      placeholder={question.placeholder || ''}
      min={0}
      max={10}
      autoComplete="off"
    />
  );
}

/* ── Radio Group — seleção única com opções visuais customizadas ── */
function RadioGroup({ question, value, formData, onChange }) {
  const selectedValue = value || '';

  return (
    <div className={styles.radioGroup}>
      {question.options.map(opt => (
        <div key={opt}>
          <div
            className={`${styles.radioOption} ${selectedValue === opt ? styles.selected : ''}`}
            onClick={() => onChange(question.id, opt)}
            role="radio"
            aria-checked={selectedValue === opt}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(question.id, opt); } }}
          >
            <div className={`${styles.radioCircle} ${selectedValue === opt ? styles.selected : ''}`} />
            <span className={styles.radioLabel}>{opt}</span>
          </div>

          {/* Campos condicionais vinculados a esta opção */}
          {question.conditionalFields && selectedValue === opt && (
            question.conditionalFields
              .filter(cf => {
                if (cf.trigger.value) return cf.trigger.value === opt;
                if (cf.trigger.values) return cf.trigger.values.includes(opt);
                return false;
              })
              .map(cf => (
                <div key={cf.field.id} className={styles.conditionalField}>
                  <label className={styles.fieldLabel}>{cf.field.label}</label>
                  <input
                    type="text"
                    className={styles.otherInput}
                    value={formData[cf.field.id] || ''}
                    onChange={e => onChange(cf.field.id, e.target.value)}
                    placeholder={cf.field.placeholder || ''}
                    autoComplete="off"
                  />
                </div>
              ))
          )}
        </div>
      ))}

      {/* Opção "Outro" com campo de texto */}
      {question.hasOther && (
        <div>
          <div
            className={`${styles.radioOption} ${selectedValue === '__other__' ? styles.selected : ''}`}
            onClick={() => onChange(question.id, '__other__')}
            role="radio"
            aria-checked={selectedValue === '__other__'}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(question.id, '__other__'); } }}
          >
            <div className={`${styles.radioCircle} ${selectedValue === '__other__' ? styles.selected : ''}`} />
            <span className={styles.radioLabel}>Outro</span>
          </div>
          {selectedValue === '__other__' && (
            <div className={styles.conditionalField}>
              <input
                type="text"
                className={styles.otherInput}
                value={formData[`${question.id}_other`] || ''}
                onChange={e => onChange(`${question.id}_other`, e.target.value)}
                placeholder="Especifique..."
                autoComplete="off"
                autoFocus
              />
            </div>
          )}
        </div>
      )}

      {/* Campos condicionais com trigger "values" — mostra quando qualquer opção da lista está selecionada */}
      {question.conditionalFields && question.conditionalFields
        .filter(cf => cf.trigger.values && cf.trigger.values.includes(selectedValue))
        .map(cf => (
          <div key={cf.field.id} className={styles.conditionalField}>
            <label className={styles.fieldLabel}>{cf.field.label}</label>
            <input
              type="text"
              className={styles.otherInput}
              value={formData[cf.field.id] || ''}
              onChange={e => onChange(cf.field.id, e.target.value)}
              placeholder={cf.field.placeholder || ''}
              autoComplete="off"
            />
          </div>
        ))
      }
    </div>
  );
}

/* ── Checkbox Group — seleção múltipla ── */
function CheckboxGroup({ question, value, formData, onChange }) {
  // value é um array de opções selecionadas
  const selected = Array.isArray(value) ? value : [];

  const toggleOption = (opt) => {
    const next = selected.includes(opt)
      ? selected.filter(v => v !== opt)
      : [...selected, opt];
    onChange(question.id, next);
  };

  return (
    <div className={styles.checkboxGroup}>
      {question.options.map(opt => (
        <div key={opt}>
          <div
            className={`${styles.checkboxOption} ${selected.includes(opt) ? styles.checked : ''}`}
            onClick={() => toggleOption(opt)}
            role="checkbox"
            aria-checked={selected.includes(opt)}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleOption(opt); } }}
          >
            <div className={`${styles.checkboxBox} ${selected.includes(opt) ? styles.checked : ''}`}>
              {selected.includes(opt) && <CheckIcon />}
            </div>
            <span className={styles.checkboxLabel}>{opt}</span>
          </div>

          {/* Campo condicional vinculado a opção de checkbox (ex: CRM → Qual?) */}
          {question.conditionalFields && selected.includes(opt) && (
            question.conditionalFields
              .filter(cf => cf.trigger.option === opt)
              .map(cf => (
                <div key={cf.field.id} className={styles.conditionalField}>
                  <label className={styles.fieldLabel}>{cf.field.label}</label>
                  <input
                    type="text"
                    className={styles.otherInput}
                    value={formData[cf.field.id] || ''}
                    onChange={e => onChange(cf.field.id, e.target.value)}
                    placeholder={cf.field.placeholder || ''}
                    autoComplete="off"
                  />
                </div>
              ))
          )}
        </div>
      ))}

      {/* Opção "Outro" com campo de texto */}
      {question.hasOther && (
        <div>
          <div
            className={`${styles.checkboxOption} ${selected.includes('__other__') ? styles.checked : ''}`}
            onClick={() => toggleOption('__other__')}
            role="checkbox"
            aria-checked={selected.includes('__other__')}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleOption('__other__'); } }}
          >
            <div className={`${styles.checkboxBox} ${selected.includes('__other__') ? styles.checked : ''}`}>
              {selected.includes('__other__') && <CheckIcon />}
            </div>
            <span className={styles.checkboxLabel}>Outro</span>
          </div>
          {selected.includes('__other__') && (
            <div className={styles.conditionalField}>
              <input
                type="text"
                className={styles.otherInput}
                value={formData[`${question.id}_other`] || ''}
                onChange={e => onChange(`${question.id}_other`, e.target.value)}
                placeholder="Especifique..."
                autoComplete="off"
                autoFocus
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Composite — múltiplos subcampos agrupados (ex: 11.3 Nome + Contato) ── */
function CompositeField({ question, formData, onChange }) {
  return (
    <div>
      {/* Label principal do composite */}
      <label className={styles.fieldLabel}>
        {question.label}
        {question.required && <span className={styles.required}>*</span>}
      </label>

      {question.fields.map(field => (
        <div key={field.id} className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>{field.label}</label>
          <input
            type="text"
            className={styles.inputText}
            value={formData[field.id] || ''}
            onChange={e => onChange(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            autoComplete="off"
          />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TELA DE BOAS-VINDAS (etapa 0)
═══════════════════════════════════════════════════════════ */

function WelcomeScreen({ onStart }) {
  return (
    <div className={styles.wizardCard}>
      <div className={styles.welcomeScreen}>
        {/* Logo real da Sigma */}
        <div className={styles.welcomeLogoContainer}>
          <img src="/logo.ranca.png" alt="SIGMA" className={styles.welcomeLogoImg} />
        </div>

        <h1 className={styles.welcomeTitle}>
          Você não contratou uma agência.
          <br />
          Contratou <span>estratégia.</span>
        </h1>

        <p className={styles.welcomeBody}>
          Marketing não começa com post. Começa com raio-X.
          Este formulário é o raio-X do seu negócio.
          A gente vai abrir no osso: seu mercado, seu cliente,
          seus diferenciais, onde está o dinheiro que ninguém viu.
        </p>

        <div className={styles.welcomeDivider} />

        <div className={styles.welcomeList}>
          <div className={styles.welcomeListItem}>
            <span className={styles.welcomeListIcon}><IconClock size={16} /></span>
            <span>Tempo estimado: 25 a 40 minutos</span>
          </div>
          <div className={styles.welcomeListItem}>
            <span className={styles.welcomeListIcon}><IconSave size={16} /></span>
            <span>Você pode salvar e continuar depois</span>
          </div>
          <div className={styles.welcomeListItem}>
            <span className={styles.welcomeListIcon}><IconShield size={16} /></span>
            <span>Formulário confidencial — só a Sigma tem acesso</span>
          </div>
        </div>

        <div className={styles.welcomeHighlightBox}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>AVISO: Resposta rasa = estratégia genérica.</span>
        </div>

        <button className={styles.welcomeBtn} onClick={onStart}>
          Vamos. →
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TELA DE OBRIGADO (após submit)
═══════════════════════════════════════════════════════════ */

function ThankYouScreen() {
  return (
    <div className={styles.thankYouScreen}>
      {/* Logo */}
      <div className={styles.thankYouLogoContainer}>
        <img src="/logo.ranca.png" alt="SIGMA" className={styles.thankYouLogoImg} />
      </div>

      {/* Check animado */}
      <div className={styles.checkAnim}>
        <svg viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="24" />
          <path d="M14 27l7 7 16-16" />
        </svg>
      </div>

      <div className={styles.welcomeDivider} />

      <h1 className={styles.thankYouTitle}>&gt; Recebemos tudo.</h1>

      <p className={styles.thankYouSubtitle}>
        Isso não foi um questionário. Foi o primeiro movimento
        estratégico do seu projeto.
      </p>

      <div className={styles.thankYouBody}>
        <p>Suas respostas vão ser analisadas pelo time de estratégia da Sigma.</p>
        <p>Com base nelas, vamos construir:</p>
        <div className={styles.thankYouList}>
          <div className={styles.thankYouListItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Posicionamento</span>
          </div>
          <div className={styles.thankYouListItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Estratégia</span>
          </div>
          <div className={styles.thankYouListItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Narrativa</span>
          </div>
        </div>
      </div>
    </div>
  );
}
