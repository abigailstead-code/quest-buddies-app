import { formatLevelDates, weeklyStats } from '../lib/game'
import type { GameState, PlayerId } from '../types/game'
import { ProgressRing } from './ProgressRing'

export function LevelCard({ state, playerId, level, current = false }: { state: GameState; playerId: PlayerId; level: number; current?: boolean }) {
  const stats = weeklyStats(state, playerId, level)
  return (
    <div className={`level-card ${current ? 'current' : ''}`}>
      <div>
        <span className="eyebrow">Level {level}</span>
        <h3>{formatLevelDates(level, state.journeyStartDate)}</h3>
        <p>{stats.completed} completed · {stats.remaining} remaining</p>
        <div className="mini-bar"><span style={{ width: `${stats.progress * 100}%` }} /></div>
      </div>
      <ProgressRing value={stats.progress} label="weekly goal" />
    </div>
  )
}
