import { describe, it, expect } from "vitest";
import { integrationEnabled, liveClient } from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("calendar-extra (integration)", () => {
  it("gets a month note (auto-created)", async () => {
    const client = liveClient();
    const n = await client.getMonthNote("2026-07");
    expect(n.noteId).toBeTruthy();
  });

  it("gets a year note (auto-created)", async () => {
    const client = liveClient();
    const n = await client.getYearNote("2026");
    expect(n.noteId).toBeTruthy();
  });

  it("gets a week note by date (auto-created)", async () => {
    const client = liveClient();
    const n = await client.getWeekFirstDayNote("2026-07-12");
    expect(n.noteId).toBeTruthy();
  });
});
