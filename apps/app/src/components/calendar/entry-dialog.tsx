"use client";

import type {
  CalendarEntry,
  ScheduleStatus,
  UpdateScheduleEntryInput,
} from "@repo/types";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  CalendarX2,
  Check,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatSchedule } from "@/lib/schedule-dates";

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  planned: "Scheduled",
  posted: "Posted",
  missed: "Missed",
};

const STATUS_BADGE: Record<
  ScheduleStatus,
  "default" | "secondary" | "destructive"
> = {
  planned: "default",
  posted: "secondary",
  missed: "destructive",
};

/** Quick peek for a calendar event: details, reschedule, mark posted/missed, unschedule. */
export function EntryDialog({
  entry,
  error,
  onOpenChange,
  onUpdate,
  onUnschedule,
}: {
  entry: CalendarEntry | null;
  /** Last failed action, shown inside the dialog since it covers the page. */
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, input: UpdateScheduleEntryInput) => Promise<boolean>;
  onUnschedule: (id: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed so the date/time inputs reset when another event is opened. */}
        {entry && (
          <EntryDetails
            key={`${entry.id}:${entry.date}:${entry.time}`}
            entry={entry}
            onUpdate={onUpdate}
            onUnschedule={onUnschedule}
          />
        )}
        {entry && error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntryDetails({
  entry,
  onUpdate,
  onUnschedule,
}: {
  entry: CalendarEntry;
  onUpdate: (id: string, input: UpdateScheduleEntryInput) => Promise<boolean>;
  onUnschedule: (id: string) => Promise<boolean>;
}) {
  const [date, setDate] = useState(entry.date);
  const [time, setTime] = useState(entry.time ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  const moved = date !== entry.date || (time || null) !== entry.time;

  async function run(action: string, fn: () => Promise<boolean>) {
    setBusy(action);
    await fn();
    setBusy(null);
  }

  const spinner = (action: string, icon: React.ReactNode) =>
    busy === action ? (
      <LoaderCircle className="animate-spin" data-icon="inline-start" />
    ) : (
      icon
    );

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_BADGE[entry.status]}>
            {STATUS_LABEL[entry.status]}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {entry.content.targetLength}s Reel
          </span>
        </div>
        <DialogTitle>{entry.content.topic || "Untitled content"}</DialogTitle>
        <DialogDescription>
          {formatSchedule(entry.date, entry.time)}
          {entry.status === "posted" && entry.postedAt && (
            <> · marked posted {new Date(entry.postedAt).toLocaleString()}</>
          )}
        </DialogDescription>
      </DialogHeader>

      {entry.content.hook && (
        <blockquote className="border-l-2 pl-3 text-sm italic">
          {entry.content.hook}
        </blockquote>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date || !moved) return;
          void run("move", () =>
            onUpdate(entry.id, { date, time: time || null }),
          );
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-date">Date</Label>
          <Input
            id="entry-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-fit"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-time">Time (optional)</Label>
          <Input
            id="entry-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-fit"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!moved || !date || !!busy}
        >
          {spinner("move", null)}
          Reschedule
        </Button>
      </form>

      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        <Link
          href={`/contents/${entry.content.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ExternalLink data-icon="inline-start" />
          Open content
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy}
            onClick={() => void run("unschedule", () => onUnschedule(entry.id))}
          >
            {spinner("unschedule", <CalendarX2 data-icon="inline-start" />)}
            Unschedule
          </Button>
          {entry.status === "planned" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!!busy}
                onClick={() =>
                  void run("missed", () =>
                    onUpdate(entry.id, { status: "missed" }),
                  )
                }
              >
                {spinner("missed", <X data-icon="inline-start" />)}
                Mark missed
              </Button>
              <Button
                size="sm"
                disabled={!!busy}
                onClick={() =>
                  void run("posted", () =>
                    onUpdate(entry.id, { status: "posted" }),
                  )
                }
              >
                {spinner("posted", <Check data-icon="inline-start" />)}
                Mark posted
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy}
              onClick={() =>
                void run("planned", () =>
                  onUpdate(entry.id, { status: "planned" }),
                )
              }
            >
              {spinner("planned", <RotateCcw data-icon="inline-start" />)}
              Back to scheduled
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
}
