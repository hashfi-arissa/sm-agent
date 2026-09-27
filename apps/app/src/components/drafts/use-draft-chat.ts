"use client";

import type { Draft } from "@repo/db";
import type { ChatMessage } from "@repo/types";
import { useRef, useState } from "react";

import type { ApiError } from "@/lib/api";
import type { DraftStreamEvent } from "@/lib/draft-events";
import { readNdjson } from "@/lib/ndjson";

import type { CodexProblemCode } from "../codex-problem";

export type UiMessage = Pick<
  ChatMessage,
  "id" | "role" | "text" | "interrupted"
> & {
  /** Optimistic: not confirmed by the server yet. */
  pending?: boolean;
};

export interface ChatProblem {
  code: CodexProblemCode;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: CodexProblemCode = "other",
  ) {
    super(message);
  }
}

/** Throws ApiRequestError for non-2xx responses. */
export async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  const data = (await res.json().catch(() => ({}))) as Partial<ApiError>;
  throw new ApiRequestError(
    data.error ?? `Request failed (${res.status})`,
    data.code ?? "other",
  );
}

export function toProblem(error: unknown): ChatProblem {
  if (error instanceof ApiRequestError)
    return { code: error.code, message: error.message };
  return {
    code: "other",
    message: error instanceof Error ? error.message : String(error),
  };
}

const tempId = () => `tmp-${crypto.randomUUID()}`;

/**
 * Chat state for a draft: sending, streaming, stopping and regenerating replies.
 * `ensureSession` creates the draft on the first message and returns its id.
 */
export function useDraftChat({
  initialMessages,
  ensureSession,
}: {
  initialMessages: ChatMessage[];
  ensureSession: (firstMessage: string) => Promise<string>;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [reply, setReply] = useState<string | null>(null);
  const [problem, setProblem] = useState<ChatProblem | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = reply !== null;

  /** Reloads the chat from the server after something went wrong mid-way. */
  async function resync(id: string) {
    const res = await fetch(`/api/drafts/${id}`).catch(() => null);
    if (!res?.ok) return;
    const draft = (await res.json()) as Draft;
    setMessages(draft.messages);
  }

  async function stream(
    id: string,
    url: string,
    body: unknown,
    optimisticUserId?: string,
  ): Promise<{ userSaved: boolean }> {
    const controller = new AbortController();
    abortRef.current = controller;
    setReply("");
    let partial = "";
    let failed = false;
    let userSaved = false;

    try {
      const res = await ensureOk(
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        }),
      );
      for await (const event of readNdjson<DraftStreamEvent>(res.body!)) {
        switch (event.type) {
          case "message": {
            const saved = event.message;
            if (saved.role === "user") {
              userSaved = true;
              setMessages((prev) =>
                prev.map((m) => (m.id === optimisticUserId ? saved : m)),
              );
            } else {
              partial = "";
              setReply(null);
              setMessages((prev) => [...prev, saved]);
            }
            break;
          }
          case "delta":
            partial += event.text;
            setReply(partial);
            break;
          case "error":
            failed = true;
            setProblem({ code: event.code, message: event.message });
            break;
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // The server keeps the partial reply too (flagged interrupted).
        if (partial.trim()) {
          const text = partial;
          setMessages((prev) => [
            ...prev,
            { id: tempId(), role: "assistant", text, interrupted: true },
          ]);
        }
      } else {
        failed = true;
        setProblem(toProblem(error));
      }
    } finally {
      abortRef.current = null;
      setReply(null);
    }
    if (failed) await resync(id);
    return { userSaved };
  }

  /** Returns false (and keeps the text for the composer) if the message couldn't be sent. */
  async function send(text: string): Promise<boolean> {
    setProblem(null);
    const optimistic: UiMessage = {
      id: tempId(),
      role: "user",
      text,
      interrupted: false,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    let id: string;
    try {
      id = await ensureSession(text);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setProblem(toProblem(error));
      return false;
    }
    const { userSaved } = await stream(
      id,
      `/api/drafts/${id}/messages`,
      { text },
      optimistic.id,
    );
    if (!userSaved) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
    return userSaved;
  }

  /** Answers the last user message again, replacing the reply that followed it. */
  async function regenerate(id: string) {
    setProblem(null);
    setMessages((prev) => {
      const lastUser = prev.findLastIndex((m) => m.role === "user");
      return prev.slice(0, lastUser + 1);
    });
    await stream(id, `/api/drafts/${id}/regenerate`, undefined);
  }

  function stop() {
    abortRef.current?.abort();
  }

  return {
    messages,
    reply,
    busy,
    problem,
    dismissProblem: () => setProblem(null),
    send,
    regenerate,
    stop,
  };
}
