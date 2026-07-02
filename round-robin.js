'use strict';

/**
 * Round-Robin strategy — distributes requests evenly across healthy backends.
 */
class RoundRobin {
  constructor(pool) {
    this.pool = pool;
    this._index = 0;
  }

  next(_req) {
    const backends = this.pool.getHealthy();
    if (backends.length === 0) return null;

    const backend = backends[this._index % backends.length];
    this._index = (this._index + 1) % backends.length;
    backend.connections = (backend.connections || 0) + 1;
    backend.totalRequests = (backend.totalRequests || 0) + 1;
    return backend;
  }

  nextExcluding(_req, excluded) {
    const ids = new Set(excluded.map(b => b.id));
    const backends = this.pool.getHealthy().filter(b => !ids.has(b.id));
    if (backends.length === 0) return null;

    const backend = backends[this._index % backends.length];
    this._index = (this._index + 1) % backends.length;
    backend.connections = (backend.connections || 0) + 1;
    return backend;
  }
}

module.exports = RoundRobin;
