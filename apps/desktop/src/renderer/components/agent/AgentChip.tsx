import type { Agent } from "@vibemaestro/core";

type Props = {
  agent: Pick<Agent, "id" | "label" | "monogram">;
  size?: "sm" | "md";
};

/**
 * Per DESIGN.md §5: agents are first-class. A 20px (sm) or 24px (md) square,
 * agent hue background at 25% saturation, monogram in full chroma. Two-letter
 * uppercase mono — never an emoji, never a stock avatar.
 */
export function AgentChip({ agent, size = "md" }: Props) {
  const dim = size === "sm" ? 18 : 24;
  return (
    <span
      role="img"
      title={agent.label}
      aria-label={agent.label}
      className="font-mono uppercase inline-flex items-center justify-center select-none"
      style={{
        width: dim,
        height: dim,
        fontSize: size === "sm" ? 9 : 10.5,
        letterSpacing: "0.04em",
        fontWeight: 600,
        backgroundColor: `color-mix(in oklch, var(--agent-${agent.id}) 22%, var(--surface-base))`,
        color: `var(--agent-${agent.id})`,
        border: `1px solid color-mix(in oklch, var(--agent-${agent.id}) 36%, transparent)`,
        borderRadius: "var(--radius-sm)",
      }}
    >
      {agent.monogram}
    </span>
  );
}
