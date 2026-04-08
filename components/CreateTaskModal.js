/**
 * components/CreateTaskModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de CRIAÇÃO de tarefa — separado do TaskDetailModal.
 *
 * Diferenças principais:
 *   • Formulário limpo (sem comentários, log, dependências, etc.)
 *   • Seletor de dia da semana inline (SEG-DOM) com navegação semanal
 *   • Bloqueia datas anteriores a hoje (opacity 0.3 + pointer-events none)
 *   • Subtasks editáveis (lista de checkboxes + adicionar)
 *   • Cliente pré-selecionado e desabilitado quando vem da ficha do cliente
 *
 * Props:
 *   • onClose()           — fecha o modal
 *   • onCreated(task)     — callback após sucesso
 *   • clients[]           — lista de clientes para o select
 *   • categories[]        — lista de categorias para o select
 *   • users[]             — lista de usuários para o select
 *   • currentUserId       — id do usuário logado (default do responsável)
 *   • prefilledClientId   — quando vem da ficha do cliente (campo lock)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useMemo, useEffect } from 'react';
import styles from '../assets/style/createTaskModal.module.css';
import { useNotification } from '../context/NotificationContext';

/* ── Constantes ─────────────────────────────────────────────────────────── */

const PRIORITY_OPTIONS = [
  { value: 'baixa',   label: 'Baixa'   },
  { value: 'normal',  label: 'Normal'  },
  { value: 'alta',    label: 'Alta'    },
  { value: 'urgente', label: 'Urgente' },
];

