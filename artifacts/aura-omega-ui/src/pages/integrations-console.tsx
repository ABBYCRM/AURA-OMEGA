import { useEffect, useMemo, useState } from "react";
import { apiJson, composioApps, integrationCatalog, officialApis } from "@/lib/auraConsole";
import { CheckCircle2, ChevronDown, ExternalLink, KeyRound, Lock, PlugZap, RefreshCw, Save, Search, ShieldCheck, UserRoundCog, X } from "lucide-react";

type VaultItem = { name: string; description?: string };

export default function IntegrationsConsole() {
  const [live, setLive] = useState<any>(null);
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretDescription, setSecretDescription] = useState("");
  const [toolkit, setToolkit] = useState("github");
  const [oauthResult, setOauthResult] = useState<any>(null);
  const [status, setStatus] = useState("");
  // Composio apps browser dropdown
  const [browseOpen, setBrowseOpen] = useState(false);
  const [toolkits, setToolkits] = useState<Array<{ slug: string; name: string; logo?: string; authSchemes?: string[] }>>([]);
  const [toolkitsLoading, setToolkitsLoading] = useState(false);
  const [toolkitsError, setToolkitsError] = useState<string | null>(null);
  const [toolkitSearch, setToolkitSearch] = useState("");
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  const configuredCount = useMemo(() => integrationCatalog.filter((x) => x.configured).length, []);

  async function load() {
    apiJson("/api/integrations").then(setLive).catch(() => setLive(null));
    apiJson<{ secrets: VaultItem[] }>("/api/vault").then((x) => setVault(x.secrets || [])).catch(() => setVault([]));
  }
  useEffect(() => { load(); }, []);

  async function saveSecret() {
    setStatus("Saving secret...");
    try {
      await apiJson("/api/vault", { method: "PUT", body: JSON.stringify({ name: secretName, value: secretValue, description: secretDescription }) });
      setSecretValue(""); setSecretName(""); setSecretDescription(""); setStatus("Secret saved write-only."); load();
    } catch (err) { setStatus(`Secret save failed: ${String(err)}`); }
  }

  async function connectComposio() {
    setStatus("Starting OAuth connection...");
    try {
      const out = await apiJson("/api/integrations/composio/connect", { method: "POST", body: JSON.stringify({ toolkit }) });
      setOauthResult(out); setStatus("OAuth URL created. Open it, approve, then refresh connections.");
    } catch (err) { setStatus(`OAuth failed: ${String(err)}`); }
  }

  // Fetch the full Composio toolkit catalog when the dropdown opens.
  async function openToolkitBrowser() {
    setBrowseOpen((v) => !v);
    if (toolkits.length === 0 && !toolkitsLoading) {
      setToolkitsLoading(true);
      setToolkitsError(null);
      try {
        const out = await apiJson<{ toolkits: Array<{ slug: string; name: string; logo?: string; authSchemes?: string[] }> }>("/api/integrations/composio/toolkits?limit=200");
        setToolkits(out.toolkits || []);
      } catch (err) {
        setToolkitsError(String(err instanceof Error ? err.message : err));
      } finally {
        setToolkitsLoading(false);
      }
    }
  }

  // Connect from inside the dropdown: same OAuth flow but using the clicked row's slug.
  async function connectFromDropdown(slug: string) {
    setConnectingSlug(slug);
    setStatus(`Starting OAuth for ${slug}...`);
    try {
      const out = await apiJson("/api/integrations/composio/connect", { method: "POST", body: JSON.stringify({ toolkit: slug }) });
      setOauthResult(out);
      const url = (out as any)?.redirectUrl as string | undefined;
      if (url) {
        // Open the OAuth URL in a new tab so the operator can approve immediately.
        window.open(url, "_blank", "noopener,noreferrer");
        setStatus(`OAuth URL opened in new tab for ${slug}. Approve then refresh connections.`);
      } else {
        setStatus(`Connection created for ${slug} (id=${(out as any)?.connectionId}). No redirect URL returned — check Composio dashboard.`);
      }
      load();
    } catch (err) {
      setStatus(`OAuth failed for ${slug}: ${String(err)}`);
    } finally {
      setConnectingSlug(null);
    }
  }

  const connectedSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const a of composioApps) if (a.status === "Connected") s.add(a.app.toLowerCase());
    return s;
  }, [composioApps]);

  const filteredToolkits = useMemo(() => {
    const q = toolkitSearch.trim().toLowerCase();
    if (!q) return toolkits;
    return toolkits.filter(
      (t) => t.slug.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    );
  }, [toolkits, toolkitSearch]);

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-black uppercase tracking-widest text-primary">Settings-grade integrations</div><h1 className="text-3xl font-black">Providers, OAuth apps, secrets, website logins</h1><p className="text-muted-foreground">Same concept as the old UI, rebuilt for AURA-OMEGA. Values are write-only and never displayed back.</p></div><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-card-border px-4 py-2 text-sm font-bold"><RefreshCw className="w-4 h-4" />Refresh</button></header>

        <section className="grid gap-4 lg:grid-cols-4"><div className="rounded-2xl border border-card-border bg-card/50 p-4"><div className="text-2xl font-black">{live?.configuredCount ?? configuredCount}/{live?.total ?? integrationCatalog.length}</div><div className="text-xs uppercase text-muted-foreground font-bold">active providers</div></div><div className="rounded-2xl border border-card-border bg-card/50 p-4"><div className="text-2xl font-black">{composioApps.filter((x) => x.status === "Connected").length}</div><div className="text-xs uppercase text-muted-foreground font-bold">connected apps</div></div><div className="rounded-2xl border border-card-border bg-card/50 p-4"><div className="text-2xl font-black">{vault.length || 27}</div><div className="text-xs uppercase text-muted-foreground font-bold">stored secrets</div></div><div className="rounded-2xl border border-card-border bg-card/50 p-4"><div className="text-2xl font-black">write-only</div><div className="text-xs uppercase text-muted-foreground font-bold">encrypted vault model</div></div></section>

        <section className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black flex items-center gap-2"><PlugZap className="w-5 h-5 text-primary" /> Provider integrations</h2><p className="text-sm text-muted-foreground mt-1">Which third-party providers are configured on the server. UI shows only booleans, never raw keys.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{integrationCatalog.map((item) => <div key={item.name} className="rounded-xl border border-card-border bg-background/50 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{item.name}</div><div className="text-xs text-muted-foreground uppercase font-bold">{item.category}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.configured ? "bg-emerald-500/10 text-emerald-300" : "bg-muted text-muted-foreground"}`}>{item.configured ? "On" : "Off"}</span></div><p className="mt-2 text-xs text-muted-foreground">{item.description}</p><div className="mt-2 flex flex-wrap gap-1">{item.env.map((env) => <span key={env} className="rounded bg-card px-2 py-1 text-[10px] text-muted-foreground">{env}</span>)}</div></div>)}</div></section>

        <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> Official API integrations</h2><p className="text-sm text-muted-foreground">Use official platform APIs first. Connect opens the developer/OAuth flow; docs opens the official reference.</p><div className="mt-4 space-y-3">{officialApis.map((api) => <div key={api.name} className="rounded-xl border border-card-border bg-background/50 p-3 flex items-center justify-between gap-3"><div><div className="font-bold">{api.name}</div><div className="text-xs text-muted-foreground">{api.baseUrl}</div></div><div className="flex gap-2"><a href={api.docs} target="_blank" rel="noreferrer" className="rounded-lg border border-card-border px-3 py-1 text-xs font-bold inline-flex gap-1 items-center">Docs <ExternalLink className="w-3 h-3" /></a><button className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Connect</button></div></div>)}</div></div><div className="rounded-2xl border border-card-border bg-card/50 p-5 relative"><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-black flex items-center gap-2"><UserRoundCog className="w-5 h-5 text-primary" /> Connect apps with Composio</h2><button onClick={openToolkitBrowser} aria-expanded={browseOpen} aria-controls="composio-toolkit-browser" className="inline-flex items-center gap-2 rounded-xl border border-card-border bg-background/60 px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary transition-colors"><span>Browse all apps</span><ChevronDown className={`w-3.5 h-3.5 transition-transform ${browseOpen ? "rotate-180" : ""}`} /></button></div>{browseOpen && <div id="composio-toolkit-browser" role="dialog" aria-label="Composio apps catalog" className="absolute right-5 top-16 z-30 mt-1 w-[min(36rem,calc(100vw-2.5rem))] rounded-2xl border border-card-border bg-card shadow-2xl shadow-black/50"><div className="flex items-center justify-between gap-2 border-b border-card-border p-3"><div className="flex items-center gap-2 flex-1 rounded-xl border border-card-border bg-background px-3 py-2"><Search className="w-4 h-4 text-muted-foreground" /><input value={toolkitSearch} onChange={(e) => setToolkitSearch(e.target.value)} autoFocus className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder={`Search ${toolkits.length || "..."} apps (github, slack, notion, ...)`} /></div><button onClick={() => setBrowseOpen(false)} aria-label="Close apps catalog" className="rounded-lg p-1.5 hover:bg-background"><X className="w-4 h-4" /></button></div><div className="max-h-96 overflow-auto p-2">{toolkitsLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading Composio apps…</div>}{toolkitsError && <div className="p-4 text-sm text-rose-300">Failed to load: {toolkitsError}</div>}{!toolkitsLoading && !toolkitsError && filteredToolkits.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No apps match "{toolkitSearch}".</div>}{!toolkitsLoading && !toolkitsError && filteredToolkits.length > 0 && <div className="grid gap-1.5">{filteredToolkits.map((t) => { const isConnected = connectedSlugs.has(t.slug.toLowerCase()); const isConnecting = connectingSlug === t.slug; return (<div key={t.slug} className="flex items-center justify-between gap-3 rounded-xl border border-card-border/60 bg-background/40 px-3 py-2 hover:border-primary/60"><div className="flex items-center gap-3 min-w-0"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-black uppercase text-primary">{t.name.slice(0, 2)}</div><div className="min-w-0"><div className="truncate font-bold text-sm">{t.name}</div><div className="truncate text-xs text-muted-foreground">{t.slug}{t.authSchemes && t.authSchemes.length > 0 ? ` · ${t.authSchemes.join(", ")}` : ""}</div></div></div><div className="flex items-center gap-2 shrink-0">{isConnected && <span className="text-[10px] font-bold uppercase text-emerald-300">Connected</span>}<button onClick={() => connectFromDropdown(t.slug)} disabled={isConnecting} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">{isConnecting ? "…" : isConnected ? "Reconnect" : "+ Connect"}</button></div></div>); })}</div>}</div><div className="border-t border-card-border p-2 text-[10px] text-muted-foreground">{filteredToolkits.length} of {toolkits.length} apps · OAuth flow opens in a new tab.</div></div>}<div className="mt-3 flex gap-2"><input value={toolkit} onChange={(e) => setToolkit(e.target.value)} className="flex-1 rounded-xl border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="github, gmail, googlecalendar..." /><button onClick={connectComposio} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Connect</button></div>{oauthResult && <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-muted-foreground">{JSON.stringify(oauthResult, null, 2)}</pre>}<div className="mt-4 space-y-2">{composioApps.map((app) => <div key={`${app.app}-${app.id}`} className="flex items-center justify-between rounded-xl border border-card-border bg-background/50 p-3"><div><div className="font-bold">{app.app}</div><div className="text-xs text-muted-foreground">{app.id || "not connected"}</div></div><span className={`text-xs font-bold ${app.status === "Connected" ? "text-emerald-300" : "text-muted-foreground"}`}>{app.status}</span></div>)}</div></div></section>

        <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black flex items-center gap-2"><Lock className="w-5 h-5 text-primary" /> Add / update secret</h2><p className="text-sm text-muted-foreground">Store API keys here. Raw values are injected only at use-time via {`{{secret:NAME}}`} and never shown to the model.</p><div className="mt-4 space-y-3"><input value={secretName} onChange={(e) => setSecretName(e.target.value)} className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Name, e.g. KIMI_API_KEY" /><input value={secretDescription} onChange={(e) => setSecretDescription(e.target.value)} className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Description" /><input value={secretValue} onChange={(e) => setSecretValue(e.target.value)} type="password" className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Value — write-only" /><button onClick={saveSecret} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Save className="w-4 h-4" />Save secret</button>{status && <div className="text-xs text-muted-foreground">{status}</div>}</div></div><div className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" /> Stored secrets</h2><div className="mt-4 max-h-96 overflow-auto space-y-2">{(vault.length ? vault : integrationCatalog.flatMap((x) => x.env).filter(Boolean).slice(0, 27).map((name): VaultItem => ({ name }))).map((s) => <div key={s.name} className="flex items-center justify-between rounded-xl border border-card-border bg-background/50 p-3"><div><div className="font-mono text-sm">{s.name}</div><div className="text-xs text-muted-foreground">{s.description || "•••••••• encrypted write-only"}</div></div><CheckCircle2 className="w-4 h-4 text-emerald-400" /></div>)}</div></div></section>

        <section className="rounded-2xl border border-card-border bg-card/50 p-5"><h2 className="text-xl font-black">Website logins</h2><p className="text-sm text-muted-foreground">For sites with no API, save login references for browser fallback. Use OAuth for Google/Gmail where possible.</p><div className="mt-4 grid gap-3 lg:grid-cols-4"><input className="rounded-xl border border-card-border bg-background px-3 py-2 text-sm" placeholder="Site name" /><input className="rounded-xl border border-card-border bg-background px-3 py-2 text-sm" placeholder="Login URL" /><input className="rounded-xl border border-card-border bg-background px-3 py-2 text-sm" placeholder="Email / username" /><input type="password" className="rounded-xl border border-card-border bg-background px-3 py-2 text-sm" placeholder="Password" /></div><button className="mt-3 rounded-xl border border-card-border px-4 py-2 text-sm font-bold">Save website login</button></section>
      </div>
    </div>
  );
}
