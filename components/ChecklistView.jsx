/**
 * components/ChecklistView.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * View Checklist do módulo Tasks (default a partir do sprint v2).
 *
 * Layout doc-style: tabs de dia no topo, seção de atrasadas, seções
 * "Recorrentes / Não-recorrentes" no modo Eu, agrupamento por cliente no
 * modo Time.
 *
 * Decisões de design:
 *   • Reaproveita helpers de data passados via props (vindos do pai) ao
 *     invés de re-implementar — evita drift de fuso horário entre views.
 *   • <ChecklistRow /> é o único renderer de linha. Toda variação (modo Time
 *     com avatar vs Eu sem avatar, recorrente vs avulsa) entra via props.
 *   • Filtros são exclusivos (radio-style) — UI mais clara que combiná-los.
 *   • Em modo Time, as seções Recorrente/Não-recorrente somem (fica plano por
 *     cliente, com badge "↻" nas recorrentes). Decisão no spec da sprint.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState, useEffect } from 'react';
import styles from '../assets/style/checklist.module.css';

/* ── Constantes ─────────────────────────────────────────────────────────── */

const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

const PRIORITY_BADGE = {
  urgente: { label: 'URG',    cls: 'badgeUrgente' },
  alta:    { label: 'ALTA',   cls: 'badgeAlta' },
  normal:  { label: '',       cls: 'badgeNormal' },
  baixa:   { label: 'BAIXA',  cls: 'badgeBaixa' },
};

const FILTERS = [
  { key: 'none',     label: 'Sem filtro' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'time',     label: 'Hora' },
];

const PRIORITY_RANK = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

/* ── Helpers locais ─────────────────────────────────────────────────────── */

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function fmtTime(t) {
  if (!t) return null;
  // Postgres TIME costuma vir como "HH:MM:SS"
  return String(t).slice(0, 5);
}

/* ── Icons ─────────────────────────────────────────────────────────────── */

const IconCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconLock = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="8" height="6" rx="1" />
    <path d="M6 8V5a2 2 0 0 1 4 0v3" />
  </svg>
);

const IconRecurring = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <polyline points="21 3 21 8 16 8" />
    <polyline points="3 21 3 16 8 16" />
  </svg>
);

const IconEmpty = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3 8-8" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

/* ── ChecklistRow — única renderização de linha ─────────────────────────── */

/* Subtasks: JSONB pode vir como array ou string JSON. */
function parseSubtasks(raw) {
  let arr = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr || '[]'); } catch { arr = []; } }
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}

