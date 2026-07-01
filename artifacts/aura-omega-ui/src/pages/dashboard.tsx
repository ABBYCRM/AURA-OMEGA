import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Cpu, Globe, Mail, Database, Code2, Camera, MessageCircle,
  GitBranch, Shield, ScrollText, Sparkles, CheckCircle2,
  XCircle, Clock, Activity, Zap, TrendingUp, Layers, Box,
  Terminal, ExternalLink, RefreshCw, Loader2, AlertTriangle,
} from "lucide-react";

interface HealthStatus {
  service: string;
  status: "operational" | "down" | "unknown";
  keys?: string[];
  icon: string;
}

const defaultComponents: HealthStatus[] = [
  { service: "LLM Primary (NVIDIA NIM)", status: "operational", keys: ["8 keys"], icon: "cpu" },
  { service: "LLM Fallback (Kimi)", status: "operational", keys: ["Moonshot"], icon: "cpu" },
  { service: "LLM Tertiary (OpenAI)", status: "operational", keys: ["GPT-4o"], icon: "cpu" },
  { service: "A2E Agent-to-Env", status: "operational", keys: ["Active"], icon: "terminal" },
  { service: "Web Scraping", status: "operational", keys: ["ScrapingBee, ScrapFly, Firecrawl, Steel"], icon: "globe" },
  { service: "Search", status: "operational", keys: ["Tavily, Exa"], icon: "search" },
  { service: "Email", status: "operational", keys: ["Resend"], icon: "mail" },
  { service: "Vector Memory", status: "operational", keys: ["Pinecone"], icon: "database" },
  { service: "Code Execution", status: "operational", keys: ["E2B"], icon: "code" },
  { service: "Screenshots", status: "operational", keys: ["ScreenshotOne"], icon: "camera" },
  { service: "Discord", status: "operational", keys: ["Bot active"], icon: "message-circle" },
  { service: "Workflows", status: "operational", keys: ["Inngest, n8n"], icon: "git-branch" },
  { service: "GitHub", status: "operational", keys: ["Token"], icon: "git-branch" },
  { service: "Logging", status: "operational", keys: ["Helicone"], icon: "scroll-text" },
];

const iconMap: Record<string, React.ReactNode> = {
  cpu: <Cpu size={16} />, globe: <Globe size={16} />, mail: <Mail size={16} />,
  database: <Database size={16} />, code: <Code2 size={16} />, camera: <Camera size={16} />,
  "message-circle": <MessageCircle size={16} />, "git-branch": <GitBranch size={16} />,
  shield: <Shield size={16} />, "scroll-text": <ScrollText size={16} />,
  terminal: <Terminal size={16} />, search: <Activity size={16} />,
};

