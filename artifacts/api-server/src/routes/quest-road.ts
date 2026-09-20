import { Router, type IRouter } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import {
  CreateEncouragementBody,
  CreateLabelBody,
  CreateQuestBody,
  CreateRewardRequestBody,
  CreateRewardBody,
  CreateRoomBody,
  DeleteLabelBody,
  DeleteRewardBody,
  GetBingoBoardResponse,
  GetGameStateResponse,
  GetRoomResponse,
  JoinRoomBody,
  JoinRoomResponse,
  RedeemRewardBody,
  RedeemRewardResponse,
  RespondToRewardRequestBody,
  SetQuestCompletedBody,
  SetQuestCompletedResponse,
  SetQuestRewardBody,
  SetQuestRewardResponse,
  StealQuestRewardBody,
  SuggestBingoSquareBody,
  SuggestBingoSquareResponse,
  UpdateLabelBody,
  UpdateQuestBody,
  UpdateQuestResponse,
  UpdateRewardBody,
  CreateRoomResponse,
  CreateQuestResponse,
  CreateEncouragementResponse,
  CreateRewardResponse,
} from "@workspace/api-zod";
import { createQuestRoom, findQuestRoomForUser, loadQuestRoom, saveQuestRoom } from "../lib/quest-persistence";
import { requireSupabaseUser, type AuthenticatedRequest } from "../lib/supabase-auth";

type Player = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  coins: number;
  xp: number;
  streak: number;
};

type Room = {
  id: string;
  code: string;
  name: string;
  status: "waiting" | "playing";
  host: Player;
  guest: Player | null;
  createdAt: string;
};

type QuestLink = {
  id: string;
  url: string;
  name: string;
};

type QuestSubtask = {
  id: string;
  title: string;
  completed: boolean;
};

type Quest = {
  id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  labelId: string | null;
  status: "planned" | "completed";
  coinValue: number | null;
  rewardStatus: "pending" | "assigned";
  rewardAssignedBy: string | null;
  coinsAwarded: boolean;
  links: QuestLink[];
  subtasks: QuestSubtask[];
  stolenCoins: number;
  stolenBy: string | null;
  xpValue: number;
  completedAt: string | null;
  createdAt: string;
};

type Reward = {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  cost: number;
  createdBy: string;
  active: boolean;
  createdAt: string;
};

type Label = {
  id: string;
  ownerId: string;
  name: string;
  color: string;
  createdAt: string;
};

type RewardRequest = {
  id: string;
  requesterId: string;
  responderId: string;
  payerId: string;
  turnPlayerId: string;
  title: string;
  description: string | null;
  offer: number;
  status: "awaiting_response" | "countered" | "accepted" | "declined" | "paid";
  createdAt: string;
  updatedAt: string;
};

type Encouragement = {
  id: string;
  fromId: string;
  toId: string;
  message: string;
  createdAt: string;
};

type BingoSquare = {
  id: string;
  text: string;
  intensity: "light" | "medium" | "stretch";
  family: string;
  rule: string;
  completed: boolean;
  completedAt: string | null;
  contributorIds: string[];
};

type BingoBoard = {
  weekStart: string;
  weekLabel: string;
  status: "active" | "past" | "locked";
  unlockDate: string | null;
  squares: BingoSquare[];
  lineCount: number;
  lineBonusAwarded: boolean;
  threeLineBonusAwarded: boolean;
  fullBoardBonusAwarded: boolean;
};

type BingoSuggestion = {
  id: string;
  playerId: string;
  text: string;
  intensity: "light" | "medium" | "stretch" | "undecided";
  weekStart: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  playerId: string;
  amount: number;
  kind: "quest" | "reward" | "bonus";
  label: string;
  sourceId?: string;
  createdAt: string;
};

type Redemption = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  playerId: string;
  providerId: string;
  cost: number;
  redeemedAt: string;
  sourceType: "standard" | "request" | "challenge";
  completedAt: string | null;
  completedById: string | null;
  sourceRequestId: string | null;
  sourceChallengeId: string | null;
};

type Challenge = {
  id: string;
  type: "task" | "coin";
  status:
    | "awaiting_response"
    | "countered"
    | "accepted"
    | "declined"
    | "completed"
    | "succeeded"
    | "failed";
  challengerId: string;
  recipientId: string;
  turnPlayerId: string | null;
  title: string;
  description: string | null;
  rewardTitle: string | null;
  rewardCoins: number | null;
  dueDate: string | null;
  targetCoins: number | null;
  startDate: string | null;
  endDate: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  unlockedRedemptionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type RoomStore = {
  room: Room;
  quests: Quest[];
  rewards: Reward[];
  encouragements: Encouragement[];
  transactions: Transaction[];
  redemptions: Redemption[];
  labels: Label[];
  rewardRequests: RewardRequest[];
  challenges: Challenge[];
  bingoBoards: BingoBoard[];
  bingoSuggestions: BingoSuggestion[];
};

type BingoMetricContext = {
  tasks: Quest[];
  tasksByPlayer: Map<string, Quest[]>;
  taskDates: string[];
  sharedDays: string[];
  coinsByPlayer: Map<string, number>;
  totalCoins: number;
  completedSubtasks: number;
  labels: Set<string>;
  weekendOwners: Set<string>;
  dueTasksCompletedOnTime: Quest[];
  sameDayPairs: string[];
  somedayTasks: Quest[];
  rewardAssignedByBuddy: Quest[];
  encouragementsThisWeek: Encouragement[];
};

type BingoTemplate = {
  id: string;
  intensity: "light" | "medium" | "stretch";
  family: string;
  cooperative: boolean;
  text: string;
  rule: string;
  isFeasible: (store: RoomStore) => boolean;
  evaluate: (context: BingoMetricContext, store: RoomStore) => string[];
};

const rooms = new Map<string, RoomStore>();
const playerColors = ["#d79b4c", "#6f9f8b"] as const;
const lineIndexes = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [0, 5, 10, 15],
  [3, 6, 9, 12],
] as const;

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString: string, amount: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay();
  return addDays(dateString, day === 0 ? -6 : 1 - day);
}

function endOfDay(dateString: string) {
  return new Date(`${dateString}T23:59:59Z`);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function requiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function optionalTrimmedString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }
  return value.trim() || null;
}

function requiredPositiveNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new Error(`${key} must be a positive number.`);
  }
  return value;
}

function requiredDate(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!isIsoDate(value)) {
    throw new Error(`${key} must be a date in YYYY-MM-DD format.`);
  }
  return value;
}

function formatWeekLabel(start: string) {
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const end = addDays(start, 6);
  return `${formatter.format(new Date(`${start}T12:00:00Z`))} – ${formatter.format(new Date(`${end}T12:00:00Z`))}`;
}

function makeCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function makePlayer(name: string, color: string, id: string = randomUUID()): Player {
  return {
    id,
    name: name.trim(),
    avatar: "compass",
    color,
    coins: 0,
    xp: 0,
    streak: 0,
  };
}

function storeFor(roomId: string) {
  return rooms.get(roomId);
}

function storeForRoomRef(reference: string) {
  const direct = rooms.get(reference);
  if (direct) return direct;
  const normalized = reference.trim().toUpperCase();
  return [...rooms.values()].find((store) => store.room.code === normalized);
}

function playersIn(store: RoomStore) {
  return [store.room.host, store.room.guest].filter(Boolean) as Player[];
}

function playerIn(room: Room, playerId: string) {
  return room.host.id === playerId || room.guest?.id === playerId;
}

function playerFor(store: RoomStore, playerId: string) {
  return playersIn(store).find((player) => player.id === playerId);
}

function otherPlayer(store: RoomStore, playerId: string) {
  return playersIn(store).find((player) => player.id !== playerId);
}

function dateValue(value: Date | string | null | undefined) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function syncBalances(store: RoomStore) {
  for (const player of playersIn(store)) {
    player.coins = store.transactions
      .filter((transaction) => transaction.playerId === player.id)
      .reduce((total, transaction) => total + transaction.amount, 0);
    player.xp = store.quests
      .filter((quest) => quest.ownerId === player.id && quest.status === "completed")
      .reduce((total, quest) => total + quest.xpValue, 0);
  }
}

