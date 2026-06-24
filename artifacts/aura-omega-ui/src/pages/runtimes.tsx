import { useEffect, useState } from "react";
import { apiJson, runtimeLanes } from "@/lib/auraConsole";
import { Bot, BrainCircuit, Code2, DatabaseZap, Globe2, HardDrive, PlayCircle, ServerCog, ShieldCheck } from "lucide-react";

export default function RuntimesPage() {
  const [models, setModels] = useState<any>(null);
  const [selfCheck, setSelfCheck] = useState<any>(null);
  useEffect(() => {
    apiJson("/api/ai/models").then(setModels).catch(() => setModels(null));
    apiJson("/api/self-check").then(setSelfCheck).catch(() => setSelfCheck(null));
  }, []);

  const icons = [BrainCircuit, Bot, DatabaseZap, Globe2, Code2, ServerCog, HardDrive, ShieldCheck];
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8"><div className="mx-auto max-w-7xl space-y-6">
      <header><div className="text-xs font-black uppercase tracking-widest text-primary">Runtime control plane</div><h1 className="text-3xl font-black">Models, memory, browser, code, deploy, n8n</h1><p className="text-muted-foreground">All lanes the agent can use. Kimi is the planner; BOS-OMEGA is governor/verifier.</p></header>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{runtimeLanes.map((lane, i) => { const Icon = icons[i % icons.length]; return <div key={lane.name} className="rounded-2xl border border-card-border bg-card/50 p-5"><div className="flex items-center justify-between"><Icon className="w-6 h-6 text-primary" /><span className="rounded-full border border-card-border px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{lane.status}</span></div><h3 className="mt-4 font-black">{lane.name}</h3><p className="mt-1 text-sm text-muted-foreground">{lane.role}</p><button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-card-border px-3 py-2 text-xs font-bold"><PlayCircle className="w-4 h-4" />Open lane</button></div> })}</section>
      <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black">Model catalog</h2><pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-black/30 p-4 text-xs text-muted-foreground">{JSON.stringify(models || { status: "offline in preview", required: ["KIMI_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "NVIDIA_API_KEY"] }, null, 2)}</pre></div><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black">Self-check</h2><pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-black/30 p-4 text-xs text-muted-foreground">{JSON.stringify(selfCheck || { status: "not reachable in static preview", checks: ["api", "db", "cron", "n8n", "memory", "uploads"] }, null, 2)}</pre></div></section>
    </div></div>
  );
}
