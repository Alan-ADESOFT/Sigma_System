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

  async function handleCommit() {
    if (items.length === 0) {
      notify('Adicione ao menos uma tarefa para criar', 'warning');
      return;
    }
    const invalid = items.filter((t) => !t.title?.trim() || !t.assigned_to || !t.due_date);
    if (invalid.length > 0) {
      notify(`${invalid.length} tarefa(s) sem título, responsável ou data — corrija antes de salvar`, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = items.map(({ _localId, ...rest }) => rest);
      const res = await fetch('/api/tasks/bulk-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: payload }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao salvar');

      const failedCount = data.failed?.length || 0;
      if (failedCount > 0) {
        notify(`${data.created} criada(s), ${failedCount} falharam`, 'warning');
      } else {
        notify(`${data.created} tarefa(s) criada(s) com sucesso`, 'success');
      }
      console.log('[SUCESSO][bulkImport/preview] commit', { created: data.created, failed: failedCount });
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
            <h2 className={styles.headerTitle}>Revisar tarefas — Importação em massa</h2>
            <div className={styles.headerSubtitle}>
              {meta?.model ? `Geradas via ${meta.model}` : 'Confira e edite antes de criar'}
            </div>
          </div>
          <button className={styles.closeBtn} type="button" onClick={onClose} title="Fechar">
            <IconClose />
          </button>
        </div>

        <div className={styles.body}>
          {warnings && warnings.length > 0 && (
            <div className={styles.warnings}>
              <div className={styles.warningsTitle}>// Avisos da IA</div>
              <ul className={styles.warningsList}>
                {warnings.map((w, i) => <li key={i}>· {w}</li>)}
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
                <div key={t._localId} className={styles.previewRow}>
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
        </div>

        <div className={styles.footer}>
          <span className={styles.footerCount}>
            {items.length} tarefa{items.length !== 1 ? 's' : ''} {items.length === 1 ? 'será' : 'serão'} criada{items.length !== 1 ? 's' : ''}
          </span>
          <button className={styles.btnSecondary} type="button" onClick={onBack} disabled={saving}>
            Voltar
          </button>
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={handleCommit}
            disabled={saving || items.length === 0}
          >
            {saving ? 'Criando…' : 'Confirmar e criar'}
          </button>
        </div>
      </div>
    </div>
  );
}
