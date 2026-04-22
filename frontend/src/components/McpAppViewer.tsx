/**
 * McpAppViewer — Renders MCP App tool UIs using the official MCP Apps SDK.
 *
 * Architecture:
 *   1. Backend detects an MCP App tool result and emits a CUSTOM "McpApp"
 *      event with { toolCallId, appId, structuredContent, toolArguments }.
 *   2. This component fetches the pre-compiled HTML from the MCP server
 *      (via /mcp-api proxy → /app-html/{appId}).
 *   3. Renders the HTML in a sandboxed iframe.
 *   4. Uses AppBridge + PostMessageTransport from @modelcontextprotocol/ext-apps
 *      to pass data to the app inside the iframe (proper MCP Apps protocol).
 *   5. The app receives data via ontoolresult → structuredContent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";

export interface McpAppData {
  toolCallId: string;
  appId: string;
  /** The structured data from the tool result (passed to the app via PostMessage) */
  structuredContent: Record<string, unknown>;
  /** Original tool arguments (passed as toolInput) */
  toolArguments?: Record<string, unknown>;
}

interface Props {
  app: McpAppData;
}

/** Map appId to a user-friendly display name */
const APP_NAMES: Record<string, string> = {
  explore_dataset_app: "📊 Interactive Dataset Explorer",
  visualize_statistics_app: "📈 Statistics Dashboard",
  create_chart_app: "📉 Interactive Chart",
};

export default function McpAppViewer({ app }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);

  // Fetch the compiled static HTML from MCP server (no data in URL)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/mcp-api/app-html/${app.appId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.text();
      })
      .then((htmlText) => {
        if (!cancelled) {
          setHtml(htmlText);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [app.appId]);

  // Set up AppBridge when iframe loads
  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    // Clean up previous bridge
    if (bridgeRef.current) {
      bridgeRef.current.close().catch(() => {});
      bridgeRef.current = null;
    }

    const bridge = new AppBridge(
      null, // No MCP client — we handle data manually
      { name: "AG-UI Playground", version: "1.0.0" },
      { openLinks: {} }, // Minimal capabilities
    );

    bridge.oninitialized = () => {
      // Send tool input (arguments) first, then the result
      bridge.sendToolInput({
        arguments: app.toolArguments ?? {},
      });
      bridge.sendToolResult({
        content: [{ type: "text", text: JSON.stringify(app.structuredContent) }],
        structuredContent: app.structuredContent,
      });
    };

    bridge.onsizechange = ({ height }) => {
      if (height != null && iframe) {
        iframe.style.height = `${height}px`;
      }
    };

    const transport = new PostMessageTransport(
      iframe.contentWindow,
      iframe.contentWindow,
    );

    bridge.connect(transport).catch((err) => {
      console.warn("[McpAppViewer] Bridge connect failed:", err);
    });

    bridgeRef.current = bridge;
  }, [app.structuredContent, app.toolArguments]);

  // Cleanup bridge on unmount
  useEffect(() => {
    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.close().catch(() => {});
        bridgeRef.current = null;
      }
    };
  }, []);

  const displayName = APP_NAMES[app.appId] || `🧩 ${app.appId}`;

  return (
    <div className="flex justify-start">
      <div className="border border-purple-800 bg-purple-950/30 rounded-lg max-w-[90%] w-full overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-purple-900/20 transition-colors"
        >
          <span className="text-xs font-semibold text-purple-400">
            {displayName}
          </span>
          <span className="text-[10px] text-purple-600 ml-auto">
            MCP App • {expanded ? "▾" : "▸"}
          </span>
        </button>

        {/* Content */}
        {expanded && (
          <div className="border-t border-purple-800/50">
            {loading && (
              <div className="flex items-center justify-center py-8 text-purple-400 text-sm">
                <span className="animate-spin mr-2">⏳</span> Loading interactive
                UI...
              </div>
            )}
            {error && (
              <div className="px-4 py-3 text-red-400 text-xs">
                ❌ Failed to load app: {error}
              </div>
            )}
            {html && !error && (
              <iframe
                ref={iframeRef}
                srcDoc={html}
                sandbox="allow-scripts"
                title={displayName}
                className="w-full border-0"
                style={{ height: "420px", background: "#0f172a" }}
                onLoad={onIframeLoad}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
