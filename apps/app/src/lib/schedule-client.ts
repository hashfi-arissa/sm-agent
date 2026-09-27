"use client";

import type {
  CalendarEntry,
  ScheduleContentInput,
  UpdateScheduleEntryInput,
} from "@repo/types";

import { ensureOk } from "@/lib/fetch-client";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function scheduleContentRequest(
  input: ScheduleContentInput,
): Promise<CalendarEntry> {
  const res = await ensureOk(
    await fetch("/api/schedule", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }),
  );
  return ((await res.json()) as { entry: CalendarEntry }).entry;
}

export async function updateScheduleEntryRequest(
  id: string,
  input: UpdateScheduleEntryInput,
): Promise<CalendarEntry> {
  const res = await ensureOk(
    await fetch(`/api/schedule/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }),
  );
  return ((await res.json()) as { entry: CalendarEntry }).entry;
}

export async function unscheduleEntryRequest(id: string): Promise<void> {
  const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
  if (res.status !== 404) await ensureOk(res);
}
