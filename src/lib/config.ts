export interface Config {
  url: string;
  token: string;
  timeoutMs: number;
  verifyTls: boolean;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var ${key}`);
  }
  return v.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const url = required(env, "TRILIUM_URL").replace(/\/+$/, "");
  const token = required(env, "TRILIUM_TOKEN");
  const timeoutMs = env.TRILIUM_TIMEOUT ? Number.parseInt(env.TRILIUM_TIMEOUT, 10) : 30000;
  const verifyTls = env.TRILIUM_VERIFY_TLS ? env.TRILIUM_VERIFY_TLS !== "0" : true;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`TRILIUM_TIMEOUT must be a positive integer (got ${env.TRILIUM_TIMEOUT})`);
  }
  return { url, token, timeoutMs, verifyTls };
}
