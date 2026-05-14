import { useState, useEffect, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './lib/supabase'
import NamePrompt from './components/NamePrompt'
import ShiftForm from './components/ShiftForm'
import ManagerAccess from './components/ManagerAccess'
import * as XLSX from 'xlsx'

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
  const [h, m] = timeStr.split(':').map(Number)
  const period = h < 12 ? 'am' : 'pm'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`
}

// Treat times before 5am as next-day (for cross-midnight shifts)
function toMins(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const mins = h * 60 + m
  return h < 5 ? mins + 24 * 60 : mins
}

function shiftsOverlap(a, b) {
  if (a.date !== b.date) return false
  const as = toMins(a.start_time), ae = toMins(a.end_time)
  const bs = toMins(b.start_time), be = toMins(b.end_time)
  return as < be && bs < ae
}

// Opening shift: starts before 8am (e.g. 5am–10/11am)
function isOpening(s) { return s.start_time < '08:00:00' }

// Closing shift: starts at 6pm or later (e.g. 6/7pm–1am)
function isClosing(s) { return s.start_time >= '18:00:00' }

// Mid shift: daytime, not opening, not closing
function isMid(s) { return !isOpening(s) && !isClosing(s) }

function localDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekMonday(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return localDateStr(d)
}

function runScheduleAlgorithm(availabilities, weekDates) {
  const assigned = []
  const empDayCount = {}

  const employees = [...new Set(availabilities.map(a => a.employee_name))]

  // Fewer available days = higher priority
  const empAvailDays = {}
  employees.forEach(emp => {
    empAvailDays[emp] = new Set(
      availabilities.filter(a => a.employee_name === emp).map(a => a.date)
    ).size
  })

  const alreadyAssignedOnDay = (emp, date) =>
    assigned.some(a => a.employee_name === emp && a.date === date)

  const canAssign = (candidate) => {
    // One shift per person per day
    if (alreadyAssignedOnDay(candidate.employee_name, candidate.date)) return false
    // Max 1 opener per day
    if (isOpening(candidate) && assigned.some(a => a.date === candidate.date && isOpening(a))) return false
    // Max 2 overlapping at any time
    if (assigned.filter(a => shiftsOverlap(a, candidate)).length >= 2) return false
    return true
  }

  const assign = (shift) => {
    assigned.push(shift)
    empDayCount[shift.employee_name] = (empDayCount[shift.employee_name] || 0) + 1
  }

  const pickFairest = (candidates) => {
    // Sort by fewest scheduled days first, then fewest available days (higher need), random tiebreak
    candidates.sort((a, b) =>
      (empDayCount[a.employee_name] || 0) - (empDayCount[b.employee_name] || 0) ||
      (empAvailDays[a.employee_name] || 0) - (empAvailDays[b.employee_name] || 0)
    )
    const minDays = empDayCount[candidates[0].employee_name] || 0
    const tied = candidates.filter(c => (empDayCount[c.employee_name] || 0) === minDays)
    return tied[Math.floor(Math.random() * tied.length)]
  }

  // Phase 1: Assign 1 opener per day
  weekDates.forEach(date => {
    const candidates = availabilities.filter(a => a.date === date && isOpening(a) && canAssign(a))
    if (candidates.length > 0) assign(pickFairest(candidates))
  })

  // Phase 2: Assign at least 2 closers per day
  weekDates.forEach(date => {
    let closerCount = assigned.filter(a => a.date === date && isClosing(a)).length
    while (closerCount < 2) {
      const candidates = availabilities.filter(a => a.date === date && isClosing(a) && canAssign(a))
      if (candidates.length === 0) break
      assign(pickFairest(candidates))
      closerCount++
    }
  })

  // Phase 2b: Assign at least 2 mid shifts per day
  weekDates.forEach(date => {
    let midCount = assigned.filter(a => a.date === date && isMid(a)).length
    while (midCount < 2) {
      const candidates = availabilities.filter(a => a.date === date && isMid(a) && canAssign(a))
      if (candidates.length === 0) break
      assign(pickFairest(candidates))
      midCount++
    }
  })

  // Phase 3: Guarantee every employee at least 1 day
  const sortedEmps = [...employees].sort((a, b) => empAvailDays[a] - empAvailDays[b])
  sortedEmps.forEach(emp => {
    if (empDayCount[emp]) return
    const candidates = availabilities.filter(a => a.employee_name === emp && canAssign(a))
    if (candidates.length === 0) return
    // Prefer under-staffed days
    candidates.sort((a, b) =>
      assigned.filter(x => x.date === a.date).length -
      assigned.filter(x => x.date === b.date).length
    )
    assign(candidates[0])
  })

  // Phase 4: Fill non-opening hours to at least 2 people per day
  weekDates.forEach(date => {
    const nonOpeningAssigned = assigned.filter(a => a.date === date && !isOpening(a))
    if (nonOpeningAssigned.length >= 2) return
    const candidates = availabilities.filter(a => a.date === date && !isOpening(a) && canAssign(a))
    candidates.sort((a, b) =>
      (empDayCount[a.employee_name] || 0) - (empDayCount[b.employee_name] || 0)
    )
    for (const c of candidates) {
      if (assigned.filter(a => a.date === date && !isOpening(a)).length >= 2) break
      if (canAssign(c)) assign(c)
    }
  })

  return assigned
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
  const [currentWeekStart, setCurrentWeekStart] = useState('')
  const [generating, setGenerating] = useState(false)

  const fetchShifts = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('date', { ascending: true })
    if (!error) setShifts(data || [])
  }, [])

  useEffect(() => { fetchShifts() }, [fetchShifts])

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

  const getWeekDates = () => {
    const startStr = currentWeekStart || (() => {
      const d = new Date()
      const day = d.getDay()
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      return localDateStr(d)
    })()
    const [y, mo, day] = startStr.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(y, mo - 1, day + i)
      return localDateStr(d)
    })
  }

  const handleGenerateSchedule = async () => {
    if (!isManager || generating) return
    const days = getWeekDates()
    const weekAvail = shifts.filter(s => days.includes(s.date) && s.status === 'available')

    if (weekAvail.length === 0) {
      showToast('No availability submitted for this week')
      return
    }

    if (!window.confirm('Generate schedule for this week? Existing confirmed shifts will be replaced.')) return

    setGenerating(true)
    await supabase.from('bookings').delete().in('date', days).eq('status', 'scheduled')

    const toSchedule = runScheduleAlgorithm(weekAvail, days)
    if (toSchedule.length > 0) {
      await supabase.from('bookings').insert(
        toSchedule.map(s => ({
          employee_name: s.employee_name,
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          created_by: s.created_by,
          status: 'scheduled',
        }))
      )
    }

    await fetchShifts()
    setGenerating(false)
    showToast(`Schedule generated — ${toSchedule.length} shifts assigned`)
  }

  // Weeks that already have a confirmed schedule — hide availability for those weeks
  const scheduledWeeks = new Set(
    shifts.filter(s => s.status === 'scheduled').map(s => getWeekMonday(s.date))
  )

  const myShifts = shifts.filter(s => s.employee_name === myName || s.created_by === myName)

  // Hide availability for any week that already has confirmed shifts
  const visibleShifts = (isManager ? shifts : myShifts).filter(s =>
    s.status === 'scheduled' || !scheduledWeeks.has(getWeekMonday(s.date))
  )

  const events = visibleShifts.map(s => {
    const color = getColor(s.employee_name)
    const isScheduled = s.status === 'scheduled'
    // Cross-midnight shifts end on the next day
    let endDate = s.date
    if (s.end_time < s.start_time) {
      const [ey, em, ed] = s.date.split('-').map(Number)
      endDate = localDateStr(new Date(ey, em - 1, ed + 1))
    }
    return {
      id: s.id,
      title: s.employee_name,
      start: `${s.date}T${s.start_time}`,
      end: `${endDate}T${s.end_time}`,
      backgroundColor: isScheduled ? color.bg : '#ffffff',
      borderColor: color.bg,
      textColor: color.text,
      extendedProps: { shift: s },
    }
  })

  const handleEventClick = ({ event }) => {
    const shift = event.extendedProps.shift
    const canEdit = isManager || (shift.status === 'available' && shift.created_by === myName)
    if (canEdit) {
      setEditingShift(shift)
      setShowShiftForm(true)
    } else if (shift.status === 'scheduled') {
      showToast('Confirmed shifts can only be edited by the manager')
    } else {
      showToast(`This belongs to ${shift.employee_name}`)
    }
  }

  const handleDateSelect = (info) => {
    setDefaultDate(info.startStr.split('T')[0])
    setEditingShift(null)
    setShowShiftForm(true)
  }

  const handleExport = () => {
    if (!isManager) return

    const days = getWeekDates()
    const DAY_LABELS = ['MON', 'TUES', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    const dayObjs = DAY_LABELS.map((label, i) => {
      const [dy, dm, dd] = days[i].split('-').map(Number)
      return { label, iso: days[i], display: `${dd}/${dm}/${dy}` }
    })

    const calcHours = (start, end) => {
      let s = toMins(start), e = toMins(end)
      if (e <= s) e += 24 * 60
      return (e - s) / 60
    }

    const scheduledShifts = shifts.filter(s => s.status === 'scheduled' && days.includes(s.date))
    const employees = [...new Set(scheduledShifts.map(s => s.employee_name))].sort()

    if (employees.length === 0) {
      showToast('No confirmed schedule yet — generate one first')
      return
    }

    const row0 = ['']
    const row1 = ['']
    const row2 = ['Employee']
    dayObjs.forEach(d => {
      row0.push(d.label, '', '', '')
      row1.push(d.display, '', '', '')
      row2.push('Start', 'End', 'Break', 'Hours')
    })
    row0.push('T.WK HRS')
    row1.push('')
    row2.push('')

    const dataRows = employees.map(emp => {
      const row = [emp]
      let total = 0
      dayObjs.forEach(d => {
        const shift = scheduledShifts.find(s => s.employee_name === emp && s.date === d.iso)
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

    const totalsRow = ['AL DAILY HOURS']
    let grandTotal = 0
    dayObjs.forEach(d => {
      const hrs = scheduledShifts
        .filter(s => s.date === d.iso)
        .reduce((sum, s) => sum + calcHours(s.start_time, s.end_time), 0)
      grandTotal += hrs
      totalsRow.push('', '', '', hrs || '')
    })
    totalsRow.push(grandTotal || '')

    const aoa = [row0, row1, row2, ...dataRows, totalsRow]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = dayObjs.map((_, i) => ({
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
    XLSX.writeFile(wb, `schedule-${days[0]}.xlsx`)
  }

  const today = localDateStr(new Date())

  return (
    <div className="app">
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

      {toast && <div className="toast">{toast}</div>}

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
              <button className="btn-outline" onClick={handleGenerateSchedule} disabled={generating}>
                {generating ? 'Generating…' : '⚡ Generate Schedule'}
              </button>
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
            + Add availability
          </button>
        </div>
      </div>

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
          slotMaxTime="26:00:00"
          slotDuration="01:00:00"
          allDaySlot={false}
          events={events}
          selectable={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          height="auto"
          nowIndicator={true}
          datesSet={(info) => setCurrentWeekStart(info.startStr.split('T')[0])}
          eventContent={(arg) => {
            const shift = arg.event.extendedProps.shift
            const canEdit = isManager || (shift.status === 'available' && shift.created_by === myName)
            const parts = shift.employee_name.split(' ')
            const shortName = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0]
            return (
              <div style={{ padding: '3px 6px', cursor: canEdit ? 'pointer' : 'default', height: '100%', boxSizing: 'border-box' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {shortName}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px', whiteSpace: 'nowrap' }}>
                  {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                </div>
              </div>
            )
          }}
        />
      </div>

      {visibleShifts.length > 0 && (
        <div className="legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#e0e0e0', border: '1px solid #aaa' }} />
            <span style={{ color: '#888' }}>hollow = preference</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#185FA5' }} />
            <span style={{ color: '#888' }}>solid = confirmed</span>
          </div>
          {[...new Set(visibleShifts.map(s => s.employee_name))].map(name => {
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
