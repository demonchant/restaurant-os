import { z } from 'zod';

const errorEnvelope = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.array(z.object({ path: z.string().optional(), message: z.string() })).optional() }), requestId: z.string() });
export class ApiClientError extends Error { constructor(public readonly code: string, message: string, public readonly requestId?: string, public readonly status?: number) { super(message); this.name = 'ApiClientError'; } }

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie.split('; ').find((entry) => entry.startsWith('ros_csrf='))?.slice('ros_csrf='.length);
}

export class ApiClient {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 8_000) {}
  private async request<TOutput>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, schema: z.ZodType<TOutput>, input?: unknown,additionalHeaders?:Readonly<Record<string,string>>): Promise<TOutput> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const csrf = method !== 'GET' ? csrfToken() : undefined;
      const response = await fetch(new URL(path, this.baseUrl), { method, signal: controller.signal, cache: 'no-store', credentials: 'include', headers: { ...(input === undefined ? {} : { 'content-type': 'application/json' }), ...(csrf ? { 'x-csrf-token': csrf } : {}),...additionalHeaders }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
      const body: unknown = await response.json();
      if (!response.ok) { const parsed = errorEnvelope.safeParse(body); throw new ApiClientError(parsed.success ? parsed.data.error.code : 'INVALID_API_RESPONSE', parsed.success ? parsed.data.error.message : 'The API returned an invalid error', parsed.success ? parsed.data.requestId : undefined, response.status); }
      const parsed = z.object({ data: schema, requestId: z.string().min(1) }).safeParse(body);
      if (!parsed.success) throw new ApiClientError('INVALID_API_RESPONSE', 'The API returned an invalid response', undefined, response.status);
      return parsed.data.data;
    } finally { clearTimeout(timeout); }
  }
  get<TOutput>(path: string, schema: z.ZodType<TOutput>): Promise<TOutput> { return this.request('GET', path, schema); }
  post<TOutput>(path: string, input: unknown, schema: z.ZodType<TOutput>,headers?:Readonly<Record<string,string>>): Promise<TOutput> { return this.request('POST', path, schema, input,headers); }
  put<TOutput>(path: string, input: unknown, schema: z.ZodType<TOutput>): Promise<TOutput> { return this.request('PUT', path, schema, input); }
  patch<TOutput>(path: string, input: unknown, schema: z.ZodType<TOutput>): Promise<TOutput> { return this.request('PATCH', path, schema, input); }
  delete<TOutput>(path: string, schema: z.ZodType<TOutput>): Promise<TOutput> { return this.request('DELETE', path, schema); }
}
export const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');
