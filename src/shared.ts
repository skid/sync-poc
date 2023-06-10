/** The document containing all data */
export type Doc = {
  [key: string]: string;
};

/** A document snapshot, containing a document, and the latest version number */
export type Snapshot = {
  doc: Doc;
  version: number;
};

/** An event payload sent from a client */
export type EventPayload =
  | {
      version: number;
      op: "UPSERT";
      key: string;
      value: string;
    }
  | {
      version: number;
      op: "DELETE";
      key: string;
    };

/** An event read from the database */
export type Event =
  | { op: "UPSERT"; key: string; value: string; id: number }
  | { op: "DELETE"; key: string; id: number };

/** Response from the /event route */
export type EventResponse =
  | {
      status: "success";
      events: Event[];
    }
  | {
      status: "error";
      message: string;
    };

/**
 * Applies an event to a snapshot to obtain a later snapshot version.
 */
export function applyEvent(snapshot: Snapshot, event: Event): Snapshot {
  // Check if the event we're applying comes in order, or reject the operation
  if (snapshot.version + 1 !== event.id) {
    throw new Error(`Can not apply event ${event.id} to snapshot version ${snapshot.version}`);
  }

  const doc = { ...snapshot.doc };
  if (event.op === "UPSERT") {
    doc[event.key] = event.value;
  } else if (event.op === "DELETE") {
    delete doc[event.key];
  }

  return { doc, version: event.id };
}
