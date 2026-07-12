import { describe, it, expect } from "vitest";
import { integrationEnabled, liveClient } from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("system (integration)", () => {
  it("getMetrics(format=json) returns JSON containing version", async () => {
    const client = liveClient();
    const txt = await client.getMetrics("json");
    const parsed = JSON.parse(txt);
    expect(parsed).toHaveProperty("version");
  });

  it("getMetrics(format=prometheus) returns prometheus text", async () => {
    const client = liveClient();
    const txt = await client.getMetrics("prometheus");
    expect(txt).toContain("trilium_");
  });

  it("createBackup resolves with 204", async () => {
    const client = liveClient();
    await expect(client.createBackup("wf2test")).resolves.toBeUndefined();
  });

  // NOTE: logout is intentionally NOT tested — it would revoke the test token.
});
