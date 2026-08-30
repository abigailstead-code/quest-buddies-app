# Quest Road — product specification

## Product idea
A private, responsive, two-player accountability and motivation game for two friends. It should make long-term goals (university applications, jobs, study, research, personal projects, etc.) feel like a cooperative adventure without turning missed tasks into punishment.

## Non-negotiable design principles
1. Encouraging, never punitive.
2. Two people share one journey/map but each owns their own progress.
3. A missed quest does not reset a streak of levels, remove coins, or block the other player.
4. Monday begins a fresh weekly chapter. Old unfinished quests remain visible as overdue and can still be completed.
5. Long-term progress must coexist with small weekly wins.
6. The product should feel warm, playful, polished, and grown-up — not like a childish school app.

## Weekly level system
- One Monday–Sunday week = one level.
- Level number is derived from the pair's journey start week. Do not manually store or create week rows unless later needed for snapshots.
- Show current level, date range, tasks remaining, coins earned during that week, weekly progress, days remaining.
- Weekly progress uses approximately 80% of planned quests as the default target so perfection is not required.
- Also track active completion days.
- When a week closes, retain the stats in history and surface a celebratory summary when the player next opens the app.
- Example summary: tasks completed, coins, XP, active-day streak, next level.

## Future levels
- Future weeks are derived automatically from dates.
- The planner can navigate weeks/months ahead and put a quest on any date.
- If a quest is scheduled months ahead, the corresponding future level exists automatically.

## Major milestones
- Milestones sit on the map as larger checkpoints independent of weekly quests.
- They have title, target date, optional description/emoji, completion state.
- Examples: Exploration complete; Applications prepared; Applications submitted.

## Two-player behavior
- Exactly two pair members for v1.
- Both see both progress summaries and characters.
- Each player edits/completes only their own quests.
- Shared data: map, milestones, reward shop, encouragement messages.
- Switching players in the current starter is DEMO-ONLY; real production version uses separate authentication accounts.

## Economy
Default quest values:
- Small: 10 coins / 25 XP
- Standard: 20 coins / 50 XP
- Boss: 40 coins / 100 XP
Coins are an immutable transaction ledger in the backend. A balance is the sum of the ledger.
Rewards can be created by either player and redeemed if balance is sufficient. Never allow negative balances.

## Optional weekly bonus rules
Configurable later:
- reach 80% of planned quests: bonus coins / achievement
- complete on 5+ different days: streak/activity bonus
- weekly main goal: special bonus
Do not hard-code these as mandatory penalties or blockers.

## Pages
### Today
Current weekly level, stats, today's quests + overdue quests, add quest, complete/reopen, coin/XP feedback.

### Quest Map
A vertically/curving adventure road with numbered weekly stops and both character markers. Major milestones appear as bigger signs/checkpoints. Road expands into future weeks.

### Plan / Calendar
Week navigation and later month view. Add/edit/delete tasks on future dates. Display which weekly level a date belongs to.

### Rewards
Balance, shared reward cards, creation, redemption, history.

### Together
Side-by-side player status, weekly progress, XP/coins/streak/activity, encouragements.

### History
Coin transaction history and eventually weekly level summaries.

### Settings
Profiles/avatar, milestones, pair management, invite code, configurable reward/bonus values, journey start date/name.

## Authentication/pairing production flow
1. Email/password or magic-link signup via Supabase Auth.
2. Profile created automatically.
3. User creates a pair and receives invite code OR joins using friend's code.
4. Pair becomes locked when it has two members (enforce server-side).
5. Every pair-scoped table uses RLS so outsiders cannot see data.

## Visual direction
Warm parchment/cream background, natural greens, muted gold, soft coral for overdue/attention. Rounded cards, gentle shadows, illustrated-adventure feeling. Serif display headings + clean sans-serif interface text. Mobile-first bottom navigation. Small satisfying motion for completion/coins without distracting gamification.

## Remaining production work after this starter
- Replace localStorage context with Supabase data/auth hooks.
- Build login/signup screen and create/join-pair screen.
- Enforce max two users per pair with a database function.
- Add real-time subscriptions for partner updates.
- Add edit quest/reward dialogs.
- Add monthly calendar view.
- Add weekly-close snapshots + one-time celebration modal.
- Add configurable weekly bonus rules and achievements.
- Add optional push/email reminders only with opt-in.
- Add tests for week calculations, timezone/date boundaries, RLS, and coin ledger integrity.
