/**
 * Read design-tokens.json and emit tokens.css for the renderer (and later, the
 * landing site). Keeps a single source of truth for color, typography, spacing,
 * motion, agent hues. Plan #6 hooks this into the dev pipeline.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type SpacingScale = Record<string, string>;
type RadiusScale = Record<string, string>;
type FontScale = Record<
  string,
  {
    size: string;
    lineHeight?: string;
    tracking?: string;
    weight?: number;
    family?: string;
    transform?: string;
  }
>;
type Motion = {
  duration: Record<string, string>;
  easing: Record<string, string>;
};
type Theme = {
  description: string;
  surface: Record<string, string>;
  text: Record<string, string>;
  border: Record<string, string>;
  accent: Record<string, string>;
  status: Record<string, string>;
  agent: Record<string, { label: string; monogram: string; hue: string; tier: "v1" | "future" }>;
  shadow: Record<string, string>;
};
type DesignTokens = {
  meta: { defaultTheme: string; themes: string[] };
  primitives: {
    spacing: SpacingScale;
    radius: RadiusScale;
    typography: {
      families: Record<string, string>;
      scale: FontScale;
    };
    motion: Motion;
  };
  themes: Record<string, Theme>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

function read(): DesignTokens {
  const raw = readFileSync(join(repoRoot, "design-tokens.json"), "utf8");
  return JSON.parse(raw) as DesignTokens;
}

function emitPrimitives(tokens: DesignTokens): string {
  const { spacing, radius, typography, motion } = tokens.primitives;
  const lines: string[] = [":root {"];
  for (const [k, v] of Object.entries(spacing)) lines.push(`  --space-${k}: ${v};`);
  for (const [k, v] of Object.entries(radius)) lines.push(`  --radius-${k}: ${v};`);
  for (const [k, v] of Object.entries(typography.families)) lines.push(`  --font-${k}: ${v};`);
  for (const [k, v] of Object.entries(typography.scale)) {
    lines.push(`  --text-${kebab(k)}-size: ${v.size};`);
    if (v.lineHeight) lines.push(`  --text-${kebab(k)}-line-height: ${v.lineHeight};`);
    if (v.tracking) lines.push(`  --text-${kebab(k)}-tracking: ${v.tracking};`);
    if (v.weight) lines.push(`  --text-${kebab(k)}-weight: ${v.weight};`);
  }
  for (const [k, v] of Object.entries(motion.duration)) lines.push(`  --duration-${k}: ${v};`);
  for (const [k, v] of Object.entries(motion.easing)) lines.push(`  --easing-${k}: ${v};`);
  lines.push("}");
  return lines.join("\n");
}

function emitTheme(name: string, theme: Theme, isDefault: boolean): string {
  const selector = isDefault ? `:root, [data-theme="${name}"]` : `[data-theme="${name}"]`;
  const lines: string[] = [`${selector} {`];
  for (const [k, v] of Object.entries(theme.surface)) lines.push(`  --surface-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(theme.text)) lines.push(`  --text-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(theme.border)) lines.push(`  --border-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(theme.accent)) lines.push(`  --accent-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(theme.status)) lines.push(`  --status-${kebab(k)}: ${v};`);
  for (const [agentId, agent] of Object.entries(theme.agent)) {
    lines.push(`  --agent-${agentId}: ${agent.hue};`);
  }
  for (const [k, v] of Object.entries(theme.shadow)) lines.push(`  --shadow-${k}: ${v};`);
  lines.push("}");
  return lines.join("\n");
}

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function emit(): string {
  const tokens = read();
  const blocks: string[] = [
    "/* GENERATED from design-tokens.json — do not edit by hand. */",
    "/* Regenerate with `bun run tokens`. */",
    "",
    emitPrimitives(tokens),
  ];
  for (const themeName of tokens.meta.themes) {
    const theme = tokens.themes[themeName];
    if (!theme) continue;
    blocks.push("");
    blocks.push(emitTheme(themeName, theme, themeName === tokens.meta.defaultTheme));
  }
  blocks.push("");
  return blocks.join("\n");
}

function write(target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, emit(), "utf8");
}

const targets = [
  resolve(repoRoot, "apps/desktop/src/renderer/styles/tokens.css"),
  resolve(repoRoot, "site/styles/tokens.css"),
];

for (const target of targets) {
  write(target);
  console.info(`wrote ${target}`);
}
