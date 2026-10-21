# Restaurant Scheduler

A smart rotation scheduler built for restaurant lunch rush shifts. Automatically generates fair position assignments across time slots, balancing staff preferences, seniority, hot position limits, and historical variety — so your team always knows where they need to be.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)

---

## How It Works

Set up your staff roster, pick who's working today, and the scheduler generates a full rotation across three hourly time slots (11am–12pm, 12pm–1pm, 1pm–2pm). The algorithm ensures nobody gets stuck on the same station all day, hot positions get rotated fairly, and senior staff fill gaps when constraints are tight.

---

## Features

### Dashboard
- **Pull from Toast** &mdash; reads the published Toast schedule for a date and fills in the roster, each person's shift duration, and who opened the grill
- **Check Clock-Ins** &mdash; compares the roster against who actually clocked in, flagging possible no-shows and unscheduled arrivals
- Select the date and add staff working that day
- Set individual shift durations (11–1pm, 11–2pm, 12–2pm, 1–2pm)
- Designate who opened the grill (9–10am pre-service)
- Toggle **One Griller Only** mode for slow days
- Auto-saves to history on generate

### Staff Management
- Add and edit staff members with name and seniority level (GM, AGM, Captain, Team Member)
- Set position preferences on a 1–5 scale for each station
- Export staff data to JSON
- View each staff member's top 3 preferred positions at a glance

### Toast Link
- Pairs each staff member with their Toast employee record, once
- Suggests matches by name &mdash; including chosen-name vs legal-name pairs ("Toni" / "Antoinette")
- Every link is confirmed by a human; nothing is auto-linked from a name alone
- Adds people straight from Toast if they aren't in the roster yet
- Stores every Toast GUID a person has, so multi-store staff keep their shifts

### Schedule Generator
- Generates rotation across 3 hourly time slots
- Assigns up to **8 positions**: Grill 1, Grill 2, P.O.S., Expo 1, Expo 2, Fries, Lobby/Dish 1, Lobby/Dish 2
- Dynamically adjusts active positions based on staff count (5–8+ people)
- Print-ready schedule output

### Scheduling Algorithm
| Rule | Description |
|------|-------------|
| **Preference scoring** | Staff rated 1–5 per position; higher preference = higher assignment priority |
| **No same-position repeats** | Hard block — nobody works the same position twice in one day |
| **Hot position limit** | Grill and Fries capped at 1 assignment per person per shift |
| **Hot position diversity** | Penalty for getting both Grill *and* Fries in the same shift |
| **Yesterday penalty** | Avoids assigning the same person to the same position + time slot as the day before |
| **Historical variety** | Tracks past 7 days to spread assignments evenly over time |
| **Seniority fallback** | When multiple staff tie, seniority breaks it (GM > AGM > Captain > Team Member) |
| **Grill opener protection** | Whoever opened the grill pre-service skips hot positions during 11am–12pm |
| **Essential positions first** | P.O.S., Grill 1, Expo 1, Fries, Expo 2 always get filled before Lobby/Dish |
| **6-person busy mode** | During 11–12 and 12–1 with 6 staff, Grill 2 becomes essential (2 grillers for rush) |

### History
- View the past 7 days of generated schedules
- Shows staff roster, shift durations, grill opener, and full rotation grid per day

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm, yarn, pnpm, or bun

### Installation

```bash
git clone https://github.com/PlntGoblin/restaurant-scheduler.git
cd restaurant-scheduler
npm install
```

### Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start scheduling.

### Run the Tests

```bash
npm test
```

Covers the pure core of the Toast integration: timezone conversion, shift →
duration mapping, name matching, and the roster diff.

### Build for Production

```bash
npm run build
npm start
```

---

## Project Structure

```
app/
├── api/toast/
│   ├── employees/route.ts      # Toast employee list (server-side)
│   ├── shifts/route.ts         # Lunch-rush shifts for one date
│   └── time-entries/route.ts   # Actual clock-ins for one date
├── components/
│   ├── Dashboard.tsx           # Daily roster setup + Toast pull
│   ├── StaffManagement.tsx     # Staff CRUD + preferences
│   ├── ToastLink.tsx           # Staff ↔ Toast employee linking
│   ├── ScheduleGenerator.tsx   # Rotation algorithm + schedule display
│   └── History.tsx             # Past 7 days of schedules
├── layout.tsx
├── page.tsx                    # Tab navigation
└── globals.css
lib/
├── toast/
│   ├── client.ts               # Toast auth + GET (SERVER ONLY — holds secrets)
│   ├── server.ts               # Labor API fetchers, cache, error shaping
│   ├── time.ts                 # UTC ↔ restaurant-local time
│   ├── shifts.ts               # Shift → duration bucket mapping (pure)
│   ├── match.ts                # Name-matching suggestions (pure)
│   ├── roster.ts               # Roster diff + clock-in reconcile (pure)
│   └── __tests__/              # 54 unit tests over the pure core
├── types/
│   └── index.ts                # Shared TypeScript interfaces
└── constants.ts                # Shared position & time slot constants
```

---

## Tech Stack

