/**
 * models/support.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD da Central de Suporte — tutoriais internos do time.
 *
 * Hierarquia: support_modules → support_lessons → support_media.
 *
 * Toda função aceita tenantId e filtra `WHERE tenant_id = $X`. Isolamento total
 * entre tenants — nenhuma query atravessa workspace.
 *
 * `getModuleFull` faz 2 queries (módulo+aulas e mídias) e monta a estrutura
 * aninhada em JS. Evita N+1 com LEFT JOIN gigante embaralhando colunas
 * (que é pior de manter do que 2 selects).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

/* ═══════════════════════════════════════════════════════════════════════════
   MODULES
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Lista todos os módulos do tenant ordenados por sort_order, created_at.
 * Inclui contagem de aulas via subquery (uma query, sem N+1).
 */
async function getAllModules(tenantId) {
  return query(
    `SELECT
        m.*,
        COALESCE((
          SELECT COUNT(*)::int FROM support_lessons l
            WHERE l.module_id = m.id
        ), 0) AS lesson_count
      FROM support_modules m
     WHERE m.tenant_id = $1
     ORDER BY m.sort_order ASC, m.created_at ASC`,
    [tenantId]
  );
}

async function getModuleById(id, tenantId) {
  return queryOne(
    `SELECT * FROM support_modules WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

/**
 * Detalhe completo do módulo: módulo + aulas (ordenadas) com vídeos e
 * anexos de cada aula (também ordenados).
 *
 * Estratégia: 2 queries (módulo+aulas em uma, mídias em outra filtradas pelos
 * lesson_ids). Monta a árvore em JS — facilita debug e mantém SQL legível.
 */
async function getModuleFull(moduleId, tenantId) {
  const moduleRow = await getModuleById(moduleId, tenantId);
  if (!moduleRow) return null;

  const lessons = await query(
    `SELECT * FROM support_lessons
      WHERE module_id = $1 AND tenant_id = $2
      ORDER BY sort_order ASC, created_at ASC`,
    [moduleId, tenantId]
  );

  if (lessons.length === 0) {
    return { ...moduleRow, lessons: [] };
  }

  const lessonIds = lessons.map((l) => l.id);
  // Postgres + driver Neon aceita array via ANY($1::text[])
  const mediaRows = await query(
    `SELECT * FROM support_media
      WHERE tenant_id = $1 AND lesson_id = ANY($2::text[])
      ORDER BY sort_order ASC, created_at ASC`,
    [tenantId, lessonIds]
  );

  // Agrupa mídias por lesson_id e quebra em videos vs attachments
  const byLesson = new Map(lessonIds.map((id) => [id, { videos: [], attachments: [] }]));
  for (const m of mediaRows) {
    const bucket = byLesson.get(m.lesson_id);
    if (!bucket) continue;
    (m.kind === 'video' ? bucket.videos : bucket.attachments).push(m);
  }

  return {
    ...moduleRow,
    lessons: lessons.map((l) => ({
      ...l,
      videos: byLesson.get(l.id)?.videos || [],
      attachments: byLesson.get(l.id)?.attachments || [],
    })),
  };
}

async function createModule(data, tenantId, createdBy) {
  const { title, description, icon, sort_order } = data || {};
  return queryOne(
    `INSERT INTO support_modules
       (tenant_id, title, description, icon, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      String(title || '').trim(),
      description ? String(description).trim() : null,
      icon || 'book',
      Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
      createdBy || null,
    ]
  );
}

