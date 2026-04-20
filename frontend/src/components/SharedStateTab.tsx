import { useEffect, useRef, useState } from "react";
import type { TimestampedEvent } from "../types/ag-ui";
import { useSharedState } from "../hooks/useSharedState";

interface Props {
  onEvents: (events: TimestampedEvent[]) => void;
}

export default function SharedStateTab({ onEvents }: Props) {
  const {
    state,
    events,
    isRunning,
    error,
    sendMessage,
    clearState,
    messages,
  } = useSharedState("/state");

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Forward events to inspector
  useEffect(() => {
    onEvents(events);
  }, [events, onEvents]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;
    sendMessage(input.trim());
    setInput("");
  };

  // Extract recipe from state for visualization
  const recipe = state.recipe as Record<string, unknown> | undefined;

  return (
    <div className="flex-1 flex flex-col">
      {/* Tab Description */}
      <div className="bg-gray-850 border-b border-gray-800 px-4 py-2">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Shared State Tab</strong> — Demonstrates
          bidirectional state sync using STATE_SNAPSHOT and STATE_DELTA events with
          predictive updates as the LLM streams tool arguments.
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat + State Viewer */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 py-8">
                <p className="text-lg mb-2">🍳 Recipe Builder</p>
                <p className="text-sm">
                  Ask the agent to create or modify a recipe. Watch as shared state
                  updates stream in real-time via STATE_DELTA events.
                </p>
                <p className="text-xs text-gray-700 mt-2">
                  Try: "Make me a pasta carbonara" or "Add garlic bread as a side"
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-purple-700 text-white"
                      : "bg-gray-800 text-gray-200"
                  }`}
                >
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">
                    {msg.role}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2">
                <div className="text-xs text-red-400">❌ {error}</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Create a recipe, modify ingredients, adjust cooking time..."
                disabled={isRunning}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isRunning}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50"
              >
                {isRunning ? "..." : "Send"}
              </button>
              <button
                type="button"
                onClick={clearState}
                className="px-3 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:text-white"
              >
                Reset
              </button>
            </form>
          </div>
        </div>

        {/* Right: State Visualization */}
        <div className="w-80 border-l border-gray-800 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-purple-400">
              🔄 Live State
            </h3>
            <p className="text-[10px] text-gray-600">
              Updates via STATE_SNAPSHOT & STATE_DELTA
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {!recipe ? (
              <div className="text-center text-gray-600 text-xs py-8">
                No state yet. Ask the agent to create a recipe.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Recipe Title */}
                {typeof recipe.title === "string" && recipe.title && (
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase font-semibold">
                      Title
                    </div>
                    <div className="text-sm font-bold text-white">
                      {recipe.title}
                    </div>
                  </div>
                )}

                {/* Metadata Row */}
                <div className="flex gap-2 flex-wrap">
                  {typeof recipe.skill_level === "string" && (
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded">
                      {recipe.skill_level}
                    </span>
                  )}
                  {typeof recipe.cooking_time === "string" && (
                    <span className="text-[10px] bg-orange-950 text-orange-300 px-2 py-0.5 rounded">
                      ⏱️ {recipe.cooking_time}
                    </span>
                  )}
                </div>

                {/* Ingredients */}
                {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">
                      Ingredients
                    </div>
                    <div className="space-y-1">
                      {(recipe.ingredients as Array<{icon: string; name: string; amount: string}>).map(
                        (ing, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs text-gray-300"
                          >
                            <span>{ing.icon}</span>
                            <span className="flex-1">{ing.name}</span>
                            <span className="text-gray-500">{ing.amount}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Instructions */}
                {Array.isArray(recipe.instructions) && recipe.instructions.length > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">
                      Instructions
                    </div>
                    <ol className="space-y-1 text-xs text-gray-300 list-decimal list-inside">
                      {(recipe.instructions as string[]).map((step, i) => (
                        <li key={i} className="leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Raw State JSON */}
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">
                    Raw State JSON
                  </div>
                  <pre className="text-[10px] text-gray-500 bg-gray-950 rounded p-2 overflow-auto max-h-40">
                    {JSON.stringify(state, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
