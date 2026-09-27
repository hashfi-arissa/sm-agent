import type { AIErrorCode, ProviderStatus } from "@repo/ai";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { CircleAlert } from "lucide-react";
import Link from "next/link";

export type CodexProblemCode = AIErrorCode | "busy" | "unavailable";

const COPY: Record<CodexProblemCode, { title: string; hint?: string }> = {
  not_installed: {
    title: "Codex CLI isn't installed",
    hint: "Drafting needs the Codex CLI on this computer.",
  },
  signed_out: {
    title: "You're signed out of ChatGPT",
    hint: "Sign in again to keep drafting on your plan.",
  },
  rate_limited: {
    title: "You've hit your ChatGPT plan's Codex limit",
    hint: "Your chat is saved. Retry once your limit resets.",
  },
  context_full: {
    title: "This chat is too long for the model",
    hint: "Start a new draft and paste in what you want to keep.",
  },
  busy: { title: "Codex is still replying in this draft" },
  unavailable: {
    title: "Codex isn't responding",
    hint: "Check the connection, then try again.",
  },
  other: { title: "Something went wrong" },
};

const NEEDS_CONNECT = new Set<CodexProblemCode>([
  "not_installed",
  "signed_out",
  "unavailable",
]);

/** Maps a provider status to a problem, or null when Codex is ready. */
export function statusProblem(status: ProviderStatus): {
  code: CodexProblemCode;
  message?: string;
} | null {
  switch (status.state) {
    case "ready":
      return null;
    case "not_installed":
      return { code: "not_installed" };
    case "signed_out":
      return { code: "signed_out" };
    case "error":
      return { code: "unavailable", message: status.message };
  }
}

/** Explains a Codex problem and what to do about it. */
export function CodexProblem({
  code,
  message,
  action,
}: {
  code: CodexProblemCode;
  message?: string;
  action?: React.ReactNode;
}) {
  const { title, hint } = COPY[code];
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {message && message !== title && <p>{message}</p>}
        {hint && <p>{hint}</p>}
        {(NEEDS_CONNECT.has(code) || action) && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {NEEDS_CONNECT.has(code) && (
              <Link
                href="/connect"
                className="text-foreground font-medium underline underline-offset-2"
              >
                Open Codex connection
              </Link>
            )}
            {action}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
