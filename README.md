# Garrett Schedule

A staff scheduling application for collecting availability, generating weekly shifts, and exporting a roster to Excel.

## Features

- Staff submit availability through a weekly calendar.
- Managers generate a schedule from submitted availability and edit shifts.
- The scheduling heuristic prioritises coverage and attempts to distribute shifts across staff, subject to availability and scheduling rules.
- Supabase stores bookings and updates the calendar when changes occur.
- Managers can export the weekly schedule and hours to an Excel file.

The generator may leave coverage gaps when suitable availability is missing. Review the generated roster before use.

## Stack

React, Vite, FullCalendar, Supabase and SheetJS.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The app expects a configured Supabase project and a `bookings` table. Set these values in a local `.env.local` file:

```text
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The repository does not currently document the database schema or policies, so the configuration alone may not be sufficient to reproduce the application.

Other commands: `npm run build`, `npm run lint`, and `npm run preview`.
