/**
 * pages/dashboard/meetings/index.js
 * ---------------------------------------------------------------------------
 * Calendario / Reunioes — vista mensal (30 dias) e semanal (7 dias).
 * CRUD via /api/meetings, selecao de clientes e participantes.
 * SIGMA dark terminal HUD aesthetic.
 * ---------------------------------------------------------------------------
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import DashboardLayout from '../../../components/DashboardLayout';
import styles from '../../../assets/style/meetings.module.css';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';

// react-datepicker (carregado client-side)
const DatePicker = dynamic(() => import('react-datepicker'), { ssr: false });

/* ── Helpers de data ── */

const WEEKDAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDateBR(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function fmtTime(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function toYMD(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Retorna segunda-feira da semana contendo `date` */
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Constroi array de dias para a grade mensal (seg-dom) */
function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const start = getMonday(firstOfMonth);
  const endDate = new Date(lastOfMonth);
  // Avanca ate domingo
  const endDay = endDate.getDay();
  if (endDay !== 0) {
    endDate.setDate(endDate.getDate() + (7 - endDay));
  }
  endDate.setHours(23, 59, 59, 999);

  const days = [];
  const cursor = new Date(start);
  while (cursor <= endDate) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Constroi array de 7 dias da semana contendo refDate (seg-dom) */
function buildWeekDays(refDate) {
  const monday = getMonday(refDate);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

/* ── SVG icons inline ── */

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/* ============================================================
   Componente principal
   ============================================================ */

export default function MeetingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  /* ── State ── */
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [weekRef, setWeekRef] = useState(new Date(today));
  const [meetings, setMeetings] = useState([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form fields — datetime e um Date object combinando data + horario
  const [form, setForm] = useState({
    title: '',
    datetime: null,         // Date object (combina meeting_date + start_time)
    client_id: '',
    participants: [],
    meet_link: '',
    obs: '',
  });

  // Lookups
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // File upload (ata)
  const [minutesFile, setMinutesFile] = useState(null);
  const [uploadingMinutes, setUploadingMinutes] = useState(false);

  /* ── Computed grids ── */
  const monthGrid = useMemo(
    () => buildMonthGrid(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const weekDays = useMemo(
    () => buildWeekDays(weekRef),
    [weekRef]
  );

  /* ── Fetch meetings ── */
  const fetchMeetings = useCallback(async () => {
    setLoadingMeetings(true);
    try {
      let dateFrom, dateTo;
      if (viewMode === 'month') {
        dateFrom = toYMD(monthGrid[0]);
        dateTo = toYMD(monthGrid[monthGrid.length - 1]);
      } else {
        const week = buildWeekDays(weekRef);
        dateFrom = toYMD(week[0]);
        dateTo = toYMD(week[6]);
      }
      const res = await fetch(`/api/meetings?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      if (!res.ok) throw new Error('Falha ao carregar reunioes');
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : data.meetings || []);
    } catch (err) {
      notify(err.message || 'Erro ao carregar reunioes', 'error');
    } finally {
      setLoadingMeetings(false);
    }
  }, [currentYear, currentMonth, viewMode, weekRef]);

  useEffect(() => {
    if (!authLoading && user) fetchMeetings();
  }, [fetchMeetings, authLoading, user]);

  /* ── Fetch clients + users (for modal) ── */
  const fetchClients = useCallback(async () => {
    if (clients.length > 0) return;
    setLoadingClients(true);
    try {
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setClients(Array.isArray(data) ? data : data.clients || []);
    } catch {
      /* silencioso */
    } finally {
      setLoadingClients(false);
    }
  }, [clients.length]);

  const fetchUsers = useCallback(async () => {
    if (users.length > 0) return;
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/tasks/users-search');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users || []);
    } catch {
      /* silencioso */
    } finally {
      setLoadingUsers(false);
    }
  }, [users.length]);

  /* ── Month navigation ── */
  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  }

  /* ── Week navigation ── */
  function prevWeek() {
    setWeekRef(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeekRef(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  /* ── Open modal ── */
  function openNewMeeting() {
    setEditingMeeting(null);
    // Sugestao: proxima hora cheia
    const suggested = new Date();
    suggested.setMinutes(0, 0, 0);
    suggested.setHours(suggested.getHours() + 1);
    setForm({
      title: '',
      datetime: suggested,
      client_id: '',
      participants: [],
      meet_link: '',
      obs: '',
    });
    setMinutesFile(null);
    setModalOpen(true);
    fetchClients();
    fetchUsers();
  }

  function openEditMeeting(meeting) {
    setEditingMeeting(meeting);
    // Combinar meeting_date (YYYY-MM-DD) + start_time (HH:MM:SS) em um Date
    let dt = null;
    if (meeting.meeting_date && meeting.start_time) {
      const dateStr = String(meeting.meeting_date).slice(0, 10);
      const timeStr = String(meeting.start_time).slice(0, 5);
      dt = new Date(`${dateStr}T${timeStr}:00`);
    }
    setForm({
      title: meeting.title || '',
      datetime: dt,
      client_id: meeting.client_id || '',
      participants: Array.isArray(meeting.participants) ? meeting.participants.map(p => p.id || p) : [],
      meet_link: meeting.meet_link || '',
      obs: meeting.obs || '',
    });
    setMinutesFile(null);
    setModalOpen(true);
    fetchClients();
    fetchUsers();
  }

  function closeModal() {
    setModalOpen(false);
    setEditingMeeting(null);
  }

  /* ── Save meeting ── */
  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) { notify('Título obrigatório', 'warning'); return; }
    if (!form.datetime) { notify('Data e horário obrigatórios', 'warning'); return; }

    // Bloqueia data/horário no passado (apenas na criação)
    if (!editingMeeting) {
      const now = new Date();
      if (form.datetime.getTime() < now.getTime()) {
        notify('A data e horário não podem estar no passado', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const dt = form.datetime;
      const meeting_date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      const start_time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

      const body = {
        title: form.title.trim(),
        meeting_date,
        start_time,
        client_id: form.client_id || null,
        participants: form.participants,
        meet_link: form.meet_link || null,
        obs: form.obs || null,
      };

      const isEdit = !!editingMeeting;
      const url = isEdit ? `/api/meetings/${editingMeeting.id}` : '/api/meetings';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.error || 'Erro ao salvar reunião');
      }

      const savedMeeting = json.meeting || json;

      // Upload ata se selecionada
      if (minutesFile && (isEdit || savedMeeting?.id)) {
        const meetingId = isEdit ? editingMeeting.id : savedMeeting.id;
        await uploadMinutes(meetingId);
      }

      notify(isEdit ? 'Reunião atualizada' : 'Reunião criada', 'success');
      closeModal();
      fetchMeetings();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ── Delete meeting ── */
  async function handleDelete() {
    if (!editingMeeting) return;
    if (!confirm('Excluir esta reuniao?')) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/meetings/${editingMeeting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      notify('Reuniao excluida', 'success');
      closeModal();
      fetchMeetings();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  /* ── Upload ata ── */
  async function uploadMinutes(meetingId) {
    if (!minutesFile) return;
    setUploadingMinutes(true);
    try {
      const fd = new FormData();
      fd.append('file', minutesFile);
      const res = await fetch(`/api/meetings/${meetingId}/minutes`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error('Erro ao enviar ata');
      notify('Ata enviada', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploadingMinutes(false);
    }
  }

  /* ── Form helpers ── */
  function updateField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleParticipant(userId) {
    setForm(prev => {
      const has = prev.participants.includes(userId);
      return {
        ...prev,
        participants: has
          ? prev.participants.filter(id => id !== userId)
          : [...prev.participants, userId],
      };
    });
  }

  /* ── Meetings grouped by date ── */
  function getMeetingsForDay(date) {
    const dateStr = toYMD(date);
    return meetings.filter(m => {
      const mDate = m.meeting_date ? String(m.meeting_date).slice(0, 10) : '';
      return mDate === dateStr;
    });
  }

  /* ── Combina meeting_date + start_time em Date ── */
  function meetingDateTime(m) {
    if (!m.meeting_date || !m.start_time) return null;
    const dateStr = String(m.meeting_date).slice(0, 10);
    const timeStr = String(m.start_time).slice(0, 5);
    const dt = new Date(`${dateStr}T${timeStr}:00`);
    return isNaN(dt) ? null : dt;
  }

  /* ── Status badge ── */
  function StatusBadge({ status }) {
    const map = {
      scheduled: { cls: styles.statusScheduled, label: 'Agendada' },
      done: { cls: styles.statusDone, label: 'Realizada' },
      cancelled: { cls: styles.statusCancelled, label: 'Cancelada' },
    };
    const cfg = map[status] || map.scheduled;
    return <span className={`${styles.statusBadge} ${cfg.cls}`}>{cfg.label}</span>;
  }

  /* ── Chip class by meeting type/status ── */
  function chipClass(meeting) {
    if (meeting.status === 'cancelled') return styles.meetingChipCancelled;
    if (meeting.client_id) return styles.meetingChipClient;
    return styles.meetingChipInternal;
  }

  /* ── Participant initials ── */
  function getInitials(name) {
    if (!name) return '??';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  /* ── Client name lookup ── */
  function clientName(clientId) {
    if (!clientId) return null;
    const c = clients.find(cl => cl.id === clientId);
    if (c) return c.name || c.company_name || c.brand_name || 'Cliente';
    return null;
  }

  /* ── Render ── */
  if (authLoading) return null;

  /* Week view label */
  const weekLabel = viewMode === 'week'
    ? `${fmtDateBR(weekDays[0])} - ${fmtDateBR(weekDays[6])}`
    : null;

  return (
    <DashboardLayout activeTab="meetings">
      <div className={styles.pageContainer}>

        {/* ── Header ── */}
        <div className="page-header">
          <h1 className="page-title">Calendario</h1>
          <p className="page-subtitle">Reunioes e compromissos do time</p>
        </div>

        <div className={styles.headerRow}>
          {/* Left: month/week navigation */}
          <div className={styles.monthNav}>
            <button
              className={styles.navBtn}
              onClick={viewMode === 'month' ? prevMonth : prevWeek}
              title={viewMode === 'month' ? 'Mes anterior' : 'Semana anterior'}
            >
              <IconChevronLeft />
            </button>
            <span className={styles.monthLabel}>
              {viewMode === 'month'
                ? `${MONTH_NAMES[currentMonth]} ${currentYear}`
                : weekLabel
              }
            </span>
            <button
              className={styles.navBtn}
              onClick={viewMode === 'month' ? nextMonth : nextWeek}
              title={viewMode === 'month' ? 'Proximo mes' : 'Proxima semana'}
            >
              <IconChevronRight />
            </button>
          </div>

          {/* Right: view toggle + new button */}
          <div className={styles.headerControls}>
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${viewMode === 'month' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('month')}
              >
                30 Dias
              </button>
              <button
                className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('week')}
              >
                7 Dias
              </button>
            </div>
            <button className="sigma-btn-primary" onClick={openNewMeeting}>
              <IconPlus /> Nova Reuniao
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loadingMeetings && (
          <div className={styles.loadingState}>
            Carregando reunioes...
          </div>
        )}

        {/* ── Month View ── */}
        {viewMode === 'month' && !loadingMeetings && (
          <div className={styles.calendarWrapper}>
            <div className={styles.calendarGrid}>
              {/* Weekday headers */}
              {WEEKDAY_NAMES.map(name => (
                <div key={name} className={styles.dayHeader}>{name}</div>
              ))}

              {/* Day cells */}
              {monthGrid.map((day, i) => {
                const isCurrentMonth = day.getMonth() === currentMonth;
                const isToday = isSameDay(day, today);
                const dayMeetings = getMeetingsForDay(day);

                return (
                  <div
                    key={i}
                    className={[
                      styles.dayCell,
                      isToday ? styles.dayCellToday : '',
                      !isCurrentMonth ? styles.dayCellOtherMonth : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className={`${styles.dayNumber} ${isToday ? styles.dayNumberToday : ''}`}>
                      {day.getDate()}
                    </span>
                    {dayMeetings.map(m => {
                      const dt = meetingDateTime(m);
                      return (
                        <span
                          key={m.id}
                          className={`${styles.meetingChip} ${chipClass(m)}`}
                          onClick={() => openEditMeeting(m)}
                          title={`${m.title}${dt ? ' - ' + fmtTime(dt) : ''}`}
                        >
                          {dt ? fmtTime(dt) : ''} {m.title}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Week View ── */}
        {viewMode === 'week' && !loadingMeetings && (
          <div className={styles.weekGrid}>
            {weekDays.map((day, i) => {
              const dayMeetings = getMeetingsForDay(day);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={i}
                  className={`${styles.weekRow} ${isToday ? styles.weekRowToday : ''}`}
                >
                  <div className={styles.weekDate}>
                    <span className={`${styles.weekDateDay} ${isToday ? styles.weekDateDayToday : ''}`}>
                      {day.getDate()}
                    </span>
                    <span>{WEEKDAY_NAMES[i]}</span>
                  </div>
                  <div className={styles.weekMeetings}>
                    {dayMeetings.length === 0 && (
                      <div className={styles.emptyDay}>Sem reunioes</div>
                    )}
                    {dayMeetings.map(m => {
                      const dtStart = meetingDateTime(m);
                      const cName = m.client_name || clientName(m.client_id);
                      const participants = Array.isArray(m.participants) ? m.participants : [];

                      return (
                        <div
                          key={m.id}
                          className={styles.meetingCard}
                          onClick={() => openEditMeeting(m)}
                        >
                          <div className={styles.meetingTime}>
                            {dtStart ? fmtTime(dtStart) : '--:--'}
                          </div>
                          <div className={styles.meetingInfo}>
                            <div className={styles.meetingTitle}>{m.title}</div>
                            {cName && <div className={styles.meetingClient}>{cName}</div>}
                          </div>
                          <StatusBadge status={m.status} />
                          {participants.length > 0 && (
                            <div className={styles.participantsRow}>
                              {participants.slice(0, 4).map((p, pi) => (
                                <div key={pi} className={styles.participantAvatar}>
                                  {getInitials(p.name || p)}
                                </div>
                              ))}
                              {participants.length > 4 && (
                                <div className={styles.participantAvatar}>
                                  +{participants.length - 4}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Modal: Create / Edit ── */}
        {modalOpen && (
          <div className={styles.modalOverlay} onClick={closeModal}>
            <div
              className={styles.meetingModal}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className={styles.modalHeader}>
                <div className={styles.headerTitleBox}>
                  <div className={styles.headerBadge}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <h2 className={styles.modalTitle}>
                      {editingMeeting ? 'Editar Reunião' : 'Nova Reunião'}
                    </h2>
                    <div className={styles.modalSubtitle}>
                      {editingMeeting
                        ? 'Atualize os dados da reunião selecionada.'
                        : 'Preencha as informações para agendar uma reunião.'
                      }
                    </div>
                    {editingMeeting && (
                      <div style={{ marginTop: 8 }}>
                        <StatusBadge status={editingMeeting.status} />
                      </div>
                    )}
                  </div>
                </div>
                <button className={styles.modalCloseBtn} onClick={closeModal}>
                  <IconClose />
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className={styles.formGrid}>

                  {/* Titulo */}
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label className={styles.formLabel}>
                      Título <span className={styles.required}>*</span>
                    </label>
                    <input
                      className="sigma-input"
                      type="text"
                      value={form.title}
                      onChange={e => updateField('title', e.target.value)}
                      placeholder="Ex: Reunião de briefing"
                      required
                    />
                  </div>

                  {/* Data e Horario combinados (react-datepicker) */}
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label className={styles.formLabel}>
                      Data e Horário <span className={styles.required}>*</span>
                    </label>
                    <div className={styles.datePickerWrap}>
                      <DatePicker
                        selected={form.datetime}
                        onChange={(d) => updateField('datetime', d)}
                        showTimeSelect
                        timeIntervals={15}
                        timeCaption="Horário"
                        dateFormat="dd/MM/yyyy 'às' HH:mm"
                        minDate={new Date()}
                        minTime={
                          form.datetime &&
                          form.datetime.toDateString() === new Date().toDateString()
                            ? new Date()
                            : new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        maxTime={new Date(new Date().setHours(23, 59, 59, 999))}
                        placeholderText="Selecione data e horário"
                        className={styles.datePickerInput}
                        popperPlacement="bottom-start"
                        required
                      />
                    </div>
                    <span className={styles.formHint}>
                      Datas e horários no passado não são permitidos
                    </span>
                  </div>

                  {/* Cliente */}
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label className={styles.formLabel}>Cliente</label>
                    <select
                      className="sigma-input"
                      value={form.client_id}
                      onChange={e => updateField('client_id', e.target.value)}
                    >
                      <option value="">-- Sem cliente (interna) --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.company_name || c.name || c.brand_name || 'Cliente'}
                        </option>
                      ))}
                    </select>
                    {loadingClients && (
                      <span className={styles.formHint}>Carregando clientes...</span>
                    )}
                  </div>

                  {/* Participantes */}
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label className={styles.formLabel}>
                      Participantes
                      {form.participants.length > 0 && (
                        <span style={{ marginLeft: 8, color: 'var(--brand-500)', fontWeight: 700 }}>
                          {form.participants.length} selecionado{form.participants.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </label>
                    <div className={styles.participantsBox}>
                      {loadingUsers && (
                        <span className={styles.participantsEmpty}>Carregando usuários...</span>
                      )}
                      {!loadingUsers && users.length === 0 && (
                        <span className={styles.participantsEmpty}>Nenhum usuário encontrado</span>
                      )}
                      {users.map(u => {
                        const uid = u.id || u.user_id;
                        const active = form.participants.includes(uid);
                        return (
                          <button
                            key={uid}
                            type="button"
                            className={`${styles.participantPick} ${active ? styles.participantPickActive : ''}`}
                            onClick={() => toggleParticipant(uid)}
                          >
                            <span className={styles.participantPickAvatar}>
                              {getInitials(u.name || u.email || uid)}
                            </span>
                            <span className={styles.participantPickName}>
                              {u.name || u.email || uid}
                            </span>
                            {active && (
                              <span className={styles.participantPickCheck}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Link da chamada */}
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label className={styles.formLabel}>Link da chamada</label>
                    <input
                      className="sigma-input"
                      type="url"
                      value={form.meet_link}
                      onChange={e => updateField('meet_link', e.target.value)}
                      placeholder="https://meet.google.com/..."
                    />
                  </div>

                  {/* Observacoes */}
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label className={styles.formLabel}>Observações</label>
                    <textarea
                      className="sigma-input"
                      value={form.obs}
                      onChange={e => updateField('obs', e.target.value)}
                      placeholder="Notas sobre a reunião..."
                      rows={3}
                      style={{ resize: 'vertical', minHeight: 60 }}
                    />
                  </div>

                  {/* Upload de Ata (somente edicao) */}
                  {editingMeeting && (
                    <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                      <label className={styles.formLabel}>Upload de Ata</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label className={styles.uploadBtn}>
                          <IconUpload />
                          Selecionar arquivo
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.txt"
                            style={{ display: 'none' }}
                            onChange={e => {
                              if (e.target.files && e.target.files[0]) {
                                setMinutesFile(e.target.files[0]);
                              }
                            }}
                          />
                        </label>
                        {minutesFile && (
                          <span className={styles.formHint} style={{ opacity: 1 }}>
                            {minutesFile.name}
                          </span>
                        )}
                        {editingMeeting.minutes_url && !minutesFile && (
                          <a
                            href={editingMeeting.minutes_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '0.7rem',
                              color: '#ff6680',
                              fontFamily: 'var(--font-mono)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <IconLink /> Ver ata atual
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className={styles.modalFooter}>
                  <div>
                    {editingMeeting && (
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        <IconTrash />
                        {deleting ? 'Excluindo...' : 'Excluir'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      onClick={closeModal}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="sigma-btn-primary"
                      disabled={saving}
                      style={{ cursor: saving ? 'wait' : 'pointer' }}
                    >
                      <IconCalendar />
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
