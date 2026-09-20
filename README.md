# @basixllc/sdk

Upload media and send structured logs to BasiX. No dependencies.

```bash
npm i @basixllc/sdk
```

```ts
import { BasiX } from '@basixllc/sdk'

const basix = new BasiX({ apiKey: process.env.BASIX_KEY!, folder: 'screenshots' })

const file = await basix.upload(buffer, { filename: 'shot.png' })
console.log(file.url)

await basix.log({ level: 'warn', message: 'Suspicious money add', player: 'steam:1100001' })
```

## Keys

Create one in your client area. Use an **upload-scoped** key: it works on
every plan including the free one and cannot delete anything — which is what
you want in anything you deploy.

## Letting someone else upload

`presign()` mints a single-use URL. The key stays on your server; whoever gets
the URL can perform exactly one upload, into a folder you chose.

```ts
const { url } = await basix.presign({ type: 'image', folder: 'avatars' })
// hand `url` to the browser; it PUTs the file straight there
```

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
  { level: 'error', message: 'Transaction failed', metadata: { amount } },
])
```

MIT.
