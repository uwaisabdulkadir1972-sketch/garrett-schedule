import { useState, useEffect, useCallback, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './lib/supabase'
import NamePrompt from './components/NamePrompt'
import ShiftForm from './components/ShiftForm'
import ManagerAccess from './components/ManagerAccess'
import * as XLSX from 'xlsx'

// Each person gets a consistent color based on their name
const PALETTE = [
  { bg: '#B5D4F4', text: '#0C447C' },
  { bg: '#9FE1CB', text: '#085041' },
  { bg: '#F5C4B3', text: '#712B13' },
  { bg: '#CECBF6', text: '#3C3489' },
  { bg: '#FAC775', text: '#633806' },
  { bg: '#F4C0D1', text: '#72243E' },
  { bg: '#C0DD97', text: '#27500A' },
  { bg: '#F7C1C1', text: '#791F1F' },
]

function getColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function formatTime(timeStr) {
  // timeStr comes from DB as "10:00:00" — convert to "10:00 am"
  const [h, m] = timeStr.split(':').map(Number)
  const period = h < 12 ? 'am' : 'pm'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`
}

export default function App() {
  const [myName, setMyName] = useState(() => localStorage.getItem('gp_name') || '')
  const [isManager, setIsManager] = useState(() => localStorage.getItem('gp_manager') === 'true')
  const [shifts, setShifts] = useState([])
  const [showNamePrompt, setShowNamePrompt] = useState(!localStorage.getItem('gp_name'))
  const [showShiftForm, setShowShiftForm] = useState(false)
  const [editingShift, setEditingShift] = useState(null)
  const [showManagerPin, setShowManagerPin] = useState(false)
  const [defaultDate, setDefaultDate] = useState('')
  const [toast, setToast] = useState('')
  const [currentWeekStart, setCurrentWeekStart] = useState(null)

  // Load all shifts from Supabase
  const fetchShifts = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('date', { ascending: true })
    if (!error) setShifts(data || [])
  }, [])

  useEffect(() => { fetchShifts() }, [fetchShifts])

  // Real-time: update calendar instantly when anyone books/edits
  useEffect(() => {
    const channel = supabase
      .channel('bookings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchShifts)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchShifts])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleNameSave = (name) => {
    localStorage.setItem('gp_name', name)
    setMyName(name)
    setShowNamePrompt(false)
  }

  const handleManagerUnlock = (success) => {
    if (success) {
      localStorage.setItem('gp_manager', 'true')
      setIsManager(true)
      showToast('Manager mode enabled')
    }
    setShowManagerPin(false)
  }

  const handleManagerLogout = () => {
    localStorage.removeItem('gp_manager')
    setIsManager(false)
    showToast('Exited manager mode')
  }

  // Convert shifts to FullCalendar event format
  const events = shifts.map(s => {
    const color = getColor(s.employee_name)
    return {
      id: s.id,
      title: s.employee_name,
      start: `${s.date}T${s.start_time}`,
      end: `${s.date}T${s.end_time}`,
      backgroundColor: color.bg,
      borderColor: color.bg,
      textColor: color.text,
      extendedProps: { shift: s },
    }
  })

  // Clicking a shift — only open editor if you own it or are manager
  const handleEventClick = ({ event }) => {
    const shift = event.extendedProps.shift
    const canEdit = isManager || shift.created_by === myName
    if (canEdit) {
      setEditingShift(shift)
      setShowShiftForm(true)
    } else {
      showToast(`This shift belongs to ${shift.employee_name}`)
    }
  }

  // Clicking an empty slot pre-fills the date
  const handleDateSelect = (info) => {
    setDefaultDate(info.startStr.split('T')[0])
    setEditingShift(null)
    setShowShiftForm(true)
  }

  const handleExport = () => {
    if (!isManager) return

    // Use the calendar's current week start (Monday), falling back to this week
    const weekStart = currentWeekStart || (() => {
      const d = new Date()
      const day = d.getDay()
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      d.setHours(0, 0, 0, 0)
      return d
    })()

    const DAY_LABELS = ['MON', 'TUES', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    const days = DAY_LABELS.map((label, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return {
        label,
        iso: d.toISOString().split('T')[0],
        display: `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
      }
    })

    const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const calcHours = (start, end) => {
      let s = toMins(start), e = toMins(end)
      if (e <= s) e += 24 * 60 // handles cross-midnight shifts
      return (e - s) / 60
    }

    const weekDates = new Set(days.map(d => d.iso))
    const weekShifts = shifts.filter(s => weekDates.has(s.date))
    const employees = [...new Set(weekShifts.map(s => s.employee_name))].sort()

    // Row 0: day name headers (merged across 4 cols each)
    const row0 = ['']
    days.forEach(d => row0.push(d.label, '', '', ''))
    row0.push('T.WK HRS')

    // Row 1: dates
    const row1 = ['']
    days.forEach(d => row1.push(d.display, '', '', ''))
    row1.push('')

    // Row 2: column sub-headers
    const row2 = ['Employee']
    days.forEach(() => row2.push('Start', 'End', 'Break', 'Hours'))
    row2.push('')

    // Employee rows
    const dataRows = employees.map(emp => {
      const row = [emp]
      let total = 0
      days.forEach(d => {
        const shift = weekShifts.find(s => s.employee_name === emp && s.date === d.iso)
        if (shift) {
          const hrs = calcHours(shift.start_time, shift.end_time)
          total += hrs
          row.push(shift.start_time.slice(0, 5), shift.end_time.slice(0, 5), '', hrs)
        } else {
          row.push('OFF', '', '', '')
        }
      })
      row.push(total > 0 ? total : '')
      return row
    })

    // Totals row
    const totalsRow = ['AL DAILY HOURS']
    let grandTotal = 0
    days.forEach(d => {
      const dayHours = weekShifts
        .filter(s => s.date === d.iso)
        .reduce((sum, s) => sum + calcHours(s.start_time, s.end_time), 0)
      grandTotal += dayHours
      totalsRow.push('', '', '', dayHours || '')
    })
    totalsRow.push(grandTotal || '')

    const aoa = [row0, row1, row2, ...dataRows, totalsRow]
    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Merge day name header cells
    ws['!merges'] = days.map((_, i) => ({
      s: { r: 0, c: 1 + i * 4 },
      e: { r: 0, c: 4 + i * 4 },
    }))

    ws['!cols'] = [
      { wch: 28 },
      ...Array(7).fill(null).flatMap(() => [{ wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }]),
      { wch: 10 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule')
    XLSX.writeFile(wb, `schedule-${days[0].iso}.xlsx`)
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="app">
      {/* Modals */}
      {showNamePrompt && <NamePrompt onSave={handleNameSave} />}
      {showManagerPin && <ManagerAccess onResult={handleManagerUnlock} />}
      {showShiftForm && (
        <ShiftForm
          shift={editingShift}
          defaultDate={defaultDate || today}
          myName={myName}
          isManager={isManager}
          onClose={() => { setShowShiftForm(false); setEditingShift(null) }}
          onSave={fetchShifts}
          onToast={showToast}
        />
      )}

      {/* Toast notification */}
      {toast && <div className="toast">{toast}</div>}

      {/* Header */}
      <div className="header">
        <div className="header-left">
          <h1>🍿 Garrett Popcorn — schedule</h1>
          <span className="user-info">
            Logged in as <strong>{myName || '—'}</strong>
            {isManager && <span className="manager-badge">Manager</span>}
          </span>
        </div>
        <div className="header-actions">
          {isManager ? (
            <>
              <button className="btn-outline" onClick={handleExport}>
                ↓ Export Excel
              </button>
              <button className="btn-outline danger" onClick={handleManagerLogout}>
                Exit manager
              </button>
            </>
          ) : (
            <button className="btn-outline" onClick={() => setShowManagerPin(true)}>
              Manager
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => { setDefaultDate(today); setEditingShift(null); setShowShiftForm(true) }}
          >
            + Add shift
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="calendar-wrap">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay',
          }}
          firstDay={1}
          slotMinTime="05:00:00"
          slotMaxTime="02:00:00"
          slotDuration="01:00:00"
          allDaySlot={false}
          events={events}
          selectable={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          height="auto"
          nowIndicator={true}
          datesSet={(info) => setCurrentWeekStart(new Date(info.start))}
          eventContent={(arg) => {
            const shift = arg.event.extendedProps.shift
            const canEdit = isManager || shift.created_by === myName
            return (
              <div style={{ padding: '3px 5px', cursor: canEdit ? 'pointer' : 'default' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {arg.event.title}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '1px' }}>
                  {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                </div>
                {canEdit && (
                  <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '1px' }}>
                    tap to edit
                  </div>
                )}
              </div>
            )
          }}
        />
      </div>

      {/* Legend */}
      {shifts.length > 0 && (
        <div className="legend">
          {[...new Set(shifts.map(s => s.employee_name))].map(name => {
            const color = getColor(name)
            return (
              <div key={name} className="legend-item">
                <span className="legend-dot" style={{ background: color.bg }} />
                <span>{name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
