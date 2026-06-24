/**
 * models/ata.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Atas semanais como documento VIVO.
 *
 * Os afazeres ficam em `atas.afazeres` (JSONB, rascunho). Cada item:
 *   { id, client_id, category_id, description, assigned_to, due_date, next_week, task_id }
 *
 * Ao DISTRIBUIR, cada afazer (com responsável, não "próxima semana", ainda sem
 * task) vira uma client_tasks real (linkada via client_tasks.ata_id) e o id da
 * task é gravado de volta no afazer. A partir daí a ata mostra o status AO VIVO
 * puxando de client_tasks (getAtaWithStatus). Carryover traz pra semana nova os
 * afazeres não-concluídos + os marcados "próxima semana".
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { query, queryOne } = require('../infra/db');
const taskModel = require('./task.model');

function afazerId() {
  return 'af_' + crypto.randomUUID().slice(0, 8);
}

function normalizeSubtasks(arr) {
  if (typeof arr === 'string') { try { arr = JSON.parse(arr || '[]'); } catch { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => (typeof s === 'string'
      ? { title: s.trim(), done: false }
      : { title: String(s?.title || '').trim(), done: Boolean(s?.done) }))
    .filter((s) => s.title);
}

function normalizeAfazer(a = {}) {
  return {
    id: a.id || afazerId(),
    client_id: a.client_id || null,
    category_id: a.category_id || null,
    description: (a.description != null ? String(a.description) : '').trim(),
    assigned_to: a.assigned_to || null,
    due_date: a.due_date || null,           // 'YYYY-MM-DD' (o dia já resolvido)
    next_week: Boolean(a.next_week),
    task_id: a.task_id || null,
    subtasks: normalizeSubtasks(a.subtasks),
    subtasks_required: Boolean(a.subtasks_required),
  };
}

async function listAtas(tenantId) {
  // afazer_count = total de afazeres; afazer_done_count = afazeres cuja task está
  // concluída (pra barra de %). CASE protege atas legadas com afazeres não-array.
  return query(
    `SELECT a.id, a.title, a.reference_week, a.week_number, a.status,
            a.distributed_at, a.created_at, a.updated_at,
            COALESCE((SELECT count(*)::int FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(a.afazeres) = 'array' THEN a.afazeres ELSE '[]'::jsonb END) e), 0) AS afazer_count,
            COALESCE((SELECT count(*)::int FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(a.afazeres) = 'array' THEN a.afazeres ELSE '[]'::jsonb END) e
               JOIN client_tasks t ON t.id = (e->>'task_id')
              WHERE t.tenant_id = $1 AND t.status = 'done'), 0) AS afazer_done_count
       FROM atas a
      WHERE a.tenant_id = $1
      ORDER BY a.reference_week DESC NULLS LAST, a.created_at DESC`,
    [tenantId]
  );
}

async function getAta(id, tenantId) {
  return queryOne(`SELECT * FROM atas WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

/** Ata + status ao vivo: anexa task_status a cada afazer que já virou task. */
async function getAtaWithStatus(id, tenantId) {
  const ata = await getAta(id, tenantId);
  if (!ata) return null;
  const tasks = await query(
    `SELECT id, status, subtasks, subtasks_required FROM client_tasks WHERE ata_id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  const byId = {};
  for (const t of tasks) byId[t.id] = t;
  const afazeres = (Array.isArray(ata.afazeres) ? ata.afazeres : []).map((a) => {
    const t = a.task_id ? byId[a.task_id] : null;
    return {
      ...a,
      task_status: t ? t.status : null,
      // Após distribuir, a VERDADE das subtarefas é a task (não o JSONB congelado).
      subtasks: t ? normalizeSubtasks(t.subtasks) : a.subtasks,
      subtasks_required: t ? Boolean(t.subtasks_required) : a.subtasks_required,
    };
  });
  return { ...ata, afazeres };
}

async function createAta(tenantId, data = {}, createdBy = null) {
  const afazeres = Array.isArray(data.afazeres) ? data.afazeres.map(normalizeAfazer) : [];
  return queryOne(
    `INSERT INTO atas
       (tenant_id, title, reference_week, week_number, meeting_date,
        meeting_time, responsible, participants, afazeres, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
     RETURNING *`,
    [
      tenantId, (data.title || 'Ata semanal').trim(),
      data.reference_week || null, data.week_number || null, data.meeting_date || null,
      data.meeting_time || null, data.responsible || null,
      JSON.stringify(data.participants || []), JSON.stringify(afazeres),
      data.notes || null, createdBy || null,
    ]
  );
}

/** Atualiza o cabeçalho + afazeres (rascunho). O editor manda o objeto completo. */
async function updateAta(id, tenantId, patch = {}) {
  let afazeresJson = null;
  if (patch.afazeres !== undefined) {
    const incoming = (patch.afazeres || []).map(normalizeAfazer);
    // task_id é VERDADE DO SERVIDOR (gravado na distribuição). Preserva por id
    // pra um PUT com estado local desatualizado não apagar o vínculo nem causar
    // redistribuição duplicada (corrida autosave × auto-distribuição).
    const cur = await queryOne(`SELECT afazeres FROM atas WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    const curArr = Array.isArray(cur?.afazeres) ? cur.afazeres : [];
    const taskById = {};
    for (const a of curArr) { if (a && a.id && a.task_id) taskById[a.id] = a.task_id; }
    for (const a of incoming) { if (!a.task_id && taskById[a.id]) a.task_id = taskById[a.id]; }
    afazeresJson = JSON.stringify(incoming);
  }
  return queryOne(
    `UPDATE atas SET
       title          = COALESCE($3, title),
       reference_week = $4,
       week_number    = $5,
       meeting_date   = $6,
       meeting_time   = COALESCE($7, meeting_time),
       responsible    = COALESCE($8, responsible),
       participants   = COALESCE($9::jsonb, participants),
       afazeres       = COALESCE($10::jsonb, afazeres),
       notes          = $11,
       updated_at     = now()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      id, tenantId,
      patch.title != null ? String(patch.title).trim() : null,
      patch.reference_week ?? null, patch.week_number ?? null,
      patch.meeting_date ?? null, patch.meeting_time ?? null, patch.responsible ?? null,
      patch.participants !== undefined ? JSON.stringify(patch.participants) : null,
      afazeresJson, patch.notes ?? null,
    ]
  );
}

async function deleteAta(id, tenantId) {
  // Tasks linkadas ficam com ata_id = NULL (ON DELETE SET NULL) — não some o histórico.
  return queryOne(`DELETE FROM atas WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]);
}

