/**
 * McpAppViewer - Renders MCP App tool HTML in a sandboxed iframe.
 *
 * When an MCP App tool completes, the backend emits a CUSTOM "McpApp" event
 * with { toolCallId, appId, htmlUrl }. This component fetches the HTML from
 * the MCP server (proxied via /mcp-api) and renders it in a sandboxed iframe
 * using srcdoc for maximum security isolation.
 */

import { useEffect, useState } from "react";

export interface McpAppData {
  toolCallId: string;
  appId: string;
  htmlUrl: string;
}

interface Props {
  app: McpAppData;
}

/** Map appId to a user-friendly display name */
const APP_NAMES: Record<string, string> = {
  explore_dataset_app: "📊 Interactive Dataset Explorer",
  visualize_statistics_app: "📈 Statistics Dashboard",
};

export default function McpAppViewer({ app }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Proxy through Vite to avoid CORS
    const proxyUrl = app.htmlUrl.replace(
      /^https?:\/\/127\.0\.0\.1:8889/,
      "/mcp-api"
    );

    fetch(proxyUrl)
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

    return () => { cancelled = true; };
  }, [app.htmlUrl]);

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
                <span className="animate-spin mr-2">⏳</span> Loading interactive UI...
              </div>
            )}
            {error && (
              <div className="px-4 py-3 text-red-400 text-xs">
                ❌ Failed to load app: {error}
              </div>
            )}
            {html && !error && (
              <iframe
                srcDoc={html}
                sandbox="allow-scripts"
                title={displayName}
                className="w-full border-0"
                style={{ height: "360px", background: "#0f172a" }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
