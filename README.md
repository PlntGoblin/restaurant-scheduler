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

### Build for Production

```bash
npm run build
npm start
```

---

## Project Structure

```
app/
├── components/
│   ├── Dashboard.tsx           # Daily roster setup
│   ├── StaffManagement.tsx     # Staff CRUD + preferences
│   ├── ScheduleGenerator.tsx   # Rotation algorithm + schedule display
│   └── History.tsx             # Past 7 days of schedules
├── layout.tsx
├── page.tsx                    # Tab navigation
└── globals.css
lib/
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

---

## License

MIT
