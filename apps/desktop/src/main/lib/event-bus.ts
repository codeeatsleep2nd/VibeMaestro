import type { EnvelopedEvent, RenderableEvent } from "@vibemaestro/core";
import { newEventId } from "@vibemaestro/core";
import { childLogger } from "./logger.js";

const log = childLogger({ module: "event-bus" });

const RING_MAX = 1000;

type Listener<E extends RenderableEvent> = (env: EnvelopedEvent & { event: E }) => void;
type AnyListener = (env: EnvelopedEvent) => void;

/**
 * Typed in-process pub/sub. Decouples services (task-service, run-dispatcher,
 * agent-service) from their consumers (the IPC fan-out, future internal
 * subscribers). Carries a 1000-entry ring buffer so a renderer that disconnects
 * briefly can replay missed events via `Last-Event-ID`.
 *
 * Invariants:
 *   - exact-once delivery to listeners registered at emit time
 *   - in-emit-order — listeners fire synchronously, in registration order
 *   - the ring is the only persistence; a process restart loses event history
 */
class TypedBus {
  private byType = new Map<string, Set<Listener<RenderableEvent>>>();
  private anyListeners = new Set<AnyListener>();
  private ring: EnvelopedEvent[] = [];

  on<E extends RenderableEvent>(type: E["type"], fn: Listener<E>): () => void {
    let set = this.byType.get(type);
    if (!set) {
      set = new Set();
      this.byType.set(type, set);
    }
    set.add(fn as Listener<RenderableEvent>);
    return () => {
      set?.delete(fn as Listener<RenderableEvent>);
    };
  }

  onAny(fn: AnyListener): () => void {
    this.anyListeners.add(fn);
    return () => {
      this.anyListeners.delete(fn);
    };
  }

  emit(event: RenderableEvent): EnvelopedEvent {
    const env: EnvelopedEvent = {
      id: newEventId(),
      at: new Date().toISOString(),
      event,
    };

    this.ring.push(env);
    if (this.ring.length > RING_MAX) {
      this.ring.splice(0, this.ring.length - RING_MAX);
    }

    const typed = this.byType.get(event.type);
    if (typed) {
      for (const fn of typed) {
        try {
          fn(env);
        } catch (err) {
          log.error(
            { type: event.type, err: err instanceof Error ? err.message : String(err) },
            "typed listener threw",
          );
        }
      }
    }
    for (const fn of this.anyListeners) {
      try {
        fn(env);
      } catch (err) {
        log.error(
          { type: event.type, err: err instanceof Error ? err.message : String(err) },
          "any-listener threw",
        );
      }
    }

    return env;
  }

  /**
   * Replay events strictly newer than `sinceId` (or all in-ring if null).
   * Returns `truncated: true` if the requested id is older than the oldest
   * ring entry — the renderer should `invalidateQueries` and restart fresh.
   */
  replaySince(sinceId: string | null): { events: EnvelopedEvent[]; truncated: boolean } {
    if (sinceId === null) {
      return { events: [...this.ring], truncated: false };
    }
    const idx = this.ring.findIndex((e) => e.id === sinceId);
    if (idx === -1) {
      // Either truly never seen OR evicted from the ring. The caller can't tell;
      // safer to treat as truncated and force a re-fetch.
      return { events: [], truncated: true };
    }
    return { events: this.ring.slice(idx + 1), truncated: false };
  }

  /** Test hook — clear ring + listeners between integration tests. */
  _resetForTesting(): void {
    this.byType.clear();
    this.anyListeners.clear();
    this.ring = [];
  }
}

export const bus = new TypedBus();
