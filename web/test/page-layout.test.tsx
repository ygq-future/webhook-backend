import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { PageBody, PageHeader, PageLayout } from '../src/components/page-layout'

describe('page layout scroll boundaries', () => {
  test('keeps the page inside the available viewport height', () => {
    const html = renderToStaticMarkup(
      <PageLayout>
        <PageHeader>toolbar</PageHeader>
        <PageBody>content</PageBody>
      </PageLayout>,
    )

    expect(html).toContain('h-full')
    expect(html).toContain('min-h-0')
    expect(html).toContain('overflow-hidden')
  })

  test('keeps the header fixed while only the body scrolls', () => {
    const header = renderToStaticMarkup(<PageHeader>toolbar</PageHeader>)
    const body = renderToStaticMarkup(<PageBody>content</PageBody>)

    expect(header).toContain('shrink-0')
    expect(header).not.toContain('overflow-y-auto')
    expect(body).toContain('min-h-0')
    expect(body).toContain('overflow-y-auto')
    expect(body).toContain('overscroll-contain')
  })
})
