import type { ProviderStatus } from "@repo/ai";
import type { ReactNode } from "react";

import { StatusCheck } from "./status-check";

/** Codex CLI line of the setup checklist (connect page, first-run welcome). */
export function CliCheck({ status }: { status: ProviderStatus }) {
  if (status.state === "not_installed") {
    return (
      <StatusCheck
        ok={false}
        label="Codex CLI"
        detail="Not found on this computer"
      >
        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
          npm i -g @openai/codex
        </code>
      </StatusCheck>
    );
  }
  return <StatusCheck ok label="Codex CLI" detail={codexDetail(status)} />;
}

export function AccountCheck({
  status,
  children,
}: {
  status: ProviderStatus;
  /** Shown under a signed-out account, e.g. a sign-in button. */
  children?: ReactNode;
}) {
  if (status.state !== "ready") {
    return (
      <StatusCheck
        ok={false}
        label="ChatGPT account"
        detail="Not signed in — use Sign in with ChatGPT"
      >
        {children}
      </StatusCheck>
    );
  }
  const { account } = status;
  if (account.type === "chatgpt") {
    return (
      <StatusCheck
        ok
        label="ChatGPT account"
        detail={[account.email, `${capitalize(account.plan)} plan`]
          .filter(Boolean)
          .join(" · ")}
      />
    );
  }
  return (
    <StatusCheck
      ok={false}
      label="ChatGPT account"
      detail={
        account.type === "apiKey"
          ? "Codex is using an API key — sign in with ChatGPT to use your subscription"
          : account.label
      }
    />
  );
}

/** "v0.157.1 · built into the app" / "v0.157.1 · installed on this computer". */
function codexDetail(status: ProviderStatus): string {
  if (status.state !== "ready" && status.state !== "signed_out")
    return "Installed";
  return [
    status.version ? `v${status.version}` : null,
    status.bundled ? "built into the app" : "installed on this computer",
  ]
    .filter(Boolean)
    .join(" · ");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
