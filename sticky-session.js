'use strict';

const DEFAULTS = {
  enabled: false,
  cookieName: 'EB_SESSION',
  ttl: 3600,
};

class StickySession {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...config };
    this._sessions = new Map();
  }

  /** Return the pinned backend id for this request, or null. */
  resolve(req) {
    if (!this.config.enabled) return null;
    const cookieHeader = req.headers?.cookie || '';
    const match = cookieHeader.match(new RegExp(`${this.config.cookieName}=([^;]+)`));
    if (!match) return null;

    const entry = this._sessions.get(match[1]);
    if (!entry || Date.now() > entry.expiresAt) {
      this._sessions.delete(match[1]);
      return null;
    }
    return entry.backendId;  // caller looks up by id
  }

  /** Pin this request's client to the selected backend. */
  pin(req, backend) {
    if (!this.config.enabled) return;
    // We'd normally set-cookie on the response here; simplified for illustration
    const sessionId = `${backend.id}-${Date.now()}`;
    this._sessions.set(sessionId, {
      backendId: backend.id,
      expiresAt: Date.now() + this.config.ttl * 1000,
    });
  }
}

module.exports = StickySession;
