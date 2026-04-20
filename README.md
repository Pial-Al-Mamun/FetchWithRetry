<h1 align="center">@pial/fetch-retry</h1>

<p align="center">
  🔄 A 0.74 KB fetch wrapper that doesn't give up.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@pial-al-mamun/fetch-retry">
    <img src="https://img.shields.io/npm/v/@pial-al-mamun/fetch-retry" alt="npm version">
  </a>
  <a href="https://bundlephobia.com/package/@pial-al-mamun/fetch-retry">
    <img src="https://img.shields.io/bundlephobia/minzip/@pial-al-mamun/fetch-retry" alt="bundle size">
  </a>
  <a href="https://github.com/Pial-Al-Mamun/FetchWithRetry/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="license">
  </a>
</p>

---

## Features

- **Automatic retries** — Network errors and 5xx responses
- **Exponential backoff** — Smart delay between retries
- **Jitter** — Prevents thundering herd
- **0.74 KB gzipped** — Zero dependencies
- **JSDoc support** — Type safety even in JavaScript

## Install

```bash
npm install @pial/fetch-retry
```

## API

### `fetchWithRetry(input, init?)`

Drop-in `fetch` wrapper that retries on network errors and (by default) HTTP `5xx` + `429`.

```ts
import { fetchWithRetry } from "@pial/fetch-retry";

const res = await fetchWithRetry("https://api.example.com/users", {
  retry: 5, // or: { maxRetries, delay, backoff, jitter, shouldRetry }
});

if (!res.ok) throw new Error(`HTTP ${res.status}`);
```

### `fetchJSON<T>(input, init?)`

Convenience wrapper around `fetchWithRetry` that calls `Response.json()` and returns typed JSON.

```ts
import { fetchJSON } from "@pial/fetch-retry";

type User = { id: string; name: string };
const user = await fetchJSON<User>("https://api.example.com/user/1", { retry: 3 });
```

