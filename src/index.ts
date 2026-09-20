/**
 * BasiX SDK.
 *
 * No dependencies: `fetch`, `FormData` and `Blob` are in Node 18 and in every
 * runtime this is likely to run in. A media SDK that drags in an HTTP client
 * is a supply-chain risk its users did not ask for.
 */

export type BasiXOptions = {
  /** An upload-scoped key works everywhere and cannot delete. */
  apiKey: string
  /** Override only for testing. */
  baseUrl?: string
  /** Prefix applied to every upload from this client. */
  folder?: string
  /** Log stream. */
  dataset?: string
  fetch?: typeof globalThis.fetch
}

export type UploadedFile = {
  id: string
  url: string
  path: string
  size: number
  mime: string
  /** True when an existing file at that path was replaced. */
  replaced: boolean
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type LogEvent = {
  level?: LogLevel
  message: string
  player?: string
  resource?: string
  metadata?: Record<string, unknown>
  timestamp?: Date | string
}

/**
 * Carries the API's error CODE, not only its sentence.
 *
 * Matching on wording breaks the moment anyone rephrases it, silently. The
 * code is what lets a caller branch — retry on RATE_LIMITED, stop on
 * QUOTA_EXCEEDED, warn the operator on PLAN_REQUIRED.
 */
export class BasiXError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BasiXError'
  }

  /** Is waiting and trying again a reasonable thing to do? */
  get retryable(): boolean {
    return this.status >= 500 || this.code === 'RATE_LIMITED'
  }
}

type FileInput = Blob | ArrayBuffer | Uint8Array | { data: Uint8Array | ArrayBuffer; name?: string }

function toBlob(input: FileInput): { blob: Blob; name: string } {
  if (input instanceof Blob) return { blob: input, name: 'upload' }
  if (input instanceof ArrayBuffer) return { blob: new Blob([input]), name: 'upload' }
  if (input instanceof Uint8Array) return { blob: new Blob([input]), name: 'upload' }
  const bytes = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data)
  return { blob: new Blob([bytes]), name: input.name ?? 'upload' }
}

export class BasiX {
  private readonly key: string
  private readonly base: string
  private readonly folder?: string
  private readonly dataset: string
  private readonly http: typeof globalThis.fetch

  constructor(options: BasiXOptions) {
    if (!options.apiKey) throw new Error('apiKey is required')
    this.key = options.apiKey
    this.base = (options.baseUrl ?? 'https://upload.basix.agency').replace(/\/+$/, '')
    this.folder = options.folder
    this.dataset = options.dataset ?? 'default'
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  private destination(folder?: string): string | undefined {
    const parts = [this.folder, folder].filter(Boolean).map((p) => p!.replace(/^\/+|\/+$/g, ''))
    return parts.length ? `${parts.join('/')}/` : undefined
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.http(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.key}`, ...(init.headers ?? {}) },
    })

    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      // A non-JSON body from a proxy or a gateway. Reported as what it is
      // rather than as a parse error the caller cannot act on.
    }

    if (!response.ok) {
      const shaped = body as { error?: string; message?: string; code?: string } | null
      throw new BasiXError(
        shaped?.error ?? shaped?.message ?? `HTTP ${response.status}`,
        shaped?.code ?? 'UNKNOWN',
        response.status,
      )
    }
    return body as T
  }

  /** Uploads a file and returns its public address. */
  async upload(
    input: FileInput,
    options: { folder?: string; filename?: string; metadata?: Record<string, unknown>; keep?: boolean } = {},
  ): Promise<UploadedFile> {
    const { blob, name } = toBlob(input)
    const form = new FormData()
    form.append('file', blob, options.filename ?? name)
    const path = this.destination(options.folder)
    if (path) form.append('path', path)
    if (options.filename) form.append('filename', options.filename)
    if (options.metadata) form.append('metadata', JSON.stringify(options.metadata))
    if (options.keep) form.append('retentionExempt', 'true')

    const body = await this.request<{
      id: string
      url: string
      path: string
      size: number
      mime_type: string
      replaced: boolean
    }>('/api/v3/file', { method: 'POST', body: form })

    return {
      id: body.id,
      url: body.url,
      path: body.path,
      size: body.size,
      mime: body.mime_type,
      replaced: body.replaced,
    }
  }

  /**
   * Mints a short-lived upload URL for somebody else to use.
   *
   * The point: the key stays here and the URL is single use, so handing it to
   * a browser or a game client grants exactly one upload into a folder YOU
   * chose, and nothing more.
   */
  async presign(
    options: { type?: 'image' | 'video' | 'audio'; folder?: string } = {},
  ): Promise<{ url: string; expiresAt: Date }> {
    const body = await this.request<{ presignedUrl: string; expiresAt: string }>(
      '/api/v3/file/presigned-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: options.type ?? 'image', path: this.destination(options.folder) }),
      },
    )
    return { url: body.presignedUrl, expiresAt: new Date(body.expiresAt) }
  }

  async list(
    options: { page?: number; limit?: number; type?: string; path?: string } = {},
  ): Promise<{ files: UploadedFile[]; total: number }> {
    const query = new URLSearchParams()
    for (const [k, v] of Object.entries(options)) if (v != null) query.set(k, String(v))
    const body = await this.request<{
      data: { id: string; url: string; path: string; size: number; mime_type: string }[]
      pagination: { total: number }
    }>(`/api/v3/file?${query}`, { method: 'GET' })
    return {
      files: body.data.map((f) => ({ ...f, mime: f.mime_type, replaced: false })),
      total: body.pagination.total,
    }
  }

  /** By id, or by the path the file was stored at. */
  async delete(ref: string): Promise<void> {
    await this.request(`/api/v3/file/${encodeURIComponent(ref)}`, { method: 'DELETE' })
  }

  /**
   * Sends log events.
   *
   * Batch them. One request per line spends more time on connections than on
   * work, and will meet the per-key rate limit on any busy evening.
   */
  async log(events: LogEvent | LogEvent[]): Promise<{ accepted: number }> {
    const batch = (Array.isArray(events) ? events : [events]).map((e) => ({
      ...e,
      timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
    }))
    return this.request<{ accepted: number }>('/api/v1/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: this.dataset, events: batch }),
    })
  }
}

export default BasiX
