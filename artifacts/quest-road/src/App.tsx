import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, Route, Router, Switch, useLocation, useParams } from "wouter";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Gem,
  Info,
  Landmark,
  Link2,
  Loader2,
  LockKeyhole,
  Map,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  getGetGameStateQueryKey,
  getGetRoomQueryKey,
  useCreateEncouragement,
  useCreateLabel,
  useCreateQuest,
  useCreateReward,
  useCreateRewardRequest,
  useCreateRoom,
  useDeleteLabel,
  useDeleteQuest,
  useDeleteReward,
  useGetBingoBoard,
  useGetGameState,
  useGetRoom,
  useJoinRoom,
  useRedeemReward,
  useRespondToRewardRequest,
  useSetQuestCompleted,
  useSetQuestReward,
  useSuggestBingoSquare,
  useUpdateLabel,
  useUpdateQuest,
  useUpdateReward,
  setAuthTokenGetter,
} from "@workspace/api-client-react";
import type {
  BingoBoard,
  GameState,
  Label,
  Player,
  Quest,
  QuestLink,
  QuestSubtask,
  Reward,
  RewardRequest,
} from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { currentSession, getAccessToken, signIn, signUp } from "@/lib/supabase-auth";
import "./index.css";

type ExtendedRedemption = GameState["redemptions"][number] & {
  rewardTitle?: string;
  providerId?: string;
  sourceType?: "standard" | "request" | "challenge";
  completedAt?: string | null;
  completedById?: string | null;
  sourceRequestId?: string | null;
  sourceChallengeId?: string | null;
};

type Challenge = GameState["challenges"][number];

type BingoBoardData = {
  weekStart: string;
  weekLabel: string;
  status: "active" | "past" | "locked";
  unlockDate: string | null;
  squares: Array<{
    id: string;
    text: string;
    intensity: "light" | "medium" | "stretch";
    family: string;
    completed: boolean;
    completedAt: string | null;
    contributorIds: string[];
  }>;
  lineCount: number;
  lineBonusAwarded: boolean;
  threeLineBonusAwarded: boolean;
  fullBoardBonusAwarded: boolean;
};

const queryClient = new QueryClient();
const today = new Date().toISOString().slice(0, 10);
const playerPalette = ["#d79b4c", "#6f9f8b"];
const labelPalette = ["#6f9f8b", "#d79b4c", "#9a7bb5", "#d26f67", "#5d8fb5", "#c17b55"];
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const encouragementExpiryMs = 7 * 24 * 60 * 60 * 1000;

function celebrate() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const burst = document.createElement("div");
  burst.className = "celebration-burst";
  const colors = ["#f7ca56", "#d79b4c", "#6f9f8b", "#302f48", "#d26f67"];
  for (let index = 0; index < 80; index += 1) {
    const piece = document.createElement("span");
    piece.className = "celebration-piece";
    piece.style.setProperty("--x", `${Math.round((Math.random() - 0.5) * 920)}px`);
    piece.style.setProperty("--y", `${Math.round((Math.random() - 0.58) * 860)}px`);
    piece.style.setProperty("--r", `${Math.round(Math.random() * 540 - 270)}deg`);
    piece.style.backgroundColor = colors[index % colors.length];
    burst.append(piece);
  }
  document.body.append(burst);
  window.setTimeout(() => burst.remove(), 950);
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00`);
}

function shiftDate(value: string, amount: number) {
  const date = dateAtNoon(value);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function mondayOf(value: string) {
  const date = dateAtNoon(value);
  const day = date.getDay();
  return shiftDate(value, day === 0 ? -6 : 1 - day);
}

function dateLabel(value: string) {
  return dateAtNoon(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function shortDateLabel(value: string) {
  return dateAtNoon(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekLabel(value: string) {
  return `${shortDateLabel(value)} – ${shortDateLabel(shiftDate(value, 6))}`;
}

function monthLabel(value: string) {
  return dateAtNoon(value).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function inviteLink(id: string) {
  return `${window.location.origin}/room/${id}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function playerColor(player: Player | undefined, players: Player[]) {
  return player?.color ?? playerPalette[Math.max(0, players.findIndex((item) => item.id === player?.id)) % 2] ?? playerPalette[0];
}

function ownerOf(state: GameState, id: string) {
  return state.players.find((player) => player.id === id);
}

function meId() {
  return localStorage.getItem("quest-road-player") ?? "";
}

function refreshRoom(roomId: string) {
  queryClient.invalidateQueries({ queryKey: getGetGameStateQueryKey(roomId) });
}

function coinsLabel(value: number) {
  return `${value} coin${value === 1 ? "" : "s"}`;
}

function activeRedemptions(state: GameState) {
  return (state.redemptions as ExtendedRedemption[]).filter((item) => !item.completedAt);
}

function completedRedemptions(state: GameState) {
  return (state.redemptions as ExtendedRedemption[]).filter((item) => item.completedAt);
}

function isCurrentEncouragement(createdAt: string) {
  return Date.parse(createdAt) >= Date.now() - encouragementExpiryMs;
}

function acceptedTaskChallengesFor(state: GameState, playerId: string, date?: string) {
  return state.challenges.filter(
    (challenge) =>
      challenge.type === "task" &&
      challenge.status === "accepted" &&
      challenge.recipientId === playerId &&
      (!date || challenge.dueDate === date),
  );
}

function activeCoinChallengesFor(state: GameState, date: string) {
  return state.challenges.filter(
    (challenge) =>
      challenge.type === "coin" &&
      challenge.status === "accepted" &&
      !!challenge.startDate &&
      !!challenge.endDate &&
      challenge.startDate <= date &&
      date <= challenge.endDate,
  );
}

function activeRewardRequests(state: GameState) {
  return state.rewardRequests.filter((request) => !["paid", "declined"].includes(request.status));
}

function countdownLabel(endDate: string | null) {
  if (!endDate) return "";
  const ms = new Date(`${endDate}T23:59:59`).getTime() - Date.now();
  if (ms <= 0) return "Ends today";
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours <= 24) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function redemptionSourceLabel(state: GameState, redemption: ExtendedRedemption) {
  if (redemption.sourceType === "challenge") {
    return `${ownerOf(state, redemption.playerId)?.name} unlocked this from ${ownerOf(state, redemption.providerId ?? "")?.name ?? "their buddy"} on ${new Date(redemption.redeemedAt).toLocaleDateString()}.`;
  }
  return `${ownerOf(state, redemption.playerId)?.name} bought this from ${ownerOf(state, redemption.providerId ?? "")?.name ?? "their buddy"} for ${redemption.cost} coins on ${new Date(redemption.redeemedAt).toLocaleDateString()}.`;
}

function scheduledTasksFor(state: GameState, date: string) {
  return state.quests.filter((quest) => quest.dueDate === date);
}

function ownScheduledTasksFor(state: GameState, date: string) {
  return state.quests.filter((quest) => quest.ownerId === meId() && quest.dueDate === date);
}

function completionCountFor(tasks: Quest[]) {
  return tasks.filter((quest) => quest.status === "completed").length;
}

function spentOnDate(state: GameState, date: string) {
  return state.transactions.filter((transaction) => transaction.amount < 0 && transaction.createdAt.slice(0, 10) === date);
}

function dayChoices(state: GameState, ownerId?: string) {
  const dates = new Set<string>([today]);
  for (const quest of state.quests) {
    if (!quest.dueDate) continue;
    if (ownerId && quest.ownerId !== ownerId) continue;
    dates.add(quest.dueDate);
  }
  for (const challenge of state.challenges) {
    if (challenge.type !== "task" || challenge.status !== "accepted" || !challenge.dueDate) continue;
    if (ownerId && challenge.recipientId !== ownerId) continue;
    dates.add(challenge.dueDate);
  }
  return [...dates].sort();
}

function useDaySelection(options: string[]) {
  const [selected, setSelected] = useState(today);
  useEffect(() => {
    if (!options.includes(selected)) {
      setSelected(options.includes(today) ? today : options[0] ?? today);
    }
  }, [options, selected]);
  return [selected, setSelected] as const;
}

function nextOption(options: string[], value: string, direction: 1 | -1) {
  const index = options.indexOf(value);
  if (index < 0) return value;
  const target = index + direction;
  return options[Math.max(0, Math.min(options.length - 1, target))] ?? value;
}

function sameDayAllDone(state: GameState, playerId: string, date: string) {
  const tasks = state.quests.filter((quest) => quest.ownerId === playerId && quest.dueDate === date);
  return tasks.length > 0 && tasks.every((quest) => quest.status === "completed");
}

function buildMonthGrid(anchor: string) {
  const first = `${anchor.slice(0, 7)}-01`;
  const firstDate = dateAtNoon(first);
  const offset = (firstDate.getDay() + 6) % 7;
  const start = shiftDate(first, -offset);
  return Array.from({ length: 42 }, (_, index) => shiftDate(start, index));
}

