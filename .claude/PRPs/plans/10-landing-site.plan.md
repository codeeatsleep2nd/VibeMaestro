# Plan 10: Landing Site (vibemaestro.dev)

## Summary
Net-new editorial landing page that introduces VibeMaestro to the world. Lives in a new `site/` directory at the repo root, shares design tokens with the app via `design-tokens.json`, ships as static HTML/CSS/JS (no framework, no SSR runtime, no JS-heavy bundles). Hosted on Cloudflare Pages (or GitHub Pages as fallback). Editorial direction: terminal-dark inherited from DESIGN.md, but with hero-driven brand-first posture rather than the app's dense board-first posture. One memorable moment: a live, animated conductor strip that mirrors the real product's most distinctive surface.

## User Story
As a developer who just heard about VibeMaestro on Hacker News,
I want to land on a page that immediately tells me what this is, why it's different, and what installing it would feel like,
So that within 15 seconds I either close the tab or click Download — never "scroll for 2 minutes wondering what this product does."

## Problem → Solution
- **Current state:** The repo has a 12-line `README.md` whose only meaningful content is a "Buy Me a Coffee" button. The product has no public face. A potential user discovers nothing about what VibeMaestro is, what it looks like, or whether it's for them — they have to read 600 lines of `DESIGN.md` to find out.
- **Desired state:** `https://vibemaestro.dev` (or the GitHub Pages URL) opens to an editorial landing page that:
  1. Names the product and what it does in the first viewport — no scroll required.
  2. Shows the conductor strip in motion — the most distinctive surface of the product, animated with real-feeling agent activity.
  3. Tells the agent-first PM story in one screen of editorial copy + one composed visual.
  4. Has one CTA: download. Auto-detects the visitor's OS and serves the right installer link from the latest GitHub Release (plan #9).
  5. Loads in <1.5s on cable, scores ≥95 on Lighthouse Performance / Accessibility / Best Practices / SEO.
  6. Looks unmistakably like VibeMaestro — terminal-dark, amber accent, JetBrains Mono moments, the same visual character as the app.

## Metadata
- **Complexity:** Medium
- **Source PRD:** N/A — derived from the project's "no public face" gap and the /frontend-design skill direction
- **PRD Phase:** N/A — independent track, can ship in parallel with plans #1-#9 (no dependency on app code)
- **Estimated Files:** ~14
- **Confidence Score:** 8/10 — well-trodden territory (static editorial site, vanilla CSS); main risk is the conductor-strip animation feeling like a fake demo rather than the real product

---

## Visual Direction

**Editorial, not SaaS.** Rejection list:

| Pattern | Why rejected |
|---|---|
| Centered hero with gradient blob + "Get started" CTA | DESIGN.md §15 anti-pattern; reads as generic AI-app slop |
| 3-column feature grid with icons in colored circles | The single most recognizable AI-generated layout |
| Stock screenshot of the app on a tilted laptop | Doesn't match the product's terminal-console character |
| Dark-mode toggle in the topbar | The app's `paper-light` is internal-verifier-only; landing should not pretend a light theme exists |
| Carousel of "what users say" testimonials | Pre-launch product, no real users yet, faking them is anti-trust |
| Animated number counters ("10M tasks shipped!") | Same |

**Adopted direction:** **terminal-dark editorial.** Magazine-style composition, asymmetric grid, JetBrains Mono for the masthead and one big display moment, Inter for the editorial body. One ambient motion (the live conductor strip). One bold typographic moment (the masthead). Otherwise, restraint.

