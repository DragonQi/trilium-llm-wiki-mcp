export function toBase64(b: Buffer): string {
  return b.toString("base64");
}

export function fromBase64(s: string): Buffer {
  return Buffer.from(s, "base64");
}
