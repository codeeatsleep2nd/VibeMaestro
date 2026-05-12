import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type SkillDefinition, skillDefinitionSchema } from "@vibemaestro/core";
import { childLogger } from "./logger.js";

const log = childLogger({ module: "skill-discovery" });

/**
 * Validate a candidate against `skillDefinitionSchema` before adding it. The
 * schema is strict (kebab-case ids only); plugins in the wild include names
 * like `clean_gone`, `README`, `CI/CD`, and template placeholders that would
 * fail validation and poison the whole tRPC response. Drop them quietly.
 */
function safePut(byId: Map<string, SkillDefinition>, candidate: SkillDefinition): void {
  const parsed = skillDefinitionSchema.safeParse(candidate);
  if (!parsed.success) return;
  byId.set(parsed.data.id, parsed.data);
}

/**
 * Filesystem-driven discovery for everything Claude Code recognizes as a
 * slash-invokable: both **skills** (directories containing `SKILL.md`) and
 * **commands** (single `.md` files under a `commands/` directory). Both are
 * invoked the same way from a prompt (`/name`), so we surface them as one
 * flat list keyed by id.
 *
 * Scan locations:
 *   - `~/.claude/skills/<name>/SKILL.md` — user skills
 *   - `~/.claude/commands/<name>.md` — user commands
 *   - `~/.claude/plugins/marketplaces/.../skills/<name>/SKILL.md` — plugin skills
 *   - `~/.claude/plugins/marketplaces/.../commands/<name>.md` — plugin commands
 *   - `<workspace>/.claude/skills/<name>/SKILL.md` — project skills
 *   - `<workspace>/.claude/commands/<name>.md` — project commands
 *
 * Each file begins with YAML frontmatter; we parse `name:` (slug, optional) and
 * the first line of `description:` for display. Missing/unparseable frontmatter
 * falls back to the filename. Precedence: project > plugin > user (later sources
 * shadow earlier on id collision).
 */
