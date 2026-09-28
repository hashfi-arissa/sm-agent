import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

/**
 * In the desktop app (apps/desktop) the server listens on 127.0.0.1, where any local
 * process or web page could reach it. The desktop shell attaches a per-launch token to
 * every request from its window; anything without it is refused. `pnpm dev` doesn't set
 * SMA_AUTH_TOKEN, so this is a no-op there.
 */
export function proxy(request: NextRequest) {
  const expected = process.env.SMA_AUTH_TOKEN;
  if (!expected) return NextResponse.next();
  if (!tokenMatches(request.headers.get("x-sma-token"), expected)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}

function tokenMatches(actual: string | null, expected: string) {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
