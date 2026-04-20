/**
 * AG-UI Protocol Type Definitions
 * These types represent the wire format of AG-UI events streamed over SSE.
 */

// --- Event Types Enum ---
export enum AGUIEventType {
  RUN_STARTED = "RUN_STARTED",
  RUN_FINISHED = "RUN_FINISHED",
  RUN_ERROR = "RUN_ERROR",
  STEP_STARTED = "STEP_STARTED",
  STEP_FINISHED = "STEP_FINISHED",
  TEXT_MESSAGE_START = "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END = "TEXT_MESSAGE_END",
  TOOL_CALL_START = "TOOL_CALL_START",
  TOOL_CALL_ARGS = "TOOL_CALL_ARGS",
  TOOL_CALL_END = "TOOL_CALL_END",
  TOOL_CALL_RESULT = "TOOL_CALL_RESULT",
  STATE_SNAPSHOT = "STATE_SNAPSHOT",
  STATE_DELTA = "STATE_DELTA",
  MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT",
  REASONING_START = "REASONING_START",
  REASONING_MESSAGE_START = "REASONING_MESSAGE_START",
  REASONING_MESSAGE_CONTENT = "REASONING_MESSAGE_CONTENT",
  REASONING_MESSAGE_END = "REASONING_MESSAGE_END",
  REASONING_END = "REASONING_END",
  RAW = "RAW",
  CUSTOM = "CUSTOM",
}

// --- Event Interfaces ---

export interface RunStartedEvent {
  type: AGUIEventType.RUN_STARTED;
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent {
  type: AGUIEventType.RUN_FINISHED;
  threadId: string;
  runId: string;
  result?: unknown;
  interrupt?: Array<{
    id: string;
    value: Record<string, unknown>;
  }>;
}

export interface RunErrorEvent {
  type: AGUIEventType.RUN_ERROR;
  message: string;
  code?: string;
}

export interface StepStartedEvent {
  type: AGUIEventType.STEP_STARTED;
  stepName: string;
}

export interface StepFinishedEvent {
  type: AGUIEventType.STEP_FINISHED;
  stepName: string;
}

export interface TextMessageStartEvent {
  type: AGUIEventType.TEXT_MESSAGE_START;
  messageId: string;
  role: "assistant" | "user" | "system" | "tool";
}

export interface TextMessageContentEvent {
  type: AGUIEventType.TEXT_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent {
  type: AGUIEventType.TEXT_MESSAGE_END;
  messageId: string;
}

export interface ToolCallStartEvent {
  type: AGUIEventType.TOOL_CALL_START;
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent {
  type: AGUIEventType.TOOL_CALL_ARGS;
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent {
  type: AGUIEventType.TOOL_CALL_END;
  toolCallId: string;
}

export interface ToolCallResultEvent {
  type: AGUIEventType.TOOL_CALL_RESULT;
  toolCallId: string;
  content: string;
  role?: string;
}

export interface StateSnapshotEvent {
  type: AGUIEventType.STATE_SNAPSHOT;
  snapshot: Record<string, unknown>;
}

export interface StateDeltaEvent {
  type: AGUIEventType.STATE_DELTA;
  delta: JsonPatchOperation[];
}

export interface MessagesSnapshotEvent {
  type: AGUIEventType.MESSAGES_SNAPSHOT;
  messages: Array<{ role: string; content: string }>;
}

export interface RawEvent {
  type: AGUIEventType.RAW;
  event: unknown;
  source?: string;
}

export interface CustomEvent {
  type: AGUIEventType.CUSTOM;
  name: string;
  value: unknown;
}

// --- Reasoning Events ---

export interface ReasoningStartEvent {
  type: AGUIEventType.REASONING_START;
  messageId: string;
}

export interface ReasoningMessageStartEvent {
  type: AGUIEventType.REASONING_MESSAGE_START;
  messageId: string;
  role: "reasoning";
}

export interface ReasoningMessageContentEvent {
  type: AGUIEventType.REASONING_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
}

export interface ReasoningMessageEndEvent {
  type: AGUIEventType.REASONING_MESSAGE_END;
  messageId: string;
}

export interface ReasoningEndEvent {
  type: AGUIEventType.REASONING_END;
  messageId: string;
}

// --- JSON Patch (RFC 6902) ---

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

// --- Discriminated Union ---

export type AGUIEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningEndEvent
  | RawEvent
  | CustomEvent;

// --- Timestamped Event (for the inspector) ---

export interface TimestampedEvent {
  id: string;
  timestamp: number;
  event: AGUIEvent;
}

// --- Request Types ---

export interface AGUIMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface AGUIRunRequest {
  messages: AGUIMessage[];
  threadId?: string;
  runId?: string;
  state?: Record<string, unknown>;
  tools?: AGUIToolDefinition[];
  forwardedProps?: Record<string, unknown>;
  resume?: Record<string, unknown>;
}

export interface AGUIToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

// --- Feature Toggles ---

export type ModelMode = "chat" | "reasoning";

export type ReasoningEffort = "low" | "medium" | "high";

export interface FeatureToggles {
  streaming: boolean;
  toolCalls: boolean;
  humanInTheLoop: boolean;
  sharedState: boolean;
  predictiveUpdates: boolean;
  stepEvents: boolean;
  modelMode: ModelMode;
  reasoningEffort: ReasoningEffort;
}

export const DEFAULT_TOGGLES: FeatureToggles = {
  streaming: true,
  toolCalls: true,
  humanInTheLoop: false,
  sharedState: false,
  predictiveUpdates: true,
  stepEvents: true,
  modelMode: "chat",
  reasoningEffort: "medium",
};
