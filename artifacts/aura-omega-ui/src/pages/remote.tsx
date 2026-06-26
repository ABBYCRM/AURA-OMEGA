/**
 * Remote Control page — BOS-OMEGA mobile UI.
 *
 * Four tabs:
 *   - Devices   list of registered PCs, status, quick actions
 *   - Screen    screenshot viewer + connect button per device
 *   - Commands  history of dispatched commands + free-text input
 *   - Installers PowerShell install scripts + copy-to-clipboard
 *
 * Mobile-first: 88% width drawers, 44px touch targets, drawer-capped.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { resolveApiUrl } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  Monitor,
  Smartphone,
  Plus,
  RefreshCw,
  ExternalLink,
  Power,
  Terminal,
  Eye,
  Copy,
  ChevronRight,
  CircleDot,
  CircleSlash,
  Settings as SettingsIcon,
  Rocket,
} from "lucide-react";

interface Device {
  id: number;
  name: string;
  host: string;
  adapter: "tailscale" | "rustdesk" | "meshcentral" | "guacamole" | "novnc" | "sunshine" | "scrcpy";
  status: "unknown" | "online" | "offline" | "installing";
  tailscaleIp?: string | null;
  rustdeskId?: string | null;
  lastSeen?: string | null;
}

interface Command {
  id: number;
  deviceId: number;
  adapter: string;
  command: string;
  output: string | null;
  status: string;
  durationMs: number | null;
  createdAt: string;
}

interface Adapter {
  name: string;
  stage: number;
}

type Tab = "devices" | "screen" | "commands" | "installers";

export default function RemotePage() {
  const [tab, setTab] = useState<Tab>("devices");
  const [registerOpen, setRegisterOpen] = useState(false);
  const qc = useQueryClient();

  const status = useQuery({
    queryKey: ["remote-control-status"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/devices/status"));
      return (await r.json()) as { adapters: Adapter[] };
    },
    refetchInterval: 30_000,
  });

  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/devices"));
      return (await r.json()) as { devices: Device[] };
    },
    refetchInterval: 15_000,
  });

  const stats = useQuery({
    queryKey: ["devices-stats"],
    queryFn: async () => {
      const r = await fetch(resolveApiUrl("/api/devices/stats"));
      return (await r.json()) as { devices: number; online: number };
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0e14] text-white">
      {/* Top bar */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold">BOS-OMEGA</h1>
          <span className="text-xs text-white/40">Remote Control</span>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["devices"] })}
          className="p-2 rounded-md hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px]"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("w-5 h-5", devices.isFetching && "animate-spin")} />
        </button>
      </div>

      {/* Stats strip */}
      <div className="px-4 py-2 border-b border-white/10 flex gap-4 text-xs text-white/60 overflow-x-auto">
        <div>
          <span className="text-white/40">Devices</span>{" "}
          <span className="text-white">{stats.data?.devices ?? "—"}</span>
        </div>
        <div>
          <span className="text-white/40">Online</span>{" "}
          <span className="text-green-400">{stats.data?.online ?? "—"}</span>
        </div>
        <div>
          <span className="text-white/40">Adapters</span>{" "}
          <span className="text-white">{status.data?.adapters.length ?? "—"}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-2 border-b border-white/10 flex gap-1">
        {(["devices", "screen", "commands", "installers"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors min-h-[44px] capitalize",
              tab === t ? "text-cyan-400 border-b-2 border-cyan-400" : "text-white/50 hover:text-white/80",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "devices" && (
          <DevicesTab
            devices={devices.data?.devices ?? []}
            loading={devices.isLoading}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["devices"] })}
            onAddClick={() => setRegisterOpen(true)}
          />
        )}
        {tab === "screen" && <ScreenTab devices={devices.data?.devices ?? []} />}
        {tab === "commands" && <CommandsTab devices={devices.data?.devices ?? []} />}
        {tab === "installers" && <InstallersTab adapters={status.data?.adapters ?? []} />}
      </div>

      {registerOpen && <RegisterDrawer onClose={() => setRegisterOpen(false)} onDone={() => { setRegisterOpen(false); qc.invalidateQueries({ queryKey: ["devices"] }); }} />}
    </div>
  );
}

