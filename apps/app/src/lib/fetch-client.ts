"use client";

import type { ApiError } from "@/lib/api";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: ApiError["code"],
  ) {
    super(message);
  }
}

/** Throws ApiRequestError for non-2xx responses. */
export async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  const data = (await res.json().catch(() => ({}))) as Partial<ApiError>;
  throw new ApiRequestError(
    data.error ?? `Request failed (${res.status})`,
    data.code,
  );
}
