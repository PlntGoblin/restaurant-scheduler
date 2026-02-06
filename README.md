# Restaurant Scheduler

A Next.js application for automatically generating position rotation schedules for restaurant lunch rush shifts.

## Features

- **Dashboard**: Select daily staff, shift durations, and grill opener
- **Staff Management**: Create staff members with position preferences (1-5 rating) and seniority levels
- **Schedule Generator**: Automatically generate rotation schedules with smart algorithms
- **History**: Track and view past 7 days of schedules

### Smart Scheduling Algorithm

- **Position Preferences**: Considers staff preferences (1-5 rating scale)
- **Hot Position Rules**: Limits hot positions (Grill, Fries) to max 1 per person per shift
- **Seniority Fallback**: Uses seniority (GM → AGM → Captain → Team Member) when constraints can't be met
- **Historical Variety**: Tracks past 7 days to ensure variety in assignments
- **Essential Positions**: Always fills critical positions (POS, Grill 1, Expo 1, Fries, Expo 2) first
- **One Griller Mode**: Support for slow days (Sundays) with single griller

## Tech Stack

- **Framework**: Next.js 16.1.6 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Storage**: localStorage for data persistence

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd restaurant-scheduler
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### 1. Add Staff Members

Go to **Staff Management** tab:
- Click "Add Staff Member"
- Enter name and select seniority level
- Set position preferences (1-5 scale)
- Click "Save"

### 2. Set Up Daily Roster

Go to **Dashboard** tab:
- Select the date
- Add staff members working that day
- Set their shift duration (11-1pm, 11-2pm, 12-2pm, or 1-2pm)
- Select who opened grill (optional)
- Toggle "One Griller Only" if needed
- Click "Save Daily Staff"

### 3. Generate Schedule

The schedule will automatically generate and switch to the **Generator** tab:
- View the rotation schedule across 3 time slots
- Print the schedule if needed

### 4. View History

Go to **History** tab to see past 7 days of schedules

## Position Details

### All Positions
- Grill 1, Grill 2
- P.O.S.
- Expo 1, Expo 2
- Fries
- Lobby/Dish 1, Lobby/Dish 2

### Essential Positions (Always Filled)
- P.O.S., Grill 1, Expo 1, Fries, Expo 2

### Hot Positions (Limited to 1 per shift)
- Grill 1, Grill 2, Fries

## Time Slots

- 11am-12pm
- 12pm-1pm
- 1pm-2pm

## Building for Production

```bash
npm run build
npm start
```

## Deployment

### Deploy to Vercel

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel
```

### Deploy to Netlify

1. Build the project:
```bash
npm run build
```

2. Drag and drop the `.next` folder to Netlify

## License

MIT

## Author

Created with Claude Code
