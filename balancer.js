'use strict';

const EventEmitter = require('events');
const BackendPool = require('../health/backend-pool');
const HealthMonitor = require('../health/monitor');
const CircuitBreaker = require('../health/circuit-breaker');
const ProxyEngine = require('./proxy');
const RateLimiter = require('../middleware/rate-limiter');
const StickySession = require('../middleware/sticky-session');
const Metrics = require('../middleware/metrics');
const StrategyFactory = require('../strategies');
const logger = require('../utils/logger');
const { mergeConfig } = require('../utils/config');

/**
 * EmergencyBalancer — core orchestrator.
 * Wires together backends, health monitoring, circuit breaking,
 * load-balancing strategy, and the HTTP proxy engine.
 */
class EmergencyBalancer extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number}   options.port              - Port to listen on (default: 8080)
   * @param {string}   options.strategy          - Load balancing strategy name
   * @param {Object[]} options.backends          - List of backend descriptors
   * @param {Object}   [options.health]          - Health-check config
   * @param {Object}   [options.circuitBreaker]  - Circuit-breaker config
   * @param {Object}   [options.rateLimit]       - Rate-limiting config
   * @param {Object}   [options.sticky]          - Sticky-session config
   * @param {Object}   [options.metrics]         - Metrics/observability config
   */
  constructor(options = {}) {
    super();
    this.config = mergeConfig(options);
    this._emergencyMode = false;
    this._initialized = false;

    // Core subsystems — created eagerly, started lazily
    this.pool = new BackendPool(this.config.backends);
    this.strategy = StrategyFactory.create(this.config.strategy, this.pool);
    this.healthMonitor = new HealthMonitor(this.pool, this.config.health);
    this.circuitBreaker = new CircuitBreaker(this.pool, this.config.circuitBreaker);
    this.rateLimiter = new RateLimiter(this.config.rateLimit);
    this.stickySession = new StickySession(this.config.sticky);
    this.metrics = new Metrics(this.config.metrics);
    this.proxy = new ProxyEngine(this);

    this._bindEvents();
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  /** Start listening and activate all subsystems. */
  async start() {
    if (this._initialized) throw new Error('Balancer already started');
    logger.info('🚨 Emergency Balancer starting…', { port: this.config.port, strategy: this.config.strategy });

    this.healthMonitor.start();
    this.circuitBreaker.start();
    await this.proxy.listen(this.config.port);

    this._initialized = true;
    logger.info(`✅ Listening on port ${this.config.port}`);
    this.emit('started', { port: this.config.port });
    return this;
  }

  /** Graceful shutdown — drain connections, then stop subsystems. */
  async stop(timeout = 30_000) {
    logger.info('Shutting down gracefully…', { timeout });
    this.emit('shutdown:begin');

    await this.proxy.close(timeout);
    this.healthMonitor.stop();
    this.circuitBreaker.stop();

    this._initialized = false;
    logger.info('Shutdown complete.');
    this.emit('shutdown:done');
  }

  // ─── Request Pipeline ─────────────────────────────────────────────────────

  /**
   * Select a backend for an incoming request.
   * Respects sticky sessions, rate limits, and circuit breaker state.
   *
   * @param {http.IncomingMessage} req
   * @returns {{ host: string, port: number }|null}  Backend or null if none available
   */
  selectBackend(req) {
    // 1. Rate limit check
    if (this.rateLimiter.isLimited(req)) {
      this.metrics.increment('requests_rate_limited');
      return null;
    }

    // 2. Sticky session — try to pin to an existing backend
    const pinned = this.stickySession.resolve(req);
    if (pinned && this.pool.isHealthy(pinned)) {
      return pinned;
    }

    // 3. Strategy selects from healthy pool
    const backend = this.strategy.next(req);
    if (!backend) {
      logger.warn('No healthy backends available — checking emergency pool');
      return this._emergencyFallback();
    }

    // 4. Circuit-breaker gate
    if (this.circuitBreaker.isOpen(backend)) {
      logger.warn('Circuit open for backend', { backend: backend.id });
      return this.strategy.nextExcluding(req, [backend]);
    }

    this.stickySession.pin(req, backend);
    return backend;
  }

  /** Called by the proxy after a request completes. */
  recordResult(backend, durationMs, statusCode) {
    this.circuitBreaker.record(backend, statusCode);
    this.metrics.recordRequest(backend, durationMs, statusCode);
    backend.connections = Math.max(0, (backend.connections || 1) - 1);
  }

  // ─── Emergency Mode ───────────────────────────────────────────────────────

  _emergencyFallback() {
    const standby = this.pool.getStandbyBackends();
    if (standby.length === 0) {
      logger.error('CRITICAL: No backends available — all circuits open and no standbys');
      return null;
    }

    if (!this._emergencyMode) {
      this._activateEmergencyMode(standby);
    }
    return standby[0];
  }

  _activateEmergencyMode(standbyList) {
    this._emergencyMode = true;
    standbyList.forEach(b => this.pool.activate(b));
    logger.error('🚨 EMERGENCY MODE ACTIVATED — failing over to standby backends', {
      standbys: standbyList.map(b => b.id),
    });
    this.emit('emergency', {
      message: 'All primary backends failed. Standby backends activated.',
      standbys: standbyList.map(b => b.id),
      timestamp: new Date().toISOString(),
    });
    this.metrics.setGauge('emergency_mode', 1);
  }

  _deactivateEmergencyMode() {
    if (!this._emergencyMode) return;
    this._emergencyMode = false;
    logger.info('✅ Emergency mode deactivated — primary backends recovered');
    this.emit('recovery', { timestamp: new Date().toISOString() });
    this.metrics.setGauge('emergency_mode', 0);
  }

  // ─── Runtime Management ───────────────────────────────────────────────────

  /** Add a backend at runtime without restart. */
  addBackend(descriptor) {
    const backend = this.pool.add(descriptor);
    this.healthMonitor.watch(backend);
    logger.info('Backend added', { id: backend.id });
    this.emit('backend:added', backend);
    return backend;
  }

  /** Drain and remove a backend gracefully. */
  async removeBackend(backendId, drainTimeout = 30_000) {
    const backend = this.pool.get(backendId);
    if (!backend) throw new Error(`Unknown backend: ${backendId}`);

    logger.info('Draining backend', { id: backendId, drainTimeout });
    this.pool.setDraining(backend);
    this.emit('backend:draining', backend);

    await this._waitForDrain(backend, drainTimeout);

    this.healthMonitor.unwatch(backend);
    this.pool.remove(backend);
    logger.info('Backend removed', { id: backendId });
    this.emit('backend:removed', backend);
  }

  _waitForDrain(backend, timeout) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      const check = () => {
        if ((backend.connections || 0) === 0) return resolve();
        if (Date.now() > deadline) return reject(new Error(`Drain timeout for ${backend.id}`));
        setTimeout(check, 500);
      };
      check();
    });
  }

  /** Hot-reload config without downtime. */
  reload(newConfig) {
    logger.info('Config reload requested');
    const merged = mergeConfig(newConfig);
    this.config = merged;
    this.strategy = StrategyFactory.create(merged.strategy, this.pool);
    this.rateLimiter.update(merged.rateLimit);
    this.healthMonitor.updateConfig(merged.health);
    logger.info('Config reloaded successfully');
    this.emit('reload', merged);
  }

  // ─── Status / Introspection ───────────────────────────────────────────────

  status() {
    return {
      port: this.config.port,
      strategy: this.config.strategy,
      emergencyMode: this._emergencyMode,
      backends: this.pool.all().map(b => ({
        id: b.id,
        host: b.host,
        port: b.port,
        healthy: b.healthy,
        connections: b.connections || 0,
        weight: b.weight,
        state: b.state,
      })),
      uptime: process.uptime(),
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  _bindEvents() {
    this.pool.on('backend:healthy', (backend) => {
      logger.info('Backend recovered', { id: backend.id });
      this.circuitBreaker.close(backend);
      if (this.pool.hasHealthyPrimaries()) {
        this._deactivateEmergencyMode();
      }
      this.emit('backend:healthy', backend);
    });

    this.pool.on('backend:unhealthy', (backend) => {
      logger.warn('Backend marked unhealthy', { id: backend.id });
      this.emit('backend:unhealthy', backend);
    });

    this.circuitBreaker.on('open', (backend) => {
      logger.warn('Circuit breaker OPEN', { id: backend.id });
      this.emit('circuit:open', backend);
    });

    this.circuitBreaker.on('half-open', (backend) => {
      logger.info('Circuit breaker HALF-OPEN — probing', { id: backend.id });
      this.emit('circuit:half-open', backend);
    });

    this.circuitBreaker.on('closed', (backend) => {
      logger.info('Circuit breaker CLOSED — backend healthy', { id: backend.id });
      this.emit('circuit:closed', backend);
    });

    process.on('SIGUSR2', () => {
      logger.info('SIGUSR2 received — printing status');
      console.log(JSON.stringify(this.status(), null, 2));
    });
  }
}

module.exports = EmergencyBalancer;
