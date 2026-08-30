import { Heart, Send } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { LevelCard } from '../components/LevelCard'
import { useGame } from '../context/GameContext'
import { activityStreak, levelForDate, weeklyStats } from '../lib/game'
import type { PlayerId } from '../types/game'

export function DashboardPage() {
  const { state, activePlayerId, sendEncouragement } = useGame()
  const [message, setMessage] = useState('')
  const other = (activePlayerId === 'player-1' ? 'player-2' : 'player-1') as PlayerId
  const level = levelForDate(new Date(), state.journeyStartDate)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    sendEncouragement(message, other)
    setMessage('')
  }

  return (
    <div className="page-stack">
      <section className="page-title"><span className="eyebrow">Two-player overview</span><h1>Same road. Individual momentum.</h1><p>Neither player can hold the other back. You simply get to witness and encourage each other's progress.</p></section>
      <div className="two-column">
        {(['player-1', 'player-2'] as PlayerId[]).map((playerId) => {
          const player = state.players[playerId]
          const stats = weeklyStats(state, playerId, level)
          return <section className="player-panel" key={playerId}><div className="player-heading"><span className="big-avatar">{player.avatar}</span><div><h2>{player.name}</h2><span>🪙 {player.coins} · ⭐ {player.xp} XP · 🔥 {activityStreak(state.quests, playerId)}</span></div></div><LevelCard state={state} playerId={playerId} level={level} current /><div className="stat-row"><div><strong>{stats.completed}</strong><span>quests done</span></div><div><strong>{stats.activeDays}</strong><span>active days</span></div><div><strong>{Math.round(stats.ratio * 100)}%</strong><span>planned quests</span></div></div></section>
        })}
      </div>
      <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Encouragement</span><h2>Send {state.players[other].name} a boost</h2></div><Heart /></div><form className="inline-form" onSubmit={submit}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="You've got this — one thing at a time." /><button className="primary-button"><Send size={16} /> Send</button></form><div className="message-list">{state.encouragements.slice(0, 5).map((e) => <div key={e.id}><span>{state.players[e.from].avatar}</span><p><strong>{state.players[e.from].name}</strong> → {state.players[e.to].name}: {e.message}</p></div>)}</div></section>
    </div>
  )
}
