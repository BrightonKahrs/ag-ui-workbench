/**
 * useSharedState - Hook for AG-UI shared state management
 *
 * Manages bidirectional state sync using STATE_SNAPSHOT and STATE_DELTA events.
 * Applies JSON Patch (RFC 6902) operations for incremental updates.
 */

import { useCallback, useRef, useState } from "react";
import { applyPatch, type Operation } from "fast-json-patch";
import type {
  AGUIEvent,
  AGUIMessage,
  AGUIRunRequest,
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
  clearState: () => void;
  clearEvents: () => void;
  cancelRun: () => void;
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
}

const MAX_EVENTS = 500;

export function useSharedState(endpoint: string): SharedStateReturn {
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

      // Add user message to UI
      setMessages((prev) => [
        ...prev,
        { id: `msg-${Date.now()}`, role: "user", content },
      ]);
      conversationRef.current.push({ role: "user", content });

      // Include current state in the request
      const request: AGUIRunRequest = {
        messages: conversationRef.current,
        state: stateRef.current,
      };

      const abortController = new AbortController();
      abortRef.current = abortController;

      let currentMessageId: string | null = null;
      let currentContent = "";

      await streamAgentResponse(`/api${endpoint}`, request, {
        signal: abortController.signal,

        onEvent(event: AGUIEvent) {
          addEvent(event);

          switch (event.type) {
            case AGUIEventType.STATE_SNAPSHOT: {
              // Replace entire state
              stateRef.current = event.snapshot;
              setState({ ...event.snapshot });
              break;
            }

            case AGUIEventType.STATE_DELTA: {
              // Apply JSON Patch operations
              try {
                const patched = applyPatch(
                  stateRef.current,
                  event.delta as Operation[],
                  true, // validate
                  false // don't mutate
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
                      : m
                  )
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
    [isRunning, endpoint, addEvent]
  );

  const clearState = useCallback(() => {
    setState({});
    stateRef.current = {};
    setMessages([]);
    conversationRef.current = [];
  }, []);

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
    clearState,
    clearEvents,
    cancelRun,
    messages,
  };
}
