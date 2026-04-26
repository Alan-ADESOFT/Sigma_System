/**
 * components/comercial/KanbanBoard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline Kanban com drag-and-drop nativo HTML5 (sem dep externa).
 * Optimistic UI: move imediato, rollback em erro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import styles from '../../assets/style/comercialKanban.module.css';
import KanbanColumn from './KanbanColumn';
import { useNotification } from '../../context/NotificationContext';

export default function KanbanBoard({ columns, leads, onLeadsChange, onOpenLead, onColumnsChange, selectedIds, onToggleSelect }) {
  const { notify } = useNotification();
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  function handleDragStart(leadId) {
    setDraggingId(leadId);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
  }
  function handleDragOverColumn(columnId, e) {
    e.preventDefault();
    if (dropTargetId !== columnId) setDropTargetId(columnId);
  }

  async function handleDropOnColumn(columnId) {
    if (!draggingId) return;
    const lead = leads.find(l => l.id === draggingId);
    if (!lead) return;
    if (lead.column_id === columnId) {
      handleDragEnd();
      return;
    }

    // Optimistic update
    const prevColumnId = lead.column_id;
    const optimistic = leads.map(l => l.id === draggingId
      ? { ...l, column_id: columnId, last_activity_at: new Date().toISOString() }
      : l);
    onLeadsChange(optimistic);
    handleDragEnd();

    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${draggingId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha ao mover');
    } catch (err) {
      // rollback
      const rolled = leads.map(l => l.id === draggingId ? { ...l, column_id: prevColumnId } : l);
      onLeadsChange(rolled);
      notify(err.message || 'Falha ao mover lead', 'error');
    }
  }

  return (
    <div className={styles.board}>
      {columns.map(col => (
        <KanbanColumn
          key={col.id}
          column={col}
          leads={leads.filter(l => l.column_id === col.id)}
          isDropTarget={dropTargetId === col.id}
          draggingId={draggingId}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverColumn(col.id, e)}
          onDrop={() => handleDropOnColumn(col.id)}
          onOpenLead={onOpenLead}
          onColumnsChange={onColumnsChange}
        />
      ))}
    </div>
  );
}
