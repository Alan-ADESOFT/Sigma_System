/**
 * components/comercial/BulkActionBar.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Barra que aparece no topo do Kanban quando há cards selecionados.
 * Ações: mover, atribuir, WhatsApp em sequência, deletar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import styles from '../../assets/style/wonLostModals.module.css';
import ConfirmModal from './ConfirmModal';
import { useNotification } from '../../context/NotificationContext';

export default function BulkActionBar({
  selectedIds,
  columns = [],
  users = [],
  onClear,
  onChange,
  onSendWhatsApp,
}) {
  const { notify } = useNotification();
  const [openMenu, setOpenMenu] = useState(null); // 'move' | 'assign' | null
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (selectedIds.size === 0) return null;
  const ids = Array.from(selectedIds);

  async function bulkMove(columnId) {
    setBusy(true); setOpenMenu(null);
    try {
      const res = await fetch('/api/comercial/pipeline/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', leadIds: ids, payload: { columnId } }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      notify(`${j.processed} movidos${j.failed ? ` (${j.failed} falharam)` : ''}`, 'success');
      onChange?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setBusy(false); }
  }

  async function bulkAssign(userId) {
    setBusy(true); setOpenMenu(null);
    try {
      const res = await fetch('/api/comercial/pipeline/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', leadIds: ids, payload: { assignedTo: userId } }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      notify(`${j.processed} atribuídos`, 'success');
      onChange?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setBusy(false); }
  }

  async function bulkDelete() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      const res = await fetch('/api/comercial/pipeline/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', leadIds: ids }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      notify(`${j.processed} deletados`, 'success');
      onClear?.();
      onChange?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.bulkBar} ref={wrapRef}>
      <span><strong>{ids.length}</strong> lead{ids.length > 1 ? 's' : ''} selecionado{ids.length > 1 ? 's' : ''}</span>

      <div style={{ position: 'relative' }}>
        <button className={styles.bulkBtn} onClick={() => setOpenMenu(o => o === 'move' ? null : 'move')} disabled={busy}>
          Mover ▾
        </button>
        {openMenu === 'move' && (
          <div className={styles.dropdownPanel} style={{ marginTop: 6 }}>
            {columns.map(c => (
              <div key={c.id} className={styles.dropdownItem} onClick={() => bulkMove(c.id)}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button className={styles.bulkBtn} onClick={() => setOpenMenu(o => o === 'assign' ? null : 'assign')} disabled={busy}>
          Atribuir ▾
        </button>
        {openMenu === 'assign' && (
          <div className={styles.dropdownPanel} style={{ marginTop: 6 }}>
            <div className={styles.dropdownItem} onClick={() => bulkAssign(null)}>
              ○ Sem responsável
            </div>
            {users.map(u => (
              <div key={u.id} className={styles.dropdownItem} onClick={() => bulkAssign(u.id)}>
                ● {u.name}
              </div>
            ))}
            {users.length === 0 && (
              <div className={styles.dropdownItem} style={{ color: 'var(--text-muted)', cursor: 'default' }}>
                Nenhum usuário disponível
              </div>
            )}
          </div>
        )}
      </div>

      <button className={styles.bulkBtn} onClick={() => onSendWhatsApp?.(ids)} disabled={busy}>
        📨 WhatsApp
      </button>

      <div className={styles.spacer} />

      <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={() => setConfirmDelete(true)} disabled={busy}>
        🗑 Deletar
      </button>
      <button className={styles.bulkBtn} onClick={onClear} disabled={busy}>
        ✕ Limpar
      </button>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={bulkDelete}
        variant="danger"
        title={`Deletar ${ids.length} lead${ids.length !== 1 ? 's' : ''} do Pipeline?`}
        description="Os dados de origem (lista de captação, prospects, propostas) permanecem intactos. Apenas os cards do Kanban serão removidos. Essa ação não pode ser desfeita."
        confirmLabel={`Deletar ${ids.length}`}
        cancelLabel="Cancelar"
      />
    </div>
  );
}
