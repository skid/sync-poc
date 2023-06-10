import { Database } from "sqlite";
import { Event, EventPayload, EventResponse, Snapshot, applyEvent } from "./shared";

/**
 * Loads all events with IDs greater than `low` and less than or equal to `high`.
 * If `high` is 0, it's ignored.
 */
export async function loadEventsBetween(db: Database, low: number, high: number = 0) {
  const params = [low];

  if (high) {
    params.push(high);
  }

  const results = await db.all(
    `
    SELECT *
    FROM events
    WHERE id > ? ${high ? "AND id <= ?" : ""}
    ORDER BY id ASC
  `,
    params
  );

  // Raw results from the db are of the "Event" type
  return results || [];
}

/**
 * Returns the latest document version, which is the last event ID.
 */
export async function getLatestVersion(db: Database) {
  const result = await db.get(`SELECT id FROM events ORDER BY id DESC LIMIT 1`);
  return result.id || 0;
}

/**
 * Loads the latest possible document state.
 * It loads the latest snapshot and all recorded events after it,
 * then applies the events to the snapshot.
 */
export async function loadLastState(db: Database) {
  const result = await db.get(`
    SELECT event_id, state
    FROM snapshots
    ORDER BY event_id DESC LIMIT 1`);

  let snapshot: Snapshot;

  if (!result) {
    snapshot = { version: 0, doc: {} };
  } else {
    snapshot = {
      version: result.event_id,
      doc: JSON.parse(result.state),
    };
  }
  const events = await loadEventsBetween(db, snapshot.version);

  try {
    return { status: "success" as const, snapshot: events.reduce(applyEvent, snapshot) };
  } catch (e: any) {
    return { status: "error" as const, message: e.message || "Unknown Error" };
  }
}

/**
 * Performs simple user input validation.
 * TODO: Use a more structured user input validation.
 */
export function isValidEventPayload(ev: EventPayload) {
  if (typeof ev.version !== "number") {
    return false;
  }
  if (ev.op === "DELETE") {
    return typeof ev.key === "string";
  } else if (ev.op === "UPSERT") {
    return typeof ev.value === "string" && typeof ev.key === "string";
  }
  return false;
}

/**
 * Records a new event in the database - the bread and butter of the app.
 *
 * Normally, it just saves the event in the DB table, obtains the ID and returns
 * back the event to the client so it can be applied to the client's local state.
 *
 * However, it's possible that the document version has evolved in the meantime due to other
 * clients sending events. In this case, we want to do two things:
 *
 * 1. Apply this event to the last reconstructed snapshot
 * 2. Return all the events that the client is missing to
 *    fast-forward the event's version to the latest version
 */
export async function storeEvent(db: Database, input: EventPayload): Promise<EventResponse> {
  if (!isValidEventPayload(input)) {
    return { status: "error", message: "Invalid event payload" };
  }

  let state = await loadLastState(db);
  let freshEvents: Event[] = [];

  if (state.status === "error") {
    return state;
  }

  let { snapshot } = state;
  if (input.version < snapshot.version) {
    freshEvents = await loadEventsBetween(db, input.version, snapshot.version);
  }

  await db.run("BEGIN");
  const result = await db.run(`INSERT INTO events (op, key, value) VALUES (?,?,?)`, [
    input.op,
    input.key,
    input.op === "DELETE" ? "" : input.value,
  ]);

  if (!result.lastID) {
    await db.run("ROLLBACK");
    return { status: "error", message: "Database error" };
  }

  const event = {
    id: result.lastID,
    key: input.key,
    op: input.op,
    value: input.op === "DELETE" ? "" : input.value,
  };

  try {
    snapshot = applyEvent(snapshot, event);
  } catch (e: any) {
    await db.run("ROLLBACK");
    return { status: "error", message: e.message || "Unknown Error" };
  }

  // Save a snapshot
  // TODO: don't use magic numbers
  if (snapshot.version % 5 === 0) {
    await db.run(`INSERT INTO snapshots (event_id, state) VALUES (?,?)`, [
      snapshot.version,
      JSON.stringify(snapshot.doc),
    ]);
  }

  await db.run("COMMIT");
  return { status: "success", events: [...freshEvents, event] };
}
