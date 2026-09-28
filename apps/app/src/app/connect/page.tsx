import { getAIProvider, type ModelInfo } from "@repo/ai";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { AccountCheck, CliCheck } from "@/components/codex-checks";
import { StatusCheck } from "@/components/status-check";

import { ConnectActions } from "./connect-actions";
import { TestPrompt } from "./test-prompt";

export const metadata: Metadata = {
  title: "Connect Codex · Social Media Agent",
};

export default async function ConnectPage() {
  await connection(); // Always render at request time — never talk to Codex during build.
  const ai = getAIProvider();
  const status = await ai.getStatus();
  const models = status.state === "ready" ? await ai.listModels() : [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Connect Codex</h1>
        <p className="text-muted-foreground">
          Drafting runs on your ChatGPT plan through the Codex CLI on this
          computer — no API key, nothing hosted.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>What the app can see right now.</CardDescription>
          <CardAction>
            <ConnectActions state={status.state} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {status.state === "error" ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Codex didn&apos;t respond</AlertTitle>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col gap-3">
              <CliCheck status={status} />
              <AccountCheck status={status} />
              <StatusCheck
                ok={models.length > 0}
                label="Models"
                detail={
                  models.length > 0
                    ? `${models.length} available`
                    : "Available after sign-in"
                }
              />
            </ul>
          )}
        </CardContent>
      </Card>

      {models.length > 0 && <ModelsCard models={models} />}

      {models.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Try it</CardTitle>
            <CardDescription>
              Sends one prompt on a new drafting thread and streams the reply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestPrompt models={models} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function ModelsCard({ models }: { models: ModelInfo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Available models</CardTitle>
        <CardDescription>
          Pick one when you start a draft. Effort options differ per model.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {models.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.displayName}</span>
                {m.isDefault && <Badge variant="secondary">Default</Badge>}
              </div>
              {m.description && (
                <p className="text-muted-foreground">{m.description}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {m.efforts.map((e) => (
                  <Badge
                    key={e.value}
                    variant={
                      e.value === m.defaultEffort ? "default" : "outline"
                    }
                    title={e.description}
                  >
                    {e.value}
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
