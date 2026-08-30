import { FormEvent, useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { useGame } from '../context/GameContext'

export function SettingsPage() {
  const { state, updatePlayer, addMilestone, toggleMilestone, resetDemo } = useGame()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')

  function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    addMilestone({ title, targetDate: date, emoji: '⭐' })
    setTitle(''); setDate('')
  }

  return <div className="page-stack"><section className="page-title"><span className="eyebrow">Settings</span><h1>Shape your shared adventure.</h1></section><section className="section-card"><div className="section-heading"><div><span className="eyebrow">Players</span><h2>Demo profiles</h2></div></div><div className="profile-grid">{Object.values(state.players).map((p) => <div className="profile-edit" key={p.id}><input className="avatar-input" value={p.avatar} onChange={(e) => updatePlayer(p.id, { avatar: e.target.value })} /><input value={p.name} onChange={(e) => updatePlayer(p.id, { name: e.target.value })} /></div>)}</div></section><section className="section-card"><div className="section-heading"><div><span className="eyebrow">Major milestones</span><h2>Longer-term checkpoints</h2></div></div><div className="milestone-list">{state.milestones.map((m) => <button key={m.id} className={`milestone-row ${m.completed ? 'done' : ''}`} onClick={() => toggleMilestone(m.id)}><span>{m.emoji}</span><div><strong>{m.title}</strong><small>{m.targetDate}</small></div><span>{m.completed ? 'Complete' : 'Upcoming'}</span></button>)}</div><form className="inline-form" onSubmit={add}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New milestone" /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><button className="primary-button"><Plus size={16}/> Add</button></form></section><section className="danger-zone"><div><strong>Reset demo data</strong><span>Clears only this browser's local Quest Road data.</span></div><button className="secondary-button" onClick={resetDemo}><RotateCcw size={16}/> Reset</button></section></div>
}
