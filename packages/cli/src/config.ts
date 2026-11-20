import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type AgentConfig = {
  baseUrl: string;
  token?: string;
  userId?: string;
};

export type ConfigOverrides = {
  baseUrl?: string;
  token?: string;
  userId?: string;
};

const DEFAULT_BASE = 'https://api.canopi.live';

function configFilePath(): string {
  const fromEnv = process.env.CANOPI_CONFIG_FILE?.trim();
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), '.config', 'canopi', 'agent.json');
}

export function getConfigFilePath(): string {
  return configFilePath();
}

function readConfigFile(): Partial<AgentConfig> {
  const file = configFilePath();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
      token:
        typeof parsed.token === 'string'
          ? parsed.token
          : typeof parsed.bearer === 'string'
            ? parsed.bearer
            : undefined,
      userId:
        typeof parsed.userId === 'string'
          ? parsed.userId
          : typeof parsed.user_id === 'string'
            ? parsed.user_id
            : undefined,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {};
    throw new Error(`Failed to read ${file}: ${(err as Error).message}`);
  }
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export function loadConfig(overrides: ConfigOverrides = {}): AgentConfig {
  const file = readConfigFile();
  const baseUrl =
    trimOrUndefined(overrides.baseUrl) ??
    trimOrUndefined(process.env.CANOPI_API_BASE) ??
    file.baseUrl ??
    DEFAULT_BASE;
  const token =
    trimOrUndefined(overrides.token) ??
    trimOrUndefined(process.env.CANOPI_TOKEN) ??
    trimOrUndefined(process.env.CANOPI_BEARER) ??
    file.token;
  const userId =
    trimOrUndefined(overrides.userId) ??
    trimOrUndefined(process.env.CANOPI_USER_ID) ??
    file.userId;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token,
    userId,
  };
}

export function maskToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  if (token.length <= 12) return '***';
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function configFileHint(): string {
  return configFilePath();
}

export type SaveConfigOptions = {
  baseUrl: string;
  token: string;
  /** Not needed for agent tokens (cag_…), which identify the agent themselves. */
  userId?: string;
  userName?: string;
  userHandle?: string;
};

export function saveConfig(options: SaveConfigOptions): string {
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    token: options.token,
    userId: options.userId,
    userName: options.userName,
    userHandle: options.userHandle,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows */
  }
  return file;
}

export function clearConfig(): boolean {
  const file = configFilePath();
  try {
    fs.unlinkSync(file);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return false;
    throw err;
  }
}
