"use client";

import type { ProviderStatus } from "@repo/ai";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { LoaderCircle, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 2000;
const POLL_FOR_MS = 10 * 60 * 1000;

/**
 * Starts ChatGPT sign-in in the user's browser (the desktop app routes `window.open` to the
 * system browser), then polls the Codex status and refreshes the page once signed in.
 */
export function SignInButton({
  size,
  align = "start",
}: {
  size?: "sm" | "default";
  align?: "start" | "end";
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  function poll() {
    stopPolling();
    setWaiting(true);
    const until = Date.now() + POLL_FOR_MS;
    timer.current = setInterval(async () => {
      if (Date.now() > until) {
        stopPolling();
        setWaiting(false);
        setHint("Still not signed in. Try again, or refresh once you're done.");
        return;
      }
      try {
        const res = await fetch("/api/codex/status", { cache: "no-store" });
        const { status } = (await res.json()) as { status: ProviderStatus };
        if (status.state === "ready") {
          stopPolling();
          setWaiting(false);
          setHint(null);
          router.refresh();
        }
      } catch {
        // Keep polling; the server may be busy starting Codex.
      }
    }, POLL_MS);
  }

  async function signIn() {
    setStarting(true);
    setHint(null);
    try {
      const res = await fetch("/api/codex/login", { method: "POST" });
      const data = (await res.json()) as { authUrl?: string; error?: string };
      if (!data.authUrl)
        throw new Error(data.error ?? "Could not start sign-in");
      window.open(data.authUrl, "_blank", "noopener");
      setHint(
        "Finish signing in in your browser — this page updates on its own.",
      );
      poll();
    } catch (error) {
      setHint(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || waiting;
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        align === "end" ? "items-end text-right" : "items-start",
      )}
    >
      <Button size={size} onClick={signIn} disabled={starting}>
        {busy ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        ) : (
          <LogIn data-icon="inline-start" />
        )}
        {waiting ? "Waiting for sign-in…" : "Sign in with ChatGPT"}
      </Button>
      {hint && (
        <p className="text-muted-foreground max-w-72 text-xs" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
