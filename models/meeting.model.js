const db = require('../infra/db');

async function createMeeting(data, tenantId) {
  const {
    title, description, meeting_date, start_time, end_time,
    client_id, participants, status, meet_link, obs, created_by
  } = data;

  return db.queryOne(
    `INSERT INTO meetings
       (tenant_id, title, description, meeting_date, start_time, end_time,
        client_id, participants, status, meet_link, obs, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      tenantId, title, description, meeting_date, start_time, end_time,
      client_id, participants, status, meet_link, obs, created_by
    ]
  );
}

async function getMeetings(tenantId, filters = {}) {
  const params = [tenantId];
  let where = 'm.tenant_id = $1';
  let idx = 2;

  if (filters.dateFrom) {
    where += ` AND m.meeting_date >= $${idx}`;
    params.push(filters.dateFrom);
    idx++;
  }
  if (filters.dateTo) {
    where += ` AND m.meeting_date <= $${idx}`;
    params.push(filters.dateTo);
    idx++;
  }
  if (filters.clientId) {
    where += ` AND m.client_id = $${idx}`;
    params.push(filters.clientId);
    idx++;
  }

  return db.query(
    `SELECT m.*, mc.company_name AS client_name
     FROM meetings m
     LEFT JOIN marketing_clients mc ON mc.id = m.client_id
     WHERE ${where}
     ORDER BY m.meeting_date ASC, m.start_time ASC`,
    params
  );
}

async function getMeetingById(id, tenantId) {
  return db.queryOne(
    `SELECT m.*, mc.company_name AS client_name
     FROM meetings m
     LEFT JOIN marketing_clients mc ON mc.id = m.client_id
     WHERE m.id = $1 AND m.tenant_id = $2`,
    [id, tenantId]
  );
}

async function updateMeeting(id, data, tenantId) {
  const {
    title, description, meeting_date, start_time, end_time,
    client_id, participants, status, meet_link, obs
  } = data;

  return db.queryOne(
    `UPDATE meetings
     SET title       = COALESCE($3, title),
         description = COALESCE($4, description),
         meeting_date = COALESCE($5, meeting_date),
         start_time  = COALESCE($6, start_time),
         end_time    = $7,
         client_id   = $8,
         participants = COALESCE($9, participants),
         status      = COALESCE($10, status),
         meet_link   = $11,
         obs         = $12
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      id, tenantId, title, description, meeting_date, start_time,
      end_time, client_id, participants, status, meet_link, obs
    ]
  );
}

async function deleteMeeting(id, tenantId) {
  return db.queryOne(
    `DELETE FROM meetings WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

async function getMeetingsToday(tenantId) {
  return db.query(
    `SELECT m.*, mc.company_name AS client_name
     FROM meetings m
     LEFT JOIN marketing_clients mc ON mc.id = m.client_id
     WHERE m.tenant_id = $1
       AND m.meeting_date = CURRENT_DATE
       AND m.status = 'scheduled'
     ORDER BY m.start_time ASC`,
    [tenantId]
  );
}

async function getMeetingsByParticipant(userId, tenantId) {
  return db.query(
    `SELECT * FROM meetings
     WHERE tenant_id = $1
       AND $2 = ANY(participants)
       AND meeting_date >= CURRENT_DATE
     ORDER BY meeting_date ASC, start_time ASC`,
    [tenantId, userId]
  );
}

module.exports = {
  createMeeting,
  getMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  getMeetingsToday,
  getMeetingsByParticipant
};
