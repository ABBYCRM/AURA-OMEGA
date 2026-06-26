# BOS-OMEGA — Remote-Control Stack

**Goal:** From an Android phone, through AURA-OMEGA, control any Windows PC on your home network — full screen, full keyboard/mouse, install software remotely, all from one mobile UI.

**Stack target:** `Phone → BOS-OMEGA → Tailscale → PC Agent → RustDesk/MeshCentral/Guacamole → Windows PC`

---

## Why this stack

Every link in the chain has to be free, open-source, and self-hostable. No vendor lock-in.

| Layer | Tool | Why |
|------|------|-----|
| Phone UI | AURA-OMEGA web app | Already mobile-first, 88% width drawers, 44px touch targets |
| Tunnel / LAN bridge | **Tailscale** | Magic DNS, no port forwarding, free for personal use |
| Remote control (LAN) | **RustDesk** | Open-source TeamViewer, has a self-hosted hbbs+hbbr server, mobile + Win clients |
| Remote control (browser) | **MeshCentral** | Browser-based, full mesh, agent runs as a Windows service |
| Browser RDP/VNC | **Apache Guacamole** | Clientless gateway: HTML5 RDP/VNC/SSH in one page |
| Browser VNC | **noVNC** | Lightweight VNC client that runs in any browser |
| Game streaming | **Sunshine** (server) + **Moonlight** (client) | Low-latency hardware-accelerated streaming |
| Android screen cast | **scrcpy** | Display+control Android from PC — useful for testing the loop from the other side |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  AURA-OMEGA                                                                  │
│                                                                              │
│  packages/remote-control/        ←─ orchestrator (TS, runs in api-server)    │
│      adapters/                                                              │
│          tailscale.adapter.ts                                                │
│          rustdesk.adapter.ts                                                 │
│          meshcentral.adapter.ts                                              │
│          guacamole.adapter.ts                                                │
│          novnc.adapter.ts                                                    │
│          sunshine.adapter.ts                                                 │
│          scrcpy.adapter.ts                                                   │
│      routes.ts                  ←─ /api/devices/*                            │
│                                                                              │
│  packages/pc-agent/             ←─ small TS shim that lives on the target    │
│                                    PC; spawns the adapter's binary          │
│                                    when AURA pushes a command                │
│                                                                              │
│  scripts/                                                                      │
│      install-tailscale.ps1                                                   │
│      install-rustdesk.ps1                                                    │
│      install-meshagent.ps1                                                   │
│      install-sunshine.ps1                                                    │
│      install-scrcpy.ps1                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Staged delivery (the "slow and easy" plan)

### Round A — scaffold (this PR)

- [x] `docs/remote-control-stack.md` — this doc
- [x] `packages/pc-agent/` — empty TS module with manifest
- [x] `packages/remote-control/` — empty TS module with manifest
- [ ] All adapters: stub with `interface` only, no implementations
- [ ] Install scripts: TODO comments only

**Why stub first:** lets us lock the contract surface (function names, return types) before we commit to any specific behavior. The orchestrator code can call `tailscaleAdapter.connect(deviceId)` and get a clear "not implemented" error.

### Round B — Tailscale + RustDesk

- Tailscale adapter: real implementation using `tailscale` CLI + status API
- RustDesk adapter: real implementation using the RustDesk ID/key flow
- Install scripts: working PowerShell that downloads the MSI/EXE and installs silently
- First three routes: `/api/devices`, `/api/devices/:id/status`, `/api/devices/:id/connect`
- Tests: 250+/250+ passing

### Round C — MeshCentral + Guacamole + noVNC + UI

- MeshCentral adapter
- Guacamole adapter (talks to guacd via WebSocket)
- noVNC adapter (talks to websockify)
- Full `/api/devices/*` routes (screenshot, command, install)
- React UI page at `/remote` with 4 tabs

### Round D — Sunshine/Moonlight + scrcpy

- Sunshine + Moonlight for game streaming
- scrcpy for Android testing of the loop
- Polish, mobile UI, edge cases

---

## Adapter contract (locked in Round A)

Every adapter implements the same interface so the orchestrator never branches on adapter type:

```typescript
export interface RemoteControlAdapter {
  readonly name: string;                    // "tailscale" | "rustdesk" | ...
  readonly stage: 1 | 2 | 3 | 4;            // which delivery round this lands in

  isInstalled(ctx: ToolContext): Promise<boolean>;
  install(ctx: ToolContext): Promise<{ ok: boolean; error?: string }>;
  status(ctx: ToolContext): Promise<DeviceStatus>;
  connect(ctx: ToolContext, opts: ConnectOpts): Promise<ConnectResult>;
  screenshot(ctx: ToolContext): Promise<Buffer>;
  sendCommand(ctx: ToolContext, cmd: string): Promise<{ ok: boolean; output?: string }>;
}
```

Stubs in Round A throw `not_implemented_yet` so callers get a clear error during dev. This is the "fail loud, fail early" pattern — better than returning fake success.

---

## Database schema (added in Round B)

```sql
CREATE TABLE bos_devices (
  id serial PRIMARY KEY,
  name text NOT NULL,
  host text NOT NULL,
  adapter text NOT NULL,           -- tailscale | rustdesk | meshcentral | ...
  tailscale_ip text,
  rustdesk_id text,
  rustdesk_password text,
  meshcentral_id text,
  guacamole_connection_id text,
  status text DEFAULT 'unknown',
  last_seen timestamp,
  metadata jsonb DEFAULT '{}',
  created_at timestamp DEFAULT now()
);

CREATE TABLE bos_commands (
  id serial PRIMARY KEY,
  device_id integer REFERENCES bos_devices(id),
  adapter text NOT NULL,
  command text NOT NULL,
  output text,
  status text DEFAULT 'queued',    -- queued | running | success | failed
  started_at timestamp,
  completed_at timestamp,
  duration_ms integer,
  created_at timestamp DEFAULT now()
);

CREATE TABLE bos_screenshots (
  id serial PRIMARY KEY,
  device_id integer REFERENCES bos_devices(id),
  bytes integer,
  taken_at timestamp DEFAULT now(),
  storage_key text                  -- S3/key in agent_memory
);
```

---

## Open questions

- Where does the `pc-agent` shim actually run during dev? (No real PC yet.)
  → Mocked via in-process adapter stubs until we have a real test PC.
- Do we want `tailscale serve` reverse-proxy to expose the AURA UI from a Win PC?
  → Useful for testing without a public hostname. Round B.
- scrcpy on a remote Android from a remote PC — sanity check?
  → Yes, that's the point. Round D.

---

## Definition of done (Round A)

- [ ] All stub files exist with `interface` declarations
- [ ] `pnpm --filter @workspace/api-server run test` still passes (240/240)
- [ ] No new dependencies added
- [ ] Doc reviewed and merged
- [ ] Branch deployed to Render, `/api/devices/status` returns "not implemented"