### Hero composition

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▎▆▇  VibeMaestro                                          [github] [download]│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│  AGENT-FIRST                       │   NOW CONDUCTING                        │
│  PROJECT                           │   ┌─────────────────────────────────┐   │
│  MANAGEMENT                        │   │ [CC] running VM-218 · 2:14      │   │
│  FOR HUMANS WHO                    │   │      › Reading src/auth/sess…   │   │
│  DELEGATE TO                       │   │ [CX] running VM-219 · 0:41      │   │
│  CLAUDE CODE                       │   │      › Running pnpm test        │   │
│  AND CODEX.                        │   │ [—]  VM-211 ready for review    │   │
│                                    │   └─────────────────────────────────┘   │
│  Local. Single-binary.             │                                         │
│  Open source.                      │   (live, animated)                      │
│                                    │                                         │
│  [Download for macOS]              │                                         │
│  Other platforms ↓                 │                                         │
│                                    │                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Left column (60%):** the masthead in `display` token (clamp 28→80px), JetBrains Mono, weight 500. Tracking tightened (-0.02em). One supporting line in `body-lg` Inter. Primary CTA in `accent.base` (the amber).
- **Right column (40%):** a *live* mini-conductor-strip that animates the rows in a 12-second loop. Real PTY-style typography. Uses the same `surface.raised` + `border.subtle` + agent chips as the real app. This is the one bold visual moment.
- **Composition:** asymmetric 60/40 split. No symmetry.
- **Background:** `surface.base` plus a faint repeating linear-gradient at 0.025 opacity ("the staff lines") at 6vh spacing — quiet nod to the app's board grid, not decorative.

### Below the hero (one screen of editorial copy)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  WHY                                                                         │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  You have agents now. You don't have a place to put them.                    │
│                                                                              │
│  Linear and Asana were built for humans who do the work. When the work is    │
│  done by a Claude Code or Codex session you spawned, the dashboard you       │
│  want is different. You don't need assignees. You need to see which agent    │
│  is on which task, what it's doing right now, and how long it has been at    │
│  it. You need to approve its diff and move on.                               │
│                                                                              │
│  The board is the product. The agent is the worker. You are the conductor.  │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  HOW                                                                         │
│                                                                              │
│  Drop a one-liner. Pick an agent. Press ⌘⏎. Watch it work in a real         │
│  terminal. Approve when it's done.                                           │
│                                                                              │
│  Everything is local. SQLite holds your tasks. Your agents run as           │
│  subprocesses. There is no cloud, no account, no telemetry, no API key      │
│  going to a third party. Open the dev tools and audit it yourself.          │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  WHAT                                                                        │
│                                                                              │
│  Built on Bun + Electron + tRPC + Drizzle + SQLite. xterm.js attached to    │
│  the agent's PTY over IPC. Less than 200 KB of JavaScript on the wire when  │
│  the board is rendering.                                                     │
│                                                                              │
│  Open source under the MIT license. Pull requests welcome.                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Three sections: WHY, HOW, WHAT. Each headed by a single-word `display` token in JetBrains Mono with a `border.subtle` rule above. Body text in Inter `body-lg` (16px / 1.55) on `surface.base`. Max-width 64ch for readability.
- One-column layout. No cards, no icons-in-circles, no feature grid. Just typeset prose.
- The first sentence of WHY is the hook: "You have agents now. You don't have a place to put them." Memorable, opinionated, not generic.

### Footer

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ▎▆▇  VibeMaestro · MIT · 2026                                               │
│                                                                              │
│  [github]  [releases]  [DESIGN.md]  [API.md]  [report a bug]                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

Minimal. `meta` mono, `text.secondary`. No newsletter signup, no social grid, no "made with love." The links are functional, not decorative.

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `DESIGN.md` | §1 (framing), §2 (terminal-dark), §4 (color), §7 (typography), §15 (anti-patterns) | The visual system to inherit |
| **P0** | `design-tokens.json` | full | Token source the landing imports for color/type/spacing/motion |
| **P0** | `assets/logo.svg` | full | The mark that anchors the masthead and footer |
| **P0** | `design-preview.html` | full | The reference render of the design system; mine for class names and motion timings |
| **P1** | `.claude/PRPs/plans/09-packaging-release.plan.md` | "RELEASE_TRIGGER_PATTERN" | The Download CTA targets GitHub Releases — needs to follow the release shape |
| **P2** | `CLAUDE.md` | "Style & visual" rules | The anti-pattern list this site must respect |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **Cloudflare Pages** | `developers.cloudflare.com/pages` | — | Static site host with global CDN, free for projects this size. Connects to GitHub repo, builds on push. |
| **GitHub Pages (fallback)** | `pages.github.com` | — | Free static hosting if Cloudflare Pages isn't viable. Slower (no edge cache), HTTPS via Let's Encrypt. |
| **GitHub Releases API** | `docs.github.com/en/rest/releases` | — | The Download CTA reads `/repos/codeeatsleep2nd/VibeMaestro/releases/latest` at page-load time to populate platform-specific download links. Cached aggressively. |
| **Lighthouse CI** | `github.com/GoogleChrome/lighthouse-ci` | `^0.13` | Gates the deploy on perf/a11y/SEO scores. Runs in GitHub Actions before Cloudflare Pages publishes. |
| **OKLCH browser support** | `caniuse.com/css-oklch` | — | Chrome 111+, Safari 16.4+, Firefox 113+. Same constraint as the app (DESIGN.md §14). PostCSS plugin emits RGB fallbacks. |
| **prefers-reduced-motion** | `developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion` | — | The conductor-strip animation collapses to static when the visitor prefers reduced motion. |

