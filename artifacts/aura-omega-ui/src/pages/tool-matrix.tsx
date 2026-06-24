import { useEffect, useMemo, useState } from "react";
import { apiJson, toolDomains } from "@/lib/auraConsole";
import { Brain, GitBranch, Search, ShieldAlert, Workflow, Zap } from "lucide-react";

type ToolIntent = {
  id: string;
  tool?: string;
  category?: string;
  description?: string;
  triggerPhrases?: string[];
  intentKeywords?: string[];
  semanticExamples?: string[];
  requiredInputs?: string[];
  optionalInputs?: string[];
  produces?: string[];
  risk?: string;
  callWhen?: string[];
  doNotCallWhen?: string[];
  interactionProtocol?: string[];
  payloadTemplate?: Record<string, unknown>;
  chainBefore?: string[];
  chainAfter?: string[];
};

export default function ToolMatrixPage() {
  const [intents, setIntents] = useState<ToolIntent[]>([]);
  const [query, setQuery] = useState("push code to github, deploy render, run smoke test");
  const [selection, setSelection] = useState<any>(null);
  const [domain, setDomain] = useState("all");

  useEffect(() => { apiJson<{ intents: ToolIntent[] }>("/api/n8n/tool-intents").then((x) => setIntents(x.intents || [])).catch(() => setIntents([])); }, []);

  const filtered = useMemo(() => intents.filter((x) => domain === "all" || x.category === domain || x.intentKeywords?.includes(domain) || x.triggerPhrases?.join(" ").includes(domain)), [intents, domain]);

  async function selectTool() {
    const out = await apiJson("/api/n8n/tool-intents/select", { method: "POST", body: JSON.stringify({ objective: query, availableInputs: { repo: true, branch: true, objective: true } }) });
    setSelection(out);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-xs font-black uppercase tracking-widest text-primary">AURA Tool Selection Matrix</div><h1 className="text-3xl font-black">Phrase → intent → n8n tool → policy → execution</h1><p className="mt-1 text-muted-foreground">This is the vector-like tool memory that tells the LLM what to pick and how to call it.</p></div>
          <div className="flex gap-2"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{intents.length || 60} tools</span><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">required input gates</span></div>
        </header>

        <section className="rounded-2xl border border-card-border bg-card/50 p-5">
          <div className="flex items-center gap-2 text-lg font-black"><Brain className="w-5 h-5 text-primary" /> Test tool selection</div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]"><textarea value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-24 rounded-xl border border-card-border bg-background p-3 text-sm outline-none focus:border-primary" /><button onClick={selectTool} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"><Zap className="inline w-4 h-4 mr-2" />Score</button></div>
          {selection && <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-black/30 p-4 text-xs text-muted-foreground">{JSON.stringify(selection, null, 2)}</pre>}
        </section>

        <section className="rounded-2xl border border-card-border bg-card/50 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2"><button onClick={() => setDomain("all")} className={`rounded-full px-3 py-1 text-xs font-bold ${domain === "all" ? "bg-primary text-primary-foreground" : "bg-background border border-card-border"}`}>all</button>{toolDomains.map((d) => <button key={d} onClick={() => setDomain(d)} className={`rounded-full px-3 py-1 text-xs font-bold ${domain === d ? "bg-primary text-primary-foreground" : "bg-background border border-card-border text-muted-foreground"}`}>{d}</button>)}</div>
          <div className="grid gap-4 lg:grid-cols-2">{filtered.map((intent) => <article key={intent.id} className="rounded-2xl border border-card-border bg-background/50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{intent.id}</h3><p className="text-sm text-muted-foreground">{intent.description}</p></div><span className="rounded-full border border-card-border px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{intent.risk || "medium"}</span></div><div className="mt-3 grid gap-3 md:grid-cols-2"><div><div className="mb-1 text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1"><Search className="w-3 h-3" /> triggers</div><div className="flex flex-wrap gap-1">{(intent.triggerPhrases || []).slice(0, 5).map((x) => <span key={x} className="rounded-md bg-card px-2 py-1 text-[10px] text-muted-foreground">{x}</span>)}</div></div><div><div className="mb-1 text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1"><GitBranch className="w-3 h-3" /> chains</div><div className="text-xs text-muted-foreground">before: {(intent.chainBefore || []).join(", ") || "none"}</div><div className="text-xs text-muted-foreground">after: {(intent.chainAfter || []).join(", ") || "verify/report"}</div></div></div><div className="mt-3 rounded-xl border border-card-border bg-card/50 p-3"><div className="mb-1 text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> call rules</div><ul className="list-disc pl-4 text-xs text-muted-foreground">{(intent.callWhen || []).slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></div><div className="mt-3 text-xs text-muted-foreground"><strong>Required:</strong> {(intent.requiredInputs || []).join(", ") || "objective"} · <strong>Produces:</strong> {(intent.produces || []).join(", ") || "result"}</div></article>)}</div>
        </section>
      </div>
    </div>
  );
}
