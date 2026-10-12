import { describe, expect, it } from 'vitest';
import { createOpaqueToken, hashToken, safeEqual } from './index.js';
describe('security utilities', () => {
  it('creates non-repeating opaque tokens', () => expect(createOpaqueToken()).not.toBe(createOpaqueToken()));
  it('hashes tokens deterministically with a pepper', () => expect(hashToken('x', 'p')).toBe(hashToken('x', 'p')));
  it('compares without accepting different lengths', () => expect(safeEqual('a', 'aa')).toBe(false));
});
