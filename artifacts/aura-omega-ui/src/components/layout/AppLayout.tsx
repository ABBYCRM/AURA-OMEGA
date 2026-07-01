import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Workflow,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Cpu,
  Globe,
  Mail,
  Database,
  Code2,
  Camera,
  MessageCircle,
  GitBranch,
  Shield,
  ScrollText,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  User,
  Menu,
  X,
  Loader2,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useGetAuthStatus, useLogout } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navSections = [
  {
    title: "WORKSPACE",
    items: [
      { href: "/", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
      { href: "/chat", label: "Agent Chat", icon: <MessageSquare size={18} /> },
      { href: "/agents", label: "Agents", icon: <Bot size={18} /> },
      { href: "/tasks", label: "Tasks", icon: <Workflow size={18} /> },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { href: "/swarm", label: "Swarm Canvas", icon: <Cpu size={18} /> },
      { href: "/tools", label: "Tool Matrix", icon: <Search size={18} /> },
      { href: "/integrations", label: "Integrations", icon: <Globe size={18} /> },
      { href: "/missions", label: "Missions", icon: <GitBranch size={18} /> },
      { href: "/settings", label: "Settings", icon: <Settings size={18} /> },
    ],
  },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const { data: authData } = useGetAuthStatus();
  const user = authData?.user;
  const logoutMutation = useLogout();
  const [collapsed, setCollapsed] = useState(isMobile ? false : true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(["WORKSPACE", "TOOLS"]);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]);
  };

  const handleLogout = () => logoutMutation.mutate();

  const sidebarWidth = collapsed ? "w-[68px]" : "w-[260px]";

  const SidebarContent = () => (
    <aside className={cn("flex flex-col h-full bg-[hsl(0_0%_6%)] border-r border-[hsl(0_0%_14%)] transition-all duration-300", sidebarWidth)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-14 border-b border-[hsl(0_0%_14%)] shrink-0">
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-md text-[hsl(0_0%_45%)] hover:text-white hover:bg-[hsl(0_0%_14%)] mr-2">
            <X size={16} />
          </button>
        )}
        <div className={cn("flex items-center gap-2.5 overflow-hidden", collapsed && !isMobile && "justify-center w-full")}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
            <Sparkles size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white whitespace-nowrap">AURA-OMEGA</h1>
              <p className="text-[10px] text-[hsl(0_0%_45%)] -mt-0.5 whitespace-nowrap">Multi-Agent System</p>
            </div>
          )}
        </div>
        {!isMobile && !collapsed && (
          <button onClick={() => setCollapsed(true)} className="p-1 rounded-md hover:bg-[hsl(0_0%_14%)] text-[hsl(0_0%_45%)] hover:text-white transition-colors">
            <PanelLeftClose size={16} />
          </button>
        )}
        {!isMobile && collapsed && (
          <button onClick={() => setCollapsed(false)} className="absolute -right-3 top-14 w-6 h-6 rounded-full bg-[hsl(0_0%_12%)] border border-[hsl(0_0%_20%)] flex items-center justify-center text-[hsl(0_0%_45%)] hover:text-white z-10">
            <PanelLeftOpen size={12} />
          </button>
        )}
      </div>

      {/* New Task Button */}
      <div className={cn("px-3 pt-3 shrink-0", collapsed && "px-2")}>
        <Link href="/chat">
          <button className={cn(
            "w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg shadow-orange-500/20 transition-all rounded-lg flex items-center justify-center gap-2",
            collapsed ? "h-10 w-10 p-0 mx-auto" : "h-10 px-4"
          )}>
            <Plus size={18} />
            {!collapsed && "New Task"}
          </button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-2 px-2 space-y-1">
        {navSections.map((section) => (
          <div key={section.title} className="mb-2">
            {!collapsed && (
              <button onClick={() => toggleSection(section.title)} className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold text-[hsl(0_0%_40%)] uppercase tracking-wider hover:text-[hsl(0_0%_60%)] transition-colors">
                <span>{section.title}</span>
                <ChevronLeft size={12} className={cn("transition-transform", expandedSections.includes(section.title) ? "rotate-90" : "-rotate-90")} />
              </button>
            )}
            {(!collapsed ? expandedSections.includes(section.title) : true) && (
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <button
                        onClick={() => isMobile && setMobileOpen(false)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 group relative",
                          isActive
                            ? "bg-[hsl(24_95%_53%/0.12)] text-orange-400 font-medium"
                            : "text-[hsl(0_0%_60%)] hover:text-white hover:bg-[hsl(0_0%_12%)]",
                          collapsed && "justify-center px-0"
                        )}
                      >
                        <span className={cn("transition-colors", isActive ? "text-orange-400" : "text-[hsl(0_0%_40%)] group-hover:text-[hsl(0_0%_70%)]")}>
                          {item.icon}
                        </span>
                        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                        {isActive && !collapsed && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-orange-500 rounded-r-full" />}
                      </button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* System Status Mini */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className="bg-[hsl(0_0%_9%)] rounded-lg p-2.5 border border-[hsl(0_0%_14%)]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-[hsl(0_0%_40%)] uppercase tracking-wider">System</span>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            <div className="text-xs text-green-400 font-medium mb-1">AURA Online</div>
            <div className="text-[10px] text-[hsl(0_0%_40%)]">Multi-agent active</div>
          </div>
        </div>
      )}

      {/* Footer - User */}
      <div className="shrink-0 border-t border-[hsl(0_0%_14%)] p-3">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold">
              {(user?.username || "AU").slice(0, 2).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[hsl(0_0%_6%)]" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.username || "Admin"}</p>
              <p className="text-[10px] text-[hsl(0_0%_40%)] truncate">Online</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} className="p-1.5 rounded-md text-[hsl(0_0%_40%)] hover:text-red-400 hover:bg-[hsl(0_0%_14%)] transition-colors" title="Logout">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-[100dvh] w-screen bg-[hsl(0_0%_5.5%)] text-white overflow-hidden">
      {/* Mobile hamburger */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="fixed top-3 left-3 z-50 w-9 h-9 rounded-lg bg-[hsl(0_0%_12%)] border border-[hsl(0_0%_18%)] flex items-center justify-center text-white shadow-lg"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      )}

      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <div className={cn(
        "fixed lg:relative z-40 h-full transition-transform duration-300",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <SidebarContent />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0 h-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
