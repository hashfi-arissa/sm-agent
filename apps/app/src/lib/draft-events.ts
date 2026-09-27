import type { ChatEvent } from "@repo/ai";
import type { ChatMessage } from "@repo/types";

/**
 * NDJSON events from POST /api/drafts/[id]/messages and /regenerate: the provider's
 * ChatEvents plus `message` once a chat message has been saved (user first, then the reply).
 */
export type DraftStreamEvent =
  ChatEvent | { type: "message"; message: ChatMessage };
