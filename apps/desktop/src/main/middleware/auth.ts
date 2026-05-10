import type { TaskListInput } from "@vibemaestro/core";

/**
 * v1 is single-user local. AuthContext is a no-op slot wired through every
 * request so v2 (remote backend, team mode) can swap in real auth without
 * touching every router. See API.md §3.
 *
 * Endpoints MUST NOT read `Authorization`, `Cookie`, or `X-User-*` headers in
 * v1 — identity comes from this context.
 */
export type AuthContext = {
  user_id: string;
  display_name: string;
};

export const NO_OP_USER: AuthContext = {
  user_id: "local",
  display_name: "You",
};

export function getAuthContext(): AuthContext {
  return NO_OP_USER;
}

// Re-export Task input types so middleware files can satisfy import-isolation lint.
export type { TaskListInput };
