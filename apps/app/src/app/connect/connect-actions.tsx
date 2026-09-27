"use client";

import type { ProviderStatus } from "@repo/ai";
import { Button } from "@repo/ui/components/button";
import { LoaderCircle, LogIn, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ConnectActions({ state }: { state: ProviderStatus["state"] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [signingIn, setSigningIn] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function signIn() {
    setSigningIn(true);
    setHint(null);
    try {
      const res = await fetch("/api/codex/login", { method: "POST" });
      const data = (await res.json()) as { authUrl?: string; error?: string };
      if (!data.authUrl)
        throw new Error(data.error ?? "Could not start sign-in");
      window.open(data.authUrl, "_blank", "noopener");
      setHint("Finish signing in in the new tab, then refresh.");
    } catch (error) {
      setHint(error instanceof Error ? error.message : String(error));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {state === "signed_out" && (
          <Button size="sm" onClick={signIn} disabled={signingIn}>
            {signingIn ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <LogIn data-icon="inline-start" />
            )}
            Sign in with ChatGPT
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => startRefresh(() => router.refresh())}
          disabled={refreshing}
        >
          <RefreshCw
            className={refreshing ? "animate-spin" : undefined}
            data-icon="inline-start"
          />
          Refresh
        </Button>
      </div>
      {hint && (
        <p
          className="text-muted-foreground max-w-64 text-right text-xs"
          role="status"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
