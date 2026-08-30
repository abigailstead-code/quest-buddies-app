# Prompt to give another coding AI

You are continuing an existing project called **Quest Road**. Do NOT restart or replace the project architecture. First inspect every existing file and the supplied product specification, then make incremental edits.

The repository contains:
- a working React + TypeScript + Vite localStorage prototype;
- `QUEST_ROAD_SPEC.md`, which is the source of truth for product behavior;
- `supabase/migrations/001_quest_road.sql`, which defines the intended production backend contract;
- an optional Supabase client in `src/lib/supabase.ts`.

## Main task
Convert the local demo into a real private two-account application backed by Supabase **without breaking the current UI/game behavior**.

Implement in this order:
1. Read `QUEST_ROAD_SPEC.md` and the migration. Do not alter product rules unless necessary for correctness/security.
2. Add Supabase email/password authentication with session persistence and sign-out.
3. Add onboarding after signup: create a Quest Road pair and receive an invite code, or join an existing pair using an invite code.
4. Add a secure Postgres function/constraint that prevents more than two `pair_members` in a pair and allows joining by invite code without exposing other pairs.
5. Replace localStorage CRUD in `GameContext.tsx` with Supabase queries/RPCs. Keep a clear loading state and error handling. Do not let users edit the other player's quests.
6. Load both profiles for the shared dashboard/map. Remove the demo player-switching behavior once authentication works.
7. Use `set_quest_completed` and `redeem_reward` RPCs for coin-sensitive operations so balance updates are atomic.
8. Add Supabase realtime subscriptions for pair quests, milestones, encouragements, rewards and transactions so both friends see updates quickly.
9. Implement edit quest and edit reward dialogs.
10. Add a monthly calendar view while retaining the existing weekly planner.
11. Add a `weekly_summaries` table and logic that snapshots the previous Monday–Sunday level once, then shows a one-time celebratory Level Complete modal containing quests completed, coins earned, XP earned, active completion days, and the next level. Do not punish incompletion.
12. Implement optional weekly bonuses from `weekly_bonus_rules`; bonuses must be idempotent (never paid twice).
13. Add useful empty/loading/error states and mobile polish.
14. Run the typecheck/build and fix all errors.

## Rules you must preserve
- Week = Monday through Sunday.
- Future weekly levels are mathematically derived from dates; do NOT generate hundreds of database week records just to show future levels.
- Old unfinished quests remain and become overdue; they can still be completed later.
- Completing an overdue quest earns its original reward.
- Never delete earned coins at the start of a new week.
- Never reset the overall journey.
- One friend's missed quest cannot block the other friend's progress.
- Weekly progress should be encouraging; default target = ceil(80% of planned quests), not perfection.
- Major milestones are separate from weekly levels and can span months.
- Coin balances must not be trusted from the client. Use the transaction ledger/RPCs.
- RLS must prevent non-members from seeing a pair's data.
- Keep the current warm adventure visual language rather than replacing it with a generic SaaS dashboard.

## Before coding
Give a short audit of what already exists and identify the smallest changes needed for the next milestone. Then implement rather than producing a new high-level plan only.
