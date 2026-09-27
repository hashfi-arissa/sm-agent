"use client";

import type { ChatEvent, ModelInfo } from "@repo/ai";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@repo/ui/components/native-select";
import { Textarea } from "@repo/ui/components/textarea";
import { CircleAlert, LoaderCircle, Send, Square } from "lucide-react";
import { useRef, useState } from "react";

import { readNdjson } from "@/lib/ndjson";

type RunState = "idle" | "streaming" | "done" | "stopped" | "error";

export function TestPrompt({ models }: { models: ModelInfo[] }) {
  const initial = models.find((m) => m.isDefault) ?? models[0]!;
  const [modelId, setModelId] = useState(initial.id);
  const [effort, setEffort] = useState(initial.defaultEffort);
  const [prompt, setPrompt] = useState(
    "Give me 3 scroll-stopping hooks for a Reel about building a morning routine.",
  );
  const [output, setOutput] = useState("");
  const [state, setState] = useState<RunState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const model = models.find((m) => m.id === modelId) ?? initial;
  const streaming = state === "streaming";

  function changeModel(id: string) {
    const next = models.find((m) => m.id === id);
    if (!next) return;
    setModelId(next.id);
    setEffort(next.defaultEffort);
  }

  async function send() {
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();
    setOutput("");
    setError(null);
    setElapsed(null);
    setState("streaming");

    try {
      const res = await fetch("/api/codex/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id, effort, prompt }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      let finalState: RunState = "done";
      for await (const event of readNdjson<ChatEvent>(res.body)) {
        if (event.type === "started") continue;
        if (event.type === "delta") setOutput((prev) => prev + event.text);
        else if (event.type === "done") {
          if (event.text) setOutput(event.text);
          finalState = event.interrupted ? "stopped" : "done";
        } else {
          setError(event.message);
          finalState = "error";
        }
      }
      setState(finalState);
    } catch (err) {
      if (controller.signal.aborted) {
        setState("stopped");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    } finally {
      setElapsed(performance.now() - started);
      abortRef.current = null;
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!streaming) void send();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="test-model">Model</Label>
          <NativeSelect
            id="test-model"
            className="w-full"
            value={model.id}
            onChange={(e) => changeModel(e.target.value)}
            disabled={streaming}
          >
            {models.map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="test-effort">Effort</Label>
          <NativeSelect
            id="test-effort"
            className="w-full"
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            disabled={streaming}
          >
            {model.efforts.map((e) => (
              <NativeSelectOption key={e.value} value={e.value}>
                {e.value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="test-prompt">Prompt</Label>
        <Textarea
          id="test-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={streaming}
        />
      </div>

      <div className="flex items-center gap-3">
        {/* Distinct keys: Stop must not become the Send submit button mid-click,
            or the browser submits the form again after the abort re-renders it. */}
        {streaming ? (
          <Button
            key="stop"
            type="button"
            variant="outline"
            onClick={() => abortRef.current?.abort()}
          >
            <Square data-icon="inline-start" />
            Stop
          </Button>
        ) : (
          <Button key="send" type="submit" disabled={!prompt.trim()}>
            <Send data-icon="inline-start" />
            Send
          </Button>
        )}
        <span className="text-muted-foreground text-xs" role="status">
          {streaming && (
            <span className="inline-flex items-center gap-1.5">
              <LoaderCircle className="size-3 animate-spin" aria-hidden />
              {output ? "Writing…" : "Thinking…"}
            </span>
          )}
          {!streaming && elapsed !== null && (
            <>
              {state === "stopped"
                ? "Stopped"
                : state === "error"
                  ? "Failed"
                  : "Done"}{" "}
              in {(elapsed / 1000).toFixed(1)}s
            </>
          )}
        </span>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(output || streaming) && (
        <div
          className="bg-muted/40 min-h-24 rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap"
          aria-live="polite"
        >
          {output}
        </div>
      )}
    </form>
  );
}
