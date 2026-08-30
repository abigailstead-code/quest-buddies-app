import { ArrowDown, ArrowUp, History } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useGame } from '../context/GameContext'

export function HistoryPage() {
  const { state, activePlayerId } = useGame()
  const transactions = state.transactions.filter((t) => t.playerId === activePlayerId)
  return <div className="page-stack"><section className="page-title"><span className="eyebrow">Coin history</span><h1>Where your coins came from.</h1><p>Completion history is preserved even when a week ends.</p></section><section className="section-card"><div className="history-list">{transactions.length ? transactions.map((t) => <div className="history-row" key={t.id}><span className={`transaction-icon ${t.amount >= 0 ? 'positive' : 'negative'}`}>{t.amount >= 0 ? <ArrowUp /> : <ArrowDown />}</span><div><strong>{t.label}</strong><span>{format(parseISO(t.createdAt), 'MMM d · HH:mm')}</span></div><strong className={t.amount >= 0 ? 'positive-text' : ''}>{t.amount >= 0 ? '+' : ''}{t.amount} 🪙</strong></div>) : <div className="empty-state"><History /><strong>No transactions yet.</strong><span>Complete your first quest to earn coins.</span></div>}</div></section></div>
}
