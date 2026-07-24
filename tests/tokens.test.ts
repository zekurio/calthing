import { assert, assertEquals } from '@std/assert'

import { signFeedToken, verifyFeedToken } from '../src/services/tokens.ts'

Deno.test('feed tokens embed the user id and verify round-trip', async () => {
  const token = await signFeedToken('s3cret', 'user-1')
  assert(token.startsWith('user-1.'))
  assertEquals(await verifyFeedToken('s3cret', token), 'user-1')
  // deterministic: the same user and secret always produce the same feed URL
  assertEquals(await signFeedToken('s3cret', 'user-1'), token)
})

Deno.test('feed tokens reject tampering, rotated secrets, and malformed input', async () => {
  const token = await signFeedToken('s3cret', 'user-1')
  const signature = token.slice(token.lastIndexOf('.') + 1)

  assertEquals(await verifyFeedToken('rotated', token), null)
  assertEquals(await verifyFeedToken('s3cret', `user-2.${signature}`), null)

  for (
    const malformed of [
      '',
      'user-1',
      'user-1.',
      '.only-signature',
      'user-1.not!base64url',
      `user-1.${signature.slice(0, -2)}`,
    ]
  ) {
    assertEquals(await verifyFeedToken('s3cret', malformed), null, JSON.stringify(malformed))
  }
})
