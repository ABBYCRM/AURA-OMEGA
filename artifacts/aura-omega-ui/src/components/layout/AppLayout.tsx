import { Link, useLocation } from "wouter";
import {
  Activity,
  Bot,
  BrainCircuit,
  CalendarClock,
  DatabaseZap,
  Gauge,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Network,
  ServerCog,
  Settings as SettingsIcon,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Ops", hint: "AURA-OMEGA mission control" },
  { href: "/chat", icon: MessageSquare, label: "Chat", hint: "Command surface, uploads, delete/manage chats" },
  { href: "/tools", icon: Workflow, label: "Tools", hint: "Tool Selection Matrix and n8n intent registry" },
  { href: "/swarm", icon: Activity, label: "Swarm", hint: "Live agent activity and dispatch" },
  { href: "/tasks", icon: Network, label: "Tasks", hint: "Goal execution and workflow chains" },
  { href: "/agents", icon: Bot, label: "Agents", hint: "Agent roles, models, capabilities" },
  { href: "/scheduled", icon: CalendarClock, label: "Scheduled", hint: "Cron jobs and heartbeat autonomy" },
  { href: "/runtimes", icon: ServerCog, label: "Runtimes", hint: "LLM, browser, code, deploy, memory lanes" },
  { href: "/integrations", icon: KeyRound, label: "Integrations", hint: "Providers, OAuth apps, secrets, website logins" },
  { href: "/settings", icon: SettingsIcon, label: "Settings", hint: "Operator controls and system policy" },
];

function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [heartbeat, setHeartbeat] = useState<"online" | "offline" | "unknown">("unknown");

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
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      <aside className="hidden md:flex w-[112px] flex-shrink-0 border-r border-card-border bg-card/80 backdrop-blur-xl flex-col items-center py-4 z-20">
        <Link href="/" data-testid="link-aura-logo">
          <div className="flex flex-col items-center gap-2 mb-4 cursor-pointer group">
            <div className="relative w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/30 shadow-[0_0_26px_rgba(139,92,246,0.25)] transition-transform group-hover:scale-105">
              <BrainCircuit className="w-7 h-7 text-primary" />
              <span className={cn("absolute -right-1 -top-1 w-3 h-3 rounded-full border border-background", heartbeat === "online" ? "bg-emerald-400 animate-pulse" : heartbeat === "offline" ? "bg-destructive" : "bg-muted-foreground")} />
            </div>
            <div className="text-center leading-tight">
              <div className="text-[11px] font-black tracking-[0.2em] text-foreground">AURA</div>
              <div className="text-[9px] font-bold tracking-[0.18em] text-primary">OMEGA</div>
            </div>
          </div>
        </Link>

        <div className="w-12 h-px bg-card-border mb-3" />

        <nav className="flex flex-col gap-1 flex-1 w-full items-center px-2 overflow-y-auto" aria-label="AURA navigation">
          {navItems.map((item) => {
            const active = isActive(location, item.href);
            return (
              <Link key={item.href} href={item.href} data-testid={`nav-${item.label.toLowerCase()}`}>
                <div
                  title={item.hint}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative group w-full flex flex-col items-center gap-1 rounded-2xl py-2.5 cursor-pointer transition-all duration-200",
                    active ? "bg-primary/15 text-primary border border-primary/20" : "text-muted-foreground hover:bg-card-border/60 hover:text-foreground border border-transparent",
                  )}
                >
                  <span className={cn("absolute -left-2 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-primary transition-all duration-300", active ? "h-8 opacity-100" : "h-0 opacity-0")} />
                  <item.icon className="w-[22px] h-[22px]" strokeWidth={1.75} />
                  <span className="text-[10px] font-bold tracking-wide leading-none">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 flex flex-col items-center gap-1 rounded-2xl border border-card-border bg-background/50 px-3 py-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-[9px] font-bold text-muted-foreground uppercase">Policy</span>
        </div>
      </aside>

      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative z-10">{children}</main>

      <nav className="md:hidden flex-shrink-0 grid grid-cols-5 border-t border-card-border bg-card z-20" aria-label="Mobile AURA navigation">
        {navItems.slice(0, 10).map((item) => {
          const active = isActive(location, item.href);
          return (
            <Link key={item.href} href={item.href} data-testid={`tab-${item.label.toLowerCase()}`}>
              <div className={cn("relative h-14 flex flex-col items-center justify-center gap-1 transition-colors", active ? "text-primary" : "text-muted-foreground")}>
                <item.icon className="w-5 h-5" strokeWidth={1.75} />
                <span className="text-[9px] font-semibold leading-none">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
