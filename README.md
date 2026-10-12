# Qehwa Chess

Qehwa Chess is a community platform for finding and organizing chess activities across Morocco. Players can discover tournaments, clubs, casual meetups, nearby players, and event locations. Organizers can manage tournaments and clubs, while administrators review tournament listings.

## Features

- Browse tournaments, view event details, and register or check in.
- Find casual meetups, chess clubs, cities, and players.
- Explore events and cities on an interactive map; optionally find nearby events or players using browser location.
- Create a player profile, mark yourself open to play, and message other players or meetup groups.
- Manage club memberships and teams, and organize tournament pairings and results.
- Use the interface in English, French, or Arabic, with light and dark themes.

## Tech stack

- React 18 and TypeScript
- Vite, Tailwind CSS, and Leaflet / React Leaflet
- Supabase for authentication, database, realtime messaging, and storage
- Vercel Analytics

## Requirements

- Node.js and npm
- A Supabase project

## Getting started

The Vite app and its npm scripts are in the `project/` directory.

1. Install dependencies:

   ```bash
   cd project
   npm install
   ```

2. Create `project/.env.local` with your Supabase project URL and anon key:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

3. Set up the database by applying the SQL files in `project/supabase/migrations/` in filename order using the Supabase CLI or SQL editor. Optionally run `project/supabase/seed.sql` to add sample cities, clubs, and tournaments.

4. Start the development server:

   ```bash
   npm run dev
   ```

Vite prints the local URL in the terminal. The app uses Supabase for its data and authentication, so configure a Supabase project before using those features.

## Scripts

Run these from `project/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build in `project/dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check the app's TypeScript types |

## Project layout

```text
project/
├── src/
│   ├── components/   # Shared UI and tournament components
│   ├── context/      # Authentication, routing, language, and theme state
│   ├── hooks/        # Data and device-location hooks
│   ├── lib/          # Supabase client and shared utilities
│   ├── pages/        # App screens
│   └── types/        # TypeScript models
└── supabase/
    ├── migrations/   # Database schema and policy changes
    └── seed.sql      # Optional example data
```

Navigation is handled with URL hash routes (for example, `#/tournaments`). Database changes live in the ordered Supabase migration files.
