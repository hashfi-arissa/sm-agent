import type { Metadata } from "next";
import { connection } from "next/server";

import { DraftWorkspace } from "@/components/drafts/draft-workspace";

import { getCodexContext } from "../codex-context";

export const metadata: Metadata = {
  title: "New draft · Social Media Agent",
};

export default async function NewDraftPage() {
  await connection(); // never talk to Codex during build
  const { models, problem } = await getCodexContext();
  // A fresh key per request: after the first message the URL becomes /drafts/[id] in
  // place, so opening "New draft" again must remount the workspace, not reuse its state.
  return (
    <DraftWorkspace
      key={crypto.randomUUID()}
      draft={null}
      models={models}
      problem={problem}
    />
  );
}
