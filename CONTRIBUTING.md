# Contributing

Thanks for considering a contribution.

## Development setup

```bash
bun install
bun run typecheck && bun run lint && bun run test
bun run desktop:dev
```

Read `IMPLEMENTATION.md` first — it's the master map. Then `DESIGN.md`, `API.md`, and `CLAUDE.md` for the rules. Each plan in `.claude/PRPs/plans/` is self-contained.

## Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`
- One plan (or one stack of PRs) per change. Don't refactor across plan boundaries.
- No raw `px` in component code — use `var(--space-*)` from `tokens.css`.
- No `console.log` — use `pino` via `childLogger({ request_id })`.
- No `catch (e: unknown)` catch-alls — name the exception class.
- DB access goes through repositories in `packages/db/src/repositories/`.
- IDs are opaque — never parse `VM-218` or `run_…` on the client.
- State transitions are server-enforced — clients call action endpoints (`approve`, `run`, `cancel`), never `status: "running"`.

See `CLAUDE.md` for the full ruleset.

## Pull requests

- Open against `main`.
- Each PR maps to a plan or a stack of three from a single plan.
- The plan's Completion Checklist must be ticked, including `IMPLEMENTATION.md updated to reflect this plan as shipped`.

## License

By contributing, you agree your contributions are licensed under the MIT License (see `LICENSE`).
