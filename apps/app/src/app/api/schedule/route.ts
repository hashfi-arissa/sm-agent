import { getDb, scheduleContent } from "@repo/db";
import { scheduleContentInputSchema } from "@repo/types";

import { jsonError, parseBody } from "@/lib/api";

const ERRORS = {
  not_found: ["Content not found", 404],
  not_saved: ["Only saved content can be scheduled", 409],
  already_scheduled: ["This content is already scheduled", 409],
} as const;

/** Puts a saved content item on the calendar. */
export async function POST(request: Request) {
  const body = await parseBody(request, scheduleContentInputSchema);
  if ("response" in body) return body.response;

  const result = scheduleContent(getDb(), body.data);
  if ("error" in result) {
    const [message, status] = ERRORS[result.error];
    return jsonError(message, status);
  }
  return Response.json({ entry: result.entry }, { status: 201 });
}
