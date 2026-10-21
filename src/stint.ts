import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";

export const defaultApiUrl = "https://getstint.dev";
export const clientId = "stint-vscode";

const stintDir = () => process.env.STINT_HOME ?? join(homedir(), ".stint");
export const configPath = () => join(stintDir(), "config.json");
const queuePath = () => join(stintDir(), "queue.jsonl");

export type SharedConfig = {
  apiUrl?: string;
  apiKey?: string;
  username?: string;
  email?: string;
  machine?: string;
  [key: string]: unknown;
};

export type Heartbeat = {
  entity: string;
  type: "file" | "app";
  category: string;
  time: number;
  project?: string;
  branch?: string;
  language?: string;
  is_write?: boolean;
  editor?: string;
  machine?: string;
  lines?: number;
};

export function readShared(): SharedConfig {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8")) as SharedConfig;
  } catch {
    return {};
  }
}

export function writeShared(changes: Partial<SharedConfig>) {
  const next: SharedConfig = { ...readShared(), ...changes };
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  mkdirSync(dirname(configPath()), { recursive: true });
  const temp = `${configPath()}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, configPath());
  if (process.platform !== "win32") chmodSync(configPath(), 0o600);
}

export function normalizeApiUrl(value: string | undefined): string {
  if (!value) return defaultApiUrl;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return defaultApiUrl;
    return url.origin;
  } catch {
    return defaultApiUrl;
  }
}

export const machineName = () => (readShared().machine as string | undefined) ?? hostname();

export class StintError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function request<T>(
  apiUrl: string,
  path: string,
  options: { body?: unknown; token?: string; userAgent: string; timeoutMs?: number },
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", "user-agent": options.userAgent };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: options.body === undefined ? "GET" : "POST",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch {
    throw new StintError(`Couldn't reach ${apiUrl}.`, 0, "network");
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) {
    const record = (body ?? {}) as { error?: string; error_description?: string };
    throw new StintError(
      record.error_description ?? record.error ?? `Stint answered ${response.status}.`,
      response.status,
      typeof record.error === "string" ? record.error : undefined,
    );
  }
  return body as T;
}

export function enqueue(items: Heartbeat[]) {
  if (!items.length) return;
  mkdirSync(stintDir(), { recursive: true });
  appendFileSync(queuePath(), items.map((item) => JSON.stringify(item)).join("\n") + "\n");
}

export function claimQueue(): { items: Heartbeat[]; done: () => void; release: (unsent: Heartbeat[]) => void } | null {
  if (!existsSync(queuePath())) return null;
  const claim = `${queuePath()}.claim-${process.pid}-${Date.now()}`;
  try {
    renameSync(queuePath(), claim);
  } catch {
    return null;
  }
  const items: Heartbeat[] = [];
  for (const line of readFileSync(claim, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line) as Heartbeat);
    } catch {}
  }
  return {
    items: items.slice(-20_000),
    done: () => rmSync(claim, { force: true }),
    release: (unsent) => {
      rmSync(claim, { force: true });
      enqueue(unsent.slice(-20_000));
    },
  };
}
