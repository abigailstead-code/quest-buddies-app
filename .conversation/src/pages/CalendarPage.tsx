import { addDays, addWeeks, format, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { QuestCard } from '../components/QuestCard'
import { useGame } from '../context/GameContext'
import { formatLevelDates, levelForDate, levelDates } from '../lib/game'
import type { QuestPriority } from '../types/game'

export function CalendarPage() {
  const { state, activePlayerId, addQuest, toggleQuest, deleteQuest } = useGame()
  const currentLevel = levelForDate(new Date(), state.journeyStartDate)
  const [level, setLevel] = useState(currentLevel)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(format(levelDates(level, state.journeyStartDate).start, 'yyyy-MM-dd'))
  const [priority, setPriority] = useState<QuestPriority>('medium')
  const { start } = levelDates(level, state.journeyStartDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const quests = useMemo(() => state.quests.filter((q) => q.playerId === activePlayerId && levelForDate(q.dueDate, state.journeyStartDate) === level), [state.quests, activePlayerId, level, state.journeyStartDate])

  function changeLevel(delta: number) {
    const next = Math.max(1, level + delta)
    setLevel(next)
    setDate(format(levelDates(next, state.journeyStartDate).start, 'yyyy-MM-dd'))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    addQuest({ title, dueDate: date, priority })
    setTitle('')
  }

  return (
    <div className="page-stack">
      <section className="section-card">
        <div className="week-switcher">
          <button className="icon-button" onClick={() => changeLevel(-1)}><ChevronLeft /></button>
          <div><span className="eyebrow">Level {level}</span><h1>{formatLevelDates(level, state.journeyStartDate)}</h1></div>
          <button className="icon-button" onClick={() => changeLevel(1)}><ChevronRight /></button>
        </div>
        <div className="week-grid">
          {days.map((day) => {
            const dayString = format(day, 'yyyy-MM-dd')
            const count = quests.filter((q) => q.dueDate === dayString).length
            return <button className={`day-cell ${date === dayString ? 'selected' : ''}`} key={dayString} onClick={() => setDate(dayString)}><span>{format(day, 'EEE')}</span><strong>{format(day, 'd')}</strong><small>{count ? `${count} quest${count > 1 ? 's' : ''}` : 'open'}</small></button>
          })}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading"><div><span className="eyebrow">Plan ahead</span><h2>Add to {format(new Date(`${date}T12:00:00`), 'EEEE, MMM d')}</h2></div><Plus size={20} /></div>
        <form className="inline-form" onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Future quest" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as QuestPriority)}><option value="small">Small</option><option value="medium">Standard</option><option value="major">Boss</option></select>
          <button className="primary-button">Add quest</button>
        </form>
        <div className="quest-list">
          {quests.length ? quests.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((q) => <QuestCard key={q.id} quest={q} onToggle={() => toggleQuest(q.id)} onDelete={() => deleteQuest(q.id)} />) : <div className="empty-state"><strong>No quests planned for this level yet.</strong><span>Future levels appear automatically — no manual creation required.</span></div>}
        </div>
      </section>
    </div>
  )
}
