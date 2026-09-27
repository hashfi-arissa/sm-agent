"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";
import {
  Check,
  Copy,
  CornerDownLeft,
  FilePlus2,
  LoaderCircle,
  RefreshCw,
  Send,
  Square,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { CodexProblem } from "../codex-problem";
import { Markdown } from "../markdown";
import type { ChatProblem, UiMessage } from "./use-draft-chat";

const STARTERS = [
  "Give me 5 scroll-stopping hooks for a Reel about ",
  "Turn this idea into a 30-second Reel script: ",
  "Write a caption and 10 hashtags for a Reel about ",
];

export function ChatPanel({
  setup,
  messages,
  reply,
  busy,
  problem,
  blocked,
  onDismissProblem,
  onSend,
  onStop,
  onRegenerate,
  onInsert,
}: {
  /** Model + effort pickers (or their locked values). */
  setup: ReactNode;
  messages: UiMessage[];
  /** The reply being streamed, or null when idle. */
  reply: string | null;
  busy: boolean;
  problem: ChatProblem | null;
  /** Codex can't be used right now; explained elsewhere on the page. */
  blocked: boolean;
  onDismissProblem: () => void;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  onRegenerate: () => void;
  onInsert: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const last = messages.at(-1);
  const lastAssistant = last?.role === "assistant" ? last : null;
  const awaitingReply = !busy && last?.role === "user" && !last.pending;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, reply, problem]);

  async function submit() {
    const text = draft.trim();
    if (!text || busy || blocked) return;
    setDraft("");
    stickToBottom.current = true;
    const sent = await onSend(text);
    if (!sent) setDraft((current) => current || text);
  }

  return (
    <section
      aria-label="Chat"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="border-b px-4 py-3">{setup}</div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && reply === null ? (
          <div className="text-muted-foreground mx-auto flex max-w-md flex-col gap-3 py-10 text-center text-sm">
            <p>
              Tell Codex what your Reel is about. Replies you like can go
              straight into the draft document.
            </p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((starter) => (
                <Button
                  key={starter}
                  variant="outline"
                  size="sm"
                  className="h-auto justify-start py-1.5 text-left whitespace-normal"
                  disabled={blocked}
                  onClick={() => {
                    setDraft(starter);
                    inputRef.current?.focus();
                  }}
                >
                  {starter}…
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4" aria-live="polite">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <div
                    className={cn(
                      "bg-muted max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap",
                      m.pending && "opacity-70",
                    )}
                  >
                    {m.text}
                  </div>
                </li>
              ) : (
                <li key={m.id} className="flex flex-col gap-1.5">
                  <Markdown>{m.text}</Markdown>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-1">
                    {m.interrupted && (
                      <Badge variant="outline" className="mr-1">
                        Stopped
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => onInsert(m.text)}
                    >
                      <FilePlus2 data-icon="inline-start" />
                      Insert into doc
                    </Button>
                    <CopyButton text={m.text} />
                    {m === lastAssistant && !busy && !blocked && (
                      <Button variant="ghost" size="xs" onClick={onRegenerate}>
                        <RefreshCw data-icon="inline-start" />
                        Regenerate
                      </Button>
                    )}
                  </div>
                </li>
              ),
            )}
            {reply !== null && (
              <li className="flex flex-col gap-1.5">
                {reply ? (
                  <Markdown>{reply}</Markdown>
                ) : (
                  <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Thinking…
                  </span>
                )}
              </li>
            )}
            {awaitingReply && !problem && (
              <li className="text-muted-foreground flex items-center gap-2 text-sm">
                No reply to this message.
                {!blocked && (
                  <Button variant="outline" size="xs" onClick={onRegenerate}>
                    <RefreshCw data-icon="inline-start" />
                    Retry
                  </Button>
                )}
              </li>
            )}
          </ol>
        )}
        {problem && (
          <div className="mt-4">
            <CodexProblem
              code={problem.code}
              message={problem.message}
              action={
                <>
                  {awaitingReply && problem.code !== "context_full" && (
                    <Button variant="outline" size="xs" onClick={onRegenerate}>
                      <RefreshCw data-icon="inline-start" />
                      Retry
                    </Button>
                  )}
                  <Button variant="ghost" size="xs" onClick={onDismissProblem}>
                    Dismiss
                  </Button>
                </>
              }
            />
          </div>
        )}
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="bg-background focus-within:ring-ring/50 flex flex-col gap-2 rounded-xl border p-2 focus-within:ring-3">
          <Textarea
            ref={inputRef}
            aria-label="Message"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={
              blocked ? "Connect Codex to start drafting" : "Message Codex…"
            }
            disabled={blocked}
            className="max-h-48 min-h-10 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:inline-flex">
              <CornerDownLeft className="size-3" aria-hidden />
              Enter to send · Shift+Enter for a new line
            </span>
            {/* Distinct keys: Stop must not turn into the submit button mid-click. */}
            {busy ? (
              <Button
                key="stop"
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={onStop}
              >
                <Square data-icon="inline-start" />
                Stop
              </Button>
            ) : (
              <Button
                key="send"
                type="submit"
                size="sm"
                className="ml-auto"
                disabled={!draft.trim() || blocked}
              >
                <Send data-icon="inline-start" />
                Send
              </Button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? (
        <Check data-icon="inline-start" />
      ) : (
        <Copy data-icon="inline-start" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
