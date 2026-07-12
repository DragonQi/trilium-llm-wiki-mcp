import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import {
  loginHandler,
  logoutHandler,
  createBackupHandler,
  getMetricsHandler,
} from "../../../src/tools/system.js";

beforeEach(resetMockStore);

describe("logout handler", () => {
  it("delegates to client.logout", async () => {
    const client = mockClient();
    client.logout.mockResolvedValue(undefined);
    const res = await logoutHandler({}, client);
    expect(client.logout).toHaveBeenCalledWith();
    expect((res.content[0] as { text: string }).text).toContain("Logged out");
  });
});

describe("create_backup handler", () => {
  it("delegates to client.createBackup", async () => {
    const client = mockClient();
    client.createBackup.mockResolvedValue(undefined);
    const res = await createBackupHandler({ name: "nightly" }, client);
    expect(client.createBackup).toHaveBeenCalledWith("nightly");
    expect((res.content[0] as { text: string }).text).toContain("nightly");
  });
});

describe("get_metrics handler", () => {
  it("delegates to client.getMetrics with default json format", async () => {
    const client = mockClient();
    client.getMetrics.mockResolvedValue('{"version":"0.95.0"}');
    const res = await getMetricsHandler({}, client);
    expect(client.getMetrics).toHaveBeenCalledWith("json");
    expect((res.content[0] as { text: string }).text).toContain("0.95.0");
  });

  it("passes prometheus format through", async () => {
    const client = mockClient();
    client.getMetrics.mockResolvedValue("# HELP trilium …");
    await getMetricsHandler({ format: "prometheus" }, client);
    expect(client.getMetrics).toHaveBeenCalledWith("prometheus");
  });
});

describe("login handler", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs credentials to /etapi/auth/login and returns the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authToken: "tok_123" }),
    } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = mockClient();
    const res = await loginHandler({ password: "secret", tokenName: "etapi" }, client);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/etapi\/auth\/login$/);
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ password: "secret", tokenName: "etapi" });
    expect(JSON.parse((res.content[0] as { text: string }).text).authToken).toBe("tok_123");
  });

  it("surfaces a failed login as an error result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = mockClient();
    const res = await loginHandler({ password: "wrong" }, client);
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("login failed");
  });
});
