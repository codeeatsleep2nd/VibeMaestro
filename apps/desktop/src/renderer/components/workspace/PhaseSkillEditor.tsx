import type { Agent, Phase, PhaseSkills, PhaseSkillsOverride } from "@vibemaestro/core";
import { PHASES } from "@vibemaestro/core";
import { cn } from "../../lib/cn.js";

type WorkspaceMode = {
  mode: "workspace";
  value: PhaseSkills;
  onChange: (next: PhaseSkills) => void;
};

type TaskMode = {
  mode: "task";
  inheritFrom: PhaseSkills;
  value: PhaseSkillsOverride;
  onChange: (next: PhaseSkillsOverride) => void;
};

type Props = (WorkspaceMode | TaskMode) & {
  agent: Pick<Agent, "skills"> | null;
};

const PHASE_LABEL: Record<Phase, string> = {
  planning: "Planning",
  running: "Running",
  reviewing: "Reviewing",
  complete: "Complete",
};

/**
 * Single-select dropdown per phase (REV-S4: max 1 skill per phase). In task mode,
 * each row shows an "inherit" pill when no override is set — clicking it keeps
 * inheritance; selecting a skill creates an override for that phase.
 */
export function PhaseSkillEditor(props: Props) {
  const skills = props.agent?.skills ?? [];

  return (
    <fieldset className="space-y-[var(--space-2)]">
      <legend className="text-caption text-text-secondary mb-[var(--space-2)]">Phases</legend>
      {PHASES.map((phase) => {
        const selected = getSelected(props, phase);
        const inherits = props.mode === "task" && !isOverridden(props.value, phase);
        const inheritedSkill = props.mode === "task" ? (props.inheritFrom[phase][0] ?? "") : "";
        return (
          <div key={phase} className="flex items-center gap-[var(--space-3)]">
            <span className="text-meta text-text-secondary w-[78px] font-mono uppercase">
              {PHASE_LABEL[phase]}
            </span>
            {props.mode === "task" && inherits ? (
              <button
                type="button"
                className={cn(
                  "text-caption font-mono uppercase",
                  "border border-border-subtle rounded-xs",
                  "px-[var(--space-2)] py-[2px]",
                  "text-text-tertiary bg-surface-inset",
                  "hover:text-text-secondary hover:border-border-default",
                )}
                onClick={() => {
                  // Convert inherit → override (no-op skill list; user then picks).
                  setOverride(props, phase, []);
                }}
                title="Click to override; currently inheriting from workspace"
              >
                inherit{inheritedSkill ? ` (${inheritedSkill})` : ""}
              </button>
            ) : null}
            <select
              value={selected}
              onChange={(e) => {
                const next = e.target.value;
                if (props.mode === "workspace") {
                  props.onChange({
                    ...props.value,
                    [phase]: next ? [next] : [],
                  });
                } else {
                  setOverride(props, phase, next ? [next] : []);
                }
              }}
              className={cn(
                "flex-1 bg-surface-inset border border-border-subtle rounded-sm",
                "px-[var(--space-3)] py-[var(--space-2)] text-meta text-text-primary font-mono",
                "focus:border-border-focus focus:outline-none transition-colors",
                inherits ? "opacity-50" : "",
              )}
              disabled={inherits}
            >
              <option value="">— none —</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.label}
                </option>
              ))}
            </select>
            {props.mode === "task" && !inherits ? (
              <button
                type="button"
                className="text-caption text-text-tertiary hover:text-text-primary px-[var(--space-2)]"
                onClick={() => {
                  // Clear this phase from the override → fall back to inherit.
                  const next = { ...(props.value ?? {}) };
                  delete next[phase];
                  const isEmpty = Object.keys(next).length === 0;
                  props.onChange(isEmpty ? null : next);
                }}
                title="Revert to workspace default"
              >
                ↺
              </button>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

function getSelected(props: Props, phase: Phase): string {
  if (props.mode === "workspace") return props.value[phase][0] ?? "";
  if (isOverridden(props.value, phase)) return props.value?.[phase]?.[0] ?? "";
  return ""; // inheriting → select shows none until user clicks the inherit pill
}

function isOverridden(value: PhaseSkillsOverride, phase: Phase): boolean {
  return value !== null && value !== undefined && value[phase] !== undefined;
}

function setOverride(props: TaskMode, phase: Phase, value: string[]): void {
  const next: NonNullable<PhaseSkillsOverride> = { ...(props.value ?? {}) };
  next[phase] = value;
  props.onChange(next);
}
