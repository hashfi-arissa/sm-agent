// Provider-neutral AI interface. The app only talks to this; Codex is the one implementation
// today (see ./codex), which keeps the door open for API-key providers after public release.

export interface EffortOption {
  value: string;
  description: string;
}

export interface ModelInfo {
  /** Value to pass back as `model` when starting threads / turns. */
  id: string;
  displayName: string;
  description: string;
  efforts: EffortOption[];
  defaultEffort: string;
  isDefault: boolean;
}

export type AccountInfo =
  | { type: "chatgpt"; email: string | null; plan: string }
  | { type: "apiKey" }
  | { type: "other"; label: string };

export type ProviderStatus =
  /** CLI not found on this machine. */
  | { state: "not_installed"; message: string }
  /** CLI found but it failed to start or answer. */
  | { state: "error"; message: string }
  | { state: "signed_out"; version: string | null }
  | { state: "ready"; version: string | null; account: AccountInfo };

/** Why a turn failed, so the UI can say what to do next. */
export type AIErrorCode =
  /** The CLI isn't installed on this machine. */
  | "not_installed"
  /** Not signed in, or the login expired. */
  | "signed_out"
  /** Plan usage or rate limit reached — try again later. */
  | "rate_limited"
  /** The conversation no longer fits in the model's context window. */
  | "context_full"
  | "other";

export type ChatEvent =
  /** The provider accepted the turn. Pass `turnId` to `revertThread` to regenerate it. */
  | { type: "started"; turnId: string }
  /** A chunk of the assistant's reply. */
  | { type: "delta"; text: string }
  /** The turn finished. `text` is the full reply. */
  | { type: "done"; text: string; interrupted: boolean }
  /** The turn failed; no further events follow. */
  | { type: "error"; message: string; code: AIErrorCode };

export interface ThreadOptions {
  model: string;
  /** System-level guidance for the assistant (e.g. drafting instructions). */
  instructions?: string;
}

export interface SendMessageOptions extends ThreadOptions {
  threadId: string;
  text: string;
  effort: string;
  /** Aborting interrupts the turn; the stream then ends with `done` (interrupted: true). */
  signal?: AbortSignal;
}

export interface RevertThreadOptions extends ThreadOptions {
  threadId: string;
  /** This turn and every later one are dropped from the thread's history. */
  beforeTurnId: string;
}

export interface AIProvider {
  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<ModelInfo[]>;
  /** Starts a browser sign-in; open `authUrl` for the user. */
  startLogin(): Promise<{ authUrl: string }>;
  startThread(options: ThreadOptions): Promise<{ threadId: string }>;
  sendMessage(options: SendMessageOptions): AsyncIterable<ChatEvent>;
  /** Rewinds a thread, e.g. to regenerate a reply without the old one in context. */
  revertThread(options: RevertThreadOptions): Promise<void>;
  /** Removes a thread from the provider's own history. */
  deleteThread(threadId: string): Promise<void>;
  dispose(): Promise<void>;
}