/**
 * Distribui: cada afazer com responsável, não "próxima semana" e ainda sem task
 * vira uma client_tasks real (ata_id setado). Grava o task_id de volta no afazer.
 */
async function distributeAta(id, tenantId, userId = null) {
  const ata = await getAta(id, tenantId);
  if (!ata) throw new Error('Ata não encontrada');

  const afazeres = Array.isArray(ata.afazeres) ? ata.afazeres : [];
  const isCandidate = (a) => a && a.description && String(a.description).trim() && a.assigned_to && !a.next_week && !a.task_id;

  const items = afazeres.filter(isCandidate).map((a) => ({
    title: String(a.description).trim(),
    description: null,
    client_id: a.client_id || null,
    category_id: a.category_id || null,
    assigned_to: a.assigned_to,
    priority: 'normal',
    due_date: a.due_date || null,
    status: 'pending',
    created_by: userId || null,
    ata_id: id,
    subtasks: normalizeSubtasks(a.subtasks),
    subtasks_required: Boolean(a.subtasks_required),
  }));

  const { created, failed } = items.length
    ? await taskModel.createMany(items, tenantId)
    : { created: [], failed: [] };

  // Grava task_id de volta (createMany preserva a ordem dos itens válidos, e todos
  // os nossos candidatos têm title+assigned_to, então o índice casa 1:1).
  let ci = 0;
  const newAfazeres = afazeres.map((a) => {
    if (isCandidate(a)) {
      const t = created[ci++];
      return t ? { ...a, task_id: t.id } : a;
    }
    return a;
  });

  await query(
    `UPDATE atas SET afazeres = $3::jsonb, status = 'distributed',
            distributed_at = COALESCE(distributed_at, now()), updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, JSON.stringify(newAfazeres)]
  );

  return { distributed: created.length, failed: (failed || []).length, created };
}

/**
 * Carryover: afazeres da ata anterior (a mais recente, ou a `sourceAtaId`) que
 * estão "próxima semana" OU cuja task não está concluída. Volta como rascunho
 * (task_id e next_week zerados; due_date limpo pra você redefinir o dia).
 */
async function getCarryover(tenantId, sourceAtaId = null) {
  const source = sourceAtaId
    ? await getAta(sourceAtaId, tenantId)
    : await queryOne(
        `SELECT id FROM atas WHERE tenant_id = $1 ORDER BY reference_week DESC NULLS LAST, created_at DESC LIMIT 1`,
        [tenantId]
      );
  if (!source) return [];

  const withStatus = await getAtaWithStatus(source.id, tenantId);
  const carried = [];
  for (const a of (withStatus.afazeres || [])) {
    const incomplete = a.task_id ? (a.task_status && a.task_status !== 'done') : false;
    if (a.next_week || incomplete) {
      carried.push(normalizeAfazer({
        client_id: a.client_id, category_id: a.category_id,
        description: a.description, assigned_to: a.assigned_to,
        due_date: null, next_week: false, task_id: null,
        subtasks: (a.subtasks || []).map((s) => ({ title: typeof s === 'string' ? s : s.title, done: false })),
        subtasks_required: a.subtasks_required,
      }));
    }
  }
  return carried;
}

module.exports = {
  listAtas,
  getAta,
  getAtaWithStatus,
  createAta,
  updateAta,
  deleteAta,
  distributeAta,
  getCarryover,
  normalizeAfazer,
};