```
KEY_INSIGHT: Static HTML + vanilla CSS + a tiny script for the conductor-strip
            animation is enough. Do NOT introduce React, Next.js, Astro, or
            any framework for this surface. The whole site is < 50 KB JS budget.
APPLIES_TO: site/ entry point
GOTCHA:     Resist the temptation to use the app's React stack "for consistency."
            The app is React because it has live state. The landing has none.

KEY_INSIGHT: The conductor-strip animation must use the same tokens as the
            real app, not parallel hand-tuned values. If DESIGN.md changes
            agent.claude-code's hue, the landing's animation should pick it up.
APPLIES_TO: site/scripts/conductor-strip.ts
GOTCHA:     Generate site/styles/tokens.css from design-tokens.json at build
            time using the same generator pattern plan #6 will use. The site
            and the app share that one generator.

KEY_INSIGHT: The Download CTA's "Download for macOS" auto-detection runs in JS
            (navigator.platform / userAgent client hints). Fall back to a
            "Choose your platform" disclosure when JS is disabled or the
            platform is unrecognized.
APPLIES_TO: Hero CTA
GOTCHA:     Do NOT ship a separate /downloads page. The disclosure expands
            inline below the primary CTA. One page, one journey.

KEY_INSIGHT: GitHub Releases for an unreleased project is empty. Until plan #9
            ships v0.1.0, the Download CTA reads "Coming soon" and the
            disclosure shows "Build from source" with the bun-dev instructions.
APPLIES_TO: Hero CTA fallback
GOTCHA:     Don't ship the landing site BEFORE plan #9 unless this fallback
            is implemented and honest. Otherwise users hit a dead Download
            link the first time they visit.
```

---

## Patterns to Establish

### TOKEN_SHARING_PATTERN — landing site reads from design-tokens.json

```
design-tokens.json  ←──── single source of truth
        ↓
        ├── apps/desktop/src/renderer/styles/tokens.css   (plan #6 generates)
        └── site/styles/tokens.css                        (this plan generates)
```

