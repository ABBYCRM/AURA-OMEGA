import { useEffect, useState } from "react";
import { apiJson, integrationCatalog, runtimeLanes, toolDomains } from "@/lib/auraConsole";
import { Activity, BrainCircuit, CheckCircle2, DatabaseZap, Gauge, Play, ShieldCheck, Workflow, Zap } from "lucide-react";

type N8nTask = { id: string; name: string; trigger: string; webhookPath: string; ownerAgent: string; enabled: boolean; tags: string[]; priority: string };
type Heartbeat = { running?: boolean; jobs?: Array<{ id: string; name: string; intervalMs: number; enabled: boolean }> };

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <div className="rounded-2xl border border-card-border bg-card/60 p-4 shadow-sm"><div className="text-2xl font-black">{value}</div><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-xs text-muted-foreground">{hint}</div></div>;
}

export default function OpsPage() {
  const [tasks, setTasks] = useState<N8nTask[]>([]);
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [objective, setObjective] = useState("Fix code, verify build, deploy to Render, then report evidence.");
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    apiJson<{ tasks: N8nTask[] }>("/api/n8n/tasks").then((x) => setTasks(x.tasks || [])).catch(() => setTasks([]));
    apiJson<Heartbeat>("/api/n8n/autonomy/heartbeat").then(setHeartbeat).catch(() => setHeartbeat(null));
  }, []);

  async function planObjective() {
    const out = await apiJson("/api/n8n/autonomous/plan", { method: "POST", body: JSON.stringify({ objective }) });
    setPlan(out);
  }

  const activeIntegrations = integrationCatalog.filter((x) => x.configured).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-primary/20 bg-card/50 p-6 lg:p-8 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_20%,rgba(139,92,246,.20),transparent_24rem),radial-gradient(circle_at_85%_10%,rgba(34,211,238,.12),transparent_22rem)]" />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_.8fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><BrainCircuit className="w-4 h-4" /> AURA-OMEGA AGENTIC OPERATIONS CONSOLE</div>
              <h1 className="mt-4 text-4xl lg:text-5xl font-black tracking-tight">Not chat. Mission control.</h1>
              <p className="mt-3 max-w-3xl text-muted-foreground">Operate BOS-OMEGA, Kimi planner, 60 n8n tools, heartbeat autonomy, memory, coding/GitHub/Render/VPS lanes, and provider integrations from one UI.</p>
              <div className="mt-5 flex flex-wrap gap-2">{toolDomains.slice(0, 12).map((d) => <span key={d} className="rounded-full border border-card-border bg-background/60 px-3 py-1 text-xs font-bold uppercase text-muted-foreground">{d}</span>)}</div>
            </div>
            <div className="rounded-2xl border border-card-border bg-background/70 p-4">
              <div className="text-sm font-bold mb-2 flex items-center gap-2"><Workflow className="w-4 h-4 text-primary" /> Quick autonomous plan</div>
              <textarea value={objective} onChange={(e) => setObjective(e.target.value)} className="h-24 w-full rounded-xl border border-card-border bg-background p-3 text-sm outline-none focus:border-primary" />
              <button onClick={planObjective} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"><Play className="w-4 h-4" /> Plan with Tool Matrix</button>
              {plan && <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-black/30 p-3 text-[11px] text-muted-foreground">{JSON.stringify(plan, null, 2)}</pre>}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="n8n tools" value={tasks.length || 60} hint="Registered workflow hands" />
          <Stat label="providers" value={`${activeIntegrations}/${integrationCatalog.length}`} hint="Configured provider lanes" />
          <Stat label="heartbeat" value={heartbeat?.running ? "ON" : "DRY"} hint={`${heartbeat?.jobs?.length || 4} internal cron self-checks`} />
          <Stat label="runtime" value="AURA" hint="BOS governor + tool router" />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-card-border bg-card/50 p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Runtime lanes</h2><span className="text-xs text-muted-foreground">Live-ready architecture map</span></div>
            <div className="grid gap-3 md:grid-cols-2">{runtimeLanes.map((lane) => <div key={lane.name} className="rounded-xl border border-card-border bg-background/50 p-4"><div className="flex items-center justify-between gap-3"><div className="font-bold">{lane.name}</div><span className="rounded-full border border-card-border px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{lane.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{lane.role}</p></div>)}</div>
          </div>
          <div className="rounded-2xl border border-card-border bg-card/50 p-5">
            <h2 className="text-lg font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> Execution rules</h2>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              {["LLM proposes, BOS approves.", "Tool calls require input gates.", "High-risk actions need policy review.", "Results get verified before DONE.", "Secrets stay write-only and redacted."].map((x) => <div key={x} className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /><span>{x}</span></div>)}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-card-border bg-card/50 p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black flex items-center gap-2"><DatabaseZap className="w-5 h-5 text-accent" /> Tool coverage</h2><span className="text-xs text-muted-foreground">Coding, web, GitHub, Render, VPS, Discord, CRM, media, memory</span></div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{(tasks.length ? tasks : []).slice(0, 12).map((task) => <div key={task.id} className="rounded-xl border border-card-border bg-background/50 p-3"><div className="flex justify-between gap-2"><strong className="text-sm">{task.name}</strong><span className="text-[10px] text-muted-foreground">{task.id}</span></div><div className="mt-1 text-xs text-muted-foreground">{task.webhookPath}</div></div>)}{!tasks.length && <div className="text-sm text-muted-foreground">API offline in preview; registry is included in source.</div>}</div>
        </section>
      </div>
    </div>
  );
}
