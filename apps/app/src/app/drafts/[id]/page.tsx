import { getDb, getDraft } from "@repo/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DraftWorkspace } from "@/components/drafts/draft-workspace";

import { getCodexContext } from "../codex-context";

export async function generateMetadata({
  params,
}: PageProps<"/drafts/[id]">): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const title = getDraft(getDb(), id)?.document.title || "Untitled draft";
  return { title: `${title} · Social Media Agent` };
}

export default async function DraftPage({ params }: PageProps<"/drafts/[id]">) {
  await connection(); // never talk to Codex during build
  const { id } = await params;
  const draft = getDraft(getDb(), id);
  if (!draft) notFound();

  const { models, problem } = await getCodexContext();
  return (
    <DraftWorkspace
      key={draft.session.id}
      draft={draft}
      models={models}
      problem={problem}
    />
  );
}
