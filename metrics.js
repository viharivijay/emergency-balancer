'use strict';

/**
 * Lightweight Prometheus-compatible metrics store.
 * Uses prom-client under the hood if available, falls back to simple counters.
 */
class Metrics {
  constructor(_config = {}) {
    this._counters = new Map();
    this._gauges = new Map();
    this._histograms = new Map();  // backendId → latency buckets
  }

  increment(name, labels = {}) {
    const key = this._key(name, labels);
    this._counters.set(key, (this._counters.get(key) || 0) + 1);
  }

  setGauge(name, value, labels = {}) {
    const key = this._key(name, labels);
    this._gauges.set(key, value);
  }

  recordRequest(backend, durationMs, statusCode) {
    this.increment('requests_total', { backend: backend.id, status: String(statusCode) });
    this._recordLatency(backend.id, durationMs);
  }

  _recordLatency(backendId, durationMs) {
    if (!this._histograms.has(backendId)) {
      this._histograms.set(backendId, { sum: 0, count: 0, buckets: [] });
    }
    const h = this._histograms.get(backendId);
    h.sum += durationMs;
    h.count++;
    h.buckets.push(durationMs);
    if (h.buckets.length > 1000) h.buckets.shift();
  }

  /** Render Prometheus text format. */
  render() {
    const lines = [];

    lines.push('# HELP eb_requests_total Total proxied requests');
    lines.push('# TYPE eb_requests_total counter');
    for (const [key, val] of this._counters.entries()) {
      lines.push(`eb_${key} ${val}`);
    }

    lines.push('# HELP eb_emergency_mode Whether emergency mode is active');
    lines.push('# TYPE eb_emergency_mode gauge');
    for (const [key, val] of this._gauges.entries()) {
      lines.push(`eb_${key} ${val}`);
    }

    lines.push('# HELP eb_backend_latency_p99_ms P99 request latency per backend');
    lines.push('# TYPE eb_backend_latency_p99_ms gauge');
    for (const [backendId, h] of this._histograms.entries()) {
      if (h.count === 0) continue;
      const sorted = [...h.buckets].sort((a, b) => a - b);
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      const avg = h.sum / h.count;
      lines.push(`eb_backend_latency_p99_ms{backend="${backendId}"} ${p99.toFixed(2)}`);
      lines.push(`eb_backend_latency_avg_ms{backend="${backendId}"} ${avg.toFixed(2)}`);
    }

    return lines.join('\n') + '\n';
  }

  _key(name, labels) {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}

module.exports = Metrics;
