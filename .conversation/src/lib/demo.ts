import { addDays, format, startOfWeek } from 'date-fns'
import type { GameState } from '../types/game'
import { id, priorityValues } from './game'

const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
const date = (offset: number) => format(addDays(monday, offset), 'yyyy-MM-dd')

export const initialState: GameState = {
  gameName: 'Quest Road',
  journeyStartDate: format(monday, 'yyyy-MM-dd'),
  activePlayerId: 'player-1',
  players: {
    'player-1': { id: 'player-1', name: 'Abigail', avatar: '🧭', coins: 45, xp: 125 },
    'player-2': { id: 'player-2', name: 'Friend', avatar: '🌱', coins: 30, xp: 80 },
  },
  quests: [
    {
      id: id(), playerId: 'player-1', title: 'Read one research paper', notes: 'Take notes on figures and key conclusions.', dueDate: date(0), priority: 'medium', status: 'planned', coinValue: priorityValues.medium.coins, xpValue: priorityValues.medium.xp, createdAt: new Date().toISOString(),
    },
    {
      id: id(), playerId: 'player-1', title: 'Send internship follow-up', dueDate: date(2), priority: 'major', status: 'planned', coinValue: priorityValues.major.coins, xpValue: priorityValues.major.xp, createdAt: new Date().toISOString(),
    },
    {
      id: id(), playerId: 'player-2', title: 'Update CV', dueDate: date(1), priority: 'medium', status: 'planned', coinValue: priorityValues.medium.coins, xpValue: priorityValues.medium.xp, createdAt: new Date().toISOString(),
    },
  ],
  rewards: [
    { id: id(), title: 'Coffee date', description: 'One guilt-free café break together.', cost: 80, createdBy: 'player-2', forPlayer: 'both', emoji: '☕', active: true },
    { id: id(), title: 'Movie night', description: 'Pick the movie, no vetoes.', cost: 120, createdBy: 'player-1', forPlayer: 'both', emoji: '🎬', active: true },
  ],
  redemptions: [],
  milestones: [
    { id: id(), title: 'Exploration complete', targetDate: date(28), emoji: '⭐', description: 'Shortlist opportunities and decide priorities.', completed: false },
    { id: id(), title: 'Applications prepared', targetDate: date(56), emoji: '📚', description: 'Core documents polished and ready.', completed: false },
    { id: id(), title: 'Applications submitted', targetDate: date(84), emoji: '🎓', description: 'Major goal reached.', completed: false },
  ],
  encouragements: [],
  transactions: [],
}
