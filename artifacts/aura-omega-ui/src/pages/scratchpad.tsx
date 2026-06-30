import { useEffect, useRef, useState } from "react";
import { resolveApiUrl } from "@workspace/api-client-react";
import { StickyNote, Save, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ScratchpadPage() {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(resolveApiUrl("/api/scratchpad"))
      .then((r) => r.json())
      .then((d) => { setContent(d.content ?? ""); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async (text: string) => {
    setStatus("saving");
    try {
      await fetch(resolveApiUrl("/api/scratchpad"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("idle");
    }
  };

  const handleChange = (val: string) => {
    setContent(val);
    setStatus("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val), 1200);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StickyNote className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-xl font-black">Scratchpad</h1>
              <p className="text-xs text-muted-foreground">
                Pinned context — ABBY reads this on every message. Brief it once, forget the repeat.
              </p>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium transition-all",
            status === "saved" ? "text-emerald-400" : "text-muted-foreground/50",
          )}>
            {status === "saving" && <Save className="w-3.5 h-3.5 animate-pulse" />}
            {status === "saved" && <CheckCircle2 className="w-3.5 h-3.5" />}
            {status === "saving" && "Saving…"}
            {status === "saved" && "Saved"}
          </div>
        </div>

        <div className="rounded-2xl border border-card-border bg-card/50 overflow-hidden">
          {loaded ? (
            <textarea
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={`Paste anything ABBY should always know:\n\n• Client name + brief\n• Campaign goals\n• URLs to monitor\n• Standing instructions\n• Recurring context`}
              className="w-full min-h-[60vh] resize-none bg-transparent p-5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 font-mono leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground/40 text-sm">
              Loading…
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/50 text-center">
          Auto-saves as you type · Stored in Postgres · Injected into every ABBY system prompt
        </p>
      </div>
    </div>
  );
}
