import type {
  FeatureToggles as Toggles,
  ModelMode,
  ReasoningEffort,
  ToolDisplayMode,
  ReasoningDisplayMode,
  Provider,
} from "../types/ag-ui";
import { PROVIDER_MODELS, PROVIDER_LABELS } from "../types/ag-ui";

interface Props {
  toggles: Toggles;
  onChange: (toggles: Toggles) => void;
  activeTab: "chat" | "plan" | "state" | "workflow";
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
      {children}
    </h2>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Record<T, string>;
}) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
            value === opt
              ? "bg-white text-gray-900 shadow-soft"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {labels?.[opt] ?? opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({
  label,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
        disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={(e) => { e.preventDefault(); onToggle(); }}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ${
          enabled ? "bg-brand-500" : "bg-gray-200"
        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
            enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export default function WorkbenchSettings({ toggles, onChange, activeTab }: Props) {
  const update = (partial: Partial<Toggles>) => {
    onChange({ ...toggles, ...partial });
  };

  return (
    <div className="p-4 space-y-5">
      {/* Provider */}
      <div>
        <SectionHeader>Provider</SectionHeader>
        <div className="space-y-2">
          <select
            value={toggles.providerConfig.provider}
            onChange={(e) => {
              const provider = e.target.value as Provider;
              update({
                providerConfig: {
                  provider,
                  model: PROVIDER_MODELS[provider][0],
                },
              });
            }}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-300 transition-all"
          >
            {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
          <select
            value={toggles.providerConfig.model ?? ""}
            onChange={(e) =>
              update({
                providerConfig: { ...toggles.providerConfig, model: e.target.value },
              })
            }
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-300 transition-all"
          >
            {PROVIDER_MODELS[toggles.providerConfig.provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Model Mode */}
      <div>
        <SectionHeader>Model Mode</SectionHeader>
        <SegmentedControl<ModelMode>
          options={["chat", "reasoning"]}
          value={toggles.modelMode}
          onChange={(modelMode) => update({ modelMode })}
        />
        {toggles.modelMode === "reasoning" && (
          <div className="mt-3">
            <div className="text-[11px] text-gray-500 font-medium mb-1.5 px-1">Reasoning Effort</div>
            <SegmentedControl<ReasoningEffort>
              options={["low", "medium", "high"]}
              value={toggles.reasoningEffort}
              onChange={(reasoningEffort) => update({ reasoningEffort })}
            />
          </div>
        )}
      </div>

      <div className="border-t border-gray-100" />

      {/* Display Options */}
      <div>
        <SectionHeader>Display Options</SectionHeader>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-gray-500 font-medium mb-1.5 px-1">Tool Calls</div>
            <SegmentedControl<ToolDisplayMode>
              options={["inline", "card", "timeline"]}
              value={toggles.toolDisplayMode}
              onChange={(toolDisplayMode) => update({ toolDisplayMode })}
              labels={{ inline: "Inline", card: "Card", timeline: "Timeline" }}
            />
            <p className="text-[10px] text-gray-400 mt-1 px-1">
              {toggles.toolDisplayMode === "inline" && "Minimal — status text blended into response"}
              {toggles.toolDisplayMode === "card" && "Expandable card with args & result"}
              {toggles.toolDisplayMode === "timeline" && "Step-by-step trace with timestamps"}
            </p>
          </div>
          <div>
            <div className="text-[11px] text-gray-500 font-medium mb-1.5 px-1">Reasoning</div>
            <SegmentedControl<ReasoningDisplayMode>
              options={["hidden", "summary", "streaming"]}
              value={toggles.reasoningDisplayMode}
              onChange={(reasoningDisplayMode) => update({ reasoningDisplayMode })}
              labels={{ hidden: "Hidden", summary: "Summary", streaming: "Streaming" }}
            />
            <p className="text-[10px] text-gray-400 mt-1 px-1">
              {toggles.reasoningDisplayMode === "hidden" && "Reasoning tokens consumed but not shown"}
              {toggles.reasoningDisplayMode === "summary" && "Collapsible badge, expandable on click"}
              {toggles.reasoningDisplayMode === "streaming" && "Live token stream visible in real-time"}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Toggles */}
      <div>
        <SectionHeader>Behavior</SectionHeader>
        <div className="space-y-0.5">
          <ToggleSwitch
            label="Streaming"
            description="Real-time token-by-token delivery"
            enabled={toggles.streaming}
            onToggle={() => update({ streaming: !toggles.streaming })}
            disabled={activeTab === "workflow"}
          />
          <ToggleSwitch
            label="Token Usage"
            description="Show tokens used per response"
            enabled={toggles.showTokenUsage}
            onToggle={() => update({ showTokenUsage: !toggles.showTokenUsage })}
          />
          <ToggleSwitch
            label="Tool Calls"
            description="Enable tool call execution"
            enabled={toggles.toolCalls}
            onToggle={() => update({ toolCalls: !toggles.toolCalls })}
            disabled={activeTab === "state" || activeTab === "plan" || activeTab === "workflow"}
          />
          <ToggleSwitch
            label="Human-in-the-Loop"
            description="Require approval before tool execution"
            enabled={toggles.humanInTheLoop}
            onToggle={() => update({ humanInTheLoop: !toggles.humanInTheLoop })}
            disabled={activeTab === "state" || activeTab === "plan" || activeTab === "workflow"}
          />
          <ToggleSwitch
            label="Shared State"
            description="Bidirectional STATE_SNAPSHOT/DELTA sync"
            enabled={toggles.sharedState}
            onToggle={() => update({ sharedState: !toggles.sharedState })}
            disabled={activeTab === "chat" || activeTab === "workflow"}
          />
          <ToggleSwitch
            label="Predictive Updates"
            description="Optimistic state from streaming tool args"
            enabled={toggles.predictiveUpdates}
            onToggle={() => update({ predictiveUpdates: !toggles.predictiveUpdates })}
            disabled={activeTab === "chat" || activeTab === "plan" || activeTab === "workflow"}
          />
          <ToggleSwitch
            label="Smart Deltas"
            description="JSON Patch when diff is smaller than snapshot"
            enabled={toggles.smartDelta}
            onToggle={() => update({ smartDelta: !toggles.smartDelta })}
            disabled={activeTab === "chat" || activeTab === "workflow"}
          />
          <ToggleSwitch
            label="Step Events"
            description="STEP_STARTED/FINISHED tracking"
            enabled={toggles.stepEvents}
            onToggle={() => update({ stepEvents: !toggles.stepEvents })}
          />
        </div>
      </div>
    </div>
  );
}
