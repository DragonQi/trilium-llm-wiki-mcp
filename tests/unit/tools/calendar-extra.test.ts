import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import {
  getWeekNoteByDateHandler,
  getMonthNoteHandler,
  getYearNoteHandler,
} from "../../../src/tools/calendar-extra.js";

beforeEach(resetMockStore);

describe("calendar-extra handlers", () => {
  it("get_week_note_by_date delegates to client.getWeekFirstDayNote", async () => {
    const client = mockClient();
    client.getWeekFirstDayNote.mockResolvedValue({ noteId: "w1" });
    const res = await getWeekNoteByDateHandler({ date: "2026-07-12" }, client);
    expect(client.getWeekFirstDayNote).toHaveBeenCalledWith("2026-07-12");
    expect(JSON.parse((res.content[0] as { text: string }).text).noteId).toBe("w1");
  });

  it("get_month_note delegates to client.getMonthNote", async () => {
    const client = mockClient();
    client.getMonthNote.mockResolvedValue({ noteId: "m1" });
    const res = await getMonthNoteHandler({ month: "2026-07" }, client);
    expect(client.getMonthNote).toHaveBeenCalledWith("2026-07");
    expect(JSON.parse((res.content[0] as { text: string }).text).noteId).toBe("m1");
  });

  it("get_year_note delegates to client.getYearNote", async () => {
    const client = mockClient();
    client.getYearNote.mockResolvedValue({ noteId: "yr1" });
    const res = await getYearNoteHandler({ year: "2026" }, client);
    expect(client.getYearNote).toHaveBeenCalledWith("2026");
    expect(JSON.parse((res.content[0] as { text: string }).text).noteId).toBe("yr1");
  });
});
