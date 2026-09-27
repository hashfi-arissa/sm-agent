import { getDb, unscheduleEntry, updateScheduleEntry } from "@repo/db";
import { updateScheduleEntryInputSchema } from "@repo/types";

import { jsonError, parseBody } from "@/lib/api";

/** Reschedules the entry and/or marks it planned / posted / missed. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/schedule/[id]">,
) {
  const { id } = await ctx.params;
  const body = await parseBody(request, updateScheduleEntryInputSchema);
  if ("response" in body) return body.response;

  const entry = updateScheduleEntry(getDb(), id, body.data);
  if (!entry) return jsonError("Schedule entry not found", 404);
  return Response.json({ entry });
}

/** Unschedules: the content goes back to the calendar tray. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/schedule/[id]">,
) {
  const { id } = await ctx.params;
  const entry = unscheduleEntry(getDb(), id);
  if (!entry) return jsonError("Schedule entry not found", 404);
  return new Response(null, { status: 204 });
}
