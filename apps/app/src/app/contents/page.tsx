import { getDb, listContents } from "@repo/db";
import { contentLibraryFilterSchema, type ContentLibraryFilter } from "@repo/types";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@repo/ui/components/native-select";
import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { DeleteContentButton } from "./delete-content-button";

export const metadata: Metadata = {
  title: "Contents · Social Media Agent",
};

const STATUS_LABEL: Record<ContentLibraryFilter, string> = {
  all: "All",
  draft: "Draft",
  saved: "Saved",
  scheduled: "Scheduled",
  posted: "Posted",
  missed: "Missed",
};

const STATUS_BADGE_VARIANT: Record<
  ContentLibraryFilter,
  "outline" | "secondary" | "default" | "destructive"
> = {
  all: "outline",
  draft: "outline",
  saved: "secondary",
  scheduled: "default",
  posted: "secondary",
  missed: "destructive",
};

export default async function ContentsPage({
  searchParams,
}: PageProps<"/contents">) {
  await connection();
  const params = await searchParams;
  const search =
    typeof params.q === "string" ? params.q : "";
  const status =
    contentLibraryFilterSchema.safeParse(params.status).data ?? "all";

  const items = listContents(getDb(), { search, status });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Contents</h1>
          <p className="text-muted-foreground">
            Reel scripts ready to save and schedule.
          </p>
        </div>
        <Link href="/contents/new" className={buttonVariants()}>
          <Plus data-icon="inline-start" />
          New content
        </Link>
      </header>

      <form
        method="get"
        className="flex flex-wrap items-center gap-2"
        aria-label="Search and filter contents"
      >
        <Input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search topic, hook or caption…"
          className="max-w-xs"
        />
        <NativeSelect name="status" defaultValue={status} className="w-fit">
          {contentLibraryFilterSchema.options.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {STATUS_LABEL[value]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Filter
        </button>
      </form>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText className="text-muted-foreground size-8" aria-hidden />
            <p className="font-medium">
              {search || status !== "all" ? "No matches" : "No content yet"}
            </p>
            <p className="text-muted-foreground max-w-sm text-sm">
              {search || status !== "all"
                ? "Try a different search or filter."
                : "Structure a draft into a Reel script, or start one from scratch."}
            </p>
            <Link
              href="/contents/new"
              className={buttonVariants({ variant: "outline" })}
            >
              <Plus data-icon="inline-start" />
              New content
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((c) => (
            <li
              key={c.id}
              className="hover:bg-muted/40 relative flex items-center gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* The link's ::after covers the row; the delete button sits above it. */}
                <Link
                  href={`/contents/${c.id}`}
                  className="truncate font-medium after:absolute after:inset-0"
                >
                  {c.topic || "Untitled content"}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {c.targetLength}s ·{" "}
                  {c.beats.length === 1 ? "1 beat" : `${c.beats.length} beats`}{" "}
                  · updated{" "}
                  <time
                    dateTime={c.updatedAt}
                    title={new Date(c.updatedAt).toLocaleString()}
                  >
                    {timeAgo(c.updatedAt)}
                  </time>
                </p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[c.displayStatus]}>
                {STATUS_LABEL[c.displayStatus]}
              </Badge>
              <div className="relative">
                <DeleteContentButton
                  id={c.id}
                  topic={c.topic || "Untitled content"}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size)
      return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
