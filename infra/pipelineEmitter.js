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

/**
 * @type {Map<string, EventEmitter>}
 *
 * Em Next.js dev, cada vez que uma rota é compilada o webpack-internal
 * recarrega os módulos em um novo contexto. Isso faria o Map ser uma
 * instância nova, perdendo todos os emitters criados em outras rotas
 * (sintoma: "Job não encontrado" em SSE imediatamente após criar o job).
 *
 * Solução: ancorar o Map em globalThis, que é compartilhado entre
 * recompiles. Em produção (build), o módulo é singleton de qualquer
 * forma, então o globalThis é apenas um no-op.
 */
const JOB_EMITTERS = globalThis.__SIGMA_JOB_EMITTERS__
  || (globalThis.__SIGMA_JOB_EMITTERS__ = new Map());

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