function ChecklistRow({
  task,
  showClient,
  showAvatar,
  showRecurringBadge,
  onToggle,
  onOpen,
  notify,
}) {
  const blocked = task.has_pending_deps;
  const done = task.status === 'done';
  const pri = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.normal;
  const time = fmtTime(task.due_time);
  const subs = parseSubtasks(task.subtasks);
  const subDone = subs.filter((s) => s.done).length;
  const subAllDone = subs.length === 0 || subDone === subs.length;
  const subBlocked = task.subtasks_required && !subAllDone;
  const depCount = task.dep_count || 0;

  function handleCheckbox(e) {
    e.stopPropagation();
    if (blocked) {
      notify && notify('Tarefa bloqueada por dependências pendentes', 'warning');
      return;
    }
    if (!done && subBlocked) {
      notify && notify(`Conclua as ${subs.length - subDone} subtarefa(s) obrigatória(s) antes de finalizar`, 'warning');
      return;
    }
    onToggle(task);
  }

  function handleOpen() {
    onOpen(task.id);
  }

  return (
    <div>
      <div className={styles.row} onClick={handleOpen}>
        <button
          type="button"
          className={`${styles.checkbox} ${done ? styles.checkboxDone : ''} ${(blocked || subBlocked) ? styles.checkboxBlocked : ''}`}
          onClick={handleCheckbox}
          disabled={blocked}
          title={blocked ? 'Aguardando dependências' : (subBlocked ? 'Conclua as subtarefas obrigatórias' : (done ? 'Reabrir tarefa' : 'Concluir tarefa'))}
        >
          {done && <IconCheck />}
        </button>

        <span className={`${styles.rowTime} ${!time ? styles.rowTimeEmpty : ''}`}>
          {blocked ? <span className={styles.badgeLocked}><IconLock /></span> : (time || '—')}
        </span>

        <span className={styles.rowText}>
          <span className={`${styles.rowTitle} ${done ? styles.rowTitleDone : ''}`}>
            {task.title}
          </span>
          {(showClient && task.client_name) && (
            <span className={styles.rowMeta}>
              <span className={styles.rowMetaClient}>{task.client_name}</span>
            </span>
          )}
        </span>

        <span className={styles.rowBadges}>
          {subs.length > 0 && (
            <span className={styles.badge} style={{
              background: subAllDone ? 'rgba(34,197,94,0.1)' : (subBlocked ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.05)'),
              border: `1px solid ${subAllDone ? 'rgba(34,197,94,0.3)' : (subBlocked ? 'rgba(249,115,22,0.35)' : 'rgba(255,255,255,0.12)')}`,
              color: subAllDone ? '#22c55e' : (subBlocked ? '#f97316' : 'var(--text-muted)'),
            }} title={task.subtasks_required ? 'Subtarefas obrigatórias' : 'Subtarefas'}>
              ☑ {subDone}/{subs.length}{task.subtasks_required ? '*' : ''}
            </span>
          )}
          {depCount > 0 && (
            <span className={styles.badge} style={{
              background: blocked ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${blocked ? 'rgba(249,115,22,0.35)' : 'rgba(255,255,255,0.12)'}`,
              color: blocked ? '#f97316' : 'var(--text-muted)',
            }} title={blocked ? 'Bloqueada por dependências pendentes' : 'Depende de outras tarefas'}>
              <IconLock /> {depCount}
            </span>
          )}
          {showRecurringBadge && task.recurrence_id && (
            <span className={`${styles.badge} ${styles.badgeRecurring}`} title="Tarefa recorrente">
              <IconRecurring />
            </span>
          )}
          {pri.label && (
            <span className={`${styles.badge} ${styles[pri.cls]}`}>{pri.label}</span>
          )}
          {showAvatar && task.assigned_to_name && (
            <span className={styles.avatar} title={task.assigned_to_name}>
              {getInitials(task.assigned_to_name)}
            </span>
          )}
        </span>
      </div>

      {/* Subtarefas encaixadas sob a task raiz */}
      {subs.length > 0 && (
        <div style={{ paddingLeft: 62, paddingBottom: 7, marginTop: -2, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {subs.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: '0.66rem', lineHeight: 1.3 }}>
              <span style={{
                width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                border: `1px solid ${s.done ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.18)'}`,
                background: s.done ? 'rgba(34,197,94,0.18)' : 'transparent',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#22c55e', fontSize: '0.55rem', fontWeight: 700,
              }}>{s.done ? '✓' : ''}</span>
              <span style={{ color: s.done ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: s.done ? 'line-through' : 'none' }}>
                {s.title}
              </span>
            </div>
          ))}
          {subBlocked && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: '#f97316', paddingLeft: 21 }}>
              * todas obrigatórias para concluir a tarefa
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Day tabs ──────────────────────────────────────────────────────────── */

