# Releasing VibeMaestro

This is the runbook for cutting a release. Plans #1-#8 produce the app; this one ships it.

## Pre-flight

- [ ] All plan PRs landed and `IMPLEMENTATION.md` reflects the shipped state
- [ ] CI on `main` is green (typecheck + lint + test on Ubuntu + macOS)
- [ ] You've dogfooded the build: at least 5 real Claude Code or Codex tasks across at least 5 different days
- [ ] No critical findings open from CEO / Design / Eng reviews

## Cutting a release

### 1. Bump version + tag

```bash
# Pick one
bun run release:patch   # 0.1.0 → 0.1.1
bun run release:minor   # 0.1.0 → 0.2.0
bun run release:major   # 0.1.0 → 1.0.0
```

This commits `chore: release vX.Y.Z` and creates the matching annotated tag.

### 2. Push the tag

```bash
git push origin main --follow-tags
```

The push triggers `.github/workflows/release.yml`:
- macOS, Ubuntu, and Windows runners build in parallel
- Each rebuilds native modules (`better-sqlite3`, `node-pty`) against Electron's ABI
- electron-builder produces `.dmg` + `.AppImage` + `.deb` + `.exe` and publishes them to a draft GitHub Release named after the tag

### 3. Promote the draft

Visit the [Releases page](https://github.com/codeeatsleep2nd/VibeMaestro/releases), edit the draft, paste the changelog tail, and publish.

The Cloudflare Pages landing site (plan #10) auto-deploys when a release is published — its "Download for…" CTA queries the GitHub Releases API and surfaces the new artifacts immediately.

## Signing — what's wired and what isn't

| Platform | Status | Required secrets |
|---|---|---|
| macOS (notarization) | Optional. `electron-builder.yml` defaults to `notarize: false` so an unsigned `.dmg` ships without the runner needing Apple Developer credentials. | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD` |
| Windows (Authenticode) | Optional. NSIS installer ships unsigned by default. | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |
| Linux (AppImage / deb) | Unsigned by convention. Distribution-level signing is the user's call. | — |

When secrets are present, the same workflow flips into the signed/notarized path automatically.

### Unsigned builds — user-facing UX

- **macOS unsigned `.dmg`**: first launch shows "VibeMaestro can't be opened because Apple cannot check it for malicious software". Right-click the app → "Open" → "Open" again. README.md documents this.
- **Windows unsigned `.exe`**: SmartScreen flags as "unrecognized". User clicks "More info" → "Run anyway". README.md documents this.

## Auto-update

- `electron-updater@6` is wired in `apps/desktop/src/main/auto-update.ts` and only activates in packaged builds (skipped in dev).
- The provider is GitHub Releases (`publish.provider: github` in `electron-builder.yml`).
- On boot, the app checks for a newer release. If found, it downloads in the background and installs on next quit.
- All updater logs flow through the existing pino child logger (module: `auto-update`).

## Rollback

If a release ships with a critical bug:

1. Delete the GitHub Release (this hides it from the auto-updater feed).
2. Optionally delete the tag: `git push --delete origin v0.1.3` then `git tag -d v0.1.3` locally.
3. Cut a patch release with the fix.

The auto-updater pins to the latest published release, so stepping users back is a matter of removing the bad one and shipping the next.

## Troubleshooting

### "node-gyp failed" during native rebuild

Almost always a Node ABI mismatch. The CI workflow uses `electron-builder install-app-deps`, which rebuilds against `electronVersion` from `apps/desktop/package.json`. If a runner picks up a stale binary, clear the cache:

```bash
gh run cancel <run-id>
gh run rerun <run-id> --debug
```

### macOS notarization timeout

Apple's service is sometimes slow. The workflow doesn't fail on notarization timeout — the unsigned dmg is published instead. Re-run the job once Apple's notary service recovers.

### CHANGELOG drift

`standard-version` isn't wired yet (deferred); CHANGELOG.md is hand-maintained. If you forget, paste the `git log --oneline v0.1.0..v0.1.1` output into the GitHub Release body.

## Versioning policy

- **v0.x.y** — v1 development. v0.1.0 is the first public release.
- **v1.0.0** — ships once v0.x has been in real use ≥ 2 weeks without a critical bug AND the v1 done-state in `IMPLEMENTATION.md` §5 is met.
- **v2.0.0** — any breaking change to the public API surface (resources, events, terminal protocol — `API.md §9`), the introduction of remote backend, or team mode.

Pre-v1 commits use conventional commits (`feat:`, `fix:`, `refactor:`, etc.) so a future `standard-version` can auto-generate the changelog.
