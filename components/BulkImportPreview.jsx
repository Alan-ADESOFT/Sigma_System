/**
 * components/BulkImportPreview.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Passo 2 do fluxo de importação em massa — preview editável.
 *
 * Recebe a lista de tasks parseada pela IA e permite ao usuário ajustar tudo
 * antes de salvar. Agrupa por responsável (header com avatar + nome) e cada
 * linha é totalmente editável (título, cliente, responsável, data, hora,
 * prioridade, categoria) + botão de remover. Botão "+ Adicionar tarefa" no
 * final de cada grupo herda o responsável daquele grupo.
 *
 * Decisões:
 *   • Estado local — quando o usuário clica em "Confirmar e criar", o array
 *     editado é POSTado pro endpoint commit. O pai cuida do refresh.
 *   • Warnings da IA aparecem no topo como banner laranja.
 *   • "Voltar" devolve controle ao modal anterior preservando o texto bruto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useMemo } from 'react';
import styles from '../assets/style/bulkImport.module.css';
import { useNotification } from '../context/NotificationContext';

const PRIORITY_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function uid() {
  return `bi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const IconClose = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
  </svg>
);

export default function BulkImportPreview({
  initialTasks,
  initialMeetings,
  warnings,
  meta,
  users,
  clients,
  categories,
  currentUserId,
  onBack,
  onClose,
  onCommitted,
}) {
  const { notify } = useNotification();

  // tasks com id local pra controlar key e remoção
  const [items, setItems] = useState(() =>
    (initialTasks || []).map((t) => ({ _localId: uid(), ...t }))
  );
  // reuniões extraídas da mesma ata
  const [meetingItems, setMeetingItems] = useState(() =>
    (initialMeetings || []).map((m) => ({ _localId: uid(), ...m }))
  );
  const [saving, setSaving] = useState(false);

  // Agrupamento por responsável — mantém a ordem em que aparecem na lista
  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const assignee = it.assigned_to || currentUserId || '__none';
      if (!map.has(assignee)) map.set(assignee, []);
      map.get(assignee).push(it);
    }
    return Array.from(map.entries()).map(([userId, list]) => {
      const user = users.find((u) => u.id === userId);
      return {
        userId,
        name: user?.name || 'Sem responsável',
        tasks: list,
      };
    });
  }, [items, users, currentUserId]);

  function updateItem(localId, patch) {
    setItems((prev) => prev.map((it) => (it._localId === localId ? { ...it, ...patch } : it)));
  }

  function removeItem(localId) {
    setItems((prev) => prev.filter((it) => it._localId !== localId));
  }

  function removeSubtask(localId, subIndex) {
    setItems((prev) => prev.map((it) => (
      it._localId === localId
        ? { ...it, subtasks: (it.subtasks || []).filter((_, i) => i !== subIndex) }
        : it
    )));
  }

  const subLabel = (s) => (typeof s === 'string' ? s : (s?.title || ''));

  // Resumo pro cabeçalho
  const totalSubtasks = useMemo(
    () => items.reduce((acc, it) => acc + (Array.isArray(it.subtasks) ? it.subtasks.length : 0), 0),
    [items]
  );

  function addItemForUser(userId) {
    setItems((prev) => [
      ...prev,
      {
        _localId: uid(),
        title: '',
        description: null,
        client_id: null,
        assigned_to: userId,
        category_id: null,
        priority: 'normal',
        due_date: new Date().toISOString().slice(0, 10),
        due_time: null,
        subtasks: [],
      },
    ]);
  }

  /* ── Reuniões ── */
  function updateMeeting(localId, patch) {
    setMeetingItems((prev) => prev.map((m) => (m._localId === localId ? { ...m, ...patch } : m)));
  }

  function removeMeeting(localId) {
    setMeetingItems((prev) => prev.filter((m) => m._localId !== localId));
  }

  function addMeeting() {
    setMeetingItems((prev) => [
      ...prev,
      {
        _localId: uid(),
        title: '',
        description: null,
        meeting_date: new Date().toISOString().slice(0, 10),
        start_time: '09:00',
        participants: [],
        client_id: null,
      },
    ]);
  }

  async function handleCommit() {
    if (items.length === 0 && meetingItems.length === 0) {
      notify('Adicione ao menos uma tarefa ou reunião para criar', 'warning');
      return;
    }
    const invalid = items.filter((t) => !t.title?.trim() || !t.assigned_to || !t.due_date);
    if (invalid.length > 0) {
      notify(`${invalid.length} tarefa(s) sem título, responsável ou data — corrija antes de salvar`, 'error');
      return;
    }
    const invalidMeetings = meetingItems.filter((m) => !m.title?.trim() || !m.meeting_date);
    if (invalidMeetings.length > 0) {
      notify(`${invalidMeetings.length} reunião(ões) sem título ou data — corrija antes de salvar`, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = items.map(({ _localId, ...rest }) => rest);
      const meetingPayload = meetingItems.map(({ _localId, ...rest }) => rest);
      const res = await fetch('/api/tasks/bulk-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: payload, meetings: meetingPayload }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao salvar');

      const failedCount = (data.failed?.length || 0) + (data.failedMeetings?.length || 0);
      const createdMeetings = data.createdMeetings || 0;
      let msg = `${data.created} tarefa(s)`;
      if (createdMeetings > 0) msg += ` · ${createdMeetings} reunião(ões)`;
      msg += ' criada(s)';
      if (failedCount > 0) {
        notify(`${msg} · ${failedCount} falharam`, 'warning');
      } else {
        notify(`${msg} com sucesso`, 'success');
      }
      console.log('[SUCESSO][bulkImport/preview] commit', { created: data.created, meetings: createdMeetings, failed: failedCount });
      onCommitted && onCommitted(data);
      onClose && onClose();
    } catch (err) {
      console.error('[ERRO][bulkImport/preview]', err.message);
      notify('Erro ao criar tarefas: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>Revisar antes de criar</h2>
            <div className={styles.headerSubtitle}>
              {items.length} tarefa{items.length !== 1 ? 's' : ''}
              {totalSubtasks > 0 ? ` · ${totalSubtasks} subtarefa${totalSubtasks !== 1 ? 's' : ''}` : ''}
              {meetingItems.length > 0 ? ` · ${meetingItems.length} reuni${meetingItems.length !== 1 ? 'ões' : 'ão'}` : ''}
              {' '}— confira e ajuste o que precisar
            </div>
          </div>
          <button className={styles.closeBtn} type="button" onClick={onClose} title="Fechar">
            <IconClose />
          </button>
        </div>

        <div className={styles.body}>
          {warnings && warnings.length > 0 && (
            <div className={styles.warnings}>
              <div className={styles.warningsTitle}>⚠ Pontos pra conferir ({warnings.length})</div>
              <ul className={styles.warningsList}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {grouped.length === 0 ? (
            <div className={styles.fileBox}>
              <span className={styles.fileBoxLabel}>Nenhuma tarefa restante</span>
              <span className={styles.fileBoxHint}>Volte e tente outro texto</span>
            </div>
          ) : grouped.map((g) => (
            <div key={g.userId} className={styles.previewGroup}>
              <div className={styles.previewGroupHeader}>
                <span className={styles.previewAvatar}>{getInitials(g.name)}</span>
                <span className={styles.previewGroupName}>{g.name}</span>
                <span className={styles.previewGroupCount}>
                  {g.tasks.length} {g.tasks.length === 1 ? 'tarefa' : 'tarefas'}
                </span>
              </div>

              {g.tasks.map((t) => (
                <div key={t._localId}>
                  <div className={styles.previewRow}>
                  <input
                    type="text"
                    value={t.title || ''}
                    placeholder="Título da tarefa"
                    onChange={(e) => updateItem(t._localId, { title: e.target.value })}
                  />
                  <select
                    value={t.client_id || ''}
                    onChange={(e) => updateItem(t._localId, { client_id: e.target.value || null })}
                  >
                    <option value="">Sem cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                    ))}
                  </select>
                  <select
                    value={t.assigned_to || ''}
                    onChange={(e) => updateItem(t._localId, { assigned_to: e.target.value || null })}
                  >
                    <option value="">Sem responsável</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <select
                    value={t.category_id || ''}
                    onChange={(e) => updateItem(t._localId, { category_id: e.target.value || null })}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={t.due_date || ''}
                    onChange={(e) => updateItem(t._localId, { due_date: e.target.value || null })}
                  />
                  <select
                    value={t.priority || 'normal'}
                    onChange={(e) => updateItem(t._localId, { priority: e.target.value })}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.previewRemove}
                    onClick={() => removeItem(t._localId)}
                    title="Remover"
                  >
                    <IconTrash />
                  </button>
                  </div>
                  {Array.isArray(t.subtasks) && t.subtasks.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '2px 0 9px 14px' }}>
                      {t.subtasks.map((s, si) => (
                        <span key={si} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '2px 8px', borderRadius: 12,
                          background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
                          fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-secondary)',
                        }}>
                          <span style={{ color: '#22c55e' }}>☑</span> {subLabel(s)}
                          <span onClick={() => removeSubtask(t._localId, si)} style={{ cursor: 'pointer', opacity: 0.55, fontSize: '0.78rem', lineHeight: 1 }} title="Remover subtarefa">×</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                className={styles.previewAddRow}
                onClick={() => addItemForUser(g.userId)}
              >
                + Adicionar tarefa
              </button>
            </div>
          ))}

          {/* ── Reuniões extraídas da ata ── */}
          <div className={styles.sectionDivider}>
            <span className={styles.sectionDividerLabel}>Reuniões</span>
            <span className={styles.sectionDividerLine} />
            <span className={styles.previewGroupCount}>
              {meetingItems.length} {meetingItems.length === 1 ? 'reunião' : 'reuniões'}
            </span>
          </div>

          {meetingItems.length === 0 ? (
            <div className={styles.fileBoxHint} style={{ paddingBottom: 8 }}>
              Nenhuma reunião detectada na ata — adicione manualmente se precisar.
            </div>
          ) : (
            meetingItems.map((m) => (
              <div key={m._localId} className={styles.meetingRow}>
                <input
                  type="text"
                  value={m.title || ''}
                  placeholder="Assunto da reunião"
                  onChange={(e) => updateMeeting(m._localId, { title: e.target.value })}
                />
                <input
                  type="date"
                  value={m.meeting_date || ''}
                  onChange={(e) => updateMeeting(m._localId, { meeting_date: e.target.value || null })}
                />
                <input
                  type="time"
                  value={(m.start_time || '').slice(0, 5)}
                  onChange={(e) => updateMeeting(m._localId, { start_time: e.target.value || null })}
                />
                <select
                  value={m.client_id || ''}
                  onChange={(e) => updateMeeting(m._localId, { client_id: e.target.value || null })}
                >
                  <option value="">Sem cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={(m.participants || []).join(', ')}
                  placeholder="Envolvidos (vírgula)"
                  onChange={(e) => updateMeeting(m._localId, {
                    participants: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })}
                />
                <button
                  type="button"
                  className={styles.previewRemove}
                  onClick={() => removeMeeting(m._localId)}
                  title="Remover"
                >
                  <IconTrash />
                </button>
              </div>
            ))
          )}

          <button type="button" className={styles.previewAddRow} onClick={addMeeting}>
            + Adicionar reunião
          </button>
        </div>

        <div className={styles.footer}>
          <span className={styles.footerCount}>
            {items.length} tarefa{items.length !== 1 ? 's' : ''}
            {meetingItems.length > 0 ? ` · ${meetingItems.length} reuni${meetingItems.length !== 1 ? 'ões' : 'ão'}` : ''}
          </span>
          <button className={styles.btnSecondary} type="button" onClick={onBack} disabled={saving}>
            Voltar
          </button>
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={handleCommit}
            disabled={saving || (items.length === 0 && meetingItems.length === 0)}
          >
            {saving ? 'Criando…' : 'Confirmar e criar'}
          </button>
        </div>
      </div>
    </div>
  );
}
