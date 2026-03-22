/**
 * infra/pipelineEmitter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @fileoverview EventEmitter em memória para streaming de pipeline
 * @description Map global jobId -> EventEmitter para comunicação entre
 * o run-all (produtor) e o stream-log SSE (consumidor).
 *
 * TODO: Em produção multi-instance, substituir por Redis Pub/Sub.
 * Funciona em single-instance (dev + deploy simples).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EventEmitter } = require('events');

/** @type {Map<string, EventEmitter>} */
const JOB_EMITTERS = new Map();

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Cria um emitter para um job e agenda limpeza após 1h.
 * @param {string} jobId
 * @returns {EventEmitter}
 */
function createJobEmitter(jobId) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(20);
  JOB_EMITTERS.set(jobId, emitter);
  // Auto-limpeza após 1 hora
  setTimeout(() => { JOB_EMITTERS.delete(jobId); }, 3600000);
  return emitter;
}

/**
 * Retorna o emitter de um job (ou null se não existir).
 * @param {string} jobId
 * @returns {EventEmitter|null}
 */
function getJobEmitter(jobId) {
  return JOB_EMITTERS.get(jobId) || null;
}

/**
 * Remove o emitter de um job.
 * @param {string} jobId
 */
function removeJobEmitter(jobId) {
  JOB_EMITTERS.delete(jobId);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { createJobEmitter, getJobEmitter, removeJobEmitter };
