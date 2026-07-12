import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import {
  getDayNoteHandler,
  getWeekNoteHandler,
  getInboxNoteHandler,
} from "../../../src/tools/calendar.js";

beforeEach(resetMockStore);

describe("calendar handlers", () => {
  it("get_day_note delegates", async () => {
    const client = mockClient();
    client.getDayNote.mockResolvedValue({ noteId: "d1" });
    const res = await getDayNoteHandler({ date: "2026-07-12" }, client);
    expect(client.getDayNote).toHaveBeenCalledWith("2026-07-12");
    expect(JSON.parse((res.content[0] as { text: string }).text).noteId).toBe("d1");
  });

  it("get_week_note delegates with ISO week", async () => {
    const client = mockClient();
    client.getWeekNote.mockResolvedValue({ noteId: "w1" });
    await getWeekNoteHandler({ week: "2026-W28" }, client);
    expect(client.getWeekNote).toHaveBeenCalledWith("2026-W28");
  });

  it("get_inbox_note delegates", async () => {
    const client = mockClient();
    client.getInboxNote.mockResolvedValue({ noteId: "in1" });
    await getInboxNoteHandler({ date: "2026-07-12" }, client);
    expect(client.getInboxNote).toHaveBeenCalledWith("2026-07-12");
  });
});