Both sides run the same generator (`scripts/generate-tokens.ts`, lifted from plan #6). The site's `tokens.css` is committed (no build dependency at deploy time) but regenerated whenever `design-tokens.json` changes — a `lint-tokens-css` script in CI catches drift, identical to plan #6's pattern.

### EDITORIAL_LAYOUT_PATTERN — asymmetric grid + max-width

The hero uses CSS Grid with explicit `grid-template-columns: 6fr 4fr` (60/40 split). The body sections use a single column with `max-width: 64ch` for prose readability. Both centered with `margin-inline: auto`. No fancy multi-column page-wide layouts — keep the editorial focus.

```css
.hero {
  display: grid;
  grid-template-columns: 6fr 4fr;
  gap: var(--space-7);
}

.editorial-body {
  max-width: 64ch;
  margin-inline: auto;
}
```

At < 768px, the hero collapses to single column (the conductor strip moves below the masthead). The breakpoint is the only responsive tweak; the editorial body is naturally fluid via `ch`-based max-width.

### CONDUCTOR_LIVE_PATTERN — animation that mirrors the real product

The animated conductor strip in the hero is built from the same DOM shapes as the app's real conductor strip (DESIGN.md §10):

- 3 rows: 2 running with action lines, 1 ready-for-review (no action line)
- 12-second loop: row 1's elapsed time ticks 0:00 → 0:11; row 2's ticks 0:00 → 0:08; the action line on row 1 cycles through 4 fake actions ("Reading src/auth/sess...", "Editing src/auth/sess...", "Running pnpm tsc", "Running pnpm test"); on the 11th second the third row appears with a 480ms fade.
- Animation timing uses the app's motion tokens (`duration.slow`, `easing.emphasized`).
- `prefers-reduced-motion: reduce` collapses the animation: rows are static, elapsed times are fixed at "2:14" / "0:41" / "—", no action cycling.

This is the page's one bold motion moment. Don't add scroll-reveal animations, parallax, or hover micro-interactions anywhere else.

---

## Files to Change

### New `site/` directory (top-level)

| File | Action | Why |
|---|---|---|
| `site/index.html` | CREATE | The single page. Semantic HTML5: `<header>`, `<main>` with `<section>` per editorial block, `<footer>`. |
| `site/styles/tokens.css` | CREATE (generated) | Output of `scripts/generate-tokens.ts` against `design-tokens.json`. Do NOT hand-edit. |
| `site/styles/landing.css` | CREATE | Hand-written CSS for hero composition, editorial body layout, footer. References tokens via `var(--*)`. ~250 lines. |
| `site/scripts/conductor-strip.ts` | CREATE | The 12-second animation loop. Vanilla TypeScript, compiled to ~3 KB of JS. Uses `requestAnimationFrame` with a single timeline. |
| `site/scripts/download-cta.ts` | CREATE | Detects visitor platform, fetches GitHub Releases latest, populates download links. ~2 KB. Cached via `Cache-Control: public, max-age=300`. |
| `site/assets/logo.svg` | LINK or COPY | Same mark as `assets/logo.svg`. Inline into `index.html` for first-paint. |
| `site/assets/og-image.png` | CREATE | 1200×630 PNG for social previews. Renders the masthead + a single conductor row. |
| `site/favicon.ico` | CREATE | 32×32 + 16×16 multi-size favicon derived from `assets/logo.svg`. |
| `site/robots.txt` | CREATE | `User-agent: * / Allow: /`. Sitemap link. |
| `site/sitemap.xml` | CREATE | Single URL (the homepage). |

### Build / deploy

| File | Action | Why |
|---|---|---|
| `scripts/generate-tokens.ts` | CREATE (or REUSE from plan #6 if it lands first) | Reads `design-tokens.json`, emits CSS variable blocks for both `apps/desktop/src/renderer/styles/tokens.css` and `site/styles/tokens.css`. |
| `.github/workflows/deploy-site.yml` | CREATE | On push to `main` touching `site/**` or `design-tokens.json`: regenerate tokens, run Lighthouse CI, deploy to Cloudflare Pages (or GitHub Pages). |
| `package.json` | UPDATE | Add `site:dev` (serves `site/` via `bunx serve`), `site:build` (regenerate tokens + minify), `site:lighthouse` scripts. |

### Documentation

| File | Action | Why |
|---|---|---|
| `README.md` | UPDATE | Replace the current 12-line stub with a real README. Top: "VibeMaestro — agent-first PM. https://vibemaestro.dev". Then "Why / How / What" mirroring the landing copy. Download links + build-from-source. The project's GitHub README and the landing site share copy and tone. |
| `CLAUDE.md` | UPDATE | Add a "Landing site" section: lives in `site/`, vanilla static, no React, do not introduce a framework, copy mirrors the README. |

---

## NOT Building

- **Multi-page site.** No `/about`, `/docs`, `/blog`. The landing IS the site. Documentation lives in the repo (DESIGN.md, API.md, plan files); the landing links to GitHub for them.
- **Newsletter / email capture.** No mailing list. No popup. No "join our community." Open-source projects don't need email lists; they have GitHub Stars and repo Watch.
- **Analytics.** No GA, no Plausible, no Fathom in v1. If the project later wants pageview signal, add it intentionally with a single self-hosted script, not third-party tracking.
- **Localization.** English only. Add when there's a non-English contributor base.
- **A11y beyond the basics.** The site uses semantic HTML, alt text, focus states from the app's `border.focus`, and keyboard-navigable links. No screen-reader-specific testing pass in v1; revisit if needed.
- **CMS / authoring system.** Copy is in `site/index.html`. To change copy, edit the HTML. No CMS, no Markdown pipeline.
- **Custom domain in v1.** Ships at `codeeatsleep2nd.github.io/VibeMaestro` (GitHub Pages) or the Cloudflare Pages auto-URL. `vibemaestro.dev` purchase + DNS setup is a separate task; don't gate the launch on it.
- **Dark/light theme switch.** The site is terminal-dark only. The app's `paper-light` is internal-verifier-only (DESIGN.md §3 post-CEO-review); the landing should not pretend a light mode exists.

---

## Step-by-Step Tasks

### Task 1: `site/` directory + minimal index.html
- **IMPLEMENT:** Create `site/`. Add `index.html` with the semantic skeleton: `<head>` (title, meta description, og:image, favicon, link to tokens.css + landing.css), `<header>` (logo + github + download nav), `<main>` (hero, why, how, what sections), `<footer>`. No styles or content yet — just the structure.
- **VALIDATE:** `bunx serve site/` opens the page; structure renders; tokens.css and landing.css 404 (expected).

### Task 2: Token generator + tokens.css
- **IMPLEMENT:** Create `scripts/generate-tokens.ts`. Reads `design-tokens.json`, outputs `site/styles/tokens.css` (and later, `apps/desktop/src/renderer/styles/tokens.css` per plan #6 — keep them aligned by sharing the generator). For the landing, only emit the `terminal-dark` theme — no theme switch needed.
- **VALIDATE:** Run the generator. `tokens.css` has all expected `--surface-*`, `--text-*`, `--accent-*`, `--space-*`, etc. variables. Hand-diff a few against `design-preview.html`'s `<style>` block.

### Task 3: Hero composition (landing.css)
- **IMPLEMENT:** Write `site/styles/landing.css`. Hero uses CSS Grid 6fr/4fr split. Masthead in `var(--font-display)` with the agent-first copy (clamp 28-80px). Background gets the staff-line gradient (`background: var(--surface-base) repeating-linear-gradient(...)`). Primary CTA styled per DESIGN.md §10 buttons. The conductor-strip placeholder is a static `<div>` with the 3 rows of fake content for now.
- **VALIDATE:** Static hero renders correctly at 1280px wide. Visual sanity-check against the ASCII mockup above.

### Task 4: Editorial body sections
- **IMPLEMENT:** WHY, HOW, WHAT sections. Single-column, `max-width: 64ch`, centered. Section headings in `display` token, hairline rule above (`border-top: 1px solid var(--border-subtle)`), body in `body-lg` Inter. Real copy as drafted in the Visual Direction section above.
- **VALIDATE:** Reads cleanly. Line length comfortable. No widows/orphans on standard window sizes.

### Task 5: Footer
- **IMPLEMENT:** Single-row footer with logo + links. `meta` mono, `text.secondary`. Links: GitHub repo, Releases, DESIGN.md, API.md, "report a bug" (links to GitHub Issues new).
- **VALIDATE:** Renders correctly. All links resolve.

### Task 6: Live conductor strip animation
- **IMPLEMENT:** Create `site/scripts/conductor-strip.ts`. Implements the 12-second loop per CONDUCTOR_LIVE_PATTERN. Uses `requestAnimationFrame`, a single timeline, no animation library. Compiles to vanilla JS via Bun (`bun build site/scripts/conductor-strip.ts --outfile site/scripts/conductor-strip.js --minify`). Inline-includes via `<script type="module" defer src="...">`.
- **GOTCHA:** Use `prefers-reduced-motion: reduce` media query to short-circuit the animation in CSS. The JS still runs (sets initial state) but doesn't animate.
- **VALIDATE:** Open the site, watch the loop. Action line cycles through 4 strings. Elapsed time ticks. Third row fades in. Loop restarts. With `prefers-reduced-motion: reduce` set in DevTools, the strip is static.

### Task 7: Download CTA + GitHub Releases integration
- **IMPLEMENT:** Create `site/scripts/download-cta.ts`. On page load: (a) detect platform via `navigator.userAgentData?.platform || navigator.platform`, (b) fetch `https://api.github.com/repos/codeeatsleep2nd/VibeMaestro/releases/latest` (cached 5 min via `fetch({ cache: 'force-cache' })`), (c) find the asset matching the detected platform (`.dmg` for mac, `.exe` for win, `.AppImage` for linux), (d) wire the primary CTA href to that asset URL. If no release exists yet (pre-plan-#9 launch), the CTA reads "Coming soon — build from source ↓" and the disclosure shows the bun-dev instructions.
- **VALIDATE:** Mock a release locally; CTA detects platform correctly on macOS/Windows/Linux. With the real GitHub API (which currently has no releases), the CTA falls back to "Coming soon" gracefully.

### Task 8: OG image + favicon + robots/sitemap
- **IMPLEMENT:** Generate `site/assets/og-image.png` (1200×630, terminal-dark, masthead + one conductor row). Generate `site/favicon.ico` (multi-size from logo.svg). Write `robots.txt` + `sitemap.xml`.
- **VALIDATE:** Run the page through https://www.opengraph.xyz/ and verify the og-image renders correctly.

### Task 9: Lighthouse CI configuration
- **IMPLEMENT:** Add `lighthouserc.json` at the repo root. Targets: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. Asserts on every build.
- **VALIDATE:** `bunx @lhci/cli autorun` against the local `bunx serve site/` — all four scores ≥ 95.

### Task 10: Cloudflare Pages deploy workflow
- **IMPLEMENT:** Create `.github/workflows/deploy-site.yml`. On push to `main` touching `site/**` or `design-tokens.json` or `scripts/generate-tokens.ts`: regenerate tokens, build, run Lighthouse CI (must pass), deploy to Cloudflare Pages via the `cloudflare/pages-action@v1` action. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- **FALLBACK:** If Cloudflare Pages isn't available, deploy to GitHub Pages instead via `actions/deploy-pages`. Document which path is active in `RELEASING.md`.
- **VALIDATE:** Push the branch; deploy succeeds; the live URL renders the page identically to local.

### Task 11: README.md rewrite
- **IMPLEMENT:** Replace the current 12-line `README.md` with the real README. Same WHY/HOW/WHAT structure as the landing. Add Download section, Build-from-source section, Documentation section linking DESIGN.md / API.md / plans, Contributing section, License section. Tone matches the landing.
- **VALIDATE:** Reads cleanly on github.com/codeeatsleep2nd/VibeMaestro. Mobile (GitHub mobile app) view checks out.

### Task 12: Tests
- **IMPLEMENT:** No traditional test framework for static HTML — Lighthouse CI is the test. Add `site/test/visual.spec.ts` (Playwright) that loads the local site and screenshots the hero + WHY section + footer at three viewports (320, 768, 1280). Stored as baselines; visual regression fails CI on diff > 1%.
- **VALIDATE:** `bun run site:test` runs visual specs; all three baselines match.

### Task 13: CLAUDE.md update
- **IMPLEMENT:** Add a "Landing site" section to CLAUDE.md: lives in `site/`, vanilla static, no React or framework, copy mirrors the README, tokens shared via `scripts/generate-tokens.ts`, deploy on push to `main` touching `site/**`.
- **VALIDATE:** Reads correctly.

### Task 14: Final validation
- **ACTION:** Per "Validation Commands" below.

---

## Testing Strategy

### Visual
- Playwright visual regression: hero / why / how / what / footer at 320, 768, 1280
- Lighthouse CI gates the deploy (≥ 95 on all four metrics)

### Functional
- Conductor-strip animation loops correctly; reduced-motion path renders static
- Download CTA detects platform on macOS / Windows / Linux UA strings
- Download CTA falls back to "Coming soon" when GitHub Releases is empty

### Accessibility
- Lighthouse a11y ≥ 95
- Tab through the page: every interactive element has a visible focus ring
- Page renders cleanly with `prefers-reduced-motion: reduce`

### Browser support
- Chrome 111+, Safari 16.4+, Firefox 113+ (matches DESIGN.md §14)
- PostCSS plugin emits OKLCH RGB fallbacks for older browsers (page degrades gracefully, doesn't break)

---

## Validation Commands

```bash
# Local dev
bunx serve site/

# Generate tokens
bun run scripts/generate-tokens.ts

# Build (minify, generate tokens, copy to dist/)
bun run site:build

# Lighthouse
bun run site:lighthouse

# Visual regression
bun run site:test
```

---

## Acceptance Criteria

- [ ] All 14 tasks completed
- [ ] `https://<deployed-url>` renders the landing page
- [ ] Lighthouse: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95
- [ ] Conductor-strip animation runs on page load; collapses to static under `prefers-reduced-motion: reduce`
- [ ] Download CTA: detects visitor platform, links to the right GitHub Releases asset (or "Coming soon" pre-plan-#9)
- [ ] No JavaScript framework dependencies (React/Vue/Svelte); JS bundle ≤ 50 KB total
- [ ] Visual regression baselines committed; CI fails on > 1% pixel diff
- [ ] README.md rewritten in the same tone as the landing
- [ ] OG image renders correctly on Twitter / LinkedIn / Slack previews

## Completion Checklist

- [ ] No raw `px` values in `landing.css` — everything goes through tokens
- [ ] No third-party fonts loaded except Inter + JetBrains Mono (already used by the app)
- [ ] No third-party analytics, no third-party scripts of any kind
- [ ] No anti-pattern violations from DESIGN.md §15 or CLAUDE.md (no gradients on UI surfaces, no glass cards, no decorative blobs, no purple→indigo gradients, no 3-column feature grid)
- [ ] All copy passes the "this could not be confused with any other product" test
- [ ] Mobile (< 640px) rendering is intentional, not just "stacked desktop"
- [ ] Site loads with JS disabled (graceful degradation: hero is static, download CTA shows "View releases" disclosure linking to GitHub)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Conductor-strip animation feels like a fake demo | Medium | Medium (undermines product trust) | Use the real app's tokens; sync motion timings exactly; test side-by-side with `design-preview.html` |
| Cloudflare Pages quota / availability issues | Low | Low | GitHub Pages fallback documented in Task 10 |
| Lighthouse Perf < 95 due to OG image weight | Medium | Low | Compress og-image.png (target < 100 KB); use `loading="lazy"` for any below-the-fold imagery |
| GitHub Releases API rate limit on high-traffic days | Low | Low | Cache aggressively (5-min `Cache-Control`); fall back to a static "View releases" link if the fetch fails |
| Site ships before plan #9 → broken Download CTA | High (if shipped early) | High (first impression) | Task 7's "Coming soon" fallback handles this; do NOT remove the fallback until plan #9 has shipped at least one release |
| Copy lands as generic SaaS-speak | Medium | High (defeats the whole point) | The Visual Direction section above gives the actual copy; don't paraphrase it into corporate language at implementation time |

## Notes

### Plan-#10 → app contract

This plan does NOT depend on plans #1-#9. It can ship in parallel. But:
- It SHARES `design-tokens.json` and `assets/logo.svg` with the app — changes to those land here too
- The Download CTA depends on plan #9 having shipped at least one GitHub Release; until then, the "Coming soon" fallback is active
- The README rewrite (Task 11) supersedes anything plans #1-#9 add to README — coordinate so the final README is the landing-tone one

### Shared generator with plan #6

`scripts/generate-tokens.ts` is created in this plan AND specced in plan #6. Whichever plan ships first creates the script; the other reuses it. Add a CLAUDE.md note when the first one lands so the second doesn't duplicate.

### Cost reality

- Cloudflare Pages: free tier covers everything this site needs
- GitHub Pages: free
- Custom domain (`vibemaestro.dev`): ~$15/yr at Namecheap or similar (deferred from v1)
- Lighthouse CI: free (runs in GitHub Actions)

If the project stays on the free auto-URL, $0/yr.

### Self-contained guarantee

No required reads outside this plan, `DESIGN.md`, `design-tokens.json`, `assets/logo.svg`, `design-preview.html`, plan #9 (for the Download CTA contract), `CLAUDE.md`.
