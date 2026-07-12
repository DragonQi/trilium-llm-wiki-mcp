import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EtapiErrorPayload } from "../etapi/types.js";

export type { CallToolResult };

export class EtapiError extends Error implements EtapiErrorPayload {
  readonly status: number;
  readonly code: string;
  constructor(payload: EtapiErrorPayload) {
    super(payload.message);
    this.name = "EtapiError";
    this.status = payload.status;
    this.code = payload.code;
  }
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export async function asToolResult<T>(
  fn: () => Promise<T>,
  stringify: (v: T) => string,
): Promise<CallToolResult> {
  try {
    const value = await fn();
    return { content: [{ type: "text", text: stringify(value) }] };
  } catch (err) {
    if (err instanceof EtapiError) {
      const retry = err.status >= 500 ? " (upstream failing; you may retry shortly)" : "";
      return toolError(`ETAPI ${err.code} (${err.status}): ${err.message}${retry}`);
    }
    return toolError(err instanceof Error ? err.message : String(err));
  }
}
