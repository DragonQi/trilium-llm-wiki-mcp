#!/usr/bin/env node
import { createClientFromEnv } from "../etapi/client.js";
import { cmdInit } from "./init.js";
import { cmdBrief } from "./brief.js";
import { cmdCheckpoint } from "./checkpoint.js";
import { cmdDoctor } from "./doctor.js";
import { cmdInstall } from "./install.js";
import type { CommandResult } from "./conventions.js";

function usage(): CommandResult {
  return {
    ok: false,
    stdout: "",
    stderr: "Usage: trilium-wiki <init|brief|checkpoint|doctor|install> [options]",
  };
}

export async function dispatch(argv: string[]): Promise<number> {
  const cmd = argv[2];
  let res: CommandResult;
  try {
    switch (cmd) {
      case "init":
        res = await cmdInit(createClientFromEnv());
        break;
      case "brief":
        res = await cmdBrief(createClientFromEnv());
        break;
      case "checkpoint":
        res = await cmdCheckpoint(createClientFromEnv());
        break;
      case "doctor":
        res = await cmdDoctor(createClientFromEnv());
        break;
      case "install":
        res = await cmdInstall({});
        break;
      default:
        res = usage();
    }
  } catch (e) {
    res = { ok: false, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
  }
  if (res.stdout) process.stdout.write(res.stdout + "\n");
  if (res.stderr) process.stderr.write(res.stderr + "\n");
  if (cmd === undefined) return 2;
  return res.ok ? 0 : 1;
}

async function main(): Promise<void> {
  const code = await dispatch(process.argv);
  process.exit(code);
}

void main();
