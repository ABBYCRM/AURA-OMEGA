import { useState, useEffect } from "react";
import {
  Key, Shield, Bell, Database, Globe, Cpu,
  Save, Check, Loader2, BrainCircuit, Gauge, Moon,
  UploadCloud, Lock, Sparkles, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const settingsTabs = [
  { id: "runtime", label: "Runtime", icon: <Cpu size={16} /> },
  { id: "personality", label: "Personality", icon: <Sparkles size={16} /> },
  { id: "apikeys", label: "API Keys", icon: <Key size={16} /> },
  { id: "network", label: "Network", icon: <Globe size={16} /> },
];

export default function Settings() {
  const [tab, setTab] = useState("runtime");

  /* Runtime */
  const [model, setModel] = useState("kimi-k2.6");
  const [mode, setMode] = useState("governed-autonomous");
  const [temperature, setTemperature] = useState(0.4);
  const [maxRisk, setMaxRisk] = useState("medium");
  const [uploads, setUploads] = useState("all-safe-files");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  /* Personality */
  const [personality, setPersonality] = useState("");
  const [personalitySaved, setPersonalitySaved] = useState(false);
  const [personalityError, setPersonalityError] = useState("");
  const [personalityLoading, setPersonalityLoading] = useState(false);

  /* Load settings on mount */
  useEffect(() => {
    fetch("/api/settings/runtime")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const s = d?.settings;
        if (!s) return;
        setModel(s.primaryPlanner ?? "kimi-k2.6");
        setMode(s.runtimeMode ?? "governed-autonomous");
        setTemperature(Number(s.temperature ?? 0.4));
        setMaxRisk(s.maxAutomaticRisk ?? "medium");
        setUploads(s.uploadMode ?? "all-safe-files");
      }).catch(() => undefined);

    fetch("/api/settings/personality")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.systemPersonality != null) setPersonality(d.systemPersonality); })
      .catch(() => undefined);
  }, []);

  async function saveRuntime() {
    setSaveError(""); setSaved(false);
    try {
      const res = await fetch("/api/settings/runtime", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryPlanner: model, runtimeMode: mode, temperature, maxAutomaticRisk: maxRisk, uploadMode: uploads, requireVerificationBeforeDone: true, neverShowSecretsToModel: true, askForMissingRequiredFields: true, pauseForCaptchaOrLogin: true, branchBeforeGithubPush: true, noDestructiveProductionActionWithoutApproval: true, mvpGovernorRequired: true }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setSaveError(String(e)); }
  }

  async function savePersonality() {
    setPersonalityError(""); setPersonalitySaved(false); setPersonalityLoading(true);
    try {
      const res = await fetch("/api/settings/personality", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemPersonality: personality }) });
      if (!res.ok) throw new Error(`${res.status}`);
      setPersonalitySaved(true); setTimeout(() => setPersonalitySaved(false), 2500);
    } catch (e) { setPersonalityError(String(e)); }
    finally { setPersonalityLoading(false); }
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar animate-fade-in">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6">
        <div className="mb-4 sm:mb-6 pt-8 sm:pt-0">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Settings</h2>
          <p className="text-xs sm:text-sm text-[hsl(0_0%_45%)] mt-0.5">Configure AURA-OMEGA runtime behavior</p>
        </div>

        {/* Tabs - horizontal scroll on mobile */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar mb-4 sm:mb-6 pb-1">
          {settingsTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn(
              "flex items-center gap-2 px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm transition-all whitespace-nowrap shrink-0",
              tab === t.id ? "bg-[hsl(24_95%_53%/0.12)] text-orange-400 font-medium" : "text-[hsl(0_0%_50%)] hover:text-white hover:bg-[hsl(0_0%_10%)]"
            )}>
              <span className={tab === t.id ? "text-orange-400" : "text-[hsl(0_0%_40%)]"]}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* === RUNTIME === */}
        {tab === "runtime" && (
          <div className="space-y-3 sm:space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><BrainCircuit size={14} className="text-orange-400" /> Brain Model</h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-[hsl(0_0%_45%)] uppercase">Primary Planner</span>
                    <select value={model} onChange={e => setModel(e.target.value)} className="mt-1 w-full rounded-lg border border-[hsl(0_0%_18%)] bg-[hsl(0_0%_9%)] px-3 py-2 text-sm text-white">
                      <option value="kimi-k2.6">Kimi K2.6</option>
                      <option value="nvidia-nim">NVIDIA NIM Pool</option>
                      <option value="openai-o-series">OpenAI o-series</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-[hsl(0_0%_45%)] uppercase">Runtime Mode</span>
                    <select value={mode} onChange={e => setMode(e.target.value)} className="mt-1 w-full rounded-lg border border-[hsl(0_0%_18%)] bg-[hsl(0_0%_9%)] px-3 py-2 text-sm text-white">
                      <option value="chat-only">Chat only</option>
                      <option value="governed-autonomous">Governed autonomous</option>
                      <option value="full-auto-dry-run">Full auto dry-run</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-[hsl(0_0%_45%)] uppercase">Temperature: {temperature}</span>
                    <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} className="mt-2 w-full accent-orange-500" />
                  </label>
                </div>
              </div>

              <div className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Shield size={14} className="text-green-400" /> Policy Gates</h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-[hsl(0_0%_45%)] uppercase">Max Automatic Risk</span>
                    <select value={maxRisk} onChange={e => setMaxRisk(e.target.value)} className="mt-1 w-full rounded-lg border border-[hsl(0_0%_18%)] bg-[hsl(0_0%_9%)] px-3 py-2 text-sm text-white">
                      <option value="low">Low only</option>
                      <option value="medium">Medium and below</option>
                      <option value="high-human-review">High requires human review</option>
                      <option value="never-destructive">Never destructive</option>
                    </select>
                  </label>
                  {["Require verification before DONE", "Never show secrets to model", "Pause for captcha/login", "Branch before GitHub push"].map(x => (
                    <label key={x} className="flex items-center gap-3 rounded-lg border border-[hsl(0_0%_16%)] bg-[hsl(0_0%_9%)] p-2.5 cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-orange-500" />
                      <span className="text-xs text-[hsl(0_0%_70%)]">{x}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2"><UploadCloud size={14} className="text-orange-400" /> Uploads</h3>
              <select value={uploads} onChange={e => setUploads(e.target.value)} className="w-full rounded-lg border border-[hsl(0_0%_18%)] bg-[hsl(0_0%_9%)] px-3 py-2 text-sm text-white">
                <option value="all-safe-files">All safe files</option>
                <option value="images-and-text">Images and text only</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <div className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Save size={14} className="text-orange-400" /> Save Settings</h3>
                <p className="text-[10px] text-[hsl(0_0%_45%)] mt-0.5">Persist to backend runtime policy storage</p>
              </div>
              <div className="flex items-center gap-3">
                {saved && <span className="text-xs text-green-400">Saved!</span>}
                {saveError && <span className="text-xs text-red-400">Failed</span>}
                <button onClick={saveRuntime} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors">
                  <Save size={14} /> Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === PERSONALITY === */}
        {tab === "personality" && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2"><Sparkles size={14} className="text-orange-400" /> System Personality</h3>
              <p className="text-[11px] text-[hsl(0_0%_45%)] mb-3">Prepended to every agent&apos;s system prompt. Defines core identity, tone, and operating philosophy.</p>
              <textarea
                value={personality} onChange={e => setPersonality(e.target.value)}
                placeholder="Define AURA-OMEGA's personality..."
                spellCheck={false}
                className="w-full min-h-[300px] rounded-lg border border-[hsl(0_0%_18%)] bg-[hsl(0_0%_9%)] p-3 font-mono text-xs text-white placeholder:text-[hsl(0_0%_35%)] resize-y focus:outline-none focus:border-orange-500/40"
              />
              <div className="flex items-center gap-3 mt-3">
                <button onClick={savePersonality} disabled={personalityLoading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                  <Save size={14} /> {personalityLoading ? "Saving..." : "Save"}
                </button>
                {personality && <button onClick={() => setPersonality("")} className="px-4 py-2 rounded-lg border border-[hsl(0_0%_18%)] text-xs text-[hsl(0_0%_50%)] hover:text-white transition-colors">Clear</button>}
                {personalitySaved && <span className="text-xs text-green-400">Saved — active on next call.</span>}
                {personalityError && <span className="text-xs text-red-400">{personalityError}</span>}
              </div>
            </div>
          </div>
        )}

        {/* === API KEYS === */}
        {tab === "apikeys" && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 sm:p-4 flex items-start gap-2.5">
              <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-blue-400 font-medium">Security Note</p>
                <p className="text-[10px] sm:text-[11px] text-[hsl(0_0%_50%)]">API keys are stored in environment variables on the server. They are never exposed to the frontend or LLM prompts. Use <code className="text-orange-400">{`{{secret:NAME}}`}</code> in commands.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { name: "NVIDIA NIM", keys: "8 keys active", status: "active" },
                { name: "Kimi K2.6", keys: "Fallback ready", status: "active" },
                { name: "OpenAI", keys: "Tertiary ready", status: "active" },
                { name: "A2E (Agent-to-Env)", keys: "Key added", status: "active" },
                { name: "ScrapingBee", keys: "Active", status: "active" },
                { name: "ScrapFly", keys: "Active", status: "active" },
                { name: "Firecrawl", keys: "Active", status: "active" },
                { name: "Steel", keys: "Active", status: "active" },
                { name: "Tavily", keys: "Active", status: "active" },
                { name: "Exa", keys: "Active", status: "active" },
                { name: "Resend", keys: "Active", status: "active" },
                { name: "Pinecone", keys: "Active", status: "active" },
                { name: "E2B", keys: "Active", status: "active" },
                { name: "ScreenshotOne", keys: "Active", status: "active" },
              ].map(k => (
                <div key={k.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(0_0%_7%)] border border-[hsl(0_0%_14%)]">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", k.status === "active" ? "bg-green-500" : "bg-yellow-500")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white truncate">{k.name}</div>
                    <div className="text-[10px] text-[hsl(0_0%_40%)]">{k.keys}</div>
                  </div>
                  <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-medium shrink-0">{k.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === NETWORK === */}
        {tab === "network" && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Globe size={14} className="text-orange-400" /> Network</h3>
              <div className="space-y-2 sm:space-y-3">
                {[
                  { label: "Service URL", value: "https://aura-omega.onrender.com" },
                  { label: "Health Check", value: "/healthz" },
                  { label: "DB Health", value: "/health/db" },
                  { label: "SSL/TLS", value: "Auto (Let\'s Encrypt)" },
                  { label: "CORS", value: "Configured" },
                ].map(n => (
                  <div key={n.label} className="flex items-center justify-between py-1">
                    <span className="text-xs sm:text-sm text-[hsl(0_0%_60%)]">{n.label}</span>
                    <span className="text-xs sm:text-sm text-white font-mono text-right ml-2">{n.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
