/**
 * @fileoverview Emitter global para acordar o image worker
 * @description Quando /api/image/generate cria um job, emite 'wakeup' aqui.
 * O worker em background escuta e processa imediatamente sem esperar o
 * próximo tick do polling — economiza latência em volumes baixos.
 *
 * Mesmo padrão do pipelineEmitter.js: ancorado em globalThis para sobreviver
 * a recompiles do Next em dev.
 */

const { EventEmitter } = require('events');

const EMITTER = globalThis.__SIGMA_IMAGE_EMITTER__
  || (globalThis.__SIGMA_IMAGE_EMITTER__ = new EventEmitter());

EMITTER.setMaxListeners(20);

/**
 * Notifica que um novo job foi enfileirado.
 * @param {string} jobId
 */
function notifyNewJob(jobId) {
  EMITTER.emit('wakeup', { jobId });
}

/**
 * Inscreve um listener para wakeup. Retorna função de unsubscribe.
 * @param {(payload:{jobId:string}) => void} fn
 */
function onWakeup(fn) {
  EMITTER.on('wakeup', fn);
  return () => EMITTER.off('wakeup', fn);
}

module.exports = { notifyNewJob, onWakeup };
