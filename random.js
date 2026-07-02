'use strict';

class Random {
  constructor(pool) { this.pool = pool; }

  next(_req) {
    const backends = this.pool.getHealthy();
    if (backends.length === 0) return null;
    const backend = backends[Math.floor(Math.random() * backends.length)];
    backend.connections = (backend.connections || 0) + 1;
    backend.totalRequests = (backend.totalRequests || 0) + 1;
    return backend;
  }

  nextExcluding(_req, excluded) {
    const ids = new Set(excluded.map(b => b.id));
    const backends = this.pool.getHealthy().filter(b => !ids.has(b.id));
    if (backends.length === 0) return null;
    const backend = backends[Math.floor(Math.random() * backends.length)];
    backend.connections = (backend.connections || 0) + 1;
    return backend;
  }
}

module.exports = Random;
