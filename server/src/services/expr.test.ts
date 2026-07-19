import { describe, expect, test } from 'bun:test'
import { getByPath, renderTemplate, stringify } from './expr'

describe('expr', () => {
  const obj = {
    a: { b: { c: 'hello' } },
    list: [{ id: 1 }, { id: 2 }],
    num: 42,
  }

  test('getByPath: 支持嵌套与数组下标', () => {
    expect(getByPath(obj, 'a.b.c')).toBe('hello')
    expect(getByPath(obj, 'list[1].id')).toBe(2)
    expect(getByPath(obj, 'list.0.id')).toBe(1)
    expect(getByPath(obj, 'missing.path')).toBeUndefined()
    expect(getByPath(obj, '')).toBe(obj)
  })

  test('stringify: 归一各类型为文本', () => {
    expect(stringify('x')).toBe('x')
    expect(stringify(42)).toBe('42')
    expect(stringify(true)).toBe('true')
    expect(stringify(null)).toBe('')
    expect(stringify({ a: 1 })).toBe('{"a":1}')
  })

  test('renderTemplate: 替换 {{path}}', () => {
    expect(renderTemplate('值={{a.b.c}} 数={{num}}', obj)).toBe('值=hello 数=42')
    expect(renderTemplate('缺={{no.such}}', obj)).toBe('缺=')
  })
})
