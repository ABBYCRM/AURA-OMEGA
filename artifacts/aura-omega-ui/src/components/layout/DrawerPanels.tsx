/**
 * Claw-style drawer tab panels: Integrations, Files, Pictures, My Code.
 * Chats stays in AppLayout (it reuses ChatThreadList).
 *
 * All panels are wired to real APIs:
 *   Integrations → GET /api/integrations (env-driven READY/OFF status)
 *   Files/Pictures → GET/DELETE /api/uploads (+ POST for "Upload picture")
 *   My Code → GET /api/scratchpad (pinned operator context ABBY always reads)
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { resolveApiUrl } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronDown, ChevronUp, FileText, ImageIcon, Loader2, Trash2, Upload,
  KeyRound, ExternalLink, Code2,
} from "lucide-react";

// ── Integrations ────────────────────────────────────────────────────────────

interface Integration {
  key: string;
  name: string;
  category: string;
  envVar: string;
  configured: boolean;
}

export function IntegrationsPanel({ onNavigate }: { onNavigate?: () => void }) {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    let alive = true;
    fetch(resolveApiUrl("/api/integrations"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (alive) setItems(Array.isArray(d.integrations) ? d.integrations : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  const goToVault = () => {
    navigate("/settings");
    onNavigate?.();
  };

  if (items === null) {
    return <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading integrations…</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
      {items.map((it) => {
        const open = expanded === it.key;
        return (
          <div key={it.key} className="rounded-2xl bg-card border border-card-border px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{it.name}</div>
                <div className="text-[11px] text-muted-foreground truncate capitalize">{it.category}</div>
              </div>
              {/* Status is env-key-driven: the toggle reflects it; tapping an OFF
                  service jumps to Settings → Stored Secrets to add the key. */}
              <button
                onClick={() => { if (!it.configured) goToVault(); }}
                aria-label={it.configured ? `${it.name} is ready` : `Configure ${it.name}`}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors shrink-0",
                  it.configured ? "bg-emerald-500" : "bg-muted border border-border",
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                  it.configured ? "left-[22px]" : "left-0.5",
                )} />
              </button>
              <span className={cn(
                "text-[10px] font-bold tracking-wide rounded-lg px-2 py-1 shrink-0",
                it.configured
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}>
                {it.configured ? "READY" : "OFF"}
              </span>
              <button
                onClick={() => setExpanded(open ? null : it.key)}
                aria-label="Details"
                className="p-1 text-muted-foreground hover:text-foreground shrink-0"
              >
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {open && (
              <div className="mt-2 pt-2 border-t border-border text-[12px] text-muted-foreground space-y-1.5">
                <div>Env key: <code className="font-mono text-foreground/80">{it.envVar}</code></div>
                <button onClick={goToVault} className="flex items-center gap-1.5 text-primary font-semibold">
                  <ExternalLink className="w-3.5 h-3.5" />
                  {it.configured ? "Manage in Settings" : "Add key in Settings → Stored Secrets"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Files / Pictures ────────────────────────────────────────────────────────

interface UploadItem {
  id: number;
  name: string;
  mime: string;
  kind: string;
  size: number;
  url: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FilesPanel({ picturesOnly }: { picturesOnly: boolean }) {
  const [items, setItems] = useState<UploadItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch(resolveApiUrl(`/api/uploads${picturesOnly ? "?kind=image" : ""}`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setItems(Array.isArray(d.uploads) ? d.uploads : []))
      .catch(() => setItems([]));
  };
  useEffect(load, [picturesOnly]);

  const uploadPicture = async (f: File) => {
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsDataURL(f);
      });
      const resp = await fetch(resolveApiUrl("/api/uploads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, mime: f.type || "application/octet-stream", dataBase64: dataUrl }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      load();
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id: number) => {
    try {
      const r = await fetch(resolveApiUrl(`/api/uploads/${id}`), { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems((prev) => (prev ? prev.filter((u) => u.id !== id) : prev));
    } catch {
      toast.error("Couldn't delete file");
    }
  };

  const clearAll = async () => {
    if (!items?.length) return;
    if (!confirm(`Delete all ${items.length} ${picturesOnly ? "pictures" : "files"}?`)) return;
    setBusy(true);
    try {
      await Promise.all(items.map((u) => fetch(resolveApiUrl(`/api/uploads/${u.id}`), { method: "DELETE" })));
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className={cn(
          "flex-1 flex items-center justify-center gap-2 rounded-2xl bg-card border border-card-border",
          "px-3 min-h-[48px] text-sm font-bold cursor-pointer hover:border-primary/40 transition-colors",
          busy && "opacity-50 pointer-events-none",
        )}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {picturesOnly ? "Upload picture" : "Upload file"}
          <input
            type="file"
            accept={picturesOnly ? "image/*" : undefined}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadPicture(f); }}
          />
        </label>
        <button
          onClick={clearAll}
          disabled={!items?.length || busy}
          className="rounded-2xl bg-card border border-card-border px-4 min-h-[48px] text-sm font-semibold text-muted-foreground disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {items === null ? (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-muted-foreground leading-relaxed">
          {picturesOnly
            ? "No pictures yet. Upload one, or generate an image in Image mode — generated images are kept here automatically."
            : "No files yet. Attach files in chat or upload one here — everything the swarm receives is kept here."}
        </div>
      ) : picturesOnly ? (
        <div className="grid grid-cols-3 gap-2">
          {items.map((u) => (
            <div key={u.id} className="relative group rounded-xl overflow-hidden border border-card-border bg-card aspect-square">
              <a href={resolveApiUrl(u.url)} target="_blank" rel="noreferrer">
                <img src={resolveApiUrl(u.url)} alt={u.name} className="w-full h-full object-cover" loading="lazy" />
              </a>
              <button
                onClick={() => removeOne(u.id)}
                aria-label={`Delete ${u.name}`}
                className="absolute top-1 right-1 p-1 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((u) => (
            <div key={u.id} className="flex items-center gap-2.5 rounded-2xl bg-card border border-card-border px-3 py-2.5">
              {u.kind === "image"
                ? <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
              <a href={resolveApiUrl(`${u.url}?download=1`)} className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{u.name}</div>
                <div className="text-[11px] text-muted-foreground">{fmtSize(u.size)} · {u.mime}</div>
              </a>
              <button onClick={() => removeOne(u.id)} aria-label={`Delete ${u.name}`} className="p-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── My Code (operator scratchpad — pinned context ABBY always reads) ───────

export function MyCodePanel({ onNavigate }: { onNavigate?: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    let alive = true;
    fetch(resolveApiUrl("/api/scratchpad"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (alive) setContent(typeof d.content === "string" ? d.content : ""); })
      .catch(() => { if (alive) setContent(""); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
      <button
        onClick={() => { navigate("/scratchpad"); onNavigate?.(); }}
        className="flex items-center justify-center gap-2 rounded-2xl bg-card border border-card-border px-3 min-h-[48px] text-sm font-bold hover:border-primary/40 transition-colors"
      >
        <Code2 className="w-4 h-4" /> Open editor
      </button>
      {content === null ? (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : content.trim() === "" ? (
        <div className="px-6 py-8 text-center text-sm text-muted-foreground leading-relaxed">
          Nothing pinned yet. Anything you keep here — code, briefs, standing context — is read by ABBY on every mission.
        </div>
      ) : (
        <pre className="rounded-2xl bg-card border border-card-border px-3 py-3 text-[12px] font-mono whitespace-pre-wrap break-words text-foreground/85 leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}
