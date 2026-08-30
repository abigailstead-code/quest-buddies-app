export type PlayerId = 'player-1' | 'player-2'

export type QuestPriority = 'small' | 'medium' | 'major'
export type QuestStatus = 'planned' | 'completed'

export interface Player {
  id: PlayerId
  name: string
  avatar: string
  coins: number
  xp: number
}

export interface Quest {
  id: string
  playerId: PlayerId
  title: string
  notes?: string
  dueDate: string
  priority: QuestPriority
  status: QuestStatus
  completedAt?: string
  coinValue: number
  xpValue: number
  createdAt: string
}

export interface Reward {
  id: string
  title: string
  description?: string
  cost: number
  createdBy: PlayerId
  forPlayer: PlayerId | 'both'
  emoji: string
  active: boolean
}

export interface Redemption {
  id: string
  rewardId: string
  playerId: PlayerId
  cost: number
  redeemedAt: string
}

export interface Milestone {
  id: string
  title: string
  targetDate: string
  emoji: string
  description?: string
  completed: boolean
}

export interface Encouragement {
  id: string
  from: PlayerId
  to: PlayerId
  message: string
  createdAt: string
}

export interface CoinTransaction {
  id: string
  playerId: PlayerId
  amount: number
  kind: 'quest' | 'reward' | 'bonus' | 'adjustment'
  label: string
  createdAt: string
}

export interface GameState {
  gameName: string
  journeyStartDate: string
  activePlayerId: PlayerId
  players: Record<PlayerId, Player>
  quests: Quest[]
  rewards: Reward[]
  redemptions: Redemption[]
  milestones: Milestone[]
  encouragements: Encouragement[]
  transactions: CoinTransaction[]
}
