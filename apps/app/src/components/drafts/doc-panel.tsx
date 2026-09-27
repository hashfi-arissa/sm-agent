"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { LoaderCircle, Save } from "lucide-react";
import type { RefObject } from "react";

import { Markdown } from "../markdown";

export type DocTab = "write" | "preview";

export function DocPanel({
  title,
  body,
  tab,
  dirty,
  saving,
  everSaved,
  saveError,
  bodyRef,
  onTitleChange,
  onBodyChange,
  onTabChange,
  onCursorChange,
  onSave,
}: {
  title: string;
  body: string;
  tab: DocTab;
  dirty: boolean;
  saving: boolean;
  /** The document has been saved at least once. */
  everSaved: boolean;
  saveError: string | null;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  onTabChange: (tab: DocTab) => void;
  /** Remembers where "Insert into doc" should put text. */
  onCursorChange: (position: number) => void;
  onSave: () => void;
}) {
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
    <section
      aria-label="Draft document"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSave();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Input
          aria-label="Draft title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled draft"
          maxLength={200}
          className="hover:border-input h-8 flex-1 border-transparent px-1.5 text-base font-medium shadow-none"
        />
        <span
          role="status"
          className={
            saveError
              ? "text-destructive shrink-0 text-xs"
              : "text-muted-foreground shrink-0 text-xs"
          }
        >
          {status}
        </span>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || (!dirty && everSaved)}
        >
          {saving ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          Save draft
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as DocTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="write" className="flex min-h-0 flex-col p-4 pt-3">
          <Textarea
            ref={bodyRef}
            aria-label="Draft body (Markdown)"
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onSelect={(e) => onCursorChange(e.currentTarget.selectionEnd)}
            placeholder={
              "Write your Reel here in Markdown, or insert Codex replies from the chat.\n\n## Hook\n## Beats\n## CTA\n## Caption"
            }
            className="[field-sizing:fixed] min-h-0 flex-1 resize-none font-mono text-sm leading-relaxed"
          />
        </TabsContent>
        <TabsContent
          value="preview"
          className="min-h-0 overflow-y-auto p-4 pt-3"
        >
          {body.trim() ? (
            <Markdown>{body}</Markdown>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nothing to preview yet.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
