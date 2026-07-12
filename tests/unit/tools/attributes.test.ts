import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import {
  getAttributesHandler,
  setAttributeHandler,
  deleteAttributeHandler,
  addAttributeHandler,
} from "../../../src/tools/attributes.js";

beforeEach(resetMockStore);

describe("get_attributes handler", () => {
  it("returns attributes JSON", async () => {
    const client = mockClient();
    client.getNoteAttributes.mockResolvedValue([{ attributeId: "a1", name: "k" }]);
    const res = await getAttributesHandler({ noteId: "n1" }, client);
    expect(client.getNoteAttributes).toHaveBeenCalledWith("n1");
    expect(JSON.parse((res.content[0] as { text: string }).text)[0].attributeId).toBe("a1");
  });
});

describe("set_attribute handler", () => {
  it("upserts via client.upsertAttribute", async () => {
    const client = mockClient();
    client.upsertAttribute.mockResolvedValue({ attributeId: "a1", value: "v" });
    const res = await setAttributeHandler(
      { noteId: "n1", type: "label", name: "k", value: "v" },
      client,
    );
    expect(client.upsertAttribute).toHaveBeenCalledWith({
      noteId: "n1",
      type: "label",
      name: "k",
      value: "v",
      isInheritable: undefined,
    });
    expect(res.isError).toBeFalsy();
  });
});

describe("delete_attribute handler", () => {
  it("deletes and confirms", async () => {
    const client = mockClient();
    client.deleteAttribute.mockResolvedValue(undefined);
    const res = await deleteAttributeHandler({ attributeId: "a1" }, client);
    expect(client.deleteAttribute).toHaveBeenCalledWith("a1");
    expect((res.content[0] as { text: string }).text).toContain("a1");
  });
});

describe("add_attribute handler", () => {
  it("creates via client.createAttribute (create-only, does NOT upsert)", async () => {
    const client = mockClient();
    client.createAttribute.mockResolvedValue({ attributeId: "a1", value: "t1" });
    const res = await addAttributeHandler(
      { noteId: "n1", type: "relation", name: "relatesTo", value: "t1" },
      client,
    );
    expect(client.createAttribute).toHaveBeenCalledWith({
      noteId: "n1",
      type: "relation",
      name: "relatesTo",
      value: "t1",
      isInheritable: undefined,
    });
    expect(client.upsertAttribute).not.toHaveBeenCalled();
    expect(res.isError).toBeFalsy();
  });

  it("passes isInheritable through", async () => {
    const client = mockClient();
    client.createAttribute.mockResolvedValue({ attributeId: "a2" });
    await addAttributeHandler(
      { noteId: "n2", type: "label", name: "k", value: "v", isInheritable: true },
      client,
    );
    expect(client.createAttribute).toHaveBeenCalledWith({
      noteId: "n2",
      type: "label",
      name: "k",
      value: "v",
      isInheritable: true,
    });
  });
});
