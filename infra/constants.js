// Status do pipeline de conteudo
const CONTENT_STATUSES = [
  { value: 'idea', label: 'Ideia', color: '#9CA3AF' },
  { value: 'draft', label: 'Rascunho', color: '#F59E0B' },
  { value: 'approved', label: 'Aprovado', color: '#10B981' },
  { value: 'scheduled', label: 'Agendado', color: '#6366F1' },
  { value: 'published', label: 'Publicado', color: '#3B82F6' },
  { value: 'failed', label: 'Falhou', color: '#EF4444' },
];

// Tipos de conteudo Instagram
const CONTENT_TYPES = [
  { value: 'post', label: 'Post', icon: 'Image' },
  { value: 'story', label: 'Story', icon: 'Circle' },
  { value: 'reel', label: 'Reel', icon: 'Film' },
  { value: 'carousel', label: 'Carrossel', icon: 'Layers' },
  { value: 'campaign', label: 'Campanha', icon: 'Megaphone' },
];

// Colunas do Kanban
const BOARD_COLUMNS = [
  { id: 'idea', label: 'Ideia', icon: 'Lightbulb', color: '#94A3B8' },
  { id: 'draft', label: 'Rascunho', icon: 'FileEdit', color: '#F59E0B' },
  { id: 'approved', label: 'Aprovado', icon: 'CheckCircle2', color: '#10B981' },
  { id: 'scheduled', label: 'Agendado', icon: 'Clock', color: '#6366F1' },
  { id: 'published', label: 'Publicado', icon: 'Send', color: '#8B5CF6' },
  { id: 'failed', label: 'Falhou', icon: 'AlertCircle', color: '#EF4444' },
];

module.exports = { CONTENT_STATUSES, CONTENT_TYPES, BOARD_COLUMNS };
