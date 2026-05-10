import { homedir } from "node:os";
import { join } from "node:path";

export function vibemaestroHome(): string {
  return join(homedir(), ".vibemaestro");
}

export function dataSqlitePath(): string {
  return join(vibemaestroHome(), "data.sqlite");
}

export function runDir(runId: string): string {
  return join(vibemaestroHome(), "runs", runId);
}

export function transcriptPath(runId: string): string {
  return join(runDir(runId), "transcript");
}
