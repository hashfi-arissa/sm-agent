import {
  getDb,
  listDrafts,
  listEntriesInRange,
  listUnscheduledContents,
} from "@repo/db";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { CalendarDays, FileText, MessagesSquare, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { toLocalDate } from "@/lib/schedule-dates";
import { timeAgo } from "@/lib/time";

export const metadata: Metadata = {
  title: "Social Media Agent",
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return toLocalDate(new Date(y!, m! - 1, d! + days));
}

export default async function Home() {
  await connection();
  const db = getDb();

  const from = toLocalDate(new Date());
  const to = addDays(from, 6);
  const thisWeek = listEntriesInRange(db, { from, to });
  const recentDrafts = listDrafts(db).slice(0, 5);
  const unscheduled = listUnscheduledContents(db).slice(0, 5);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Social Media Agent
          </h1>
          <p className="text-muted-foreground">
            Draft, structure and schedule your Reels with Codex.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/drafts/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" />
            New draft
          </Link>
          <Link
            href="/contents/new"
            className={buttonVariants({ variant: "outline" })}
          >
            <Plus data-icon="inline-start" />
            New content
          </Link>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>This week</CardTitle>
            <Link
              href="/calendar"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Open calendar
            </Link>
          </CardHeader>
          <CardContent>
            {thisWeek.length === 0 ? (
              <EmptyRow
                icon={
                  <CalendarDays
                    className="text-muted-foreground size-6"
                    aria-hidden
                  />
                }
                text="Nothing scheduled this week"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {thisWeek.map((e) => (
                  <li key={e.id} className="relative flex items-center gap-3">
                    <span className="text-muted-foreground w-14 shrink-0 text-xs">
                      {e.date.slice(5)}
                      {e.time ? ` · ${e.time}` : ""}
                    </span>
                    <Link
                      href={`/contents/${e.content.id}`}
                      className="hover:text-foreground truncate text-sm after:absolute after:inset-0"
                    >
                      {e.content.topic || "Untitled content"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent drafts</CardTitle>
            <Link
              href="/drafts"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              All drafts
            </Link>
          </CardHeader>
          <CardContent>
            {recentDrafts.length === 0 ? (
              <EmptyRow
                icon={
                  <MessagesSquare
                    className="text-muted-foreground size-6"
                    aria-hidden
                  />
                }
                text="No drafts yet"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {recentDrafts.map((d) => (
                  <li key={d.id} className="relative flex items-center gap-3">
                    <Link
                      href={`/drafts/${d.id}`}
                      className="hover:text-foreground min-w-0 flex-1 truncate text-sm after:absolute after:inset-0"
                    >
                      {d.title || "Untitled draft"}
                    </Link>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {timeAgo(d.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Unscheduled contents</CardTitle>
            <Link
              href="/contents?status=saved"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              All contents
            </Link>
          </CardHeader>
          <CardContent>
            {unscheduled.length === 0 ? (
              <EmptyRow
                icon={
                  <FileText
                    className="text-muted-foreground size-6"
                    aria-hidden
                  />
                }
                text="Everything saved is on the calendar"
              />
            ) : (
              <ul className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
                {unscheduled.map((c) => (
                  <li key={c.id} className="relative flex items-center gap-3">
                    <Link
                      href={`/contents/${c.id}`}
                      className="hover:text-foreground min-w-0 flex-1 truncate text-sm after:absolute after:inset-0"
                    >
                      {c.topic || "Untitled content"}
                    </Link>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {c.targetLength}s
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
      {icon}
      {text}
    </div>
  );
}
