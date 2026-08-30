import { Router, type IRouter } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import {
  CreateEncouragementBody,
  CreateLabelBody,
  CreateQuestBody,
  CreateRewardRequestBody,
  CreateRewardBody,
  CreateRoomBody,
  CreateRewardResponse,
  CreateRoomResponse,
  CreateQuestResponse,
  CreateEncouragementResponse,
  GetGameStateResponse,
  GetRoomResponse,
  JoinRoomBody,
  JoinRoomResponse,
  DeleteLabelBody,
  DeleteRewardBody,
  RedeemRewardBody,
  RedeemRewardResponse,
  RespondToRewardRequestBody,
  SetQuestCompletedResponse,
  SetQuestCompletedBody,
  UpdateLabelBody,
  UpdateQuestBody,
  UpdateQuestResponse,
  UpdateRewardBody,
} from "@workspace/api-zod";

type Player = {
  id: string;
  name: string;
  avatar: string;
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

type Quest = {
  id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  labelId: string | null;
  priority: "small" | "medium" | "major";
  status: "planned" | "completed";
  coinValue: number;
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
  title: string;
  description: string | null;
  offer: number;
  status: "awaiting_response" | "countered" | "accepted" | "declined";
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
  playerId: string;
  cost: number;
  redeemedAt: string;
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
};

const rooms = new Map<string, RoomStore>();
const priorityValues = {
  small: { coins: 10, xp: 25 },
  medium: { coins: 20, xp: 50 },
  major: { coins: 30, xp: 100 },
} as const;

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
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(dateString, offset);
}