function challengeProgressCoins(store: RoomStore, challenge: Challenge) {
  if (challenge.type !== "coin" || !challenge.startDate || !challenge.endDate) return 0;
  return store.transactions
    .filter((transaction) => {
      const day = transaction.createdAt.slice(0, 10);
      return (
        transaction.playerId === challenge.recipientId &&
        transaction.amount > 0 &&
        day >= challenge.startDate! &&
        day <= challenge.endDate!
      );
    })
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function createChallengeRedemption(store: RoomStore, challenge: Challenge) {
  if (challenge.unlockedRedemptionId) return;
  const redemption: Redemption = {
    id: randomUUID(),
    rewardId: `challenge:${challenge.id}`,
    rewardTitle: challenge.rewardTitle ?? challenge.title,
    playerId: challenge.recipientId,
    providerId: challenge.challengerId,
    cost: 0,
    redeemedAt: now(),
    sourceType: "challenge",
    completedAt: null,
    completedById: null,
    sourceRequestId: null,
    sourceChallengeId: challenge.id,
  };
  store.redemptions.push(redemption);
  challenge.unlockedRedemptionId = redemption.id;
}

function updateChallenges(store: RoomStore) {
  const currentDay = today();
  for (const challenge of store.challenges) {
    if (challenge.type === "task" && challenge.status === "accepted" && challenge.dueDate && currentDay > challenge.dueDate) {
      challenge.status = "failed";
      challenge.completedAt = challenge.completedAt ?? now();
      challenge.updatedAt = now();
      continue;
    }
    if (challenge.type !== "coin" || challenge.status !== "accepted") continue;
    const progress = challengeProgressCoins(store, challenge);
    if ((challenge.targetCoins ?? 0) > 0 && progress >= (challenge.targetCoins ?? 0)) {
      challenge.status = "succeeded";
      challenge.completedAt = challenge.completedAt ?? now();
      challenge.updatedAt = now();
      createChallengeRedemption(store, challenge);
      continue;
    }
    if (challenge.endDate && currentDay > challenge.endDate) {
      challenge.status = "failed";
      challenge.completedAt = challenge.completedAt ?? now();
      challenge.updatedAt = now();
    }
  }
}

function stableNumber(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function shuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let value = seed || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    const swap = value % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function sanitizeSuggestionText(text: string) {
  return text.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

function hasLabels(store: RoomStore) {
  return store.labels.length > 0 || store.quests.some((quest) => quest.labelId);
}

function hasSubtasks(store: RoomStore) {
  return store.quests.some((quest) => (quest.subtasks ?? []).length > 0);
}

function hasDueDates(store: RoomStore) {
  return store.quests.some((quest) => Boolean(quest.dueDate));
}

function hasBuddyRewardTargets(store: RoomStore) {
  return store.quests.some((quest) => quest.rewardStatus === "pending");
}

function playerIds(store: RoomStore) {
  return playersIn(store).map((player) => player.id);
}

function evaluateTaskThreshold(context: BingoMetricContext, amount: number) {
  return context.tasks.length >= amount ? [...new Set(context.tasks.map((task) => task.ownerId))] : [];
}

function evaluateCoinThreshold(context: BingoMetricContext, amount: number, store: RoomStore) {
  return context.totalCoins >= amount ? playerIds(store) : [];
}

function evaluateSeparateDays(context: BingoMetricContext, amount: number) {
  return new Set(context.taskDates).size >= amount ? [...new Set(context.tasks.map((task) => task.ownerId))] : [];
}

function evaluateSharedTaskDay(context: BingoMetricContext, store: RoomStore) {
  return context.sameDayPairs.length > 0 ? playerIds(store) : [];
}

function evaluateBothPlayersAnyTask(context: BingoMetricContext, store: RoomStore) {
  return playersIn(store).every((player) => (context.tasksByPlayer.get(player.id) ?? []).length > 0) ? playerIds(store) : [];
}

function evaluateEachPlayerTaskCount(context: BingoMetricContext, store: RoomStore, amount: number) {
  return playersIn(store).every((player) => (context.tasksByPlayer.get(player.id) ?? []).length >= amount) ? playerIds(store) : [];
}

function evaluateOnePlayerTaskCount(context: BingoMetricContext, amount: number) {
  const owner = [...context.tasksByPlayer.entries()].find(([, tasks]) => tasks.length >= amount)?.[0];
  return owner ? [owner] : [];
}

function evaluateEachPlayerCoins(context: BingoMetricContext, store: RoomStore, amount: number) {
  return playersIn(store).every((player) => (context.coinsByPlayer.get(player.id) ?? 0) >= amount) ? playerIds(store) : [];
}

function evaluateLabels(context: BingoMetricContext, amount: number) {
  return context.labels.size >= amount ? [...new Set(context.tasks.map((task) => task.ownerId))] : [];
}

function evaluateSubtasks(context: BingoMetricContext, amount: number) {
  return context.completedSubtasks >= amount ? [...new Set(context.tasks.map((task) => task.ownerId))] : [];
}

function evaluateAnySubtaskTask(context: BingoMetricContext) {
  const task = context.tasks.find((item) => (item.subtasks ?? []).length > 0);
  return task ? [task.ownerId] : [];
}

function evaluateSomedayTask(context: BingoMetricContext) {
  const task = context.somedayTasks[0];
  return task ? [task.ownerId] : [];
}

function evaluateDeadline(context: BingoMetricContext, amount: number) {
  return context.dueTasksCompletedOnTime.length >= amount
    ? [...new Set(context.dueTasksCompletedOnTime.map((task) => task.ownerId))]
    : [];
}

function evaluateRewardAssigned(store: RoomStore) {
  const quest = store.quests.find((item) => item.rewardAssignedBy && item.rewardAssignedBy !== item.ownerId);
  return quest?.rewardAssignedBy ? [quest.rewardAssignedBy] : [];
}

function evaluateEncouragement(context: BingoMetricContext) {
  return context.encouragementsThisWeek[0] ? [context.encouragementsThisWeek[0].fromId] : [];
}

function evaluateBothEncouragements(context: BingoMetricContext, store: RoomStore) {
  const sent = new Set(context.encouragementsThisWeek.map((item) => item.fromId));
  return playersIn(store).every((player) => sent.has(player.id)) ? playerIds(store) : [];
}

function evaluateWeekendBoth(context: BingoMetricContext, store: RoomStore) {
  return playersIn(store).every((player) => context.weekendOwners.has(player.id)) ? playerIds(store) : [];
}

const bingoTemplates: BingoTemplate[] = [
  {
    id: "light-tasks-4",
    intensity: "light",
    family: "task-count",
    cooperative: true,
    text: "Complete 4 tasks together during the week.",
    rule: "tasks:4",
    isFeasible: () => true,
    evaluate: (context) => evaluateTaskThreshold(context, 4),
  },
  {
    id: "light-both-task",
    intensity: "light",
    family: "task-count",
    cooperative: true,
    text: "Both players complete at least 1 task during the week.",
    rule: "both-task",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateBothPlayersAnyTask(context, store),
  },
  {
    id: "light-coins-50",
    intensity: "light",
    family: "coins",
    cooperative: true,
    text: "Earn 50 productive coins together during the week.",
    rule: "coins:50",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateCoinThreshold(context, 50, store),
  },
  {
    id: "light-same-day",
    intensity: "light",
    family: "collaboration",
    cooperative: true,
    text: "Both complete at least one task on the same day.",
    rule: "same-day",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateSharedTaskDay(context, store),
  },
  {
    id: "light-days-3",
    intensity: "light",
    family: "consistency",
    cooperative: true,
    text: "Complete tasks on 3 separate days.",
    rule: "days:3",
    isFeasible: () => true,
    evaluate: (context) => evaluateSeparateDays(context, 3),
  },
  {
    id: "light-tasks-one-day-3",
    intensity: "light",
    family: "consistency",
    cooperative: false,
    text: "One player completes 3 tasks in one day.",
    rule: "one-day-tasks:3",
    isFeasible: () => true,
    evaluate: (context) => {
      const grouped = new Map<string, number>();
      for (const task of context.tasks) {
        const day = task.completedAt?.slice(0, 10);
        if (!day) continue;
        const key = `${task.ownerId}:${day}`;
        grouped.set(key, (grouped.get(key) ?? 0) + 1);
      }
        const entry = [...grouped.entries()].find(([, count]) => count >= 3);
      return entry ? [entry[0].split(":")[0]] : [];
    },
  },
  {
    id: "light-labels-2",
    intensity: "light",
    family: "labels",
    cooperative: true,
    text: "Complete tasks from 2 different labels.",
    rule: "labels:2",
    isFeasible: hasLabels,
    evaluate: (context) => evaluateLabels(context, 2),
  },
  {
    id: "light-subtask-task",
    intensity: "light",
    family: "subtasks",
    cooperative: false,
    text: "Complete one task that contains subtasks.",
    rule: "subtask",
    isFeasible: hasSubtasks,
    evaluate: (context) => evaluateAnySubtaskTask(context),
  },
  {
    id: "light-encouragement",
    intensity: "light",
    family: "encouragement",
    cooperative: false,
    text: "Send an encouragement.",
    rule: "encouragement",
    isFeasible: () => true,
    evaluate: (context) => evaluateEncouragement(context),
  },
  {
    id: "light-someday",
    intensity: "light",
    family: "recovery",
    cooperative: false,
    text: "Complete one Someday task.",
    rule: "someday",
    isFeasible: () => true,
    evaluate: (context) => evaluateSomedayTask(context),
  },
  {
    id: "light-reward-assigned",
    intensity: "light",
    family: "extra",
    cooperative: false,
    text: "Assign a reward value to one of your buddy's personal tasks.",
    rule: "reward-assigned",
    isFeasible: hasBuddyRewardTargets,
    evaluate: (_context, store) => evaluateRewardAssigned(store),
  },
  {
    id: "medium-tasks-10",
    intensity: "medium",
    family: "task-count",
    cooperative: true,
    text: "Complete 10 tasks together during the week.",
    rule: "tasks:10",
    isFeasible: () => true,
    evaluate: (context) => evaluateTaskThreshold(context, 10),
  },
  {
    id: "medium-coins-120",
    intensity: "medium",
    family: "coins",
    cooperative: true,
    text: "Earn 120 productive coins together during the week.",
    rule: "coins:120",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateCoinThreshold(context, 120, store),
  },
  {
    id: "medium-each-coins-50",
    intensity: "medium",
    family: "coins",
    cooperative: true,
    text: "Each player earns at least 50 productive coins.",
    rule: "each-coins:50",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateEachPlayerCoins(context, store, 50),
  },
  {
    id: "medium-each-tasks-4",
    intensity: "medium",
    family: "task-count",
    cooperative: true,
    text: "Each player completes at least 4 tasks.",
    rule: "each-tasks:4",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateEachPlayerTaskCount(context, store, 4),
  },
  {
    id: "medium-days-5",
    intensity: "medium",
    family: "consistency",
    cooperative: true,
    text: "Complete tasks on 5 separate days.",
    rule: "days:5",
    isFeasible: () => true,
    evaluate: (context) => evaluateSeparateDays(context, 5),
  },
  {
    id: "medium-both-days-4",
    intensity: "medium",
    family: "collaboration",
    cooperative: true,
    text: "Both complete tasks on 4 separate days.",
    rule: "shared-days:4",
    isFeasible: () => true,
    evaluate: (context, store) => context.sharedDays.length >= 4 ? playerIds(store) : [],
  },
  {
    id: "medium-subtasks-8",
    intensity: "medium",
    family: "subtasks",
    cooperative: true,
    text: "Complete 8 subtasks together.",
    rule: "subtasks:8",
    isFeasible: hasSubtasks,
    evaluate: (context) => evaluateSubtasks(context, 8),
  },
  {
    id: "medium-labels-3",
    intensity: "medium",
    family: "labels",
    cooperative: true,
    text: "Complete tasks from 3 different labels.",
    rule: "labels:3",
    isFeasible: hasLabels,
    evaluate: (context) => evaluateLabels(context, 3),
  },
  {
    id: "medium-both-encouragement",
    intensity: "medium",
    family: "encouragement",
    cooperative: true,
    text: "Both send an encouragement during the week.",
    rule: "both-encouragement",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateBothEncouragements(context, store),
  },
  {
    id: "medium-routine-6",
    intensity: "medium",
    family: "routine",
    cooperative: false,
    text: "One player completes 6 tasks during the week.",
    rule: "one-player-tasks:6",
    isFeasible: () => true,
    evaluate: (context) => evaluateOnePlayerTaskCount(context, 6),
  },
  {
    id: "medium-support-task",
    intensity: "medium",
    family: "support",
    cooperative: true,
    text: "Both players complete a task and send an encouragement during the week.",
    rule: "support-task",
    isFeasible: () => true,
    evaluate: (context, store) => {
      const taskOwners = new Set(context.tasks.map((task) => task.ownerId));
      const senders = new Set(context.encouragementsThisWeek.map((item) => item.fromId));
      return playersIn(store).every((player) => taskOwners.has(player.id) && senders.has(player.id)) ? playerIds(store) : [];
    },
  },
  {
    id: "medium-focus-7",
    intensity: "medium",
    family: "focus",
    cooperative: false,
    text: "Complete 7 tasks during the week.",
    rule: "tasks:7",
    isFeasible: () => true,
    evaluate: (context) => evaluateTaskThreshold(context, 7),
  },
  {
    id: "medium-deadline-3",
    intensity: "medium",
    family: "deadline",
    cooperative: true,
    text: "Finish 3 tasks before their deadlines.",
    rule: "deadline:3",
    isFeasible: hasDueDates,
    evaluate: (context) => evaluateDeadline(context, 3),
  },
  {
    id: "stretch-tasks-16",
    intensity: "stretch",
    family: "task-count",
    cooperative: true,
    text: "Complete 16 tasks together during the week.",
    rule: "tasks:16",
    isFeasible: () => true,
    evaluate: (context) => evaluateTaskThreshold(context, 16),
  },
  {
    id: "stretch-coins-260",
    intensity: "stretch",
    family: "coins",
    cooperative: true,
    text: "Earn 260 productive coins together during the week.",
    rule: "coins:260",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateCoinThreshold(context, 260, store),
  },
  {
    id: "stretch-days-6",
    intensity: "stretch",
    family: "consistency",
    cooperative: true,
    text: "Complete tasks on 6 separate days.",
    rule: "days:6",
    isFeasible: () => true,
    evaluate: (context) => evaluateSeparateDays(context, 6),
  },
  {
    id: "stretch-shared-days-6",
    intensity: "stretch",
    family: "collaboration",
    cooperative: true,
    text: "Have 6 days where both players complete something.",
    rule: "shared-days:6",
    isFeasible: () => true,
    evaluate: (context, store) => context.sharedDays.length >= 6 ? playerIds(store) : [],
  },
  {
    id: "stretch-subtasks-14",
    intensity: "stretch",
    family: "subtasks",
    cooperative: true,
    text: "Complete 14 subtasks together.",
    rule: "subtasks:14",
    isFeasible: hasSubtasks,
    evaluate: (context) => evaluateSubtasks(context, 14),
  },
  {
    id: "stretch-labels-5",
    intensity: "stretch",
    family: "labels",
    cooperative: true,
    text: "Complete tasks from 5 different labels.",
    rule: "labels:5",
    isFeasible: hasLabels,
    evaluate: (context) => evaluateLabels(context, 5),
  },
  {
    id: "stretch-deadline-4",
    intensity: "stretch",
    family: "deadline",
    cooperative: true,
    text: "Complete 4 tasks before their deadlines.",
    rule: "deadline:4",
    isFeasible: hasDueDates,
    evaluate: (context) => evaluateDeadline(context, 4),
  },
  {
    id: "stretch-weekend-both",
    intensity: "stretch",
    family: "weekend",
    cooperative: true,
    text: "Each player completes at least one weekend task.",
    rule: "weekend-both",
    isFeasible: () => true,
    evaluate: (context, store) => evaluateWeekendBoth(context, store),
  },
  {
    id: "stretch-routine-9",
    intensity: "stretch",
    family: "routine",
    cooperative: false,
    text: "One player completes 9 tasks during the week.",
    rule: "one-player-tasks:9",
    isFeasible: () => true,
    evaluate: (context) => evaluateOnePlayerTaskCount(context, 9),
  },
  {
    id: "stretch-support-days",
    intensity: "stretch",
    family: "support",
    cooperative: true,
    text: "Both complete tasks on 5 separate days and send encouragements during the week.",
    rule: "support-days",
    isFeasible: () => true,
    evaluate: (context, store) => {
      const senders = new Set(context.encouragementsThisWeek.map((item) => item.fromId));
      return context.sharedDays.length >= 5 && playersIn(store).every((player) => senders.has(player.id)) ? playerIds(store) : [];
    },
  },
  {
    id: "stretch-focus-12",
    intensity: "stretch",
    family: "focus",
    cooperative: false,
    text: "Complete 12 tasks during the week.",
    rule: "tasks:12",
    isFeasible: () => true,
    evaluate: (context) => evaluateTaskThreshold(context, 12),
  },
  {
    id: "stretch-endurance-18",
    intensity: "stretch",
    family: "endurance",
    cooperative: true,
    text: "Complete 18 tasks together during the week.",
    rule: "tasks:18",
    isFeasible: () => true,
    evaluate: (context) => evaluateTaskThreshold(context, 18),
  },
];

function parseSuggestionToTemplate(text: string, intensity: BingoSuggestion["intensity"]): BingoTemplate | null {
  const cleaned = sanitizeSuggestionText(text);
  let match = cleaned.match(/^complete (\d+) tasks together during the week\.?$/i);
  if (match) {
    const amount = Number(match[1]);
    return {
      id: `suggest-task-${cleaned.toLowerCase()}`,
      intensity: intensity === "undecided" ? "medium" : intensity,
      family: "task-count",
      cooperative: true,
      text: `Complete ${amount} tasks together during the week.`,
      rule: `tasks:${amount}`,
      isFeasible: () => true,
      evaluate: (context) => evaluateTaskThreshold(context, amount),
    };
  }
  match = cleaned.match(/^earn (\d+) productive coins together during the week\.?$/i);
  if (match) {
    const amount = Number(match[1]);
    return {
      id: `suggest-coins-${cleaned.toLowerCase()}`,
      intensity: intensity === "undecided" ? "medium" : intensity,
      family: "coins",
      cooperative: true,
      text: `Earn ${amount} productive coins together during the week.`,
      rule: `coins:${amount}`,
      isFeasible: () => true,
      evaluate: (context, store) => evaluateCoinThreshold(context, amount, store),
    };
  }
  match = cleaned.match(/^complete tasks on (\d+) separate days\.?$/i);
  if (match) {
    const amount = Number(match[1]);
    return {
      id: `suggest-days-${cleaned.toLowerCase()}`,
      intensity: intensity === "undecided" ? "medium" : intensity,
      family: "consistency",
      cooperative: true,
      text: `Complete tasks on ${amount} separate days.`,
      rule: `days:${amount}`,
      isFeasible: () => true,
      evaluate: (context) => evaluateSeparateDays(context, amount),
    };
  }
  if (/^both send an encouragement during the week\.?$/i.test(cleaned)) {
    return {
      id: `suggest-encouragement-${cleaned.toLowerCase()}`,
      intensity: intensity === "undecided" ? "light" : intensity,
      family: "encouragement",
      cooperative: true,
      text: "Both send an encouragement during the week.",
      rule: "both-encouragement",
      isFeasible: () => true,
      evaluate: (context, store) => evaluateBothEncouragements(context, store),
    };
  }
  if (/^complete one someday task\.?$/i.test(cleaned)) {
    return {
      id: `suggest-someday-${cleaned.toLowerCase()}`,
      intensity: intensity === "undecided" ? "light" : intensity,
      family: "recovery",
      cooperative: false,
      text: "Complete one Someday task.",
      rule: "someday",
      isFeasible: () => true,
      evaluate: (context) => evaluateSomedayTask(context),
    };
  }
  return null;
}

function buildBingoContext(store: RoomStore, weekStart: string): BingoMetricContext {
  const weekEnd = addDays(weekStart, 6);
  const tasks = store.quests.filter(
    (quest) =>
      quest.status === "completed" &&
      quest.completedAt &&
      quest.completedAt.slice(0, 10) >= weekStart &&
      quest.completedAt.slice(0, 10) <= weekEnd,
  );
  const tasksByPlayer = new Map<string, Quest[]>();
  const coinsByPlayer = new Map<string, number>();
  const labels = new Set<string>();
  const weekendOwners = new Set<string>();
  const sameDayPairs = new Set<string>();
  const dueTasksCompletedOnTime: Quest[] = [];
  const somedayTasks: Quest[] = [];
  const rewardAssignedByBuddy: Quest[] = [];
  const dateOwners = new Map<string, Set<string>>();
  const productiveTransactions = store.transactions.filter(
    (transaction) =>
      transaction.kind === "quest" &&
      transaction.amount > 0 &&
      !String(transaction.sourceId ?? "").endsWith(":stolen") &&
      transaction.createdAt.slice(0, 10) >= weekStart &&
      transaction.createdAt.slice(0, 10) <= weekEnd,
  );

  for (const player of playersIn(store)) {
    tasksByPlayer.set(player.id, []);
    coinsByPlayer.set(player.id, 0);
  }

  for (const task of tasks) {
    const day = task.completedAt?.slice(0, 10);
    if (!day) continue;
    tasksByPlayer.set(task.ownerId, [...(tasksByPlayer.get(task.ownerId) ?? []), task]);
    if (task.labelId) labels.add(task.labelId);
    if ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) weekendOwners.add(task.ownerId);
    if (task.dueDate && day <= task.dueDate) dueTasksCompletedOnTime.push(task);
    if (!task.dueDate) somedayTasks.push(task);
    if (task.rewardAssignedBy && task.rewardAssignedBy !== task.ownerId) rewardAssignedByBuddy.push(task);
    const owners = dateOwners.get(day) ?? new Set<string>();
    owners.add(task.ownerId);
    dateOwners.set(day, owners);
  }

  for (const transaction of productiveTransactions) {
    coinsByPlayer.set(transaction.playerId, (coinsByPlayer.get(transaction.playerId) ?? 0) + transaction.amount);
  }

  for (const [day, owners] of dateOwners.entries()) {
    if (owners.size >= 2) sameDayPairs.add(day);
  }

  const encouragementsThisWeek = store.encouragements.filter(
    (item) => item.createdAt.slice(0, 10) >= weekStart && item.createdAt.slice(0, 10) <= weekEnd,
  );

  return {
    tasks,
    tasksByPlayer,
    taskDates: tasks.map((task) => task.completedAt?.slice(0, 10) ?? "").filter(Boolean),
    sharedDays: [...sameDayPairs],
    coinsByPlayer,
    totalCoins: productiveTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    completedSubtasks: tasks.reduce(
      (sum, task) => sum + (task.subtasks ?? []).filter((subtask) => subtask.completed).length,
      0,
    ),
    labels,
    weekendOwners,
    dueTasksCompletedOnTime,
    sameDayPairs: [...sameDayPairs],
    somedayTasks,
    rewardAssignedByBuddy,
    encouragementsThisWeek,
  };
}

function bingoBoardFor(store: RoomStore, weekStart: string) {
  const existing = store.bingoBoards.find((board) => board.weekStart === weekStart);
  if (existing) return existing;

  const recentTexts = new Set(
    store.bingoBoards
      .filter((board) => board.weekStart < weekStart)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 4)
      .flatMap((board) => board.squares.map((square) => square.text)),
  );
  const suggestionTemplates = shuffle(
    store.bingoSuggestions
      .filter((item) => item.weekStart === weekStart)
      .map((item) => parseSuggestionToTemplate(item.text, item.intensity))
      .filter((item): item is BingoTemplate => Boolean(item))
      .filter((template) => !recentTexts.has(template.text)),
    stableNumber(`${store.room.id}:${weekStart}:suggestions`),
  ).slice(0, 3);

  const pool = shuffle(
    [...bingoTemplates, ...suggestionTemplates].filter((template) => template.isFeasible(store)),
    stableNumber(`${store.room.id}:${weekStart}:pool`),
  );
  const desiredIntensity: BingoTemplate["intensity"][] = [
    "light",
    "light",
    "light",
    "medium",
    "medium",
    "medium",
    "medium",
    "medium",
    "medium",
    "medium",
    "medium",
    "stretch",
    "stretch",
    "stretch",
    "stretch",
    "stretch",
  ];
  const chosen: BingoTemplate[] = [];
  const familyCounts = new Map<string, number>();

  const pickNext = (intensity: BingoTemplate["intensity"]) => {
    const candidate = pool.find((template) => {
      if (template.intensity !== intensity) return false;
      if (chosen.some((item) => item.id === template.id)) return false;
      if ((familyCounts.get(template.family) ?? 0) >= 2) return false;
      if (recentTexts.has(template.text)) return false;
      return true;
    });
    if (!candidate) {
      return pool.find((template) => {
        if (chosen.some((item) => item.id === template.id)) return false;
        if ((familyCounts.get(template.family) ?? 0) >= 2) return false;
        return true;
      });
    }
    return candidate;
  };

  for (const intensity of desiredIntensity) {
    const candidate = pickNext(intensity);
    if (!candidate) break;
    chosen.push(candidate);
    familyCounts.set(candidate.family, (familyCounts.get(candidate.family) ?? 0) + 1);
  }

  const cooperativeCount = chosen.filter((template) => template.cooperative).length;
  if (cooperativeCount < 6) {
    for (const candidate of pool.filter((template) => template.cooperative)) {
      if (chosen.some((item) => item.id === candidate.id)) continue;
      const replaceIndex = chosen.findIndex((item) => !item.cooperative && (familyCounts.get(candidate.family) ?? 0) < 2);
      if (replaceIndex < 0) continue;
      familyCounts.set(chosen[replaceIndex].family, Math.max(0, (familyCounts.get(chosen[replaceIndex].family) ?? 1) - 1));
      chosen[replaceIndex] = candidate;
      familyCounts.set(candidate.family, (familyCounts.get(candidate.family) ?? 0) + 1);
      if (chosen.filter((template) => template.cooperative).length >= 6) break;
    }
  }

  const squares = shuffle(chosen.slice(0, 16), stableNumber(`${store.room.id}:${weekStart}:board`)).map((template, index) => ({
    id: `${weekStart}-${index + 1}`,
    text: template.text,
    intensity: template.intensity,
    family: template.family,
    rule: template.rule,
    completed: false,
    completedAt: null,
    contributorIds: [],
  }));

  const board: BingoBoard = {
    weekStart,
    weekLabel: formatWeekLabel(weekStart),
    status: "past",
    unlockDate: null,
    squares,
    lineCount: 0,
    lineBonusAwarded: false,
    threeLineBonusAwarded: false,
    fullBoardBonusAwarded: false,
  };
  store.bingoBoards.push(board);
  return board;
}

function evaluateBingo(store: RoomStore, board: BingoBoard) {
  const context = buildBingoContext(store, board.weekStart);
  const templateLookup = new Map(bingoTemplates.map((template) => [template.rule, template]));
  for (const suggestion of store.bingoSuggestions.filter((item) => item.weekStart === board.weekStart)) {
    const parsed = parseSuggestionToTemplate(suggestion.text, suggestion.intensity);
    if (parsed) templateLookup.set(parsed.rule, parsed);
  }

  for (const square of board.squares) {
    if (square.completed) continue;
    const template = templateLookup.get(square.rule);
    if (!template) continue;
    const contributors = template.evaluate(context, store);
    if (contributors.length > 0) {
      square.completed = true;
      square.completedAt = now();
      square.contributorIds = [...new Set(contributors)];
    }
  }

  board.lineCount = lineIndexes.filter((line) => line.every((index) => board.squares[index]?.completed)).length;

  const award = (key: "lineBonusAwarded" | "threeLineBonusAwarded" | "fullBoardBonusAwarded", amount: number) => {
    if (board[key]) return;
    for (const player of playersIn(store)) {
      if (store.transactions.some((transaction) => transaction.sourceId === `bingo:${board.weekStart}:${key}:${player.id}`)) continue;
      store.transactions.push({
        id: randomUUID(),
        playerId: player.id,
        amount,
        kind: "bonus",
        label: `Bingo bonus: ${amount} coins`,
        sourceId: `bingo:${board.weekStart}:${key}:${player.id}`,
        createdAt: now(),
      });
    }
    board[key] = true;
  };

  if (board.lineCount >= 1) award("lineBonusAwarded", 10);
  if (board.lineCount >= 3) award("threeLineBonusAwarded", 20);
  if (board.squares.every((square) => square.completed)) award("fullBoardBonusAwarded", 40);
  syncBalances(store);
}

function updateBingo(store: RoomStore) {
  const currentWeek = mondayOf(today());
  const board = bingoBoardFor(store, currentWeek);
  board.status = "active";
  evaluateBingo(store, board);
}

function gameState(store: RoomStore) {
  syncBalances(store);
  updateBingo(store);
  updateChallenges(store);
  syncBalances(store);
  const current = today();
  const monday = mondayOf(current);
  const day = new Date(`${current}T12:00:00Z`).getUTCDay();
  return {
    room: store.room,
    players: playersIn(store),
    quests: store.quests.map((quest) => ({
      ...quest,
      labelId: quest.labelId ?? null,
      rewardStatus: quest.rewardStatus ?? (quest.coinValue == null ? "pending" : "assigned"),
      rewardAssignedBy: quest.rewardAssignedBy ?? null,
      coinsAwarded: quest.coinsAwarded ?? Boolean(
        store.transactions.some((transaction) => transaction.kind === "quest" && transaction.sourceId === quest.id),
      ),
      links: quest.links ?? [],
      subtasks: quest.subtasks ?? [],
      stolenCoins: quest.stolenCoins ?? 0,
      stolenBy: quest.stolenBy ?? null,
    })),
    rewards: store.rewards,
    encouragements: store.encouragements,
    transactions: [...store.transactions].reverse(),
    redemptions: [...store.redemptions].reverse(),
    labels: store.labels ?? [],
    rewardRequests: [...(store.rewardRequests ?? [])].reverse(),
    challenges: [...(store.challenges ?? [])]
      .map((challenge) => ({
        ...challenge,
        progressCoins: challengeProgressCoins(store, challenge),
      }))
      .reverse(),
    currentLevel: 1,
    weekLabel: formatWeekLabel(monday),
    daysRemaining: Math.max(0, 7 - (day === 0 ? 7 : day)),
  };
}

function seedStore(room: Room): RoomStore {
  return {
    room,
    quests: [],
    rewards: [],
    encouragements: [],
    transactions: [],
    redemptions: [],
    labels: [],
    rewardRequests: [],
    challenges: [],
    bingoBoards: [],
    bingoSuggestions: [],
  };
}

function parseCreateChallengeBody(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("Challenge details are required.");
  }
  const body = input as Record<string, unknown>;
  const type = requiredString(body, "type");
  const challengerId = requiredString(body, "challengerId");
  const recipientId = requiredString(body, "recipientId");
  const description = optionalTrimmedString(body, "description");

  if (type === "task") {
    return {
      type,
      challengerId,
      recipientId,
      title: requiredString(body, "title"),
      description,
      rewardCoins: requiredPositiveNumber(body, "rewardCoins"),
      dueDate: requiredDate(body, "dueDate"),
    } as const;
  }

  if (type === "coin") {
    return {
      type,
      challengerId,
      recipientId,
      title: "Coin goal challenge",
      description,
      rewardTitle: requiredString(body, "rewardTitle"),
      targetCoins: requiredPositiveNumber(body, "targetCoins"),
      endDate: requiredDate(body, "endDate"),
    } as const;
  }

  throw new Error("Unsupported challenge type.");
}

