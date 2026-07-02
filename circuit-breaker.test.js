'use strict';

jest.useFakeTimers();

const BackendPool = require('../../src/health/backend-pool');
const CircuitBreaker = require('../../src/health/circuit-breaker');

function makeBreaker(config = {}) {
  const pool = new BackendPool([{ host: 'a', port: 80 }]);
  const backend = pool.get('a:80');
  const cb = new CircuitBreaker(pool, {
    enabled: true,
    threshold: 50,
    windowSize: 4,
    resetTimeout: 5000,
    halfOpenRequests: 2,
    ...config,
  });
  cb.start();
  return { pool, backend, cb };
}

describe('CircuitBreaker', () => {
  afterEach(() => jest.clearAllTimers());

  it('starts closed', () => {
    const { backend, cb } = makeBreaker();
    expect(cb.isOpen(backend)).toBe(false);
  });

  it('opens after error rate exceeds threshold', () => {
    const { backend, cb } = makeBreaker();
    // Fill window with 3 errors and 1 success = 75% error rate
    cb.record(backend, 500);
    cb.record(backend, 500);
    cb.record(backend, 500);
    cb.record(backend, 200);
    expect(cb.isOpen(backend)).toBe(true);
  });

  it('stays closed below threshold', () => {
    const { backend, cb } = makeBreaker();
    // 1 error and 3 successes = 25% error rate, below 50% threshold
    cb.record(backend, 500);
    cb.record(backend, 200);
    cb.record(backend, 200);
    cb.record(backend, 200);
    expect(cb.isOpen(backend)).toBe(false);
  });

  it('transitions to half-open after resetTimeout', () => {
    const { backend, cb } = makeBreaker();
    cb.record(backend, 500);
    cb.record(backend, 500);
    cb.record(backend, 500);
    cb.record(backend, 500);
    expect(cb.isOpen(backend)).toBe(true);

    jest.advanceTimersByTime(6000);
    // After timeout, circuit is half-open (not open)
    expect(cb.isOpen(backend)).toBe(false);
  });

  it('emits open/closed events', () => {
    const { backend, cb } = makeBreaker();
    const openMock = jest.fn();
    const closedMock = jest.fn();
    cb.on('open', openMock);
    cb.on('closed', closedMock);

    cb.record(backend, 500);
    cb.record(backend, 500);
    cb.record(backend, 500);
    cb.record(backend, 500);
    expect(openMock).toHaveBeenCalledTimes(1);

    cb.close(backend);
    expect(closedMock).toHaveBeenCalledTimes(1);
  });
});
