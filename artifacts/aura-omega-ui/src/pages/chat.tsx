import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Send, Loader2, Menu, MessageSquarePlus, ChevronDown, Sparkles, Scan, PenTool, Hash, Share2, User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatThread {
  id: number;
  title: string;
  createdAt: string;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [activeThread, setActiveThread] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: threads } = useQuery<ChatThread[]>({
    queryKey: ["/api/chat/threads"],
    enabled: !!user,
  });

  const { data: messages } = useQuery<Message[]>({
    queryKey: [`/api/chat/threads/${activeThread}/messages`],
    enabled: !!activeThread,
  });

  const createThreadMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/chat/threads", { title });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveThread(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/threads"] });
      toast({ title: "New thread created", description: data.title });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!activeThread) {
        const thread = await createThreadMutation.mutateAsync(content.slice(0, 50));
        setActiveThread(thread.id);
      }
      const res = await apiRequest("POST", `/api/chat/threads/${activeThread}/messages`, {
        content,
        role: "user",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chat/threads/${activeThread}/messages`] });
      setIsThinking(true);
      setTimeout(() => setIsThinking(false), 2000);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const content = input;
    setInput("");
    await sendMessageMutation.mutateAsync(content);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  return (
    <div className="flex h-full bg-[#0d0d0d]">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-white font-medium text-sm">
                {activeThread 
                  ? threads?.find(t => t.id === activeThread)?.title || "Chat" 
                  : "New Chat"}
              </h1>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </div>
          </div>
          <button 
            onClick={() => createThreadMutation.mutate("New Chat")}
            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!messages?.length && !isThinking ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-orange-500" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">What can I help you with?</h2>
              <p className="text-gray-500 text-sm max-w-md">
                Start a conversation or create a new task. I can help with research, coding, analysis, and more.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 space-y-6">
              {messages?.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-4",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3",
                      message.role === "user"
                        ? "bg-gray-800 text-white"
                        : "text-gray-200"
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0 mt-1 border border-white/10">
                      <User className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </div>
              ))}

              {/* Thinking Indicator */}
              {isThinking && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-white/5">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl flex items-center gap-2 px-4 py-3 focus-within:border-orange-500/50 transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm focus:outline-none"
                />
                <div className="flex items-center gap-1">
                  <button type="button" className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <Scan className="w-4 h-4" />
                  </button>
                  <button type="button" className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <PenTool className="w-4 h-4" />
                  </button>
                  <button type="button" className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <Hash className="w-4 h-4" />
                  </button>
                  <button type="button" className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="submit"
                    disabled={!input.trim() || sendMessageMutation.isPending}
                    className="p-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white transition-colors"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </form>
            <p className="text-xs text-gray-600 mt-2 text-center">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
