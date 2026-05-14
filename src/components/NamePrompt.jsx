import { useState } from 'react'

export default function NamePrompt({ onSave }) {
  const [name, setName] = useState('')

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h2>Welcome to the schedule 🍿</h2>
        <p>
          Enter your name so the team can see your shifts.
          You only need to do this once.
        </p>
        <div className="field">
          <label>Your name</label>
          <input
            type="text"
            placeholder="e.g. Ahmad Razif"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
          />
        </div>
        <button
          className="btn-primary full"
          onClick={handleSave}
          disabled={!name.trim()}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
