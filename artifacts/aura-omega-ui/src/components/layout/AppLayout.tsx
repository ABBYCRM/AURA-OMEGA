import { Link, useLocation } from "wouter";
import {
  Diamond,
  Plug,
  MessageSquare,
  Plus,
  ChevronDown,
  Menu,
  MessageSquarePlus,
  Sparkles,
  Loader2,
  Scan,
  PenTool,
  Hash,
  Share2,
  Send,
  Settings,
  LogOut,
  User,
  Zap,
  Globe,
  Brain,
  Layers,
  Terminal,
  Calendar,
  Clock,
  ChevronRight,
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppLayoutProps {
  children: React.ReactNode;
}

interface TaskItem {
  id: string;
  title: string;
  active?: boolean;
  icon?: React.ReactNode;
}

interface SectionProps {
  title: string;
  items: TaskItem[];
  defaultOpen?: boolean;
}

function SidebarSection({ title, items, defaultOpen = true }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors w-full"
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", !isOpen && "-rotate-90")} />
        {title}
      </button>
      {isOpen && (
        <div className="space-y-0.5 mt-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all group",
                item.active
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              )}
            >
              {item.icon && <span className="text-gray-500 group-hover:text-gray-300">{item.icon}</span>}
              <span className="flex-1 truncate">{item.title}</span>
              {item.active && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const { user, logoutMutation } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        toast.success("Logged out successfully");
      },
    });
  };

  const todayTasks: TaskItem[] = [
    { id: "1", title: "API Key Pricing Guide", active: true },
  ];

  const previousTasks: TaskItem[] = [
    { id: "2", title: "Dollar Lead Connect" },
    { id: "3", title: "Interactive courtroom visualization" },
    { id: "4", title: "Minimax M3 Hallucination Guide" },
    { id: "5", title: "Medical Records Access Systems" },
  ];

  const navItems = [
    { icon: <Diamond className="w-4 h-4" />, label: "Skills", href: "/skills" },
    { icon: <Plug className="w-4 h-4" />, label: "Connectors", href: "/connectors" },
    { icon: <MessageSquare className="w-4 h-4" />, label: "Instructions", href: "/instructions" },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#1a1a1a] border-r border-white/5">
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <span className="text-white font-bold text-sm">A</span>
        </div>
        <span className="font-semibold text-white text-sm tracking-tight">AURA-OMEGA</span>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="ml-auto p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
        >
          <ChevronRight className={cn("w-4 h-4 transition-transform", !sidebarOpen && "rotate-180")} />
        </button>
      </div>

      {/* Work Section */}
      <div className="px-3 py-2">
        <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <span className="font-medium">Work</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Nav Items */}
      <nav className="px-2 space-y-0.5">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all",
              location === item.href
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            )}>
              {item.icon}
              <span>{item.label}</span>
            </div>
          </Link>
        ))}
      </nav>

      {/* Projects */}
      <div className="mt-4 px-3">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Projects</h3>
        <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-1">
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Scrollable Task Sections */}
      <div className="flex-1 overflow-y-auto px-2 mt-2">
        <SidebarSection title="Today" items={todayTasks} />
        <SidebarSection title="Previous 7 days" items={previousTasks} defaultOpen={true} />
      </div>

      {/* New Task Button */}
      <div className="p-3">
        <button className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30">
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* User */}
      <div className="p-3 border-t border-white/5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full hover:bg-white/5 rounded-lg p-2 transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center border border-white/10">
                <span className="text-white text-xs font-medium">
                  {user?.username?.slice(0, 2).toUpperCase() || "LL"}
                </span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-white">{user?.username || "Luis Lacerda"}</p>
                <p className="text-xs text-gray-500">Free</p>
              </div>
              <MoreHorizontal className="w-4 h-4 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#252525] border-white/10">
            <DropdownMenuItem className="text-gray-300 hover:text-white hover:bg-white/5 cursor-pointer">
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="text-gray-300 hover:text-white hover:bg-white/5 cursor-pointer">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem 
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 hover:bg-white/5 cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-white overflow-hidden">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside 
          className={cn(
            "transition-all duration-300 ease-in-out flex-shrink-0",
            sidebarOpen ? "w-72" : "w-0 overflow-hidden"
          )}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Mobile Sidebar */}
      {isMobile && (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-72 p-0 bg-[#1a1a1a] border-r border-white/5">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
