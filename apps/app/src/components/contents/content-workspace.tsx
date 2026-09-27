"use client";

import type { Content } from "@repo/types";
import { REEL_LENGTHS, type Beat, type ReelLength } from "@repo/types";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@repo/ui/components/native-select";
import { Textarea } from "@repo/ui/components/textarea";
import { Copy, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiRequestError, ensureOk } from "@/lib/fetch-client";

import { BeatsEditor } from "./beats-editor";

interface Fields {
  topic: string;
  hook: string;
  beats: Beat[];
  cta: string;
  caption: string;
  hashtags: string[];
  targetLength: ReelLength;
}

function fieldsOf(content: Content | null): Fields {
  return {
    topic: content?.topic ?? "",
    hook: content?.hook ?? "",
    beats: content?.beats ?? [],
    cta: content?.cta ?? "",
    caption: content?.caption ?? "",
    hashtags: content?.hashtags ?? [],
    targetLength: content?.targetLength ?? 30,
  };
}

function parseHashtags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const tag = raw.replace(/^#/, "").trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

/**
 * Content editor: topic, hook, beats, CTA, target length, caption and hashtags. With
 * `content = null` it's a new item — the row is created on first Save and the URL
 * switches to /contents/[id] in place, mirroring the drafting workspace.
 */
export function ContentWorkspace({
  content,
  sourceDraftHref,
}: {
  content: Content | null;
  /** Link back to the draft session this content was converted from, if any. */
  sourceDraftHref: string | null;
}) {
  const router = useRouter();
  const initial = fieldsOf(content);

  const [topic, setTopic] = useState(initial.topic);
  const [hook, setHook] = useState(initial.hook);
  const [beats, setBeats] = useState(initial.beats);
  const [cta, setCta] = useState(initial.cta);
  const [caption, setCaption] = useState(initial.caption);
  const [hashtagsText, setHashtagsText] = useState(
    initial.hashtags.map((t) => `#${t}`).join(" "),
  );
  const [targetLength, setTargetLength] = useState(initial.targetLength);

  const [persisted, setPersisted] = useState(initial);
  const [everSaved, setEverSaved] = useState(content?.status === "saved");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const contentIdRef = useRef<string | null>(content?.id ?? null);
  const creatingRef = useRef<Promise<string> | null>(null);
  const [hasId, setHasId] = useState(!!content);

  const current: Fields = {
    topic,
    hook,
    beats,
    cta,
    caption,
    hashtags: parseHashtags(hashtagsText),
    targetLength,
  };
  const dirty = JSON.stringify(current) !== JSON.stringify(persisted);

  async function ensureContent(): Promise<string> {
    if (contentIdRef.current) return contentIdRef.current;
    creatingRef.current ??= (async () => {
      const res = await ensureOk(
        await fetch("/api/contents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceDraftId: content?.sourceDraftId ?? null,
            ...current,
          }),
        }),
      );
      const { id } = (await res.json()) as { id: string };
      contentIdRef.current = id;
      setHasId(true);
      window.history.replaceState(null, "", `/contents/${id}`);
      document.title = `${topic || "Untitled content"} · Social Media Agent`;
      return id;
    })().finally(() => {
      creatingRef.current = null;
    });
    return creatingRef.current;
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const snapshot = { ...current, topic: current.topic.trim() };
    try {
      const id = await ensureContent();
      await ensureOk(
        await fetch(`/api/contents/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        }),
      );
      setPersisted(snapshot);
      setEverSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof ApiRequestError ? error.message : String(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (duplicating || !contentIdRef.current) return;
    setDuplicating(true);
    setDuplicateError(null);
    try {
      const res = await ensureOk(
        await fetch(`/api/contents/${contentIdRef.current}/duplicate`, {
          method: "POST",
        }),
      );
      const { id } = (await res.json()) as { id: string };
      router.push(`/contents/${id}`);
    } catch (error) {
      setDuplicateError(
        error instanceof ApiRequestError ? error.message : String(error),
      );
      setDuplicating(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const status = saving
    ? "Saving…"
    : saveError
      ? saveError
      : dirty
        ? "Unsaved changes"
        : everSaved
          ? "Saved"
          : "Not saved yet";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {content ? "Edit content" : "New content"}
          </h1>
          {sourceDraftHref && (
            <Link
              href={sourceDraftHref}
              className="text-muted-foreground hover:text-foreground w-fit text-sm underline underline-offset-2"
            >
              Open source draft
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            role="status"
            className={
              saveError
                ? "text-destructive text-xs"
                : "text-muted-foreground text-xs"
            }
          >
            {status}
          </span>
          {hasId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void duplicate()}
              disabled={duplicating}
            >
              {duplicating ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              Duplicate
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving || (!dirty && everSaved)}
          >
            {saving ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            Save
          </Button>
        </div>
      </header>
      {duplicateError && (
        <p className="text-destructive text-sm">{duplicateError}</p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="content-topic">Topic</Label>
        <Input
          id="content-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What's this Reel about?"
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content-hook">Hook (first 3s)</Label>
        <Textarea
          id="content-hook"
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          placeholder="The scroll-stopping opening line…"
          className="min-h-16"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Beats</Label>
        <BeatsEditor beats={beats} onChange={setBeats} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content-cta">Call to action</Label>
        <Textarea
          id="content-cta"
          value={cta}
          onChange={(e) => setCta(e.target.value)}
          className="min-h-16"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content-length">Target length</Label>
        <NativeSelect
          id="content-length"
          className="w-fit"
          value={targetLength}
          onChange={(e) => setTargetLength(Number(e.target.value) as ReelLength)}
        >
          {REEL_LENGTHS.map((n) => (
            <NativeSelectOption key={n} value={n}>
              {n}s
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content-caption">Caption</Label>
        <Textarea
          id="content-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="min-h-24"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content-hashtags">Hashtags</Label>
        <Input
          id="content-hashtags"
          value={hashtagsText}
          onChange={(e) => setHashtagsText(e.target.value)}
          placeholder="#reels #contentcreator"
        />
        <p className="text-muted-foreground text-xs">
          Separate with spaces or commas.
        </p>
      </div>
    </main>
  );
}
