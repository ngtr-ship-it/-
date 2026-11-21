import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Filter, Priority, Task } from '../types'

const PANE = 'task-notebook'
const TITLE = '📓 タスク帳'
const STORE_KEY = 'tasks'

const tasks = atom({ plugin: 'task-notebook', key: 'tasks' } as const, [], {
  shape: 'tasks-1',
})
const filter = atom({ plugin: 'task-notebook', key: 'filter' } as const, 'active')
const draftPri = atom({ plugin: 'task-notebook', key: 'draftPri' } as const, 'mid')
const draftDue = atom({ plugin: 'task-notebook', key: 'draftDue' } as const, '')
const notice = atom({ plugin: 'task-notebook', key: 'notice' } as const, '')

const PRI_ORDER: Record<Priority, number> = { high: 0, mid: 1, low: 2 }
const PRI_LABEL: Record<Priority, string> = { high: '高', mid: '中', low: '低' }
const PRI_COLOR: Record<Priority, string> = { high: '#d0603f', mid: '#d69a2d', low: '#5c9a6b' }

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: '未完了' },
  { value: 'today', label: '今日' },
  { value: 'over', label: '期限切れ' },
  { value: 'done', label: '完了' },
  { value: 'all', label: 'すべて' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = () => ymd(new Date())

/** 「今日」「明日」「11/25」「2026-11-25」などを YYYY-MM-DD に。空なら ''、読めなければ null。 */
function parseDue(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  const now = new Date()
  const offsets: Record<string, number> = { 今日: 0, きょう: 0, 明日: 1, あした: 1, 明後日: 2, あさって: 2 }
  const off = offsets[s]
  if (off !== undefined) {
    now.setDate(now.getDate() + off)
    return ymd(now)
  }
  const full = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (full) return `${full[1]}-${pad(Number(full[2]))}-${pad(Number(full[3]))}`
  const md = s.match(/^(\d{1,2})[-/.](\d{1,2})$/)
  if (md) {
    const mmdd = `${pad(Number(md[1]))}-${pad(Number(md[2]))}`
    const y = now.getFullYear()
    // 過ぎた日付は来年とみなす
    return `${y}-${mmdd}` < today() ? `${y + 1}-${mmdd}` : `${y}-${mmdd}`
  }
  return null
}

function fmtDue(s: string) {
  const [y = 0, m = 1, d = 1] = s.split('-').map(Number)
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()]
  return `${y !== new Date().getFullYear() ? y + '/' : ''}${m}/${d}(${w})`
}

const dueState = (t: Task) =>
  !t.due || t.done ? '' : t.due < today() ? 'over' : t.due === today() ? 'today' : ''

const matches: Record<Filter, (t: Task) => boolean> = {
  active: t => !t.done,
  today: t => !t.done && t.due === today(),
  over: t => dueState(t) === 'over',
  done: t => t.done,
  all: () => true,
}

const sortTasks = (list: Task[]) =>
  [...list].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.due || '9999').localeCompare(b.due || '9999') ||
      PRI_ORDER[a.pri] - PRI_ORDER[b.pri] ||
      a.created - b.created,
  )

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** タスクを書き換え、セッションをまたいで残るよう $.store にも保存する。 */
async function changeTasks($: EngineInterface, fn: (list: Task[]) => Task[]) {
  await update($, tasks, list => fn(list ?? []))
  await $.store.set(STORE_KEY, await read($, tasks))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    if (Array.isArray(saved)) await update($, tasks, () => saved as Task[])
    await $.command.register({ name: 'tasknote', description: 'タスク帳のペインを開く' })
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'tasknote' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'タスク帳を開きました。' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
    const all = await read($, tasks)
    const f = await read($, filter)
    const pri = await read($, draftPri)
    const due = await read($, draftDue)
    const msg = await read($, notice)

    const shown = sortTasks(all.filter(matches[f]))
    const remain = all.filter(t => !t.done).length
    const over = all.filter(t => dueState(t) === 'over').length
    const room = Math.max(3, (e.viewport?.rows ?? 30) - 14)

    const add = async (value: string) => {
      const title = value.trim()
      if (!title) return
      const parsed = parseDue(due)
      if (parsed === null) {
        await update($, notice, () => `期限「${due}」が読めません（例：明日、11/25、2026-11-25）`)
        return
      }
      await changeTasks($, list => [
        ...list,
        { id: uid(), title, due: parsed, pri, done: false, created: Date.now() },
      ])
      await update($, draftDue, () => '')
      await update($, notice, () => '')
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          残り {remain} 件 / 全 {all.length} 件{over ? `（期限切れ ${over} 件）` : ''}
        </Text>

        <Box flexDirection="column" gap={1}>
          <Input key="new-title" placeholder="やることを入力して Enter" submitLabel="追加" autoFocus onSubmit={add} />
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Input
              key="new-due"
              label="期限"
              placeholder="明日 / 11/25"
              value={due}
              onInput={v => void update($, draftDue, () => v)}
              onSubmit={v => void update($, draftDue, () => v)}
            />
            <Select
              key="new-pri"
              label="優先度"
              value={pri}
              options={(['high', 'mid', 'low'] as const).map(p => ({ value: p, label: PRI_LABEL[p] }))}
              onSelect={v => void update($, draftPri, () => v as Priority)}
            />
          </Box>
          {msg ? <Text color="#d0603f">{msg}</Text> : null}
        </Box>

        <Select
          key="filter"
          label="表示"
          value={f}
          options={FILTERS.map(x => ({
            value: x.value,
            label: `${x.label} (${all.filter(matches[x.value]).length})`,
          }))}
          onSelect={v => void update($, filter, () => v as Filter)}
        />

        <Box flexDirection="column">
          {shown.length === 0 && (
            <Text dimColor>{all.length ? '該当するタスクはありません' : 'まだタスクがありません ✍️'}</Text>
          )}
          {shown.slice(0, room).map(t => {
            const ds = dueState(t)
            return (
              <Box key={`row-${t.id}`} flexDirection="row" gap={1} alignItems="flex-start">
                <Button
                  key={`toggle-${t.id}`}
                  plain
                  label={t.done ? '☑' : '☐'}
                  onPress={() =>
                    void changeTasks($, list => list.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))
                  }
                />
                <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                  <Text strikethrough={t.done} dimColor={t.done} wrap="wrap">
                    <Text color={PRI_COLOR[t.pri]}>●</Text> {t.title}
                  </Text>
                  {t.due ? (
                    <Text
                      size="caption"
                      color={ds === 'over' ? '#d0603f' : ds === 'today' ? '#d69a2d' : undefined}
                      dimColor={!ds}
                    >
                      {ds === 'over' ? '⚠ ' : ''}
                      {fmtDue(t.due)}
                      {ds === 'today' ? ' 今日' : ''}
                    </Text>
                  ) : null}
                </Box>
                <Button
                  key={`del-${t.id}`}
                  plain
                  dimColor
                  label="✕"
                  onPress={() => void changeTasks($, list => list.filter(x => x.id !== t.id))}
                />
              </Box>
            )
          })}
          {shown.length > room && <Text dimColor>…ほか {shown.length - room} 件</Text>}
        </Box>

        {all.some(t => t.done) && (
          <Button key="clear-done" dimColor onPress={() => void changeTasks($, list => list.filter(t => !t.done))}>
            完了済みを削除
          </Button>
        )}
      </Box>
    )
  })
}
