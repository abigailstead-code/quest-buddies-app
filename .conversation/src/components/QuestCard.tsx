import { Check, Clock3, Trash2 } from 'lucide-react'
import type { Quest } from '../types/game'
import { isOverdue } from '../lib/game'

export function QuestCard({ quest, onToggle, onDelete }: { quest: Quest; onToggle: () => void; onDelete: () => void }) {
  const overdue = isOverdue(quest)
  return (
    <article className={`quest-card ${quest.status === 'completed' ? 'done' : ''}`}>
      <button className="check-button" onClick={onToggle} aria-label="Toggle quest"><Check size={18} /></button>
      <div className="quest-body">
        <div className="quest-title-row">
          <strong>{quest.title}</strong>
          <span className={`priority ${quest.priority}`}>{quest.priority}</span>
        </div>
        {quest.notes && <p>{quest.notes}</p>}
        <div className="quest-meta">
          <span><Clock3 size={14} /> {quest.dueDate}</span>
          {overdue && <span className="overdue">Overdue — still completable</span>}
          <span>🪙 {quest.coinValue} · ⭐ {quest.xpValue}</span>
        </div>
      </div>
      <button className="ghost-icon" onClick={onDelete} aria-label="Delete quest"><Trash2 size={17} /></button>
    </article>
  )
}
