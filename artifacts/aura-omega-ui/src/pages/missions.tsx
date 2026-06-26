import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { resolveApiUrl } from "@workspace/api-client-react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Rocket,
  Sparkles,
  Target,
  XCircle,
  Zap,
} from "lucide-react";

interface Mission {
  id: number;
  goal: string;
  status: "new" | "planned" | "executing" | "verifying" | "blocked" | "waiting" | "completed" | "failed" | "cancelled";
  progress: number;
  confidence: number;
  attempts: number;
  lastError: string | null;
  engines: string[];
  plan: Array<{ index: number; engine: string; action: string; acceptance: string }>;
  createdBy: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  verification?: {
    total: number;
    passed: number;
    stepVerdicts?: Array<{ stepIndex: number; passed: boolean; evidence: string; acceptance: string }>;
  };
}

interface MissionEvent {
  id: number;
  kind: string;
  source: string;
  receivedAt: string;
}

interface MissionStats {
  ok: boolean;
  total: number;
  active: number;
  completed: number;
  failed: number;
  blocked: number;
  averageConfidence: number;
}

const STATUS_META: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  new:         { icon: Plus,         color: "text-slate-300",   bg: "bg-slate-500/15 border-slate-500/30",   label: "New" },
  planned:     { icon: Target,       color: "text-cyan-300",    bg: "bg-cyan-500/15 border-cyan-500/30",     label: "Planned" },
  executing:   { icon: PlayCircle,   color: "text-blue-300",    bg: "bg-blue-500/15 border-blue-500/30",     label: "Executing" },
  verifying:   { icon: CheckCircle2, color: "text-emerald-300", bg: "bg-emerald-500/15 border-emerald-500/30", label: "Verifying" },
  waiting:     { icon: PauseCircle,  color: "text-amber-300",   bg: "bg-amber-500/15 border-amber-500/30",   label: "Waiting" },
  blocked:     { icon: AlertTriangle,color: "text-orange-300",  bg: "bg-orange-500/15 border-orange-500/30", label: "Blocked" },
  completed:   { icon: CheckCircle2, color: "text-emerald-300", bg: "bg-emerald-500/15 border-emerald-500/30", label: "Completed" },
  failed:      { icon: XCircle,      color: "text-red-300",     bg: "bg-red-500/15 border-red-500/30",       label: "Failed" },
  cancelled:   { icon: PauseCircle,  color: "text-slate-300",   bg: "bg-slate-500/15 border-slate-500/30",   label: "Cancelled" },
};

function fmtAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-black/30 overflow-hidden">
      <div
        className={cn("h-full transition-all duration-500", color)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

function MissionCard({ m, onOpen }: { m: Mission; onOpen: (id: number) => void }) {
  const meta = STATUS_META[m.status] ?? STATUS_META.new!;
  const Icon = meta.icon;
  const blocked = m.status === "blocked" || m.status === "failed";
  return (
    <button
      type="button"
      onClick={() => onOpen(m.id)}
      className="text-left rounded-2xl border border-card-border bg-card/50 hover:bg-card transition-colors p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("w-4 h-4 shrink-0", meta.color)} />
          <div className="font-mono text-xs text-muted-foreground">#{m.id}</div>
        </div>
        <span className={cn("text-[10px] font-bold uppercase rounded-full border px-2 py-0.5", meta.bg, meta.color)}>
          {meta.label}
        </span>
      </div>
      <div className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5em]">{m.goal}</div>
      <div className="space-y-1.5">
        <ProgressBar
          value={m.progress}
          color={
            blocked ? "bg-orange-400" :
            m.status === "completed" ? "bg-emerald-400" :
            "bg-primary"
          }
        />
        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span>{(m.progress * 100).toFixed(0)}% · {m.verification?.passed ?? 0}/{m.verification?.total ?? 0} steps</span>
          <span>attempts {m.attempts}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {m.engines.map((e) => (
          <span key={e} className="text-[9px] font-mono uppercase rounded border border-card-border bg-black/20 px-1.5 py-0.5">{e}</span>
        ))}
      </div>
    </button>
  );
}

function MissionDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["mission", id],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl(`/api/missions/${id}`));
      if (!r.ok) throw new Error(`mission ${id} not found`);
      return r.json() as Promise<{ ok: boolean; mission: Mission; events: MissionEvent[] }>;
    },
    refetchInterval: 4000,
  });
  const m = data?.mission;
  const events = data?.events ?? [];
  const cancel = async () => {
    await fetch(resolveApiUrl(`/api/missions/${id}/cancel`), { method: "POST" });
    qc.invalidateQueries({ queryKey: ["missions"] });
    qc.invalidateQueries({ queryKey: ["mission", id] });
  };
  const retry = async () => {
    await fetch(resolveApiUrl(`/api/missions/${id}/retry`), { method: "POST" });
    qc.invalidateQueries({ queryKey: ["missions"] });
    qc.invalidateQueries({ queryKey: ["mission", id] });
  };
  if (isLoading || !m) return <div className="p-6 text-sm text-muted-foreground">Loading mission #{id}…</div>;
  const meta = STATUS_META[m.status] ?? STATUS_META.new!;
  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div
        className="bg-card border-l border-card-border w-[88%] max-w-[480px] h-full overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Mission</div>
            <div className="font-mono text-lg">#{m.id}</div>
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded border border-card-border">Close</button>
        </div>

        <div>
          <span className={cn("inline-block text-[10px] font-bold uppercase rounded-full border px-2 py-0.5", meta.bg, meta.color)}>
            {meta.label}
          </span>
          <h2 className="mt-2 text-base font-bold leading-snug">{m.goal}</h2>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-black/20 p-2"><div className="text-muted-foreground">Progress</div><div className="font-mono">{(m.progress * 100).toFixed(0)}%</div></div>
          <div className="rounded-lg bg-black/20 p-2"><div className="text-muted-foreground">Confidence</div><div className="font-mono">{(m.confidence * 100).toFixed(0)}%</div></div>
          <div className="rounded-lg bg-black/20 p-2"><div className="text-muted-foreground">Attempts</div><div className="font-mono">{m.attempts}</div></div>
          <div className="rounded-lg bg-black/20 p-2"><div className="text-muted-foreground">Steps</div><div className="font-mono">{m.verification?.passed ?? 0}/{m.verification?.total ?? 0}</div></div>
        </div>

        {m.lastError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs">
            <div className="font-bold text-red-300 mb-1">Last error</div>
            <div className="text-red-200/80 font-mono break-words">{m.lastError}</div>
          </div>
        ) : null}

        <div className="flex gap-2">
          {(m.status === "blocked" || m.status === "failed") && (
            <button onClick={retry} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold px-3 py-2">
              <RefreshCw className="w-3.5 h-3.5" />Retry
            </button>
          )}
          {["new", "planned", "executing", "verifying", "waiting"].includes(m.status) && (
            <button onClick={cancel} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-card-border text-xs font-bold px-3 py-2">
              <PauseCircle className="w-3.5 h-3.5" />Cancel
            </button>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-2">Plan</div>
          <div className="space-y-1">
            {m.plan.map((s) => {
              const v = m.verification?.stepVerdicts?.find((vv) => vv.stepIndex === s.index);
              const passed = v?.passed;
              return (
                <div key={s.index} className="flex items-start gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-[11px]">
                  <div className="font-mono text-muted-foreground shrink-0 w-4">{s.index}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] uppercase rounded border border-card-border px-1.5 py-0.5">{s.engine}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{s.action}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2">{s.acceptance}</div>
                  </div>
                  {passed === true && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {passed === false && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-2">Event log</div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {events.slice().reverse().map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-[11px] font-mono rounded bg-black/20 px-2 py-1">
                <span className="text-muted-foreground shrink-0">{fmtAgo(e.receivedAt)}</span>
                <span className="flex-1 min-w-0 break-words">{e.kind}</span>
                <span className="text-muted-foreground text-[9px] shrink-0">{e.source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MissionsPage() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [newGoal, setNewGoal] = useState("");
  const [showNew, setShowNew] = useState(false);

  const stats = useQuery({
    queryKey: ["missions-stats"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/missions/stats"));
      return r.json() as Promise<MissionStats>;
    },
    refetchInterval: 5000,
  });

  const list = useQuery({
    queryKey: ["missions"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/missions?limit=50"));
      const d = await r.json();
      return (d.missions ?? []) as Mission[];
    },
    refetchInterval: 4000,
  });

  const create = async () => {
    if (!newGoal.trim()) return;
    await fetch(resolveApiUrl("/api/missions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: newGoal }),
    });
    setNewGoal("");
    setShowNew(false);
    qc.invalidateQueries({ queryKey: ["missions"] });
    qc.invalidateQueries({ queryKey: ["missions-stats"] });
  };

  const active = (list.data ?? []).filter((m) => ["new", "planned", "executing", "verifying", "waiting"].includes(m.status));
  const completed = (list.data ?? []).filter((m) => m.status === "completed");
  const failed = (list.data ?? []).filter((m) => m.status === "failed" || m.status === "blocked");
  const cancelled = (list.data ?? []).filter((m) => m.status === "cancelled");

  const Stat = ({ label, value, color }: { label: string; value: number | string; color?: string }) => (
    <div className="rounded-xl border border-card-border bg-card/50 p-3">
      <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-black font-mono mt-1", color ?? "text-foreground")}>{value}</div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-primary">Mission Kernel</div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black break-words">Durable, event-driven execution loop</h1>
            <p className="mt-1 text-sm text-muted-foreground">Every mission is a persistent object: observe → plan → dispatch → execute → verify → save. Cancel, retry, or distill into a skill.</p>
          </div>
          <button
            onClick={() => setShowNew((s) => !s)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold px-3 py-2"
          >
            <Plus className="w-4 h-4" />New mission
          </button>
        </header>

        {showNew && (
          <div className="rounded-2xl border border-card-border bg-card/50 p-4 space-y-3">
            <textarea
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="Goal — e.g. research competitor pricing for Q3"
              className="w-full rounded-xl border border-card-border bg-black/20 p-3 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowNew(false); setNewGoal(""); }} className="rounded-xl border border-card-border text-xs font-bold px-3 py-2">Cancel</button>
              <button onClick={create} className="rounded-xl bg-primary text-primary-foreground text-xs font-bold px-3 py-2 inline-flex items-center gap-1.5">
                <Rocket className="w-3.5 h-3.5" />Launch
              </button>
            </div>
          </div>
        )}

        <section className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <Stat label="Total" value={stats.data?.total ?? 0} />
          <Stat label="Active" value={stats.data?.active ?? 0} color="text-blue-300" />
          <Stat label="Completed" value={stats.data?.completed ?? 0} color="text-emerald-300" />
          <Stat label="Failed" value={stats.data?.failed ?? 0} color="text-red-300" />
          <Stat label="Blocked" value={stats.data?.blocked ?? 0} color="text-orange-300" />
        </section>

        {[
          { title: "Active", icon: Activity, color: "text-blue-300", items: active },
          { title: "Completed", icon: CheckCircle2, color: "text-emerald-300", items: completed },
          { title: "Blocked / Failed", icon: AlertTriangle, color: "text-orange-300", items: failed },
          { title: "Cancelled", icon: PauseCircle, color: "text-slate-300", items: cancelled },
        ].map((sec) => {
          const SecIcon = sec.icon;
          return (
            <section key={sec.title}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <SecIcon className={cn("w-4 h-4", sec.color)} />
                  <h2 className="text-sm font-black uppercase tracking-wider">{sec.title}</h2>
                  <span className="text-xs font-mono text-muted-foreground">({sec.items.length})</span>
                </div>
              </div>
              {sec.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-card-border p-6 text-center text-xs text-muted-foreground">
                  No missions here yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sec.items.map((m) => (
                    <MissionCard key={m.id} m={m} onOpen={setOpenId} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {openId !== null && <MissionDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}