function DayTabs({ days, todayMillis, activeIso, dayCounts, onSelect, isoDate }) {
  return (
    <div className={styles.dayTabs}>
      {days.map((d) => {
        const iso = isoDate(d);
        const isToday = d.getTime() === todayMillis;
        const isActive = iso === activeIso;
        const cnt = dayCounts[iso] || 0;
        const wd = WEEKDAY_LABELS[d.getDay()];
        const cls = [
          styles.dayTab,
          isActive && styles.dayTabActive,
          isToday && styles.dayTabToday,
        ].filter(Boolean).join(' ');
        return (
          <button key={iso} type="button" className={cls} onClick={() => onSelect(iso)}>
            <span>{wd}</span>
            <span className={styles.dayTabNumber}>{d.getDate()}</span>
            {cnt > 0 && (
              <span className={`${styles.dayTabCount} ${isActive ? styles.dayTabCountActive : ''}`}>
                {cnt}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Ordenação por filtro ───────────────────────────────────────────────── */

function sortTasks(tasks, filterKey) {
  const arr = [...tasks];
  if (filterKey === 'priority') {
    arr.sort((a, b) => {
      const ra = PRIORITY_RANK[a.priority] ?? 99;
      const rb = PRIORITY_RANK[b.priority] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.due_time || 'zz').localeCompare(b.due_time || 'zz');
    });
    return arr;
  }
  if (filterKey === 'time') {
    // Apenas com horário; sem-horário vai pro final
    arr.sort((a, b) => {
      const ta = a.due_time || null;
      const tb = b.due_time || null;
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      if (!ta && !tb) return 0;
      return ta.localeCompare(tb);
    });
    return arr;
  }
  // none — ordem natural: hora crescente → prioridade descendente → criação
  arr.sort((a, b) => {
    const ta = a.due_time || 'zz';
    const tb = b.due_time || 'zz';
    if (ta !== tb) return ta.localeCompare(tb);
    const ra = PRIORITY_RANK[a.priority] ?? 99;
    const rb = PRIORITY_RANK[b.priority] ?? 99;
    if (ra !== rb) return ra - rb;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
  return arr;
}

/* ── ChecklistView principal ────────────────────────────────────────────── */

export default function ChecklistView({
  tasks,
  weekStart,
  scope,
  isoDate,
  addDays,
  isOverdue,
  taskDueIso,
  onTaskClick,
  onToggleDone,
  onNewTask,
  notify,
}) {
  const [activeIso, setActiveIso] = useState(() => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    return isoDate(todayDate);
  });
  const [filter, setFilter] = useState('none');

  const todayMillis = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime();
  }, []);

  // Sempre exibe SEG-SEX. SAB/DOM aparecem só se tiver task neles.
  const days = useMemo(() => {
    const base = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const has = { 5: false, 6: false }; // sáb=índice 5 da semana SEG..., dom=6
    for (const t of tasks) {
      const iso = taskDueIso(t);
      if (iso === isoDate(base[5])) has[5] = true;
      if (iso === isoDate(base[6])) has[6] = true;
    }
    return base.filter((_, idx) => idx < 5 || has[idx]);
  }, [weekStart, tasks, isoDate, taskDueIso, addDays]);

  // Se o dia ativo saiu da janela (mudou de semana), reseta pra hoje ou seg.
  useEffect(() => {
    const dayIsos = days.map(isoDate);
    if (!dayIsos.includes(activeIso)) {
      const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
      const todayIso = isoDate(todayD);
      setActiveIso(dayIsos.includes(todayIso) ? todayIso : dayIsos[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // Atrasadas (sempre no topo, ignora dia selecionado)
  const overdueTasks = useMemo(
    () => sortTasks(tasks.filter(isOverdue), filter),
    [tasks, filter, isOverdue]
  );

  // Tasks do dia ativo (excluindo atrasadas pra não duplicar)
  const dayTasks = useMemo(() => {
    const out = tasks.filter((t) => !isOverdue(t) && taskDueIso(t) === activeIso);
    if (filter === 'time') {
      return sortTasks(out.filter((t) => !!t.due_time), filter);
    }
    return sortTasks(out, filter);
  }, [tasks, activeIso, filter, isOverdue, taskDueIso]);

  // Contagem por dia (badge nas tabs) — usa pending, não inclui done
  const dayCounts = useMemo(() => {
    const map = {};
    for (const d of days) map[isoDate(d)] = 0;
    for (const t of tasks) {
      if (t.status === 'done') continue;
      const iso = taskDueIso(t);
      if (map[iso] !== undefined) map[iso]++;
    }
    return map;
  }, [tasks, days, isoDate, taskDueIso]);

  // Split Recorrente / Não-recorrente (modo Eu) ou Por cliente (modo Time)
  const isTeam = scope === 'team';

  const groupedByClient = useMemo(() => {
    if (!isTeam) return null;
    const groups = new Map();
    const internal = [];
    for (const t of dayTasks) {
      if (t.client_id && t.client_name) {
        if (!groups.has(t.client_id)) groups.set(t.client_id, { name: t.client_name, tasks: [] });
        groups.get(t.client_id).tasks.push(t);
      } else {
        internal.push(t);
      }
    }
    const arr = Array.from(groups.entries())
      .map(([id, g]) => ({ id, name: g.name, tasks: g.tasks }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (internal.length > 0) {
      arr.push({ id: '__internal', name: 'Internas / Sem cliente', tasks: internal });
    }
    return arr;
  }, [isTeam, dayTasks]);

  const splitRecurring = useMemo(() => {
    if (isTeam) return null;
    const rec = [];
    const non = [];
    for (const t of dayTasks) {
      if (t.recurrence_id) rec.push(t); else non.push(t);
    }
    return { rec, non };
  }, [isTeam, dayTasks]);

  /* ── Sub-renders ──────────────────────────────────────────────────────── */

  function renderRow(t) {
    return (
      <ChecklistRow
        key={t.id}
        task={t}
        showClient={!isTeam}
        showAvatar={isTeam}
        showRecurringBadge={isTeam}
        onToggle={onToggleDone}
        onOpen={onTaskClick}
        notify={notify}
      />
    );
  }

  function renderSection({ label, count, rows, addBtnHint, emptyMsg, overdue, client }) {
    const labelCls = [
      styles.sectionLabel,
      overdue && styles.sectionLabelOverdue,
      client && styles.sectionLabelClient,
    ].filter(Boolean).join(' ');
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={labelCls}>{label}</span>
          <span className={styles.sectionCount}>
            {count} {count === 1 ? 'tarefa' : 'tarefas'}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className={styles.sectionEmpty}>{emptyMsg}</div>
        ) : rows.map(renderRow)}
        {addBtnHint && (
          <button className={styles.addBtn} type="button" onClick={addBtnHint.onClick}>
            + Nova tarefa
          </button>
        )}
      </div>
    );
  }

  /* ── Render principal ─────────────────────────────────────────────────── */

  return (
    <div className={styles.container}>
      {/* Tabs de dia */}
      <DayTabs
        days={days}
        todayMillis={todayMillis}
        activeIso={activeIso}
        dayCounts={dayCounts}
        onSelect={setActiveIso}
        isoDate={isoDate}
      />

      {/* Barra de progresso do dia selecionado */}
      {dayTasks.length > 0 && (() => {
        const dayDone = dayTasks.filter((t) => t.status === 'done').length;
        const dayPct = Math.round((dayDone / dayTasks.length) * 100);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px 2px' }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${dayPct}%`, height: '100%', background: '#22c55e', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {dayDone}/{dayTasks.length} concluídas{dayPct === 100 ? ' ✓' : ''}
            </span>
          </div>
        );
      })()}

      {/* Filtros */}
      <div className={styles.filterBar}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`${styles.filterPill} ${filter === f.key ? styles.filterPillActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Atrasadas — fixa no topo */}
      {overdueTasks.length > 0 && renderSection({
        label: '// ATRASADAS',
        count: overdueTasks.length,
        rows: overdueTasks,
        emptyMsg: '',
        overdue: true,
      })}

      {/* Dia vazio total */}
      {dayTasks.length === 0 ? (
        <div className={styles.dayEmpty}>
          <span className={styles.dayEmptyIcon}><IconEmpty /></span>
          <span className={styles.dayEmptyText}>nenhuma tarefa neste dia</span>
          <button className={styles.addBtn} type="button" onClick={() => onNewTask({ dueDate: activeIso })}>
            + Criar tarefa
          </button>
        </div>
      ) : isTeam ? (
        // Modo Time — agrupado por cliente
        groupedByClient.map((g) => renderSection({
          label: g.name,
          count: g.tasks.length,
          rows: g.tasks,
          emptyMsg: 'nenhuma tarefa',
          client: true,
        }))
      ) : (
        // Modo Eu — Recorrentes em cima, Não-recorrentes embaixo
        <>
          {renderSection({
            label: '// RECORRENTES',
            count: splitRecurring.rec.length,
            rows: splitRecurring.rec,
            emptyMsg: 'nenhuma tarefa recorrente para este dia',
            addBtnHint: { onClick: () => onNewTask({ dueDate: activeIso, isRecurring: true }) },
          })}
          {renderSection({
            label: '// NÃO-RECORRENTES',
            count: splitRecurring.non.length,
            rows: splitRecurring.non,
            emptyMsg: 'nenhuma tarefa para este dia',
            addBtnHint: { onClick: () => onNewTask({ dueDate: activeIso, isRecurring: false }) },
          })}
        </>
      )}
    </div>
  );
}