// ─── Devices tab ───────────────────────────────────────────────────────────
function DevicesTab({
  devices,
  loading,
  onRefresh,
  onAddClick,
}: {
  devices: Device[];
  loading: boolean;
  onRefresh: () => void;
  onAddClick: () => void;
}) {
  const qc = useQueryClient();
  const connectMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(resolveApiUrl(`/api/devices/${id}/connect`), { method: "POST" });
      return (await r.json()) as { url?: string };
    },
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank");
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  const statusMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(resolveApiUrl(`/api/devices/${id}/status`), { method: "POST" });
      return (await r.json()) as { ok: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  if (loading) {
    return <div className="p-4 text-white/40">Loading devices…</div>;
  }

  if (devices.length === 0) {
    return (
      <div className="p-6 text-center">
        <Monitor className="w-12 h-12 mx-auto mb-3 text-white/30" />
        <p className="text-white/60 mb-4">No devices registered yet.</p>
        <button
          onClick={onAddClick}
          className="px-4 py-2 bg-cyan-500 text-black rounded-md font-medium min-h-[44px]"
        >
          + Register first device
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <button
        onClick={onAddClick}
        className="w-full py-3 border border-dashed border-white/20 rounded-md text-white/60 hover:border-cyan-400 hover:text-cyan-400 transition-colors min-h-[44px]"
      >
        + Register device
      </button>
      {devices.map((d) => (
        <div key={d.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-medium flex items-center gap-2">
                {d.status === "online" ? (
                  <CircleDot className="w-4 h-4 text-green-400" />
                ) : (
                  <CircleSlash className="w-4 h-4 text-white/40" />
                )}
                {d.name}
              </div>
              <div className="text-xs text-white/50 mt-1">{d.host}</div>
            </div>
            <span className="text-xs px-2 py-1 bg-white/10 rounded capitalize">{d.adapter}</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => connectMutation.mutate(d.id)}
              disabled={connectMutation.isPending}
              className="flex-1 py-2 bg-cyan-500 text-black rounded text-sm font-medium min-h-[44px] flex items-center justify-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              Connect
            </button>
            <button
              onClick={() => statusMutation.mutate(d.id)}
              disabled={statusMutation.isPending}
              className="px-3 py-2 bg-white/10 rounded text-sm min-h-[44px] flex items-center justify-center"
              aria-label="Check status"
            >
              <RefreshCw className={cn("w-4 h-4", statusMutation.isPending && "animate-spin")} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Screen tab ────────────────────────────────────────────────────────────
function ScreenTab({ devices }: { devices: Device[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(devices[0]?.id ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const capture = async () => {
    if (!selectedId) return;
    setLoading(true);
    setImageUrl(null);
    try {
      const url = resolveApiUrl(`/api/devices/${selectedId}/screenshot`);
      const r = await fetch(url, { method: "POST" });
      if (r.ok) {
        const blob = await r.blob();
        setImageUrl(URL.createObjectURL(blob));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          onClick={capture}
          disabled={!selectedId || loading}
          className="px-4 py-2 bg-cyan-500 text-black rounded font-medium min-h-[44px] flex items-center gap-1"
        >
          <Eye className="w-4 h-4" />
          Capture
        </button>
      </div>
      <div className="aspect-video bg-black/50 rounded-lg flex items-center justify-center overflow-hidden">
        {loading && <p className="text-white/40">Capturing…</p>}
        {!loading && imageUrl && <img src={imageUrl} alt="screenshot" className="w-full h-full object-contain" />}
        {!loading && !imageUrl && (
          <p className="text-white/30 text-sm px-4 text-center">Tap Capture to grab a screenshot. Browser-based adapters (Guacamole, noVNC, MeshCentral) return PNGs from the gateway; binary adapters (RustDesk, Tailscale, scrcpy) return a 1×1 placeholder until pc-agent heartbeats carry the real frame.</p>
        )}
      </div>
    </div>
  );
}

// ─── Commands tab ──────────────────────────────────────────────────────────
function CommandsTab({ devices }: { devices: Device[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(devices[0]?.id ?? null);
  const [command, setCommand] = useState("");
  const qc = useQueryClient();

  const commands = useQuery({
    queryKey: ["device-commands", selectedId],
    queryFn: async () => {
      if (!selectedId) return { commands: [] };
      const r = await fetch(resolveApiUrl(`/api/devices/${selectedId}/commands`));
      return (await r.json()) as { commands: Command[] };
    },
    enabled: selectedId != null,
    refetchInterval: 10_000,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(resolveApiUrl(`/api/devices/${selectedId}/command`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      return (await r.json()) as { ok: boolean };
    },
    onSuccess: () => {
      setCommand("");
      qc.invalidateQueries({ queryKey: ["device-commands", selectedId] });
    },
  });

  return (
    <div className="p-4 space-y-3">
      <select
        value={selectedId ?? ""}
        onChange={(e) => setSelectedId(Number(e.target.value))}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]"
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Command (e.g. ipconfig)"
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px] text-white"
        />
        <button
          onClick={() => sendMutation.mutate()}
          disabled={!command.trim() || sendMutation.isPending}
          className="px-4 py-2 bg-cyan-500 text-black rounded font-medium min-h-[44px] flex items-center gap-1"
        >
          <Terminal className="w-4 h-4" />
          Send
        </button>
      </div>

      <div className="space-y-2">
        {commands.data?.commands.map((c) => (
          <div key={c.id} className="p-3 bg-white/5 rounded text-sm">
            <div className="flex justify-between text-white/50 text-xs mb-1">
              <span className="capitalize">{c.adapter}</span>
              <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
            </div>
            <div className="text-white font-mono text-xs mb-1">{c.command}</div>
            {c.output && <div className="text-white/70 font-mono text-xs whitespace-pre-wrap">{c.output}</div>}
            <div className="text-xs mt-1">
              <span
                className={cn(
                  "px-2 py-0.5 rounded",
                  c.status === "success" && "bg-green-500/20 text-green-400",
                  c.status === "failed" && "bg-red-500/20 text-red-400",
                  c.status === "running" && "bg-yellow-500/20 text-yellow-400",
                )}
              >
                {c.status}
              </span>
              {c.durationMs != null && <span className="ml-2 text-white/40">{c.durationMs}ms</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Installers tab ────────────────────────────────────────────────────────
function InstallersTab({ adapters }: { adapters: Adapter[] }) {
  const installerMap: Record<string, { script: string; desc: string; stage: number }> = {
    tailscale: { script: "install-tailscale.ps1", desc: "WireGuard-backed mesh VPN. Sets up tailscaled + service + auto-registers with AURA.", stage: 1 },
    rustdesk: { script: "install-rustdesk.ps1", desc: "Open-source TeamViewer. Configures unattended access with a fixed password.", stage: 1 },
    pcagent: { script: "install-pc-agent.ps1", desc: "BOS-OMEGA PC Agent — Node service on 127.0.0.1:8787 that spawns adapter binaries on demand.", stage: 1 },
    meshcentral: { script: "install-meshagent.ps1", desc: "Browser-based remote control via MeshCentral mesh agent.", stage: 2 },
    sunshine: { script: "install-sunshine.ps1", desc: "Game-streaming server (Moonlight client on phone). Installs via NSIS + sets PIN.", stage: 3 },
    scrcpy: { script: "install-scrcpy.ps1", desc: "Display+control an Android device attached to the PC. Installs to C:\\Program Files\\scrcpy.", stage: 4 },
  };

  // The all-in-one installer command. Downloads every script in parallel via
  // Start-BitsTransfer, unblocks the Mark-of-the-Web on each (kills Defender's
  // "blocked because downloaded" warning), then runs the bootstrap which
  // installs all 6 adapters in dependency order.
  //
  // Operator replaces the two REPLACE_ME placeholders. Tailscale auth key is
  // generated at https://login.tailscale.com/admin/settings/keys. RustDesk
  // password is whatever the operator wants unattended clients to use.
  const ONE_BOX_COMMAND =
    "$ErrorActionPreference=\"Stop\"; $ProgressPreference=\"SilentlyContinue\"; " +
    "$f=\"https://raw.githubusercontent.com/ABBYCRM/AURA-OMEGA/main/scripts\"; " +
    "$d=\"$env:USERPROFILE\\bos-install\"; " +
    "New-Item -ItemType Directory -Force -Path $d|Out-Null; " +
    "$s=@(\"bos-omega-bootstrap.ps1\",\"install-tailscale.ps1\",\"install-rustdesk.ps1\"," +
    "\"install-meshagent.ps1\",\"install-sunshine.ps1\",\"install-scrcpy.ps1\",\"install-pc-agent.ps1\"); " +
    "foreach($x in $s){$p=Join-Path $d $x; Write-Host \"[+] $x\" -ForegroundColor Cyan; " +
    "try{Start-BitsTransfer -Source \"$f/$x\" -Destination $p -ErrorAction Stop}" +
    "catch{Invoke-WebRequest \"$f/$x\" -OutFile $p -UseBasicParsing}; " +
    "Unblock-File $p -ErrorAction SilentlyContinue}; " +
    "Write-Host \"[+] All scripts in $d\" -ForegroundColor Green; " +
    "& (Join-Path $d \"bos-omega-bootstrap.ps1\") -Unattended " +
    "-TailscaleAuthKey \"tskey-REPLACE_ME\" -RustDeskPassword \"ChangeMe123!\"";

  return (
    <div className="p-4 space-y-4">
      {/* ONE BIG BOX — the entire install, single paste. */}
      <div className="p-4 bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 rounded-xl border border-cyan-500/30 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-bold flex items-center gap-2">
              <Rocket className="w-4 h-4 text-cyan-400" />
              Install everything (one command)
            </div>
            <div className="text-xs text-white/60 mt-1 leading-relaxed">
              Run as <span className="text-cyan-300 font-mono">Administrator</span> in PowerShell.
              Downloads all 6 installer scripts in parallel, unblocks them, then runs the bootstrap
              which installs <strong>Tailscale &rarr; RustDesk &rarr; PC Agent &rarr; MeshCentral &rarr; Sunshine &rarr; scrcpy</strong> in dependency order.
            </div>
          </div>
          <CopyButton text={ONE_BOX_COMMAND} label="Copy all" />
        </div>
        <pre className="px-3 py-3 bg-black/60 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre text-emerald-200/90 border border-emerald-500/20 max-h-64">
{ONE_BOX_COMMAND}
        </pre>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 rounded bg-black/30 border border-white/10">
            <div className="text-cyan-300 font-bold mb-1">1. Tailscale auth key</div>
            <div className="text-white/60">Get one at{" "}
              <a href="https://login.tailscale.com/admin/settings/keys" target="_blank" rel="noreferrer" className="underline">login.tailscale.com</a>.
              Replace <code className="text-amber-300">tskey-REPLACE_ME</code> in the command above.
            </div>
          </div>
          <div className="p-2 rounded bg-black/30 border border-white/10">
            <div className="text-cyan-300 font-bold mb-1">2. RustDesk password</div>
            <div className="text-white/60">Password unattended clients use to connect.
              Replace <code className="text-amber-300">ChangeMe123!</code> with whatever you want.
            </div>
          </div>
        </div>
        <details className="text-xs text-white/50">
          <summary className="cursor-pointer hover:text-white/80 select-none">
            ⚙️ Want to skip an adapter or install interactively?
          </summary>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div>• Add <code className="text-cyan-300">-SkipRustDesk -SkipMeshCentral -SkipSunshine -SkipScrcpy</code> to install only Tailscale + PC Agent.</div>
            <div>• Drop <code className="text-cyan-300">-Unattended</code> to be prompted for the auth key + password interactively.</div>
            <div>• Drop <code className="text-cyan-300">-TailscaleAuthKey</code> entirely to log in via browser on first run.</div>
            <div>• Override API target with <code className="text-cyan-300">-AuraApiBase https://your-render-app.onrender.com</code>.</div>
          </div>
        </details>
      </div>

      {/* Individual installers — collapsed by default, available if the operator */}
      {/* wants to run them one at a time (e.g. troubleshooting one adapter). */}
      <details className="rounded-xl border border-white/10 bg-white/5">
        <summary className="p-3 cursor-pointer text-sm font-medium select-none hover:bg-white/5">
          ⚙️ Run individual installers instead <span className="text-white/40 font-normal">(advanced / debugging)</span>
        </summary>
        <div className="p-3 pt-0 space-y-3">
          {adapters.map((a) => {
            const info = installerMap[a.name];
            if (!info) return null;
            return (
              <div key={a.name} className="p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium capitalize">{a.name}</div>
                    <div className="text-xs text-white/50 mt-1">{info.desc}</div>
                  </div>
                  <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">Stage {info.stage}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <code className="flex-1 px-3 py-2 bg-black/40 rounded text-xs font-mono overflow-x-auto whitespace-nowrap">
                    powershell -ExecutionPolicy Bypass -File .\{info.script}
                  </code>
                  <CopyButton text={`scripts/${info.script}`} />
                </div>
              </div>
            );
          })}
          {/* pc-agent is a local helper, not in the adapter registry — render its card explicitly. */}
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-medium">BOS PC Agent</div>
                <div className="text-xs text-white/50 mt-1">{installerMap.pcagent.desc}</div>
              </div>
              <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">Stage {installerMap.pcagent.stage}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <code className="flex-1 px-3 py-2 bg-black/40 rounded text-xs font-mono overflow-x-auto whitespace-nowrap">
                powershell -ExecutionPolicy Bypass -File .\install-pc-agent.ps1
              </code>
              <CopyButton text="scripts/install-pc-agent.ps1" />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="px-3 py-2 bg-white/10 hover:bg-white/15 active:bg-white/20 rounded text-sm min-h-[44px] flex items-center gap-1.5"
      aria-label={label}
    >
      <Copy className={cn("w-4 h-4", copied && "text-green-400")} />
      <span className="text-xs font-medium">{copied ? "Copied" : label}</span>
    </button>
  );
}

// ─── Register drawer ───────────────────────────────────────────────────────
function RegisterDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [adapter, setAdapter] = useState<"tailscale" | "rustdesk">("tailscale");
  const [rustdeskId, setRustdeskId] = useState("");
  const [rustdeskPassword, setRustdeskPassword] = useState("");
  const [tailscaleIp, setTailscaleIp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name, host, adapter };
      if (adapter === "rustdesk") {
        body.rustdeskId = rustdeskId;
        body.rustdeskPassword = rustdeskPassword;
      }
      if (adapter === "tailscale") {
        body.tailscaleIp = tailscaleIp;
      }
      await fetch(resolveApiUrl("/api/devices"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div
        className="bg-[#0a0e14] border-t border-white/10 w-full p-4 pb-8 rounded-t-xl space-y-3"
        style={{ width: "88%", maxWidth: 360, margin: "0 auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" />
          Register device
        </h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Office PC)" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]" />
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host (MagicDNS name or IP)" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]" />
        <select value={adapter} onChange={(e) => setAdapter(e.target.value as "tailscale" | "rustdesk")} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]">
          <option value="tailscale">Tailscale</option>
          <option value="rustdesk">RustDesk</option>
        </select>
        {adapter === "rustdesk" && (
          <>
            <input value={rustdeskId} onChange={(e) => setRustdeskId(e.target.value)} placeholder="RustDesk ID" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]" />
            <input value={rustdeskPassword} onChange={(e) => setRustdeskPassword(e.target.value)} placeholder="Password" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]" />
          </>
        )}
        {adapter === "tailscale" && (
          <input value={tailscaleIp} onChange={(e) => setTailscaleIp(e.target.value)} placeholder="100.x IP (optional)" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded min-h-[44px]" />
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-3 bg-white/10 rounded min-h-[44px]">Cancel</button>
          <button
            onClick={submit}
            disabled={!name || !host || submitting}
            className="flex-1 py-3 bg-cyan-500 text-black rounded font-medium min-h-[44px]"
          >
            {submitting ? "Registering…" : "Register"}
          </button>
        </div>
      </div>
    </div>
  );
}