'use strict';

const BackendPool = require('../../src/health/backend-pool');

describe('BackendPool', () => {
  it('initializes backends from descriptors', () => {
    const pool = new BackendPool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80 },
    ]);
    expect(pool.all()).toHaveLength(2);
  });

  it('marks standbys as inactive initially', () => {
    const pool = new BackendPool([
      { host: 'primary', port: 80 },
      { host: 'standby', port: 80, standby: true },
    ]);
    expect(pool.get('primary:80').healthy).toBe(true);
    expect(pool.get('standby:80').healthy).toBe(false);
    expect(pool.get('standby:80').state).toBe('standby');
  });

  it('emits backend:unhealthy when marking unhealthy', () => {
    const pool = new BackendPool([{ host: 'a', port: 80 }]);
    const mock = jest.fn();
    pool.on('backend:unhealthy', mock);
    pool.markUnhealthy(pool.get('a:80'));
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('emits backend:healthy when backend recovers', () => {
    const pool = new BackendPool([{ host: 'a', port: 80 }]);
    const backend = pool.get('a:80');
    pool.markUnhealthy(backend);
    const mock = jest.fn();
    pool.on('backend:healthy', mock);
    pool.markHealthy(backend);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('getHealthy returns only active and healthy backends', () => {
    const pool = new BackendPool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80 },
      { host: 'c', port: 80, standby: true },
    ]);
    pool.markUnhealthy(pool.get('b:80'));
    const healthy = pool.getHealthy();
    expect(healthy.map(b => b.host)).toEqual(['a']);
  });

  it('hasHealthyPrimaries returns false when all primaries down', () => {
    const pool = new BackendPool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80, standby: true },
    ]);
    pool.markUnhealthy(pool.get('a:80'));
    expect(pool.hasHealthyPrimaries()).toBe(false);
  });
});
