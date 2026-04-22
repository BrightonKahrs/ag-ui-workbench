/**
 * useSharedState - Hook for AG-UI shared state management
 *
 * Manages bidirectional state sync using STATE_SNAPSHOT and STATE_DELTA events.
 * Applies JSON Patch (RFC 6902) operations for incremental updates.
 * Tracks threadId across runs and passes forwardedProps (including smartDelta toggle).
 */

import { useCallback, useRef, useState } from "react";
import { applyPatch, type Operation } from "fast-json-patch";
import type {
  AGUIEvent,
  AGUIMessage,
  AGUIRunRequest,
  FeatureToggles,
  TimestampedEvent,
} from "../types/ag-ui";
import { AGUIEventType } from "../types/ag-ui";
import { streamAgentResponse } from "../utils/sse-client";

export interface SharedStateReturn {
  state: Record<string, unknown>;
  events: TimestampedEvent[];
  isRunning: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
  updateState: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  clearState: () => void;
  clearEvents: () => void;
  cancelRun: () => void;
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
}

const MAX_EVENTS = 2000;

export function useSharedState(
  endpoint: string,
  toggles?: FeatureToggles,
): SharedStateReturn {
  const [state, setState] = useState<Record<string, unknown>>({});
  const [events, setEvents] = useState<TimestampedEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; content: string }>
  >([]);

  const abortRef = useRef<AbortController | null>(null);
  const eventCounterRef = useRef(0);
  const conversationRef = useRef<AGUIMessage[]>([]);
  const stateRef = useRef<Record<string, unknown>>({});
  const threadIdRef = useRef<string | null>(null);

  const addEvent = useCallback((event: AGUIEvent) => {
    const timestamped: TimestampedEvent = {
      id: `evt-${eventCounterRef.current++}`,
      timestamp: Date.now(),
      event,
    };
    setEvents((prev) => {
      const next = [...prev, timestamped];
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isRunning) return;

      setError(null);
      setIsRunning(true);

      setMessages((prev) => [
        ...prev,
        { id: `msg-${Date.now()}`, role: "user", content },
      ]);
      conversationRef.current.push({ role: "user", content });

      // Build request with threadId and forwardedProps for smart delta toggle
      const request: AGUIRunRequest = {
        messages: conversationRef.current,
        state: stateRef.current,
        threadId: threadIdRef.current ?? undefined,
        forwardedProps: {
          playground: {
            smartDelta: toggles?.smartDelta ?? true,
          },
        },
      };

      const abortController = new AbortController();
      abortRef.current = abortController;

      // Log the outgoing request in the Event Inspector so users can see
      // the full POST body (including state sent back to the backend).
      setEvents((prev) => {
        const entry: TimestampedEvent = {
          id: `req-${eventCounterRef.current++}`,
          timestamp: Date.now(),
          event: { type: "REQUEST_SENT" as AGUIEventType } as AGUIEvent,
          request,
        };
        const next = [...prev, entry];
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });

      let currentMessageId: string | null = null;
      let currentContent = "";

      await streamAgentResponse(`/api${endpoint}`, request, {
        signal: abortController.signal,

        onEvent(event: AGUIEvent) {
          addEvent(event);

          switch (event.type) {
            case AGUIEventType.RUN_STARTED: {
              // Capture threadId from the first response as stable session ID
              if (event.threadId && !threadIdRef.current) {
                threadIdRef.current = event.threadId;
              }
              break;
            }

            case AGUIEventType.STATE_SNAPSHOT: {
              stateRef.current = event.snapshot;
              setState({ ...event.snapshot });
              break;
            }

            case AGUIEventType.STATE_DELTA: {
              try {
                const patched = applyPatch(
                  stateRef.current,
                  event.delta as Operation[],
                  true,
                  false,
                );
                stateRef.current = patched.newDocument;
                setState({ ...patched.newDocument });
              } catch (err) {
                console.warn("Failed to apply state delta:", err);
              }
              break;
            }

            case AGUIEventType.TEXT_MESSAGE_START: {
              currentMessageId = event.messageId;
              currentContent = "";
              setMessages((prev) => [
                ...prev,
                { id: event.messageId, role: "assistant", content: "" },
              ]);
              break;
            }

            case AGUIEventType.TEXT_MESSAGE_CONTENT: {
              if (event.messageId === currentMessageId) {
                currentContent += event.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentMessageId
                      ? { ...m, content: currentContent }
                      : m,
                  ),
                );
              }
              break;
            }

            case AGUIEventType.TEXT_MESSAGE_END: {
              if (currentContent) {
                conversationRef.current.push({
                  role: "assistant",
                  content: currentContent,
                });
              }
              currentMessageId = null;
              break;
            }

            case AGUIEventType.RUN_ERROR: {
              setError(event.message);
              break;
            }

            default:
              break;
          }
        },

        onError(err: Error) {
          setError(err.message);
          setIsRunning(false);
        },

        onComplete() {
          setIsRunning(false);
        },
      });
    },
    [isRunning, endpoint, addEvent, toggles?.smartDelta],
  );

  const clearState = useCallback(() => {
    setState({});
    stateRef.current = {};
    setMessages([]);
    conversationRef.current = [];
    threadIdRef.current = null;
  }, []);

  /** Update local state — changes are sent to the backend on the next message. */
  const updateState = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setState((prev) => {
        const next = updater(prev);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  return {
    state,
    events,
    isRunning,
    error,
    sendMessage,
    updateState,
    clearState,
    clearEvents,
    cancelRun,
    messages,
  };
}
