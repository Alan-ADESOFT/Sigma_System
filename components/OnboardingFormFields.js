/**
 * components/OnboardingFormFields.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderizador de campos de formulário do onboarding.
 *
 * Suporta os mesmos tipos do formQuestions.js:
 *   text | textarea | radio | checkbox | select | number | composite | slider
 *
 * Foi escrito como componente isolado (em vez de reusar o FormWizard antigo)
 * porque a UX do onboarding é diferente:
 *   · Não tem navegação entre etapas (cada etapa é uma página/dia inteiro)
 *   · Tem suporte a "campo preenchido por áudio" — o pai pode passar
 *     `recentlyFilled` (Set de IDs) e a gente pisca o input pra mostrar
 *     que a IA acabou de escrever ali.
 *
 * Props:
 *   - questions:        Array de perguntas (formato do onboardingQuestions.js)
 *   - values:           Objeto { questionId: valor }
 *   - onChange:         (questionId, value) => void
 *   - recentlyFilled:   Set<string> — IDs preenchidos por áudio (pisca no UI)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import styles from '../assets/style/onboarding.module.css';

/* ─── Ícones inline ─── */
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════ */

export default function OnboardingFormFields({ questions, values = {}, onChange, recentlyFilled, errors }) {
  if (!Array.isArray(questions)) return null;

  return (
    <div>
      {questions.map((q, idx) => (
        <FieldWrapper
          key={q.id}
          question={q}
          value={values[q.id]}
          values={values}
          onChange={onChange}
          recentlyFilled={recentlyFilled}
          hasError={errors?.has?.(q.id)}
          delay={idx * 30}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FIELD WRAPPER — escolhe o componente certo pelo type
═══════════════════════════════════════════════════════════ */

function FieldWrapper({ question, value, values, onChange, recentlyFilled, hasError, delay }) {
  const q = question;
  const [helpOpen, setHelpOpen] = useState(false);

  // Mostra a numeração visível pra fazer sentido com o popup de áudio
  // ("fale: a pergunta 1.1 é..."). Campos `_extra_*` (livres no fim de cada
  // etapa) ficam sem número porque não fazem parte da numeração ditada.
  const showNumber = !q.id?.startsWith?.('_extra_');

  return (
    <div
      className={`${styles.fieldGroup} ${hasError ? styles.fieldError : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      data-question-id={q.id}
    >
      {/* Label — composite tem label dentro do próprio componente */}
      {q.type !== 'composite' && (
        <label className={styles.fieldLabel}>
          {showNumber && <span className={styles.questionNumber}>{q.id}</span>}
          {q.label}
          {q.required && <span className={styles.fieldRequired}>*</span>}
          {q.helpText && (
            <button
              type="button"
              className={styles.helpButton}
              onClick={() => setHelpOpen(o => !o)}
              aria-label={helpOpen ? 'Fechar ajuda' : 'Mostrar ajuda'}
              aria-expanded={helpOpen}
            >
              <InfoIcon />
            </button>
          )}
        </label>
      )}

      {/* Bloco expansível com o helpText */}
      {q.helpText && helpOpen && (
        <div className={styles.helpBlock}>
          {q.helpText}
        </div>
      )}

      {q.type === 'text'     && <InputText     q={q} value={value} onChange={onChange} recentlyFilled={recentlyFilled} />}
      {q.type === 'textarea' && <InputTextarea q={q} value={value} onChange={onChange} recentlyFilled={recentlyFilled} />}
      {q.type === 'select'   && <InputSelect   q={q} value={value} onChange={onChange} />}
      {q.type === 'number'   && <InputNumber   q={q} value={value} onChange={onChange} />}
      {q.type === 'slider'   && <InputSlider   q={q} value={value} onChange={onChange} />}
      {q.type === 'radio'    && <RadioGroup    q={q} value={value} values={values} onChange={onChange} />}
      {q.type === 'checkbox' && <CheckboxGroup q={q} value={value} values={values} onChange={onChange} />}
      {q.type === 'composite'&& <CompositeField q={q} values={values} onChange={onChange} recentlyFilled={recentlyFilled} helpText={q.helpText} helpOpen={helpOpen} setHelpOpen={setHelpOpen} />}

      {q.hint && <p className={styles.fieldHint}>{q.hint}</p>}

      {hasError && (
        <p className={styles.fieldErrorMsg}>! Campo obrigatório</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTES DE CADA TIPO
═══════════════════════════════════════════════════════════ */

function useFlash(id, recentlyFilled) {
  // Aplica o highlight "justFilled" por 1.2s quando o ID aparece em recentlyFilled
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (recentlyFilled && recentlyFilled.has(id)) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 1200);
      return () => clearTimeout(t);
    }
  }, [recentlyFilled, id]);
  return flashing;
}

function InputText({ q, value, onChange, recentlyFilled }) {
  const flash = useFlash(q.id, recentlyFilled);
  return (
    <input
      type="text"
      className={`${styles.input} ${flash ? styles.justFilled : ''}`}
      value={value || ''}
      onChange={e => onChange(q.id, e.target.value)}
      placeholder={q.placeholder || ''}
      autoComplete="off"
    />
  );
}

function InputTextarea({ q, value, onChange, recentlyFilled }) {
  const flash = useFlash(q.id, recentlyFilled);
  return (
    <textarea
      className={`${styles.textarea} ${flash ? styles.justFilled : ''}`}
      value={value || ''}
      onChange={e => onChange(q.id, e.target.value)}
      placeholder={q.placeholder || ''}
      rows={4}
    />
  );
}

function InputSelect({ q, value, onChange }) {
  return (
    <select
      className={styles.select}
      value={value || ''}
      onChange={e => onChange(q.id, e.target.value)}
    >
      <option value="">Selecione...</option>
      {(q.options || []).map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function InputNumber({ q, value, onChange }) {
  return (
    <input
      type="number"
      className={styles.input}
      value={value || ''}
      onChange={e => onChange(q.id, e.target.value)}
      placeholder={q.placeholder || ''}
      autoComplete="off"
    />
  );
}

function InputSlider({ q, value, onChange }) {
  const v = value === '' || value === null || value === undefined ? 5 : Number(value);
  return (
    <div className={styles.sliderWrapper}>
      <input
        type="range"
        min={0}
        max={10}
        value={v}
        onChange={e => onChange(q.id, e.target.value)}
        className={styles.sliderInput}
      />
      <span className={styles.sliderValue}>{v}</span>
    </div>
  );
}

function RadioGroup({ q, value, values, onChange }) {
  const selected = value || '';

  return (
    <div className={styles.optionGroup}>
      {(q.options || []).map(opt => (
        <div key={opt}>
          <div
            className={`${styles.optionItem} ${selected === opt ? styles.selected : ''}`}
            onClick={() => onChange(q.id, opt)}
            role="radio"
            aria-checked={selected === opt}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange(q.id, opt);
              }
            }}
          >
            <div className={styles.optionRadio} />
            <span className={styles.optionLabel}>{opt}</span>
          </div>

          {/* Campos condicionais por OPÇÃO específica */}
          {q.conditionalFields && selected === opt && q.conditionalFields
            .filter(cf => {
              if (cf.trigger.value)  return cf.trigger.value === opt;
              if (cf.trigger.values) return cf.trigger.values.includes(opt);
              return false;
            })
            .map(cf => (
              <div key={cf.field.id} className={styles.conditionalField}>
                <label className={styles.fieldLabel}>{cf.field.label}</label>
                <input
                  type="text"
                  className={styles.input}
                  value={values[cf.field.id] || ''}
                  onChange={e => onChange(cf.field.id, e.target.value)}
                  placeholder={cf.field.placeholder || ''}
                  autoComplete="off"
                />
              </div>
            ))
          }
        </div>
      ))}

      {q.hasOther && (
        <div>
          <div
            className={`${styles.optionItem} ${selected === '__other__' ? styles.selected : ''}`}
            onClick={() => onChange(q.id, '__other__')}
          >
            <div className={styles.optionRadio} />
            <span className={styles.optionLabel}>Outro</span>
          </div>
          {selected === '__other__' && (
            <div className={styles.conditionalField}>
              <input
                type="text"
                className={styles.input}
                value={values[`${q.id}_other`] || ''}
                onChange={e => onChange(`${q.id}_other`, e.target.value)}
                placeholder="Especifique..."
                autoFocus
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckboxGroup({ q, value, values, onChange }) {
  const selected = Array.isArray(value) ? value : [];

  function toggle(opt) {
    const next = selected.includes(opt)
      ? selected.filter(v => v !== opt)
      : [...selected, opt];
    onChange(q.id, next);
  }

  return (
    <div className={styles.optionGroup}>
      {(q.options || []).map(opt => (
        <div key={opt}>
          <div
            className={`${styles.optionItem} ${selected.includes(opt) ? styles.selected : ''}`}
            onClick={() => toggle(opt)}
            role="checkbox"
            aria-checked={selected.includes(opt)}
            tabIndex={0}
          >
            <div className={styles.optionCheckbox}>
              {selected.includes(opt) && <CheckIcon />}
            </div>
            <span className={styles.optionLabel}>{opt}</span>
          </div>

          {/* Conditional vinculado à opção do checkbox */}
          {q.conditionalFields && selected.includes(opt) && q.conditionalFields
            .filter(cf => cf.trigger.option === opt)
            .map(cf => (
              <div key={cf.field.id} className={styles.conditionalField}>
                <label className={styles.fieldLabel}>{cf.field.label}</label>
                <input
                  type="text"
                  className={styles.input}
                  value={values[cf.field.id] || ''}
                  onChange={e => onChange(cf.field.id, e.target.value)}
                  placeholder={cf.field.placeholder || ''}
                />
              </div>
            ))
          }
        </div>
      ))}

      {q.hasOther && (
        <div>
          <div
            className={`${styles.optionItem} ${selected.includes('__other__') ? styles.selected : ''}`}
            onClick={() => toggle('__other__')}
          >
            <div className={styles.optionCheckbox}>
              {selected.includes('__other__') && <CheckIcon />}
            </div>
            <span className={styles.optionLabel}>Outro</span>
          </div>
          {selected.includes('__other__') && (
            <div className={styles.conditionalField}>
              <input
                type="text"
                className={styles.input}
                value={values[`${q.id}_other`] || ''}
                onChange={e => onChange(`${q.id}_other`, e.target.value)}
                placeholder="Especifique..."
                autoFocus
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompositeField({ q, values, onChange, recentlyFilled, helpText, helpOpen, setHelpOpen }) {
  return (
    <>
      <label className={styles.fieldLabel}>
        <span className={styles.questionNumber}>{q.id}</span>
        {q.label}
        {q.required && <span className={styles.fieldRequired}>*</span>}
        {helpText && (
          <button
            type="button"
            className={styles.helpButton}
            onClick={() => setHelpOpen(o => !o)}
            aria-label={helpOpen ? 'Fechar ajuda' : 'Mostrar ajuda'}
            aria-expanded={helpOpen}
          >
            <InfoIcon />
          </button>
        )}
      </label>

      {helpText && helpOpen && (
        <div className={styles.helpBlock}>{helpText}</div>
      )}

      <div className={styles.compositeWrap}>
        {(q.fields || []).map(field => {
          const flash = recentlyFilled && recentlyFilled.has(field.id);
          return (
            <div key={field.id}>
              <label className={styles.fieldLabel} style={{ fontSize: '0.75rem' }}>
                <span className={styles.questionNumber} style={{ fontSize: '0.55rem' }}>{field.id}</span>
                {field.label}
              </label>
              <input
                type="text"
                className={`${styles.input} ${flash ? styles.justFilled : ''}`}
                value={values[field.id] || ''}
                onChange={e => onChange(field.id, e.target.value)}
                placeholder={field.placeholder || ''}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
