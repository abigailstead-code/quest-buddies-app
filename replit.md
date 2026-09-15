# Quest Road

Quest Road is a warm two-player adventure game where friends share a room, complete personal quests, and encourage each other.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/quest-road run dev` — run the responsive web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The web workflow provides `PORT` and `BASE_PATH`; do not start Vite directly without them.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/quest-road/src/App.tsx` — responsive game UI, room entry, navigation, and game interactions
- `artifacts/quest-road/src/index.css` — Quest Road visual tokens and responsive styling
- `artifacts/api-server/src/routes/quest-road.ts` — room and shared game API
- `lib/api-spec/openapi.yaml` — API contract and generated client source

## Architecture decisions

- Shared room state is served by the API rather than stored in the browser; the browser only remembers the current room/player convenience ids.
- Rooms are capped at two players in the API, with a short invite code and a shareable `/room/:roomId` link.
- Player ownership is included in mutation inputs and enforced by the API so one friend cannot edit the other's quests.
- Shared state uses polling so a second browser sees quest, reward, and encouragement changes without a manual refresh.

## Product

- Create a room and invite one friend by link or code.
- See a waiting room until the second player joins.
- Add, edit, complete, reopen, and delete personal quests.
- View a shared journey map, month calendar, reward shop, coin trail, together view, and settings.
- Earn coins from completed quests, redeem shared rewards, and send encouragements.

## User preferences

No project-specific preferences recorded.

## Gotchas

- The current API room store is process-local; restarting the API clears active rooms.
- Regenerate API client and validator files after changing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
