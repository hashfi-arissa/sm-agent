import { getAIProvider } from "@repo/ai";

/** Starts ChatGPT sign-in; the client opens the returned URL in the browser. */
export async function POST() {
  try {
    const { authUrl } = await getAIProvider().startLogin();
    return Response.json({ authUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502 });
  }
}
