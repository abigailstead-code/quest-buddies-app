import { format } from 'date-fns'
import { Plus, Sparkles } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { LevelCard } from '../components/LevelCard'
import { QuestCard } from '../components/QuestCard'
import { useGame } from '../context/GameContext'
import { activityStreak, daysLeftInCurrentWeek, isDueToday, isOverdue, levelForDate, priorityValues, weeklyStats } from '../lib/game'
import type { QuestPriority } from '../types/game'

export function TodayPage() {
  const { state, activePlayerId, addQuest, toggleQuest, deleteQuest } = useGame()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<QuestPriority>('medium')
  const today = format(new Date(), 'yyyy-MM-dd')
  const level = levelForDate(new Date(), state.journeyStartDate)
  const stats = weeklyStats(state, activePlayerId, level)
  const streak = activityStreak(state.quests, activePlayerId)
  const quests = useMemo(() => state.quests.filter((q) => q.playerId === activePlayerId && (isDueToday(q) || isOverdue(q)) && q.status !== 'completed'), [state.quests, activePlayerId])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    addQuest({ title, dueDate: today, priority })
    setTitle('')
    setShowForm(false)
  }

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <span className="eyebrow">Sunday, {format(new Date(), 'MMMM d')}</span>
          <h1>Your road, one quest at a time.</h1>
          <p>Fresh weeks create momentum. Unfinished quests stay on the road — they never erase your progress.</p>
        </div>
        <div className="hero-stats">
          <div><strong>{stats.remaining}</strong><span>left this week</span></div>
          <div><strong>🪙 {stats.coins}</strong><span>earned this week</span></div>
          <div><strong>🔥 {streak}</strong><span>day streak</span></div>
          <div><strong>{daysLeftInCurrentWeek()}</strong><span>days remaining</span></div>
        </div>
      </section>

      <LevelCard state={state} playerId={activePlayerId} level={level} current />

      <section className="section-card">
        <div className="section-heading">
          <div><span className="eyebrow">Daily quests</span><h2>Today & overdue</h2></div>
          <button className="primary-button" onClick={() => setShowForm(!showForm)}><Plus size={17} /> Add quest</button>
        </div>

        {showForm && (
          <form className="inline-form" onSubmit={submit}>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What would move you forward today?" />
            <select value={priority} onChange={(e) => setPriority(e.target.value as QuestPriority)}>
              {Object.entries(priorityValues).map(([key, value]) => <option value={key} key={key}>{value.label} · {value.coins} coins</option>)}
            </select>
            <button className="primary-button" type="submit">Add</button>
          </form>
        )}

        <div className="quest-list">
          {quests.length ? quests.map((quest) => <QuestCard key={quest.id} quest={quest} onToggle={() => toggleQuest(quest.id)} onDelete={() => deleteQuest(quest.id)} />) : (
            <div className="empty-state"><Sparkles size={24} /><strong>Clear road ahead.</strong><span>Add a quest or enjoy the breathing room.</span></div>
          )}
        </div>
      </section>
    </div>
  )
}
