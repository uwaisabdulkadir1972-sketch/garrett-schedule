import { useState } from 'react'

export default function ManagerAccess({ onResult }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  // PIN comes from your .env file (VITE_MANAGER_PIN)
  const MANAGER_PIN = import.meta.env.VITE_MANAGER_PIN || '1234'

  const handleSubmit = () => {
    if (pin === MANAGER_PIN) {
      onResult(true)
    } else {
      setError('Incorrect PIN. Try again.')
      setPin('')
    }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onResult(false)}>
      <div className="modal">
        <h2>Manager access</h2>
        <p>Enter the manager PIN to edit all shifts and export the schedule.</p>

        {error && <div className="error-msg">{error}</div>}

        <div className="field">
          <label>PIN</label>
          <input
            type="password"
            placeholder="Enter PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div className="modal-actions">
          <button className="btn-outline" onClick={() => onResult(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!pin}>
            Unlock
          </button>
        </div>
      </div>
    </div>
  )
}
