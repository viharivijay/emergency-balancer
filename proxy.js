'use strict';

const http = require('http');
const express = require('express');
const httpProxy = require('http-proxy');
const logger = require('../utils/logger');

/**
 * HTTP proxy engine — wraps http-proxy, hooks into the balancer's
 * backend selection, and manages the admin/metrics sub-server.
 */
class ProxyEngine {
  constructor(balancer) {
    this.balancer = balancer;
    this._proxy = httpProxy.createProxyServer({ changeOrigin: true });
    this._server = null;
    this._activeConnections = new Set();

    this._proxy.on('error', (err, req, res) => {
      const backend = req._eb_backend;
      logger.error('Proxy error', { error: err.message, backend: backend?.id });
      if (backend) {
        this.balancer.circuitBreaker.record(backend, 0);
      }
      if (res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', message: 'No backend available' }));
      }
    });

    this._proxy.on('proxyRes', (proxyRes, req, _res) => {
      const backend = req._eb_backend;
      if (backend) {
        const durationMs = Date.now() - req._eb_start;
        this.balancer.recordResult(backend, durationMs, proxyRes.statusCode);
      }
    });
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      const app = express();

      // ── Admin / Metrics routes ─────────────────────────────────────────────
      app.get('/eb/status', (_req, res) => {
        res.json(this.balancer.status());
      });

      app.get('/eb/metrics', (_req, res) => {
        res.set('Content-Type', 'text/plain');
        res.send(this.balancer.metrics.render());
      });

      app.get('/eb/health', (_req, res) => {
        const healthy = this.balancer.pool.getHealthy().length > 0;
        res.status(healthy ? 200 : 503).json({ healthy });
      });

      // ── Catch-all proxy ───────────────────────────────────────────────────
      app.use((req, res) => {
        const backend = this.balancer.selectBackend(req);

        if (!backend) {
          this.balancer.metrics.increment('requests_rejected');
          return res.status(503).json({
            error: 'Service Unavailable',
            message: 'No healthy backends available',
          });
        }

        req._eb_backend = backend;
        req._eb_start = Date.now();

        const target = `http://${backend.host}:${backend.port}`;
        logger.debug('Proxying request', { method: req.method, url: req.url, backend: backend.id });

        this._proxy.web(req, res, { target });
      });

      this._server = http.createServer(app);

      this._server.on('connection', (socket) => {
        this._activeConnections.add(socket);
        socket.on('close', () => this._activeConnections.delete(socket));
      });

      this._server.listen(port, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  close(timeout = 30_000) {
    return new Promise((resolve) => {
      if (!this._server) return resolve();

      const deadline = setTimeout(() => {
        logger.warn('Force-closing active connections after drain timeout');
        this._activeConnections.forEach(s => s.destroy());
        resolve();
      }, timeout);

      this._server.close(() => {
        clearTimeout(deadline);
        resolve();
      });
    });
  }
}

module.exports = ProxyEngine;
