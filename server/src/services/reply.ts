import type { EndpointReply } from '@wh/shared'
import { eventContext, type EventObject } from './event'
import { renderTemplate } from './expr'

export interface RenderedReply {
  body: string
  contentType: string
}

/** 渲染端点的直接响应；JSON 模式会在返回前校验模板结果。 */
export function renderReply(config: EndpointReply, event: EventObject): RenderedReply {
  const body = renderTemplate(config.body, eventContext(event))
  if (config.contentType === 'json') {
    try {
      JSON.parse(body)
    } catch {
      throw new Error('reply body is not valid JSON')
    }
    return { body, contentType: 'application/json; charset=utf-8' }
  }
  return { body, contentType: 'text/plain; charset=utf-8' }
}
