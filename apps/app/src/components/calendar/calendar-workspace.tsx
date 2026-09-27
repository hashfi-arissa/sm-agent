"use client";

import FullCalendar, { type EventInput } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin, { Draggable } from "@fullcalendar/react/interaction";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import type { CalendarEntry, ScheduleStatus } from "@repo/types";
import { cn } from "@repo/ui/lib/utils";
import { CalendarPlus, GripVertical, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "./calendar.css";

import {
  scheduleContentRequest,
  unscheduleEntryRequest,
  updateScheduleEntryRequest,
} from "@/lib/schedule-client";
import { toSchedule } from "@/lib/schedule-dates";

import { EntryDialog } from "./entry-dialog";

export type TrayItem = CalendarEntry["content"];

const STATUS_COLORS: Record<
  ScheduleStatus,
  { color: string; contrastColor: string }
> = {
  planned: {
    color: "var(--primary)",
    contrastColor: "var(--primary-foreground)",
  },
  posted: { color: "var(--calendar-posted)", contrastColor: "#fff" },
  missed: { color: "var(--destructive)", contrastColor: "#fff" },
};

function toEvent(entry: CalendarEntry): EventInput {
  return {
    id: entry.id,
    title: entry.content.topic || "Untitled content",
    start: entry.time ? `${entry.date}T${entry.time}` : entry.date,
    allDay: !entry.time,
    ...STATUS_COLORS[entry.status],
  };
}

const byDateTime = (a: CalendarEntry, b: CalendarEntry) =>
  a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");

/**
 * The content calendar: drag saved content from the tray onto a day (or a time slot in
 * week view) to schedule it, drag events to reschedule, drag an event back onto the tray
 * to unschedule, and click an event for a quick peek.
 */
export function CalendarWorkspace({
  initialEntries,
  initialTray,
  initialDate,
}: {
  initialEntries: CalendarEntry[];
  initialTray: TrayItem[];
  /** `YYYY-MM-DD` to open on, e.g. from "Open in calendar". */
  initialDate: string | null;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [tray, setTray] = useState(initialTray);
  const [error, setError] = useState<string | null>(null);
  const [draggingEvent, setDraggingEvent] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    const draggable = new Draggable(trayRef.current!, {
      itemSelector: "[data-content-id]",
      // FullCalendar only previews the drop; `drop` below creates the entry via the API.
      eventData: (el) => ({
        title: el.dataset.title,
        create: false,
        duration: "00:30",
      }),
    });
    return () => draggable.destroy();
  }, []);

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : String(err));
  }

  function upsert(entry: CalendarEntry) {
    setEntries((prev) =>
      [...prev.filter((e) => e.id !== entry.id), entry].sort(byDateTime),
    );
  }

  async function schedule(contentId: string, start: Date, allDay: boolean) {
    setError(null);
    try {
      const entry = await scheduleContentRequest({
        contentId,
        ...toSchedule(start, allDay),
      });
      upsert(entry);
      setTray((prev) => prev.filter((c) => c.id !== contentId));
    } catch (err) {
      fail(err);
    }
  }

  async function update(
    id: string,
    input: Parameters<typeof updateScheduleEntryRequest>[1],
  ): Promise<boolean> {
    setError(null);
    try {
      upsert(await updateScheduleEntryRequest(id, input));
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  }

  async function unschedule(id: string): Promise<boolean> {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return false;
    setError(null);
    try {
      await unscheduleEntryRequest(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTray((prev) => [
        entry.content,
        ...prev.filter((c) => c.id !== entry.contentId),
      ]);
      if (selectedId === id) setSelectedId(null);
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  }

  function isOverTray(x: number, y: number): boolean {
    const rect = trayRef.current?.getBoundingClientRect();
    return (
      !!rect &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 py-6 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground text-sm">
            Drag saved content onto a day to schedule it.
          </p>
        </div>
        <div
          ref={trayRef}
          aria-label="Unscheduled content"
          className={cn(
            "flex min-h-32 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
            draggingEvent && "border-primary bg-muted/60",
          )}
        >
          <p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
            {draggingEvent
              ? "Drop here to unschedule"
              : `Unscheduled · ${tray.length}`}
          </p>
          {tray.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 px-2 py-6 text-center text-sm">
              <CalendarPlus className="size-6" aria-hidden />
              <p>Nothing waiting. Saved content shows up here.</p>
              <Link
                href="/contents"
                className="text-foreground underline underline-offset-2"
              >
                Go to contents
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {tray.map((c) => (
                <li
                  key={c.id}
                  data-content-id={c.id}
                  data-title={c.topic || "Untitled content"}
                  className="bg-card hover:bg-muted/50 flex cursor-grab items-start gap-2 rounded-lg border p-2 text-sm shadow-xs active:cursor-grabbing"
                >
                  <GripVertical
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {c.topic || "Untitled content"}
                    </span>
                    {c.hook && (
                      <span className="text-muted-foreground line-clamp-2 text-xs">
                        {c.hook}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {c.targetLength}s
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="text-destructive flex items-start gap-2 text-sm"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              <X className="size-4" />
            </button>
          </p>
        )}
      </aside>

      <section className="calendar-shell h-[calc(100dvh-6.5rem)] min-h-[36rem] min-w-0 flex-1">
        <FullCalendar
          plugins={[
            classicThemePlugin,
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          initialDate={initialDate ?? undefined}
          headerToolbar={{
            start: "prev,next today",
            center: "title",
            end: "dayGridMonth,timeGridWeek",
          }}
          height="100%"
          events={entries.map(toEvent)}
          editable
          eventDurationEditable={false}
          droppable
          dayMaxEvents
          nowIndicator
          defaultTimedEventDuration="00:30"
          scrollTime="08:00"
          drop={(info) => {
            const contentId = info.draggedEl.dataset.contentId;
            if (contentId) void schedule(contentId, info.date, info.allDay);
          }}
          eventDragStart={() => setDraggingEvent(true)}
          eventDragStop={(info) => {
            setDraggingEvent(false);
            if (isOverTray(info.jsEvent.clientX, info.jsEvent.clientY))
              void unschedule(info.event.id);
          }}
          eventDrop={(info) => {
            if (!info.event.start) return info.revert();
            void update(
              info.event.id,
              toSchedule(info.event.start, info.event.allDay),
            ).then((ok) => ok || info.revert());
          }}
          eventClick={(info) => {
            info.jsEvent.preventDefault();
            setSelectedId(info.event.id);
          }}
        />
      </section>

      <EntryDialog
        entry={selected}
        error={error}
        onOpenChange={(open) => {
          if (open) return;
          setSelectedId(null);
          setError(null);
        }}
        onUpdate={update}
        onUnschedule={unschedule}
      />
    </main>
  );
}
