/**
 * useAgentStream - Core hook for AG-UI SSE communication
 *
 * Manages the connection to an AG-UI backend, tracks messages,
 * tool calls, and provides raw event capture for the inspector.
 */

import { useCallback, useRef, useState } from "react";
import type {
  AGUIEvent,
  AGUIMessage,
  AGUIRunRequest,
  FeatureToggles,
  TimestampedEvent,
} from "../types/ag-ui";
import { AGUIEventType } from "../types/ag-ui";
import { streamAgentResponse } from "../utils/sse-client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  reasoningTokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
  status: "calling" | "complete";
}

interface UseAgentStreamReturn {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  events: TimestampedEvent[];
  isRunning: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
  clearEvents: () => void;
  cancelRun: () => void;
}

const MAX_EVENTS = 500; // Cap for performance

export function useAgentStream(
  endpoint: string,
  toggles: FeatureToggles
): UseAgentStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [events, setEvents] = useState<TimestampedEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const eventCounterRef = useRef(0);
  const conversationRef = useRef<AGUIMessage[]>([]);

  const addEvent = useCallback((event: AGUIEvent) => {
    const timestamped: TimestampedEvent = {
      id: `evt-${eventCounterRef.current++}`,
      timestamp: Date.now(),
      event,
    };
    setEvents((prev) => {
      const next = [...prev, timestamped];
      // Cap event list for performance
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isRunning) return;

      setError(null);
      setIsRunning(true);

      // Add user message
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Track conversation history
      conversationRef.current.push({ role: "user", content });

      // Prepare request
      const request: AGUIRunRequest = {
        messages: conversationRef.current,
        forwardedProps: {
          playground: {
            toolCalls: toggles.toolCalls,
            humanInTheLoop: toggles.humanInTheLoop,
          },
        },
      };

      // Set up abort controller
      const abortController = new AbortController();
      abortRef.current = abortController;

      // Track current assistant message being streamed
      let currentMessageId: string | null = null;
      let currentContent = "";
      let pendingReasoningTokens = 0; // Accumulate across the run

      // Select endpoint based on model mode
      const resolvedEndpoint = toggles.modelMode === "reasoning" ? "/reasoning" : endpoint;
      const url = `/api${resolvedEndpoint}`;

      await streamAgentResponse(url, request, {
        signal: abortController.signal,

        onEvent(event: AGUIEvent) {
          addEvent(event);

          switch (event.type) {
            case AGUIEventType.TEXT_MESSAGE_START: {
              currentMessageId = event.messageId;
              currentContent = "";
              const assistantMsg: ChatMessage = {
                id: event.messageId,
                role: "assistant",
                content: "",
                isStreaming: true,
              };
              setMessages((prev) => [...prev, assistantMsg]);
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
              // Attach any accumulated reasoning tokens to this message
              const msgEndId = event.messageId;
              if (pendingReasoningTokens > 0) {
                const tokens = pendingReasoningTokens;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgEndId ? { ...m, isStreaming: false, reasoningTokens: tokens } : m
                  )
                );
                pendingReasoningTokens = 0;
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === event.messageId
                      ? { ...m, isStreaming: false }
                      : m
                  )
                );
              }
              // Add to conversation history
              if (currentContent) {
                conversationRef.current.push({
                  role: "assistant",
                  content: currentContent,
                });
              }
              currentMessageId = null;
              break;
            }

            case AGUIEventType.TOOL_CALL_START: {
              const tc: ToolCall = {
                id: event.toolCallId,
                name: event.toolCallName,
                args: "",
                status: "calling",
              };
              setToolCalls((prev) => [...prev, tc]);
              break;
            }

            case AGUIEventType.TOOL_CALL_ARGS: {
              setToolCalls((prev) =>
                prev.map((tc) =>
                  tc.id === event.toolCallId
                    ? { ...tc, args: tc.args + event.delta }
                    : tc
                )
              );
              break;
            }

            case AGUIEventType.TOOL_CALL_END: {
              // Tool call specification complete, waiting for result
              break;
            }

            case AGUIEventType.TOOL_CALL_RESULT: {
              setToolCalls((prev) =>
                prev.map((tc) =>
                  tc.id === event.toolCallId
                    ? { ...tc, result: event.content, status: "complete" }
                    : tc
                )
              );
              break;
            }

            case AGUIEventType.RUN_ERROR: {
              setError(event.message);
              break;
            }

            case AGUIEventType.CUSTOM: {
              // Accumulate reasoning token usage from CUSTOM events
              if (event.name === "usage" && event.value && typeof event.value === "object") {
                const usage = event.value as Record<string, unknown>;
                const reasoningTokens = usage["openai.reasoning_tokens"] as number | undefined;
                if (reasoningTokens && reasoningTokens > 0) {
                  pendingReasoningTokens += reasoningTokens;
                }
              }
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
    [isRunning, endpoint, toggles, addEvent]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setToolCalls([]);
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
    messages,
    toolCalls,
    events,
    isRunning,
    error,
    sendMessage,
    clearMessages,
    clearEvents,
    cancelRun,
  };
}
