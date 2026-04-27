/**
 * components/comercial/KanbanColumn.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Coluna do Kanban — header + body com cards drop-target.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import styles from '../../assets/style/comercialKanban.module.css';
import KanbanCard from './KanbanCard';
import ConfirmModal from './ConfirmModal';
import { useNotification } from '../../context/NotificationContext';

export default function KanbanColumn({
  column, leads, isDropTarget, draggingId,
  onDragStart, onDragEnd, onDragOver, onDrop, onOpenLead, onColumnsChange,
  selectedIds, onToggleSelect,
}) {
  const { notify } = useNotification();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteLead, setConfirmDeleteLead] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function tryDelete() {
    setMenuOpen(false);
    if (column.is_system) {
      notify('Coluna do sistema não pode ser deletada', 'warning');
      return;
    }
    setConfirmOpen(true);
  }

  function tryBulkDeleteLeads() {
    setMenuOpen(false);
    if (leads.length === 0) {
      notify('Não há leads nessa coluna pra deletar', 'info');
      return;
    }
    setConfirmBulkDelete(true);
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/comercial/pipeline/columns/${column.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      notify('Coluna deletada', 'success');
      setConfirmOpen(false);
      onColumnsChange?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function handleBulkDeleteLeads() {
    setBulkDeleting(true);
    try {
      // Em lotes de até 50 (limite do endpoint bulk)
      const ids = leads.map(l => l.id);
      let processedTotal = 0;
      let failedTotal = 0;
      for (let i = 0; i < ids.length; i += 50) {
        const slice = ids.slice(i, i + 50);
        const res = await fetch('/api/comercial/pipeline/leads/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', leadIds: slice }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Falha ao deletar em massa');
        processedTotal += json.processed || 0;
        failedTotal   += json.failed    || 0;
      }
      notify(`${processedTotal} leads excluídos${failedTotal ? ` · ${failedTotal} falhas` : ''}`, 'success');
      setConfirmBulkDelete(false);
      onColumnsChange?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDeleteLead() {
    const lead = confirmDeleteLead;
    if (!lead) return;
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${lead.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      notify('Lead excluído', 'success');
      setConfirmDeleteLead(null);
      onColumnsChange?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <div className={styles.column}>
      <div className={styles.columnAccent} style={{ background: column.color }} />
      <div className={styles.columnHeader}>
        <span className={styles.columnName}>{column.name}</span>
        <span className={styles.columnCount}>{leads.length}</span>
        <button
          className={styles.columnMenu}
          onClick={() => setMenuOpen(v => !v)}
          title="Opções"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5"  r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 4 }}
            />
            <div style={{
              position: 'absolute', top: 36, right: 8, zIndex: 5,
              background: 'rgba(15,15,15,0.98)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              minWidth: 200,
              padding: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              <button onClick={tryBulkDeleteLeads}
                      disabled={leads.length === 0}
                      style={{
                        width: '100%', padding: '7px 10px', textAlign: 'left',
                        background: 'transparent', border: 'none',
                        color: leads.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                        cursor: leads.length === 0 ? 'not-allowed' : 'pointer',
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) => { if (leads.length > 0) e.currentTarget.style.background = 'rgba(255,0,51,0.06)'; }}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                Excluir todos os leads ({leads.length})
              </button>
              {!column.is_system && (
                <button onClick={tryDelete}
                        style={{
                          width: '100%', padding: '7px 10px', textAlign: 'left',
                          background: 'transparent', border: 'none',
                          color: 'var(--brand-400)',
                          fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                          cursor: 'pointer', borderRadius: 4,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,0,51,0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  Deletar coluna
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className={`${styles.columnBody} ${isDropTarget ? styles.dropTarget : ''}`}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {leads.map(l => (
          <KanbanCard
            key={l.id}
            lead={l}
            isDragging={draggingId === l.id}
            isSelected={selectedIds?.has(l.id)}
            onToggleSelect={onToggleSelect}
            onDragStart={() => onDragStart(l.id)}
            onDragEnd={onDragEnd}
            onClick={() => onOpenLead(l)}
            onDelete={(lead) => setConfirmDeleteLead(lead)}
          />
        ))}
        {leads.length === 0 && (
          <div className={styles.columnEmpty}>arraste leads aqui</div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        variant="danger"
        title={`Deletar "${column.name}"?`}
        description={`Os ${leads.length} lead${leads.length !== 1 ? 's' : ''} dessa coluna ${leads.length !== 1 ? 'serão movidos' : 'será movido'} automaticamente pra coluna de Pendente. Essa ação não pode ser desfeita.`}
        confirmLabel="Deletar coluna"
        cancelLabel="Cancelar"
      />

      <ConfirmModal
        open={confirmBulkDelete}
        onClose={() => !bulkDeleting && setConfirmBulkDelete(false)}
        onConfirm={handleBulkDeleteLeads}
        loading={bulkDeleting}
        variant="danger"
        title={`Excluir ${leads.length} lead${leads.length !== 1 ? 's' : ''} de "${column.name}"?`}
        description="Os leads serão removidos permanentemente do pipeline junto com suas atividades e análises. Essa ação não pode ser desfeita."
        warningTitle="Tem certeza que deseja excluir os leads de"
        warningHighlight={column.name}
        warningText={`${leads.length} lead${leads.length !== 1 ? 's' : ''} ${leads.length !== 1 ? 'serão excluídos' : 'será excluído'} junto com tudo o que está anexado a ${leads.length !== 1 ? 'eles' : 'ele'}.`}
        warningCascade="leads · activities · analyses · whatsapp_logs"
        confirmLabel={bulkDeleting ? 'Excluindo...' : `Excluir ${leads.length} lead${leads.length !== 1 ? 's' : ''}`}
        cancelLabel="Cancelar"
      />

      <ConfirmModal
        open={!!confirmDeleteLead}
        onClose={() => setConfirmDeleteLead(null)}
        onConfirm={handleDeleteLead}
        variant="danger"
        title={`Excluir lead "${confirmDeleteLead?.company_name || ''}"?`}
        description="Este lead será removido permanentemente, junto com suas atividades, análises IA e histórico de WhatsApp. Essa ação não pode ser desfeita."
        confirmLabel="Excluir lead"
        cancelLabel="Cancelar"
      />
    </div>
  );
}
