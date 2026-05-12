import type { Phase, PhaseSkills, PhaseSkillsOverride, SkillDefinition } from "@vibemaestro/core";
import { PHASES } from "@vibemaestro/core";
import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  /** Live skill catalog from filesystem scan (agents.discoverSkills). */
  skills: SkillDefinition[];
};

const PHASE_LABEL: Record<Phase, string> = {
  planning: "Planning",
  running: "Implementing",
  reviewing: "Reviewing",
  complete: "Complete",
};

export function PhaseSkillEditor(props: Props) {
  return (
    <fieldset className="space-y-[var(--space-2)]">
      <legend className="text-caption text-text-secondary mb-[var(--space-2)]">Phases</legend>
      {PHASES.map((phase) => (
        <PhaseRow key={phase} phase={phase} {...props} />
      ))}
    </fieldset>
  );
}

function PhaseRow(props: Props & { phase: Phase }) {
  const { phase, skills } = props;
  const inherits = props.mode === "task" && !isOverridden(props.value, phase);
  const selected = getSelected(props, phase);
  const inheritedSkill = props.mode === "task" ? (props.inheritFrom[phase][0] ?? "") : "";

  const setValue = (next: string): void => {
    const list = next ? [next] : [];
    if (props.mode === "workspace") {
      props.onChange({ ...props.value, [phase]: list });
    } else {
      const overrideNext: NonNullable<PhaseSkillsOverride> = { ...(props.value ?? {}) };
      overrideNext[phase] = list;
      props.onChange(overrideNext);
    }
  };

  const clearOverride = (): void => {
    if (props.mode !== "task") return;
    const next = { ...(props.value ?? {}) };
    delete next[phase];
    props.onChange(Object.keys(next).length === 0 ? null : next);
  };

  return (
    <div className="flex items-center gap-[var(--space-3)]">
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
          onClick={() => setValue("")}
          title="Click to override; currently inheriting from workspace"
        >
          inherit{inheritedSkill ? ` (${inheritedSkill})` : ""}
        </button>
      ) : null}
      <div className="flex-1 min-w-0">
        <SkillCombobox
          phase={phase}
          value={selected}
          skills={skills}
          disabled={inherits}
          onChange={setValue}
        />
      </div>
      {props.mode === "task" && !inherits ? (
        <button
          type="button"
          className="text-caption text-text-tertiary hover:text-text-primary px-[var(--space-2)]"
          onClick={clearOverride}
          title="Revert to workspace default"
        >
          ↺
        </button>
      ) : null}
    </div>
  );
}

/**
 * Typeahead combobox. The user types into the input; the dropdown shows every
 * skill whose id (sans leading `/`) or display label contains the typed
 * query (case-insensitive), with prefix matches ranked above substring
 * matches. Arrow/Enter/Esc keyboard nav. ARIA combobox roles.
 */
function SkillCombobox({
  phase,
  value,
  skills,
  disabled,
  onChange,
}: {
  phase: Phase;
  value: string;
  skills: SkillDefinition[];
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  // `query` is what the user typed; when empty AND a value is selected we
  // render the selected skill in the input. Editing replaces the rendering.
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);

  // Reset query when value changes externally.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo<SkillDefinition[]>(() => {
    if (!query) return skills;
    const needle = query.toLowerCase().replace(/^\//, "");
    const prefix: SkillDefinition[] = [];
    const contains: SkillDefinition[] = [];
    for (const s of skills) {
      const idPart = s.id.replace(/^\//, "").toLowerCase();
      const labelPart = s.label.toLowerCase();
      if (idPart.startsWith(needle) || labelPart.startsWith(needle)) {
        prefix.push(s);
      } else if (idPart.includes(needle) || labelPart.includes(needle)) {
        contains.push(s);
      }
    }
    return [...prefix, ...contains];
  }, [query, skills]);

  // Keep focusIdx in range when filtered list changes.
  useEffect(() => {
    if (focusIdx >= filtered.length) setFocusIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, focusIdx]);

  // Display value: the typed query if the user is editing, otherwise the selected
  // skill's id, otherwise empty.
  const displayValue = open ? query : value;

  const pick = (skill: SkillDefinition | null): void => {
    onChange(skill?.id ?? "");
    setOpen(false);
    setQuery("");
    // Return focus to the trigger input.
    setTimeout(() => inputRef.current?.blur(), 0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setFocusIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const picked = filtered[focusIdx];
      if (picked) pick(picked);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center gap-[var(--space-2)]",
          "bg-surface-inset border border-border-subtle rounded-sm",
          "px-[var(--space-3)] py-[var(--space-2)]",
          disabled ? "opacity-50" : "focus-within:border-border-focus",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listboxId}-${focusIdx}` : undefined}
          value={displayValue}
          placeholder={disabled ? "(inheriting from workspace)" : "type to filter…"}
          disabled={disabled}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setFocusIdx(0);
          }}
          onKeyDown={handleKey}
          onBlur={() => {
            // Slight delay so click on a list item registers before blur closes.
            setTimeout(() => setOpen(false), 120);
          }}
          className="flex-1 bg-transparent text-meta text-text-primary font-mono outline-none disabled:cursor-not-allowed"
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => {
              e.preventDefault();
              pick(null);
            }}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={12} />
          </button>
        ) : null}
        <ChevronDown size={12} className="text-text-tertiary shrink-0" />
      </div>
      {open && !disabled ? (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={`Skills for ${PHASE_LABEL[phase]} phase`}
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+var(--space-1))] z-50",
            "max-h-[280px] overflow-y-auto",
            "bg-surface-raised border border-border-default rounded-sm",
          )}
          style={{ boxShadow: "var(--shadow-3)" }}
        >
          {filtered.length === 0 ? (
            <li className="px-[var(--space-3)] py-[var(--space-2)] text-meta text-text-tertiary italic">
              {skills.length === 0 ? "No skills discovered" : "No prefix match"}
            </li>
          ) : (
            filtered.map((skill, idx) => {
              const isActive = idx === focusIdx;
              const isSelected = skill.id === value;
              return (
                <li
                  key={skill.id}
                  id={`${listboxId}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  className={cn(
                    "flex items-center gap-[var(--space-2)] cursor-pointer",
                    "px-[var(--space-3)] py-[var(--space-2)]",
                    isActive ? "bg-surface-pressed" : "hover:bg-surface-pressed",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(skill);
                  }}
                  onMouseEnter={() => setFocusIdx(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(skill);
                    }
                  }}
                >
                  <span className="font-mono text-meta text-text-primary shrink-0">{skill.id}</span>
                  {skill.description ? (
                    <span className="text-caption text-text-tertiary truncate min-w-0">
                      {skill.description}
                    </span>
                  ) : null}
                  {isSelected ? (
                    <Check size={12} className="text-accent-base ml-auto shrink-0" />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

function getSelected(props: Props, phase: Phase): string {
  if (props.mode === "workspace") return props.value[phase][0] ?? "";
  if (isOverridden(props.value, phase)) return props.value?.[phase]?.[0] ?? "";
  return ""; // inheriting → input shows empty until user clicks the inherit pill
}

function isOverridden(value: PhaseSkillsOverride, phase: Phase): boolean {
  return value !== null && value !== undefined && value[phase] !== undefined;
}
