export function ProgressRing({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="progress-ring" style={{ '--progress': `${pct * 3.6}deg` } as React.CSSProperties}>
      <div className="progress-ring-inner"><strong>{pct}%</strong><span>{label}</span></div>
    </div>
  )
}
