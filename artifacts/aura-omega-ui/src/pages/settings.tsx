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

  /* API Keys (vault) */
  const [keyName, setKeyName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [keyDesc, setKeyDesc] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyMsg, setKeyMsg] = useState("");
  const [vaultKeys, setVaultKeys] = useState<Array<{ name: string; description?: string }>>([]);

  /* Composio */
  const [composioToolkit, setComposioToolkit] = useState("gmail");
  const [composioConnecting, setComposioConnecting] = useState(false);
  const [composioMsg, setComposioMsg] = useState("");

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

    loadVault();
  }, []);

  function loadVault() {
    fetch("/api/vault")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d?.secrets)) setVaultKeys(d.secrets); })
      .catch(() => undefined);
  }

  async function saveKey() {
    if (!keyName.trim() || !keyValue.trim()) { setKeyMsg("Name and value are required."); return; }
    setKeySaving(true); setKeyMsg("");
    try {
      const res = await fetch("/api/vault", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim(), value: keyValue, description: keyDesc.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `${res.status}`);
      setKeyMsg(`Saved ${keyName.trim()} — active now.`);
      setKeyName(""); setKeyValue(""); setKeyDesc("");
      loadVault();
    } catch (e) { setKeyMsg(`Failed: ${String(e).replace("Error: ", "")}`); }
    finally { setKeySaving(false); }
  }

  async function connectComposio() {
    if (!composioToolkit.trim()) return;
    setComposioConnecting(true); setComposioMsg("");
    try {
      const res = await fetch("/api/integrations/composio/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: composioToolkit.trim().toLowerCase() }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.hint || out?.error || `${res.status}`);
      if (out?.redirectUrl) {
        setComposioMsg(`Opening ${composioToolkit} authorization…`);
        window.open(out.redirectUrl, "_blank", "noopener");
      } else {
        setComposioMsg(`Connection created for ${composioToolkit} (id=${out?.connectionId ?? "?"}). Check the Composio dashboard if no redirect appeared.`);
      }
    } catch (e) { setComposioMsg(`Failed: ${String(e).replace("Error: ", "")}`); }
    finally { setComposioConnecting(false); }
  }

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
              <span className={tab === t.id ? "text-orange-400" : "text-[hsl(0_0%_40%)]"}>{t.icon}</span>
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
                <p className="text-xs text-blue-400 font-medium">Write-only vault</p>
                <p className="text-[10px] sm:text-[11px] text-[hsl(0_0%_55%)]">Keys are encrypted server-side and never shown back or exposed to the model. Reference them in commands as <code className="text-orange-400">{`{{secret:NAME}}`}</code>. The name becomes a live env var, so integrations turn on immediately.</p>
              </div>
            </div>

            {/* Add key form */}
            <div className="bg-card rounded-xl border border-border p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Key size={14} className="text-orange-400" /> Add an API key</h3>
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Name</span>
                    <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="e.g. OPENAI_API_KEY" spellCheck={false}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-white font-mono placeholder:text-[hsl(0_0%_40%)] focus:outline-none focus:border-orange-500/50" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Description (optional)</span>
                    <input value={keyDesc} onChange={e => setKeyDesc(e.target.value)} placeholder="What it's for"
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-white placeholder:text-[hsl(0_0%_40%)] focus:outline-none focus:border-orange-500/50" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Value</span>
                  <input value={keyValue} onChange={e => setKeyValue(e.target.value)} type="password" placeholder="Paste the secret — write-only" autoComplete="off" spellCheck={false}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-white font-mono placeholder:text-[hsl(0_0%_40%)] focus:outline-none focus:border-orange-500/50" />
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={saveKey} disabled={keySaving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                    <Save size={14} /> {keySaving ? "Saving…" : "Save key"}
                  </button>
                  {keyMsg && <span className={cn("text-xs", keyMsg.startsWith("Failed") ? "text-red-400" : "text-green-400")}>{keyMsg}</span>}
                </div>
              </div>
            </div>

            {/* Connect an app via Composio */}
            <div className="bg-card rounded-xl border border-border p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1"><Sparkles size={14} className="text-orange-400" /> Connect an app (Composio)</h3>
              <p className="text-[11px] text-muted-foreground mb-3">OAuth into Gmail, Slack, GitHub, Notion, Google Calendar/Sheets and 250+ apps so the swarm can act on your accounts. Pick an app and authorize.</p>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <select value={composioToolkit} onChange={e => setComposioToolkit(e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50">
                  {["gmail","googlecalendar","googlesheets","googledrive","slack","github","notion","linkedin","x","instagram","discord","hubspot","airtable","trello","asana"].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <button onClick={connectComposio} disabled={composioConnecting} className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap">
                  {composioConnecting ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} {composioConnecting ? "Connecting…" : "Connect"}
                </button>
              </div>
              {composioMsg && <p className={cn("text-xs mt-2", composioMsg.startsWith("Failed") ? "text-red-400" : "text-green-400")}>{composioMsg}</p>}
              <a href="/integrations" className="inline-block text-[11px] text-orange-400 hover:text-orange-300 mt-2">Full integrations console →</a>
            </div>

            {/* Stored keys */}
            <div className="bg-card rounded-xl border border-border p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Lock size={14} className="text-green-400" /> Stored keys <span className="text-[10px] text-muted-foreground font-normal">({vaultKeys.length})</span></h3>
              {vaultKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground">No keys stored yet — add one above.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vaultKeys.map(k => (
                    <div key={k.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background border border-border">
                      <div className="w-2 h-2 rounded-full shrink-0 bg-green-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-medium text-white truncate">{k.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{k.description || "•••••••• encrypted"}</div>
                      </div>
                      <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-medium shrink-0">active</span>
                    </div>
                  ))}
                </div>
              )}
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
