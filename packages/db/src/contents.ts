// Queries for saved Reel content: the library list, the editor and its lifecycle actions.
import { displayStatus, type Content, type ContentLibraryFilter } from "@repo/types";
import { and, desc, eq, like, or } from "drizzle-orm";

import type { Db } from "./client";
import { contents, scheduleEntries } from "./schema";

export interface ContentListItem extends Content {
  displayStatus: ReturnType<typeof displayStatus>;
}

export interface CreateContentInput {
  sourceDraftId?: string | null;
  topic?: string;
  hook?: string;
  beats?: Content["beats"];
  cta?: string;
  caption?: string;
  hashtags?: string[];
  targetLength?: Content["targetLength"];
  status?: Content["status"];
}

export function createContent(db: Db, input: CreateContentInput = {}): Content {
  return db.insert(contents).values(input).returning().get();
}

export function getContent(db: Db, id: string): Content | null {
  return db.select().from(contents).where(eq(contents.id, id)).get() ?? null;
}

/** Newest first; `search` matches topic/hook/caption, `status` filters on the derived status. */
export function listContents(
  db: Db,
  filter: { search?: string; status?: ContentLibraryFilter } = {},
): ContentListItem[] {
  const conditions = [];
  const search = filter.search?.trim();
  if (search) {
    const needle = `%${search}%`;
    conditions.push(
      or(
        like(contents.topic, needle),
        like(contents.hook, needle),
        like(contents.caption, needle),
      ),
    );
  }

  const rows = db
    .select({ content: contents, scheduleStatus: scheduleEntries.status })
    .from(contents)
    .leftJoin(scheduleEntries, eq(scheduleEntries.contentId, contents.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contents.updatedAt))
    .all();

  const items = rows.map((r) => ({
    ...r.content,
    displayStatus: displayStatus(
      r.content,
      r.scheduleStatus ? { status: r.scheduleStatus } : null,
    ),
  }));

  if (!filter.status || filter.status === "all") return items;
  return items.filter((c) => c.displayStatus === filter.status);
}

/** Saves the content's fields and marks it `saved`. Returns null if it doesn't exist. */
export function saveContent(
  db: Db,
  id: string,
  input: {
    topic: string;
    hook: string;
    beats: Content["beats"];
    cta: string;
    caption: string;
    hashtags: string[];
    targetLength: Content["targetLength"];
  },
): Content | null {
  return (
    db
      .update(contents)
      .set({ ...input, status: "saved" })
      .where(eq(contents.id, id))
      .returning()
      .get() ?? null
  );
}

/** Copies a content item as a new, unsaved draft. */
export function duplicateContent(db: Db, id: string): Content | null {
  const source = getContent(db, id);
  if (!source) return null;
  return createContent(db, {
    sourceDraftId: source.sourceDraftId,
    topic: source.topic,
    hook: source.hook,
    beats: source.beats,
    cta: source.cta,
    caption: source.caption,
    hashtags: source.hashtags,
    targetLength: source.targetLength,
    status: "draft",
  });
}

/** Deletes the content (its schedule entry, if any, cascades). Returns the deleted row. */
export function deleteContent(db: Db, id: string): Content | null {
  return (
    db.delete(contents).where(eq(contents.id, id)).returning().get() ?? null
  );
}
