import { getDb, listContents, listDrafts } from "@repo/db";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { FileText, MessagesSquare, Search as SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { timeAgo } from "@/lib/time";

export const metadata: Metadata = {
  title: "Search · Social Media Agent",
};

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  await connection();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const db = getDb();

  const drafts = q ? listDrafts(db, { search: q }) : [];
  const contents = q ? listContents(db, { search: q }) : [];
  const hasResults = drafts.length > 0 || contents.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground">
          Look across every draft and content item at once.
        </p>
      </header>

      <form method="get" className="flex gap-2" aria-label="Search everything">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search title, topic, hook, caption or draft text…"
          autoFocus
        />
        <button
          type="submit"
          className={buttonVariants({ variant: "outline" })}
        >
          Search
        </button>
      </form>

      {!q ? null : !hasResults ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <SearchIcon className="text-muted-foreground size-8" aria-hidden />
            <p className="font-medium">No matches for &ldquo;{q}&rdquo;</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Try a shorter or different search term.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {contents.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-sm font-medium">
                Contents ({contents.length})
              </h2>
              <ul className="divide-y rounded-xl border">
                {contents.map((c) => (
                  <li
                    key={c.id}
                    className="hover:bg-muted/40 relative flex items-center gap-3 px-4 py-3"
                  >
                    <FileText
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link
                        href={`/contents/${c.id}`}
                        className="truncate font-medium after:absolute after:inset-0"
                      >
                        {c.topic || "Untitled content"}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">
                        updated{" "}
                        <time dateTime={c.updatedAt}>
                          {timeAgo(c.updatedAt)}
                        </time>
                      </p>
                    </div>
                    <Badge variant="outline">{c.displayStatus}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {drafts.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-sm font-medium">
                Drafts ({drafts.length})
              </h2>
              <ul className="divide-y rounded-xl border">
                {drafts.map((d) => (
                  <li
                    key={d.id}
                    className="hover:bg-muted/40 relative flex items-center gap-3 px-4 py-3"
                  >
                    <MessagesSquare
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link
                        href={`/drafts/${d.id}`}
                        className="truncate font-medium after:absolute after:inset-0"
                      >
                        {d.title || "Untitled draft"}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">
                        {d.model} · {d.effort} effort · updated{" "}
                        <time dateTime={d.updatedAt}>
                          {timeAgo(d.updatedAt)}
                        </time>
                      </p>
                    </div>
                    <Badge variant={d.saved ? "secondary" : "outline"}>
                      {d.saved ? "Saved" : "Unsaved"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
