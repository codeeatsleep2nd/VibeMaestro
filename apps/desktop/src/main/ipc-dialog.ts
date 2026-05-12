import { BrowserWindow, dialog, ipcMain } from "electron";
import { childLogger } from "./lib/logger.js";

const log = childLogger({ module: "ipc-dialog" });

/**
 * Native folder picker for `CreateWorkspaceModal`'s "Browse…" button. Opens
 * `dialog.showOpenDialog` with `properties: ["openDirectory"]` against the
 * focused window so the picker is sheet-modal on macOS, attached on Windows.
 *
 * Returns the absolute path of the selected directory, or `null` if the user
 * cancelled. workspace-service's `normalizeWorkspacePath` runs on the result
 * anyway, so the renderer can stuff it straight into the path field.
 */
export function registerDialogBridges(): void {
  ipcMain.handle("dialog.selectDirectory", async (event): Promise<string | null> => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    try {
      const result = await dialog.showOpenDialog(win ?? new BrowserWindow({ show: false }), {
        properties: ["openDirectory", "createDirectory"],
        title: "Choose workspace folder",
        buttonLabel: "Select",
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const picked = result.filePaths[0] ?? null;
      log.info({ path: picked }, "dialog.selectDirectory");
      return picked;
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "dialog.selectDirectory failed",
      );
      return null;
    }
  });
}
