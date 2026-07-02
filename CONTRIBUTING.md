# Contributing to Emergency Balancer

Thank you for your interest! Here's how to get started:

## Development Setup

```bash
git clone https://github.com/yourusername/emergency-balancer.git
cd emergency-balancer
npm install
```

## Running Tests

```bash
npm test               # all tests
npm run test:unit      # unit tests only
npm run test:coverage  # with coverage report
```

## Adding a New Strategy

1. Create `src/strategies/my-strategy.js` implementing `next(req)` and `nextExcluding(req, excluded)`.
2. Register it in `src/strategies/index.js`.
3. Add tests in `tests/unit/strategies.test.js`.
4. Document it in `docs/strategies.md`.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR.
- Ensure tests pass and coverage doesn't regress.
- Update `README.md` if you add user-facing behaviour.
- Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Reporting Issues

Open a GitHub issue with: Node version, configuration used, steps to reproduce, and expected vs actual behaviour.
