async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = require('../models/scheduler.service');
    startScheduler();
  }
}

module.exports = { register };
