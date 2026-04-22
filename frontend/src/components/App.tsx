import { useState } from "react";
import ChatTab from "./ChatTab";
import PlanTab from "./PlanTab";
import SharedStateTab from "./SharedStateTab";
import WorkflowTab from "./WorkflowTab";
import EventInspector from "./EventInspector";
import FeatureToggles from "./FeatureToggles";
import type { FeatureToggles as Toggles, TimestampedEvent } from "../types/ag-ui";
import { DEFAULT_TOGGLES } from "../types/ag-ui";

type Tab = "chat" | "plan" | "state" | "workflow";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [toggles, setToggles] = useState<Toggles>(DEFAULT_TOGGLES);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorEvents, setInspectorEvents] = useState<TimestampedEvent[]>([]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-purple-400">⚡ AG-UI Playground</h1>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
            Microsoft Agent Framework
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab Switcher */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === "chat"
                  ? "bg-purple-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setActiveTab("plan")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === "plan"
                  ? "bg-purple-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              📋 Plan
            </button>
            <button
              onClick={() => setActiveTab("state")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === "state"
                  ? "bg-purple-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              🔄 Shared State
            </button>
            <button
              onClick={() => setActiveTab("workflow")}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === "workflow"
                  ? "bg-purple-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              🔬 Workflow
            </button>
          </div>
          {/* Inspector Toggle */}
          <button
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              inspectorOpen
                ? "bg-green-700 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            📡 Events {inspectorOpen ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Feature Toggles */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
          <FeatureToggles toggles={toggles} onChange={setToggles} activeTab={activeTab} />
        </aside>

        {/* Center: Active Tab */}
        <main className="flex-1 flex flex-col overflow-hidden">
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

        {/* Right: Event Inspector (flyout) */}
        {inspectorOpen && (
          <aside className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col">
            <EventInspector events={inspectorEvents} />
          </aside>
        )}
      </div>
    </div>
  );
}
