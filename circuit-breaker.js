'use strict';

const EventEmitter = require('events');
const logger = require('../utils/logger');

const STATES = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' };

const DEFAULTS = {
  enabled: true,
  threshold: 50,        // % error rate to open circuit
  windowSize: 10,       // number of requests in sliding window
  resetTimeout: 30_000, // ms before half-open probe
  halfOpenRequests: 3,  // probe requests before closing
};

/**
 * Per-backend circuit breaker using a sliding window error-rate approach.
 *
 * State machine:
 *   CLOSED ──(error rate > threshold)──▶ OPEN
 *   OPEN   ──(resetTimeout elapsed)───▶ HALF_OPEN
 *   HALF_OPEN ──(probes succeed)──────▶ CLOSED
 *   HALF_OPEN ──(probe fails)──────────▶ OPEN
 */
class CircuitBreaker extends EventEmitter {
  constructor(pool, config = {}) {
    super();
    this.pool = pool;
    this.config = { ...DEFAULTS, ...config };
    this._states = new Map();   // backendId → { state, window, timer }
    this._resetTimers = new Map();
  }

  start() {
    if (!this.config.enabled) return;
    this.pool.all().forEach(b => this._init(b));
    logger.info('Circuit breaker started');
  }

  stop() {
    this._resetTimers.forEach(t => clearTimeout(t));
    this._resetTimers.clear();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  isOpen(backend) {
    if (!this.config.enabled) return false;
    const s = this._get(backend);
    return s.state === STATES.OPEN;
  }

  record(backend, statusCode) {
    if (!this.config.enabled) return;
    const s = this._get(backend);
    if (s.state === STATES.OPEN) return;

    const isError = statusCode >= 500 || statusCode === 0;
    s.window.push(isError ? 1 : 0);
    if (s.window.length > this.config.windowSize) s.window.shift();

    if (s.state === STATES.HALF_OPEN) {
      this._handleHalfOpenResult(backend, s, isError);
      return;
    }

    const errorRate = this._errorRate(s.window);
    if (errorRate >= this.config.threshold && s.window.length >= this.config.windowSize) {
      this._open(backend, s);
    }
  }

  close(backend) {
    const s = this._get(backend);
    this._close(backend, s);
  }

  // ─── Transitions ───────────────────────────────────────────────────────────

  _open(backend, s) {
    s.state = STATES.OPEN;
    s.window = [];
    logger.warn('Circuit OPEN', { id: backend.id });
    this.emit('open', backend);

    const timer = setTimeout(() => this._halfOpen(backend), this.config.resetTimeout);
    this._resetTimers.set(backend.id, timer);
  }

  _halfOpen(backend) {
    const s = this._get(backend);
    s.state = STATES.HALF_OPEN;
    s.probeCount = 0;
    s.probeSuccesses = 0;
    logger.info('Circuit HALF-OPEN — probing', { id: backend.id });
    this.emit('half-open', backend);
  }

  _close(backend, s) {
    s.state = STATES.CLOSED;
    s.window = [];
    const timer = this._resetTimers.get(backend.id);
    if (timer) { clearTimeout(timer); this._resetTimers.delete(backend.id); }
    logger.info('Circuit CLOSED', { id: backend.id });
    this.emit('closed', backend);
  }

  _handleHalfOpenResult(backend, s, isError) {
    s.probeCount = (s.probeCount || 0) + 1;
    if (!isError) s.probeSuccesses = (s.probeSuccesses || 0) + 1;

    if (isError) {
      this._open(backend, s);
    } else if (s.probeSuccesses >= this.config.halfOpenRequests) {
      this._close(backend, s);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _init(backend) {
    this._states.set(backend.id, { state: STATES.CLOSED, window: [], probeCount: 0, probeSuccesses: 0 });
  }

  _get(backend) {
    if (!this._states.has(backend.id)) this._init(backend);
    return this._states.get(backend.id);
  }

  _errorRate(window) {
    if (window.length === 0) return 0;
    const errors = window.reduce((s, v) => s + v, 0);
    return (errors / window.length) * 100;
  }
}

module.exports = CircuitBreaker;
