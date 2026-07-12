import { describe, it, expect, beforeAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import { integrationEnabled, liveClient } from "../helpers/integration.js";
import { cmdInit } from "../../src/cli/init.js";
import { cmdBrief } from "../../src/cli/brief.js";
import { cmdCheckpoint } from "../../src/cli/checkpoint.js";
import { cmdDoctor } from "../../src/cli/doctor.js";
import { findVaultRoot } from "../../src/cli/vault.js";

const describeIntegration = integrationEnabled() ? describe : describe.skip;

describeIntegration("trilium-wiki CLI (integration)", () => {
  let client: EtapiClient;

  beforeAll(() => {
    client = liveClient();
  });
  // No afterAll cleanup: the LLM Wiki vault is a persistent user artifact, not test
  // scaffolding. init is idempotent, so leaving it is correct and expected.

  it("init seeds the vault idempotently", async () => {
    const r1 = await cmdInit(client);
    expect(r1.ok).toBe(true);
    const root = await findVaultRoot(client);
    expect(root).toBeTruthy();

    const r2 = await cmdInit(client);
    expect(r2.ok).toBe(true);
    // On the second call nothing new is created (whether or not it pre-existed).
    expect(r2.stdout).toContain("none — already seeded");
  });

  it("doctor passes after init", async () => {
    const r = await cmdDoctor(client);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("[OK] Trilium");
    expect(r.stdout).toContain("[OK] Vault");
  });

  it("brief returns a wiki brief with flags", async () => {
    const r = await cmdBrief(client);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("LLM Wiki brief");
    expect(r.stdout).toContain("weak-confidence pages:");
  });

  it("checkpoint appends a session entry to the Log", async () => {
    const r = await cmdCheckpoint(client);
    expect(r.ok).toBe(true);
    const root = await findVaultRoot(client);
    expect(root).toBeTruthy();
    const log = await client.searchNotes({
      search: "#wikiLayer=log",
      ancestorNoteId: root!.noteId,
      ancestorDepth: "eq1",
    });
    expect(log.length).toBeGreaterThan(0);
    const body = await client.getNoteContent(log[0]!.noteId);
    expect(body).toMatch(/## \[\d{4}-\d{2}-\d{2}\] session \| end/);
  });
});
