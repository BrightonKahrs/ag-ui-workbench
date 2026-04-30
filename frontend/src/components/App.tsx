import { useState } from "react";
import ChatTab from "./ChatTab";
import PlanTab from "./PlanTab";
import SharedStateTab from "./SharedStateTab";
import WorkflowTab from "./WorkflowTab";
import EventInspector from "./EventInspector";
import WorkbenchSettings from "./WorkbenchSettings";
import type { FeatureToggles as Toggles, TimestampedEvent } from "../types/ag-ui";
import { DEFAULT_TOGGLES } from "../types/ag-ui";

type Tab = "chat" | "plan" | "state" | "workflow";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [toggles, setToggles] = useState<Toggles>(DEFAULT_TOGGLES);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [inspectorEvents, setInspectorEvents] = useState<TimestampedEvent[]>([]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between shadow-[0_1px_3px_0_rgb(0_0_0/0.03)]">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
            <span className="text-brand-500">◆</span> AG-UI Workbench
          </h1>
          <span className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full font-medium">
            Agent Framework
          </span>
        </div>
        {/* Tab Switcher */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          {([
            { id: "chat", label: "Chat", icon: "💬" },
            { id: "plan", label: "Plan", icon: "📋" },
            { id: "state", label: "State", icon: "🔄" },
            { id: "workflow", label: "Workflow", icon: "🔬" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-soft"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Settings panel */}
        <aside
          className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out ${
            settingsOpen ? "w-72" : "w-0 border-r-0 overflow-hidden"
          }`}
        >
          <div className="w-72 h-full flex flex-col">
            {/* Collapse arrow inside panel */}
            <div className="flex justify-end px-2 pt-2 shrink-0">
              <button
                onClick={() => setSettingsOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Hide Settings"
              >
                <span className="text-sm">‹</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <WorkbenchSettings toggles={toggles} onChange={setToggles} activeTab={activeTab} />
            </div>
          </div>
        </aside>
        {/* Settings expand tab (only when closed) */}
        {!settingsOpen && (
          <ExpandTab label="Settings" side="left" onClick={() => setSettingsOpen(true)} />
        )}

        {/* Center: Active Tab */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-w-0">
          {activeTab === "chat" ? (
            <ChatTab toggles={toggles} onEvents={setInspectorEvents} />
          ) : activeTab === "plan" ? (
            <PlanTab onEvents={setInspectorEvents} toggles={toggles} />
          ) : activeTab === "state" ? (
            <SharedStateTab onEvents={setInspectorEvents} toggles={toggles} />
          ) : (
            <WorkflowTab toggles={toggles} onEvents={setInspectorEvents} />
          )}
        </main>

        {/* Events expand tab (only when closed) */}
        {!inspectorOpen && (
          <ExpandTab label="Events" side="right" onClick={() => setInspectorOpen(true)} />
        )}
        {/* Right: Event Inspector */}
        <aside
          className={`bg-white border-l border-gray-200 flex flex-col transition-all duration-300 ease-in-out ${
            inspectorOpen ? "w-96" : "w-0 border-l-0 overflow-hidden"
          }`}
        >
          <div className="w-96 h-full flex flex-col">
            {/* Collapse arrow inside panel — left-aligned toward center */}
            <div className="flex justify-start px-2 pt-2 shrink-0">
              <button
                onClick={() => setInspectorOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Hide Events"
              >
                <span className="text-sm">›</span>
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <EventInspector events={inspectorEvents} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Expand tab shown only when a panel is collapsed */
function ExpandTab({
  label,
  side,
  onClick,
}: {
  label: string;
  side: "left" | "right";
  onClick: () => void;
}) {
  const arrow = side === "left" ? "›" : "‹";
  return (
    <button
      onClick={onClick}
      className={`flex items-start pt-28 justify-center px-1.5 bg-white border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-gray-500 hover:text-indigo-600 self-stretch shrink-0 ${
        side === "left" ? "rounded-r-md border-l-0" : "rounded-l-md border-r-0"
      }`}
      title={`Show ${label}`}
    >
      <span
        className="text-[11px] font-medium tracking-wide"
        style={{ writingMode: "vertical-lr", transform: side === "left" ? "rotate(180deg)" : "none" }}
      >
        {label} {arrow}
      </span>
    </button>
  );
}