const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function startOfWeek(d) {
  // Semana SEG-DOM (Brasil): segunda = 1
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // ajusta para segunda
  date.setDate(date.getDate() + diff);
  return date;
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function isoDate(d) {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayIso() {
  return isoDate(new Date());
}

function uid() {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Icons ───────────────────────────────────────────────────────────────── */

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconChevronL = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconChevronR = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* ════════════════════════════════════════════════════════════════════════ */

export default function CreateTaskModal({
  onClose,
  onCreated,
  clients = [],
  categories = [],
  users = [],
  currentUserId = null,
  prefilledClientId = null,
}) {
  const { notify } = useNotification();

  /* ── Form state ─────────────────────────────────────────────────────── */
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [categoryId, setCategoryId] = useState('');
  const [assignedTo, setAssignedTo] = useState(currentUserId || '');
  const [clientId, setClientId] = useState(prefilledClientId || '');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [subtasks, setSubtasks] = useState([]);
  const [subtasksRequired, setSubtasksRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  // Semana mostrada no seletor — começa na semana do hoje
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  /* ── ESC fecha o modal ──────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* ── Dias da semana exibida ─────────────────────────────────────────── */
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  /* ── Handlers ───────────────────────────────────────────────────────── */

  function handlePrevWeek() {
    setWeekStart((prev) => addDays(prev, -7));
  }

  function handleNextWeek() {
    setWeekStart((prev) => addDays(prev, 7));
  }

  function handleSelectDay(d) {
    setSelectedDate(isoDate(d));
  }

  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: uid(), title: '', done: false }]);
  }

  function updateSubtask(id, key, value) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
  }

  function removeSubtask(id) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSubmit() {
    if (!title.trim()) {
      notify('Informe o título da tarefa', 'warning');
      return;
    }
    if (!selectedDate) {
      notify('Selecione um dia', 'warning');
      return;
    }
    if (selectedDate < todayIso()) {
      notify('A data não pode ser anterior a hoje', 'error');
      return;
    }

    setSaving(true);
    try {
      const cleanSubs = subtasks
        .filter((s) => s.title.trim())
        .map((s) => ({ id: s.id, title: s.title.trim(), done: !!s.done }));

      const body = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        category_id: categoryId || null,
        assigned_to: assignedTo || null,
        client_id: clientId || null,
        due_date: selectedDate,
        status: 'pending',
        subtasks: cleanSubs,
        subtasks_required: subtasksRequired,
      };

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao criar tarefa');

      notify('Tarefa criada', 'success');
      if (onCreated) onCreated(json.task);
      onClose();
    } catch (err) {
      notify('Erro ao criar tarefa: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  const weekLabel = useMemo(() => {
    const a = weekDays[0];
    const b = weekDays[6];
    const sameMonth = a.getMonth() === b.getMonth();
    const yearStr = a.getFullYear() === new Date().getFullYear() ? '' : ` ${a.getFullYear()}`;
    if (sameMonth) {
      return `${MONTH_SHORT[a.getMonth()]} ${a.getDate()} — ${b.getDate()}${yearStr}`;
    }
    return `${MONTH_SHORT[a.getMonth()]} ${a.getDate()} — ${MONTH_SHORT[b.getMonth()]} ${b.getDate()}${yearStr}`;
  }, [weekDays]);

  const todayMs = today.getTime();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* ─── Header ─── */}
        <div className={styles.header}>
          <div className={styles.headerTitleBox}>
            <div className={styles.headerBadge}>
              <IconPlus />
            </div>
            <div>
              <h2 className={styles.headerTitle}>Criar Tarefa</h2>
              <div className={styles.headerSubtitle}>
                Preencha as informações para agendar uma tarefa.
              </div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Fechar">
            <IconClose />
          </button>
        </div>

        {/* ─── Body ─── */}
        <div className={styles.body}>

          {/* Título */}
          <div className={styles.field}>
            <label className={`${styles.label} ${styles.required}`}>Título</label>
            <input
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
              autoFocus
            />
          </div>

          {/* Descrição */}
          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Adicione detalhes ou observações..."
              rows={2}
            />
          </div>

          {/* Prioridade + Categoria */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={`${styles.label} ${styles.required}`}>Prioridade</label>
              <select
                className={styles.select}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Categoria</label>
              <select
                className={styles.select}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Responsável + Cliente */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Responsável</label>
              <select
                className={styles.select}
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">Sem responsável</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.id === currentUserId ? ' (eu)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${styles.field} ${prefilledClientId ? styles.disabled : ''}`}>
              <label className={styles.label}>Cliente {prefilledClientId ? '(fixo)' : '(opcional)'}</label>
              <select
                className={styles.select}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={!!prefilledClientId}
              >
                <option value="">Selecione um cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name || c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Seletor de dia */}
          <div className={styles.daySection}>
            <label className={`${styles.label} ${styles.required}`}>Dia</label>

            <div className={styles.dayNav}>
              <button
                className={styles.dayNavBtn}
                onClick={handlePrevWeek}
                title="Semana anterior"
                type="button"
              >
                <IconChevronL />
              </button>
              <span className={styles.dayNavLabel}>{weekLabel}</span>
              <button
                className={styles.dayNavBtn}
                onClick={handleNextWeek}
                title="Próxima semana"
                type="button"
              >
                <IconChevronR />
              </button>
            </div>

            <div className={styles.dayGrid}>
              {weekDays.map((d) => {
                const iso = isoDate(d);
                const isPast = d.getTime() < todayMs;
                const isToday = d.getTime() === todayMs;
                const isSelected = iso === selectedDate;
                const wd = WEEKDAY_LABELS[d.getDay()];
                const cls = [
                  styles.dayCell,
                  isToday && styles.dayCellToday,
                  isSelected && styles.dayCellSelected,
                  isPast && styles.dayCellPast,
                ].filter(Boolean).join(' ');

                return (
                  <button
                    key={iso}
                    type="button"
                    className={cls}
                    onClick={() => !isPast && handleSelectDay(d)}
                    disabled={isPast}
                  >
                    {isToday && <span className={styles.todayBadge}>HOJE</span>}
                    <span className={styles.dayCellLabel}>{wd}</span>
                    <span className={styles.dayCellNumber}>{d.getDate()}</span>
                    <span className={styles.dayCellMonth}>{MONTH_SHORT[d.getMonth()]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subtasks */}
          <div className={styles.subSection}>
            <div className={styles.subHeader}>
              <label className={styles.label}>Subtarefas</label>
              <div className={styles.subRequiredRow}>
                <span className={styles.subRequiredLabel}>Obrigatórias</span>
                <button
                  type="button"
                  className={`${styles.toggle} ${subtasksRequired ? styles.toggleOn : ''}`}
                  onClick={() => setSubtasksRequired((v) => !v)}
                  title="Se ativo, todas as subtarefas precisam estar concluídas para finalizar a tarefa"
                >
                  <span className={`${styles.toggleKnob} ${subtasksRequired ? styles.toggleKnobOn : ''}`} />
                </button>
              </div>
            </div>
            <div className={styles.subHint}>
              {subtasksRequired
                ? 'Todas precisam estar concluídas para finalizar a tarefa'
                : 'Divida a tarefa em etapas menores'}
            </div>

            {subtasks.length > 0 && (
              <div className={styles.subList}>
                {subtasks.map((s) => (
                  <div key={s.id} className={styles.subItem}>
                    <input
                      type="checkbox"
                      className={styles.subCheckbox}
                      checked={s.done}
                      onChange={(e) => updateSubtask(s.id, 'done', e.target.checked)}
                    />
                    <input
                      className={styles.subInput}
                      value={s.title}
                      onChange={(e) => updateSubtask(s.id, 'title', e.target.value)}
                      placeholder="Descreva a subtarefa..."
                    />
                    <button
                      type="button"
                      className={styles.subRemove}
                      onClick={() => removeSubtask(s.id)}
                      title="Remover"
                    >
                      <IconClose />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" className={styles.subAddBtn} onClick={addSubtask}>
              <IconPlus /> Adicionar Subtarefa
            </button>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className={styles.btnPrimary} onClick={handleSubmit} disabled={saving || !title.trim()}>
            {saving ? 'Criando...' : 'Criar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  );
}