async function updateModule(id, data, tenantId) {
  return queryOne(
    `UPDATE support_modules
        SET title       = COALESCE($3, title),
            description = COALESCE($4, description),
            icon        = COALESCE($5, icon),
            sort_order  = COALESCE($6, sort_order)
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      id, tenantId,
      data.title !== undefined ? String(data.title || '').trim() : null,
      data.description !== undefined ? (data.description ? String(data.description).trim() : null) : null,
      data.icon !== undefined ? data.icon : null,
      data.sort_order !== undefined && Number.isFinite(Number(data.sort_order))
        ? Number(data.sort_order)
        : null,
    ]
  );
}

async function deleteModule(id, tenantId) {
  return queryOne(
    `DELETE FROM support_modules WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LESSONS
═══════════════════════════════════════════════════════════════════════════ */

async function getLessonById(id, tenantId) {
  return queryOne(
    `SELECT * FROM support_lessons WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createLesson(data, tenantId, createdBy) {
  const { module_id, title, description, sort_order } = data || {};
  return queryOne(
    `INSERT INTO support_lessons
       (tenant_id, module_id, title, description, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      module_id,
      String(title || '').trim(),
      description ? String(description).trim() : null,
      Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
      createdBy || null,
    ]
  );
}

async function updateLesson(id, data, tenantId) {
  return queryOne(
    `UPDATE support_lessons
        SET title       = COALESCE($3, title),
            description = COALESCE($4, description),
            sort_order  = COALESCE($5, sort_order)
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      id, tenantId,
      data.title !== undefined ? String(data.title || '').trim() : null,
      data.description !== undefined ? (data.description ? String(data.description).trim() : null) : null,
      data.sort_order !== undefined && Number.isFinite(Number(data.sort_order))
        ? Number(data.sort_order)
        : null,
    ]
  );
}

async function deleteLesson(id, tenantId) {
  return queryOne(
    `DELETE FROM support_lessons WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEDIA
═══════════════════════════════════════════════════════════════════════════ */

async function getMediaById(id, tenantId) {
  return queryOne(
    `SELECT * FROM support_media WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createMedia(data, tenantId, createdBy) {
  const {
    lesson_id, kind, title, description,
    file_url, file_name, file_size_bytes, mime_type, sort_order,
  } = data || {};
  if (kind !== 'video' && kind !== 'attachment') {
    throw new Error(`kind inválido: ${kind}. Use 'video' ou 'attachment'.`);
  }
  if (!file_url) throw new Error('file_url obrigatório');

  return queryOne(
    `INSERT INTO support_media
       (tenant_id, lesson_id, kind, title, description,
        file_url, file_name, file_size_bytes, mime_type, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      tenantId, lesson_id, kind,
      title ? String(title).trim() : null,
      description ? String(description).trim() : null,
      String(file_url).trim(),
      file_name ? String(file_name).trim() : null,
      Number.isFinite(Number(file_size_bytes)) ? Number(file_size_bytes) : null,
      mime_type ? String(mime_type).trim() : null,
      Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
      createdBy || null,
    ]
  );
}

async function updateMedia(id, data, tenantId) {
  // Trocar arquivo NÃO é suportado aqui — deletar e recriar é o caminho.
  return queryOne(
    `UPDATE support_media
        SET title       = COALESCE($3, title),
            description = COALESCE($4, description),
            sort_order  = COALESCE($5, sort_order)
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      id, tenantId,
      data.title !== undefined ? (data.title ? String(data.title).trim() : null) : null,
      data.description !== undefined ? (data.description ? String(data.description).trim() : null) : null,
      data.sort_order !== undefined && Number.isFinite(Number(data.sort_order))
        ? Number(data.sort_order)
        : null,
    ]
  );
}

async function deleteMedia(id, tenantId) {
  // NOTA: apenas remove do banco. Arquivo físico fica órfão em public/uploads/
  // — dívida técnica documentada no README (sprint futuro de GC).
  return queryOne(
    `DELETE FROM support_media WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OWNERSHIP VALIDATORS — usados nos endpoints pra validar antes de mutar
═══════════════════════════════════════════════════════════════════════════ */

async function isModuleOfTenant(moduleId, tenantId) {
  const row = await queryOne(
    `SELECT 1 FROM support_modules WHERE id = $1 AND tenant_id = $2`,
    [moduleId, tenantId]
  );
  return !!row;
}

async function isLessonOfTenant(lessonId, tenantId) {
  const row = await queryOne(
    `SELECT 1 FROM support_lessons WHERE id = $1 AND tenant_id = $2`,
    [lessonId, tenantId]
  );
  return !!row;
}

module.exports = {
  // modules
  getAllModules, getModuleById, getModuleFull,
  createModule, updateModule, deleteModule,
  // lessons
  getLessonById, createLesson, updateLesson, deleteLesson,
  // media
  getMediaById, createMedia, updateMedia, deleteMedia,
  // validators
  isModuleOfTenant, isLessonOfTenant,
};
