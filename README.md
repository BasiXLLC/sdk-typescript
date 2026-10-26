# @basixllc/sdk — media upload, CDN links and logs for Node & TypeScript

The official [BasiX](https://basix.agency/?utm_source=github&utm_medium=referral&utm_campaign=sdk-typescript) SDK for Node and TypeScript. Upload images, videos and audio to a CDN, mint presigned upload URLs, and send structured logs — from a Discord bot, a web panel, a FiveM tool or any backend. No dependencies.

- **Uploads** of images, videos and audio, with a permanent CDN link back — unlike Discord attachment links, they don't expire.
- **Presigned URLs** so a browser or game client uploads directly, without ever seeing your key.
- **Structured logs** with levels, players and metadata, searchable per player in the dashboard, with Discord webhook alerts.
- **Typed errors** carrying the API code (`RATE_LIMITED`, `QUOTA_EXCEEDED`…), so you can branch on them.
- **Fivemanage-compatible API**: same endpoints, same response shape.

Free tier, bandwidth never billed. Docs: [basix.agency/docs](https://basix.agency/docs?utm_source=github&utm_medium=referral&utm_campaign=sdk-typescript)

## Install

```bash
npm i github:BasiXLLC/sdk-typescript
```

Or a pinned build from the [latest release](https://github.com/BasiXLLC/sdk-typescript/releases/latest) (`.tgz`). Node 18+.

## Quick start

```ts
import { BasiX } from '@basixllc/sdk'

const basix = new BasiX({ apiKey: process.env.BASIX_KEY!, folder: 'screenshots' })

const file = await basix.upload(buffer, { filename: 'shot.png' })
console.log(file.url)

await basix.log({ level: 'warn', message: 'Suspicious money add', player: 'steam:1100001' })
```

## Keys

Create one in your [client area](https://basix.agency/?utm_source=github&utm_medium=referral&utm_campaign=sdk-typescript). Use an **upload-scoped** key: it works on
every plan including the free one and cannot delete anything — which is what
you want in anything you deploy.

## Letting someone else upload

`presign()` mints a single-use URL. The key stays on your server; whoever gets
the URL can perform exactly one upload, into a folder you chose.

```ts
const { url } = await basix.presign({ type: 'image', folder: 'avatars' })
// hand `url` to the browser; it PUTs the file straight there
```

## Listing and deleting

```ts
const { files, total } = await basix.list({ path: 'screenshots', limit: 50 })
await basix.delete(files[0].id)
```

`delete()` needs a full key; an upload-scoped key cannot delete.

## Errors

`BasiXError` carries the API's `code`, not just a sentence — matching on
wording breaks the moment anyone rephrases it.

```ts
try {
  await basix.upload(file)
} catch (e) {
  if (e instanceof BasiXError && e.retryable) { /* wait and try again */ }
}
```

## Logs

Batch them. One request per line spends more time on connections than on work
and meets the rate limit on any busy evening.

```ts
await basix.log([
  { level: 'info', message: 'Player joined', player: id },
  { level: 'error', message: 'Transaction failed', resource: 'banking', metadata: { amount } },
])
```

## FiveM server?

Use the Lua resource instead: [BasiXLLC/sdk-fivem](https://github.com/BasiXLLC/sdk-fivem). Setups for LB Phone, screenshot-basic and screencapture: [basix.agency/docs/integrations](https://basix.agency/docs/integrations?utm_source=github&utm_medium=referral&utm_campaign=sdk-typescript)

## License

MIT
