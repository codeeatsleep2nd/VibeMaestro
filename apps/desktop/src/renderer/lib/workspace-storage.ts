import { DEFAULT_WORKSPACE_ID } from "@vibemaestro/core";

const KEY = "vibemaestro:active_workspace";

export function getActiveWorkspaceId(): string {
  try {
    return window.localStorage.getItem(KEY) ?? DEFAULT_WORKSPACE_ID;
  } catch {
    return DEFAULT_WORKSPACE_ID;
  }
}

export function setActiveWorkspaceId(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // localStorage can throw in private-mode / quota-exceeded scenarios. Silent failure
    // is acceptable — the next tick re-reads from memory state in App.tsx.
  }
}
