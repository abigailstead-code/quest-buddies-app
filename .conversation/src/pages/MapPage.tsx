import { format, parseISO } from 'date-fns'
import { Flag, MapPinned } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { formatLevelDates, levelForDate, playerMapProgress } from '../lib/game'

export function MapPage() {
  const { state } = useGame()
  const currentLevel = levelForDate(new Date(), state.journeyStartDate)
  const levels = Array.from({ length: Math.max(12, currentLevel + 8) }, (_, i) => i + 1)
  const p1 = playerMapProgress(state, 'player-1')
  const p2 = playerMapProgress(state, 'player-2')

  return (
    <div className="page-stack">
      <section className="page-title"><span className="eyebrow">Shared adventure</span><h1>The Quest Road</h1><p>You share the route, but each player advances through a week based on their own quests.</p></section>
      <section className="map-board">
        <div className="map-legend">
          <span>{state.players['player-1'].avatar} {state.players['player-1'].name}</span>
          <span>{state.players['player-2'].avatar} {state.players['player-2'].name}</span>
        </div>
        <div className="road">
          {levels.map((level) => {
            const markerP1 = Math.floor(p1) + 1 === level
            const markerP2 = Math.floor(p2) + 1 === level
            const milestone = state.milestones.find((m) => levelForDate(m.targetDate, state.journeyStartDate) === level)
            return (
              <div className={`road-stop ${level === currentLevel ? 'active' : ''}`} key={level}>
                <div className="road-line" />
                <div className="road-node"><span>{level}</span></div>
                <div className="road-label"><strong>Level {level}</strong><span>{formatLevelDates(level, state.journeyStartDate)}</span></div>
                {(markerP1 || markerP2) && <div className="avatars">{markerP1 && <span>{state.players['player-1'].avatar}</span>}{markerP2 && <span>{state.players['player-2'].avatar}</span>}</div>}
                {milestone && <div className={`milestone-sign ${milestone.completed ? 'done' : ''}`}><span>{milestone.emoji}</span><div><small>{format(parseISO(milestone.targetDate), 'MMM d')}</small><strong>{milestone.title}</strong></div></div>}
              </div>
            )
          })}
          <div className="finish-note"><Flag size={20} /> The road expands automatically as you plan further ahead.</div>
        </div>
      </section>
      <section className="info-banner"><MapPinned size={20} /><div><strong>Major milestones sit on top of weekly levels.</strong><span>They can take several weeks or months and do not block weekly progression.</span></div></section>
    </div>
  )
}