export function discoverSkillsForClaudeCode(workspacePath: string | null): SkillDefinition[] {
  const byId = new Map<string, SkillDefinition>();

  const addSkillDir = (skillsDir: string): void => {
    if (!existsSync(skillsDir)) return;
    let entries: string[];
    try {
      entries = readdirSync(skillsDir);
    } catch (err) {
      log.warn(
        { dir: skillsDir, err: err instanceof Error ? err.message : String(err) },
        "skill scan failed",
      );
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const candidateDir = path.join(skillsDir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(candidateDir);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      const skillFile = path.join(candidateDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      const parsed = parseFrontmatter(skillFile);
      const slug = parsed.name ?? name;
      const id = `/${slug}`;
      safePut(byId, {
        id,
        label: parsed.name ?? name,
        ...(parsed.description ? { description: parsed.description } : {}),
      });
    }
  };

  const addCommandsDir = (commandsDir: string): void => {
    if (!existsSync(commandsDir)) return;
    let entries: string[];
    try {
      entries = readdirSync(commandsDir);
    } catch (err) {
      log.warn(
        { dir: commandsDir, err: err instanceof Error ? err.message : String(err) },
        "command scan failed",
      );
      return;
    }
    for (const fname of entries) {
      if (fname.startsWith(".") || !fname.endsWith(".md")) continue;
      const full = path.join(commandsDir, fname);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const name = fname.slice(0, -3); // strip ".md"
      const parsed = parseFrontmatter(full);
      const slug = parsed.name ?? name;
      const id = `/${slug}`;
      safePut(byId, {
        id,
        label: parsed.name ?? name,
        ...(parsed.description ? { description: parsed.description } : {}),
      });
    }
  };

  // 1. User-level skills + commands.
  addSkillDir(path.join(homedir(), ".claude/skills"));
  addCommandsDir(path.join(homedir(), ".claude/commands"));

  // 2. Plugin marketplace skills + commands. Plugin layouts vary; walk both
  //    SKILL.md and commands/<name>.md files under the plugin roots.
  const pluginRoots = [
    path.join(homedir(), ".claude/plugins/marketplaces"),
    path.join(homedir(), ".claude/plugins/cache"),
  ];
  for (const root of pluginRoots) {
    if (!existsSync(root)) continue;
    for (const skillFile of walkSkillFiles(root, 7)) {
      const dir = path.dirname(skillFile);
      const name = path.basename(dir);
      const parsed = parseFrontmatter(skillFile);
      const slug = parsed.name ?? name;
      const id = `/${slug}`;
      if (byId.has(id)) continue; // user already won
      safePut(byId, {
        id,
        label: parsed.name ?? name,
        ...(parsed.description ? { description: parsed.description } : {}),
      });
    }
    for (const cmdFile of walkCommandFiles(root, 7)) {
      const fname = path.basename(cmdFile);
      const name = fname.slice(0, -3);
      const parsed = parseFrontmatter(cmdFile);
      const slug = parsed.name ?? name;
      const id = `/${slug}`;
      if (byId.has(id)) continue;
      safePut(byId, {
        id,
        label: parsed.name ?? name,
        ...(parsed.description ? { description: parsed.description } : {}),
      });
    }
  }

  // 3. Project-local skills + commands (last → shadow everything above).
  if (workspacePath) {
    addSkillDir(path.join(workspacePath, ".claude/skills"));
    addCommandsDir(path.join(workspacePath, ".claude/commands"));
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Parse the YAML frontmatter at the top of a SKILL.md or command `.md` file.
 * We only need `name` and the first line of `description`, so a hand-rolled
 * tolerant parser is cheaper and friendlier to malformed files than pulling
 * in a yaml dep.
 */
function parseFrontmatter(file: string): { name?: string; description?: string } {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end < 0) return {};
  const block = content.slice(3, end);

  const out: { name?: string; description?: string } = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const nameMatch = line.match(/^name:\s*(.*?)\s*$/);
    if (nameMatch?.[1]) {
      out.name = nameMatch[1].replace(/^["']|["']$/g, "");
      continue;
    }
    const descMatch = line.match(/^description:\s*(.*?)\s*$/);
    if (descMatch) {
      let desc = descMatch[1] ?? "";
      // Multi-line `description: |` blocks — grab the first non-empty content line.
      if (desc === "|" || desc === ">") {
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j];
          if (next === undefined) break;
          const trimmed = next.replace(/^\s+/, "");
          if (trimmed === "") continue;
          if (!next.startsWith(" ")) break; // out of indented block
          desc = trimmed;
          break;
        }
      } else {
        desc = desc.replace(/^["']|["']$/g, "");
      }
      // Keep just the first sentence-ish for the picker preview.
      out.description = desc
        .split(/\.\s|\n/)[0]
        ?.trim()
        .slice(0, 160);
    }
  }
  return out;
}

/**
 * Walk a directory tree up to `maxDepth` deep, yielding paths to every
 * `SKILL.md` whose parent is a `skills/<name>/` segment. We cap depth so a
 * stray symlink doesn't recurse forever.
 */
function* walkSkillFiles(root: string, maxDepth: number): Generator<string> {
  if (maxDepth < 0) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const full = path.join(root, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isFile()) {
      if (name === "SKILL.md" && path.basename(path.dirname(path.dirname(full))) === "skills") {
        yield full;
      }
      continue;
    }
    if (st.isDirectory()) {
      yield* walkSkillFiles(full, maxDepth - 1);
    }
  }
}

/**
 * Walk a directory tree up to `maxDepth` deep, yielding paths to every
 * `*.md` file whose parent directory is named `commands`.
 */
function* walkCommandFiles(root: string, maxDepth: number): Generator<string> {
  if (maxDepth < 0) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const full = path.join(root, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isFile()) {
      if (name.endsWith(".md") && path.basename(path.dirname(full)) === "commands") {
        yield full;
      }
      continue;
    }
    if (st.isDirectory()) {
      yield* walkCommandFiles(full, maxDepth - 1);
    }
  }
}
