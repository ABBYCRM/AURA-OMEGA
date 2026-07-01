import { useState, useRef, useEffect } from "react";
import { useGetAuthStatus } from "@workspace/api-client-react";
import { useAiStream } from "@/hooks/useAiStream";
import {
  Send, Paperclip, Globe, Search, Code2, Camera, Cpu,
  Bot, User, Sparkles, Loader2, Terminal, CheckCircle2,
  XCircle, Clock, ChevronDown, Settings, Wand2, Plus,
  MessageSquare, PanelRightClose, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  agent: string;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolCalls?: { id: string; tool: string; status: string; result?: string }[];
}

/* ------------------------------------------------------------------ */
/*  Mock tasks  (replace with /api/tasks integration when ready)        */
/* ------------------------------------------------------------------ */
const mockTasks: TaskItem[] = [
  { id: "1", title: "Web research", description: "Scraping sources for pricing data", status: "running", agent: "Web Agent" },
  { id: "2", title: "Vector indexing", description: "Syncing docs to Pinecone", status: "completed", agent: "Data Agent" },
  { id: "3", title: "LLM benchmark", description: "Latency comparison across models", status: "completed", agent: "DevOps" },
];

const tools = [
  { id: "web", icon: <Globe size={14} />, label: "Web" },
  { id: "search", icon: <Search size={14} />, label: "Search" },
  { id: "code", icon: <Code2 size={14} />, label: "Code" },
  { id: "vision", icon: <Camera size={14} />, label: "Vision" },
  { id: "llm", icon: <Cpu size={14} />, label: "LLM" },
];

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={12} className="text-yellow-400" />,
  running: <Loader2 size={12} className="text-orange-400 animate-spin" />,
  completed: <CheckCircle2 size={12} className="text-green-400" />,
  failed: <XCircle size={12} className="text-red-400" />,
};
const statusColors: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  running: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  completed: "text-green-400 bg-green-500/10 border-green-500/20",
  failed: "text-red-400 bg-red-500/10 border-red-500/20",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function ChatPage() {
  const { data: authData } = useGetAuthStatus();
  const user = authData?.user;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>(["web", "search"]);
  const [showTasks, setShowTasks] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<number>(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* AI streaming hook — connects to REAL /api/ai/chat */
  const aiStream = useAiStream((agentId) => {
    if (agentId) {
      console.log("Agent completed:", agentId);
    }
  });

  const isThinking = aiStream.streaming;

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages, aiStream.tokens]);

  const toggleTool = (toolId: string) => {
    setActiveTools(prev => prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]);
  };

  const handleSubmit = async () => {
    if (!input.trim() || isThinking) return;

    const userMsg: ChatMsg = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    const sentInput = input;
    setInput("");

    /* Send to REAL backend via useAiStream */
    await aiStream.send({
      message: sentInput,
      channelId: activeChannelId,
    });

    /* Add assistant message with stream result */
    setMessages(prev => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiStream.tokens || "Processing complete.",
        timestamp: new Date(),
      },
    ]);
    aiStream.clear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in relative">
      {/* Top Bar */}
      <div className="shrink-0 h-12 border-b border-[hsl(0_0%_14%)] flex items-center justify-between px-3 sm:px-4 bg-[hsl(0_0%_5.5%)]">
        <div className="flex items-center gap-2 sm:gap-3 pl-8 sm:pl-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
              <Sparkles size={12} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-white hidden sm:inline">Agent Workspace</span>
            <span className="text-sm font-semibold text-white sm:hidden">Chat</span>
          </div>
          <div className="h-4 w-px bg-[hsl(0_0%_18%)] hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[hsl(0_0%_45%)]">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>AURA Online</span>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button onClick={() => setShowTasks(!showTasks)} className="lg:hidden p-1.5 rounded-md text-[hsl(0_0%_40%)] hover:text-white hover:bg-[hsl(0_0%_12%)] transition-colors relative">
            <MessageSquare size={14} />
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-orange-500 text-[8px] text-white flex items-center justify-center font-bold">{mockTasks.length}</span>
          </button>
          <button className="p-1.5 rounded-md text-[hsl(0_0%_40%)] hover:text-white hover:bg-[hsl(0_0%_12%)] transition-colors">
            <Wand2 size={14} />
          </button>
          <button className="hidden sm:flex p-1.5 rounded-md text-[hsl(0_0%_40%)] hover:text-white hover:bg-[hsl(0_0%_12%)] transition-colors">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto no-scrollbar px-2 sm:px-4 py-3 sm:py-4 space-y-1">
            {/* Empty state */}
            {messages.length === 0 && !isThinking && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-4 sm:mb-6">
                  <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-orange-500" />
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">What can I help with?</h2>
                <p className="text-[hsl(0_0%_45%)] text-xs sm:text-sm max-w-md">
                  Start a conversation or create a task. I can help with research, coding, analysis, and more.
                </p>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg) => (
              <div key={msg.id} className={cn("group flex gap-2 sm:gap-3 px-2 sm:px-3 py-2.5 sm:py-3 rounded-xl transition-colors", msg.role === "user" ? "hover:bg-[hsl(0_0%_8%)]" : "hover:bg-[hsl(0_0%_7%)]")}>
                <div className="shrink-0 mt-0.5">
                  {msg.role === "user" ? (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                      <User size={12} className="text-white sm:hidden" />
                      <User size={14} className="text-white hidden sm:block" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                      <Sparkles size={12} className="text-white sm:hidden" />
                      <Sparkles size={14} className="text-white hidden sm:block" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white">{msg.role === "user" ? (user?.username || "You") : "AURA-OMEGA"}</span>
                    <span className="text-[9px] sm:text-[10px] text-[hsl(0_0%_40%)]">{msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="text-xs sm:text-sm text-[hsl(0_0%_80%)] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.toolCalls.map(tc => (
                        <div key={tc.id} className="bg-[hsl(0_0%_9%)] rounded-lg border border-[hsl(0_0%_14%)] px-2.5 py-1.5 flex items-center gap-2">
                          {statusIcons[tc.status] || <Clock size={10} />}
                          <code className="text-[11px] text-[hsl(0_0%_60%)] font-mono">{tc.tool}</code>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium ml-auto", statusColors[tc.status]?.split(" ").slice(1).join(" ") || "")}>{tc.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming indicator */}
            {isThinking && (
              <div className="flex gap-2 sm:gap-3 px-2 sm:px-3 py-3 rounded-xl animate-slide-up">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles size={14} className="text-white animate-thinking-pulse" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-orange-400">AURA-OMEGA</span>
                    <span className="text-[10px] text-[hsl(0_0%_40%)]">Thinking...</span>
                  </div>
                  {aiStream.tokens && (
                    <div className="text-xs sm:text-sm text-[hsl(0_0%_80%)] leading-relaxed whitespace-pre-wrap">{aiStream.tokens}</div>
                  )}
                  {!aiStream.tokens && (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 size={14} className="text-orange-400 animate-spin" />
                      <span className="text-xs text-[hsl(0_0%_50%)]">Processing with {activeTools.length} tools</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="shrink-0 border-t border-[hsl(0_0%_14%)] bg-[hsl(0_0%_5.5%)] p-2 sm:p-3">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 px-1 overflow-x-auto no-scrollbar">
                {tools.map(tool => (
                  <button key={tool.id} onClick={() => toggleTool(tool.id)} className={cn(
                    "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-all border shrink-0",
                    activeTools.includes(tool.id) ? "bg-orange-500/10 text-orange-400 border-orange-500/30" : "bg-transparent text-[hsl(0_0%_40%)] border-transparent hover:bg-[hsl(0_0%_12%)] hover:text-[hsl(0_0%_60%)]"
                  )}>{tool.icon}<span>{tool.label}</span></button>
                ))}
                <div className="flex-1 min-w-4" />
                <span className="text-[9px] sm:text-[10px] text-[hsl(0_0%_35%)] shrink-0">{activeTools.length} tool{activeTools.length !== 1 ? "s" : ""} active</span>
              </div>

              <div className="relative bg-[hsl(0_0%_9%)] rounded-xl border border-[hsl(0_0%_18%)] focus-within:border-orange-500/40 transition-colors">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask AURA-OMEGA anything..."
                  rows={1}
                  className="w-full bg-transparent text-sm text-white placeholder:text-[hsl(0_0%_35%)] px-3 sm:px-4 py-2.5 sm:py-3 pr-20 sm:pr-24 resize-none max-h-[120px] sm:max-h-[200px]"
                  style={{ minHeight: "44px" }}
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <button className="p-2 rounded-lg text-[hsl(0_0%_40%)] hover:text-white hover:bg-[hsl(0_0%_14%)] transition-colors">
                    <Paperclip size={16} />
                  </button>
                  <button onClick={handleSubmit} disabled={!input.trim() || isThinking} className={cn(
                    "p-2 rounded-lg transition-all",
                    input.trim() && !isThinking ? "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20" : "bg-[hsl(0_0%_14%)] text-[hsl(0_0%_35%)] cursor-not-allowed"
                  )}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
              <p className="text-[9px] sm:text-[10px] text-[hsl(0_0%_30%)] mt-1.5 text-center">AURA-OMEGA can make mistakes. Verify critical information.</p>
            </div>
          </div>
        </div>

        {/* Task Sidebar */}
        <div className={cn(
          "lg:w-[260px] xl:w-[280px] border-l border-[hsl(0_0%_14%)] bg-[hsl(0_0%_5.5%)] flex-col transition-all duration-300 absolute lg:relative right-0 top-0 bottom-0 z-10",
          showTasks ? "flex w-[260px]" : "hidden lg:flex"
        )}>
          <div className="shrink-0 h-10 flex items-center justify-between px-3 border-b border-[hsl(0_0%_14%)]">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-orange-400" />
              <span className="text-xs font-semibold text-white">Active Tasks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[hsl(0_0%_40%)] bg-[hsl(0_0%_12%)] px-1.5 py-0.5 rounded-full">{mockTasks.length}</span>
              <button onClick={() => setShowTasks(false)} className="lg:hidden p-1 rounded text-[hsl(0_0%_40%)] hover:text-white"><PanelRightClose size={14} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
            {mockTasks.map(task => (
              <div key={task.id} className="bg-[hsl(0_0%_8%)] rounded-lg border border-[hsl(0_0%_14%)] p-2.5 hover:border-[hsl(0_0%_20%)] transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-white truncate">{task.title}</span>
                  <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-medium border flex items-center gap-1 shrink-0 ml-1.5", statusColors[task.status])}>
                    {statusIcons[task.status]}
                  </span>
                </div>
                <p className="text-[10px] text-[hsl(0_0%_45%)] line-clamp-2 mb-1.5">{task.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1"><Bot size={10} className="text-[hsl(0_0%_40%)]" /><span className="text-[10px] text-[hsl(0_0%_40%)]">{task.agent}</span></div>
                </div>
              </div>
            ))}
            <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-[hsl(0_0%_20%)] text-[hsl(0_0%_40%)] hover:text-orange-400 hover:border-orange-500/30 hover:bg-orange-500/5 transition-colors text-xs">
              <Plus size={12} /> Add Task
            </button>
          </div>
        </div>

        {showTasks && <div className="fixed inset-0 bg-black/40 z-[5] lg:hidden" onClick={() => setShowTasks(false)} />}
      </div>
    </div>
  );
}
