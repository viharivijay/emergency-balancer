'use strict';

const http = require('http');
const logger = require('../utils/logger');

const DEFAULTS = {
  interval: 5000,
  timeout: 2000,
  unhealthyThreshold: 3,
  healthyThreshold: 2,
  path: '/health',
  expectedStatus: 200,
};

/**
 * Periodically polls each backend's health endpoint and
 * updates the pool's health state accordingly.
 */
class HealthMonitor {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.config = { ...DEFAULTS, ...config };
    this._timers = new Map();
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.pool.all().forEach(b => this.watch(b));
    logger.info('Health monitor started', { interval: this.config.interval });
  }

  stop() {
    this._running = false;
    this._timers.forEach(t => clearInterval(t));
    this._timers.clear();
    logger.info('Health monitor stopped');
  }

  watch(backend) {
    if (this._timers.has(backend.id)) return;
    const timer = setInterval(() => this._check(backend), this.config.interval);
    this._timers.set(backend.id, timer);
    // Immediately run first check
    setImmediate(() => this._check(backend));
  }

  unwatch(backend) {
    const timer = this._timers.get(backend.id);
    if (timer) {
      clearInterval(timer);
      this._timers.delete(backend.id);
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    // Restart watchers with new interval
    const backends = this.pool.all();
    this._timers.forEach(t => clearInterval(t));
    this._timers.clear();
    backends.forEach(b => this.watch(b));
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _check(backend) {
    const startMs = Date.now();
    const options = {
      hostname: backend.host,
      port: backend.port,
      path: this.config.path,
      method: 'GET',
      timeout: this.config.timeout,
    };

    const req = http.request(options, (res) => {
      const latencyMs = Date.now() - startMs;
      if (res.statusCode === this.config.expectedStatus) {
        this._onSuccess(backend, latencyMs);
      } else {
        this._onFailure(backend, `HTTP ${res.statusCode}`);
      }
      // Drain response body
      res.resume();
    });

    req.on('timeout', () => {
      req.destroy();
      this._onFailure(backend, 'timeout');
    });

    req.on('error', (err) => {
      this._onFailure(backend, err.message);
    });

    req.end();
  }

  _onSuccess(backend, latencyMs) {
    backend.consecutiveSuccesses = (backend.consecutiveSuccesses || 0) + 1;
    backend.consecutiveFailures = 0;
    backend.lastLatencyMs = latencyMs;

    if (
      !backend.healthy &&
      backend.consecutiveSuccesses >= this.config.healthyThreshold
    ) {
      logger.info('Backend is healthy again', { id: backend.id, latencyMs });
      this.pool.markHealthy(backend);
    }
  }

  _onFailure(backend, reason) {
    backend.consecutiveFailures = (backend.consecutiveFailures || 0) + 1;
    backend.consecutiveSuccesses = 0;

    logger.warn('Health check failed', { id: backend.id, reason, failures: backend.consecutiveFailures });

    if (
      backend.healthy &&
      backend.consecutiveFailures >= this.config.unhealthyThreshold
    ) {
      logger.error('Backend marked unhealthy', { id: backend.id, reason });
      this.pool.markUnhealthy(backend);
    }
  }
}

module.exports = HealthMonitor;
