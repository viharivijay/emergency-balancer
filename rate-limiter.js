'use strict';

const logger = require('../utils/logger');

const DEFAULTS = {
  enabled: true,
  requestsPerSecond: 1000,
  burstSize: 200,
  keyFn: (req) => req.socket?.remoteAddress || 'unknown',
};

/**
 * Token-bucket rate limiter.
 * Each client IP gets its own bucket. Buckets are garbage-collected after inactivity.
 */
class RateLimiter {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...config };
    this._buckets = new Map();
    this._gcInterval = setInterval(() => this._gc(), 60_000);
    this._gcInterval.unref?.();
  }

  isLimited(req) {
    if (!this.config.enabled) return false;
    const key = this.config.keyFn(req);
    const bucket = this._getBucket(key);
    return !this._consume(bucket);
  }

  update(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this._buckets.clear();
  }

  // ─── Token Bucket ──────────────────────────────────────────────────────────

  _getBucket(key) {
    if (!this._buckets.has(key)) {
      this._buckets.set(key, {
        tokens: this.config.burstSize,
        lastRefill: Date.now(),
        lastUsed: Date.now(),
      });
    }
    return this._buckets.get(key);
  }

  _consume(bucket) {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.config.burstSize,
      bucket.tokens + elapsed * this.config.requestsPerSecond
    );
    bucket.lastRefill = now;
    bucket.lastUsed = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;  // allowed
    }
    return false;   // rate limited
  }

  _gc() {
    const ttl = 120_000; // 2 minutes idle
    const now = Date.now();
    for (const [key, bucket] of this._buckets.entries()) {
      if (now - bucket.lastUsed > ttl) this._buckets.delete(key);
    }
  }
}

module.exports = RateLimiter;
