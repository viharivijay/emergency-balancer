'use strict';

/**
 * Least-Connections — always picks the backend with the fewest active connections.
 * Best for long-lived or variable-duration requests.
 */
class LeastConnections {
  constructor(pool) {
    this.pool = pool;
  }

  next(_req) {
    const backends = this.pool.getHealthy();
    if (backends.length === 0) return null;

    const backend = backends.reduce((min, b) =>
      (b.connections || 0) < (min.connections || 0) ? b : min
    );

    backend.connections = (backend.connections || 0) + 1;
    backend.totalRequests = (backend.totalRequests || 0) + 1;
    return backend;
  }

  nextExcluding(_req, excluded) {
    const ids = new Set(excluded.map(b => b.id));
    const backends = this.pool.getHealthy().filter(b => !ids.has(b.id));
    if (backends.length === 0) return null;

    const backend = backends.reduce((min, b) =>
      (b.connections || 0) < (min.connections || 0) ? b : min
    );

    backend.connections = (backend.connections || 0) + 1;
    return backend;
  }
}

module.exports = LeastConnections;
