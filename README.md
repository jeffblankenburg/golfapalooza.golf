# Golfapalooza

Live scoring, tracking, and planning for Golfapalooza.

## Features

- **Live Scoring** - Enter and track scores in real-time
- **Leaderboard** - View current standings and rankings
- **Player Management** - Manage players and teams
- **Tournament Planning** - Schedule events and manage courses

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Database/Auth**: Supabase
- **Deployment**: Vercel
- **PWA**: Installable on mobile devices

## Getting Started

1. Clone the repository
2. Copy `.env.local.example` to `.env.local` and add your Supabase credentials
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Deployment

Deploy to Vercel with one click or connect your repository for automatic deployments.