function parseChallengeResponseBody(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("Challenge response is required.");
  }
  const body = input as Record<string, unknown>;
  const actorId = requiredString(body, "actorId");
  const action = requiredString(body, "action");
  const targetCoins =
    body.targetCoins === undefined ? undefined : requiredPositiveNumber(body, "targetCoins");
  return { actorId, action, targetCoins };
}

const router: IRouter = Router();

router.use(requireSupabaseUser);

router.get("/me/room", async (req: AuthenticatedRequest, res, next) => {
  try {
    const roomId = await findQuestRoomForUser(req.authUserId!);
    res.json({ roomId });
  } catch (error) {
    next(error);
  }
});

router.use("/rooms/:roomRef", async (req: AuthenticatedRequest, res, next) => {
  try {
    const roomRef = Array.isArray(req.params.roomRef) ? req.params.roomRef[0] : req.params.roomRef;
    if (!roomRef) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const stored = await loadQuestRoom(roomRef);
    if (!stored) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const store = stored.state as unknown as RoomStore;
    const isJoin = req.method === "POST" && req.path === "/join";
    const isInviteRead = req.method === "GET" && req.path === "/";
    if (!isJoin && !isInviteRead && !playerIn(store.room, req.authUserId ?? "")) {
      res.status(403).json({ error: "This room belongs to the two invited players." });
      return;
    }
    const actorKeys = ["actorId", "ownerId", "playerId", "createdBy", "fromId", "challengerId", "requesterId"];
    for (const key of actorKeys) {
      if (req.body?.[key] !== undefined && req.body[key] !== req.authUserId) {
        res.status(403).json({ error: "You can only act as your own account." });
        return;
      }
    }
    rooms.set(store.room.id, store);
    rooms.set(roomRef, store);
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      void saveQuestRoom(store as unknown as Parameters<typeof saveQuestRoom>[0])
        .then(() => originalJson(body))
        .catch((error: unknown) => next(error));
      return res;
    }) as typeof res.json;
    next();
  } catch (error) {
    next(error);
  }
});

