# 🚨 Emergency Balancer

[![npm version](https://badge.fury.io/js/emergency-balancer.svg)](https://badge.fury.io/js/emergency-balancer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![Coverage](https://img.shields.io/badge/coverage-94%25-green.svg)]()

A **high-performance, fault-tolerant load balancer** built for emergency and critical infrastructure scenarios. Designed to keep your services alive when everything else is on fire. 🔥

---

## ✨ Features

- **Multiple Load Balancing Strategies** — Round Robin, Weighted, Least Connections, IP Hash, Random
- **Real-time Health Monitoring** — Active & passive health checks with configurable thresholds
- **Circuit Breaker Pattern** — Auto-detect failing backends and prevent cascade failures
- **Emergency Failover** — Instantly reroute traffic when primary backends go down
- **Sticky Sessions** — Session persistence via cookies or IP hash
- **Rate Limiting** — Per-client and global rate limiting to prevent overload
- **Metrics & Observability** — Prometheus-compatible metrics, structured logging
- **Zero-downtime Config Reload** — Update backends without dropping connections
- **Docker & Kubernetes Ready** — Helm chart and Docker Compose included

---

## 📦 Installation

```bash
npm install emergency-balancer
```

Or clone and run directly:

```bash
git clone https://github.com/yourusername/emergency-balancer.git
cd emergency-balancer
npm install
npm start
```

---

## 🚀 Quick Start

### Minimal Setup

```javascript
const { EmergencyBalancer } = require('emergency-balancer');

const balancer = new EmergencyBalancer({
  port: 8080,
  backends: [
    { host: 'backend-1.internal', port: 3000 },
    { host: 'backend-2.internal', port: 3000 },
    { host: 'backend-3.internal', port: 3000 },
  ],
});

balancer.start();
```

### Full Configuration

```javascript
const balancer = new EmergencyBalancer({
  port: 8080,
  strategy: 'least-connections', // round-robin | weighted | least-connections | ip-hash | random
  
  backends: [
    { host: 'primary-1.internal',  port: 3000, weight: 10, zone: 'us-east' },
    { host: 'primary-2.internal',  port: 3000, weight: 10, zone: 'us-east' },
    { host: 'fallback.internal',   port: 3000, weight: 1,  zone: 'us-west', standby: true },
  ],

  health: {
    interval: 5000,          // Check every 5 seconds
    timeout: 2000,           // Fail after 2 seconds
    unhealthyThreshold: 3,   // 3 failures = unhealthy
    healthyThreshold: 2,     // 2 successes = healthy again
    path: '/health',         // Health check endpoint
  },

  circuitBreaker: {
    enabled: true,
    threshold: 50,           // Open at 50% error rate
    resetTimeout: 30000,     // Try again after 30s
  },

  rateLimit: {
    enabled: true,
    requestsPerSecond: 1000,
    burstSize: 200,
  },

  sticky: {
    enabled: true,
    cookieName: 'EB_SESSION',
    ttl: 3600,
  },
});
```

---

## 🏗️ Architecture

```
                        ┌─────────────────────────────┐
                        │      Emergency Balancer       │
                        │                              │
   Clients ────────────▶│  ┌──────────┐  ┌─────────┐ │──────▶ Backend 1
                        │  │  Router  │  │  Health  │ │
   Clients ────────────▶│  │ Strategy │  │ Monitor  │ │──────▶ Backend 2
                        │  └──────────┘  └─────────┘ │
   Clients ────────────▶│  ┌──────────┐  ┌─────────┐ │──────▶ Backend 3
                        │  │ Circuit  │  │  Rate   │ │
                        │  │ Breaker  │  │ Limiter │ │
                        │  └──────────┘  └─────────┘ │
                        └─────────────────────────────┘
                                        │
                                 ┌──────▼──────┐
                                 │   Metrics   │
                                 │ /metrics    │
                                 └─────────────┘
```

---

## 📊 Strategies

| Strategy | Best For | Description |
|---|---|---|
| `round-robin` | Equal backends | Distributes requests evenly in rotation |
| `weighted` | Mixed capacity | Routes more traffic to higher-weight backends |
| `least-connections` | Long-lived connections | Picks the backend with fewest active connections |
| `ip-hash` | Sticky by client IP | Same client always hits same backend |
| `random` | Simple distribution | Random backend selection |

---

## 🔥 Emergency Mode

When all primary backends fail, Emergency Balancer activates **Emergency Mode**:

1. Standby backends are immediately activated
2. Rate limits are temporarily relaxed for critical endpoints
3. Alerts fire to configured notification channels
4. Admin panel shows red-alert status

```javascript
balancer.on('emergency', (event) => {
  console.error(`EMERGENCY: ${event.message}`);
  // Send PagerDuty alert, etc.
});
```

---

## 📈 Metrics

Expose Prometheus metrics at `/metrics`:

```
eb_requests_total{backend="backend-1", status="200"} 15234
eb_backend_latency_ms{backend="backend-1", quantile="0.99"} 45
eb_active_connections{backend="backend-1"} 12
eb_circuit_state{backend="backend-2"} 0   # 0=closed, 1=open, 0.5=half-open
eb_healthy_backends_total 2
```

---

## 🛠️ CLI

```bash
# Start with config file
eb start --config config/production.yml

# Check status
eb status

# Add backend at runtime
eb backend add --host new-server.internal --port 3000 --weight 5

# Remove backend gracefully
eb backend drain --host old-server.internal --timeout 30s

# Reload config without downtime
eb reload
```

---

## 🐳 Docker

```bash
docker run -p 8080:8080 \
  -v $(pwd)/config.yml:/etc/eb/config.yml \
  ghcr.io/yourusername/emergency-balancer:latest
```

---

## 📁 Project Structure

```
emergency-balancer/
├── src/
│   ├── core/
│   │   ├── balancer.js          # Main balancer class
│   │   ├── proxy.js             # HTTP/TCP proxy engine
│   │   └── server.js            # Entry point & lifecycle
│   ├── strategies/
│   │   ├── round-robin.js
│   │   ├── weighted.js
│   │   ├── least-connections.js
│   │   ├── ip-hash.js
│   │   └── index.js
│   ├── health/
│   │   ├── monitor.js           # Health check engine
│   │   ├── circuit-breaker.js   # Circuit breaker
│   │   └── backend-pool.js      # Backend state management
│   ├── middleware/
│   │   ├── rate-limiter.js
│   │   ├── sticky-session.js
│   │   └── metrics.js
│   └── utils/
│       ├── logger.js
│       ├── config.js
│       └── events.js
├── config/
│   ├── default.yml
│   └── production.yml.example
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── configuration.md
│   ├── strategies.md
│   └── deployment.md
├── scripts/
│   └── healthcheck.sh
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 🤝 Contributing

Pull requests are welcome! See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT © 2026
