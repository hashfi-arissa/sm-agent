"use client";

import type { ModelInfo } from "@repo/ai";
import type { Draft } from "@repo/db";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@repo/ui/components/native-select";
import { cn } from "@repo/ui/lib/utils";
import { Lock, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { CodexProblem, type CodexProblemCode } from "../codex-problem";
import { ChatPanel } from "./chat-panel";
import { DocPanel, type DocTab } from "./doc-panel";
import { ensureOk, useDraftChat } from "./use-draft-chat";

/**
 * Drafting workspace: chat with Codex on the left, the draft document on the right.
 * With `draft = null` it's a new draft; the session is created on the first message
 * (or the first save), and the URL switches to /drafts/[id] without a navigation.
 */
export function DraftWorkspace({
  draft,
  models,
  problem,
}: {
  draft: Draft | null;
  models: ModelInfo[];
  /** Codex can't be used right now (not installed, signed out, not responding). */
  problem: { code: CodexProblemCode; message?: string } | null;
}) {
  const router = useRouter();
  const [checking, startCheck] = useTransition();

  // ── Session ────────────────────────────────────────────────────────────────
  const defaultModel = models.find((m) => m.isDefault) ?? models[0];
  const [modelId, setModelId] = useState(
    draft?.session.model ?? defaultModel?.id ?? "",
  );
  const [effort, setEffort] = useState(
    draft?.session.effort ?? defaultModel?.defaultEffort ?? "",
  );
  const [modelError, setModelError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(draft?.session.id ?? null);
  const creatingRef = useRef<Promise<string> | null>(null);

  // ── Document ───────────────────────────────────────────────────────────────
  const [title, setTitle] = useState(draft?.document.title ?? "");
  const [body, setBody] = useState(draft?.document.body ?? "");
  const [persisted, setPersisted] = useState({ title, body });
  const [everSaved, setEverSaved] = useState(draft?.document.saved ?? false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [docTab, setDocTab] = useState<DocTab>("write");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const cursorRef = useRef<number | null>(null);
  const dirty = title.trim() !== persisted.title || body !== persisted.body;
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const [pane, setPane] = useState<"chat" | "doc">("chat");

  async function ensureSession(firstMessage?: string): Promise<string> {
    if (sessionRef.current) return sessionRef.current;
    creatingRef.current ??= (async () => {
      const docTitle = title.trim() || deriveTitle(firstMessage ?? "");
      const res = await ensureOk(
        await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelId,
            effort,
            title: docTitle,
            body,
          }),
        }),
      );
      const { id } = (await res.json()) as { id: string };
      sessionRef.current = id;
      if (!title.trim()) setTitle(docTitle);
      setPersisted({ title: docTitle, body });
      window.history.replaceState(null, "", `/drafts/${id}`);
      document.title = `${docTitle || "Untitled draft"} · Social Media Agent`;
      return id;
    })().finally(() => {
      creatingRef.current = null;
    });
    return creatingRef.current;
  }

  const chat = useDraftChat({
    initialMessages: draft?.messages ?? [],
    ensureSession,
  });
  const locked =
    chat.busy ||
    chat.messages.some((m) => !m.pending) ||
    !!draft?.session.codexThreadId;

  async function changeModel(nextModel: string, nextEffort: string) {
    const previous = { modelId, effort };
    setModelId(nextModel);
    setEffort(nextEffort);
    setModelError(null);
    const id = sessionRef.current;
    if (!id) return;
    try {
      await ensureOk(
        await fetch(`/api/drafts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: nextModel, effort: nextEffort }),
        }),
      );
    } catch (error) {
      setModelId(previous.modelId);
      setEffort(previous.effort);
      setModelError(error instanceof Error ? error.message : String(error));
    }
  }

  async function save(): Promise<boolean> {
    if (saving) return true;
    setSaving(true);
    setSaveError(null);
    const snapshot = { title: title.trim(), body };
    try {
      const id = await ensureSession();
      await ensureOk(
        await fetch(`/api/drafts/${id}/document`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        }),
      );
      setPersisted(snapshot);
      setEverSaved(true);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Saves the draft if needed, then asks Codex to structure it into a Content item. */
  async function convert() {
    if (converting) return;
    setConverting(true);
    setConvertError(null);
    try {
      if (dirty || !sessionRef.current) {
        const ok = await save();
        if (!ok) throw new Error("Save the draft before converting it");
      }
      const id = sessionRef.current;
      if (!id) throw new Error("Save the draft before converting it");
      const res = await ensureOk(
        await fetch(`/api/drafts/${id}/convert`, { method: "POST" }),
      );
      const { id: contentId } = (await res.json()) as { id: string };
      router.push(`/contents/${contentId}`);
    } catch (error) {
      setConvertError(error instanceof Error ? error.message : String(error));
    } finally {
      setConverting(false);
    }
  }

  function insertIntoDoc(text: string) {
    const at = Math.min(cursorRef.current ?? body.length, body.length);
    const before = body.slice(0, at);
    const after = body.slice(at);
    const lead =
      !before || before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
    const trail = !after || after.startsWith("\n") ? "" : "\n\n";
    const inserted = `${before}${lead}${text.trim()}`;
    setBody(`${inserted}${trail}${after}`);
    cursorRef.current = inserted.length;
    setDocTab("write");
    setPane("doc");
    // Show where the text landed once the textarea has the new value.
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(inserted.length, inserted.length);
    });
  }

  // Warn before closing the tab with unsaved document changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const model = models.find((m) => m.id === modelId);
  const setup = locked ? (
    <p
      className="text-muted-foreground flex items-center gap-1.5 text-sm"
      title="Model and effort are locked once the chat has started"
    >
      <Lock className="size-3.5" aria-hidden />
      <span className="text-foreground font-medium">
        {model?.displayName ?? modelId}
      </span>
      · {effort} effort
      <span className="sr-only">(locked for this chat)</span>
    </p>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="draft-model">Model</Label>
          <NativeSelect
            id="draft-model"
            className="w-full"
            value={modelId}
            disabled={models.length === 0}
            onChange={(e) => {
              const next = models.find((m) => m.id === e.target.value);
              if (next) void changeModel(next.id, next.defaultEffort);
            }}
          >
            {models.map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="draft-effort">Effort</Label>
          <NativeSelect
            id="draft-effort"
            className="w-full"
            value={effort}
            disabled={!model}
            onChange={(e) => void changeModel(modelId, e.target.value)}
          >
            {model?.efforts.map((e) => (
              <NativeSelectOption key={e.value} value={e.value}>
                {e.value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {modelError ??
          model?.efforts.find((e) => e.value === effort)?.description ??
          "Both lock once you send the first message."}
      </p>
    </div>
  );

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      {problem && (
        <div className="border-b p-3">
          <CodexProblem
            code={problem.code}
            message={problem.message}
            action={
              <Button
                variant="outline"
                size="xs"
                disabled={checking}
                onClick={() => startCheck(() => router.refresh())}
              >
                <RefreshCw
                  className={checking ? "animate-spin" : undefined}
                  data-icon="inline-start"
                />
                Check again
              </Button>
            }
          />
        </div>
      )}

      <div className="flex gap-1 border-b p-2 lg:hidden" role="tablist">
        {(["chat", "doc"] as const).map((p) => (
          <Button
            key={p}
            role="tab"
            aria-selected={pane === p}
            variant={pane === p ? "secondary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => setPane(p)}
          >
            {p === "chat" ? "Chat" : `Document${dirty ? " •" : ""}`}
          </Button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2 lg:divide-x">
        <div
          className={cn(
            "min-h-0 flex-col",
            pane === "chat" ? "flex" : "hidden",
            "lg:flex",
          )}
        >
          <ChatPanel
            setup={setup}
            messages={chat.messages}
            reply={chat.reply}
            busy={chat.busy}
            problem={chat.problem}
            blocked={!!problem || models.length === 0}
            onDismissProblem={chat.dismissProblem}
            onSend={chat.send}
            onStop={chat.stop}
            onRegenerate={() => {
              if (sessionRef.current) void chat.regenerate(sessionRef.current);
            }}
            onInsert={insertIntoDoc}
          />
        </div>
        <div
          className={cn(
            "min-h-0 flex-col",
            pane === "doc" ? "flex" : "hidden",
            "lg:flex",
          )}
        >
          <DocPanel
            title={title}
            body={body}
            tab={docTab}
            dirty={dirty}
            saving={saving}
            everSaved={everSaved}
            saveError={saveError}
            converting={converting}
            convertError={convertError}
            bodyRef={bodyRef}
            onTitleChange={setTitle}
            onBodyChange={setBody}
            onTabChange={setDocTab}
            onCursorChange={(position) => (cursorRef.current = position)}
            onSave={() => void save()}
            onConvert={() => void convert()}
          />
        </div>
      </div>
    </div>
  );
}

/** First line of the first message, as a short plain-text title. */
function deriveTitle(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.replace(/[#>*_`]/g, "").trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}
