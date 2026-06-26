import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, ArrowRight, Bot, BrainCircuit, CheckCircle2,
  Circle, Loader2, SendHorizonal, Sparkles, Zap,
} from "lucide-react";
import { GOAL_DRAFT_KEY } from "@/lib/handoff";
import { cn } from "@/lib/utils";

type AgentStatus = "idle" | "running" | "error" | "offline";

interface Agent {
  id: number;
  name: string;
  role: string;
  status: AgentStatus;
  color: string;
  avatarInitials: string;
}

interface Task {
  id: number;
  title?: string;
  objective?: string;
  status: string;
  agentName?: string | null;
}

const PLACEHOLDER_AGENTS: Agent[] = [
  { id: 1, name: "ABBY",   role: "Orchestrator",    status: "idle", color: "#22d3ee", avatarInitials: "AB" },
  { id: 2, name: "AURA-1", role: "Code & Deploy",   status: "idle", color: "#a78bfa", avatarInitials: "A1" },
  { id: 3, name: "AURA-2", role: "Research & Web",  status: "idle", color: "#34d399", avatarInitials: "A2" },
  { id: 4, name: "AURA-3", role: "Content & CRM",   status: "idle", color: "#f59e0b", avatarInitials: "A3" },
  { id: 5, name: "AURA-4", role: "Data & Analytics",status: "idle", color: "#f472b6", avatarInitials: "A4" },
  { id: 6, name: "AURA-5", role: "Automation & n8n",status: "idle", color: "#fb923c", avatarInitials: "A5" },
];

function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span className={cn(
      "w-2 h-2 rounded-full shrink-0",
      status === "running" ? "bg-blue-400 animate-pulse" :
      status === "error"   ? "bg-red-400" :
      status === "offline" ? "bg-muted-foreground/40" :
                             "bg-emerald-400",
    )} />
  );
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "running" || status === "queued")
    return <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0 mt-0.5" />;
  if (status === "completed")
    return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />;
  return <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-0.5" />;
}

function taskBadge(status: string) {
  if (status === "running" || status === "queued")
    return "bg-blue-400/10 text-blue-400 border border-blue-400/20";
  if (status === "completed")
    return "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20";
  if (status === "failed")
    return "bg-red-400/10 text-red-400 border border-red-400/20";
  return "bg-muted/60 text-muted-foreground border border-border";
}

const SUGGESTIONS = [
  "Research AI marketing trends and write a LinkedIn post",
  "Build a landing page for a new product",
  "Summarize and reply to unread emails",
  "Create a 30-day social media content calendar",
  "Scrape competitor pricing and make a comparison table",
  "Deploy the latest build to Render",
];

