export type Priority = 'high' | 'mid' | 'low'
export type Task = {
  id: string
  title: string
  due: string
  pri: Priority
  done: boolean
  created: number
}
export type Filter = 'active' | 'today' | 'over' | 'done' | 'all'

declare module 'claude-code' {
  interface PluginState {
    'task-notebook': {
      tasks: Shaped<Task[]>
      filter: Filter
      draftPri: Priority
      draftDue: string
      notice: string
    }
  }
}