router.post("/rooms", async (req: AuthenticatedRequest, res, next) => {
  const body = CreateRoomBody.parse(req.body);
  const host = makePlayer(body.playerName, playerColors[0], req.authUserId);
  const room: Room = {
    id: randomUUID(),
    code: makeCode(),
    name: body.name.trim(),
    status: "waiting",
    host,
    guest: null,
    createdAt: now(),
  };
  const store = seedStore(room);
  try {
    await createQuestRoom(store as unknown as Parameters<typeof createQuestRoom>[0]);
    rooms.set(room.id, store);
    res.status(201).json(CreateRoomResponse.parse(room));
  } catch (error) {
    next(error);
  }
});

router.get("/rooms/:roomId", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(GetRoomResponse.parse(store.room));
});

router.post("/rooms/:roomId/join", (req, res) => {
  const store = storeForRoomRef(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = JoinRoomBody.parse(req.body);
  if (store.room.code !== body.code.trim().toUpperCase()) {
    res.status(400).json({ error: "That invite code is not correct." });
    return;
  }
  if (store.room.guest) {
    res.status(400).json({ error: "This room already has two players." });
    return;
  }
  if (store.room.host.id === (req as AuthenticatedRequest).authUserId) {
    res.status(400).json({ error: "Use a different account to join your room." });
    return;
  }
  store.room.guest = makePlayer(body.playerName, playerColors[1], (req as AuthenticatedRequest).authUserId);
  store.room.status = "playing";
  res.json(JoinRoomResponse.parse(store.room));
});

router.get("/rooms/:roomId/state", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(GetGameStateResponse.parse(gameState(store)));
});

