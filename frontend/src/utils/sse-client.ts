/**
 * Raw SSE Client for AG-UI Protocol
 *
 * This is a teaching implementation that shows exactly how AG-UI events
 * flow over HTTP POST + Server-Sent Events. No abstraction libraries.
 */

import type { AGUIEvent, AGUIRunRequest } from "../types/ag-ui";

export interface SSEClientOptions {
  onEvent: (event: AGUIEvent) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  signal?: AbortSignal;
}

/**
 * Send a request to an AG-UI endpoint and stream back events via SSE.
 *
 * AG-UI uses HTTP POST with `Accept: text/event-stream`.
 * The response is a standard SSE stream where each `data:` line
 * contains a JSON-encoded AG-UI event.
 */
export async function streamAgentResponse(
  url: string,
  request: AGUIRunRequest,
  options: SSEClientOptions
): Promise<void> {
  const { onEvent, onError, onComplete, signal } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!response.ok) {
    onError(new Error(`HTTP ${response.status}: ${response.statusText}`));
    return;
  }

  if (!response.body) {
    onError(new Error("Response body is null - SSE streaming not supported"));
    return;
  }

  // Parse the SSE stream using ReadableStream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (separated by double newlines)
      const messages = buffer.split("\n\n");
      // Keep the last incomplete chunk in the buffer
      buffer = messages.pop() || "";

      for (const message of messages) {
        if (!message.trim()) continue;

        // Parse SSE format: handle multi-line data fields
        let dataContent = "";
        const lines = message.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            dataContent += line.slice(6);
          } else if (line.startsWith("data:")) {
            dataContent += line.slice(5);
          }
          // Ignore event:, id:, retry:, and comment lines for now
        }

        if (!dataContent) continue;

        // AG-UI signals end of stream with [DONE]
        if (dataContent.trim() === "[DONE]") {
          onComplete();
          return;
        }

        try {
          const event = JSON.parse(dataContent) as AGUIEvent;
          onEvent(event);
        } catch {
          // Skip malformed JSON - could be a heartbeat or partial event
          console.warn("Failed to parse AG-UI event:", dataContent);
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let dataContent = "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          dataContent += line.slice(6);
        } else if (line.startsWith("data:")) {
          dataContent += line.slice(5);
        }
      }
      if (dataContent && dataContent.trim() !== "[DONE]") {
        try {
          const event = JSON.parse(dataContent) as AGUIEvent;
          onEvent(event);
        } catch {
          // Ignore trailing partial data
        }
      }
    }

    onComplete();
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
