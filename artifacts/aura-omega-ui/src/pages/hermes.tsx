import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { resolveApiUrl } from "@workspace/api-client-react";
import {
  Boxes,
  RefreshCw,
  PlayCircle,
  Sparkles,
  ScrollText,
  Activity,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface HermesStatus {
  ok: boolean;
  uptime: number;
  skills: { total: number; active: number; candidates: number; retired: number };
  sessions: { recent: number; lastOutcome: string | null; lastGoal: string | null; lastStartedAt: string | null };
}

interface HermesSkill {
  id: number;
  name: string;
  description: string;
  status: "candidate" | "active" | "retired";
  successScore: number;
  successCount: number;
  failureCount: number;
  triggerKeywords: string[];
  preferredAura: number | null;
  updatedAt: string;
}

interface HermesSession {
  id: number;
  goal: string;
  outcome: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

interface HeartbeatReport {
  startedAt: string;
  finishedAt: string;
  nudgesProcessed: number;
  skillsPruned: number;
  skillsPromoted: number;
  sessionsConsolidated: number;
  errors: string[];
}

function fmtUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function HermesPage() {
  const status = useQuery({
    queryKey: ["hermes", "status"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/hermes/status"));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as HermesStatus;
    },
    refetchInterval: 8000,
  });

  const skills = useQuery({
    queryKey: ["hermes", "skills"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/hermes/skills?limit=50"));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { ok: boolean; count: number; skills: HermesSkill[] };
    },
    refetchInterval: 10000,
  });

  const sessions = useQuery({
    queryKey: ["hermes", "sessions"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/hermes/sessions?limit=20"));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { ok: boolean; count: number; sessions: HermesSession[] };
    },
    refetchInterval: 10000,
  });

  const [heartbeatRunning, setHeartbeatRunning] = useState(false);
  const [lastReport, setLastReport] = useState<HeartbeatReport | null>(null);

  const runHeartbeat = async () => {
    setHeartbeatRunning(true);
    try {
      const r = await fetch(resolveApiUrl("/api/hermes/heartbeat"), { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setLastReport(data.report ?? null);
      status.refetch();
      skills.refetch();
    } catch (err) {
      setLastReport({ startedAt: "", finishedAt: "", nudgesProcessed: 0, skillsPruned: 0, skillsPromoted: 0, sessionsConsolidated: 0, errors: [String(err)] });
    } finally {
      setHeartbeatRunning(false);
    }
  };

  const allRefresh = () => {
    status.refetch();
    skills.refetch();
    sessions.refetch();
  };

  const s = status.data;
  const sk = skills.data?.skills ?? [];
  const ss = sessions.data?.sessions ?? [];
  const activeSkills = sk.filter((x) => x.status === "active");
  const candidateSkills = sk.filter((x) => x.status === "candidate");
  const retiredSkills = sk.filter((x) => x.status === "retired");

  return (
    <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Boxes className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-black tracking-tight">Hermes</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Persistent runtime: closed-loop learning, skill library, heartbeat.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={allRefresh}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={runHeartbeat}
              disabled={heartbeatRunning}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary/12 text-primary border border-primary/20 px-3 py-2 text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" />
              {heartbeatRunning ? "Running…" : "Run heartbeat"}
            </button>
          </div>
        </div>

        {/* Status row */}
        {status.isError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 mb-6 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <span>Hermes endpoint unreachable — server may be restarting or DB down.</span>
          </div>
        ) : null}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Skills"
            value={s?.skills.total ?? "—"}
            sub={`${s?.skills.active ?? 0} active · ${s?.skills.candidates ?? 0} candidate`}
          />
          <StatCard
            label="Sessions"
            value={s?.sessions.recent ?? "—"}
            sub={s?.sessions.lastOutcome ? `Last: ${s.sessions.lastOutcome}` : "No runs yet"}
          />
          <StatCard
            label="Uptime"
            value={s ? fmtUptime(s.uptime) : "—"}
            sub={status.isFetching ? "refreshing…" : "live"}
          />
          <StatCard
            label="Last heartbeat"
            value={lastReport ? fmtRelative(lastReport.finishedAt) : "—"}
            sub={lastReport ? `${lastReport.nudgesProcessed} nudges processed` : "click Run heartbeat"}
          />
        </div>

        {/* Skills section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Skill library
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {skills.isLoading ? "loading…" : `${sk.length} total`}
            </span>
          </div>
          {sk.length === 0 && !skills.isLoading ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
              <div className="text-sm text-muted-foreground">
                No skills yet. They'll appear here after a goal completes with a clear tool-call pattern.
              </div>
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                Distillation runs automatically on every orchestrated goal.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...activeSkills, ...candidateSkills, ...retiredSkills].map((skill) => (
                <div
                  key={skill.id}
                  className={cn(
                    "rounded-xl border bg-card px-4 py-3",
                    skill.status === "active"   && "border-primary/30 bg-primary/5",
                    skill.status === "candidate"&& "border-border",
                    skill.status === "retired"  && "border-border opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-mono text-sm font-semibold truncate">{skill.name}</div>
                    <div className={cn(
                      "shrink-0 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full",
                      skill.status === "active"   && "bg-primary/15 text-primary",
                      skill.status === "candidate"&& "bg-muted text-muted-foreground",
                      skill.status === "retired"  && "bg-muted text-muted-foreground/60 line-through",
                    )}>
                      {skill.status}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{skill.description}</p>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground/80">
                    <span>score {(skill.successScore * 100).toFixed(0)}%</span>
                    <span>{skill.successCount}/{skill.successCount + skill.failureCount} runs</span>
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        skill.successScore >= 0.7 ? "bg-primary" :
                        skill.successScore >= 0.3 ? "bg-amber-500" : "bg-destructive",
                      )}
                      style={{ width: `${Math.max(2, skill.successScore * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sessions section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-primary" />
              Recent sessions
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {sessions.isLoading ? "loading…" : `${ss.length} runs`}
            </span>
          </div>
          {ss.length === 0 && !sessions.isLoading ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
              <div className="text-sm text-muted-foreground">
                No sessions recorded yet.
              </div>
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                Dispatch a goal in Chat — it'll appear here on completion.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {ss.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <div className={cn(
                    "shrink-0 w-2 h-2 rounded-full",
                    session.outcome === "success" && "bg-emerald-400",
                    session.outcome === "partial" && "bg-amber-400",
                    session.outcome === "failed" && "bg-destructive",
                    session.outcome === "interrupted" && "bg-muted-foreground",
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{session.goal}</div>
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5 flex items-center gap-2">
                      <span>{fmtRelative(session.startedAt)}</span>
                      {session.durationMs != null && (
                        <>
                          <span>·</span>
                          <span>{(session.durationMs / 1000).toFixed(1)}s</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    "shrink-0 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full",
                    session.outcome === "success" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    session.outcome === "partial" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                    session.outcome === "failed" && "bg-destructive/15 text-destructive",
                    session.outcome === "interrupted" && "bg-muted text-muted-foreground",
                  )}>
                    {session.outcome}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Heartbeat report */}
        {lastReport && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Last heartbeat report
              </h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Nudges</div>
                  <div className="font-mono font-semibold">{lastReport.nudgesProcessed}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Promoted</div>
                  <div className="font-mono font-semibold">{lastReport.skillsPromoted}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Retired</div>
                  <div className="font-mono font-semibold">{lastReport.skillsPruned}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Consolidated</div>
                  <div className="font-mono font-semibold">{lastReport.sessionsConsolidated}</div>
                </div>
              </div>
              {lastReport.errors.length > 0 && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive space-y-1">
                  {lastReport.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="font-mono">{e}</span>
                    </div>
                  ))}
                </div>
              )}
              {lastReport.errors.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Heartbeat finished clean.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}