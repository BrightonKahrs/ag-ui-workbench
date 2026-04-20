import type { FeatureToggles as Toggles, ModelMode } from "../types/ag-ui";

interface Props {
  toggles: Toggles;
  onChange: (toggles: Toggles) => void;
  activeTab: "chat" | "state";
}

interface ToggleItemProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ToggleItem({ label, description, enabled, onToggle, disabled }: ToggleItemProps) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-800"
      }`}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        disabled={disabled}
        className="mt-1 w-4 h-4 accent-purple-500"
      />
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
    </label>
  );
}

export default function FeatureToggles({ toggles, onChange, activeTab }: Props) {
  const update = (key: keyof Toggles) => {
    onChange({ ...toggles, [key]: !toggles[key] });
  };

  return (
    <div>
      {/* Model Mode Selector */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Model Mode
      </h2>
      <div className="mb-4 space-y-1">
        {(["chat", "reasoning"] as ModelMode[]).map((mode) => (
          <label
            key={mode}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-800 ${
              toggles.modelMode === mode ? "bg-gray-800 ring-1 ring-purple-500" : ""
            }`}
          >
            <input
              type="radio"
              name="modelMode"
              value={mode}
              checked={toggles.modelMode === mode}
              onChange={() => onChange({ ...toggles, modelMode: mode })}
              className="accent-purple-500"
            />
            <div>
              <div className="text-sm font-medium text-white capitalize">{mode}</div>
              <div className="text-xs text-gray-500">
                {mode === "chat" && "gpt-4o-mini — standard streaming"}
                {mode === "reasoning" && "o3-mini — emits REASONING events"}
              </div>
            </div>
          </label>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        AG-UI Features
      </h2>
      <div className="space-y-1">
        <ToggleItem
          label="Streaming"
          description="Real-time token-by-token text delivery"
          enabled={toggles.streaming}
          onToggle={() => update("streaming")}
        />
        <ToggleItem
          label="Tool Calls"
          description="Backend tool execution with TOOL_CALL events"
          enabled={toggles.toolCalls}
          onToggle={() => update("toolCalls")}
          disabled={activeTab === "state"}
        />
        <ToggleItem
          label="Human-in-the-Loop"
          description="Require approval before tool execution"
          enabled={toggles.humanInTheLoop}
          onToggle={() => update("humanInTheLoop")}
          disabled={activeTab === "state"}
        />
        <ToggleItem
          label="Shared State"
          description="Bidirectional STATE_SNAPSHOT/STATE_DELTA sync"
          enabled={toggles.sharedState}
          onToggle={() => update("sharedState")}
          disabled={activeTab === "chat"}
        />
        <ToggleItem
          label="Predictive Updates"
          description="Optimistic state from streaming tool args"
          enabled={toggles.predictiveUpdates}
          onToggle={() => update("predictiveUpdates")}
          disabled={activeTab === "chat"}
        />
        <ToggleItem
          label="Step Events"
          description="STEP_STARTED/STEP_FINISHED tracking"
          enabled={toggles.stepEvents}
          onToggle={() => update("stepEvents")}
        />
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Event Colors</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-500"></span>
            <span className="text-gray-400">Lifecycle (RUN_*)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-green-500"></span>
            <span className="text-gray-400">Text Messages</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-yellow-500"></span>
            <span className="text-gray-400">Tool Calls</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-purple-500"></span>
            <span className="text-gray-400">State Events</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-orange-500"></span>
            <span className="text-gray-400">Reasoning</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-red-500"></span>
            <span className="text-gray-400">Errors</span>
          </div>
        </div>
      </div>
    </div>
  );
}
