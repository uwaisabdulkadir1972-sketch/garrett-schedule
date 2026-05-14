import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://zbxhrbagcpfdbyxqhini.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpieGhyYmFnY3BmZGJ5eHFoaW5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTkwMzksImV4cCI6MjA5NDMzNTAzOX0._jzPRk7B9DrxKa_F8SRvvq3zyNZBp0L8hAssMp-muUQ'
)

const MON = '2026-05-18'
const TUE = '2026-05-19'
const WED = '2026-05-20'
const THU = '2026-05-21'
const FRI = '2026-05-22'
const SAT = '2026-05-23'
const SUN = '2026-05-24'

// Shift templates
const OPEN   = { s: '05:00:00', e: '10:00:00' }  // Opening — max 1/day, ends before mid starts
const MID    = { s: '10:00:00', e: '18:00:00' }  // Mid
const MID2   = { s: '11:00:00', e: '18:00:00' }  // Mid (later start, must end by 6pm)
const CLOSE  = { s: '18:00:00', e: '01:00:00' }  // Closing — min 2/day
const CLOSE2 = { s: '19:00:00', e: '01:00:00' }  // Closing (later start)

/*
  Realistic patterns:
  - Hasbullah & Azucena are the dedicated openers (alternating days)
  - Maricel & Siti are P Leaders who mostly do closing/mid
  - CSA staff are mostly part-time (3–4 days/week)
  - Saturday is the busiest — most people available
  - Sunday has decent coverage
  - Weekdays are lighter
*/
const availability = [

  // ── P LEADERS ────────────────────────────────────────────────────────

  // Hasbullah — dedicated opener, Mon/Wed/Fri/Sun
  { name: 'Hasbullah Bin Abu Hasan',           date: MON, ...OPEN   },
  { name: 'Hasbullah Bin Abu Hasan',           date: WED, ...OPEN   },
  { name: 'Hasbullah Bin Abu Hasan',           date: FRI, ...OPEN   },
  { name: 'Hasbullah Bin Abu Hasan',           date: SUN, ...OPEN   },

  // Azucena — dedicated opener, Tue/Thu/Sat + mid on Sun
  { name: 'Azucena Imelda Manuel',             date: TUE, ...OPEN   },
  { name: 'Azucena Imelda Manuel',             date: THU, ...OPEN   },
  { name: 'Azucena Imelda Manuel',             date: SAT, ...OPEN   },
  { name: 'Azucena Imelda Manuel',             date: SUN, ...MID    },

  // Maricel — senior closer, Mon/Tue/Wed/Fri
  { name: 'Maricel Santos',                    date: MON, ...CLOSE  },
  { name: 'Maricel Santos',                    date: TUE, ...CLOSE  },
  { name: 'Maricel Santos',                    date: WED, ...MID    },
  { name: 'Maricel Santos',                    date: FRI, ...CLOSE  },

  // Siti Masnirah — senior, Tue/Wed/Thu/Sat
  { name: 'Siti Masnirah Binte Saini',         date: TUE, ...CLOSE  },
  { name: 'Siti Masnirah Binte Saini',         date: WED, ...CLOSE2 },
  { name: 'Siti Masnirah Binte Saini',         date: THU, ...MID2   },
  { name: 'Siti Masnirah Binte Saini',         date: SAT, ...CLOSE  },

  // ── T-TIME CSA ───────────────────────────────────────────────────────

  // Emeline — part-time, Mon + weekends
  { name: 'Emeline Paderes Tolbe',             date: MON, ...MID2   },
  { name: 'Emeline Paderes Tolbe',             date: SAT, ...CLOSE  },
  { name: 'Emeline Paderes Tolbe',             date: SUN, ...CLOSE2 },

  // Muhammad Raof — weekday closing
  { name: 'Muhammad Raof Bin Herman',          date: WED, ...CLOSE  },
  { name: 'Muhammad Raof Bin Herman',          date: THU, ...CLOSE2 },
  { name: 'Muhammad Raof Bin Herman',          date: FRI, ...MID2   },
  { name: 'Muhammad Raof Bin Herman',          date: SAT, ...MID    },

  // Cleo — mid shifts, Mon/Wed/Sat/Sun
  { name: 'Cleo Khor Jia Hui',                 date: MON, ...MID    },
  { name: 'Cleo Khor Jia Hui',                 date: WED, ...MID2   },
  { name: 'Cleo Khor Jia Hui',                 date: SAT, ...MID    },
  { name: 'Cleo Khor Jia Hui',                 date: SUN, ...MID2   },

  // Nuratiqah — Tue/Thu/Sat/Sun
  { name: 'Nuratiqah Bnte Salim',              date: TUE, ...MID    },
  { name: 'Nuratiqah Bnte Salim',              date: THU, ...MID2   },
  { name: 'Nuratiqah Bnte Salim',              date: SAT, ...CLOSE2 },
  { name: 'Nuratiqah Bnte Salim',              date: SUN, ...MID    },

  // Skye — closing only, Mon/Fri/Sat
  { name: 'Skye Chua',                         date: MON, ...CLOSE2 },
  { name: 'Skye Chua',                         date: FRI, ...CLOSE  },
  { name: 'Skye Chua',                         date: SAT, ...CLOSE  },

  // Naseeba — Tue/Thu/Sat/Sun
  { name: 'Naseeba D/O Abdul Saleem',          date: TUE, ...MID2   },
  { name: 'Naseeba D/O Abdul Saleem',          date: THU, ...MID    },
  { name: 'Naseeba D/O Abdul Saleem',          date: SAT, ...MID2   },
  { name: 'Naseeba D/O Abdul Saleem',          date: SUN, ...CLOSE  },

  // Muhammad Qays — Tue/Sat/Sun
  { name: 'Muhammad Qays Ilhan',               date: TUE, ...CLOSE  },
  { name: 'Muhammad Qays Ilhan',               date: SAT, ...CLOSE2 },
  { name: 'Muhammad Qays Ilhan',               date: SUN, ...MID    },

  // Umar Zayan — Mon/Thu/Sat/Sun
  { name: 'Umar Zayan',                        date: MON, ...CLOSE  },
  { name: 'Umar Zayan',                        date: THU, ...CLOSE  },
  { name: 'Umar Zayan',                        date: SAT, ...MID2   },
  { name: 'Umar Zayan',                        date: SUN, ...CLOSE2 },

  // Uwais — weekday mid, Mon/Wed/Thu/Fri
  { name: 'Uwais Ahamed Abdul Kadir',          date: MON, ...MID2   },
  { name: 'Uwais Ahamed Abdul Kadir',          date: WED, ...MID    },
  { name: 'Uwais Ahamed Abdul Kadir',          date: THU, ...MID2   },
  { name: 'Uwais Ahamed Abdul Kadir',          date: FRI, ...MID    },

  // Qurratu'ani — closing specialist, Tue/Thu/Sat/Sun
  { name: "Qurratu'ani Binte Mohamad Azli",   date: TUE, ...CLOSE2 },
  { name: "Qurratu'ani Binte Mohamad Azli",   date: THU, ...CLOSE  },
  { name: "Qurratu'ani Binte Mohamad Azli",   date: SAT, ...CLOSE  },
  { name: "Qurratu'ani Binte Mohamad Azli",   date: SUN, ...CLOSE2 },

  // Wei Hong (T2) — Fri/Sat/Sun only
  { name: 'Wei Hong',                          date: FRI, ...MID    },
  { name: 'Wei Hong',                          date: SAT, ...MID2   },
  { name: 'Wei Hong',                          date: SUN, ...MID    },

  // Nisa (T2) — Thu/Sat/Sun only
  { name: 'Nisa',                              date: THU, ...MID    },
  { name: 'Nisa',                              date: SAT, ...MID2   },
  { name: 'Nisa',                              date: SUN, ...CLOSE  },
]

const records = availability.map(a => ({
  employee_name: a.name,
  date: a.date,
  start_time: a.s,
  end_time: a.e,
  created_by: a.name,
  status: 'available',
}))

// Clear existing data for this week
await supabase.from('bookings').delete().gte('date', MON).lte('date', SUN)

const { error } = await supabase.from('bookings').insert(records)

if (error) {
  console.error('Error:', error.message)
} else {
  console.log(`✓ Inserted ${records.length} availability records for ${MON} → ${SUN}`)
  console.log()
  console.log('Day breakdown:')
  const days = { MON, TUE, WED, THU, FRI, SAT, SUN }
  for (const [label, date] of Object.entries(days)) {
    const r = records.filter(x => x.date === date)
    const open  = r.filter(x => x.start_time < '08:00:00').length
    const close = r.filter(x => x.start_time >= '18:00:00').length
    const mid   = r.length - open - close
    console.log(`  ${label}: ${r.length} people  (${open} open, ${mid} mid, ${close} close)`)
  }
}
