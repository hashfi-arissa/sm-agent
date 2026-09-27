import { getContent, getDb, getDraftSessionIdForDocument } from "@repo/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ContentWorkspace } from "@/components/contents/content-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/contents/[id]">): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const title = getContent(getDb(), id)?.topic || "Untitled content";
  return { title: `${title} · Social Media Agent` };
}

export default async function ContentPage({
  params,
}: PageProps<"/contents/[id]">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const content = getContent(db, id);
  if (!content) notFound();

  const sourceDraftHref = content.sourceDraftId
    ? getDraftSessionIdForDocument(db, content.sourceDraftId)
    : null;

  return (
    <ContentWorkspace
      key={content.id}
      content={content}
      sourceDraftHref={sourceDraftHref ? `/drafts/${sourceDraftHref}` : null}
    />
  );
}
