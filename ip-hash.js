'use strict';

const crypto = require('crypto');

/**
 * IP-Hash — deterministically pins a client IP to a backend.
 */
class IpHash {
  constructor(pool) {
    this.pool = pool;
  }

  next(req) {
    const backends = this.pool.getHealthy();
    if (backends.length === 0) return null;

    const ip = req?.socket?.remoteAddress || req?.headers?.['x-forwarded-for'] || '0.0.0.0';
    const hash = crypto.createHash('md5').update(ip).digest('hex');
    const index = parseInt(hash.slice(0, 8), 16) % backends.length;
    const backend = backends[index];
    backend.connections = (backend.connections || 0) + 1;
    backend.totalRequests = (backend.totalRequests || 0) + 1;
    return backend;
  }

  nextExcluding(req, excluded) {
    const ids = new Set(excluded.map(b => b.id));
    const backends = this.pool.getHealthy().filter(b => !ids.has(b.id));
    if (backends.length === 0) return null;

    const ip = req?.socket?.remoteAddress || '0.0.0.0';
    const hash = crypto.createHash('md5').update(ip).digest('hex');
    const index = parseInt(hash.slice(0, 8), 16) % backends.length;
    const backend = backends[index];
    backend.connections = (backend.connections || 0) + 1;
    return backend;
  }
}

module.exports = IpHash;
