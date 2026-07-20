import { describe, expect, test } from 'bun:test'
import { redactHeaders } from './redact'

describe('redactHeaders', () => {
  test('redacts authentication and credential-like headers while preserving ordinary headers', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer secret',
        'X-Api-Key': 'key',
        Cookie: 'session=secret',
        'X-Request-Id': 'req-1',
      }),
    ).toEqual({
      Authorization: '[REDACTED]',
      'X-Api-Key': '[REDACTED]',
      Cookie: '[REDACTED]',
      'X-Request-Id': 'req-1',
    })
  })
})
