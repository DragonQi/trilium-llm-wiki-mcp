import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { getAttributeHandler, updateAttributeHandler } from "../../../src/tools/attributes-extra.js";

beforeEach(resetMockStore);

describe("get_attribute handler", () => {
  it("delegates to client.getAttribute", async () => {
    const client = mockClient();
    client.getAttribute.mockResolvedValue({ attributeId: "a1", name: "k", value: "v" });
    const res = await getAttributeHandler({ attributeId: "a1" }, client);
    expect(client.getAttribute).toHaveBeenCalledWith("a1");
    expect(JSON.parse((res.content[0] as { text: string }).text).attributeId).toBe("a1");
  });
});

describe("update_attribute handler", () => {
  it("delegates to client.updateAttribute with patch", async () => {
    const client = mockClient();
    client.updateAttribute.mockResolvedValue({ attributeId: "a1", value: "new" });
    const res = await updateAttributeHandler({ attributeId: "a1", value: "new" }, client);
    expect(client.updateAttribute).toHaveBeenCalledWith("a1", { value: "new" });
    expect(JSON.parse((res.content[0] as { text: string }).text).value).toBe("new");
  });
});
