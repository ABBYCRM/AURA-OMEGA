import { Link, useLocation } from "wouter";
import {
  Activity,
  BookOpen,
  Bot,
  BrainCircuit,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Network,
  ServerCog,
  Settings as SettingsIcon,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const primaryNav = [
  { href: "/",           icon: LayoutDashboard, label: "Ops",     hint: "Mission control" },
  { href: "/chat",       icon: MessageSquare,   label: "Chat",    hint: "Command surface" },
  { href: "/swarm",      icon: Activity,        label: "Swarm",   hint: "Live agent activity" },
  { href: "/tasks",      icon: Network,         label: "Tasks",   hint: "Task queue" },
  { href: "/agents",     icon: Bot,             label: "Agents",  hint: "Agent roster" },
];

const toolsNav = [
  { href: "/tools",      icon: Workflow,        label: "Tools",       hint: "Tool matrix & n8n" },
  { href: "/scheduled",  icon: CalendarClock,   label: "Scheduled",   hint: "Cron & heartbeat" },
  { href: "/runtimes",   icon: ServerCog,       label: "Runtimes",    hint: "LLM & execution lanes" },
  { href: "/reference",  icon: BookOpen,        label: "Reference",   hint: "Developer documentation library" },
];

const configNav = [
  { href: "/integrations", icon: KeyRound,       label: "Integrations", hint: "Providers & secrets" },
  { href: "/settings",     icon: SettingsIcon,   label: "Settings",     hint: "Operator controls" },
];

const allNav = [...primaryNav, ...toolsNav, ...configNav];

function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

function NavItem({ item, location, compact = false }: { item: typeof primaryNav[0]; location: string; compact?: boolean }) {
  const active = isActive(location, item.href);
  return (
    <Link href={item.href} data-testid={`nav-${item.label.toLowerCase()}`}>
      <div
        title={item.hint}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-150 select-none",
          compact && "justify-center gap-0 px-2",
          active
            ? "bg-primary/12 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <item.icon
          className={cn("shrink-0 transition-colors", compact ? "w-5 h-5" : "w-[18px] h-[18px]")}
          strokeWidth={active ? 2.2 : 1.75}
        />
        {!compact && (
          <span className={cn("text-sm leading-none font-medium transition-colors", active && "font-semibold")}>
            {item.label}
          </span>
        )}
        {active && !compact && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </div>
    </Link>
  );
}

function NavGroup({ label, items, location }: { label: string; items: typeof primaryNav; location: string }) {
  return (
    <div className="space-y-0.5">
      <div className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/50 select-none">
        {label}
      </div>
      {items.map((item) => (
        <NavItem key={item.href} item={item} location={location} />
      ))}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [heartbeat, setHeartbeat] = useState<"online" | "offline" | "unknown">("unknown");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch("/api/n8n/autonomy/heartbeat");
        if (alive) setHeartbeat(res.ok ? "online" : "offline");
      } catch {
        if (alive) setHeartbeat("offline");
      }
    };
    ping();
    const id = window.setInterval(ping, 15000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-background text-foreground overflow-hidden font-sans">

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r border-border bg-card/60 backdrop-blur-xl flex-col py-5 z-20 gap-5">

        {/* Logo */}
        <Link href="/" data-testid="link-aura-logo">
          <div className="flex items-center gap-3 px-4 cursor-pointer group select-none">
            <div className="relative w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/25 shadow-[0_0_18px_rgba(139,92,246,0.20)] transition-transform group-hover:scale-105 shrink-0">
              <BrainCircuit className="w-5 h-5 text-primary" />
              <span className={cn(
                "absolute -right-0.5 -top-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                heartbeat === "online"  ? "bg-emerald-400 animate-pulse" :
                heartbeat === "offline" ? "bg-destructive" :
                                          "bg-muted-foreground",
              )} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-black tracking-tight text-foreground">AURA-OMEGA</div>
              <div className="text-[11px] text-muted-foreground font-medium">AI Agent Swarm</div>
            </div>
          </div>
        </Link>

        <div className="h-px bg-border mx-4" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-5" aria-label="Main navigation">
          <NavGroup label="Main" items={primaryNav} location={location} />
          <NavGroup label="Tools" items={toolsNav} location={location} />
          <NavGroup label="Config" items={configNav} location={location} />
        </nav>

        {/* System status */}
        <div className="px-3">
          <div className={cn(
            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs",
            heartbeat === "online"
              ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-muted/40 text-muted-foreground",
          )}>
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">
              {heartbeat === "online" ? "System online" : heartbeat === "offline" ? "System offline" : "Checking…"}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative z-10">{children}</main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <>
        {/* Backdrop for More drawer */}
        {mobileMoreOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-30 backdrop-blur-sm"
            onClick={() => setMobileMoreOpen(false)}
          />
        )}

        {/* More drawer (slides up) */}
        <div className={cn(
          "md:hidden fixed bottom-16 left-0 right-0 z-40 bg-card border-t border-border transition-transform duration-200 pb-safe",
          mobileMoreOpen ? "translate-y-0" : "translate-y-full",
        )}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">More</span>
            <button
              onClick={() => setMobileMoreOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 py-3 grid grid-cols-3 gap-1">
            {[...toolsNav, ...configNav].map((item) => {
              const active = isActive(location, item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    onClick={() => setMobileMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 transition-colors",
                      active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <item.icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.75} />
                    <span className="text-[11px] font-medium leading-none">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Bottom nav bar */}
        <nav
          className="md:hidden flex-shrink-0 flex items-stretch border-t border-border bg-card/95 backdrop-blur-xl z-20"
          aria-label="Mobile navigation"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {primaryNav.map((item) => {
            const active = isActive(location, item.href);
            return (
              <Link key={item.href} href={item.href} data-testid={`tab-${item.label.toLowerCase()}`} className="flex-1">
                <div className={cn(
                  "flex flex-col items-center justify-center gap-1 h-14 transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}>
                  {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />}
                  <item.icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.75} />
                  <span className="text-[10px] font-semibold leading-none">{item.label}</span>
                </div>
              </Link>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setMobileMoreOpen((v) => !v)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 h-14 transition-colors",
              mobileMoreOpen ? "text-primary" : "text-muted-foreground",
            )}
            aria-label="More navigation items"
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </nav>
      </>
    </div>
  );
}
