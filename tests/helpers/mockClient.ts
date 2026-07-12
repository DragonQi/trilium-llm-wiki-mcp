import { vi } from "vitest";

// Returns a deeply-mocked EtapiClient: every accessed method is a memoized vi.fn().
// Intentionally `any` so the result is assignable to EtapiClient (for handlers)
// while still exposing the vitest mock API (.mockResolvedValue, etc.) in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockClient(): any {
  const store: Record<string, ReturnType<typeof vi.fn>> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({} as any, {
    get(_t, prop) {
      const key = String(prop);
      if (!store[key]) store[key] = vi.fn();
      return store[key];
    },
  });
}

export function resetMockStore(): void {
  // Each mockClient() builds its own store; kept as a no-op for test symmetry.
}
