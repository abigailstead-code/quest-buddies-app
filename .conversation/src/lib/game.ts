import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import type { GameState, PlayerId, Quest, QuestPriority } from '../types/game'

export const priorityValues: Record<QuestPriority, { coins: number; xp: number; label: string }> = {
  small: { coins: 10, xp: 25, label: 'Small quest' },
  medium: { coins: 20, xp: 50, label: 'Standard quest' },
  major: { coins: 40, xp: 100, label: 'Boss quest' },
}

export const id = () => crypto.randomUUID()

export function weekStart(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date
  return startOfWeek(d, { weekStartsOn: 1 })
}

export function weekEnd(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date
  return endOfWeek(d, { weekStartsOn: 1 })
}

export function levelForDate(date: Date | string, journeyStartDate: string) {
  const start = weekStart(parseISO(journeyStartDate))
  const target = weekStart(date)
  const delta = differenceInCalendarDays(target, start)
  return Math.max(1, Math.floor(delta / 7) + 1)
}

export function levelDates(level: number, journeyStartDate: string) {
  const first = weekStart(parseISO(journeyStartDate))
  const start = addDays(first, (level - 1) * 7)
  const end = addDays(start, 6)
  return { start, end }
}

export function formatLevelDates(level: number, journeyStartDate: string) {
  const { start, end } = levelDates(level, journeyStartDate)
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'MMM d')}–${format(end, 'd')}`
  }
  return `${format(start, 'MMM d')}–${format(end, 'MMM d')}`
}

export function questsInWeek(quests: Quest[], playerId: PlayerId, level: number, journeyStartDate: string) {
  const { start, end } = levelDates(level, journeyStartDate)
  return quests.filter((quest) => {
    const due = parseISO(quest.dueDate)
    return quest.playerId === playerId && !isBefore(due, startOfDay(start)) && !isAfter(due, end)
  })
}

export function weeklyStats(state: GameState, playerId: PlayerId, level: number) {
  const quests = questsInWeek(state.quests, playerId, level, state.journeyStartDate)
  const completed = quests.filter((q) => q.status === 'completed')
  const activeDays = new Set(completed.map((q) => q.completedAt?.slice(0, 10) ?? q.dueDate)).size
  const coins = completed.reduce((sum, q) => sum + q.coinValue, 0)
  const xp = completed.reduce((sum, q) => sum + q.xpValue, 0)
  const ratio = quests.length ? completed.length / quests.length : 0
  const target = quests.length ? Math.max(1, Math.ceil(quests.length * 0.8)) : 0
  const progress = target ? Math.min(1, completed.length / target) : 0
  return {
    planned: quests.length,
    completed: completed.length,
    remaining: Math.max(0, quests.length - completed.length),
    activeDays,
    coins,
    xp,
    ratio,
    progress,
  }
}

export function daysLeftInCurrentWeek() {
  const today = startOfDay(new Date())
  return Math.max(0, differenceInCalendarDays(weekEnd(today), today))
}

export function isOverdue(quest: Quest) {
  return quest.status !== 'completed' && isBefore(parseISO(quest.dueDate), startOfDay(new Date()))
}

export function isDueToday(quest: Quest) {
  return isSameDay(parseISO(quest.dueDate), new Date())
}

export function activityStreak(quests: Quest[], playerId: PlayerId) {
  const dates = new Set(
    quests
      .filter((q) => q.playerId === playerId && q.status === 'completed' && q.completedAt)
      .map((q) => q.completedAt!.slice(0, 10)),
  )
  let streak = 0
  let cursor = startOfDay(new Date())
  while (dates.has(format(cursor, 'yyyy-MM-dd'))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function playerMapProgress(state: GameState, playerId: PlayerId) {
  const currentLevel = levelForDate(new Date(), state.journeyStartDate)
  const current = weeklyStats(state, playerId, currentLevel)
  return currentLevel - 1 + current.progress
}
