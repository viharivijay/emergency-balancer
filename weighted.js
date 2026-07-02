'use strict';

/**
 * Weighted Round-Robin — backends with higher weight receive proportionally more traffic.
 * Uses a smooth weighted round-robin algorithm (Nginx-style).
 */
class Weighted {
  constructor(pool) {
    this.pool = pool;
    this._currentWeights = new Map();
  }

  next(_req) {
    const backends = this.pool.getHealthy();
    if (backends.length === 0) return null;

    // Initialize current weights for new backends
    backends.forEach(b => {
      if (!this._currentWeights.has(b.id)) {
        this._currentWeights.set(b.id, 0);
      }
    });

    // Smooth weighted round-robin
    const totalWeight = backends.reduce((sum, b) => sum + b.weight, 0);
    backends.forEach(b => {
      this._currentWeights.set(b.id, this._currentWeights.get(b.id) + b.weight);
    });

    const best = backends.reduce((max, b) =>
      this._currentWeights.get(b.id) > this._currentWeights.get(max.id) ? b : max
    );

    this._currentWeights.set(best.id, this._currentWeights.get(best.id) - totalWeight);
    best.connections = (best.connections || 0) + 1;
    best.totalRequests = (best.totalRequests || 0) + 1;
    return best;
  }

  nextExcluding(_req, excluded) {
    const ids = new Set(excluded.map(b => b.id));
    const pool = { getHealthy: () => this.pool.getHealthy().filter(b => !ids.has(b.id)) };
    const saved = this.pool;
    this.pool = pool;
    const result = this.next(_req);
    this.pool = saved;
    return result;
  }
}

module.exports = Weighted;
