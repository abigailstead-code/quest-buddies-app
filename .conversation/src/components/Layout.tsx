import { CalendarDays, Gift, History, Home, Map, Settings, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useGame } from '../context/GameContext'

const nav = [
  { to: '/', label: 'Today', icon: Home },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/calendar', label: 'Plan', icon: CalendarDays },
  { to: '/rewards', label: 'Rewards', icon: Gift },
  { to: '/dashboard', label: 'Together', icon: Users },
]

export function Layout() {
  const { state, activePlayerId, setActivePlayer } = useGame()
  const player = state.players[activePlayerId]
  const other = activePlayerId === 'player-1' ? 'player-2' : 'player-1'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">{state.gameName}</span>
          <strong className="topbar-title">Make progress feel like an adventure.</strong>
        </div>
        <div className="top-actions">
          <button className="player-pill" onClick={() => setActivePlayer(other)} title="Switch demo player">
            <span>{player.avatar}</span>
            <span>{player.name}</span>
            <span className="coin-inline">🪙 {player.coins}</span>
          </button>
          <NavLink className="icon-button" to="/history" aria-label="History"><History size={19} /></NavLink>
          <NavLink className="icon-button" to="/settings" aria-label="Settings"><Settings size={19} /></NavLink>
        </div>
      </header>

      <main className="content"><Outlet /></main>

      <nav className="bottom-nav">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
