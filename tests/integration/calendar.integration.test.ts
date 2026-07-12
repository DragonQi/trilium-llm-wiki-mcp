import { describe, it, expect } from "vitest";
import { integrationEnabled, liveClient } from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("calendar (integration)", () => {
  it("gets a day note (auto-created)", async () => {
    const client = liveClient();
    const n = await client.getDayNote("2026-07-12");
    expect(n.noteId).toBeTruthy();
  });

  it("gets the inbox note", async () => {
    const client = liveClient();
    const n = await client.getInboxNote("2026-07-12");
    expect(n.noteId).toBeTruthy();
  });

  it("gets a week note (ISO week) or WEEK_NOT_FOUND", async () => {
    const client = liveClient();
    try {
      const n = await client.getWeekNote("2026-W28");
      expect(n.noteId).toBeTruthy();
    } catch (e) {
      // Week notes may be disabled in the test instance.
      expect((e as { code?: string }).code).toBe("WEEK_NOT_FOUND");
    }
  });
});
