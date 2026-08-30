import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Encouragement, GameState, Milestone, PlayerId, Quest, QuestPriority, Reward } from '../types/game'
import { id, priorityValues } from '../lib/game'
import { initialState } from '../lib/demo'

const STORAGE_KEY = 'quest-road-state-v1'

interface AddQuestInput {
  title: string
  notes?: string
  dueDate: string
  priority: QuestPriority
  playerId?: PlayerId
}

interface GameContextValue {
  state: GameState
  activePlayerId: PlayerId
  setActivePlayer: (playerId: PlayerId) => void
  addQuest: (input: AddQuestInput) => void
  toggleQuest: (questId: string) => void
  deleteQuest: (questId: string) => void
  addReward: (input: Omit<Reward, 'id' | 'createdBy' | 'active'>) => void
  redeemReward: (rewardId: string) => boolean
  addMilestone: (input: Omit<Milestone, 'id' | 'completed'>) => void
  toggleMilestone: (milestoneId: string) => void
  sendEncouragement: (message: string, to: PlayerId) => void
  updatePlayer: (playerId: PlayerId, patch: Partial<{ name: string; avatar: string }>) => void
  resetDemo: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

function loadState(): GameState {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return initialState
  try {
    return JSON.parse(saved) as GameState
  } catch {
    return initialState
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(() => loadState())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const activePlayerId = state.activePlayerId

  const value = useMemo<GameContextValue>(() => ({
    state,
    activePlayerId,
    setActivePlayer(playerId) {
      setState((current) => ({ ...current, activePlayerId: playerId }))
    },
    addQuest(input) {
      const values = priorityValues[input.priority]
      const quest: Quest = {
        id: id(),
        playerId: input.playerId ?? activePlayerId,
        title: input.title.trim(),
        notes: input.notes?.trim(),
        dueDate: input.dueDate,
        priority: input.priority,
        status: 'planned',
        coinValue: values.coins,
        xpValue: values.xp,
        createdAt: new Date().toISOString(),
      }
      setState((current) => ({ ...current, quests: [...current.quests, quest] }))
    },
    toggleQuest(questId) {
      setState((current) => {
        const quest = current.quests.find((q) => q.id === questId)
        if (!quest) return current
        const completing = quest.status !== 'completed'
        const deltaCoins = completing ? quest.coinValue : -quest.coinValue
        const deltaXp = completing ? quest.xpValue : -quest.xpValue
        const label = completing ? `Completed: ${quest.title}` : `Reopened: ${quest.title}`
        return {
          ...current,
          players: {
            ...current.players,
            [quest.playerId]: {
              ...current.players[quest.playerId],
              coins: Math.max(0, current.players[quest.playerId].coins + deltaCoins),
              xp: Math.max(0, current.players[quest.playerId].xp + deltaXp),
            },
          },
          quests: current.quests.map((q) => q.id === questId ? {
            ...q,
            status: completing ? 'completed' : 'planned',
            completedAt: completing ? new Date().toISOString() : undefined,
          } : q),
          transactions: [
            {
              id: id(),
              playerId: quest.playerId,
              amount: deltaCoins,
              kind: 'quest',
              label,
              createdAt: new Date().toISOString(),
            },
            ...current.transactions,
          ],
        }
      })
    },
    deleteQuest(questId) {
      setState((current) => ({ ...current, quests: current.quests.filter((q) => q.id !== questId) }))
    },
    addReward(input) {
      setState((current) => ({
        ...current,
        rewards: [...current.rewards, { ...input, id: id(), createdBy: activePlayerId, active: true }],
      }))
    },
    redeemReward(rewardId) {
      const reward = state.rewards.find((r) => r.id === rewardId)
      if (!reward || state.players[activePlayerId].coins < reward.cost) return false
      setState((current) => ({
        ...current,
        players: {
          ...current.players,
          [activePlayerId]: {
            ...current.players[activePlayerId],
            coins: current.players[activePlayerId].coins - reward.cost,
          },
        },
        redemptions: [{ id: id(), rewardId, playerId: activePlayerId, cost: reward.cost, redeemedAt: new Date().toISOString() }, ...current.redemptions],
        transactions: [{ id: id(), playerId: activePlayerId, amount: -reward.cost, kind: 'reward', label: `Redeemed: ${reward.title}`, createdAt: new Date().toISOString() }, ...current.transactions],
      }))
      return true
    },
    addMilestone(input) {
      setState((current) => ({ ...current, milestones: [...current.milestones, { ...input, id: id(), completed: false }] }))
    },
    toggleMilestone(milestoneId) {
      setState((current) => ({ ...current, milestones: current.milestones.map((m) => m.id === milestoneId ? { ...m, completed: !m.completed } : m) }))
    },
    sendEncouragement(message, to) {
      const encouragement: Encouragement = { id: id(), from: activePlayerId, to, message: message.trim(), createdAt: new Date().toISOString() }
      setState((current) => ({ ...current, encouragements: [encouragement, ...current.encouragements] }))
    },
    updatePlayer(playerId, patch) {
      setState((current) => ({ ...current, players: { ...current.players, [playerId]: { ...current.players[playerId], ...patch } } }))
    },
    resetDemo() {
      localStorage.removeItem(STORAGE_KEY)
      setState(initialState)
    },
  }), [activePlayerId, state])

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}