export default function OpsPage() {
  const [, navigate] = useLocation();
  const [goal, setGoal] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [heartbeat, setHeartbeat] = useState<"online" | "offline" | "unknown">("unknown");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setAgents(Array.isArray(d) ? d : []))
      .catch(() => {});

    fetch("/api/tasks")
      .then((r) => r.ok ? r.json() : {})
      .then((d) => {
        const list = Array.isArray(d?.tasks) ? d.tasks : Array.isArray(d) ? d : [];
        setTasks(list.slice(0, 6));
      })
      .catch(() => {});

    fetch("/api/n8n/autonomy/heartbeat")
      .then((r) => setHeartbeat(r.ok ? "online" : "offline"))
      .catch(() => setHeartbeat("offline"));
  }, []);

  function launch() {
    const trimmed = goal.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try { sessionStorage.setItem(GOAL_DRAFT_KEY, trimmed); } catch { /* storage blocked */ }
    navigate("/chat");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); launch(); }
  }

  const displayAgents = agents.length ? agents : PLACEHOLDER_AGENTS;
  const runningAgents = displayAgents.filter((a) => a.status === "running").length;
  const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "queued").length;

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="min-h-full flex flex-col">

        {/* ── Hero: centered goal input ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 pt-16 pb-10">
          <div className="w-full max-w-2xl">

            {/* Brand mark */}
            <div className="flex flex-col items-center text-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 shadow-lg shadow-primary/10">
                <BrainCircuit className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-black tracking-tight">What should AURA-OMEGA do?</h1>
              <p className="mt-2 text-muted-foreground text-sm max-w-sm">
                Describe a goal. The swarm plans, delegates to agents, and gets it done.
              </p>
            </div>

            {/* Goal composer */}
            <div className="rounded-2xl border border-border bg-card shadow-lg focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.10)] transition-all">
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={onKey}
                rows={3}
                placeholder="e.g. Research AI marketing trends and write a post for LinkedIn…"
                className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed focus:outline-none placeholder:text-muted-foreground/50"
              />
              <div className="flex items-center justify-between px-4 pb-3 pt-1">
                <span className="text-[11px] text-muted-foreground/40 hidden sm:block">
                  ⏎ to launch · Shift+⏎ for new line
                </span>
                <button
                  onClick={launch}
                  disabled={!goal.trim() || submitting}
                  className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-[0_10px_28px_rgba(139,92,246,0.35),inset_0_1px_0_rgba(255,255,255,0.22)]"
                >
                  {submitting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <SendHorizonal className="w-4 h-4" />}
                  Launch
                </button>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setGoal(s)}
                  className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Status + roster ── */}
        <div className="px-4 pb-6 max-w-5xl mx-auto w-full space-y-4">

          {/* Status strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Swarm",
                value: `${displayAgents.length} agents`,
                sub: runningAgents > 0 ? `${runningAgents} running` : "All idle",
                icon: <Bot className="w-4 h-4 text-primary" />,
              },
              {
                label: "Tasks",
                value: activeTasks > 0 ? `${activeTasks} active` : "No active tasks",
                sub: tasks.length > 0 ? `${tasks.length} recent` : "None yet",
                icon: <Activity className="w-4 h-4 text-accent" />,
              },
              {
                label: "System",
                value: heartbeat === "online" ? "Online" : heartbeat === "offline" ? "Offline" : "Checking…",
                sub: "BOS Governor",
                icon: <Zap className={cn("w-4 h-4", heartbeat === "online" ? "text-emerald-400" : "text-muted-foreground")} />,
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-card-border bg-card/50 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0">
                  {stat.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{stat.value}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{stat.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Agent roster + Recent tasks */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Agent roster */}
            <div className="rounded-2xl border border-card-border bg-card/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" /> Agent swarm
                </h2>
                <Link href="/agents">
                  <span className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer">
                    View all <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
              <div className="space-y-2">
                {displayAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-xl border border-card-border bg-background/50 px-3 py-2.5"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{
                        backgroundColor: `${agent.color}18`,
                        color: agent.color,
                        border: `1.5px solid ${agent.color}40`,
                      }}
                    >
                      {agent.avatarInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate" style={{ color: agent.color }}>
                        {agent.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{agent.role}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusDot status={agent.status as AgentStatus} />
                      <span className="text-[10px] text-muted-foreground capitalize">{agent.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent tasks */}
            <div className="rounded-2xl border border-card-border bg-card/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> Recent tasks
                </h2>
                <Link href="/tasks">
                  <span className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer">
                    View all <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2 text-center">
                  <Circle className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No tasks yet.</p>
                  <p className="text-xs text-muted-foreground/60">Launch a goal above to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 rounded-xl border border-card-border bg-background/50 px-3 py-2.5"
                    >
                      <TaskStatusIcon status={task.status} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {task.title || task.objective || "Unnamed task"}
                        </div>
                        {task.agentName && (
                          <div className="text-[11px] text-muted-foreground">{task.agentName}</div>
                        )}
                      </div>
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 capitalize", taskBadge(task.status))}>
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="py-4 text-center text-[10px] text-muted-foreground/30 select-none">
          AURA-OMEGA · BOS Governor · governed autonomous runtime
        </div>
      </div>
    </div>
  );
}
