import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Time options from 7am to 11pm
const TIME_OPTIONS = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 7
  const value = `${String(hour).padStart(2, '0')}:00:00`
  const h12 = hour === 12 ? 12 : hour > 12 ? hour - 12 : hour
  const period = hour < 12 ? 'am' : 'pm'
  const label = `${h12}:00 ${period}`
  return { label, value }
})

export default function ShiftForm({ shift, defaultDate, myName, isManager, onClose, onSave, onToast }) {
  const isEditing = !!shift

  const [employeeName, setEmployeeName] = useState(shift?.employee_name || myName || '')
  const [date, setDate] = useState(shift?.date || defaultDate)
  const [startTime, setStartTime] = useState(shift?.start_time || '10:00:00')
  const [endTime, setEndTime] = useState(shift?.end_time || '18:00:00')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Staff can only change their own name when editing
  // Manager can change anyone's name
  const nameEditable = isManager || !isEditing

  const validate = () => {
    if (!employeeName.trim()) return 'Please enter a name'
    if (!date) return 'Please select a date'
    if (startTime >= endTime) return 'End time must be after start time'
    return ''
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setError(err); return }

    setLoading(true)
    setError('')

    const payload = {
      employee_name: employeeName.trim(),
      date,
      start_time: startTime,
      end_time: endTime,
      created_by: shift?.created_by || myName,
    }

    let result
    if (isEditing) {
      result = await supabase.from('bookings').update(payload).eq('id', shift.id)
    } else {
      result = await supabase.from('bookings').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await onSave()
    onToast(isEditing ? 'Shift updated' : 'Shift added!')
    onClose()
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${shift.employee_name}'s shift on ${shift.date}?`)) return
    setLoading(true)
    await supabase.from('bookings').delete().eq('id', shift.id)
    await onSave()
    onToast('Shift deleted')
    onClose()
  }

  const hoursCount = startTime && endTime
    ? Math.max(0, (parseInt(endTime) - parseInt(startTime)))
    : 0

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{isEditing ? 'Edit shift' : 'Book a shift'}</h2>

        {error && <div className="error-msg">{error}</div>}

        <div className="field">
          <label>Employee name</label>
          <input
            type="text"
            value={employeeName}
            onChange={e => setEmployeeName(e.target.value)}
            disabled={!nameEditable}
            placeholder="Enter name"
          />
          {!nameEditable && (
            <span style={{ fontSize: 11, color: '#999' }}>
              Only managers can change the name
            </span>
          )}
        </div>

        <div className="field">
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="row-2">
          <div className="field">
            <label>Start time</label>
            <select value={startTime} onChange={e => setStartTime(e.target.value)}>
              {TIME_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>End time</label>
            <select value={endTime} onChange={e => setEndTime(e.target.value)}>
              {TIME_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {hoursCount > 0 && (
          <p style={{ fontSize: 12, color: '#888', marginTop: -4 }}>
            {hoursCount} hour shift
          </p>
        )}

        <div className="modal-actions">
          <button className="btn-outline" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          {isEditing && (isManager || shift.created_by === myName) && (
            <button className="btn-danger" onClick={handleDelete} disabled={loading}>
              Delete
            </button>
          )}
          <button className="btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : isEditing ? 'Save changes' : 'Add shift'}
          </button>
        </div>
      </div>
    </div>
  )
}
