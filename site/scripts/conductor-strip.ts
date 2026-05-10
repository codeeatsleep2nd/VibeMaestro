/**
 * Animates the hero conductor strip with a 12-second loop. Matches the
 * shape of the desktop app's strip so visitors see the actual UX cadence.
 *
 * - 1 Hz tick updates elapsed times for two running rows.
 * - Action lines cycle through plausible agent operations every 3s.
 * - Honors prefers-reduced-motion: rows freeze, no pulse, no ticks.
 */

const ACTIONS_VM218 = [
  "Reading src/auth/sess",
  "Editing src/auth/sess",
  "Running pnpm tsc",
  "Running pnpm test",
];
const ACTIONS_VM219 = [
  "Editing src/util/fmt",
  "Running cargo build",
  "Reading docs/api.md",
  "Editing test/fmt.test.ts",
];

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduced) {
  let elapsed218 = 0;
  let elapsed219 = 0;
  const start = performance.now();

  const elapsedNode = (taskId: string) =>
    document.querySelector(`.elapsed[data-task="${taskId}"]`) as HTMLElement | null;
  const actionNode = (taskId: string) =>
    document.querySelector(`.action-line[data-task="${taskId}"]`) as HTMLElement | null;

  function fmt(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const r = seconds - m * 60;
    return `${m}m ${r}s`;
  }

  setInterval(() => {
    const ms = performance.now() - start;
    elapsed218 = Math.floor(ms / 1000) % 60;
    elapsed219 = (Math.floor(ms / 1000) + 11) % 90;
    const e218 = elapsedNode("VM-218");
    const e219 = elapsedNode("VM-219");
    if (e218) e218.textContent = fmt(elapsed218);
    if (e219) e219.textContent = fmt(elapsed219);
  }, 1000);

  // Cycle action lines every 3 s. Different offsets per task so they don't tick in lockstep.
  setInterval(() => {
    const idx = Math.floor((performance.now() / 3000) % ACTIONS_VM218.length);
    const a218 = actionNode("VM-218");
    if (a218) a218.textContent = ACTIONS_VM218[idx] ?? a218.textContent ?? "";
  }, 3000);
  setInterval(() => {
    const idx = Math.floor((performance.now() / 3000 + 1) % ACTIONS_VM219.length);
    const a219 = actionNode("VM-219");
    if (a219) a219.textContent = ACTIONS_VM219[idx] ?? a219.textContent ?? "";
  }, 3000);
}
