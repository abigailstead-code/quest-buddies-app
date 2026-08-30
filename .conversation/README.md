# Quest Road starter

A responsive two-player accountability/adventure prototype built with React, TypeScript and Vite.

## What already works in the starter
- Weekly Monday–Sunday levels derived from dates
- Individual player weekly progress with an 80% target
- Today + overdue quest view
- Create, complete/reopen and delete quests
- Coins + XP awarded on completion and reversed on reopening
- Shared visual adventure map with both player markers
- Future weekly planning
- Long-term milestones
- Reward shop + redemption
- Side-by-side two-player dashboard
- Encouragement messages
- Coin history
- Browser persistence with localStorage
- Responsive mobile bottom navigation

The current two-player switch button is intentionally a local demo mechanism. Production authentication is scaffolded in the Supabase migration/spec but not yet wired to the UI.

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Backend migration
Create a Supabase project and run `supabase/migrations/001_quest_road.sql`. Copy `.env.example` to `.env` and add your project URL and anon key. The UI still uses localStorage until the continuation work in `CONTINUE_PROMPT.md` is completed.

## Best files to give another AI first
1. `QUEST_ROAD_SPEC.md`
2. `CONTINUE_PROMPT.md`
3. The whole repository

This avoids spending tokens explaining the product repeatedly.
