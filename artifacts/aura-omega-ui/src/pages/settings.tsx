import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Gauge, Lock, Moon, Save, ShieldCheck, SlidersHorizontal, Sparkles, UploadCloud, Download, Copy, Terminal, Check } from "lucide-react";

type Tab = "runtime" | "personality" | "bootstrap";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("runtime");

  // ── Runtime settings ──
  const [model, setModel] = useState("kimi-k2.6");
  const [mode, setMode] = useState("governed-autonomous");
  const [temperature, setTemperature] = useState(0.4);
  const [maxRisk, setMaxRisk] = useState("medium");
  const [uploads, setUploads] = useState("all-safe-files");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── Personality ──
  const [personality, setPersonality] = useState("");
  const [personalitySaved, setPersonalitySaved] = useState(false);
  const [personalityError, setPersonalityError] = useState("");
  const [personalityLoading, setPersonalityLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/settings/runtime")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const s = data?.settings;
        if (!s) return;
        setModel(s.primaryPlanner ?? "kimi-k2.6");
        setMode(s.runtimeMode ?? "governed-autonomous");
        setTemperature(Number(s.temperature ?? 0.4));
        setMaxRisk(s.maxAutomaticRisk ?? "medium");
        setUploads(s.uploadMode ?? "all-safe-files");
      })
      .catch(() => undefined);

    fetch("/api/settings/personality")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.systemPersonality != null) setPersonality(data.systemPersonality); })
      .catch(() => undefined);
  }, []);

  async function saveRuntime() {
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

  async function savePersonality() {
    setPersonalityError("");
    setPersonalitySaved(false);
    setPersonalityLoading(true);
    try {
      const res = await fetch("/api/settings/personality", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPersonality: personality }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setPersonalitySaved(true);
      setTimeout(() => setPersonalitySaved(false), 2500);
    } catch (err) {
      setPersonalityError(String(err));
    } finally {
      setPersonalityLoading(false);
    }
  }

  const charCount = personality.length;
  const charMax = 32000;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <div className="text-xs font-black uppercase tracking-widest text-primary">Operator settings</div>
          <h1 className="text-3xl font-black">AURA-OMEGA behavior, models, safety, UX</h1>
          <p className="text-muted-foreground">Gemini-style settings for a governed autonomous runtime.</p>
        </header>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-xl border border-card-border bg-card/50 p-1 w-fit overflow-x-auto">
          {([
            { id: "runtime", label: "Runtime", icon: <SlidersHorizontal className="w-4 h-4" /> },
            { id: "personality", label: "Personality", icon: <Sparkles className="w-4 h-4" /> },
            { id: "bootstrap", label: "Bootstrap Installer", icon: <Terminal className="w-4 h-4" /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                tab === id
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Runtime tab ── */}
        {tab === "runtime" && (
          <>
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-card-border bg-card/50 p-5">
                <h2 className="text-xl font-black flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-primary" /> Brain model</h2>
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-muted-foreground">Primary planner</span>
                    <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-xl border border-card-border bg-background px-3 py-2">
                      <option value="kimi-k2.6">Kimi K2.6 through policy gate</option>
                      <option value="openrouter-auto">OpenRouter auto-router</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                      <option value="openai-o-series">OpenAI o-series</option>
                      <option value="nvidia-nim">NVIDIA NIM pool</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-muted-foreground">Runtime mode</span>
                    <select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-1 w-full rounded-xl border border-card-border bg-background px-3 py-2">
                      <option value="chat-only">Chat only</option>
                      <option value="governed-autonomous">Governed autonomous</option>
                      <option value="full-auto-dry-run">Full auto dry-run</option>
                      <option value="full-auto-approved-tools">Full auto approved tools only</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-muted-foreground">Temperature: {temperature}</span>
                    <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="mt-2 w-full" />
                  </label>
                </div>
              </div>
              <div className="rounded-2xl border border-card-border bg-card/50 p-5">
                <h2 className="text-xl font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> Policy gates</h2>
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-muted-foreground">Max automatic risk</span>
                    <select value={maxRisk} onChange={(e) => setMaxRisk(e.target.value)} className="mt-1 w-full rounded-xl border border-card-border bg-background px-3 py-2">
                      <option value="low">Low only</option>
                      <option value="medium">Medium and below</option>
                      <option value="high-human-review">High requires human review</option>
                      <option value="never-destructive">Never destructive</option>
                    </select>
                  </label>
                  {["Require verification before DONE", "Never show secrets to model", "Ask for missing required fields", "Pause for captcha/login", "Branch before GitHub push", "No production destructive action without approval"].map((x) => (
                    <label key={x} className="flex items-center gap-3 rounded-xl border border-card-border bg-background/50 p-3">
                      <input type="checkbox" defaultChecked />
                      <span className="text-sm">{x}</span>
                    </label>
                  ))}
                </div>
              </div>
            </section>
            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-card-border bg-card/50 p-5">
                <h2 className="font-black flex items-center gap-2"><UploadCloud className="w-5 h-5 text-primary" /> Uploads</h2>
                <p className="mt-2 text-sm text-muted-foreground">Chat supports images, PDFs, code, logs, text, JSON, CSV, docs, and generic binary up to the backend cap.</p>
                <select value={uploads} onChange={(e) => setUploads(e.target.value)} className="mt-4 w-full rounded-xl border border-card-border bg-background px-3 py-2">
                  <option value="all-safe-files">All safe files</option>
                  <option value="images-and-text">Images and text/code only</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="rounded-2xl border border-card-border bg-card/50 p-5">
                <h2 className="font-black flex items-center gap-2"><Moon className="w-5 h-5 text-primary" /> Appearance</h2>
                <div className="mt-4 space-y-3">
                  <button className="w-full rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-bold text-primary">Dark mission control</button>
                  <button className="w-full rounded-xl border border-card-border px-3 py-2 text-sm font-bold text-muted-foreground">Compact operator view</button>
                </div>
              </div>
              <div className="rounded-2xl border border-card-border bg-card/50 p-5">
                <h2 className="font-black flex items-center gap-2"><Gauge className="w-5 h-5 text-primary" /> Autonomy</h2>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <div>Heartbeat: dry-run/self-check</div>
                  <div>n8n external calls: gated</div>
                  <div>Tool chaining: enabled</div>
                  <div>Outcome learning: enabled</div>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-card-border bg-card/50 p-5">
              <h2 className="text-xl font-black flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-primary" /> Save settings</h2>
              <p className="mt-1 text-sm text-muted-foreground">These controls persist to backend runtime policy storage. MVP Governor remains mandatory and cannot be disabled.</p>
              <button onClick={saveRuntime} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                <Save className="w-4 h-4" />Save operator preferences
              </button>
              {saved && <span className="ml-3 text-sm text-emerald-300">Saved to backend runtime settings.</span>}
              {saveError && <span className="ml-3 text-sm text-red-300">Save failed: {saveError}</span>}
            </section>
            <section className="rounded-2xl border border-card-border bg-card/50 p-5">
              <h2 className="font-black flex items-center gap-2"><Lock className="w-5 h-5 text-primary" /> Secret reference rule</h2>
              <code className="mt-3 block rounded-xl bg-black/30 p-4 text-sm text-muted-foreground">{`Use {{secret:NAME}} in commands. Raw values are injected only at execution time, never into the LLM prompt.`}</code>
            </section>
          </>
        )}

        {/* ── Personality tab ── */}
        {tab === "personality" && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-card-border bg-card/50 p-5">
              <h2 className="text-xl font-black flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> System personality
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This text is prepended to every agent's system prompt — ABBY, all AURAs, chat and orchestration alike.
                Use it to define AURA-OMEGA's core identity, tone, operating philosophy, or domain context.
                Leave blank to use the built-in defaults.
              </p>
              <div className="mt-4 relative">
                <textarea
                  ref={textareaRef}
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder={`Paste or type the system personality here.\n\nExample:\nYou are AURA-OMEGA, a sovereign AI operating system for ABBYCRM. Your mission is to drive growth, automate intelligently, and act as a trusted digital partner to the operator. You are direct, efficient, and results-oriented — you never hedge when you can act, and never act when verification is needed first.`}
                  spellCheck={false}
                  className="w-full min-h-[480px] rounded-xl border border-card-border bg-background/70 p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <div className={`absolute bottom-3 right-3 text-xs font-mono ${charCount > charMax * 0.9 ? "text-amber-400" : "text-muted-foreground/50"}`}>
                  {charCount.toLocaleString()} / {charMax.toLocaleString()}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={savePersonality}
                  disabled={personalityLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {personalityLoading ? "Saving…" : "Save personality"}
                </button>
                {personality && (
                  <button
                    onClick={() => setPersonality("")}
                    className="rounded-xl border border-card-border px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
                {personalitySaved && <span className="text-sm text-emerald-300">Personality saved — active on next agent call.</span>}
                {personalityError && <span className="text-sm text-red-300">Save failed: {personalityError}</span>}
              </div>
            </div>

            <div className="rounded-2xl border border-card-border bg-card/50 p-5">
              <h2 className="font-black text-sm uppercase tracking-widest text-muted-foreground mb-3">How it works</h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Personality is injected at the <span className="text-foreground font-medium">top</span> of every system prompt — before role, tools, and safety rules.</li>
                <li>• It applies to <span className="text-foreground font-medium">all agents</span>: ABBY orchestration, AURA execution, live chat, and synthesis.</li>
                <li>• Changes take effect <span className="text-foreground font-medium">immediately</span> — no restart required.</li>
                <li>• The built-in safety rules (SWARM_SAFETY_RULES) always remain and <span className="text-foreground font-medium">cannot be overridden</span> by the personality.</li>
                <li>• Max 32,000 characters (~24k tokens). Keep it focused for best results.</li>
              </ul>
            </div>
          </section>
        )}

        {/* ── Bootstrap Installer tab ── */}
        {tab === "bootstrap" && <BootstrapInstallerTab />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Bootstrap Installer tab — BOS-OMEGA
// ─────────────────────────────────────────────────────────────────────────
function BootstrapInstallerTab() {
  const [copied, setCopied] = useState(false);
  const bootstrapCmd = "irm https://bos-omega.dev/install.ps1 | iex";
  const ps1Url = "/api/devices/bootstrap/bos-omega-bootstrap.ps1";

  function copy() {
    navigator.clipboard.writeText(bootstrapCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const executionSteps = [
    "PowerShell",
    "Download Bootstrap",
    "Detect Environment",
    "Install Dependencies",
    "Clone BOS-OMEGA",
    "Configure Runtime",
    "Install Tailscale",
    "Install RustDesk",
    "Install MeshCentral Agent",
    "Install Sunshine",
    "Install BOS PC Agent",
    "Install Services",
    "Install Runtime",
    "Start Runtime",
    "Verify Components",
    "Launch BOS",
    "Display Dashboard",
  ];

  const runtimeSteps = [
    { label: "BOS Runtime", status: "ready" },
    { label: "Scheduler", status: "ready" },
    { label: "Memory", status: "ready" },
    { label: "Agents", status: "ready" },
    { label: "API", status: "ready" },
    { label: "Remote Control", status: "ready" },
    { label: "Tools", status: "ready" },
    { label: "Executive Brain (Future)", status: "future" },
  ];

  const deviceRegistrations = [
    { name: "Windows PC", status: "available" },
    { name: "Phone", status: "available" },
    { name: "Tablet", status: "available" },
    { name: "Future Glasses", status: "future" },
  ];

  const installSteps = [
    "Bootstrap", "Git", "Node", "pnpm", "Python", "Docker (Optional)",
    "BOS Runtime", "Dependencies", "Configuration", "Device Registration",
    "Engine Registration", "Ready",
  ];

  return (
    <section className="space-y-6">
      {/* Command box */}
      <div className="rounded-2xl border border-cyan-500/30 bg-card/50 p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-black uppercase tracking-widest text-cyan-400">BOS-OMEGA</span>
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Bootstrap</span>
        </div>
        <h2 className="text-2xl font-black">Install BOS-OMEGA on a Windows PC</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Copy the command below and paste it into <span className="text-foreground font-medium">Windows PowerShell (Run as Administrator)</span>.
          The bootstrap will detect your environment, install every adapter, register the device, and launch the dashboard.
        </p>
        <div className="mt-5 relative">
          <pre className="rounded-xl border border-card-border bg-black/50 p-4 pr-24 font-mono text-sm text-cyan-300 overflow-x-auto whitespace-pre">
{bootstrapCmd}
          </pre>
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-cyan-400 transition-colors"
              aria-label="Copy command"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={ps1Url}
              download
              className="inline-flex items-center gap-1 rounded-md border border-card-border bg-background/70 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-card transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          </div>
        </div>
      </div>

      {/* Bootstrap Execution */}
      <div className="rounded-2xl border border-card-border bg-card/50 p-6">
        <h2 className="text-lg font-black">Bootstrap Execution</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each step is idempotent. If anything fails the bootstrap resumes from the failing step on re-run.</p>
        <ol className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
          {executionSteps.map((step, i) => (
            <li key={step} className="flex items-center gap-2 rounded-lg border border-card-border bg-background/40 px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-400">
                {i + 1}
              </span>
              <span className="text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Runtime Installation */}
      <div className="rounded-2xl border border-card-border bg-card/50 p-6">
        <h2 className="text-lg font-black">Runtime Installation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Components installed by the bootstrap.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {installSteps.map((step) => (
            <span key={step} className="rounded-full border border-card-border bg-background/40 px-3 py-1 text-xs font-bold text-foreground">
              {step}
            </span>
          ))}
        </div>
      </div>

      {/* Device Registration */}
      <div className="rounded-2xl border border-card-border bg-card/50 p-6">
        <h2 className="text-lg font-black">Device Registration</h2>
        <p className="mt-1 text-sm text-muted-foreground">The bootstrap auto-registers the Windows PC. Register other devices from the Remote Control page.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {deviceRegistrations.map((d) => (
            <div
              key={d.name}
              className={`flex items-center justify-between rounded-xl border border-card-border bg-background/40 px-4 py-3 ${
                d.status === "future" ? "opacity-60" : ""
              }`}
            >
              <div>
                <div className="font-bold text-sm">{d.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{d.status === "future" ? "Planned" : "Ready to register"}</div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded font-bold ${
                  d.status === "future" ? "bg-white/5 text-white/40" : "bg-cyan-500/20 text-cyan-400"
                }`}
              >
                {d.status === "future" ? "Future" : "Available"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Runtime components */}
      <div className="rounded-2xl border border-card-border bg-card/50 p-6">
        <h2 className="text-lg font-black">Runtime</h2>
        <p className="mt-1 text-sm text-muted-foreground">The components that come online after bootstrap completes.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {runtimeSteps.map((c) => (
            <div
              key={c.label}
              className={`flex items-center justify-between rounded-lg border border-card-border bg-background/40 px-3 py-2 ${
                c.status === "future" ? "opacity-60" : ""
              }`}
            >
              <span className="text-sm font-bold">{c.label}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  c.status === "future" ? "bg-white/5 text-white/40" : "bg-emerald-500/20 text-emerald-400"
                }`}
              >
                {c.status === "future" ? "Future" : "Ready"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* User Experience flow */}
      <div className="rounded-2xl border border-card-border bg-card/50 p-6">
        <h2 className="text-lg font-black">User Experience</h2>
        <p className="mt-1 text-sm text-muted-foreground">From PowerShell to "BOS is running" in under five minutes.</p>
        <ol className="mt-4 grid gap-2 text-sm">
          {[
            "User opens BOS",
            "Goes to Settings → Bootstrap Installer",
            "Copies the command",
            "Pastes it into PowerShell (Admin)",
            "Presses Enter",
            "Everything installs",
            "BOS starts automatically",
            "Phone connects",
            "PC connects",
            "Ready",
          ].map((step, i) => (
            <li key={step} className="flex items-center gap-2 rounded-lg border border-card-border bg-background/40 px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-400">
                {i + 1}
              </span>
              <span className="text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
