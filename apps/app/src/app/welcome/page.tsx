import { getAIProvider } from "@repo/ai";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ArrowRight, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { ConnectActions } from "@/app/connect/connect-actions";
import { AccountCheck, CliCheck } from "@/components/codex-checks";
import { SignInButton } from "@/components/sign-in-button";

import { finishWelcome } from "./actions";

export const metadata: Metadata = {
  title: "Welcome · Social Media Agent",
};

/** First run: make sure Codex is there and signed in before the first draft. */
export default async function WelcomePage() {
  await connection(); // Never talk to Codex during build.
  const status = await getAIProvider().getStatus();
  const ready = status.state === "ready" && status.account.type !== "apiKey";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to Social Media Agent
        </h1>
        <p className="text-muted-foreground text-balance">
          Plan, draft and schedule Instagram Reels with Codex, running on your
          own ChatGPT plan. No API key needed, and your drafts stay on this
          computer.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{ready ? "You're all set" : "Connect Codex"}</CardTitle>
          <CardDescription>
            {ready
              ? "Codex is ready to help you draft."
              : "Drafting runs on Codex. Sign in with the ChatGPT account whose plan you want to use."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status.state === "error" ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Codex didn&apos;t respond</AlertTitle>
              <AlertDescription>
                <p>{status.message}</p>
                <div className="mt-2">
                  <ConnectActions state={status.state} />
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col gap-3">
              <CliCheck status={status} />
              <AccountCheck status={status}>
                {status.state === "signed_out" && (
                  <div className="mt-1">
                    <SignInButton />
                  </div>
                )}
              </AccountCheck>
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            Replies count toward your ChatGPT plan&apos;s Codex usage limits.
            What you type in a draft is sent to OpenAI through Codex under your
            account.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {ready ? (
          <>
            <form action={finishWelcome.bind(null, "draft")}>
              <Button type="submit">
                Start your first draft
                <ArrowRight data-icon="inline-end" />
              </Button>
            </form>
            <form action={finishWelcome.bind(null, "home")}>
              <Button type="submit" variant="ghost">
                Go to Home
              </Button>
            </form>
          </>
        ) : (
          <form action={finishWelcome.bind(null, "home")}>
            <Button type="submit" variant="ghost">
              Skip for now
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