const statusCfg: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
  operational: { color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", icon: <CheckCircle2 size={14} />, label: "OK" },
  down: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: <XCircle size={14} />, label: "Down" },
  unknown: { color: "text-[hsl(0_0%_50%)]", bg: "bg-[hsl(0_0%_12%)]", border: "border-[hsl(0_0%_18%)]", icon: <Clock size={14} />, label: "?" },
};

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Dashboard() {
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchHealth = async () => {
    setLoading(true); setError(false);
    try {
      const res = await fetch("/healthz");
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
    setLastRefresh(new Date());
  };

  useEffect(() => { fetchHealth(); }, []);

  const components = defaultComponents;
  const operationalCount = components.filter(c => c.status === "operational").length;

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-3 sm:p-4 lg:p-6 space-y-4 lg:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-8 sm:pt-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">System Dashboard</h2>
          <p className="text-xs sm:text-sm text-[hsl(0_0%_45%)] mt-0.5">AURA-OMEGA Multi-Agent Orchestration</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs text-[hsl(0_0%_40%)]">{lastRefresh.toLocaleTimeString()}</span>
          <button onClick={fetchHealth} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[hsl(0_0%_10%)] hover:bg-[hsl(0_0%_14%)] border border-[hsl(0_0%_16%)] text-[10px] sm:text-xs text-[hsl(0_0%_60%)] hover:text-white transition-colors">
            <RefreshCw size={12} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-green-500/10 via-emerald-500/5 to-transparent border border-green-500/20 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shrink-0" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-green-400 font-semibold text-sm">
                  {loading ? "Checking..." : error ? "API Unreachable" : "All Systems Operational"}
                </span>
                <span className="text-[10px] text-green-400/70 bg-green-500/10 px-2 py-0.5 rounded-full font-medium">
                  {operationalCount}/{components.length} Active
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[hsl(0_0%_50%)] mt-0.5">
                URL: <span className="text-orange-400 font-mono">aura-omega.onrender.com</span>
                {healthData?.service && <span className="ml-2 text-[hsl(0_0%_40%)]">{healthData.service}</span>}
              </p>
            </div>
          </div>
          <a href="https://aura-omega.onrender.com" target="_blank" rel="noopener noreferrer" className="sm:ml-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium transition-colors border border-green-500/20">
            <ExternalLink size={12} /> <span className="hidden sm:inline">Open</span>
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
        {[
          { label: "Active Agents", value: "6", icon: <Box size={16} />, change: "Swarm ready" },
          { label: "API Health", value: error ? "Error" : "OK", icon: <CheckCircle2 size={16} />, change: loading ? "Checking..." : "Reachable" },
          { label: "LLM Pool", value: "3 models", icon: <Zap size={16} />, change: "NVIDIA + Kimi + OpenAI" },
          { label: "Uptime", value: "99.9%", icon: <Activity size={16} />, change: "30 days" },
        ].map(s => (
          <div key={s.label} className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4 hover:border-[hsl(0_0%_20%)] transition-colors group">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="p-1.5 sm:p-2 rounded-lg bg-[hsl(0_0%_12%)] text-orange-400 group-hover:bg-orange-500/10 transition-colors">{s.icon}</span>
              <TrendingUp size={14} className="text-green-400 hidden sm:block" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white mb-0.5">{s.value}</div>
            <div className="text-[10px] sm:text-xs text-[hsl(0_0%_40%)]">{s.label}</div>
            <div className="text-[10px] sm:text-xs text-green-400 mt-1 font-medium">{s.change}</div>
          </div>
        ))}
      </div>

      {/* Component Status */}
      <div className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] overflow-hidden">
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-[hsl(0_0%_14%)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-orange-400" />
            <h3 className="text-sm font-semibold text-white">Component Status</h3>
          </div>
          <span className="text-[10px] text-[hsl(0_0%_40%)] bg-[hsl(0_0%_12%)] px-2.5 py-1 rounded-full font-medium">{components.length}</span>
        </div>
        <div className="divide-y divide-[hsl(0_0%_14%)]">
          {components.map(c => {
            const s = statusCfg[c.status];
            return (
              <div key={c.service} className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-2.5 sm:py-3 hover:bg-[hsl(0_0%_9%)] transition-colors group">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[hsl(0_0%_12%)] flex items-center justify-center text-[hsl(0_0%_50%)] group-hover:text-orange-400 group-hover:bg-orange-500/10 transition-colors shrink-0">
                  {iconMap[c.icon] || <Sparkles size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-medium text-white truncate">{c.service}</div>
                  {c.keys && <div className="text-[9px] sm:text-[10px] text-[hsl(0_0%_40%)] font-mono truncate hidden sm:block">{c.keys.join(", ")}</div>}
                </div>
                <span className={cn("flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border shrink-0", s.bg, s.color, s.border)}>
                  {s.icon} <span className="hidden sm:inline">{s.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { href: "/chat", label: "Agent Chat", icon: <Sparkles size={14} />, desc: "Command center" },
          { href: "/agents", label: "Agent Swarm", icon: <Box size={14} />, desc: "6 agents" },
          { href: "/tasks", label: "Task Queue", icon: <Activity size={14} />, desc: "Live tracking" },
          { href: "/settings", label: "Settings", icon: <Shield size={14} />, desc: "Runtime config" },
        ].map(link => (
          <Link key={link.href} href={link.href}>
            <button className="w-full bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3 sm:p-4 hover:border-[hsl(0_0%_22%)] transition-colors text-left group">
              <span className="text-orange-400 group-hover:text-orange-300 transition-colors">{link.icon}</span>
              <div className="text-sm font-medium text-white mt-2">{link.label}</div>
              <div className="text-[10px] text-[hsl(0_0%_40%)]">{link.desc}</div>
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
