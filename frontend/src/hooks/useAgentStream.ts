/**
 * useAgentStream - Core hook for AG-UI SSE communication
 *
 * Manages the connection to an AG-UI backend, tracks messages,
 * tool calls, HITL approval, and provides raw event capture for the inspector.
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
  reasoningContent?: string;
  isReasoning?: boolean;
}

export type ToolCallStatus = "calling" | "awaiting_approval" | "complete" | "rejected" | "error";

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
  status: ToolCallStatus;
}

/** Pending HITL approval info extracted from confirm_changes tool call */
export interface PendingApproval {
  confirmToolCallId: string;
  functionName: string;
  functionCallId: string;
  functionArguments: Record<string, unknown>;
  steps: Array<{ description: string; status: string }>;
}

export interface ActivityItem {
  executorId: string;
  status: "in_progress" | "completed" | "failed";
  data?: unknown;
  details?: string;
  timestamp: number;
}

export interface StepItem {
  name: string;
  status: "started" | "finished";
  timestamp: number;
}

/** MCP App event data emitted via CUSTOM "McpApp" events */
export interface McpAppEvent {
  toolCallId: string;
  appId: string;
  htmlUrl: string;
}

interface UseAgentStreamReturn {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  events: TimestampedEvent[];
  activities: ActivityItem[];
  steps: StepItem[];
  mcpApps: McpAppEvent[];
  isRunning: boolean;
  error: string | null;
  pendingApproval: PendingApproval | null;
  sendMessage: (content: string) => void;
  respondToApproval: (approved: boolean) => void;
  clearMessages: () => void;
  clearEvents: () => void;
  cancelRun: () => void;
}

const MAX_EVENTS = 2000;

