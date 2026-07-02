'use strict';

const RoundRobin = require('./round-robin');
const Weighted = require('./weighted');
const LeastConnections = require('./least-connections');
const IpHash = require('./ip-hash');
const Random = require('./random');

const STRATEGIES = {
  'round-robin': RoundRobin,
  'weighted': Weighted,
  'least-connections': LeastConnections,
  'ip-hash': IpHash,
  'random': Random,
};

class StrategyFactory {
  static create(name = 'round-robin', pool) {
    const Cls = STRATEGIES[name];
    if (!Cls) {
      throw new Error(`Unknown strategy "${name}". Available: ${Object.keys(STRATEGIES).join(', ')}`);
    }
    return new Cls(pool);
  }

  static available() {
    return Object.keys(STRATEGIES);
  }
}

module.exports = StrategyFactory;
