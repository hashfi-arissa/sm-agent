"use client";

import type { ScheduleEntry } from "@repo/types";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { CalendarDays, CalendarPlus, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { scheduleContentRequest } from "@/lib/schedule-client";
import { formatSchedule, toLocalDate } from "@/lib/schedule-dates";

const STATUS_TEXT: Record<ScheduleEntry["status"], string> = {
  planned: "Scheduled for",
  posted: "Posted ·",
  missed: "Missed ·",
};

/**
 * The editor's "Schedule…" row: schedules saved content without leaving the page, or
 * shows where it sits on the calendar. Only saved content can be scheduled.
 */
export function ScheduleControl({
  contentId,
  saved,
  initialEntry,
}: {
  contentId: string | null;
  saved: boolean;
  initialEntry: ScheduleEntry | null;
}) {
  const [entry, setEntry] = useState(initialEntry);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => toLocalDate(new Date()));
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (entry) {
    return (
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <CalendarDays className="text-muted-foreground size-4" aria-hidden />
        <span className="flex-1">
          {STATUS_TEXT[entry.status]} {formatSchedule(entry.date, entry.time)}
        </span>
        <Link
          href={`/calendar?date=${entry.date}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Open in calendar
        </Link>
      </div>
    );
  }

  if (!contentId || !saved) {
    return (
      <p className="text-muted-foreground text-sm">
        Save this content to put it on the calendar.
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        <CalendarPlus data-icon="inline-start" />
        Schedule…
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      aria-label="Schedule this content"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          setEntry(
            await scheduleContentRequest({
              contentId,
              date,
              time: time || null,
            }),
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        type="date"
        aria-label="Date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-fit"
      />
      <Input
        type="time"
        aria-label="Time (optional)"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-fit"
      />
      <Button type="submit" size="sm" disabled={busy || !date}>
        {busy && (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        )}
        Schedule
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
      {error && <p className="text-destructive w-full text-sm">{error}</p>}
    </form>
  );
}
