'use strict';

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Manages the collection of backend servers and their health state.
 */
class BackendPool extends EventEmitter {
  constructor(descriptors = []) {
    super();
    this._backends = new Map();
    descriptors.forEach(d => this.add(d));
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  add(descriptor) {
    const backend = {
      id: descriptor.id || `${descriptor.host}:${descriptor.port}`,
      host: descriptor.host,
      port: descriptor.port,
      weight: descriptor.weight || 1,
      zone: descriptor.zone || 'default',
      standby: descriptor.standby || false,
      healthy: !descriptor.standby,   // standbys start inactive
      state: descriptor.standby ? 'standby' : 'active',
      connections: 0,
      totalRequests: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastCheck: null,
      addedAt: Date.now(),
    };
    this._backends.set(backend.id, backend);
    logger.debug('Backend added to pool', { id: backend.id });
    return backend;
  }

  remove(backend) {
    this._backends.delete(backend.id);
  }

  get(id) {
    return this._backends.get(id) || null;
  }

  all() {
    return Array.from(this._backends.values());
  }

  // ─── Health State ──────────────────────────────────────────────────────────

  markHealthy(backend) {
    const prev = backend.healthy;
    backend.healthy = true;
    backend.state = 'active';
    backend.consecutiveFailures = 0;
    backend.consecutiveSuccesses++;
    backend.lastCheck = Date.now();

    if (!prev) {
      this.emit('backend:healthy', backend);
    }
  }

  markUnhealthy(backend) {
    const prev = backend.healthy;
    backend.healthy = false;
    backend.state = 'unhealthy';
    backend.consecutiveSuccesses = 0;
    backend.consecutiveFailures++;
    backend.lastCheck = Date.now();

    if (prev) {
      this.emit('backend:unhealthy', backend);
    }
  }

  setDraining(backend) {
    backend.state = 'draining';
    backend.healthy = false;
  }

  activate(backend) {
    backend.standby = false;
    backend.healthy = true;
    backend.state = 'active';
    logger.info('Standby backend activated', { id: backend.id });
  }

  isHealthy(backend) {
    const b = typeof backend === 'string' ? this._backends.get(backend) : backend;
    return b && b.healthy && b.state === 'active';
  }

  // ─── Filtered Views ────────────────────────────────────────────────────────

  getHealthy() {
    return this.all().filter(b => b.healthy && b.state === 'active');
  }

  getPrimaries() {
    return this.all().filter(b => !b.standby);
  }

  getStandbyBackends() {
    return this.all().filter(b => b.standby);
  }

  hasHealthyPrimaries() {
    return this.getPrimaries().some(b => b.healthy);
  }
}

module.exports = BackendPool;
