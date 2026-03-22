/**
 * infra/constants.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Constantes compartilhadas entre backend e frontend.
 * Define os status, tipos de conteúdo e colunas do board Kanban.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Status do pipeline de conteúdo ──────────────────────────────────────────

/** @type {Array<{value: string, label: string, color: string}>} */
const CONTENT_STATUSES = [
  { value: 'idea', label: 'Ideia', color: '#9CA3AF' },
  { value: 'draft', label: 'Rascunho', color: '#F59E0B' },
  { value: 'approved', label: 'Aprovado', color: '#10B981' },
  { value: 'scheduled', label: 'Agendado', color: '#6366F1' },
  { value: 'published', label: 'Publicado', color: '#3B82F6' },
  { value: 'failed', label: 'Falhou', color: '#EF4444' },
];

// ─── Tipos de conteúdo Instagram ─────────────────────────────────────────────

/** @type {Array<{value: string, label: string, icon: string}>} */
const CONTENT_TYPES = [
  { value: 'post', label: 'Post', icon: 'Image' },
  { value: 'story', label: 'Story', icon: 'Circle' },
  { value: 'reel', label: 'Reel', icon: 'Film' },
  { value: 'carousel', label: 'Carrossel', icon: 'Layers' },
  { value: 'campaign', label: 'Campanha', icon: 'Megaphone' },
];

// ─── Colunas do Kanban ───────────────────────────────────────────────────────

/** @type {Array<{id: string, label: string, icon: string, color: string}>} */
const BOARD_COLUMNS = [
  { id: 'idea', label: 'Ideia', icon: 'Lightbulb', color: '#94A3B8' },
  { id: 'draft', label: 'Rascunho', icon: 'FileEdit', color: '#F59E0B' },
  { id: 'approved', label: 'Aprovado', icon: 'CheckCircle2', color: '#10B981' },
  { id: 'scheduled', label: 'Agendado', icon: 'Clock', color: '#6366F1' },
  { id: 'published', label: 'Publicado', icon: 'Send', color: '#8B5CF6' },
  { id: 'failed', label: 'Falhou', icon: 'AlertCircle', color: '#EF4444' },
];

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { CONTENT_STATUSES, CONTENT_TYPES, BOARD_COLUMNS };
