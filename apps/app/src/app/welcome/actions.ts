"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ONBOARDED_COOKIE } from "@/lib/onboarding";

const NEXT = { home: "/", draft: "/drafts/new" } as const;

/** Leaves the first-run welcome for good and goes on to `to`. */
export async function finishWelcome(to: keyof typeof NEXT) {
  (await cookies()).set(ONBOARDED_COOKIE, "1", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 10,
  });
  redirect(NEXT[to] ?? "/");
}