| Layer       | Technology              |
|-------------|-------------------------|
| Framework   | Next.js 16 (Turbopack)  |
| UI          | React 19                |
| Language    | TypeScript 5            |
| Styling     | Tailwind CSS 4          |
| Persistence | localStorage            |
| Integration | Toast Labor API (read-only) |
| Tests       | Vitest                  |

---

## Toast Integration

The Dashboard can read the published Toast schedule instead of having the roster
typed in by hand.

### Setup

1. In Toast Web, go to **Integrations → Toast API access → Manage credentials**
   and create a standard API credential. The secret is shown once.
2. Copy `.env.example` to `.env.local` and fill in all four values.
3. Set the same four variables in the Vercel project, for **Production and
   Preview**, then redeploy.

```
TOAST_CLIENT_ID
TOAST_CLIENT_SECRET
TOAST_HOSTNAME          # e.g. ws-api.toasttab.com
TOAST_RESTAURANT_GUID   # the location's GUID
```

None of these may ever be prefixed `NEXT_PUBLIC_` — that prefix inlines a value
into the browser bundle.

### Using it

1. Open **Toast Link** and pair each staff member with their Toast record. This
   is a one-time step per person; new hires need linking before they appear.
2. On the **Dashboard**, pick a date and press **Pull from Toast**. You get a
   preview of what would change; nothing is applied until you confirm.
3. On the day itself, **Check Clock-Ins** compares the roster against who
   actually clocked in.

### How shifts are mapped

Toast shifts are arbitrary time ranges; this app has four duration buckets. Each
shift is clipped to the 11am–2pm rush and matched to the closest bucket by
overlap. Shifts that don't fit cleanly — an 11:00–12:00, say — are applied as
the closest match **and flagged** with an amber chip showing the real Toast
times, because a bad fit you can see is fixable and one you can't is a person
standing on the floor at the wrong hour.

Shifts outside the rush (7am prep, evening close) are ignored by design, and the
pull says so rather than reporting that Toast returned nothing.

## Sign-in

One shared password for the store's managers, set as `SCHEDULER_PASSWORD` and
checked on the server. Signing in sets a signed, httpOnly session cookie that
lasts 30 days; `proxy.ts` requires it on every `/api/*` route except
`/api/auth/*`.

The gate **fails closed**: if `SCHEDULER_PASSWORD` or
`SCHEDULER_SESSION_SECRET` is missing, the guarded routes return 503 instead of
serving data. A gate that disables itself when misconfigured is not a gate.

This replaced a login that compared the typed password against one the browser
had stored for itself (`localStorage['appAccount']`) — anyone could register
their own account, and the server checked nothing at all.

**Attempt limiting:** 5 failed attempts per caller per 15 minutes, matching
Forecast86's sign-in limiter. The limit is checked *before* the password is
compared, so a blocked caller learns nothing from the response; a successful
sign-in clears that caller's failures, because a password an entire shift
shares gets fat-fingered and nobody should be one slip from a lockout. There
is no global cap on purpose — that would let anyone lock the restaurant out of
its own scheduler mid-rush.

Be clear about what it is worth: the counters live in memory in one serverless
instance, so an attacker spreading requests across instances gets more than 5,
and a quiet period resets them. It is a speed bump, not a lock. Doing it
properly needs a durable shared store, and this app deliberately has no
writable one — its only database credential is read-only.

## Where the Toast links come from

Toast's schedule identifies people by GUID and nothing else, so the app needs a
GUID → person mapping. That mapping is **not maintained here**. Forecast86's
`scripts/link_toast_employees.py` already keeps it current in
`employees.external_ids->'toast_guids'`, including the awkward parts — one
human has a different GUID at every store they can work, and Devin Sergi has
three.

Set `SCHEDULER_LINKS_DB_URL` and `/api/links` reads that mapping, so a pull can
name the people on Toast's schedule and create staff records for anyone this
app has never heard of. Both effects are **additive**: a refresh never removes
or renames an existing record.

The credential must be the `scheduler_reader` role from
`supabase/phase36_scheduler_links.sql` in the Forecast86 repo, which can
`SELECT` exactly one view of names and GUIDs — not the postgres superuser URL.
If it leaks, what leaks is employee names and Toast GUIDs, which this app shows
its users anyway.

Without the variable the app still works; it just falls back to links paired by
hand in **Toast Link**, which live in one browser and go stale the next time
someone is hired.

### Known limits

- **Nicknames still need a human.** The database is authoritative about
  GUID → legal name; it knows nothing about the nicknames typed into this app.
  "Red" and "Robert Wressell" share no letters, so the app reports the pairing
  as unresolved rather than guessing it. Pair those once in **Toast Link**.
- **Someone unlinked in My Forefathers is unlinked here too.** They appear in
  the "not linked" banner by shift time. Fixing it there fixes it on every
  device; fixing it here fixes it on one.
- **Hand-paired links still live in `localStorage`, per browser.** Only the
  links read from the database are shared. Staff Management's JSON export is
  the stopgap for the rest.
- **Reads only.** Toast's Labor API is read-only on this access tier. The
  generated rotation stays in this app; nothing is written back to Toast.
- **Toast mirrors what's been published.** If next week isn't published yet, a
  pull for those dates correctly returns nothing.
- Single location, set by `TOAST_RESTAURANT_GUID`.

## License

MIT
