import { useEffect, useState } from "react";
import { BrainCircuit, Gauge, Lock, Moon, Save, ShieldCheck, SlidersHorizontal, UploadCloud } from "lucide-react";

export default function Settings() {
  const [model, setModel] = useState("kimi-k2.6");
  const [mode, setMode] = useState("governed-autonomous");
  const [temperature, setTemperature] = useState(0.4);
  const [maxRisk, setMaxRisk] = useState("medium");
  const [uploads, setUploads] = useState("all-safe-files");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch("/api/settings/runtime")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const settings = data?.settings;
        if (!settings) return;
        setModel(settings.primaryPlanner ?? "kimi-k2.6");
        setMode(settings.runtimeMode ?? "governed-autonomous");
        setTemperature(Number(settings.temperature ?? 0.4));
        setMaxRisk(settings.maxAutomaticRisk ?? "medium");
        setUploads(settings.uploadMode ?? "all-safe-files");
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch("/api/settings/runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryPlanner: model,
          runtimeMode: mode,
          temperature,
          maxAutomaticRisk: maxRisk,
          uploadMode: uploads,
          requireVerificationBeforeDone: true,
          neverShowSecretsToModel: true,
          askForMissingRequiredFields: true,
          pauseForCaptchaOrLogin: true,
          branchBeforeGithubPush: true,
          noDestructiveProductionActionWithoutApproval: true,
          mvpGovernorRequired: true,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(String(err));
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8"><div className="mx-auto max-w-6xl space-y-6">
      <header><div className="text-xs font-black uppercase tracking-widest text-primary">Operator settings</div><h1 className="text-3xl font-black">AURA-OMEGA behavior, models, safety, UX</h1><p className="text-muted-foreground">Gemini-style settings for a governed autonomous runtime.</p></header>
      <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-primary" /> Brain model</h2><div className="mt-4 space-y-4"><label className="block"><span className="text-xs font-bold uppercase text-muted-foreground">Primary planner</span><select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-xl border border-card-border bg-background px-3 py-2"><option value="kimi-k2.6">Kimi K2.6 through policy gate</option><option value="openrouter-auto">OpenRouter auto-router</option><option value="gemini-2.5-pro">Gemini 2.5 Pro</option><option value="openai-o-series">OpenAI o-series</option><option value="nvidia-nim">NVIDIA NIM pool</option></select></label><label className="block"><span className="text-xs font-bold uppercase text-muted-foreground">Runtime mode</span><select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-1 w-full rounded-xl border border-card-border bg-background px-3 py-2"><option value="chat-only">Chat only</option><option value="governed-autonomous">Governed autonomous</option><option value="full-auto-dry-run">Full auto dry-run</option><option value="full-auto-approved-tools">Full auto approved tools only</option></select></label><label className="block"><span className="text-xs font-bold uppercase text-muted-foreground">Temperature: {temperature}</span><input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="mt-2 w-full" /></label></div></div><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> Policy gates</h2><div className="mt-4 space-y-4"><label className="block"><span className="text-xs font-bold uppercase text-muted-foreground">Max automatic risk</span><select value={maxRisk} onChange={(e) => setMaxRisk(e.target.value)} className="mt-1 w-full rounded-xl border border-card-border bg-background px-3 py-2"><option value="low">Low only</option><option value="medium">Medium and below</option><option value="high-human-review">High requires human review</option><option value="never-destructive">Never destructive</option></select></label>{["Require verification before DONE", "Never show secrets to model", "Ask for missing required fields", "Pause for captcha/login", "Branch before GitHub push", "No production destructive action without approval"].map((x) => <label key={x} className="flex items-center gap-3 rounded-xl border border-card-border bg-background/50 p-3"><input type="checkbox" defaultChecked /><span className="text-sm">{x}</span></label>)}</div></div></section><section className="grid gap-6 lg:grid-cols-3"><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="font-black flex items-center gap-2"><UploadCloud className="w-5 h-5 text-primary" /> Uploads</h2><p className="mt-2 text-sm text-muted-foreground">Chat supports images, PDFs, code, logs, text, JSON, CSV, docs, and generic binary up to the backend cap.</p><select value={uploads} onChange={(e) => setUploads(e.target.value)} className="mt-4 w-full rounded-xl border border-card-border bg-background px-3 py-2"><option value="all-safe-files">All safe files</option><option value="images-and-text">Images and text/code only</option><option value="disabled">Disabled</option></select></div><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="font-black flex items-center gap-2"><Moon className="w-5 h-5 text-primary" /> Appearance</h2><div className="mt-4 space-y-3"><button className="w-full rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-bold text-primary">Dark mission control</button><button className="w-full rounded-xl border border-card-border px-3 py-2 text-sm font-bold text-muted-foreground">Compact operator view</button></div></div><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="font-black flex items-center gap-2"><Gauge className="w-5 h-5 text-primary" /> Autonomy</h2><div className="mt-4 space-y-3 text-sm text-muted-foreground"><div>Heartbeat: dry-run/self-check</div><div>n8n external calls: gated</div><div>Tool chaining: enabled</div><div>Outcome learning: enabled</div></div></div></section><section className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-primary" /> Save settings</h2><p className="mt-1 text-sm text-muted-foreground">These controls persist to backend runtime policy storage. MVP Governor remains mandatory and cannot be disabled.</p><button onClick={save} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Save className="w-4 h-4" />Save operator preferences</button>{saved && <span className="ml-3 text-sm text-emerald-300">Saved to backend runtime settings.</span>}{saveError && <span className="ml-3 text-sm text-red-300">Save failed: {saveError}</span>}</section><section className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="font-black flex items-center gap-2"><Lock className="w-5 h-5 text-primary" /> Secret reference rule</h2><code className="mt-3 block rounded-xl bg-black/30 p-4 text-sm text-muted-foreground">{`Use {{secret:NAME}} in commands. Raw values are injected only at execution time, never into the LLM prompt.`}</code></section>
    </div></div>
  );
}
