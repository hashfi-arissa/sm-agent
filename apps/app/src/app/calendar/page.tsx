import { getDb, listCalendarEntries, listUnscheduledContents } from "@repo/db";
import type { Metadata } from "next";
import { connection } from "next/server";
import { z } from "zod";

import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";

export const metadata: Metadata = {
  title: "Calendar · Social Media Agent",
};

export default async function CalendarPage({
  searchParams,
}: PageProps<"/calendar">) {
  await connection();
  const { date } = await searchParams;
  const db = getDb();

  return (
    <CalendarWorkspace
      initialEntries={listCalendarEntries(db)}
      initialTray={listUnscheduledContents(db).map((c) => ({
        id: c.id,
        topic: c.topic,
        hook: c.hook,
        targetLength: c.targetLength,
      }))}
      initialDate={z.iso.date().safeParse(date).data ?? null}
    />
  );
}