router.get("/rooms/:roomId/bingo/:weekStart", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const currentWeek = mondayOf(today());
  const selectedWeek = req.params.weekStart;
  if (selectedWeek > currentWeek) {
    res.json(
      GetBingoBoardResponse.parse({
        weekStart: selectedWeek,
        weekLabel: formatWeekLabel(selectedWeek),
        status: "locked",
        unlockDate: selectedWeek,
        squares: [],
        lineCount: 0,
        lineBonusAwarded: false,
        threeLineBonusAwarded: false,
        fullBoardBonusAwarded: false,
      }),
    );
    return;
  }
  updateBingo(store);
  const board = bingoBoardFor(store, selectedWeek);
  board.status = selectedWeek === currentWeek ? "active" : "past";
  res.json(GetBingoBoardResponse.parse(board));
});

router.post("/rooms/:roomId/bingo/:weekStart/squares/:squareId/complete", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const playerId = typeof req.body?.playerId === "string" ? req.body.playerId : "";
  const currentWeek = mondayOf(today());
  if (req.params.weekStart !== currentWeek) {
    res.status(400).json({ error: "Only the active weekly Bingo board can be marked complete." });
    return;
  }
  if (!playerIn(store.room, playerId)) {
    res.status(403).json({ error: "That player is not in this room." });
    return;
  }

  updateBingo(store);
  const board = bingoBoardFor(store, currentWeek);
  board.status = "active";
  const square = board.squares.find((item) => item.id === req.params.squareId);
  if (!square) {
    res.status(404).json({ error: "Bingo square not found." });
    return;
  }

  if (!square.contributorIds.includes(playerId)) {
    square.completed = true;
    square.completedAt = square.completedAt ?? now();
    square.contributorIds = [...square.contributorIds, playerId];
  }
  evaluateBingo(store, board);
  res.json(GetBingoBoardResponse.parse(board));
});

