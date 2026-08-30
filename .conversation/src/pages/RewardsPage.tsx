import { Gift, Plus, ShoppingBag } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useGame } from '../context/GameContext'

export function RewardsPage() {
  const { state, activePlayerId, addReward, redeemReward } = useGame()
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState(80)
  const [emoji, setEmoji] = useState('🎁')
  const player = state.players[activePlayerId]

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    addReward({ title, cost, emoji, forPlayer: 'both' })
    setTitle('')
  }

  return (
    <div className="page-stack">
      <section className="hero-card compact"><div><span className="eyebrow">Reward shop</span><h1>Spend progress on something nice.</h1><p>Rewards are deliberately positive — no penalties, debt, or losing previously earned coins.</p></div><div className="wallet">🪙 <strong>{player.coins}</strong><span>{player.name}'s balance</span></div></section>
      <section className="reward-grid">
        {state.rewards.filter((r) => r.active && (r.forPlayer === 'both' || r.forPlayer === activePlayerId)).map((reward) => (
          <article className="reward-card" key={reward.id}><div className="reward-emoji">{reward.emoji}</div><div><h3>{reward.title}</h3><p>{reward.description || 'A custom reward on your shared road.'}</p></div><div className="reward-footer"><strong>🪙 {reward.cost}</strong><button className="secondary-button" disabled={player.coins < reward.cost} onClick={() => redeemReward(reward.id)}><ShoppingBag size={16} /> Redeem</button></div></article>
        ))}
      </section>
      <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Create reward</span><h2>Add something motivating</h2></div><Gift /></div><form className="inline-form" onSubmit={submit}><input className="emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} /><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reward name" /><input type="number" min={5} step={5} value={cost} onChange={(e) => setCost(Number(e.target.value))} /><button className="primary-button"><Plus size={16} /> Add</button></form></section>
    </div>
  )
}
