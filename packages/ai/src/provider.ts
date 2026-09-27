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

export type ChatEvent =
  /** A chunk of the assistant's reply. */
  | { type: "delta"; text: string }
  /** The turn finished. `text` is the full reply. */
  | { type: "done"; text: string; interrupted: boolean }
  /** The turn failed; no further events follow. */
  | { type: "error"; message: string };

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

export interface AIProvider {
  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<ModelInfo[]>;
  /** Starts a browser sign-in; open `authUrl` for the user. */
  startLogin(): Promise<{ authUrl: string }>;
  startThread(options: ThreadOptions): Promise<{ threadId: string }>;
  sendMessage(options: SendMessageOptions): AsyncIterable<ChatEvent>;
  dispose(): Promise<void>;
}
