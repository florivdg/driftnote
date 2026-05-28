// Native AbortController.abort() rejects with a DOMException whose name is
// "AbortError"; instanceof DOMException is the safe way to detect it.
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export async function fetchJSON<T>(
  href: string,
  signal: AbortSignal,
): Promise<T> {
  const res = await fetch(href, {
    signal,
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${href} → ${res.status}`);
  return (await res.json()) as T;
}

// Returns a fetch runner that aborts any in-flight call before starting a new
// one. Stale results (AbortError) are swallowed; other errors propagate so the
// caller can decide whether to log, reload, or retry. `dispose()` cancels the
// current in-flight call on unmount.
export function createAbortableFetcher() {
  let controller: AbortController | null = null;
  return {
    async run<T>(
      loader: (signal: AbortSignal) => Promise<T>,
    ): Promise<T | undefined> {
      controller?.abort();
      const c = new AbortController();
      controller = c;
      try {
        return await loader(c.signal);
      } catch (err) {
        if (isAbortError(err)) return undefined;
        throw err;
      }
    },
    dispose() {
      controller?.abort();
      controller = null;
    },
  };
}
