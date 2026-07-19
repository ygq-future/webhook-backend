import { describe, expect, test } from 'bun:test'
import { renderReply } from './reply'

const event = {
  method: 'GET',
  raw: '{"token":"abc"}',
  body: { token: 'abc' },
  headers: {},
  query: {},
  vars: {},
}

describe('renderReply', () => {
  test('renders a JSON reply with event variables', () => {
    expect(renderReply({ status: 200, contentType: 'json', body: '{"ok":true,"token":"{{token}}"}' }, event)).toEqual({
      body: '{"ok":true,"token":"abc"}',
      contentType: 'application/json; charset=utf-8',
    })
  })

  test('renders plain text replies', () => {
    expect(renderReply({ status: 204, contentType: 'text', body: 'heartbeat {{token}}' }, event)).toEqual({
      body: 'heartbeat abc',
      contentType: 'text/plain; charset=utf-8',
    })
  })

  test('rejects invalid rendered JSON', () => {
    expect(() => renderReply({ status: 200, contentType: 'json', body: '{oops}' }, event)).toThrow(
      'reply body is not valid JSON',
    )
  })
})
