import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient } from './api-client';

afterEach(() => { vi.unstubAllGlobals(); });

describe('ApiClient', () => {
  it('posts JSON with cookie credentials and validates the response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { accepted: true }, requestId: 'request-1' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new ApiClient('http://localhost:3001').post('/api/v1/auth/logout', {}, z.object({ accepted: z.boolean() }));
    expect(result).toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledWith(new URL('http://localhost:3001/api/v1/auth/logout'), expect.objectContaining({ method: 'POST', credentials: 'include', body: '{}' }));
  });

  it('maps safe API errors and rejects malformed success responses', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Try later' }, requestId: 'request-2' }), { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: { wrong: true }, requestId: 'request-3' }), { status: 200 })));
    const client = new ApiClient('http://localhost:3001');
    await expect(client.get('/limited', z.object({ ok: z.boolean() }))).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, requestId: 'request-2' });
    await expect(client.get('/malformed', z.object({ ok: z.boolean() }))).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE' });
  });
});
