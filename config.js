'use strict';

const DEFAULTS = {
  port: 8080,
  strategy: 'round-robin',
  backends: [],
  health: {
    interval: 5000,
    timeout: 2000,
    unhealthyThreshold: 3,
    healthyThreshold: 2,
    path: '/health',
    expectedStatus: 200,
  },
  circuitBreaker: {
    enabled: true,
    threshold: 50,
    windowSize: 10,
    resetTimeout: 30000,
    halfOpenRequests: 3,
  },
  rateLimit: {
    enabled: false,
    requestsPerSecond: 1000,
    burstSize: 200,
  },
  sticky: {
    enabled: false,
    cookieName: 'EB_SESSION',
    ttl: 3600,
  },
  metrics: {},
};

function mergeConfig(options) {
  return {
    ...DEFAULTS,
    ...options,
    health: { ...DEFAULTS.health, ...options.health },
    circuitBreaker: { ...DEFAULTS.circuitBreaker, ...options.circuitBreaker },
    rateLimit: { ...DEFAULTS.rateLimit, ...options.rateLimit },
    sticky: { ...DEFAULTS.sticky, ...options.sticky },
    metrics: { ...DEFAULTS.metrics, ...options.metrics },
  };
}

module.exports = { mergeConfig, DEFAULTS };
