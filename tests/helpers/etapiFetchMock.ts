type ResponseSpec = { status?: number; body?: unknown; headers?: Record<string, string> };

export type FetchRoute = {
  match: RegExp;
  method?: string;
  respond: ResponseSpec | (() => ResponseSpec);
};

// `routes` is a mutable field the stub reads through the object reference,
// so tests can reassign `fetchMock.routes = [...]` per case.
export function makeFetchMock(initialRoutes: FetchRoute[] = []) {
  const calls: { method: string; url: string; init?: RequestInit }[] = [];
  const api: { routes: FetchRoute[]; calls: typeof calls; stub: typeof fetch } = {
    routes: initialRoutes,
    calls,
    stub: async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const url = typeof input === "string" ? input : (input as URL).toString();
      calls.push({ method, url, init });
      const route = api.routes.find((r) => (r.method ?? "GET") === method && r.match.test(url));
      if (!route) throw new Error(`fetch mock: no route for ${method} ${url}`);
      const spec = typeof route.respond === "function" ? route.respond() : route.respond;
      const status = spec.status ?? 200;
      const body = spec.body;
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(spec.headers),
        async text() {
          return typeof body === "string" ? body : JSON.stringify(body ?? "");
        },
        async json() {
          return typeof body === "string" ? JSON.parse(body) : body;
        },
      } as Response;
    },
  };
  return api;
}
