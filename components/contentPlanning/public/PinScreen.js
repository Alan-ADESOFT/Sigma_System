/**
 * components/contentPlanning/public/PinScreen.js
 * 4 inputs de 1 digito com auto-focus, backspace inteligente, paste e
 * auto-submit ao preencher os 4. Apos 3 erros o backend retorna
 * reason='rate_limited' (HTTP 429) e exibimos a mensagem de bloqueio.
 *
 * Props:
 *   onSubmit(pin, cb)  cb(reason | null)
 *     reason ∈ 'password_incorrect' | 'rate_limited' | 'network' | outros
 */

import { useState, useRef, useEffect } from 'react';
import styles from '../../../assets/style/publicApproval.module.css';

export default function PinScreen({ onSubmit }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const refs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  useEffect(() => {
    const t = setTimeout(() => refs[0].current?.focus(), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDigitAt(idx, value) {
    const v = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
    if (error) setError(null);
    if (v && idx < 3) refs[idx + 1].current?.focus();
    if (v && idx === 3) {
      // submit no proximo tick para que o estado esteja consistente
      setTimeout(() => trySubmit([...digits.slice(0, idx), v]), 0);
    }
  }

  function handleKeyDown(idx, e) {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        setDigitAt(idx, '');
      } else if (idx > 0) {
        e.preventDefault();
        refs[idx - 1].current?.focus();
        setDigitAt(idx - 1, '');
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      refs[idx - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && idx < 3) {
      e.preventDefault();
      refs[idx + 1].current?.focus();
    } else if (e.key === 'Enter') {
      const filled = digits.filter(Boolean).length;
      if (filled === 4) trySubmit(digits);
    }
  }

  function handlePaste(e) {
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4);
    if (!text) return;
    e.preventDefault();
    const next = ['', '', '', ''];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    setError(null);
    const lastIdx = Math.min(text.length, 4) - 1;
    refs[lastIdx]?.current?.focus();
    if (text.length === 4) setTimeout(() => trySubmit(next), 0);
  }

  function trySubmit(arr) {
    if (submitting || locked) return;
    const pin = arr.join('');
    if (pin.length !== 4) return;
    setSubmitting(true);
    onSubmit(pin, (reason) => {
      setSubmitting(false);
      if (!reason) return; // sucesso — pai vai trocar de tela
      if (reason === 'rate_limited') {
        setLocked(true);
        setError('Muitas tentativas. Aguarde 15 minutos e tente novamente.');
        return;
      }
      if (reason === 'password_incorrect') {
        setError('PIN incorreto. Tente novamente.');
      } else if (reason === 'network') {
        setError('Falha de rede. Tente novamente.');
      } else {
        setError('Erro ao validar o PIN.');
      }
      setDigits(['', '', '', '']);
      setTimeout(() => refs[0].current?.focus(), 50);
    });
  }

  const showError = !!error;

  return (
    <div className={`${styles.card} ${styles.pinCard}`}>
      <div className={`${styles.statusIcon} ${styles.statusIconNeutral}`} aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h1 className={styles.statusTitle}>Acesso protegido</h1>
      <p className={styles.pinHint}>
        Digite o PIN de 4 dígitos enviado pela Sigma.
      </p>

      <div className={styles.pinInputs} onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={d}
            disabled={submitting || locked}
            onChange={(e) => setDigitAt(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`${styles.pinInput} ${showError ? styles.pinInputError : ''}`}
            aria-label={`PIN dígito ${i + 1}`}
          />
        ))}
      </div>

      <div className={styles.pinError} role="alert" aria-live="polite">
        {locked ? error : (showError ? error : '')}
      </div>

      {submitting && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 4 }}>
          // verificando...
        </div>
      )}
    </div>
  );
}