router.post("/rooms/:roomId/bingo/suggestions", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = SuggestBingoSquareBody.parse(req.body);
  if (!playerIn(store.room, body.playerId)) {
    res.status(403).json({ error: "That player is not in this room." });
    return;
  }
  const nextWeek = addDays(mondayOf(today()), 7);
  const suggestion: BingoSuggestion = {
    id: randomUUID(),
    playerId: body.playerId,
    text: sanitizeSuggestionText(body.text),
    intensity: body.intensity ?? "undecided",
    weekStart: nextWeek,
    createdAt: now(),
  };
  store.bingoSuggestions.push(suggestion);
  res.status(201).json(SuggestBingoSquareResponse.parse(suggestion));
});

router.post("/rooms/:roomId/quests", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = CreateQuestBody.parse(req.body);
  if (!playerIn(store.room, body.ownerId)) {
    res.status(403).json({ error: "That player is not in this room." });
    return;
  }
  const quest: Quest = {
    id: randomUUID(),
    ownerId: body.ownerId,
    title: body.title.trim(),
    notes: body.notes?.trim() || null,
    dueDate: dateValue(body.dueDate) ?? null,
    labelId: body.labelId ?? null,
    status: "planned",
    coinValue: null,
    rewardStatus: "pending",
    rewardAssignedBy: null,
    coinsAwarded: false,
    links: body.links ?? [],
    subtasks: body.subtasks ?? [],
    stolenCoins: 0,
    stolenBy: null,
    xpValue: 25,
    completedAt: null,
    createdAt: now(),
  };
  store.quests.push(quest);
  res.status(201).json(CreateQuestResponse.parse(quest));
});

router.patch("/rooms/:roomId/quests/:questId", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = UpdateQuestBody.parse(req.body);
  const quest = store.quests.find((item) => item.id === req.params.questId);
  if (!quest || quest.ownerId !== body.ownerId) {
    res.status(404).json({ error: "Quest not found or not yours." });
    return;
  }
  Object.assign(quest, {
    title: body.title?.trim() ?? quest.title,
    notes: body.notes?.trim() || null,
    dueDate: body.dueDate === undefined ? quest.dueDate : dateValue(body.dueDate) ?? null,
    labelId: body.labelId === undefined ? quest.labelId : body.labelId ?? null,
    links: body.links === undefined ? quest.links : body.links,
    subtasks: body.subtasks === undefined ? quest.subtasks : body.subtasks,
  });
  res.json(UpdateQuestResponse.parse(quest));
});

router.delete("/rooms/:roomId/quests/:questId", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const ownerId = String(req.query.ownerId ?? "");
  const index = store.quests.findIndex((item) => item.id === req.params.questId && item.ownerId === ownerId);
  if (index < 0) {
    res.status(404).json({ error: "Quest not found or not yours." });
    return;
  }
  store.quests.splice(index, 1);
  res.status(204).send();
});

router.post("/rooms/:roomId/quests/:questId/complete", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = SetQuestCompletedBody.parse(req.body);
  const quest = store.quests.find((item) => item.id === req.params.questId);
  if (!quest || quest.ownerId !== body.ownerId) {
    res.status(404).json({ error: "Quest not found or not yours." });
    return;
  }
  const wasCompleted = quest.status === "completed";
  const completionTime = now();
  quest.status = body.completed ? "completed" : "planned";
  quest.completedAt = body.completed ? completionTime : null;
  if (!body.completed) {
    quest.coinsAwarded = false;
  }
  if (body.completed && !wasCompleted && quest.coinValue !== null && !quest.coinsAwarded) {
    store.transactions.push({
      id: randomUUID(),
      playerId: quest.ownerId,
      amount: Math.max(0, quest.coinValue - (quest.stolenCoins ?? 0)),
      kind: "quest",
      label: `Completed: ${quest.title}`,
      sourceId: quest.id,
      createdAt: quest.completedAt ?? completionTime,
    });
    quest.coinsAwarded = true;
  }
  syncBalances(store);
  res.json(SetQuestCompletedResponse.parse(quest));
});

