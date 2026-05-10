import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { buildXtermTheme } from "../lib/xterm-theme.js";

type State = {
  ready: boolean;
  closed: boolean;
  bytesReplayed: number;
};

/**
 * Mount xterm.js to the given container and wire it to the dispatcher's
 * terminal IPC bridge. Subscribes to bytes BEFORE calling attach so the
 * scrollback snapshot returned by attach() is delivered as the first frame.
 *
 * Cleans up on unmount: detach IPC, dispose xterm, dispose addons.
 */
export function useTerminal(runId: string | null, container: HTMLElement | null): State {
  const [state, setState] = useState<State>({ ready: false, closed: false, bytesReplayed: 0 });
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!runId || !container || typeof window === "undefined" || !window.vmBridge) return;

    let disposed = false;
    let offOutput: (() => void) | null = null;
    let offClosed: (() => void) | null = null;

    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.35,
      theme: buildXtermTheme(),
      allowProposedApi: true,
      scrollback: 5000,
      cursorBlink: true,
      cursorStyle: "block",
      convertEol: true,
    });
    termRef.current = term;

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      // container may not be measured yet — ResizeObserver below catches up
    }

    // Subscribe to live data BEFORE calling attach. attach() ships the
    // scrollback snapshot as the first message on this channel, so the order
    // is: [subscribe] → [attach: snapshot delivered] → [live tail flows in].
    offOutput = window.vmBridge.terminal.onOutput(runId, (chunk) => {
      term.write(chunk);
    });
    offClosed = window.vmBridge.terminal.onClosed(runId, () => {
      setState((s) => ({ ...s, closed: true }));
    });

    void window.vmBridge.terminal.attach(runId).then((info) => {
      if (disposed) return;
      if (!info) {
        setState({ ready: true, closed: true, bytesReplayed: 0 });
        return;
      }
      term.resize(info.cols, info.rows);
      try {
        fit.fit();
      } catch {}
      setState({ ready: true, closed: false, bytesReplayed: info.bytes_replayed });
    });

    // Pipe keystrokes from the user back to the PTY.
    const onData = term.onData((data) => {
      void window.vmBridge.terminal.write(runId, data);
    });

    // Resize the PTY when the container resizes.
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
    });
    ro.observe(container);

    const onResize = term.onResize(({ cols, rows }) => {
      void window.vmBridge.terminal.resize(runId, cols, rows);
    });

    return () => {
      disposed = true;
      ro.disconnect();
      onData.dispose();
      onResize.dispose();
      offOutput?.();
      offClosed?.();
      void window.vmBridge.terminal.detach(runId);
      term.dispose();
      termRef.current = null;
    };
  }, [runId, container]);

  return state;
}
