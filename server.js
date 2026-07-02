'use strict';

const EmergencyBalancer = require('./balancer');
const logger = require('../utils/logger');

// ── Example configuration (replace with your own or load from file) ───────────
const balancer = new EmergencyBalancer({
  port: Number(process.env.EB_PORT) || 8080,
  strategy: process.env.EB_STRATEGY || 'round-robin',

  backends: [
    { host: process.env.BACKEND_1_HOST || 'localhost', port: Number(process.env.BACKEND_1_PORT) || 3001 },
    { host: process.env.BACKEND_2_HOST || 'localhost', port: Number(process.env.BACKEND_2_PORT) || 3002 },
    { host: process.env.BACKEND_3_HOST || 'localhost', port: Number(process.env.BACKEND_3_PORT) || 3003, standby: true },
  ],

  health: { interval: 5000, path: '/health' },
  circuitBreaker: { enabled: true, threshold: 50 },
  rateLimit: { enabled: false },
});

// ── Event listeners ──────────────────────────────────────────────────────────
balancer.on('emergency', (event) => {
  logger.error('🚨 EMERGENCY MODE', event);
  // Hook in your alerting here: PagerDuty, Slack, etc.
});

balancer.on('recovery', () => {
  logger.info('✅ System recovered from emergency mode');
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  try {
    await balancer.stop(30_000);
    process.exit(0);
  } catch (err) {
    logger.error('Shutdown error', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  // Stay alive — let the process supervisor decide what to do
});

// ── Start ─────────────────────────────────────────────────────────────────────
balancer.start().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