router.post("/rooms/:roomId/quests/:questId/reward", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = SetQuestRewardBody.parse(req.body);
  const quest = store.quests.find((item) => item.id === req.params.questId);
  if (!quest || !playerIn(store.room, body.actorId) || quest.ownerId === body.actorId) {
    res.status(403).json({ error: "Only the other player can set this reward." });
    return;
  }
  if (quest.rewardStatus === "assigned") {
    res.status(400).json({ error: "This quest already has a reward." });
    return;
  }
  quest.coinValue = body.coinValue;
  quest.rewardStatus = "assigned";
  quest.rewardAssignedBy = body.actorId;
  if (quest.status === "completed" && !quest.coinsAwarded) {
    store.transactions.push({
      id: randomUUID(),
      playerId: quest.ownerId,
      amount: Math.max(0, body.coinValue - (quest.stolenCoins ?? 0)),
      kind: "quest",
      label: `Completed: ${quest.title}`,
      sourceId: quest.id,
      createdAt: quest.completedAt ?? now(),
    });
    quest.coinsAwarded = true;
  }
  syncBalances(store);
  res.json(SetQuestRewardResponse.parse(quest));
});

router.post("/rooms/:roomId/quests/:questId/steal", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = StealQuestRewardBody.parse(req.body);
  const quest = store.quests.find((item) => item.id === req.params.questId);
  if (!quest || !playerIn(store.room, body.actorId) || quest.ownerId === body.actorId) {
    res.status(403).json({ error: "Only the other player can steal this reward." });
    return;
  }
  if (!quest.dueDate || quest.status === "completed" || quest.coinValue === null || quest.rewardStatus !== "assigned") {
    res.status(400).json({ error: "This quest is not eligible for stealing." });
    return;
  }
  const overdueAt = new Date(`${quest.dueDate}T23:59:59Z`).getTime() + 48 * 60 * 60 * 1000;
  if (Date.now() < overdueAt || (quest.stolenCoins ?? 0) > 0) {
    res.status(400).json({ error: "A reward can only be stolen after 48 hours overdue." });
    return;
  }
  const amount = Math.floor(quest.coinValue / 2);
  if (amount < 1) {
    res.status(400).json({ error: "This reward is too small to split." });
    return;
  }
  quest.stolenCoins = amount;
  quest.stolenBy = body.actorId;
  store.transactions.push({
    id: randomUUID(),
    playerId: body.actorId,
    amount,
    kind: "quest",
    label: `Stole overdue reward: ${quest.title}`,
    sourceId: `${quest.id}:stolen`,
    createdAt: now(),
  });
  syncBalances(store);
  res.json(quest);
});

router.post("/rooms/:roomId/encouragements", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = CreateEncouragementBody.parse(req.body);
  if (!playerIn(store.room, body.fromId) || !playerIn(store.room, body.toId)) {
    res.status(403).json({ error: "Both players must be in this room." });
    return;
  }
  const encouragement: Encouragement = {
    id: randomUUID(),
    fromId: body.fromId,
    toId: body.toId,
    message: body.message.trim(),
    createdAt: now(),
  };
  store.encouragements.push(encouragement);
  res.status(201).json(CreateEncouragementResponse.parse(encouragement));
});

router.post("/rooms/:roomId/labels", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = CreateLabelBody.parse(req.body);
  if (!playerIn(store.room, body.ownerId)) {
    res.status(403).json({ error: "That player is not in this room." });
    return;
  }
  const label: Label = {
    id: randomUUID(),
    ownerId: body.ownerId,
    name: body.name.trim(),
    color: body.color,
    createdAt: now(),
  };
  store.labels.push(label);
  res.status(201).json(label);
});

router.patch("/rooms/:roomId/labels/:labelId", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = UpdateLabelBody.parse(req.body);
  const label = store.labels.find((item) => item.id === req.params.labelId && item.ownerId === body.ownerId);
  if (!label) {
    res.status(404).json({ error: "Label not found or not yours." });
    return;
  }
  if (body.name !== undefined) label.name = body.name.trim();
  if (body.color !== undefined) label.color = body.color;
  res.json(label);
});

router.delete("/rooms/:roomId/labels/:labelId", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = DeleteLabelBody.parse(req.body);
  const index = store.labels.findIndex((item) => item.id === req.params.labelId && item.ownerId === body.ownerId);
  if (index < 0) {
    res.status(404).json({ error: "Label not found or not yours." });
    return;
  }
  store.labels.splice(index, 1);
  for (const quest of store.quests) {
    if (quest.labelId === req.params.labelId) quest.labelId = null;
  }
  res.status(204).send();
});

router.post("/rooms/:roomId/rewards", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = CreateRewardBody.parse(req.body);
  if (!playerIn(store.room, body.createdBy)) {
    res.status(403).json({ error: "That player is not in this room." });
    return;
  }
  const reward: Reward = {
    id: randomUUID(),
    title: body.title.trim(),
    description: body.description?.trim() || null,
    emoji: body.emoji?.trim() || "gift",
    cost: body.cost,
    createdBy: body.createdBy,
    active: true,
    createdAt: now(),
  };
  store.rewards.push(reward);
  res.status(201).json(CreateRewardResponse.parse(reward));
});

router.patch("/rooms/:roomId/rewards/:rewardId", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = UpdateRewardBody.parse(req.body);
  if (!playerIn(store.room, body.actorId)) {
    res.status(403).json({ error: "That player is not in this room." });
    return;
  }
  const reward = store.rewards.find((item) => item.id === req.params.rewardId);
  if (!reward || !reward.active) {
    res.status(404).json({ error: "Reward not found." });
    return;
  }
  if (body.title !== undefined) reward.title = body.title.trim();
  if (body.description !== undefined) reward.description = body.description?.trim() || null;
  if (body.cost !== undefined) reward.cost = body.cost;
  res.json(reward);
});

router.delete("/rooms/:roomId/rewards/:rewardId", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = DeleteRewardBody.parse(req.body);
  if (!playerIn(store.room, body.actorId)) {
    res.status(403).json({ error: "That player is not in this room." });
    return;
  }
  const reward = store.rewards.find((item) => item.id === req.params.rewardId);
  if (!reward || !reward.active) {
    res.status(404).json({ error: "Reward not found." });
    return;
  }
  reward.active = false;
  res.status(204).send();
});

router.post("/rooms/:roomId/rewards/:rewardId/redeem", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = RedeemRewardBody.parse(req.body);
  const reward = store.rewards.find((item) => item.id === req.params.rewardId);
  const player = playerFor(store, body.playerId);
  if (!reward || !player || !reward.active) {
    res.status(400).json({ error: "Reward unavailable." });
    return;
  }
  syncBalances(store);
  if (player.coins < reward.cost) {
    res.status(400).json({ error: "Earn a few more coins to unlock this." });
    return;
  }
  const redemption: Redemption = {
    id: randomUUID(),
    rewardId: reward.id,
    rewardTitle: reward.title,
    playerId: player.id,
    providerId: reward.createdBy,
    cost: reward.cost,
    redeemedAt: now(),
    sourceType: "standard",
    completedAt: null,
    completedById: null,
    sourceRequestId: null,
    sourceChallengeId: null,
  };
  store.redemptions.push(redemption);
  store.transactions.push({
    id: randomUUID(),
    playerId: player.id,
    amount: -reward.cost,
    kind: "reward",
    label: `Bought reward: ${reward.title}`,
    sourceId: `${redemption.id}:purchase`,
    createdAt: redemption.redeemedAt,
  });
  syncBalances(store);
  res.status(201).json(RedeemRewardResponse.parse(redemption));
});

router.post("/rooms/:roomId/redemptions/:redemptionId/complete", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const actorId = String(req.body?.actorId ?? "");
  const redemption = store.redemptions.find((item) => item.id === req.params.redemptionId);
  if (!redemption || !playerIn(store.room, actorId)) {
    res.status(404).json({ error: "Reward purchase not found." });
    return;
  }
  if (redemption.providerId !== actorId) {
    res.status(403).json({ error: "Only the provider can mark this reward as done." });
    return;
  }
  if (!redemption.completedAt) {
    redemption.completedAt = now();
    redemption.completedById = actorId;
  }
  res.json(redemption);
});

