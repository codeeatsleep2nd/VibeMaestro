import type { TaskStatus } from "@vibemaestro/core";
import { cn } from "../../lib/cn.js";

type Props = {
  status: TaskStatus;
  size?: number;
  withLabel?: boolean;
};

/**
 * Color + shape encoding per DESIGN.md §13 (color-blind safety):
 *   idle      — open ring (no fill)
 *   running   — filled dot + pulse ring (motion-safe: static ring on prefers-reduced-motion)
 *   review    — filled dot + outer ring (no animation)
 *   complete  — filled dot only
 *   blocked   — triangle (NOT a dot — shape changes for color-blind safety)
 *   error     — filled dot + bordered square halo
 */
export function StatusIndicator({ status, size = 12, withLabel = false }: Props) {
  const label = labelFor(status);
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-2 align-middle">
      {status === "blocked" ? <Triangle size={size} /> : <Dot status={status} size={size} />}
      {withLabel && <span className="text-meta text-text-secondary">{label}</span>}
    </span>
  );
}

function labelFor(s: TaskStatus): string {
  switch (s) {
    case "running":
      return "Implementing";
    case "reviewing":
      return "Awaiting review";
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    case "error":
      return "Error";
    case "backlog":
      return "Planning";
  }
}

function Dot({ status, size }: { status: TaskStatus; size: number }) {
  const color = `var(--status-${status === "backlog" ? "idle" : status})`;
  const haloRing =
    status === "running" || status === "reviewing"
      ? `0 0 0 1.5px color-mix(in oklch, ${color} 60%, transparent)`
      : status === "error"
        ? `0 0 0 2px color-mix(in oklch, ${color} 40%, transparent)`
        : "none";
  return (
    <span
      className={cn("relative inline-block", status === "running" && "vm-pulse-status")}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        backgroundColor: status === "backlog" ? "transparent" : color,
        boxShadow: haloRing,
        border: status === "backlog" ? `1.5px solid ${color}` : "none",
      }}
    />
  );
}

function Triangle({ size }: { size: number }) {
  const color = "var(--status-blocked)";
  return (
    <svg
      width={size + 2}
      height={size + 2}
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="inline-block align-middle"
    >
      <path d="M 7 1 L 13 12 L 1 12 Z" fill={color} />
    </svg>
  );
}
