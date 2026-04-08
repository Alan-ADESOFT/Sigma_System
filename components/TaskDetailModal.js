/**
 * components/TaskDetailModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de detalhes de task — SIGMA terminal/HUD aesthetic.
 * taskId = null  -> modo criacao (formulario vazio)
 * taskId = '...' -> modo edicao (carrega dados + comentarios + log + deps)
 *
 * Auto-save nos campos ao blur/change (modo edicao).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../assets/style/taskDetailModal.module.css';
import { useNotification } from '../context/NotificationContext';

/* ── Constantes ─────────────────────────────────────────────────────────── */

const STATUS_OPTIONS = [
  { value: 'pending',     label: 'Pendente' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done',        label: 'Concluido' },
  { value: 'overdue',     label: 'Atrasada' },
];

const PRIORITY_OPTIONS = [
  { value: 'baixa',   label: 'Baixa' },
  { value: 'normal',  label: 'Normal' },
  { value: 'alta',    label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const STATUS_COLORS = {
  pending:     { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)', text: 'var(--warning)' },
  in_progress: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', text: '#3b82f6' },
  done:        { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  text: 'var(--success)' },
  overdue:     { bg: 'rgba(255,26,77,0.08)',  border: 'rgba(255,26,77,0.25)',  text: 'var(--error)' },
};

const ACTION_LABELS = {
  created:             () => 'Criou a task',
  status_changed:      (o, n) => `Alterou status de ${o || '\u2014'} para ${n || '\u2014'}`,
  changed_status:      (o, n) => `Alterou status de ${o || '\u2014'} para ${n || '\u2014'}`,
  assigned:            (o, n) => `Atribuiu para ${n || '\u2014'}`,
  changed_assigned_to: (o, n) => `Atribuiu para ${n || '\u2014'}`,
  due_date_changed:    (o, n) => `Alterou data para ${n || '\u2014'}`,
  changed_due_date:    (o, n) => `Alterou data para ${n || '\u2014'}`,
  changed_priority:    (o, n) => `Alterou prioridade para ${n || '\u2014'}`,
  changed_title:       (o, n) => `Alterou titulo para ${n || '\u2014'}`,
  comment_added:       () => 'Adicionou comentario',
  dependency_added:    () => 'Adicionou dependencia',
  completed:           () => 'Concluiu a task',
  reopened:            () => 'Reabriu a task',
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toISOString().slice(0, 10);
}

function initials(name) {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function highlightMentions(text) {
  if (!text) return '';
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return <span key={i} className={styles.mention}>{part}</span>;
    }
    return part;
  });
}

function getActionLabel(action, oldVal, newVal) {
  const fn = ACTION_LABELS[action];
  if (fn) return fn(oldVal, newVal);
  return action;
}

function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

/* ── Inline style objects (SIGMA tokens) ─────────────────────────────── */

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9000,
    background: 'rgba(0,0,0,0.78)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    width: 'min(1200px, 96%)',
    height: 'min(820px, 92vh)',
    background: 'linear-gradient(145deg, rgba(17,17,17,0.99), rgba(10,10,10,1))',
    border: '1px solid rgba(255,255,255,0.05)',
    borderTop: '2px solid #ff0033',
    borderRadius: 16,
    boxShadow: '0 30px 90px rgba(0,0,0,0.75), 0 0 30px rgba(255,0,51,0.08)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '20px 28px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  headerBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: 'rgba(255,0,51,0.12)',
    border: '1px solid rgba(255,0,51,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--brand-500)',
    flexShrink: 0,
  },
  titleInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    fontSize: '1.05rem',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  closeBtn: {
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  leftCol: {
    flex: '1 1 60%',
    minWidth: 0,
    overflowY: 'auto',
    padding: '24px 28px',
    borderRight: '1px solid rgba(255,255,255,0.04)',
  },
  rightCol: {
    flex: '0 0 38%',
    minWidth: 320,
    maxWidth: 460,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(5,5,5,0.4)',
    minHeight: 0,
  },
  rightHeader: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  rightScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 20px 4px',
    minHeight: 0,
  },
  rightCommentBox: {
    flexShrink: 0,
    padding: '12px 16px 16px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.4)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(5,5,5,0.4)',
  },
  sectionTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.66rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 14,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    background: 'var(--brand-500)',
    boxShadow: '0 0 6px rgba(255,0,51,0.6)',
    flexShrink: 0,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    background: 'linear-gradient(90deg, rgba(255,0,51,0.18), transparent)',
  },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.58rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    marginBottom: 4,
    display: 'block',
  },
  input: {
    padding: '10px 14px',
    background: 'rgba(10,10,10,0.8)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.2s',
  },
  select: {
    padding: '10px 14px',
    background: 'rgba(10,10,10,0.8)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    width: '100%',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23525252' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
  },
  textarea: {
    padding: '10px 14px',
    background: 'rgba(10,10,10,0.8)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    width: '100%',
    resize: 'vertical',
    minHeight: 80,
    transition: 'border-color 0.2s',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
    marginBottom: 14,
  },
  fieldCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  savingPulse: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.55rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-muted)',
    opacity: 0.6,
  },
};

