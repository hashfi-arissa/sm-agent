"use client";

import type { ProviderStatus } from "@repo/ai";
import { Button } from "@repo/ui/components/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SignInButton } from "@/components/sign-in-button";

export function ConnectActions({ state }: { state: ProviderStatus["state"] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <div className="flex items-start gap-2">
      {state === "signed_out" && <SignInButton size="sm" align="end" />}
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
  );
}
