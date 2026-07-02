import { useCallback, useRef, useState } from "react";
import { resolveApiUrl } from "@workspace/api-client-react";

export interface AiStreamState {
  streaming: boolean;
  tokens: string;
  agentName: string | null;
  agentId: number | null;
  model: string | null;
  error: string | null;
}

export function useAiStream(onComplete?: (agentId: number | null) => void) {
  const [state, setState] = useState<AiStreamState>({
    streaming: false,
    tokens: "",
    agentName: null,
    agentId: null,
    model: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (opts: {
    message: string;
    agentId?: number | null;
    channelId: number;
    model?: string;
    attachmentIds?: number[];
    mode?: string;
  }): Promise<{ text: string; error: string | null; agentName: string | null }> => {
    // Cancel any in-flight stream
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setState({ streaming: true, tokens: "", agentName: null, agentId: opts.agentId ?? null, model: null, error: null });

    // Accumulate locally too: the caller awaits send() and needs the final text
    // immediately. Reading `state.tokens` from the caller's closure right after
    // await returns the stale (empty) value, so we return the result directly.
    let full = "";
    let agentName: string | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(resolveApiUrl("/api/ai/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          message: opts.message,
          agentId: opts.agentId ?? undefined,
          channelId: opts.channelId,
          model: opts.model,
          attachmentIds: opts.attachmentIds?.length ? opts.attachmentIds : undefined,
          mode: opts.mode,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setState(s => ({ ...s, streaming: false, error: errText }));
        return { text: "", error: errText || `Request failed (${res.status})`, agentName: null };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            // The server may emit a token as a JSON number (e.g. 0, 51), so
            // guard on presence, not truthiness — `if (parsed.token)` would
            // silently drop a token that is exactly the number 0.
            if (parsed.token !== undefined && parsed.token !== null) {
              const tok = String(parsed.token);
              full += tok;
              setState(s => ({ ...s, tokens: s.tokens + tok }));
            }
            if (parsed.done) {
              agentName = parsed.agentName ?? agentName;
              setState(s => ({
                ...s,
                streaming: false,
                agentName: parsed.agentName ?? s.agentName,
                agentId: parsed.agentId ?? s.agentId,
                model: parsed.model ?? s.model,
              }));
              onComplete?.(parsed.agentId ?? null);
            }
            if (parsed.error) {
              error = parsed.error;
              setState(s => ({ ...s, streaming: false, error: parsed.error }));
            }
          } catch {
            // skip
          }
        }
      }
      setState(s => ({ ...s, streaming: false }));
      return { text: full, error, agentName };
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return { text: full, error: null, agentName };
      const msg = String(err);
      setState(s => ({ ...s, streaming: false, error: msg }));
      return { text: full, error: msg, agentName };
    }
  }, [onComplete]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(s => ({ ...s, streaming: false }));
  }, []);

  const clear = useCallback(() => {
    setState({ streaming: false, tokens: "", agentName: null, agentId: null, model: null, error: null });
  }, []);

  return { ...state, send, cancel, clear };
}
