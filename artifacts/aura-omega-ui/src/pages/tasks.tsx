import { useListTasks, getListTasksQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import {
  Workflow, PlayCircle, CheckCircle2, XCircle, PauseCircle,
  Clock, RotateCcw, Loader2, AlertTriangle, RefreshCw, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const statusIcons: Record<string, React.ReactNode> = {
  queued: <Clock size={14} className="text-[hsl(0_0%_50%)]" />,
  running: <PlayCircle size={14} className="text-orange-400 animate-pulse" />,
  completed: <CheckCircle2 size={14} className="text-green-400" />,
  failed: <XCircle size={14} className="text-red-400" />,
  interrupted: <RotateCcw size={14} className="text-amber-400" />,
  paused: <PauseCircle size={14} className="text-blue-400" />,
};

const statusColors: Record<string, string> = {
  queued: "text-[hsl(0_0%_50%)] bg-[hsl(0_0%_12%)] border-[hsl(0_0%_18%)]",
  running: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  completed: "text-green-400 bg-green-500/10 border-green-500/20",
  failed: "text-red-400 bg-red-500/10 border-red-500/20",
  interrupted: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  paused: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const priorityColors: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

export default function Tasks() {
  const { data: tasks = [], isLoading, isError, refetch } = useListTasks({
    query: { refetchInterval: 3000, queryKey: getListTasksQueryKey() },
  });

  const [filter, setFilter] = useState<string>("all");

  const rank: Record<string, number> = { running: 0, queued: 1, paused: 2, failed: 3, interrupted: 5, completed: 4 };
  const sorted = [...tasks].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.id - a.id);

  const filtered = filter === "all" ? sorted : sorted.filter((t: any) => t.status === filter);

  const counts = tasks.reduce<Record<string, number>>((acc, t: any) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const live = (counts["running"] ?? 0) + (counts["queued"] ?? 0);

  const statusFilters = [
    { key: "all", label: "All", count: tasks.length },
    { key: "running", label: "Running", count: counts["running"] || 0 },
    { key: "queued", label: "Queued", count: counts["queued"] || 0 },
    { key: "completed", label: "Done", count: counts["completed"] || 0 },
    { key: "failed", label: "Failed", count: counts["failed"] || 0 },
  ];

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-3 sm:p-4 lg:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-6 pt-8 sm:pt-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Tasks</h2>
          <p className="text-xs sm:text-sm text-[hsl(0_0%_45%)] mt-0.5">What your agents are working on right now</p>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && !isError && tasks.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-[hsl(0_0%_60%)] mr-2">
              <span className={cn("w-2 h-2 rounded-full", live > 0 ? "bg-orange-400 animate-pulse" : "bg-[hsl(0_0%_35%)]")} />
              {live > 0 ? `${live} active` : "idle"}
            </span>
          )}
          <button className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition-colors shadow-lg shadow-orange-500/20">
            <Plus size={14} /> New
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 sm:mb-4 overflow-x-auto no-scrollbar">
        {statusFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all border shrink-0",
              filter === f.key ? "bg-orange-500/10 text-orange-400 border-orange-500/30" : "bg-transparent text-[hsl(0_0%_45%)] border-transparent hover:bg-[hsl(0_0%_12%)]"
            )}
          >
            {f.label}
            <span className="text-[9px] text-[hsl(0_0%_40%)] bg-[hsl(0_0%_12%)] px-1 py-0.5 rounded-full">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-orange-400 animate-spin" />
          <span className="ml-2 text-sm text-[hsl(0_0%_45%)]">Scanning queue...</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-16 text-[hsl(0_0%_45%)]">
          <AlertTriangle size={24} />
          <span>Couldn&apos;t load the task queue.</span>
          <button onClick={() => refetch()} className="text-xs underline text-white hover:text-orange-400">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-[hsl(0_0%_45%)]">
          <Workflow size={24} className="opacity-40" />
          <span>No tasks match the current filter.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task: any) => (
            <div key={task.id} className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4 hover:border-[hsl(0_0%_20%)] transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {statusIcons[task.status] || <Clock size={14} />}
                  <span className={cn("text-xs font-medium capitalize", (statusColors[task.status] || "").split(" ")[0])}>{task.status}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.priority && (
                    <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-medium border", priorityColors[task.priority] || "")}>{task.priority}</span>
                  )}
                </div>
              </div>

              <h3 className="text-sm font-medium text-white mb-1">{task.title}</h3>
              {task.description && <p className="text-xs text-[hsl(0_0%_45%)] line-clamp-2 mb-2">{task.description}</p>}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {task.agentName ? <span className="text-[10px] font-mono font-bold text-orange-400">{task.agentName}</span> : <span className="text-[10px] text-[hsl(0_0%_40%)] italic">Unassigned</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 sm:w-24 bg-[hsl(0_0%_14%)] rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", task.status === "completed" ? "bg-green-500" : task.status === "failed" ? "bg-red-500" : "bg-orange-500")} style={{ width: `${task.progress || 0}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-[hsl(0_0%_40%)] w-8 text-right">{task.progress || 0}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
