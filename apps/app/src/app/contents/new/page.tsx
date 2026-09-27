import type { Metadata } from "next";
import { connection } from "next/server";

import { ContentWorkspace } from "@/components/contents/content-workspace";

export const metadata: Metadata = {
  title: "New content · Social Media Agent",
};

export default async function NewContentPage() {
  await connection();
  // A fresh key per request: after the first save the URL becomes /contents/[id] in
  // place, so opening "New content" again must remount the workspace, not reuse its state.
  return (
    <ContentWorkspace
      key={crypto.randomUUID()}
      content={null}
      sourceDraftHref={null}
      scheduleEntry={null}
    />
  );
}