function formatWeekLabel(start: string) {
  const end = addDays(start, 6);
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(`${start}T12:00:00Z`))} – ${formatter.format(new Date(`${end}T12:00:00Z`))}`;
}

function makeCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function makePlayer(name: string): Player {
  return {
    id: randomUUID(),
    name: name.trim(),
    avatar: "compass",
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

function playerIn(room: Room, playerId: string) {
  return room.host.id === playerId || room.guest?.id === playerId;
}

function playerFor(store: RoomStore, playerId: string) {
  return store.room.host.id === playerId
    ? store.room.host
    : store.room.guest?.id === playerId
      ? store.room.guest
      : undefined;
}

function otherPlayer(store: RoomStore, playerId: string) {
  return [store.room.host, store.room.guest]
    .filter((player): player is Player => player !== null && player.id !== playerId)[0];
}

function dateValue(value: Date | string | null | undefined) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function syncBalances(store: RoomStore) {
  for (const player of [store.room.host, store.room.guest].filter(Boolean) as Player[]) {
    player.coins = store.transactions
      .filter((transaction) => transaction.playerId === player.id)
      .reduce((total, transaction) => total + transaction.amount, 0);
    player.xp = store.quests
      .filter((quest) => quest.ownerId === player.id && quest.status === "completed")
      .reduce((total, quest) => total + quest.xpValue, 0);
  }
}

function gameState(store: RoomStore) {
  syncBalances(store);
  const current = today();
  const monday = mondayOf(current);
  const day = new Date(`${current}T12:00:00Z`).getUTCDay();
  return {
    room: store.room,
    players: [store.room.host, store.room.guest].filter(Boolean),
    quests: store.quests,
    rewards: store.rewards,
    encouragements: store.encouragements,
    transactions: [...store.transactions].reverse(),
    redemptions: [...store.redemptions].reverse(),
    labels: store.labels ?? [],
    rewardRequests: [...(store.rewardRequests ?? [])].reverse(),
    currentLevel: 1,
    weekLabel: formatWeekLabel(monday),
    daysRemaining: Math.max(0, 7 - (day === 0 ? 7 : day)),
  };
}

function seedStore(room: Room): RoomStore {
  const date = today();
  const first = addDays(date, 0);
  const second = addDays(date, 1);
  return {
    room,
    quests: [
      {
        id: randomUUID(),
        ownerId: room.host.id,
        title: "Choose one brave next step",
        notes: "Keep it small enough to finish today.",
        dueDate: first,
        labelId: null,
        priority: "small",
        status: "planned",
        coinValue: 10,
        xpValue: 25,
        completedAt: null,
        createdAt: now(),
      },
      {
        id: randomUUID(),
        ownerId: room.host.id,
        title: "Make progress on the main quest",
        notes: "A focused 45-minute session counts.",
        dueDate: second,
        labelId: null,
        priority: "medium",
        status: "planned",
        coinValue: 20,
        xpValue: 50,
        completedAt: null,
        createdAt: now(),
      },
    ],
    rewards: [],
    encouragements: [],
    transactions: [],
    redemptions: [],
    labels: [],
    rewardRequests: [],
  };
}

const router: IRouter = Router();

router.post("/rooms", (req, res) => {
  const body = CreateRoomBody.parse(req.body);
  const host = makePlayer(body.playerName);
  const room: Room = {
    id: randomUUID(),
    code: makeCode(),
    name: body.name.trim(),
    status: "waiting",
    host,
    guest: null,
    createdAt: now(),
  };
  rooms.set(room.id, seedStore(room));
  res.status(201).json(CreateRoomResponse.parse(room));
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
  store.room.guest = makePlayer(body.playerName);
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
  const values = priorityValues[body.priority];
  const quest: Quest = {
    id: randomUUID(),
    ownerId: body.ownerId,
    title: body.title.trim(),
    notes: body.notes?.trim() || null,
    dueDate: dateValue(body.dueDate) ?? null,
    labelId: body.labelId ?? null,
    priority: body.priority,
    status: "planned",
    coinValue: values.coins,
    xpValue: values.xp,
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
  const priority = body.priority ?? quest.priority;
  const values = priorityValues[priority];
  Object.assign(quest, {
    title: body.title?.trim() ?? quest.title,
    notes: body.notes?.trim() || null,
    dueDate: body.dueDate === undefined ? quest.dueDate : dateValue(body.dueDate) ?? null,
    labelId: body.labelId === undefined ? quest.labelId : body.labelId ?? null,
    priority,
    coinValue: values.coins,
    xpValue: values.xp,
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
  const index = store.quests.findIndex(
    (item) => item.id === req.params.questId && item.ownerId === ownerId,
  );
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
  quest.status = body.completed ? "completed" : "planned";
  quest.completedAt = body.completed ? now() : null;
  if (body.completed && !wasCompleted) {
    store.transactions.push({
      id: randomUUID(),
      playerId: quest.ownerId,
      amount: quest.coinValue,
      kind: "quest",
      label: `Completed: ${quest.title}`,
      sourceId: quest.id,
      createdAt: now(),
    });
  } else if (!body.completed && wasCompleted) {
    const transactionIndex = store.transactions.findIndex(
      (transaction) =>
        transaction.playerId === quest.ownerId &&
        transaction.kind === "quest" &&
        transaction.sourceId === quest.id,
    );
    if (transactionIndex >= 0) store.transactions.splice(transactionIndex, 1);
  }
  syncBalances(store);
  res.json(SetQuestCompletedResponse.parse(quest));
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
  const label = store.labels.find(
    (item) => item.id === req.params.labelId && item.ownerId === body.ownerId,
  );
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
  const index = store.labels.findIndex(
    (item) => item.id === req.params.labelId && item.ownerId === body.ownerId,
  );
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
    playerId: player.id,
    cost: reward.cost,
    redeemedAt: now(),
  };
  store.redemptions.push(redemption);
  store.transactions.push({
    id: randomUUID(),
    playerId: player.id,
    amount: -reward.cost,
    kind: "reward",
    label: `Redeemed: ${reward.title}`,
    createdAt: now(),
  });
  res.status(201).json(RedeemRewardResponse.parse(redemption));
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
  const expectedActor =
    request.status === "awaiting_response" ? request.responderId :
    request.status === "countered" ? request.requesterId : "";
  if (body.actorId !== expectedActor) {
    res.status(400).json({ error: "This request is waiting for the other player." });
    return;
  }
  if (body.action === "counter") {
    if (!body.offer) {
      res.status(400).json({ error: "Add a counteroffer amount." });
      return;
    }
    request.offer = body.offer;
    request.status = "countered";
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
  syncBalances(store);
  const requester = playerFor(store, request.requesterId);
  if (!requester || requester.coins < request.offer) {
    res.status(400).json({ error: "The requester no longer has enough coins for this offer." });
    return;
  }
  request.status = "accepted";
  request.updatedAt = now();
  store.transactions.push({
    id: randomUUID(),
    playerId: request.requesterId,
    amount: -request.offer,
    kind: "reward",
    label: `Accepted reward: ${request.title}`,
    sourceId: request.id,
    createdAt: now(),
  });
  syncBalances(store);
  res.json(request);
});

export default router;