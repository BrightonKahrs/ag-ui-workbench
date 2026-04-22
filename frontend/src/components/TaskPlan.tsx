/**
 * TaskPlan — renders a visual task plan card from shared state.
 *
 * Displays plan title, progress bar, and individual task cards
 * with status indicators and result text.
 */

interface TaskState {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "done" | "failed" | "cancelled";
  result?: string | null;
}

interface PlanState {
  id?: string;
  title: string;
  status: "in_progress" | "completed" | "failed";
  taskOrder: string[];
  tasks: Record<string, TaskState>;
}

interface Props {
  plan: PlanState;
}

const STATUS_CONFIG: Record<
  string,
  { icon: string; color: string; bg: string; ring: string; pulse?: boolean }
> = {
  pending: { icon: "○", color: "text-gray-500", bg: "bg-gray-800", ring: "ring-gray-700" },
  in_progress: {
    icon: "◉",
    color: "text-blue-400",
    bg: "bg-blue-950",
    ring: "ring-blue-700",
    pulse: true,
  },
  done: { icon: "✓", color: "text-green-400", bg: "bg-green-950", ring: "ring-green-700" },
  failed: { icon: "✗", color: "text-red-400", bg: "bg-red-950", ring: "ring-red-700" },
  cancelled: { icon: "⊘", color: "text-gray-600", bg: "bg-gray-900", ring: "ring-gray-800" },
};

const PLAN_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  in_progress: { label: "In Progress", color: "text-blue-400" },
  completed: { label: "Completed", color: "text-green-400" },
  failed: { label: "Failed", color: "text-red-400" },
};

export default function TaskPlan({ plan }: Props) {
  const orderedTasks = plan.taskOrder
    .map((id) => plan.tasks[id])
    .filter(Boolean);

  const total = orderedTasks.length;
  const doneCount = orderedTasks.filter(
    (t) => t.status === "done" || t.status === "cancelled"
  ).length;
  const failedCount = orderedTasks.filter((t) => t.status === "failed").length;
  const progressPct = total > 0 ? Math.round(((doneCount + failedCount) / total) * 100) : 0;

  const planStatus = PLAN_STATUS_CONFIG[plan.status] ?? PLAN_STATUS_CONFIG.in_progress;

  return (
    <div className="flex flex-col gap-3">
      {/* Plan Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">{plan.title}</h2>
          <span className={`text-[10px] ${planStatus.color}`}>{planStatus.label}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400">
            {doneCount}/{total} tasks
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            plan.status === "failed" ? "bg-red-500" : "bg-green-500"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Task Cards */}
      <div className="space-y-2">
        {orderedTasks.map((task, idx) => {
          const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
          return (
            <div
              key={task.id}
              className={`${cfg.bg} rounded-lg px-3 py-2 ring-1 ${cfg.ring} transition-all duration-300`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`text-sm leading-none mt-0.5 ${cfg.color} ${
                    cfg.pulse ? "animate-pulse" : ""
                  }`}
                >
                  {cfg.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600 font-mono">
                      {idx + 1}.
                    </span>
                    <span className="text-xs font-medium text-white truncate">
                      {task.title}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                      {task.description}
                    </p>
                  )}
                  {task.result && (
                    <p className="text-[10px] text-gray-400 mt-1 bg-gray-900/50 rounded px-2 py-1">
                      {task.result}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