function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-[#f7ca56] text-[#24243b] shadow-[0_3px_0_#c4962b] hover:-translate-y-0.5",
    secondary: "bg-[#302f48] text-[#fff7e8] shadow-[0_3px_0_#1d1d31]",
    ghost: "border border-[#d9cfbd] bg-transparent text-[#3e3a4e] hover:bg-[#ebe3d4]",
    danger: "bg-[#f3d5d0] text-[#9f433e] hover:bg-[#efc3bd]",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Avatar({ player, players = [], size = "md" }: { player?: Player | null; players?: Player[]; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" };
  return (
    <div
      className={`${sizes[size]} grid shrink-0 place-items-center rounded-full border-2 border-background font-extrabold text-white shadow-sm`}
      style={{ backgroundColor: playerColor(player ?? undefined, players) }}
    >
      {player ? initials(player.name) : "?"}
    </div>
  );
}

function Loading({ text = "Loading the shared room…" }: { text?: string }) {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <div className="text-center text-muted-foreground">
        <div className="mx-auto h-10 w-10 animate-pulse-soft rounded-full border-4 border-[#f7ca56] border-t-transparent" />
        <p className="mt-3 text-sm font-semibold">{text}</p>
      </div>
    </div>
  );
}

function ErrorState({ retry }: { retry?: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f3d5d0] text-[#9f433e]">
        <Info />
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold">The room went quiet</h2>
      <p className="mt-2 text-sm text-muted-foreground">We couldn’t load this shared journey.</p>
      {retry && (
        <Button variant="ghost" onClick={retry} className="mt-5">
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      )}
    </div>
  );
}

function Empty({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="texture-grid flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d7cbb8] bg-[#f8f1e5] p-7 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ece1cf] text-[#7f7664]">
        <Icon />
      </div>
      <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function PageHeader({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 font-mono-ui text-[11px] tracking-[.2em] text-[#9a7a2b] uppercase">{eyebrow}</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.045em] sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}

function DayPicker({
  dates,
  selected,
  onSelect,
}: {
  dates: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => onSelect(nextOption(dates, selected, -1))}>
          <ChevronLeft className="h-4 w-4" />
          Previous day
        </Button>
        <Button variant="ghost" onClick={() => onSelect(today)}>
          Today
        </Button>
        <Button variant="ghost" onClick={() => onSelect(nextOption(dates, selected, 1))}>
          Next day
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {dates.map((date) => (
          <button
            key={date}
            onClick={() => onSelect(date)}
            className={`rounded-full px-3 py-2 text-xs font-bold ${selected === date ? "bg-[#302f48] text-white" : "bg-[#eee5d5] text-[#5b556a]"}`}
          >
            {date === today ? "Today" : shortDateLabel(date)}
          </button>
        ))}
      </div>
    </div>
  );
}

function HomePage() {
  const [, setLocation] = useLocation();
  const create = useCreateRoom();
  const join = useJoinRoom();
  const [mode, setMode] = useState<"create" | "join">("create");

  const makeRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const room = String(data.get("room") ?? "").trim();
    if (!name || !room) return;
    create.mutate(
      { data: { name: room, playerName: name } },
      {
        onSuccess: (result) => {
          localStorage.setItem("quest-road-room", result.id);
          localStorage.setItem("quest-road-player", result.host.id);
          setLocation(`/room/${result.id}`);
        },
      },
    );
  };

  const submitJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const code = String(data.get("code") ?? "").trim();
    if (!name || !code) return;
    join.mutate(
      { roomId: code, data: { code, playerName: name } },
      {
        onSuccess: (room) => {
          localStorage.setItem("quest-road-room", room.id);
          localStorage.setItem("quest-road-player", room.guest?.id ?? "");
          setLocation(`/room/${room.id}`);
        },
      },
    );
  };

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#24243b] text-[#fff7e8]">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 75% 15%, #f7ca56 0, transparent 17%), radial-gradient(circle at 15% 82%, #476b67 0, transparent 24%)",
        }}
      />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-5 py-5 sm:px-10 sm:py-8">
        <header className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f7ca56] text-[#24243b]">
            <Compass className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold">Quest Buddies</span>
        </header>
        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1fr_440px] lg:gap-20">
          <section className="max-w-2xl">
            <p className="mb-6 font-mono-ui text-xs tracking-[.24em] text-[#f7ca56] uppercase">A cooperative browser game</p>
            <h1 className="font-display text-5xl font-bold leading-[.98] tracking-[-.05em] sm:text-7xl">
              Make plans.
              <br />
              <span className="text-[#f7ca56]">Keep each other</span>
              <br />
              moving.
            </h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-[#bdbaca] sm:text-lg">
              Two players, personal tasks, shared rewards, and a clear view of what needs attention.
            </p>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-[#d7d3df]">
              <span className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-[#f7ca56]" />
                Exactly two players
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#78b29d]" />
                Private room
              </span>
            </div>
          </section>
          <section className="rounded-3xl bg-[#fff7e8] p-6 text-[#24243b] shadow-[0_22px_60px_rgba(9,10,28,.35)] sm:p-8">
            <div className="mb-7 flex gap-1 rounded-xl bg-[#eee5d5] p-1">
              <button onClick={() => setMode("create")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${mode === "create" ? "bg-[#302f48] text-[#fff7e8]" : "text-[#797388]"}`}>
                Start a room
              </button>
              <button onClick={() => setMode("join")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${mode === "join" ? "bg-[#302f48] text-[#fff7e8]" : "text-[#797388]"}`}>
                Join a room
              </button>
            </div>
            {mode === "create" ? (
              <form onSubmit={makeRoom} className="space-y-4">
                <h2 className="font-display text-2xl font-bold">Start a room</h2>
                <label className="block text-sm font-bold">
                  Room name
                  <input name="room" placeholder="Sunday Side Quests" className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fbf5eb] px-4 py-3 outline-none focus:border-[#c4962b]" />
                </label>
                <label className="block text-sm font-bold">
                  Your name
                  <input name="name" placeholder="What should we call you?" className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fbf5eb] px-4 py-3 outline-none focus:border-[#c4962b]" />
                </label>
                <Button type="submit" className="w-full">
                  Create room
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <form onSubmit={submitJoin} className="space-y-4">
                <h2 className="font-display text-2xl font-bold">Join your buddy</h2>
                <label className="block text-sm font-bold">
                  Invite code
                  <input name="code" placeholder="ROAD-7K2M" className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fbf5eb] px-4 py-3 font-mono-ui uppercase tracking-[.18em] outline-none focus:border-[#c4962b]" />
                </label>
                <label className="block text-sm font-bold">
                  Your name
                  <input name="name" placeholder="What should they call you?" className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fbf5eb] px-4 py-3 outline-none focus:border-[#c4962b]" />
                </label>
                <Button type="submit" disabled={join.isPending} className="w-full">
                  {join.isPending ? <Loader2 className="animate-spin" /> : <>Join room <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

const nav = [
  { href: "/today", label: "Updates", icon: MessageCircle },
  { href: "/tasks", label: "My tasks", icon: Target },
  { href: "/journey", label: "Bingo", icon: Map },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/rewards", label: "Rewards", icon: Trophy },
  { href: "/together", label: "Together", icon: UsersRound },
];

function Shell({ state, children }: { state: GameState; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const me = ownerOf(state, meId()) ?? state.players[0];

  return (
    <div className="min-h-[100dvh] bg-[#f3ecdf] text-[#302f48]">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col bg-[#24243b] px-5 py-6 text-[#fff7e8] transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <Link href="/today" onClick={() => setOpen(false)} className="mb-10 flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f7ca56] text-[#24243b]">
            <Compass className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold">Quest Buddies</span>
        </Link>
        <div className="mb-7 rounded-2xl border border-[#ffffff12] bg-[#ffffff09] p-3">
          <div className="flex items-center gap-3">
            <Avatar player={me} players={state.players} />
            <div>
              <p className="truncate text-sm font-bold">{me?.name}</p>
              <p className="font-mono-ui text-[10px] text-[#aaa9ba]">{me?.coins ?? 0} coins · {me?.xp ?? 0} XP</p>
            </div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${location === href ? "bg-[#f7ca56] text-[#24243b]" : "text-[#aaa9ba] hover:bg-[#ffffff0d] hover:text-[#fff7e8]"}`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/settings" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-[#aaa9ba]">
          <Settings2 className="h-[18px] w-[18px]" />
          Settings
        </Link>
      </aside>
      {open && <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-20 bg-[#24243b]/45 lg:hidden" />}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#ddd1bf] bg-[#f3ecdf]/90 px-5 backdrop-blur-md sm:px-8">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <span className="hidden text-xs font-bold text-[#858072] sm:block">{state.room.name}</span>
          <div className="ml-auto flex -space-x-2">
            {state.players.map((player) => (
              <Avatar key={player.id} player={player} players={state.players} size="sm" />
            ))}
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

function LabelEditor({ state, onDone }: { state: GameState; onDone: () => void }) {
  const id = meId();
  const labels = state.labels.filter((label) => label.ownerId === id);
  const [name, setName] = useState("");
  const [color, setColor] = useState(labelPalette[0]);
  const [editing, setEditing] = useState<Label>();
  const create = useCreateLabel();
  const update = useUpdateLabel();
  const remove = useDeleteLabel();

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const data = { ownerId: id, name: name.trim(), color };
    const done = () => {
      setName("");
      setEditing(undefined);
      refreshRoom(state.room.id);
    };
    if (editing) {
      update.mutate({ roomId: state.room.id, labelId: editing.id, data }, { onSuccess: done });
    } else {
      create.mutate({ roomId: state.room.id, data }, { onSuccess: done });
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24243b]/55 p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#fffaf1] p-6">
        <div className="flex justify-between">
          <div>
            <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">Task labels</p>
            <h2 className="font-display text-2xl font-bold">Personal labels</h2>
          </div>
          <Button variant="ghost" onClick={onDone}>Done</Button>
        </div>
        <div className="my-5 space-y-2">
          {labels.map((label) => (
            <div key={label.id} className="flex items-center gap-3 rounded-xl border border-[#e5dacb] p-2.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
              <span className="flex-1 font-bold">{label.name}</span>
              <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={() => { setEditing(label); setName(label.name); setColor(label.color); }}>
                Edit
              </Button>
              <Button
                variant="danger"
                className="px-2 py-1.5 text-xs"
                onClick={() => remove.mutate({ roomId: state.room.id, labelId: label.id, data: { ownerId: id } }, { onSuccess: () => refreshRoom(state.room.id) })}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
        <form onSubmit={save} className="space-y-3">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a label" className="w-full rounded-xl border border-[#d9cfbd] bg-[#fffdf8] px-4 py-3" />
          <div className="flex gap-2">
            {labelPalette.map((item) => (
              <button type="button" key={item} onClick={() => setColor(item)} className={`h-7 w-7 rounded-full ${color === item ? "ring-2 ring-[#302f48] ring-offset-2" : ""}`} style={{ backgroundColor: item }} aria-label={`Use ${item}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending || update.isPending} className="flex-1">
              {editing ? "Save label" : "Add label"}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => { setEditing(undefined); setName(""); }}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskEditor({ state, task, onClose }: { state: GameState; task?: Quest; onClose: () => void }) {
  const id = meId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [scheduled, setScheduled] = useState(Boolean(task?.dueDate ?? !task));
  const [dueDate, setDueDate] = useState(task?.dueDate ?? today);
  const [labelId, setLabelId] = useState(task?.labelId ?? "");
  const [links, setLinks] = useState<QuestLink[]>(task?.links ?? []);
  const [subtasks, setSubtasks] = useState<QuestSubtask[]>(task?.subtasks ?? []);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [labelEditor, setLabelEditor] = useState(false);
  const labels = state.labels.filter((label) => label.ownerId === id);
  const create = useCreateQuest();
  const update = useUpdateQuest();

  const submit = (event: FormEvent, addAnother = false) => {
    event.preventDefault();
    if (!title.trim()) return;
    const data = {
      ownerId: id,
      title: title.trim(),
      notes: notes.trim(),
      dueDate: scheduled ? dueDate : null,
      labelId: labelId || null,
      links,
      subtasks,
    };
    const done = () => {
      refreshRoom(state.room.id);
      if (addAnother && !task) {
        setTitle("");
        setNotes("");
        setScheduled(true);
        setDueDate(today);
        setLabelId("");
        setLinks([]);
        setSubtasks([]);
      } else {
        onClose();
      }
    };
    if (task) {
      update.mutate({ roomId: state.room.id, questId: task.id, data }, { onSuccess: done });
    } else {
      create.mutate({ roomId: state.room.id, data }, { onSuccess: done });
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#24243b]/55 p-4">
      <div className="my-5 w-full max-w-lg rounded-3xl bg-[#fffaf1] p-6">
        <div className="flex justify-between">
          <div>
            <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">{task ? "Edit task" : "New task"}</p>
            <h2 className="font-display text-2xl font-bold">{task ? "Update the details" : "Add a task"}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
        <form onSubmit={(event) => submit(event)} className="mt-5 space-y-4">
          <label className="block text-sm font-bold">
            Task title
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fffdf8] px-4 py-3" />
          </label>
          <label className="block text-sm font-bold">
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fffdf8] px-4 py-3" />
          </label>
          <div>
            <span className="text-sm font-bold">Timing</span>
            <div className="mt-2 flex rounded-xl bg-[#eee5d5] p-1 text-xs font-bold">
              <button type="button" onClick={() => setScheduled(true)} className={`flex-1 rounded-lg py-2 ${scheduled ? "bg-[#302f48] text-white" : ""}`}>Scheduled date</button>
              <button type="button" onClick={() => setScheduled(false)} className={`flex-1 rounded-lg py-2 ${!scheduled ? "bg-[#302f48] text-white" : ""}`}>Someday</button>
            </div>
            {scheduled && <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fffdf8] px-4 py-2.5" />}
          </div>
          <div>
            <div className="flex justify-between text-sm font-bold">
              <span>Label</span>
              <button type="button" onClick={() => setLabelEditor(true)} className="text-[#9a7a2b]">Manage labels</button>
            </div>
            <select value={labelId} onChange={(event) => setLabelId(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fffdf8] px-4 py-2.5">
              <option value="">No label</option>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>{label.name}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-sm font-bold">Links</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[.8fr_1fr_auto]">
              <input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Display name" className="rounded-xl border border-[#d9cfbd] px-3 py-2 text-sm" />
              <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" className="rounded-xl border border-[#d9cfbd] px-3 py-2 text-sm" />
              <Button
                type="button"
                variant="ghost"
                className="px-3"
                onClick={() => {
                  if (!linkUrl.trim()) return;
                  setLinks([...links, { id: crypto.randomUUID(), url: linkUrl.trim(), name: linkName.trim() || linkUrl.trim() }]);
                  setLinkName("");
                  setLinkUrl("");
                }}
              >
                Add link
              </Button>
            </div>
            {links.map((link) => (
              <div key={link.id} className="mt-2 flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">{link.name} · {link.url}</span>
                <Button type="button" variant="danger" className="px-2 py-1 text-xs" onClick={() => setLinks(links.filter((item) => item.id !== link.id))}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-bold">Subtasks</p>
            <div className="mt-2 flex gap-2">
              <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Break it down" className="min-w-0 flex-1 rounded-xl border border-[#d9cfbd] px-3 py-2 text-sm" />
              <Button
                type="button"
                variant="ghost"
                className="px-3"
                onClick={() => {
                  if (!subtaskTitle.trim()) return;
                  setSubtasks([...subtasks, { id: crypto.randomUUID(), title: subtaskTitle.trim(), completed: false }]);
                  setSubtaskTitle("");
                }}
              >
                Add step
              </Button>
            </div>
            {subtasks.map((item) => (
              <div key={item.id} className="mt-2 flex items-center gap-2 text-xs">
                <span className="flex-1">{item.title}</span>
                <Button type="button" variant="danger" className="px-2 py-1 text-xs" onClick={() => setSubtasks(subtasks.filter((sub) => sub.id !== item.id))}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending || update.isPending} className="flex-1">Save task</Button>
            {!task && (
              <Button type="button" disabled={create.isPending} variant="secondary" onClick={(event) => submit(event, true)} className="flex-1">
                Save &amp; add another
              </Button>
            )}
          </div>
        </form>
        {labelEditor && <LabelEditor state={state} onDone={() => setLabelEditor(false)} />}
      </div>
    </div>
  );
}

function RewardSetter({ state, quest }: { state: GameState; quest: Quest }) {
  const [custom, setCustom] = useState("");
  const setReward = useSetQuestReward();
  const choose = (value: number) =>
    setReward.mutate(
      { roomId: state.room.id, questId: quest.id, data: { actorId: meId(), coinValue: value } },
      { onSuccess: () => refreshRoom(state.room.id) },
    );

  return (
    <div className="mt-3 rounded-xl border border-[#e3c979] bg-[#fff4cc] p-3">
      <p className="text-xs font-extrabold uppercase tracking-wide text-[#93752c]">Set reward for {ownerOf(state, quest.ownerId)?.name}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[10, 20, 30].map((value) => (
          <Button key={value} disabled={setReward.isPending} onClick={() => choose(value)} className="px-3 py-2 text-xs">
            {value} coins
          </Button>
        ))}
        <div className="flex gap-1">
          <input value={custom} onChange={(event) => setCustom(event.target.value)} type="number" min="1" step="1" placeholder="Custom" className="w-24 rounded-lg border border-[#d9cfbd] px-2 text-xs" />
          <Button disabled={setReward.isPending || !Number.isInteger(Number(custom)) || Number(custom) < 1} onClick={() => choose(Number(custom))} className="px-3 py-2 text-xs">
            Set custom
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  state,
  quest,
  own,
  onEdit,
  onDelete,
  onComplete,
}: {
  state: GameState;
  quest: Quest;
  own: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onComplete?: () => void;
}) {
  const label = state.labels.find((item) => item.id === quest.labelId);
  const owner = ownerOf(state, quest.ownerId);
  const update = useUpdateQuest();
  const subtasks = quest.subtasks ?? [];
  const doneSteps = subtasks.filter((item) => item.completed).length;

  const toggleSubtask = (id: string) =>
    update.mutate(
      {
        roomId: state.room.id,
        questId: quest.id,
        data: { ownerId: quest.ownerId, subtasks: subtasks.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)) },
      },
      { onSuccess: () => refreshRoom(state.room.id) },
    );

  return (
    <article
      className="rounded-2xl border border-[#dfd3c1] border-l-4 p-4"
      style={{ borderLeftColor: playerColor(owner, state.players), backgroundColor: label ? `${label.color}1a` : "#fffaf1" }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-7 w-7 place-items-center rounded-full text-[10px] font-extrabold text-white" style={{ backgroundColor: playerColor(owner, state.players) }}>
          {initials(owner?.name ?? "?").slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`font-bold ${quest.status === "completed" ? "line-through opacity-60" : ""}`}>{quest.title}</h3>
            {label && <span className="rounded-md px-2 py-0.5 text-[10px] font-extrabold" style={{ color: label.color, backgroundColor: `${label.color}22` }}>{label.name}</span>}
          </div>
          {quest.notes && <p className="mt-1 text-xs leading-5 text-muted-foreground">{quest.notes}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted-foreground">
            <span>{quest.dueDate ? dateLabel(quest.dueDate) : "Someday"}</span>
            <span className="text-[#ad7d1e]">{quest.rewardStatus === "pending" ? "Reward pending" : `+${quest.coinValue} coins`}</span>
            {subtasks.length > 0 && <span>{doneSteps}/{subtasks.length} steps</span>}
            {quest.stolenCoins > 0 && <span className="text-[#9f433e]">{quest.stolenCoins} stolen</span>}
          </div>
          {quest.links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {quest.links.map((link) => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#eee2d2] px-2 py-1 text-xs font-bold text-[#5f5a69] hover:underline">
                  <Link2 className="h-3 w-3" />
                  {link.name || link.url}
                </a>
              ))}
            </div>
          )}
          {subtasks.length > 0 && (
            <div className="mt-3 space-y-1">
              {subtasks.map((item) => (
                <label key={item.id} className={`flex items-center gap-2 text-xs ${own ? "cursor-pointer" : ""}`}>
                  <input type="checkbox" checked={item.completed} disabled={!own || update.isPending} onChange={() => toggleSubtask(item.id)} />
                  {item.title}
                </label>
              ))}
            </div>
          )}
          {quest.status === "completed" && quest.rewardStatus === "pending" && <p className="mt-3 rounded-lg bg-[#f0e8da] px-2.5 py-2 text-xs font-bold text-[#93752c]">Completed and waiting for reward value</p>}
          {!own && quest.rewardStatus === "pending" && <RewardSetter state={state} quest={quest} />}
        </div>
      </div>
      {own && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={quest.status === "completed" ? "ghost" : "secondary"} className="px-3 py-2 text-xs" onClick={onComplete}>
            {quest.status === "completed" ? "Reopen task" : "Complete task"}
          </Button>
          <Button variant="ghost" className="px-3 py-2 text-xs" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit task
          </Button>
          <Button variant="danger" className="px-3 py-2 text-xs" onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
    </article>
  );
}

function markRedemptionDone(roomId: string, redemptionId: string) {
  return fetch(`/api/rooms/${roomId}/redemptions/${redemptionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId: meId() }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Could not mark this reward as done.");
    }
    return response.json();
  });
}

function createChallenge(roomId: string, payload: Record<string, unknown>) {
  return fetch(`/api/rooms/${roomId}/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? "Could not create this challenge.");
    }
    return response.json();
  });
}

function respondToChallenge(roomId: string, challengeId: string, payload: Record<string, unknown>) {
  return fetch(`/api/rooms/${roomId}/challenges/${challengeId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? "Could not update this challenge.");
    }
    return response.json();
  });
}

function completeChallenge(roomId: string, challengeId: string) {
  return fetch(`/api/rooms/${roomId}/challenges/${challengeId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId: meId() }),
  }).then(async (response) => {
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? "Could not complete this challenge.");
    }
    return response.json();
  });
}

function markBingoSquareComplete(roomId: string, weekStart: string, squareId: string) {
  return fetch(`/api/rooms/${roomId}/bingo/${weekStart}/squares/${squareId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId: meId() }),
  }).then(async (response) => {
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? "Could not mark this Bingo square complete.");
    }
    return response.json();
  });
}

function TaskChallengeCard({
  state,
  challenge,
  showActions,
}: {
  state: GameState;
  challenge: Challenge;
  showActions: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <article className="rounded-2xl border border-[#d8c99e] bg-[#fff4cc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#93752c]">Task challenge</p>
          <p className="mt-1 font-bold">{challenge.title}</p>
        </div>
        <span className="rounded-full bg-[#eee2c6] px-2.5 py-1 text-[10px] font-extrabold uppercase">
          +{challenge.rewardCoins ?? 0} coins
        </span>
      </div>
      {challenge.description && <p className="mt-2 text-sm text-muted-foreground">{challenge.description}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Challenger: {ownerOf(state, challenge.challengerId)?.name} · deadline{" "}
        {challenge.dueDate ? dateLabel(challenge.dueDate) : "not set"}
      </p>
      {showActions && (
        <Button
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            try {
              setBusy(true);
              await completeChallenge(state.room.id, challenge.id);
              celebrate();
              refreshRoom(state.room.id);
            } finally {
              setBusy(false);
            }
          }}
        >
          Mark as done
        </Button>
      )}
    </article>
  );
}

function CoinChallengeUpdateCard({ state, challenge }: { state: GameState; challenge: Challenge }) {
  const id = meId();
  const [counterTarget, setCounterTarget] = useState(String(challenge.targetCoins ?? 0));
  const waiting = ["awaiting_response", "countered"].includes(challenge.status) && challenge.turnPlayerId === id;
  const otherPlayerId = challenge.challengerId === id ? challenge.recipientId : challenge.challengerId;
  const reminder = challenge.status === "accepted" && countdownLabel(challenge.endDate).includes("hour");

  return (
    <>
      <p className="mt-1 font-bold">
        Earn {challenge.targetCoins ?? 0} coins for {challenge.rewardTitle ?? "this reward"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {waiting
          ? `${ownerOf(state, otherPlayerId)?.name ?? "Buddy"} wants an answer on this goal by ${challenge.endDate ? dateLabel(challenge.endDate) : "the deadline"}.`
          : `Progress: ${challenge.progressCoins}/${challenge.targetCoins ?? 0} coins · ${countdownLabel(challenge.endDate)}`}
      </p>
      {challenge.description && <p className="mt-2 text-xs text-muted-foreground">{challenge.description}</p>}
      {waiting && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => respondToChallenge(state.room.id, challenge.id, { actorId: id, action: "accept" }).then(() => refreshRoom(state.room.id))} className="px-3 py-2 text-xs">Accept challenge</Button>
          <div className="flex w-full gap-2 sm:w-auto">
            <input value={counterTarget} onChange={(event) => setCounterTarget(event.target.value)} type="number" min="1" step="1" className="w-24 rounded-xl border border-[#d9cfbd] px-2 text-sm" aria-label="Counter coin goal" />
            <Button variant="ghost" onClick={() => respondToChallenge(state.room.id, challenge.id, { actorId: id, action: "counter", targetCoins: Number(counterTarget) }).then(() => refreshRoom(state.room.id))} className="px-3 py-2 text-xs">Counter</Button>
          </div>
          <Button variant="danger" onClick={() => respondToChallenge(state.room.id, challenge.id, { actorId: id, action: "decline" }).then(() => refreshRoom(state.room.id))} className="px-3 py-2 text-xs">Decline challenge</Button>
        </div>
      )}
      {challenge.status === "accepted" && (
        <p className="mt-3 text-xs font-bold text-[#93752c]">
          {reminder ? "24-hour reminder: the challenge window is almost over." : "This challenge is active."}
        </p>
      )}
    </>
  );
}

function UpdatesPage({ state }: { state: GameState }) {
  const [editor, setEditor] = useState(false);
  const [busyRewardId, setBusyRewardId] = useState<string>();
  const id = meId();
  const owe = activeRedemptions(state).filter((item) => item.providerId === id && item.playerId !== id);
  const attentionTasks = state.quests.filter((quest) => quest.ownerId !== id && quest.rewardStatus === "pending");
  const incomingEncouragements = [...state.encouragements]
    .filter((item) => item.toId === id && item.fromId !== id && isCurrentEncouragement(item.createdAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const attentionRewards = activeRewardRequests(state).filter(
    (request) => request.turnPlayerId === id || (request.status === "accepted" && request.payerId === id),
  );
  const challengeAttention = state.challenges.filter(
    (challenge) =>
      (["awaiting_response", "countered"].includes(challenge.status) && challenge.turnPlayerId === id) ||
      (challenge.type === "coin" && challenge.status === "accepted" && (challenge.recipientId === id || challenge.challengerId === id)),
  );
  const recent = [
    ...state.encouragements.filter((item) => item.toId === id && item.fromId !== id).map((item) => ({
      id: item.id,
      text: `${ownerOf(state, item.fromId)?.name ?? "Buddy"} sent encouragement: "${item.message}"`,
      date: item.createdAt,
    })),
    ...state.quests.filter((quest) => quest.status === "completed" && quest.completedAt).map((quest) => ({
      id: quest.id,
      text: `${ownerOf(state, quest.ownerId)?.name ?? "Player"} completed ${quest.title}`,
      date: quest.completedAt ?? quest.createdAt,
    })),
    ...state.redemptions.map((item) => {
      const redemption = item as ExtendedRedemption;
      return {
        id: redemption.id,
        text: redemption.sourceType === "challenge"
          ? `${ownerOf(state, redemption.playerId)?.name ?? "Player"} unlocked ${redemption.rewardTitle ?? "a reward"}`
          : `${ownerOf(state, redemption.playerId)?.name ?? "Player"} bought ${redemption.rewardTitle ?? "a reward"}`,
        date: redemption.completedAt ?? redemption.redeemedAt,
      };
    }),
    ...state.challenges
      .filter((challenge) => ["completed", "succeeded", "failed", "declined"].includes(challenge.status))
      .map((challenge) => ({
        id: challenge.id,
        text: challenge.status === "completed" || challenge.status === "succeeded"
          ? `${ownerOf(state, challenge.recipientId)?.name ?? "Player"} completed a ${challenge.type} challenge`
          : `${challenge.type === "task" ? "Task" : "Coin goal"} challenge ${challenge.status}`,
        date: challenge.completedAt ?? challenge.updatedAt,
      })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow="Home / Updates"
        title="Needs your attention"
        body="A shared inbox for rewards to set, purchases you owe, and recent activity."
        action={<Button onClick={() => setEditor(true)}><Plus className="h-4 w-4" /> Add task</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <section className="space-y-4">
          {incomingEncouragements.length > 0 && (
            <div className="rounded-3xl border border-[#d8c99e] bg-[#fff4cc] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">Encouragements for you</p>
                  <h2 className="mt-1 font-display text-2xl font-bold">Your buddy checked in</h2>
                </div>
                <MessageCircle className="h-5 w-5 text-[#9a7a2b]" />
              </div>
              <div className="mt-4 space-y-3">
                {incomingEncouragements.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[#e3c979] bg-[#fffaf1] p-4">
                    <p className="font-bold">{ownerOf(state, item.fromId)?.name ?? "Buddy"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {owe.length > 0 && (
            <div className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">Rewards you owe</p>
                  <h2 className="mt-1 font-display text-2xl font-bold">Deliver these rewards</h2>
                </div>
                <Trophy className="h-5 w-5 text-[#9a7a2b]" />
              </div>
              <div className="mt-4 space-y-3">
                {owe.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[#e3c979] bg-[#fff4cc] p-4">
                    <p className="font-bold">{item.rewardTitle ?? "Reward purchase"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {redemptionSourceLabel(state, item)}
                    </p>
                    <Button
                      className="mt-3"
                      disabled={busyRewardId === item.id}
                      onClick={async () => {
                        try {
                          setBusyRewardId(item.id);
                          await markRedemptionDone(state.room.id, item.id);
                          refreshRoom(state.room.id);
                        } finally {
                          setBusyRewardId(undefined);
                        }
                      }}
                    >
                      Mark as done
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {challengeAttention.map((challenge) => (
            <div key={challenge.id} className="rounded-2xl border border-[#e3c979] bg-[#fff4cc] p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#93752c]">
                {challenge.type === "task" ? "Task challenge" : "Coin goal challenge"}
              </p>
              {challenge.type === "task" ? (
                <>
                  <p className="mt-1 font-bold">{challenge.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {["awaiting_response", "countered"].includes(challenge.status)
                      ? `${ownerOf(state, challenge.challengerId)?.name ?? "Buddy"} challenged you to finish this by ${challenge.dueDate ? dateLabel(challenge.dueDate) : "the deadline"} for ${challenge.rewardCoins ?? 0} coins.`
                      : `Complete this by ${challenge.dueDate ? dateLabel(challenge.dueDate) : "the deadline"} to earn ${challenge.rewardCoins ?? 0} coins.`}
                  </p>
                  {challenge.description && <p className="mt-2 text-xs text-muted-foreground">{challenge.description}</p>}
                  {["awaiting_response", "countered"].includes(challenge.status) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => respondToChallenge(state.room.id, challenge.id, { actorId: id, action: "accept" }).then(() => refreshRoom(state.room.id))} className="px-3 py-2 text-xs">Accept challenge</Button>
                      <Button variant="danger" onClick={() => respondToChallenge(state.room.id, challenge.id, { actorId: id, action: "decline" }).then(() => refreshRoom(state.room.id))} className="px-3 py-2 text-xs">Decline challenge</Button>
                    </div>
                  ) : (
                    <Button className="mt-3" onClick={() => completeChallenge(state.room.id, challenge.id).then(() => refreshRoom(state.room.id))}>Mark as done</Button>
                  )}
                </>
              ) : (
                <CoinChallengeUpdateCard state={state} challenge={challenge} />
              )}
            </div>
          ))}
          {attentionTasks.length === 0 && attentionRewards.length === 0 && owe.length === 0 && incomingEncouragements.length === 0 && challengeAttention.length === 0 && <Empty icon={Check} title="You’re caught up" body="Nothing needs a decision right now." />}
          {attentionTasks.map((quest) => <TaskCard key={quest.id} state={state} quest={quest} own={false} />)}
          {attentionRewards.map((request) => (
            <div key={request.id} className="rounded-2xl border border-[#e3c979] bg-[#fff4cc] p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#93752c]">Reward request</p>
              <p className="mt-1 font-bold">{request.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {request.status === "accepted"
                  ? `Accepted: ${ownerOf(state, request.payerId)?.name} must confirm payment.`
                  : `${ownerOf(state, request.turnPlayerId)?.name} must respond at ${request.offer} coins.`}
              </p>
              <Link href="/rewards" className="mt-3 inline-flex text-xs font-bold text-[#9a7a2b] hover:underline">
                Open reward requests
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          ))}
        </section>
        <aside className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">Recent updates</h2>
            <Zap className="h-5 w-5 text-[#c4962b]" />
          </div>
          <div className="mt-5 space-y-3">
            {recent.map((item) => (
              <div key={item.id} className="border-l-2 border-[#d79b4c] pl-3">
                <p className="text-sm font-bold">{item.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString()}</p>
              </div>
            ))}
            {recent.length === 0 && <p className="text-sm text-muted-foreground">Activity will appear here as both players take actions.</p>}
          </div>
        </aside>
      </div>
      {editor && <TaskEditor state={state} onClose={() => setEditor(false)} />}
    </>
  );
}

function TasksPage({ state }: { state: GameState }) {
  const [editor, setEditor] = useState(false);
  const [edit, setEdit] = useState<Quest>();
  const own = state.quests.filter((quest) => quest.ownerId === meId());
  const scheduledDates = dayChoices(state, meId());
  const [selectedDate, setSelectedDate] = useDaySelection(scheduledDates);
  const taskChallenges = acceptedTaskChallengesFor(state, meId(), selectedDate);
  const complete = useSetQuestCompleted();
  const remove = useDeleteQuest();
  const refresh = () => refreshRoom(state.room.id);
  const action = (quest: Quest) => complete.mutate(
    { roomId: state.room.id, questId: quest.id, data: { ownerId: meId(), completed: quest.status !== "completed" } },
    { onSuccess: () => { if (quest.status !== "completed") celebrate(); refresh(); } },
  );

  return (
    <>
      <PageHeader
        eyebrow="Personal tasks"
        title="My tasks"
        body="Scheduled tasks open on the selected day first, while Someday stays separate."
        action={<Button onClick={() => { setEdit(undefined); setEditor(true); }}><Plus className="h-4 w-4" /> Add task</Button>}
      />
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">Scheduled</h2>
            <span className="text-sm text-muted-foreground">{selectedDate === today ? "Today" : dateLabel(selectedDate)}</span>
          </div>
          <DayPicker dates={scheduledDates} selected={selectedDate} onSelect={setSelectedDate} />
          <div className="space-y-3">
            {taskChallenges.map((challenge) => (
              <TaskChallengeCard key={challenge.id} state={state} challenge={challenge} showActions />
            ))}
            {ownScheduledTasksFor(state, selectedDate).map((quest) => (
              <TaskCard
                key={quest.id}
                state={state}
                quest={quest}
                own
                onComplete={() => action(quest)}
                onEdit={() => { setEdit(quest); setEditor(true); }}
                onDelete={() => window.confirm("Delete this task?") && remove.mutate({ roomId: state.room.id, questId: quest.id, data: { ownerId: meId() } }, { onSuccess: refresh })}
              />
            ))}
            {ownScheduledTasksFor(state, selectedDate).length === 0 && taskChallenges.length === 0 && <Empty icon={CalendarDays} title="Nothing scheduled here" body="Use the day toggle to move through your dates, or add something new." />}
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-display text-2xl font-bold">Unscheduled / Someday</h2>
          <p className="mb-3 text-sm text-muted-foreground">No deadline, no overdue state, no daily planning pressure.</p>
          <div className="space-y-3">
            {own.filter((quest) => !quest.dueDate).map((quest) => (
              <TaskCard
                key={quest.id}
                state={state}
                quest={quest}
                own
                onComplete={() => action(quest)}
                onEdit={() => { setEdit(quest); setEditor(true); }}
                onDelete={() => window.confirm("Delete this task?") && remove.mutate({ roomId: state.room.id, questId: quest.id, data: { ownerId: meId() } }, { onSuccess: refresh })}
              />
            ))}
            {own.every((quest) => quest.dueDate) && <p className="rounded-2xl border border-dashed border-[#d7cbb8] bg-[#f8f1e5] p-4 text-sm text-muted-foreground">No Someday tasks yet.</p>}
          </div>
        </section>
      </div>
      {editor && <TaskEditor state={state} task={edit} onClose={() => setEditor(false)} />}
    </>
  );
}

function JourneyPage({ state }: { state: GameState }) {
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [selectedSquareId, setSelectedSquareId] = useState<string>();
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [intensity, setIntensity] = useState<"light" | "medium" | "stretch" | "undecided">("undecided");
  const [completingSquareId, setCompletingSquareId] = useState<string>();
  const boardQuery = useGetBingoBoard(state.room.id, weekStart);
  const suggest = useSuggestBingoSquare();
  const currentWeek = mondayOf(today);
  const board = boardQuery.data as unknown as BingoBoardData | undefined;
  const selectedSquare = board?.squares.find((square) => square.id === selectedSquareId);

  const submitSuggestion = (event: FormEvent) => {
    event.preventDefault();
    if (!suggestion.trim()) return;
    suggest.mutate(
      { roomId: state.room.id, data: { playerId: meId(), text: suggestion.trim(), intensity } },
      {
        onSuccess: () => {
          setSuggestion("");
          setIntensity("undecided");
          setSuggesting(false);
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Shared weekly game"
        title="Bingo"
        body="One shared 4×4 board per week. Past boards stay visible, and future boards stay locked until Monday."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setWeekStart(shiftDate(weekStart, -7))}><ChevronLeft className="h-4 w-4" /> Previous week</Button>
            <Button variant="ghost" onClick={() => setWeekStart(currentWeek)}>This week</Button>
            <Button variant="ghost" onClick={() => setWeekStart(shiftDate(weekStart, 7))}>Next week <ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />
      {board?.status === "locked" ? (
        <section className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-8 text-center">
          <LockKeyhole className="mx-auto h-10 w-10 text-[#9a7a2b]" />
          <h2 className="mt-4 font-display text-2xl font-bold">This board is locked</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The next board unlocks on {board.unlockDate ? dateLabel(board.unlockDate) : dateLabel(weekStart)}. Its squares stay hidden until then.
          </p>
          <Button className="mt-5" onClick={() => setSuggesting(true)}>Suggest a square for next week</Button>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_360px]">
          <section className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">{board?.status === "past" ? "Past board" : "Active board"}</p>
                <h2 className="mt-1 font-display text-2xl font-bold">{board?.weekLabel ?? weekLabel(weekStart)}</h2>
              </div>
              <div className="text-right">
                <p className="font-mono-ui text-2xl font-bold text-[#ad7d1e]">{board?.lineCount ?? 0} lines</p>
                <p className="text-xs text-muted-foreground">{board?.squares.filter((square) => square.completed).length ?? 0}/16 squares</p>
              </div>
            </div>
            <div className="mb-4">
              <Button variant="ghost" onClick={() => setSuggesting(true)}>Suggest a square for next week</Button>
            </div>
            {boardQuery.isLoading ? (
              <Loading text="Drawing this week’s board…" />
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {board?.squares.map((square) => {
                  const oneContributor = square.contributorIds.length === 1 ? ownerOf(state, square.contributorIds[0]) : undefined;
                  const both = square.contributorIds.slice(0, 2).map((id) => ownerOf(state, id));
                  const style = square.completed
                    ? square.contributorIds.length > 1
                      ? { background: `linear-gradient(135deg, ${playerColor(both[0], state.players)} 0 50%, ${playerColor(both[1], state.players)} 50% 100%)`, color: "#fff" }
                      : { backgroundColor: `${playerColor(oneContributor, state.players)}cc`, color: "#fff" }
                    : undefined;
                  return (
                    <button
                      key={square.id}
                      onClick={() => setSelectedSquareId(selectedSquareId === square.id ? undefined : square.id)}
                      className={`relative aspect-square rounded-xl border-2 p-2 text-left text-[11px] font-extrabold leading-tight transition sm:rounded-2xl sm:p-3 sm:text-sm ${square.completed ? "border-[#c4962b] shadow-inner" : "border-[#dfd3c1] bg-[#fffaf1] hover:-translate-y-0.5"}`}
                      style={style}
                    >
                      {square.completed && <Check className="absolute right-2 top-2 h-4 w-4" />}
                      <span className="block">{square.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-6 rounded-2xl border border-[#d8c99e] bg-[#fff4cc] p-4">
              <h3 className="font-display text-lg font-bold">Bingo bonuses</h3>
              <p className="mt-2 text-sm leading-6">
                1 completed line → <strong>+10 coins EACH</strong>
                <br />
                3 completed lines → <strong>+20 coins EACH</strong>
                <br />
                Full board → <strong>+40 coins EACH</strong>
              </p>
              <p className="mt-2 text-xs text-[#93752c]">These bonuses are cumulative and awarded once per weekly board.</p>
            </div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5">
              <h3 className="font-display text-xl font-bold">Square details</h3>
              {selectedSquare ? (
                <div className="mt-4 space-y-3 text-sm">
                  <p className="font-bold">{selectedSquare.text}</p>
                  <p className="text-muted-foreground">
                    {selectedSquare.completed
                      ? `Completed on ${selectedSquare.completedAt ? new Date(selectedSquare.completedAt).toLocaleDateString() : "this week"}`
                      : "Not completed yet"}
                  </p>
                  <p className="text-muted-foreground">
                    Contributors: {selectedSquare.contributorIds.length ? selectedSquare.contributorIds.map((item) => ownerOf(state, item)?.name ?? "Buddy").join(" + ") : "None yet"}
                  </p>
                  {board?.status === "active" && weekStart === currentWeek && !selectedSquare.contributorIds.includes(meId()) && (
                    <Button
                      disabled={completingSquareId === selectedSquare.id}
                      onClick={async () => {
                        try {
                          setCompletingSquareId(selectedSquare.id);
                          await markBingoSquareComplete(state.room.id, weekStart, selectedSquare.id);
                          await boardQuery.refetch();
                          refreshRoom(state.room.id);
                        } finally {
                          setCompletingSquareId(undefined);
                        }
                      }}
                    >
                      Mark complete
                    </Button>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Tap a square to see its condition, completion date, and contributors.</p>
              )}
            </section>
            <section className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5">
              <h3 className="font-display text-xl font-bold">Board status</h3>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p>{board?.status === "past" ? "This board is read-only." : "This week is active."}</p>
                <p>Full board bonus: {board?.fullBoardBonusAwarded ? "earned" : "not earned yet"}</p>
                <p>Three-line bonus: {board?.threeLineBonusAwarded ? "earned" : "not earned yet"}</p>
                <p>Line bonus: {board?.lineBonusAwarded ? "earned" : "not earned yet"}</p>
              </div>
            </section>
          </aside>
        </div>
      )}
      {suggesting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#24243b]/55 p-4">
          <form onSubmit={submitSuggestion} className="w-full max-w-md rounded-3xl bg-[#fffaf1] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">Next week</p>
                <h2 className="font-display text-2xl font-bold">Suggest a square for next week</h2>
              </div>
              <Button type="button" variant="ghost" onClick={() => setSuggesting(false)}>Cancel</Button>
            </div>
            <textarea autoFocus value={suggestion} onChange={(event) => setSuggestion(event.target.value)} placeholder="Example: Complete 5 tasks together during the week." rows={4} className="mt-4 w-full rounded-2xl border border-[#d9cfbd] px-4 py-3 text-sm" />
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold">Intensity</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["undecided", "Let Quest Buddies decide"],
                  ["light", "Light"],
                  ["medium", "Medium"],
                  ["stretch", "Stretch"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setIntensity(value as "light" | "medium" | "stretch" | "undecided")}
                    className={`rounded-full px-3 py-2 text-xs font-bold ${intensity === value ? "bg-[#302f48] text-white" : "bg-[#eee5d5] text-[#5b556a]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" className="mt-5 w-full" disabled={suggest.isPending}>Submit suggestion</Button>
            <p className="mt-3 text-xs text-muted-foreground">Only objectively trackable suggestions can be used on the next board.</p>
          </form>
        </div>
      )}
    </>
  );
}

function CalendarPage({ state }: { state: GameState }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today);
  const [detailDate, setDetailDate] = useState<string>();
  const [editor, setEditor] = useState<Quest>();
  const weekStart = mondayOf(anchor);
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));
  const monthDays = buildMonthGrid(anchor);
  const complete = useSetQuestCompleted();
  const remove = useDeleteQuest();

  const toggleQuest = (quest: Quest) =>
    complete.mutate(
      { roomId: state.room.id, questId: quest.id, data: { ownerId: meId(), completed: quest.status !== "completed" } },
      { onSuccess: () => { if (quest.status !== "completed") celebrate(); refreshRoom(state.room.id); } },
    );

  const renderDayDetails = (date: string) => (
    <div className="space-y-5">
      {state.players.map((player) => {
        const tasks = state.quests.filter((quest) => quest.ownerId === player.id && quest.dueDate === date);
        const taskChallenges = acceptedTaskChallengesFor(state, player.id, date);
        const own = player.id === meId();
        return (
          <section key={player.id} className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-4">
            <div className="flex items-center gap-3">
              <Avatar player={player} players={state.players} />
              <div>
                <h3 className="font-bold">{player.name}</h3>
                <p className="text-xs text-muted-foreground">{completionCountFor(tasks)}/{tasks.length} scheduled tasks completed</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {taskChallenges.map((challenge) => (
                <TaskChallengeCard key={challenge.id} state={state} challenge={challenge} showActions={own} />
              ))}
              {tasks.map((quest) => (
                <TaskCard
                  key={quest.id}
                  state={state}
                  quest={quest}
                  own={own}
                  onComplete={own ? () => toggleQuest(quest) : undefined}
                  onEdit={own ? () => setEditor(quest) : undefined}
                  onDelete={own ? () => window.confirm("Delete this task?") && remove.mutate({ roomId: state.room.id, questId: quest.id, data: { ownerId: meId() } }, { onSuccess: () => refreshRoom(state.room.id) }) : undefined}
                />
              ))}
              {tasks.length === 0 && taskChallenges.length === 0 && <p className="text-sm text-muted-foreground">No scheduled tasks for this player on this date.</p>}
            </div>
          </section>
        );
      })}
      <section className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-4">
        <h3 className="font-bold">Coins spent</h3>
        <div className="mt-3 space-y-2 text-sm">
          {spentOnDate(state, date).map((transaction) => (
            <div key={transaction.id} className="rounded-xl bg-[#f8f1e5] p-3">
              <p className="font-bold">{transaction.label}</p>
              <p className="text-xs text-muted-foreground">{ownerOf(state, transaction.playerId)?.name} spent {Math.abs(transaction.amount)} coins</p>
            </div>
          ))}
          {spentOnDate(state, date).length === 0 && <p className="text-muted-foreground">No coins were spent on this date.</p>}
        </div>
      </section>
      <section className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-4">
        <h3 className="font-bold">Challenges</h3>
        <div className="mt-3 space-y-3 text-sm">
          {state.challenges
            .filter((challenge) => challenge.type === "task" && challenge.dueDate === date && challenge.status === "accepted")
            .map((challenge) => (
              <div key={challenge.id} className="rounded-xl bg-[#f8f1e5] p-3">
                <p className="font-bold">{challenge.title}</p>
                <p className="text-xs text-muted-foreground">
                  {ownerOf(state, challenge.recipientId)?.name} can earn {challenge.rewardCoins ?? 0} coins from {ownerOf(state, challenge.challengerId)?.name}.
                </p>
              </div>
            ))}
          {activeCoinChallengesFor(state, date).map((challenge) => (
            <div key={challenge.id} className="rounded-xl border border-[#e3c979] bg-[#fff4cc] p-3">
              <p className="font-bold">Coin Goal Challenge</p>
              <p className="text-xs text-muted-foreground">
                {ownerOf(state, challenge.recipientId)?.name} is working toward {challenge.targetCoins ?? 0} coins for {challenge.rewardTitle ?? "a reward"}.
              </p>
            </div>
          ))}
          {state.challenges.filter((challenge) => challenge.type === "task" && challenge.dueDate === date && challenge.status === "accepted").length === 0 && activeCoinChallengesFor(state, date).length === 0 && (
            <p className="text-muted-foreground">No active challenges land on this date.</p>
          )}
        </div>
      </section>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Shared planning"
        title="Calendar"
        body="Week view stays the default, while month view uses a classic full-grid layout with compact markers."
        action={
          <div className="flex rounded-xl bg-[#eee5d5] p-1 text-xs font-bold">
            <button onClick={() => setView("week")} className={`rounded-lg px-3 py-2 ${view === "week" ? "bg-[#302f48] text-white" : ""}`}>Week</button>
            <button onClick={() => setView("month")} className={`rounded-lg px-3 py-2 ${view === "month" ? "bg-[#302f48] text-white" : ""}`}>Month</button>
          </div>
        }
      />
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setAnchor(shiftDate(anchor, view === "week" ? -7 : -30))}><ChevronLeft /> Previous</Button>
        <span className="font-mono-ui text-xs">{view === "week" ? weekLabel(weekStart) : monthLabel(anchor)}</span>
        <Button variant="ghost" onClick={() => setAnchor(shiftDate(anchor, view === "week" ? 7 : 30))}>Next <ChevronRight /></Button>
      </div>
      {view === "week" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {weekDays.map((date) => (
            <article key={date} className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{date === today ? "Today" : dateLabel(date)}</h2>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setDetailDate(date)}>Open details</Button>
              </div>
              <div className="mt-3 space-y-2">
                {state.challenges.filter((challenge) => challenge.type === "task" && challenge.status === "accepted" && challenge.dueDate === date).map((challenge) => (
                  <div key={challenge.id} className="rounded-xl border border-[#e3c979] bg-[#fff4cc] p-2 text-xs">
                    <p className="font-bold">{challenge.title}</p>
                    <p className="text-muted-foreground">Challenge for {ownerOf(state, challenge.recipientId)?.name}</p>
                  </div>
                ))}
                {activeCoinChallengesFor(state, date).map((challenge) => (
                  <div key={challenge.id} className="rounded-xl border border-[#e3c979] bg-[#fff4cc] p-2 text-xs">
                    <p className="font-bold">Coin Goal Challenge</p>
                    <p className="text-muted-foreground">{ownerOf(state, challenge.recipientId)?.name} is working toward {challenge.targetCoins ?? 0} coins</p>
                  </div>
                ))}
                {scheduledTasksFor(state, date).map((quest) => (
                  <div key={quest.id} className="border-l-4 pl-2 text-xs" style={{ borderColor: playerColor(ownerOf(state, quest.ownerId), state.players) }}>
                    <p className="font-bold">{quest.title}</p>
                    <p className="text-muted-foreground">{ownerOf(state, quest.ownerId)?.name} · {quest.status === "completed" ? "Completed" : "Planned"}</p>
                  </div>
                ))}
                {scheduledTasksFor(state, date).length === 0 && state.challenges.filter((challenge) => challenge.type === "task" && challenge.status === "accepted" && challenge.dueDate === date).length === 0 && activeCoinChallengesFor(state, date).length === 0 && <p className="text-xs text-muted-foreground">No tasks planned</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase tracking-[.18em] text-[#9a7a2b]">
            {weekdayLabels.map((label) => <div key={label}>{label}</div>)}
          </div>
          <div className="mt-3 grid grid-cols-7 gap-2">
            {monthDays.map((date) => {
              const monthKey = anchor.slice(0, 7);
              const inMonth = date.startsWith(monthKey);
              const dayTasks = scheduledTasksFor(state, date);
              const challengeCount = state.challenges.filter((challenge) => challenge.type === "task" && challenge.status === "accepted" && challenge.dueDate === date).length + activeCoinChallengesFor(state, date).length;
              const spending = spentOnDate(state, date);
              return (
                <button
                  key={date}
                  onClick={() => setDetailDate(date)}
                  className={`min-h-[92px] rounded-2xl border p-2 text-left ${inMonth ? "border-[#dfd3c1] bg-[#fffaf1]" : "border-[#e8dfd1] bg-[#f8f1e5] text-[#aaa08f]"}`}
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-sm font-bold ${date === today ? "text-[#9a7a2b]" : ""}`}>{date.slice(-2)}</span>
                    <span className="text-[10px] text-muted-foreground">{dayTasks.length + challengeCount}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {state.players.map((player) => sameDayAllDone(state, player.id, date) && <span key={player.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: playerColor(player, state.players) }} title={`${player.name} completed all scheduled tasks`} />)}
                    {challengeCount > 0 && <span className="rounded-full bg-[#f7ca56] px-1.5 py-0.5 text-[10px] font-bold text-[#302f48]" title="Challenge tasks are due">Challenge</span>}
                    {spending.length > 0 && <span className="rounded-full bg-[#302f48] px-1.5 py-0.5 text-[10px] font-bold text-white" title="Coins were spent on this date">Spend</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {detailDate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#24243b]/55 p-4">
          <div className="mx-auto max-w-4xl rounded-3xl bg-[#f3ecdf] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">Day details</p>
                <h2 className="font-display text-2xl font-bold">{detailDate === today ? "Today" : dateLabel(detailDate)}</h2>
              </div>
              <Button variant="ghost" onClick={() => setDetailDate(undefined)}>Close</Button>
            </div>
            <div className="mt-5">{renderDayDetails(detailDate)}</div>
          </div>
        </div>
      )}
      {editor && <TaskEditor state={state} task={editor} onClose={() => setEditor(undefined)} />}
    </>
  );
}

function RewardRequestCard({ state, request }: { state: GameState; request: RewardRequest }) {
  const [offer, setOffer] = useState(String(request.offer));
  const respond = useRespondToRewardRequest();
  const id = meId();
  const waiting = request.turnPlayerId === id && !["accepted", "paid", "declined"].includes(request.status);
  const send = (action: "accept" | "counter" | "decline" | "pay") =>
    respond.mutate({ roomId: state.room.id, requestId: request.id, data: { actorId: id, action, ...(action === "counter" ? { offer: Number(offer) } : {}) } }, { onSuccess: () => refreshRoom(state.room.id) });

  return (
    <article className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{request.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">Requested by {ownerOf(state, request.requesterId)?.name} · payer: {ownerOf(state, request.payerId)?.name}</p>
        </div>
        <span className="rounded-full bg-[#eee2c6] px-2.5 py-1 text-[10px] font-extrabold uppercase">{request.status === "paid" ? "Paid" : request.status === "accepted" ? "Accepted – waiting for payer" : request.status}</span>
      </div>
      <p className="mt-3 text-sm">
        <strong>{request.offer} coins</strong> current offer · {request.status === "accepted" ? `${ownerOf(state, request.payerId)?.name} must confirm payment` : `turn: ${ownerOf(state, request.turnPlayerId)?.name}`}
      </p>
      {waiting && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => send("accept")} className="px-3 py-2 text-xs">Accept</Button>
          <div className="flex w-full gap-2 sm:w-auto">
            <input value={offer} onChange={(event) => setOffer(event.target.value)} type="number" min="1" step="1" className="w-24 rounded-xl border border-[#d9cfbd] px-2 text-sm" aria-label="Counteroffer amount" />
            <Button variant="ghost" onClick={() => send("counter")} className="px-3 py-2 text-xs">Send counteroffer</Button>
          </div>
          <Button variant="danger" onClick={() => send("decline")} className="px-3 py-2 text-xs">Decline</Button>
        </div>
      )}
      {request.status === "accepted" && request.payerId === id && <Button onClick={() => send("pay")} className="mt-4">Confirm &amp; pay {request.offer} coins</Button>}
    </article>
  );
}

function RewardsPage({ state }: { state: GameState }) {
  const [editor, setEditor] = useState<Reward>();
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("20");
  const [requestForm, setRequestForm] = useState(false);
  const [challengeForm, setChallengeForm] = useState(false);
  const [challengeType, setChallengeType] = useState<"task" | "coin">("task");
  const [challengeTitle, setChallengeTitle] = useState("");
  const [challengeDescription, setChallengeDescription] = useState("");
  const [challengeRewardCoins, setChallengeRewardCoins] = useState("20");
  const [challengeTargetCoins, setChallengeTargetCoins] = useState("100");
  const [challengeRewardTitle, setChallengeRewardTitle] = useState("");
  const [challengeDueDate, setChallengeDueDate] = useState(today);
  const [challengeEndDate, setChallengeEndDate] = useState(shiftDate(today, 7));
  const [requestTitle, setRequestTitle] = useState("");
  const [requestOffer, setRequestOffer] = useState("60");
  const [requestDescription, setRequestDescription] = useState("");
  const [purchaseNotice, setPurchaseNotice] = useState("");
  const [busyRewardId, setBusyRewardId] = useState<string>();
  const id = meId();
  const me = ownerOf(state, id);
  const buddy = state.players.find((player) => player.id !== id);
  const create = useCreateReward();
  const update = useUpdateReward();
  const remove = useDeleteReward();
  const redeem = useRedeemReward();
  const createRequest = useCreateRewardRequest();
  const active = state.rewards.filter((reward) => reward.active);
  const activePurchases = activeRedemptions(state);
  const archive = completedRedemptions(state);

  const saveReward = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const done = () => {
      setForm(false);
      refreshRoom(state.room.id);
    };
    if (editor) {
      update.mutate({ roomId: state.room.id, rewardId: editor.id, data: { actorId: id, title: title.trim(), description: description.trim() || null, cost: Number(cost) } }, { onSuccess: done });
    } else {
      create.mutate({ roomId: state.room.id, data: { createdBy: id, title: title.trim(), description: description.trim(), cost: Number(cost) } }, { onSuccess: done });
    }
  };

  const sendRequest = (event: FormEvent) => {
    event.preventDefault();
    if (!requestTitle.trim()) return;
    createRequest.mutate(
      { roomId: state.room.id, data: { requesterId: id, title: requestTitle.trim(), description: requestDescription.trim() || null, offer: Number(requestOffer) } },
      {
        onSuccess: () => {
          setRequestForm(false);
          refreshRoom(state.room.id);
        },
      },
    );
  };

  const sendChallenge = async (event: FormEvent) => {
    event.preventDefault();
    if (!buddy) return;
    await createChallenge(state.room.id, {
      type: challengeType,
      challengerId: id,
      recipientId: buddy.id,
      ...(challengeType === "task"
        ? {
            title: challengeTitle.trim(),
            description: challengeDescription.trim() || null,
            rewardCoins: Number(challengeRewardCoins),
            dueDate: challengeDueDate,
          }
        : {
            rewardTitle: challengeRewardTitle.trim(),
            description: challengeDescription.trim() || null,
            targetCoins: Number(challengeTargetCoins),
            endDate: challengeEndDate,
          }),
    });
    setChallengeForm(false);
    setChallengeTitle("");
    setChallengeDescription("");
    setChallengeRewardTitle("");
    refreshRoom(state.room.id);
  };

  return (
    <>
      <PageHeader
        eyebrow="Shared rewards"
        title="Rewards"
        body="Standard rewards stay reusable, while one-off requests move through negotiation."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setRequestForm(true)}><Sparkles className="h-4 w-4" /> Request a reward</Button>
            <Button variant="ghost" onClick={() => setChallengeForm(true)}>Challenge</Button>
            <Button onClick={() => { setEditor(undefined); setTitle(""); setDescription(""); setCost("20"); setForm(true); }}><Plus className="h-4 w-4" /> Add reward</Button>
          </div>
        }
      />
      <div className="mb-6 rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5">
        <p className="font-mono-ui text-[10px] tracking-[.2em] text-[#9a7a2b] uppercase">Current balance</p>
        <h2 className="mt-2 font-display text-3xl font-bold">{me?.coins ?? 0} coins</h2>
        {purchaseNotice && <p className="mt-3 rounded-2xl bg-[#fff4cc] px-4 py-3 text-sm font-bold text-[#93752c]">{purchaseNotice}</p>}
      </div>
      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">Standard rewards</h2>
        {active.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((reward) => (
              <article key={reward.id} className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5">
                <div className="flex justify-between gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#302f48] text-[#f7ca56]">
                    <Star />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={() => { setEditor(reward); setTitle(reward.title); setDescription(reward.description ?? ""); setCost(String(reward.cost)); setForm(true); }}>Edit</Button>
                    <Button variant="danger" className="px-2 py-1.5 text-xs" onClick={() => remove.mutate({ roomId: state.room.id, rewardId: reward.id, data: { actorId: id } }, { onSuccess: () => refreshRoom(state.room.id) })}>Delete</Button>
                  </div>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold">{reward.title}</h3>
                <p className="mt-2 min-h-10 text-sm text-muted-foreground">{reward.description}</p>
                <div className="mt-5 flex items-center justify-between border-t border-[#e8dfd1] pt-4">
                  <span className="flex items-center gap-1 font-mono-ui text-[#ad7d1e]"><Gem className="h-4 w-4" />{reward.cost}</span>
                  <Button
                    disabled={(me?.coins ?? 0) < reward.cost || redeem.isPending}
                    onClick={() =>
                      redeem.mutate(
                        { roomId: state.room.id, rewardId: reward.id, data: { playerId: id } },
                        {
                          onSuccess: () => {
                            setPurchaseNotice(`Bought ${reward.title} for ${reward.cost} coins.`);
                            refreshRoom(state.room.id);
                          },
                        },
                      )
                    }
                  >
                    {(me?.coins ?? 0) >= reward.cost ? "Buy reward" : "Need more coins"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Trophy} title="No rewards yet" body="Add a reusable reward for both players to work toward." action={<Button onClick={() => setForm(true)}>Add reward</Button>} />
        )}
      </section>
      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-bold">Purchased / Awaiting provider</h2>
        <div className="space-y-3">
          {activePurchases.map((purchase) => (
            <div key={purchase.id} className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-4 text-sm">
              <p className="font-bold">{purchase.rewardTitle ?? "Reward purchase"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {redemptionSourceLabel(state, purchase)}
              </p>
              {purchase.providerId === id && purchase.playerId !== id && (
                <Button
                  className="mt-3"
                  disabled={busyRewardId === purchase.id}
                  onClick={async () => {
                    try {
                      setBusyRewardId(purchase.id);
                      await markRedemptionDone(state.room.id, purchase.id);
                      refreshRoom(state.room.id);
                    } finally {
                      setBusyRewardId(undefined);
                    }
                  }}
                >
                  Mark as complete
                </Button>
              )}
            </div>
          ))}
          {activePurchases.length === 0 && <p className="rounded-2xl border border-dashed border-[#d7cbb8] bg-[#f8f1e5] p-4 text-sm text-muted-foreground">No standard reward purchases are waiting right now.</p>}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-bold">Active / Pending reward requests</h2>
        <div className="space-y-3">
          {activeRewardRequests(state).map((request) => <RewardRequestCard key={request.id} state={state} request={request} />)}
          {activeRewardRequests(state).length === 0 && <p className="rounded-2xl border border-dashed border-[#d7cbb8] bg-[#f8f1e5] p-4 text-sm text-muted-foreground">No active negotiations.</p>}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-bold">Challenges</h2>
        <div className="space-y-3">
          {state.challenges.map((challenge) => (
            <div key={challenge.id} className="rounded-2xl border border-[#dfd3c1] bg-[#fffaf1] p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{challenge.type === "task" ? challenge.title : `Earn ${challenge.targetCoins ?? 0} coins`}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {challenge.type === "task"
                      ? `${ownerOf(state, challenge.recipientId)?.name} can earn ${challenge.rewardCoins ?? 0} coins by ${challenge.dueDate ? dateLabel(challenge.dueDate) : "the deadline"}`
                      : `${ownerOf(state, challenge.recipientId)?.name} is chasing ${challenge.targetCoins ?? 0} coins for ${challenge.rewardTitle ?? "a reward"} by ${challenge.endDate ? dateLabel(challenge.endDate) : "the deadline"}`}
                  </p>
                </div>
                <span className="rounded-full bg-[#eee2c6] px-2.5 py-1 text-[10px] font-extrabold uppercase">{challenge.status}</span>
              </div>
            </div>
          ))}
          {state.challenges.length === 0 && <p className="rounded-2xl border border-dashed border-[#d7cbb8] bg-[#f8f1e5] p-4 text-sm text-muted-foreground">No challenges yet.</p>}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-bold">Completed / Archive</h2>
        <div className="space-y-2">
          {archive.map((purchase) => (
            <div key={purchase.id} className="rounded-xl border border-[#dfd3c1] bg-[#fffaf1] p-4 text-sm">
              <p className="font-bold">{purchase.rewardTitle ?? "Reward purchase"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Purchased by {ownerOf(state, purchase.playerId)?.name} · provided by {ownerOf(state, purchase.providerId ?? "")?.name ?? "their buddy"} · {purchase.cost} coins · bought {new Date(purchase.redeemedAt).toLocaleDateString()} · completed {purchase.completedAt ? new Date(purchase.completedAt).toLocaleDateString() : "later"}
              </p>
            </div>
          ))}
          {archive.length === 0 && <p className="rounded-2xl border border-dashed border-[#d7cbb8] bg-[#f8f1e5] p-4 text-sm text-muted-foreground">Completed reward purchases and fulfilled challenge rewards will stay here permanently.</p>}
        </div>
      </section>
      {(form || requestForm || challengeForm) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#24243b]/55 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#fffaf1] p-6">
            {form ? (
              <form onSubmit={saveReward} className="space-y-4">
                <div className="flex justify-between">
                  <h2 className="font-display text-2xl font-bold">{editor ? "Edit reward" : "Add reward"}</h2>
                  <Button type="button" variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
                </div>
                <label className="block text-sm font-bold">
                  Reward name
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                </label>
                <label className="block text-sm font-bold">
                  Description
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                </label>
                <label className="block text-sm font-bold">
                  Coin cost
                  <input type="number" min="1" value={cost} onChange={(event) => setCost(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                </label>
                <Button type="submit" className="w-full">Save reward</Button>
              </form>
            ) : requestForm ? (
              <form onSubmit={sendRequest} className="space-y-4">
                <div className="flex justify-between">
                  <h2 className="font-display text-2xl font-bold">Request a reward</h2>
                  <Button type="button" variant="ghost" onClick={() => setRequestForm(false)}>Cancel</Button>
                </div>
                <label className="block text-sm font-bold">
                  What are you requesting?
                  <input value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                </label>
                <label className="block text-sm font-bold">
                  Context
                  <textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                </label>
                <label className="block text-sm font-bold">
                  Offer
                  <input type="number" min="1" step="1" value={requestOffer} onChange={(event) => setRequestOffer(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                </label>
                <Button type="submit" className="w-full">Send request</Button>
              </form>
            ) : (
              <form onSubmit={sendChallenge} className="space-y-4">
                <div className="flex justify-between">
                  <h2 className="font-display text-2xl font-bold">Create a challenge</h2>
                  <Button type="button" variant="ghost" onClick={() => setChallengeForm(false)}>Cancel</Button>
                </div>
                <div className="flex rounded-xl bg-[#eee5d5] p-1 text-xs font-bold">
                  <button type="button" onClick={() => setChallengeType("task")} className={`flex-1 rounded-lg py-2 ${challengeType === "task" ? "bg-[#302f48] text-white" : ""}`}>Task Challenge</button>
                  <button type="button" onClick={() => setChallengeType("coin")} className={`flex-1 rounded-lg py-2 ${challengeType === "coin" ? "bg-[#302f48] text-white" : ""}`}>Coin Goal Challenge</button>
                </div>
                {challengeType === "task" ? (
                  <>
                    <label className="block text-sm font-bold">
                      Task / description
                      <input value={challengeTitle} onChange={(event) => setChallengeTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                    </label>
                    <label className="block text-sm font-bold">
                      Deadline
                      <input type="date" value={challengeDueDate} onChange={(event) => setChallengeDueDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                    </label>
                    <label className="block text-sm font-bold">
                      Coin reward
                      <input type="number" min="1" value={challengeRewardCoins} onChange={(event) => setChallengeRewardCoins(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-bold">
                      Target coins
                      <input type="number" min="1" value={challengeTargetCoins} onChange={(event) => setChallengeTargetCoins(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                    </label>
                    <label className="block text-sm font-bold">
                      Prize / reward
                      <input value={challengeRewardTitle} onChange={(event) => setChallengeRewardTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                    </label>
                    <label className="block text-sm font-bold">
                      Timeframe end date
                      <input type="date" value={challengeEndDate} onChange={(event) => setChallengeEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                    </label>
                  </>
                )}
                <label className="block text-sm font-bold">
                  Context
                  <textarea value={challengeDescription} onChange={(event) => setChallengeDescription(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" />
                </label>
                <Button type="submit" className="w-full">Send challenge</Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function TogetherPage({ state }: { state: GameState }) {
  const [selectedDate, setSelectedDate] = useDaySelection(dayChoices(state));
  const [encouragementOpen, setEncouragementOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Quest>();
  const id = meId();
  const complete = useSetQuestCompleted();
  const remove = useDeleteQuest();
  const sendEncouragement = useCreateEncouragement();
  const other = state.players.find((player) => player.id !== id);
  const encouragements = [...state.encouragements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <>
      <PageHeader eyebrow="Accountability" title="Together" body="Each player keeps their own controls, but both sections open on the same selected day." />
      <DayPicker dates={dayChoices(state)} selected={selectedDate} onSelect={setSelectedDate} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_.9fr]">
        <div className="grid gap-5 lg:grid-cols-2">
          {state.players.map((player) => {
            const own = player.id === id;
            const tasks = state.quests.filter((quest) => quest.ownerId === player.id && quest.dueDate === selectedDate);
            const taskChallenges = acceptedTaskChallengesFor(state, player.id, selectedDate);
            return (
              <section key={player.id} className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5" style={{ borderTopColor: player.color, borderTopWidth: 4 }}>
                <div className="flex items-center gap-3">
                  <Avatar player={player} players={state.players} size="lg" />
                  <div>
                    <h2 className="font-display text-2xl font-bold">{player.name}</h2>
                    <p className="text-xs text-muted-foreground">{completionCountFor(tasks)}/{tasks.length} completed · {player.coins} coins in bank</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {taskChallenges.map((challenge) => (
                    <TaskChallengeCard key={challenge.id} state={state} challenge={challenge} showActions={own} />
                  ))}
                  {tasks.map((quest) => (
                    <TaskCard
                      key={quest.id}
                      state={state}
                      quest={quest}
                      own={own}
                      onComplete={own ? () => complete.mutate(
                        { roomId: state.room.id, questId: quest.id, data: { ownerId: id, completed: quest.status !== "completed" } },
                        { onSuccess: () => { if (quest.status !== "completed") celebrate(); refreshRoom(state.room.id); } },
                      ) : undefined}
                      onEdit={own ? () => setEditor(quest) : undefined}
                      onDelete={own ? () => window.confirm("Delete this task?") && remove.mutate({ roomId: state.room.id, questId: quest.id, data: { ownerId: id } }, { onSuccess: () => refreshRoom(state.room.id) }) : undefined}
                    />
                  ))}
                  {tasks.length === 0 && taskChallenges.length === 0 && <p className="text-sm text-muted-foreground">No scheduled tasks for this day.</p>}
                </div>
              </section>
            );
          })}
        </div>
        <aside className="space-y-5">
          <section className="rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">Encouragements</h2>
                <p className="text-sm text-muted-foreground">Visible support stays right here beside the day view.</p>
              </div>
              <Button onClick={() => setEncouragementOpen(true)}>Send encouragement</Button>
            </div>
            <div className="mt-4 space-y-3">
              {encouragements.map((item) => (
                <div key={item.id} className="rounded-2xl bg-[#f8f1e5] p-4">
                  <p className="font-bold">{ownerOf(state, item.fromId)?.name} → {ownerOf(state, item.toId)?.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                </div>
              ))}
              {encouragements.length === 0 && <p className="text-sm text-muted-foreground">No encouragements yet.</p>}
            </div>
          </section>
        </aside>
      </div>
      {encouragementOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#24243b]/55 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!message.trim() || !other) return;
              sendEncouragement.mutate(
                { roomId: state.room.id, data: { fromId: id, toId: other.id, message: message.trim() } },
                {
                  onSuccess: () => {
                    setMessage("");
                    setEncouragementOpen(false);
                    refreshRoom(state.room.id);
                  },
                },
              );
            }}
            className="w-full max-w-md rounded-3xl bg-[#fffaf1] p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">Send encouragement</h2>
              <Button type="button" variant="ghost" onClick={() => setEncouragementOpen(false)}>Cancel</Button>
            </div>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="mt-4 w-full rounded-2xl border border-[#d9cfbd] px-4 py-3 text-sm" placeholder={`Write something kind for ${other?.name ?? "your buddy"}`} />
            <Button type="submit" className="mt-4 w-full">Send encouragement</Button>
          </form>
        </div>
      )}
      {editor && <TaskEditor state={state} task={editor} onClose={() => setEditor(undefined)} />}
    </>
  );
}

function SettingsPage({ state }: { state: GameState }) {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);

  return (
    <>
      <PageHeader eyebrow="Room settings" title="Settings" body="Invite your buddy and keep the room details handy." />
      <section className="max-w-2xl rounded-3xl border border-[#dfd3c1] bg-[#fffaf1] p-6">
        <div className="flex items-start gap-4">
          <Landmark />
          <div className="flex-1">
            <p className="text-xs font-bold text-muted-foreground">Current room</p>
            <h2 className="mt-1 font-display text-2xl font-bold">{state.room.name}</h2>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-[#eee2d2] px-3 py-2 font-mono-ui tracking-[.15em]">{state.room.code}</span>
              <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(state.room.code); setCopied(true); }}>
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy code"}
              </Button>
              <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(inviteLink(state.room.id))}>
                <Link2 className="h-4 w-4" />
                Copy invite link
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-[#f0e8da] p-4 text-sm">
          <LockKeyhole className="text-[#4e8069]" />
          Exactly two players can access this room.
        </div>
        <Button variant="danger" className="mt-6" onClick={() => { localStorage.removeItem("quest-road-room"); localStorage.removeItem("quest-road-player"); setLocation("/"); }}>
          Leave room
        </Button>
      </section>
    </>
  );
}

function RoomPage() {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const room = useGetRoom(roomId, { query: { queryKey: getGetRoomQueryKey(roomId), refetchInterval: 8000 } });
  const state = useGetGameState(roomId, { query: { queryKey: getGetGameStateQueryKey(roomId), refetchInterval: 8000 } });

  useEffect(() => {
    if (roomId) localStorage.setItem("quest-road-room", roomId);
  }, [roomId]);

  if (room.isLoading) return <Loading text="Opening your room…" />;
  if (room.isError || !room.data) return <ErrorState retry={() => room.refetch()} />;
  if (room.data.status === "waiting") {
    return (
      <main className="min-h-[100dvh] bg-[#24243b] p-6 text-white">
        <div className="mx-auto max-w-xl rounded-3xl bg-[#fff7e8] p-8 text-[#24243b]">
          <p className="font-mono-ui text-xs uppercase text-[#9a7a2b]">Room created</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{room.data.name}</h1>
          <p className="mt-6 rounded-2xl bg-[#302f48] p-5 text-center font-mono-ui text-3xl tracking-[.2em] text-[#f7ca56]">{room.data.code}</p>
          <p className="mt-6 text-center text-sm text-muted-foreground">Share the code or invite link. This page checks for your buddy.</p>
        </div>
      </main>
    );
  }
  if (state.isLoading) return <Loading />;
  if (state.isError || !state.data) return <ErrorState retry={() => state.refetch()} />;
  return <Shell state={state.data}><UpdatesPage state={state.data} /></Shell>;
}

function InvitePage() {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const [, setLocation] = useLocation();
  const room = useGetRoom(roomId, { query: { queryKey: getGetRoomQueryKey(roomId), refetchInterval: 8000 } });
  const join = useJoinRoom();
  const [name, setName] = useState("");

  if (room.isLoading) return <Loading text="Opening the invite…" />;
  if (room.isError || !room.data) return <ErrorState retry={() => room.refetch()} />;
  if (room.data.status === "playing") {
    return (
      <main className="min-h-[100dvh] bg-[#f3ecdf] p-8">
        <Empty icon={Compass} title="This room is already full" body="Ask your buddy to open the room from their device." action={<Link href="/"><Button>Back to Quest Buddies</Button></Link>} />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#24243b] p-5">
      <div className="mx-auto mt-16 max-w-md rounded-3xl bg-[#fff7e8] p-7 text-[#24243b]">
        <p className="font-mono-ui text-xs uppercase text-[#9a7a2b]">Join Quest Buddies</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{room.data.name}</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            join.mutate(
              { roomId, data: { code: room.data.code, playerName: name.trim() } },
              {
                onSuccess: (joined) => {
                  localStorage.setItem("quest-road-room", joined.id);
                  localStorage.setItem("quest-road-player", joined.guest?.id ?? "");
                  setLocation(`/room/${joined.id}`);
                },
              },
            );
          }}
          className="mt-6 space-y-4"
        >
          <label className="block text-sm font-bold">
            Your name
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] bg-[#fbf5eb] px-4 py-3" />
          </label>
          <Button type="submit" disabled={join.isPending} className="w-full">{join.isPending ? <Loader2 className="animate-spin" /> : "Join room"}</Button>
        </form>
      </div>
    </main>
  );
}

function SuccessCelebrations({ state }: { state: GameState }) {
  const previous = useRef<{ transactionIds: Set<string>; succeededCoinChallenges: Set<string> } | undefined>(undefined);

  useEffect(() => {
    const current = {
      transactionIds: new Set(state.transactions.map((transaction) => transaction.id)),
      succeededCoinChallenges: new Set(
        state.challenges
          .filter((challenge) => challenge.type === "coin" && challenge.status === "succeeded")
          .map((challenge) => challenge.id),
      ),
    };
    const prior = previous.current;
    if (prior) {
      const newBingoBonuses = state.transactions.filter(
        (transaction) =>
          !prior.transactionIds.has(transaction.id) &&
          transaction.kind === "bonus" &&
          transaction.label.startsWith("Bingo bonus:"),
      );
      if (newBingoBonuses.some((transaction) => transaction.amount === 40)) celebrate();
      else if (newBingoBonuses.some((transaction) => transaction.amount === 20)) celebrate();
      else if (newBingoBonuses.some((transaction) => transaction.amount === 10)) celebrate();

      if (
        [...current.succeededCoinChallenges].some(
          (challengeId) => !prior.succeededCoinChallenges.has(challengeId),
        )
      ) celebrate();
    }
    previous.current = current;
  }, [state]);

  return null;
}

function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => currentSession());
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <>{children}</>;

  return (
    <main className="min-h-[100dvh] bg-[#24243b] p-5 text-[#fff7e8]">
      <div className="mx-auto mt-16 w-full max-w-md rounded-3xl bg-[#fff7e8] p-7 text-[#24243b]">
        <p className="font-mono-ui text-xs tracking-[.2em] text-[#9a7a2b] uppercase">Quest Buddies</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              setBusy(true);
              const next = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);
              if (!next) setError("Check your email to confirm your account, then sign in.");
              else setSession(next);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not sign in.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-bold">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" /></label>
          <label className="block text-sm font-bold">Password<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbd] px-4 py-3" /></label>
          {error && <p className="rounded-xl bg-[#fff4cc] p-3 text-sm text-[#93752c]">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait" : mode === "sign-in" ? "Sign in" : "Create account"}</Button>
        </form>
        <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); }}>
          {mode === "sign-in" ? "Create an account" : "I already have an account"}
        </Button>
      </div>
    </main>
  );
}

function RoutedApp() {
  const roomId = localStorage.getItem("quest-road-room") ?? "";
  const shared = useGetGameState(roomId, { query: { enabled: Boolean(roomId), queryKey: getGetGameStateQueryKey(roomId), refetchInterval: 8000 } });

  const page = (element: ReactNode) => {
    if (!roomId) {
      return (
        <main className="min-h-[100dvh] bg-[#f3ecdf] p-8">
          <Empty icon={Link2} title="No room selected" body="Create or join a room first." action={<Link href="/"><Button>Find a room</Button></Link>} />
        </main>
      );
    }
    if (shared.isLoading) return <Loading />;
    if (shared.isError || !shared.data) return <ErrorState retry={() => shared.refetch()} />;
    return <Shell state={shared.data}>{element}</Shell>;
  };

  return (
    <>
      {shared.data && <SuccessCelebrations state={shared.data} />}
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/room/:roomId" component={RoomPage} />
        <Route path="/invite/:roomId" component={InvitePage} />
        <Route path="/today">{page(shared.data ? <UpdatesPage state={shared.data} /> : null)}</Route>
        <Route path="/tasks">{page(shared.data ? <TasksPage state={shared.data} /> : null)}</Route>
        <Route path="/journey">{page(shared.data ? <JourneyPage state={shared.data} /> : null)}</Route>
        <Route path="/calendar">{page(shared.data ? <CalendarPage state={shared.data} /> : null)}</Route>
        <Route path="/rewards">{page(shared.data ? <RewardsPage state={shared.data} /> : null)}</Route>
        <Route path="/together">{page(shared.data ? <TogetherPage state={shared.data} /> : null)}</Route>
        <Route path="/settings">{page(shared.data ? <SettingsPage state={shared.data} /> : null)}</Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  setAuthTokenGetter(getAccessToken);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ErrorBoundary resetKey={useLocation()[0]}>
            <AuthGate><RoutedApp /></AuthGate>
          </ErrorBoundary>
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
