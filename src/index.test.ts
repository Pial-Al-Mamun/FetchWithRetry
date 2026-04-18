import { describe, it, expect, mock, beforeEach } from "bun:test";
import { fetchWithRetry } from "./index";

describe("fetchWithRetry", () => {
  beforeEach(() => {
    // Cast to unknown first, then to the expected type
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("ok")),
    ) as unknown as typeof fetch;
  });

  it("returns successful response without retries", async () => {
    const res = await fetchWithRetry("https://api.example.com");
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on network failure", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("Network error"));
      return Promise.resolve(new Response("ok"));
    }) as unknown as typeof fetch;

    const res = await fetchWithRetry("https://api.example.com", { retry: 3 });
    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("retries on 500 status", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      if (calls < 2)
        return Promise.resolve(new Response(null, { status: 503 }));
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as unknown as typeof fetch;

    const res = await fetchWithRetry("https://api.example.com", { retry: 2 });
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("throws after max retries", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Network error")),
    ) as unknown as typeof fetch;

    await expect(
      fetchWithRetry("https://api.example.com", { retry: 2 }),
    ).rejects.toThrow("Network error");

    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("accepts number as retry config", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Fail")),
    ) as unknown as typeof fetch;

    await expect(
      fetchWithRetry("https://api.example.com", { retry: 1 }),
    ).rejects.toThrow();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("respects custom shouldRetry", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 404 })),
    ) as unknown as typeof fetch;

    const res = await fetchWithRetry("https://api.example.com", {
      retry: {
        maxRetries: 2,
        shouldRetry: (_, res) => res?.status === 404,
      },
    });

    expect(res.status).toBe(404);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
