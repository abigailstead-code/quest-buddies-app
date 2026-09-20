import { pool } from "@workspace/db";

type RoomSnapshot = {
  room: {
    id: string;
    code: string;
    name: string;
    status: string;
    host: { id: string; name: string; avatar: string; color: string };
    guest: { id: string; name: string; avatar: string; color: string } | null;
  };
};

type StoredRoom = { state: RoomSnapshot & Record<string, unknown>; roomId: string };

export async function loadQuestRoom(reference: string): Promise<StoredRoom | null> {
  const result = await pool.query<{ room_id: string; state: RoomSnapshot & Record<string, unknown> }>(
    `select s.room_id, s.state
       from quest_room_states s
       join quest_rooms r on r.id = s.room_id
      where s.room_id::text = $1 or r.code = upper($1)
      limit 1`,
    [reference],
  );
  const row = result.rows[0];
  return row ? { roomId: row.room_id, state: row.state } : null;
}

export async function findQuestRoomForUser(userId: string): Promise<string | null> {
  const result = await pool.query<{ room_id: string }>(
    `select m.room_id
       from quest_room_members m
       join quest_room_states s on s.room_id = m.room_id
      where m.user_id = $1
      order by s.updated_at desc
      limit 1`,
    [userId],
  );
  return result.rows[0]?.room_id ?? null;
}

export async function createQuestRoom(state: RoomSnapshot & Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "insert into quest_rooms (id, code, name, status) values ($1, $2, $3, $4)",
      [state.room.id, state.room.code, state.room.name, state.room.status],
    );
    await client.query(
      `insert into quest_profiles (id, display_name, avatar)
       values ($1, $2, $3)
       on conflict (id) do update set display_name = excluded.display_name, avatar = excluded.avatar, updated_at = now()`,
      [state.room.host.id, state.room.host.name, state.room.host.avatar],
    );
    await client.query(
      "insert into quest_room_members (room_id, user_id, role, color) values ($1, $2, 'host', $3)",
      [state.room.id, state.room.host.id, state.room.host.color],
    );
    await client.query("insert into quest_room_states (room_id, state) values ($1, $2::jsonb)", [state.room.id, JSON.stringify(state)]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveQuestRoom(state: RoomSnapshot & Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [state.room.id]);
    await client.query(
      "update quest_rooms set name = $2, status = $3, updated_at = now() where id = $1",
      [state.room.id, state.room.name, state.room.status],
    );
    for (const [role, player] of [["host", state.room.host], ["guest", state.room.guest]] as const) {
      if (!player) continue;
      await client.query(
        `insert into quest_profiles (id, display_name, avatar)
         values ($1, $2, $3)
         on conflict (id) do update set display_name = excluded.display_name, avatar = excluded.avatar, updated_at = now()`,
        [player.id, player.name, player.avatar],
      );
      await client.query(
        `insert into quest_room_members (room_id, user_id, role, color)
         values ($1, $2, $3, $4)
         on conflict (room_id, user_id) do update set role = excluded.role, color = excluded.color`,
        [state.room.id, player.id, role, player.color],
      );
    }
    await client.query(
      "update quest_room_states set state = $2::jsonb, updated_at = now() where room_id = $1",
      [state.room.id, JSON.stringify(state)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
