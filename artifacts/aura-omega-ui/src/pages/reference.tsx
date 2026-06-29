import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ExternalLink, Search, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeSource { name: string; url: string; }
interface KnowledgeCategory { id: string; name: string; sources: KnowledgeSource[]; }
interface ReferenceResponse { query: string | null; categories: KnowledgeCategory[]; total: number; }

const PRIORITY_LABELS = [
  "Official language/framework documentation",
  "Language specifications (ECMAScript, C++ ISO, Python PEPs, RFCs)",
  "Official books (Rust Book, Pro Git, OSTEP, CS:APP)",
  "University course material (MIT OCW, Stanford, Harvard CS50)",
  "Standards bodies (IETF, W3C, IEEE, ISO, WHATWG)",
  "High-quality open-source repos (Linux kernel, CPython, LLVM, PostgreSQL)",
];

function CategoryCard({ category, highlight }: { category: KnowledgeCategory; highlight: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
        <span className="text-xs font-semibold text-foreground tracking-wide">{category.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{category.sources.length}</span>
      </div>
      <ul className="space-y-1.5">
        {category.sources.map((src) => {
          const nameMatch = highlight && src.name.toLowerCase().includes(highlight.toLowerCase());
          return (
            <li key={src.url}>
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  "text-muted-foreground hover:bg-primary/8 hover:text-foreground",
                  nameMatch && "bg-primary/8 text-foreground",
                )}
              >
                <span className="truncate">{src.name}</span>
                <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ReferencePage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<ReferenceResponse>({
    queryKey: ["reference"],
    queryFn: () => fetch("/api/reference").then((r) => r.json()),
    staleTime: Infinity,
  });

  const filtered = useMemo(() => {
    if (!data?.categories) return [];
    if (!search.trim()) return data.categories;
    const q = search.toLowerCase();
    return data.categories
      .map((cat) => {
        const catMatch = cat.name.toLowerCase().includes(q) || cat.id.includes(q);
        const sources = catMatch
          ? cat.sources
          : cat.sources.filter((s) => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
        return sources.length ? { ...cat, sources } : null;
      })
      .filter(Boolean) as KnowledgeCategory[];
  }, [data, search]);

  const totalSources = filtered.reduce((n, c) => n + c.sources.length, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="max-w-6xl w-full mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Reference Library</h1>
              <p className="text-xs text-muted-foreground">Authoritative primary sources — agents consult these before answering technical questions</p>
            </div>
          </div>
        </div>

        {/* Priority order */}
        <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Source Priority Order</p>
          <ol className="space-y-1">
            {PRIORITY_LABELS.map((label, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <span className="shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search categories or sources (react, postgresql, security…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {isLoading ? (
            <span>Loading…</span>
          ) : (
            <>
              <span>{filtered.length} categories</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
              <span>{totalSources} sources</span>
              {search && <span className="text-primary">— filtered by "{search}"</span>}
            </>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/40 p-4 h-32 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No sources match "{search}"
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((cat) => (
              <CategoryCard key={cat.id} category={cat} highlight={search} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
