import { getDb, listDrafts } from "@repo/db";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { MessagesSquare, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { timeAgo } from "@/lib/time";

import { DeleteDraftButton } from "./delete-draft-button";

export const metadata: Metadata = {
  title: "Drafts · Social Media Agent",
};

export default async function DraftsPage() {
  await connection();
  const drafts = listDrafts(getDb());

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
          <p className="text-muted-foreground">
            Chats with Codex and the Reel drafts that came out of them.
          </p>
        </div>
        <Link href="/drafts/new" className={buttonVariants()}>
          <Plus data-icon="inline-start" />
          New draft
        </Link>
      </header>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <MessagesSquare
              className="text-muted-foreground size-8"
              aria-hidden
            />
            <p className="font-medium">No drafts yet</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Start a chat with Codex about a Reel idea, then keep the parts you
              like in the draft document.
            </p>
            <Link
              href="/drafts/new"
              className={buttonVariants({ variant: "outline" })}
            >
              <Plus data-icon="inline-start" />
              New draft
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-xl border">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="hover:bg-muted/40 relative flex items-center gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* The link's ::after covers the row; the delete button sits above it. */}
                <Link
                  href={`/drafts/${d.id}`}
                  className="truncate font-medium after:absolute after:inset-0"
                >
                  {d.title || "Untitled draft"}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {d.model} · {d.effort} effort · {d.messageCount}{" "}
                  {d.messageCount === 1 ? "message" : "messages"} · updated{" "}
                  <time
                    dateTime={d.updatedAt}
                    title={new Date(d.updatedAt).toLocaleString()}
                  >
                    {timeAgo(d.updatedAt)}
                  </time>
                </p>
              </div>
              {d.saved ? (
                <Badge variant="secondary">Saved</Badge>
              ) : (
                <Badge variant="outline">Unsaved</Badge>
              )}
              <div className="relative">
                <DeleteDraftButton
                  id={d.id}
                  title={d.title || "Untitled draft"}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