router.post("/rooms/:roomId/challenges", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  try {
    const body = parseCreateChallengeBody(req.body);
    if (
      !playerIn(store.room, body.challengerId) ||
      !playerIn(store.room, body.recipientId) ||
      body.challengerId === body.recipientId
    ) {
      res.status(400).json({ error: "Choose the other player for this challenge." });
      return;
    }
    if (body.type === "coin" && body.endDate < today()) {
      res.status(400).json({ error: "Choose an end date that is today or later." });
      return;
    }
    if (body.type === "task" && body.dueDate < today()) {
      res.status(400).json({ error: "Choose a deadline that is today or later." });
      return;
    }
    const timestamp = now();
    const challenge: Challenge =
      body.type === "task"
        ? {
            id: randomUUID(),
            type: "task",
            status: "awaiting_response",
            challengerId: body.challengerId,
            recipientId: body.recipientId,
            turnPlayerId: body.recipientId,
            title: body.title,
            description: body.description,
            rewardTitle: null,
            rewardCoins: body.rewardCoins,
            dueDate: body.dueDate,
            targetCoins: null,
            startDate: null,
            endDate: body.dueDate,
            acceptedAt: null,
            completedAt: null,
            unlockedRedemptionId: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          }
        : {
            id: randomUUID(),
            type: "coin",
            status: "awaiting_response",
            challengerId: body.challengerId,
            recipientId: body.recipientId,
            turnPlayerId: body.recipientId,
            title: body.title,
            description: body.description,
            rewardTitle: body.rewardTitle,
            rewardCoins: null,
            dueDate: null,
            targetCoins: body.targetCoins,
            startDate: null,
            endDate: body.endDate,
            acceptedAt: null,
            completedAt: null,
            unlockedRedemptionId: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
    store.challenges.push(challenge);
    res.status(201).json(challenge);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not create challenge." });
  }
});

router.post("/rooms/:roomId/challenges/:challengeId/respond", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const challenge = store.challenges.find((item) => item.id === req.params.challengeId);
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found." });
    return;
  }
  try {
    const body = parseChallengeResponseBody(req.body);
    if (challenge.turnPlayerId !== body.actorId || ["declined", "completed", "succeeded", "failed"].includes(challenge.status)) {
      res.status(400).json({ error: "This challenge is waiting for the other player." });
      return;
    }
    if (body.action === "decline") {
      const finishedAt = now();
      challenge.status = "declined";
      challenge.turnPlayerId = null;
      challenge.completedAt = finishedAt;
      challenge.updatedAt = finishedAt;
      res.json(challenge);
      return;
    }
    if (body.action === "counter") {
      if (challenge.type !== "coin") {
        res.status(400).json({ error: "Only coin goal challenges can be countered." });
        return;
      }
      if (body.targetCoins === undefined) {
        res.status(400).json({ error: "Add a counter target." });
        return;
      }
      challenge.targetCoins = body.targetCoins;
      challenge.status = "countered";
      challenge.turnPlayerId = challenge.turnPlayerId === challenge.challengerId ? challenge.recipientId : challenge.challengerId;
      challenge.updatedAt = now();
      res.json(challenge);
      return;
    }
    if (body.action !== "accept") {
      res.status(400).json({ error: "Unsupported challenge action." });
      return;
    }
    const acceptedAt = now();
    challenge.status = "accepted";
    challenge.turnPlayerId = null;
    challenge.acceptedAt = acceptedAt;
    challenge.updatedAt = acceptedAt;
    if (challenge.type === "coin") {
      challenge.startDate = today();
    }
    res.json(challenge);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not respond to challenge." });
  }
});

router.post("/rooms/:roomId/challenges/:challengeId/complete", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const challenge = store.challenges.find((item) => item.id === req.params.challengeId);
  if (!challenge || challenge.type !== "task") {
    res.status(404).json({ error: "Task challenge not found." });
    return;
  }
  const actorId = String(req.body?.actorId ?? "");
  if (challenge.recipientId !== actorId) {
    res.status(403).json({ error: "Only the recipient can complete this challenge." });
    return;
  }
  if (challenge.status !== "accepted") {
    res.status(400).json({ error: "This challenge is not active." });
    return;
  }
  if (!store.transactions.some((transaction) => transaction.sourceId === `challenge:${challenge.id}:reward`)) {
    store.transactions.push({
      id: randomUUID(),
      playerId: actorId,
      amount: challenge.rewardCoins ?? 0,
      kind: "bonus",
      label: `Completed challenge: ${challenge.title}`,
      sourceId: `challenge:${challenge.id}:reward`,
      createdAt: now(),
    });
  }
  challenge.status = "completed";
  challenge.completedAt = now();
  challenge.updatedAt = challenge.completedAt ?? now();
  syncBalances(store);
  res.json(challenge);
});

router.post("/rooms/:roomId/reward-requests", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = CreateRewardRequestBody.parse(req.body);
  const responder = otherPlayer(store, body.requesterId);
  if (!playerFor(store, body.requesterId) || !responder) {
    res.status(400).json({ error: "Both players must be in the room to negotiate a reward." });
    return;
  }
  const timestamp = now();
  const request: RewardRequest = {
    id: randomUUID(),
    requesterId: body.requesterId,
    responderId: responder.id,
    payerId: body.requesterId,
    turnPlayerId: responder.id,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    offer: body.offer,
    status: "awaiting_response",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.rewardRequests.push(request);
  res.status(201).json(request);
});

router.post("/rooms/:roomId/reward-requests/:requestId/respond", (req, res) => {
  const store = storeFor(req.params.roomId);
  if (!store) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const body = RespondToRewardRequestBody.parse(req.body);
  const request = store.rewardRequests.find((item) => item.id === req.params.requestId);
  if (!request) {
    res.status(404).json({ error: "Reward request not found." });
    return;
  }
  if (body.action === "pay") {
    if (request.status !== "accepted" || body.actorId !== request.payerId) {
      res.status(400).json({ error: "Only the payer can confirm an accepted offer." });
      return;
    }
    if (store.transactions.some((transaction) => transaction.sourceId === `${request.id}:payment`)) {
      res.status(400).json({ error: "This reward has already been paid." });
      return;
    }
    syncBalances(store);
    const payer = playerFor(store, request.payerId);
    if (!payer || payer.coins < request.offer) {
      res.status(400).json({ error: "The payer does not have enough coins to pay this offer." });
      return;
    }
    store.transactions.push({
      id: randomUUID(),
      playerId: request.payerId,
      amount: -request.offer,
      kind: "reward",
      label: `${payer.name} bought ${request.title}`,
      sourceId: `${request.id}:payment`,
      createdAt: now(),
    });
    const redeemedAt = now();
    store.redemptions.push({
      id: randomUUID(),
      rewardId: `request:${request.id}`,
      rewardTitle: request.title,
      playerId: request.payerId,
      providerId: request.responderId,
      cost: request.offer,
      redeemedAt,
      sourceType: "request",
      completedAt: null,
      completedById: null,
      sourceRequestId: request.id,
      sourceChallengeId: null,
    });
    request.status = "paid";
    request.updatedAt = redeemedAt;
    syncBalances(store);
    res.json(request);
    return;
  }
  if (body.actorId !== request.turnPlayerId || ["accepted", "declined", "paid"].includes(request.status)) {
    res.status(400).json({ error: "This reward request is waiting for the other player." });
    return;
  }
  if (body.action === "counter") {
    if (body.offer === undefined) {
      res.status(400).json({ error: "Add a counteroffer amount." });
      return;
    }
    request.offer = body.offer;
    request.status = "countered";
    request.turnPlayerId = request.turnPlayerId === request.requesterId ? request.responderId : request.requesterId;
    request.updatedAt = now();
    res.json(request);
    return;
  }
  if (body.action === "decline") {
    request.status = "declined";
    request.updatedAt = now();
    res.json(request);
    return;
  }
  request.status = "accepted";
  request.turnPlayerId = request.payerId;
  request.updatedAt = now();
  res.json(request);
});

export default router;