export function useAgentStream(
  _endpoint: string,
  toggles: FeatureToggles
): UseAgentStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [events, setEvents] = useState<TimestampedEvent[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [mcpApps, setMcpApps] = useState<McpAppEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const eventCounterRef = useRef(0);
  const conversationRef = useRef<AGUIMessage[]>([]);
  const threadIdRef = useRef<string | null>(null);
  const pendingApprovalRef = useRef<PendingApproval | null>(null);
  // Capture MESSAGES_SNAPSHOT for accurate resume
  const messagesSnapshotRef = useRef<AGUIMessage[] | null>(null);

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

  /** Build the common forwardedProps for requests */
  const buildForwardedProps = useCallback(() => ({
    playground: {
      toolCalls: toggles.toolCalls,
      humanInTheLoop: toggles.humanInTheLoop,
      modelMode: toggles.modelMode,
      reasoningEffort: toggles.reasoningEffort,
    },
  }), [toggles]);

  /** Core streaming function used by both sendMessage and respondToApproval */
  const runStream = useCallback(
    async (request: AGUIRunRequest) => {
      const abortController = new AbortController();
      abortRef.current = abortController;

      let currentMessageId: string | null = null;
      let currentContent = "";
      let pendingReasoningTokens = 0;
      // Reasoning state: track messageId → accumulated text
      let reasoningMessageId: string | null = null;
      let reasoningContent = "";

      const url = `/api${_endpoint}`;

      await streamAgentResponse(url, request, {
        signal: abortController.signal,

        onEvent(event: AGUIEvent) {
          addEvent(event);

          switch (event.type) {
            case AGUIEventType.RUN_STARTED: {
              // Persist threadId for resume requests
              if (event.threadId) {
                threadIdRef.current = event.threadId;
              }
              break;
            }

            case AGUIEventType.TEXT_MESSAGE_START: {
              currentMessageId = event.messageId;
              currentContent = "";
              // If there's a preceding reasoning-only message, merge it
              // into this text message instead of creating a new one
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                const last = lastIdx >= 0 ? prev[lastIdx] : null;
                if (
                  last &&
                  last.role === "assistant" &&
                  !last.content &&
                  last.reasoningContent
                ) {
                  // Merge: update the reasoning placeholder to become the text message
                  return prev.map((m, i) =>
                    i === lastIdx
                      ? {
                          ...m,
                          id: event.messageId,
                          isStreaming: true,
                          isReasoning: false,
                        }
                      : m
                  );
                }
                // No preceding reasoning — create fresh assistant message
                return [
                  ...prev,
                  {
                    id: event.messageId,
                    role: "assistant" as const,
                    content: "",
                    isStreaming: true,
                  },
                ];
              });
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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === event.messageId
                    ? { ...m, isStreaming: false }
                    : m
                )
              );
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
              // Check if this is a confirm_changes tool (HITL approval)
              setToolCalls((prev) =>
                prev.map((tc) => {
                  if (tc.id !== event.toolCallId) return tc;
                  if (tc.name === "confirm_changes") {
                    // Parse confirm_changes args to extract approval details
                    try {
                      const args = JSON.parse(tc.args);
                      const approval: PendingApproval = {
                        confirmToolCallId: tc.id,
                        functionName: args.function_name || "",
                        functionCallId: args.function_call_id || "",
                        functionArguments: args.function_arguments || {},
                        steps: args.steps || [],
                      };
                      pendingApprovalRef.current = approval;
                      setPendingApproval(approval);
                    } catch {
                      // If parsing fails, still mark as awaiting
                      const approval: PendingApproval = {
                        confirmToolCallId: tc.id,
                        functionName: "unknown",
                        functionCallId: "",
                        functionArguments: {},
                        steps: [],
                      };
                      pendingApprovalRef.current = approval;
                      setPendingApproval(approval);
                    }
                    return { ...tc, status: "awaiting_approval" as ToolCallStatus };
                  }
                  return tc;
                })
              );
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

            case AGUIEventType.MESSAGES_SNAPSHOT: {
              // Capture for accurate resume
              messagesSnapshotRef.current = event.messages as AGUIMessage[];
              break;
            }

            case AGUIEventType.RUN_ERROR: {
              setError(event.message);
              break;
            }

            case AGUIEventType.RUN_FINISHED: {
              // Attach accumulated reasoning tokens to last assistant message with content
              if (pendingReasoningTokens > 0) {
                const tokens = pendingReasoningTokens;
                pendingReasoningTokens = 0;
                setMessages((prev) => {
                  const lastIdx = [...prev].reverse().findIndex(
                    (m) => m.role === "assistant" && m.content.length > 0
                  );
                  if (lastIdx === -1) return prev;
                  const actualIdx = prev.length - 1 - lastIdx;
                  return prev.map((m, i) =>
                    i === actualIdx ? { ...m, reasoningTokens: tokens } : m
                  );
                });
              }

              // Check for interrupts (HITL waiting for approval)
              const interrupts = (event as unknown as Record<string, unknown>).interrupt;
              if (Array.isArray(interrupts) && interrupts.length > 0) {
                // Don't mark run as finished — we're waiting for approval
                return;
              }
              break;
            }

            case AGUIEventType.CUSTOM: {
              if (event.name === "usage" && event.value && typeof event.value === "object") {
                const usage = event.value as Record<string, unknown>;
                const reasoningTokens = usage["openai.reasoning_tokens"] as number | undefined;
                if (reasoningTokens && reasoningTokens > 0) {
                  pendingReasoningTokens += reasoningTokens;
                }
              }
              // MCP App events — interactive tool UIs
              if (event.name === "McpApp" && event.value && typeof event.value === "object") {
                const appData = event.value as McpAppEvent;
                if (appData.toolCallId && appData.appId && appData.htmlUrl) {
                  setMcpApps((prev) => [...prev, appData]);
                }
              }
              break;
            }

            case AGUIEventType.STEP_STARTED: {
              setSteps((prev) => [
                ...prev,
                { name: event.stepName, status: "started", timestamp: Date.now() },
              ]);
              break;
            }

            case AGUIEventType.STEP_FINISHED: {
              setSteps((prev) => [
                ...prev,
                { name: event.stepName, status: "finished", timestamp: Date.now() },
              ]);
              break;
            }

            case AGUIEventType.ACTIVITY_SNAPSHOT: {
              const content = event.content as Record<string, unknown>;
              const executorId = (content?.executor_id as string) ?? event.activityType;
              const status = (content?.status as ActivityItem["status"]) ?? "in_progress";
              setActivities((prev) => {
                // Replace existing entry for this executor, or add new
                const idx = prev.findIndex((a) => a.executorId === executorId && a.status === "in_progress");
                const item: ActivityItem = {
                  executorId,
                  status,
                  data: content?.data,
                  details: content?.details as string | undefined,
                  timestamp: Date.now(),
                };
                if (idx >= 0 && status !== "in_progress") {
                  return [...prev.slice(0, idx), item, ...prev.slice(idx + 1)];
                }
                return [...prev, item];
              });
              break;
            }

            case AGUIEventType.REASONING_MESSAGE_START: {
              // Inner message boundary — REASONING_START already created the message
              break;
            }

            case AGUIEventType.REASONING_START: {
              // Create a placeholder assistant message for reasoning
              reasoningMessageId = event.messageId;
              reasoningContent = "";
              const reasoningMsg: ChatMessage = {
                id: event.messageId,
                role: "assistant",
                content: "",
                isReasoning: true,
                reasoningContent: "",
              };
              setMessages((prev) => [...prev, reasoningMsg]);
              break;
            }

            case AGUIEventType.REASONING_MESSAGE_CONTENT: {
              if (event.messageId === reasoningMessageId) {
                reasoningContent += event.delta;
                const rc = reasoningContent;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === event.messageId
                      ? { ...m, reasoningContent: rc }
                      : m
                  )
                );
              }
              break;
            }

            case AGUIEventType.REASONING_MESSAGE_END:
            case AGUIEventType.REASONING_END: {
              // Finalize reasoning — mark it as no longer actively reasoning
              if (event.messageId === reasoningMessageId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === event.messageId
                      ? { ...m, isReasoning: false }
                      : m
                  )
                );
              }
              if (event.type === AGUIEventType.REASONING_END) {
                reasoningMessageId = null;
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
          // Only mark as not running if we're not waiting for approval
          // Use ref to avoid stale closure
          if (!pendingApprovalRef.current) {
            setIsRunning(false);
          }
        },
      });
    },
    [addEvent]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (isRunning) return;

      setError(null);
      setIsRunning(true);

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMsg]);
      conversationRef.current.push({ role: "user", content });

      const request: AGUIRunRequest = {
        messages: conversationRef.current,
        threadId: threadIdRef.current || undefined,
        forwardedProps: buildForwardedProps(),
      };

      await runStream(request);
    },
    [isRunning, buildForwardedProps, runStream]
  );

  const respondToApproval = useCallback(
    async (approved: boolean) => {
      if (!pendingApproval) return;

      const approval = pendingApproval;
      pendingApprovalRef.current = null;
      setPendingApproval(null);

      // Update tool call status
      setToolCalls((prev) =>
        prev.map((tc) =>
          tc.id === approval.confirmToolCallId
            ? { ...tc, status: approved ? "complete" : "rejected", result: approved ? "Approved" : "Rejected" }
            : tc
        )
      );

      // Also mark the original tool call
      setToolCalls((prev) =>
        prev.map((tc) =>
          tc.id === approval.functionCallId
            ? { ...tc, status: approved ? "complete" : "rejected", result: approved ? "Approved by user" : "Rejected by user" }
            : tc
        )
      );

      // Build resume request with interrupt response
      // Use MESSAGES_SNAPSHOT if available, otherwise conversationRef
      const msgs = messagesSnapshotRef.current || conversationRef.current;

      const resumeValue = {
        accepted: approved,
        steps: approval.steps.map((s) => ({
          ...s,
          status: approved ? "enabled" : "disabled",
        })),
      };

      const request: AGUIRunRequest = {
        messages: msgs,
        threadId: threadIdRef.current || undefined,
        forwardedProps: buildForwardedProps(),
        resume: {
          interrupts: [
            {
              id: approval.confirmToolCallId,
              value: resumeValue,
            },
          ],
        } as unknown as Record<string, unknown>,
      };

      await runStream(request);
    },
    [pendingApproval, buildForwardedProps, runStream]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setToolCalls([]);
    setActivities([]);
    setSteps([]);
    setMcpApps([]);
    conversationRef.current = [];
    messagesSnapshotRef.current = null;
    threadIdRef.current = null;
    pendingApprovalRef.current = null;
    setPendingApproval(null);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    pendingApprovalRef.current = null;
    setPendingApproval(null);
  }, []);

  return {
    messages,
    toolCalls,
    events,
    activities,
    steps,
    mcpApps,
    isRunning,
    error,
    pendingApproval,
    sendMessage,
    respondToApproval,
    clearMessages,
    clearEvents,
    cancelRun,
  };
}
