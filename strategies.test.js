'use strict';

const BackendPool = require('../../src/health/backend-pool');
const RoundRobin = require('../../src/strategies/round-robin');
const Weighted = require('../../src/strategies/weighted');
const LeastConnections = require('../../src/strategies/least-connections');
const IpHash = require('../../src/strategies/ip-hash');
const Random = require('../../src/strategies/random');

function makePool(backends) {
  return new BackendPool(backends);
}

describe('RoundRobin', () => {
  it('cycles through backends in order', () => {
    const pool = makePool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80 },
      { host: 'c', port: 80 },
    ]);
    const rr = new RoundRobin(pool);

    expect(rr.next(null).host).toBe('a');
    expect(rr.next(null).host).toBe('b');
    expect(rr.next(null).host).toBe('c');
    expect(rr.next(null).host).toBe('a');  // wraps
  });

  it('returns null for empty pool', () => {
    const pool = makePool([]);
    const rr = new RoundRobin(pool);
    expect(rr.next(null)).toBeNull();
  });

  it('skips unhealthy backends', () => {
    const pool = makePool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80 },
    ]);
    pool.markUnhealthy(pool.get('a:80'));
    const rr = new RoundRobin(pool);
    // Only b should ever be selected
    for (let i = 0; i < 5; i++) {
      expect(rr.next(null).host).toBe('b');
    }
  });
});

describe('Weighted', () => {
  it('distributes traffic proportionally by weight', () => {
    const pool = makePool([
      { host: 'heavy', port: 80, weight: 3 },
      { host: 'light', port: 80, weight: 1 },
    ]);
    const w = new Weighted(pool);
    const counts = { heavy: 0, light: 0 };
    for (let i = 0; i < 40; i++) {
      // reset connections to avoid affecting selection
      pool.all().forEach(b => b.connections = 0);
      counts[w.next(null).host]++;
    }
    // heavy should get ~3× more traffic than light
    expect(counts.heavy).toBeGreaterThan(counts.light * 2);
  });
});

describe('LeastConnections', () => {
  it('picks backend with fewest connections', () => {
    const pool = makePool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80 },
    ]);
    const [a, b] = pool.all();
    a.connections = 10;
    b.connections = 2;
    const lc = new LeastConnections(pool);
    expect(lc.next(null).host).toBe('b');
  });
});

describe('IpHash', () => {
  it('always maps same IP to same backend', () => {
    const pool = makePool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80 },
      { host: 'c', port: 80 },
    ]);
    const ih = new IpHash(pool);
    const fakeReq = { socket: { remoteAddress: '192.168.1.1' }, headers: {} };
    const first = ih.next(fakeReq).host;
    for (let i = 0; i < 10; i++) {
      pool.all().forEach(b => b.connections = 0);
      expect(ih.next(fakeReq).host).toBe(first);
    }
  });
});

describe('Random', () => {
  it('returns a healthy backend', () => {
    const pool = makePool([
      { host: 'a', port: 80 },
      { host: 'b', port: 80 },
    ]);
    const r = new Random(pool);
    const backend = r.next(null);
    expect(['a', 'b']).toContain(backend.host);
  });
});