/* ══════════════════════════════════════════════════════════════════════════ */

export default function TaskDetailModal({
  taskId,
  onClose,
  onRefresh,
  tenantCategories = [],
  tenantClients = [],
  tenantUsers = [],
}) {
  const { notify } = useNotification();
  const isEditMode = !!taskId;

  /* ── State ─────────────────────────────────────────────────────────── */
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('pending');
  const [clientId, setClientId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedToName, setAssignedToName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [categoryId, setCategoryId] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [description, setDescription] = useState('');

  // Nested data (edit mode)
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [subtasksRequired, setSubtasksRequired] = useState(false);

  // UI toggles
  const [showDepSearch, setShowDepSearch] = useState(false);
  const [depSearchQuery, setDepSearchQuery] = useState('');
  const [depSearchResults, setDepSearchResults] = useState([]);
  const [allTeamTasks, setAllTeamTasks] = useState([]);

  // User autocomplete (responsavel)
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userDropdownIndex, setUserDropdownIndex] = useState(-1);
  const userDebounceRef = useRef(null);
  const userDropdownRef = useRef(null);

  // Comment input
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // @mention in comment
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const commentTextareaRef = useRef(null);
  const mentionDebounceRef = useRef(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  /* ── Load task (edit mode) ─────────────────────────────────────────── */

  const loadTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const t = json.task;
      setTitle(t.title || '');
      setStatus(t.status || 'pending');
      setClientId(t.client_id || '');
      setAssignedTo(t.assigned_to || '');
      setAssignedToName(t.assigned_to_name || '');
      setUserQuery(t.assigned_to_name || '');
      setDueDate(formatDateInput(t.due_date));
      setPriority(t.priority || 'normal');
      setCategoryId(t.category_id || '');
      setEstimatedHours(t.estimated_hours != null ? String(t.estimated_hours) : '');
      setDescription(t.description || '');
      setComments(t.comments || []);
      setActivity(t.activity || []);
      setDependencies(t.dependencies || []);
      setSubtasks(Array.isArray(t.subtasks) ? t.subtasks : (t.subtasks ? JSON.parse(t.subtasks) : []));
      setSubtasksRequired(Boolean(t.subtasks_required));
    } catch (err) {
      notify('Erro ao carregar task: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [taskId, notify]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  /* ── Keyboard (Escape) ─────────────────────────────────────────────── */

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (mentionActive) {
          setMentionActive(false);
          return;
        }
        if (showUserDropdown) {
          setShowUserDropdown(false);
          return;
        }
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
          return;
        }
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, showDeleteConfirm, mentionActive, showUserDropdown]);

  /* ── Click outside user dropdown closes it ─────────────────────────── */

  useEffect(() => {
    function handleClickOutside(e) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* ── Auto-save (edit mode) ─────────────────────────────────────────── */

  const saveField = useCallback(async (fieldData) => {
    if (!isEditMode) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (onRefresh) onRefresh();
    } catch (err) {
      notify('Erro ao salvar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [isEditMode, taskId, onRefresh, notify]);

  /* ── User search (responsavel) ─────────────────────────────────────── */

  const searchUsers = useCallback(async (q) => {
    try {
      const res = await fetch(`/api/tasks/users-search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) setUserResults(json.users || []);
    } catch { /* silent */ }
  }, []);

  function handleUserInputChange(val) {
    setUserQuery(val);
    setShowUserDropdown(true);
    setUserDropdownIndex(-1);
    if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    userDebounceRef.current = setTimeout(() => {
      searchUsers(val);
    }, 300);
  }

  function handleSelectUser(user) {
    setAssignedTo(user.id);
    setAssignedToName(user.name);
    setUserQuery(user.name || '');
    setShowUserDropdown(false);
    setUserDropdownIndex(-1);
    if (isEditMode) saveField({ assigned_to: user.id });
  }

  function handleUserKeyDown(e) {
    if (!showUserDropdown || userResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setUserDropdownIndex((i) => Math.min(i + 1, userResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setUserDropdownIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && userDropdownIndex >= 0) {
      e.preventDefault();
      handleSelectUser(userResults[userDropdownIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowUserDropdown(false);
    }
  }

  /* ── Create task ───────────────────────────────────────────────────── */

  async function handleCreate() {
    if (!title.trim()) {
      notify('Titulo obrigatorio', 'error');
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        client_id: clientId || null,
        assigned_to: assignedTo || null,
        priority,
        due_date: dueDate || null,
        status,
        category_id: categoryId || null,
        estimated_hours: estimatedHours ? Number(estimatedHours) : null,
        dependsOn: dependencies.map((d) => d.depends_on_id),
      };

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      notify('Task criada', 'success');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      notify('Erro ao criar task: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ── Delete task ───────────────────────────────────────────────────── */

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Task excluida', 'success');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      notify('Erro ao excluir: ' + err.message, 'error');
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }

  /* ── Comments ──────────────────────────────────────────────────────── */

  async function handleSubmitComment() {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCommentText('');
      await loadTask();
      notify('Comentario enviado', 'success');
    } catch (err) {
      notify('Erro ao enviar comentario: ' + err.message, 'error');
    } finally {
      setSubmittingComment(false);
    }
  }

  /* ── @mention in comment textarea ──────────────────────────────────── */

  function handleCommentKeyDown(e) {
    if (mentionActive && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionResults.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionActive(false);
        return;
      }
    }
  }

  function handleCommentChange(e) {
    const val = e.target.value;
    setCommentText(val);

    const cursorPos = e.target.selectionStart;
    const textUpToCursor = val.slice(0, cursorPos);
    const atMatch = textUpToCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionActive(true);
      const q = atMatch[1];
      setMentionQuery(q);
      setMentionIndex(0);
      if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
      mentionDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/tasks/users-search?q=${encodeURIComponent(q)}`);
          const json = await res.json();
          if (json.success) setMentionResults(json.users || []);
        } catch { /* silent */ }
      }, 300);
    } else {
      setMentionActive(false);
      setMentionResults([]);
    }
  }

  function insertMention(user) {
    if (!user) return;
    const textarea = commentTextareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = commentText.slice(0, cursorPos);
    const textAfter = commentText.slice(cursorPos);
    const atIndex = textBefore.lastIndexOf('@');

    const mention = `@${user.username || user.name} `;
    const newText = textBefore.slice(0, atIndex) + mention + textAfter;
    setCommentText(newText);
    setMentionActive(false);
    setMentionResults([]);

    setTimeout(() => {
      textarea.focus();
      const newPos = atIndex + mention.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  /* ── Subtasks ──────────────────────────────────────────────────────── */

  function uidSub() {
    return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function addSubtask() {
    setSubtasks((prev) => {
      const next = [...prev, { id: uidSub(), title: '', done: false }];
      return next;
    });
  }

  function updateSubtask(id, key, value) {
    setSubtasks((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, [key]: value } : s));
      if (isEditMode && key === 'done') {
        // Persistir mudanca de done imediatamente
        saveField({ subtasks: next });
      }
      return next;
    });
  }

  function commitSubtaskTitle(id) {
    if (!isEditMode) return;
    saveField({ subtasks });
  }

  function removeSubtask(id) {
    setSubtasks((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (isEditMode) saveField({ subtasks: next });
      return next;
    });
  }

  /* ── Dependencies ──────────────────────────────────────────────────── */

  async function loadAllTeamTasks() {
    if (allTeamTasks.length > 0) return;
    try {
      const res = await fetch('/api/tasks?view=team');
      const json = await res.json();
      if (json.success) setAllTeamTasks(json.tasks || []);
    } catch { /* silent */ }
  }

  function handleOpenDepSearch() {
    setShowDepSearch(true);
    setDepSearchQuery('');
    setDepSearchResults([]);
    loadAllTeamTasks();
  }

  useEffect(() => {
    if (!showDepSearch) return;
    const currentDepIds = new Set(dependencies.map((d) => d.depends_on_id));
    const q = depSearchQuery.toLowerCase().trim();
    const filtered = allTeamTasks.filter((t) => {
      if (t.id === taskId) return false;
      if (currentDepIds.has(t.id)) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
    setDepSearchResults(filtered.slice(0, 20));
  }, [depSearchQuery, allTeamTasks, dependencies, taskId, showDepSearch]);

  async function handleAddDependency(depTask) {
    if (isEditMode) {
      try {
        const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dependsOnId: depTask.id }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setDependencies((prev) => [
          ...prev,
          {
            depends_on_id: depTask.id,
            depends_on_title: depTask.title,
            depends_on_status: depTask.status,
          },
        ]);
        setShowDepSearch(false);
        if (onRefresh) onRefresh();
      } catch (err) {
        notify('Erro ao adicionar dependencia: ' + err.message, 'error');
      }
    } else {
      setDependencies((prev) => [
        ...prev,
        {
          depends_on_id: depTask.id,
          depends_on_title: depTask.title,
          depends_on_status: depTask.status,
        },
      ]);
      setShowDepSearch(false);
    }
  }

  async function handleRemoveDependency(depId) {
    if (isEditMode) {
      try {
        const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dependsOnId: depId }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setDependencies((prev) => prev.filter((d) => d.depends_on_id !== depId));
        if (onRefresh) onRefresh();
      } catch (err) {
        notify('Erro ao remover dependencia: ' + err.message, 'error');
      }
    } else {
      setDependencies((prev) => prev.filter((d) => d.depends_on_id !== depId));
    }
  }

  /* ── Status badge renderer ─────────────────────────────────────────── */

  function renderStatusBadge(statusVal) {
    const c = getStatusColor(statusVal);
    const label = STATUS_OPTIONS.find((o) => o.value === statusVal)?.label || statusVal;
    return (
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.55rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '3px 10px',
        borderRadius: 10,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <>
      {/* ═══ Overlay ═══ */}
      <div style={S.overlay} onClick={onClose}>
        <div style={S.modal} onClick={(e) => e.stopPropagation()}>

          {/* ─── Header ─── */}
          <div style={S.header}>
            <div style={S.headerBadge}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <input
              style={S.titleInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => isEditMode && title.trim() && saveField({ title: title.trim() })}
              onFocus={(e) => { e.target.style.background = 'rgba(255,255,255,0.03)'; }}
              onBlurCapture={(e) => { e.target.style.background = 'transparent'; }}
              placeholder="Título da tarefa"
            />

            {/* Status select (styled as badge) */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                if (isEditMode) saveField({ status: e.target.value });
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.58rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '4px 24px 4px 10px',
                borderRadius: 10,
                background: getStatusColor(status).bg,
                border: `1px solid ${getStatusColor(status).border}`,
                color: getStatusColor(status).text,
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23525252' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {saving && (
              <span style={S.savingPulse}>salvando...</span>
            )}

            <button
              style={S.closeBtn}
              onClick={onClose}
              title="Fechar"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,0,51,0.3)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* ─── Body ─── */}
          <div style={S.body}>
            {loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className={styles.spinner} />
              </div>
            ) : (
              <>
              {/* ═══ COLUNA ESQUERDA ═══ */}
              <div style={S.leftCol}>
                {/* ═══ INFORMACOES ═══ */}
                <div style={{ marginBottom: 28 }}>
                  <div style={S.sectionTitle}>
                    <span style={S.sectionDot} />
                    Informações
                    <span style={S.sectionLine} />
                  </div>

                  {/* Row 1: Cliente + Responsavel */}
                  <div style={S.grid2}>
                    <div style={S.fieldCol}>
                      <label style={S.label}>Cliente</label>
                      <select
                        style={S.select}
                        value={clientId}
                        onChange={(e) => {
                          setClientId(e.target.value);
                          if (isEditMode) saveField({ client_id: e.target.value || null });
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
                      >
                        <option value="">Nenhum</option>
                        {tenantClients.map((c) => (
                          <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={S.fieldCol}>
                      <label style={S.label}>Responsável</label>
                      <select
                        style={S.select}
                        value={assignedTo}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setAssignedTo(newId);
                          const u = tenantUsers.find((x) => x.id === newId);
                          setAssignedToName(u?.name || '');
                          if (isEditMode) saveField({ assigned_to: newId || null });
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
                      >
                        <option value="">Sem responsável</option>
                        {tenantUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Data + Prioridade */}
                  <div style={S.grid2}>
                    <div style={S.fieldCol}>
                      <label style={S.label}>Data</label>
                      <input
                        type="date"
                        style={S.input}
                        value={dueDate}
                        onChange={(e) => {
                          setDueDate(e.target.value);
                          if (isEditMode) saveField({ due_date: e.target.value || null });
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
                      />
                    </div>

                    <div style={S.fieldCol}>
                      <label style={S.label}>Prioridade</label>
                      <select
                        style={S.select}
                        value={priority}
                        onChange={(e) => {
                          setPriority(e.target.value);
                          if (isEditMode) saveField({ priority: e.target.value });
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
                      >
                        {PRIORITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Categoria + Horas Estimadas */}
                  <div style={S.grid2}>
                    <div style={S.fieldCol}>
                      <label style={S.label}>Categoria</label>
                      <select
                        style={S.select}
                        value={categoryId}
                        onChange={(e) => {
                          setCategoryId(e.target.value);
                          if (isEditMode) saveField({ category_id: e.target.value || null });
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
                      >
                        <option value="">Nenhuma</option>
                        {tenantCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={S.fieldCol}>
                      <label style={S.label}>Horas Estimadas</label>
                      <input
                        type="number"
                        style={S.input}
                        value={estimatedHours}
                        min="0"
                        step="0.5"
                        onChange={(e) => setEstimatedHours(e.target.value)}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'var(--border-default)';
                          if (isEditMode) {
                            saveField({ estimated_hours: estimatedHours ? Number(estimatedHours) : null });
                          }
                        }}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Descricao */}
                  <div style={S.fieldCol}>
                    <label style={S.label}>Descrição</label>
                    <textarea
                      style={S.textarea}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'var(--border-default)';
                        if (isEditMode) saveField({ description: description.trim() || null });
                      }}
                      placeholder="Descreva a task..."
                      rows={3}
                    />
                  </div>
                </div>

                {/* ═══ SUBTAREFAS ═══ */}
                <div style={{ marginBottom: 28 }}>
                  <div style={S.sectionTitle}>
                    <span style={S.sectionDot} />
                    Subtarefas
                    <span style={S.sectionLine} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.5rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontWeight: 600,
                      }}>
                        Obrigatórias
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !subtasksRequired;
                          setSubtasksRequired(next);
                          if (isEditMode) saveField({ subtasks_required: next });
                        }}
                        title="Se ativo, todas as subtarefas precisam estar concluídas para finalizar a tarefa"
                        style={{
                          position: 'relative',
                          width: 32,
                          height: 18,
                          background: subtasksRequired ? 'rgba(255,0,51,0.35)' : 'rgba(115,115,115,0.25)',
                          borderRadius: 9,
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: 'absolute',
                          top: 2,
                          left: subtasksRequired ? 16 : 2,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: subtasksRequired ? 'var(--brand-500)' : 'var(--text-muted)',
                          transition: 'all 0.2s',
                        }} />
                      </button>
                    </div>
                  </div>

                  {subtasks.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {subtasks.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 12px',
                            background: 'rgba(10,10,10,0.5)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 6,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!s.done}
                            onChange={(e) => updateSubtask(s.id, 'done', e.target.checked)}
                            style={{
                              width: 14,
                              height: 14,
                              accentColor: '#ff0033',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          />
                          <input
                            value={s.title}
                            onChange={(e) => updateSubtask(s.id, 'title', e.target.value)}
                            onBlur={() => commitSubtaskTitle(s.id)}
                            placeholder="Descreva a subtarefa..."
                            style={{
                              flex: 1,
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              color: s.done ? 'var(--text-muted)' : 'var(--text-primary)',
                              fontSize: 13,
                              fontFamily: 'var(--font-sans)',
                              textDecoration: s.done ? 'line-through' : 'none',
                            }}
                          />
                          <button
                            onClick={() => removeSubtask(s.id)}
                            title="Remover subtarefa"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              padding: 2,
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState} style={{ marginBottom: 10 }}>Nenhuma subtarefa</div>
                  )}

                  <button
                    onClick={addSubtask}
                    style={{
                      padding: '6px 12px',
                      background: 'transparent',
                      border: '1px dashed var(--border-default)',
                      borderRadius: 6,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.58rem',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,0,51,0.3)';
                      e.currentTarget.style.color = 'var(--brand-500)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Adicionar subtarefa
                  </button>
                </div>

                {/* ═══ DEPENDENCIAS ═══ */}
                <div style={{ marginBottom: 28 }}>
                  <div style={S.sectionTitle}>
                    <span style={S.sectionDot} />
                    Dependências
                    <span style={S.sectionLine} />
                  </div>

                  {dependencies.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dependencies.map((dep) => {
                        const isDone = dep.depends_on_status === 'done';
                        const isBlocked = !isDone;
                        return (
                          <div key={dep.depends_on_id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            background: 'rgba(10,10,10,0.5)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 6,
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                          }}>
                            {/* Lock icon for blocked deps */}
                            {isBlocked && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0110 0v4" />
                              </svg>
                            )}
                            {isDone && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}

                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {dep.depends_on_title}
                            </span>

                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.55rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: isDone ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)',
                              color: isDone ? 'var(--success)' : 'var(--warning)',
                              flexShrink: 0,
                            }}>
                              {isDone ? 'Concluida' : 'Pendente'}
                            </span>

                            <button
                              onClick={() => handleRemoveDependency(dep.depends_on_id)}
                              title="Remover dependencia"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                padding: '0 2px',
                                transition: 'color 0.15s',
                                lineHeight: 1,
                                flexShrink: 0,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>Nenhuma dependencia</div>
                  )}

                  {showDepSearch ? (
                    <div style={{ marginTop: 10 }}>
                      <input
                        style={S.input}
                        value={depSearchQuery}
                        onChange={(e) => setDepSearchQuery(e.target.value)}
                        placeholder="Buscar task..."
                        autoFocus
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
                      />
                      <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {depSearchResults.map((t) => (
                          <div
                            key={t.id}
                            onClick={() => handleAddDependency(t)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              background: 'rgba(10,10,10,0.4)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 6,
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'rgba(255,0,51,0.25)';
                              e.currentTarget.style.background = 'rgba(255,0,51,0.04)';
                              e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--border-default)';
                              e.currentTarget.style.background = 'rgba(10,10,10,0.4)';
                              e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                          >
                            <span>{t.title}</span>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.55rem',
                              textTransform: 'uppercase',
                              color: t.status === 'done' ? 'var(--success)' : 'var(--text-muted)',
                            }}>
                              {t.status}
                            </span>
                          </div>
                        ))}
                        {depSearchResults.length === 0 && depSearchQuery && (
                          <div className={styles.emptyState}>Nenhuma task encontrada</div>
                        )}
                      </div>
                      <button
                        onClick={() => setShowDepSearch(false)}
                        style={{
                          marginTop: 8,
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid var(--border-default)',
                          borderRadius: 6,
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.58rem',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleOpenDepSearch}
                      style={{
                        marginTop: 10,
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px dashed var(--border-default)',
                        borderRadius: 6,
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.58rem',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,0,51,0.3)';
                        e.currentTarget.style.color = 'var(--brand-500)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Adicionar dependencia
                    </button>
                  )}
                </div>
              </div>

              {isEditMode && (
              <div style={S.rightCol}>
                <div style={S.rightHeader}>Atividade</div>
                <div style={S.rightScroll}>
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ ...S.sectionTitle, fontSize: '0.6rem' }}>
                      <span style={S.sectionDot} />
                      Histórico
                      <span style={S.sectionLine} />
                    </div>

                    {activity.length > 0 ? (
                      <div style={{ position: 'relative', paddingLeft: 20 }}>
                        {/* Vertical line */}
                        <div style={{
                          position: 'absolute',
                          top: 8,
                          bottom: 8,
                          left: 7,
                          width: 1,
                          background: 'var(--border-default)',
                        }} />

                        {activity.map((log, i) => (
                          <div key={log.id || i} style={{
                            display: 'flex',
                            gap: 10,
                            padding: '8px 0',
                            position: 'relative',
                          }}>
                            {/* Dot */}
                            <div style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: 'var(--brand-500)',
                              border: '2px solid rgba(17,17,17,1)',
                              position: 'absolute',
                              left: -18,
                              top: 12,
                              zIndex: 1,
                            }} />

                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                                lineHeight: 1.5,
                              }}>
                                <strong style={{ color: 'var(--text-primary)' }}>
                                  {log.actor_name || 'Sistema'}
                                </strong>{' '}
                                {getActionLabel(log.action, log.old_value, log.new_value)}
                              </div>
                              <div style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.55rem',
                                color: 'var(--text-muted)',
                                marginTop: 2,
                              }}>
                                {formatDate(log.created_at)}{' '}
                                {log.created_at
                                  ? new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                  : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>Nenhum registro</div>
                    )}
                  </div>

                  <div style={{ marginBottom: 0 }}>
                    <div style={{ ...S.sectionTitle, fontSize: '0.6rem' }}>
                      <span style={S.sectionDot} />
                      Comentários
                      <span style={S.sectionLine} />
                    </div>

                    {comments.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
                        {comments.map((c) => (
                          <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                            {/* Avatar initials */}
                            <div style={{
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              background: 'rgba(255,0,51,0.1)',
                              border: '1px solid rgba(255,0,51,0.25)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.55rem',
                              color: 'var(--brand-500)',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}>
                              {initials(c.author_name)}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: 3,
                              }}>
                                {c.author_name || 'Usuario'}
                              </div>
                              <div style={{
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                                lineHeight: 1.55,
                                wordBreak: 'break-word',
                              }}>
                                {highlightMentions(c.content)}
                              </div>
                              <div style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.55rem',
                                color: 'var(--text-muted)',
                                marginTop: 4,
                              }}>
                                {formatDate(c.created_at)}{' '}
                                {c.created_at
                                  ? new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                  : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState} style={{ marginBottom: 14 }}>Nenhum comentario</div>
                    )}
                  </div>
                </div>

                <div style={S.rightCommentBox}>
                  <div style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-end',
                  }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <textarea
                          ref={commentTextareaRef}
                          value={commentText}
                          onChange={handleCommentChange}
                          onKeyDown={handleCommentKeyDown}
                          placeholder="Escreva um comentario... Use @ para mencionar"
                          rows={2}
                          style={{
                            ...S.textarea,
                            minHeight: 60,
                            resize: 'none',
                          }}
                          onFocus={(e) => { e.target.style.borderColor = 'rgba(255,0,51,0.5)'; }}
                          onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
                        />

                        {/* @mention dropdown */}
                        {mentionActive && mentionResults.length > 0 && (
                          <div style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: 0,
                            marginBottom: 4,
                            background: 'linear-gradient(145deg, rgba(17,17,17,0.99), rgba(10,10,10,0.99))',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                            zIndex: 100,
                            maxHeight: 200,
                            overflowY: 'auto',
                            minWidth: 200,
                          }}>
                            {mentionResults.map((user, idx) => (
                              <div
                                key={user.id}
                                onClick={() => insertMention(user)}
                                onMouseEnter={() => setMentionIndex(idx)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  color: idx === mentionIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  background: idx === mentionIndex ? 'rgba(255,0,51,0.08)' : 'transparent',
                                  transition: 'background 0.12s',
                                }}
                              >
                                <span style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: '50%',
                                  background: 'rgba(255,0,51,0.1)',
                                  border: '1px solid rgba(255,0,51,0.25)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.48rem',
                                  color: 'var(--brand-500)',
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}>
                                  {initials(user.name)}
                                </span>
                                {user.name}
                                {user.username && (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                                    @{user.username}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleSubmitComment}
                        disabled={submittingComment || !commentText.trim()}
                        style={{
                          padding: '10px 18px',
                          background: 'linear-gradient(135deg, rgba(204,0,41,1), rgba(255,0,51,1))',
                          border: '1px solid rgba(255,0,51,0.4)',
                          borderRadius: 6,
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          cursor: submittingComment || !commentText.trim() ? 'not-allowed' : 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          opacity: submittingComment || !commentText.trim() ? 0.4 : 1,
                          transition: 'all 0.2s',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {submittingComment ? '...' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </>
            )}
          </div>

          {/* ─── Footer ─── */}
          {!loading && (
            <div style={S.footer}>
              {isEditMode ? (
                <>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,26,77,0.3)',
                      background: 'rgba(255,26,77,0.08)',
                      color: 'var(--error)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.62rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,26,77,0.15)';
                      e.currentTarget.style.borderColor = 'rgba(255,26,77,0.5)';
                      e.currentTarget.style.boxShadow = '0 0 12px rgba(255,26,77,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,26,77,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255,26,77,0.3)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                    Excluir
                  </button>
                  {/* Spacer pushes nothing to right in edit mode — footer is left-aligned delete only */}
                  <div />
                </>
              ) : (
                <>
                  <div />
                  <button
                    onClick={handleCreate}
                    disabled={saving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '10px 24px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      background: saving
                        ? 'rgba(80,80,80,0.3)'
                        : 'linear-gradient(135deg, var(--brand-600), var(--brand-500))',
                      color: '#fff',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      transition: 'all 0.2s',
                      boxShadow: saving ? 'none' : '0 0 16px rgba(255,0,51,0.2)',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {saving ? 'Criando...' : 'Criar Task'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Delete confirmation dialog ═══ */}
      {showDeleteConfirm && (
        <div
          onClick={() => setShowDeleteConfirm(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(145deg, rgba(17,17,17,0.99), rgba(10,10,10,0.99))',
              border: '1px solid rgba(255,26,77,0.2)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 380,
              width: '90vw',
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}>
              Excluir task
            </div>
            <div style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 20,
              lineHeight: 1.5,
            }}>
              Tem certeza que deseja excluir esta task? Esta acao nao pode ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: '7px 18px',
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 18px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,26,77,0.4)',
                  background: 'rgba(255,26,77,0.12)',
                  color: 'var(--error)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? '...' : 'Confirmar exclusao'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
