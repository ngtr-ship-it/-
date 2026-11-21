import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'task-notebook',
  component: 'Pane',
  requestId: 'task-notebook',
  props: {
    title: '📓 タスク帳',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('タスクを追加・完了・保存できる', async ($, on) => {
  const stored: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: stored[e.key] }))
  on('store.set', (_, e) => { stored[e.key] = e.value; return { value: undefined } })

  for (const surface of ['desktop', 'terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /まだタスク/ }))?.text).toBeTruthy()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'new-due', text: '2000-01-01', kind: 'change' })
  await ui.input({ key: 'new-title', text: '企画書を書く', kind: 'submit' })
  expect((await ui.find({ type: 'Text', text: /企画書を書く/ }))?.text).toContain('企画書を書く')
  expect((await ui.find({ type: 'Text', text: /期限切れ 1 件/ }))).toBeTruthy()
  const saved = stored['tasks'] as { title: string; done: boolean; due: string }[]
  expect(saved[0]?.due).toBe('2000-01-01')

  const id = (saved[0] as unknown as { id: string }).id
  await ui.press({ key: `toggle-${id}` })
  expect((stored['tasks'] as { done: boolean }[])[0]?.done).toBe(true)
  expect((await ui.find({ type: 'Text', text: /残り 0 件/ }))).toBeTruthy()

  await ui.input({ key: 'new-due', text: 'ほげ', kind: 'change' })
  await ui.input({ key: 'new-title', text: 'x', kind: 'submit' })
  expect((await ui.find({ type: 'Text', text: /読めません/ }))).toBeTruthy()
  await ui.unmount()
})
