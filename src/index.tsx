import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Event, EventPayload, EventResponse, Snapshot, applyEvent } from "./shared";

/**
 * Sends a modification event to the server
 */
async function event(op: "UPSERT" | "DELETE", version: number, key: string, value: string = ""): Promise<Event[]> {
  const payload: EventPayload = op === "UPSERT" ? { op, key, value, version } : { op, key, version };
  const response = await fetch("/event", {
    method: "post",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = (await response.json()) as EventResponse;
  if (result.status === "error") {
    alert(result.message);
    return [];
  }

  return result.events;
}

/**
 * We need this hook because naïvely using setInterval
 * will lock onto the initial value of closure variables.
 */
function useInterval(callback: () => any, delay: number) {
  const savedCallback = useRef<() => any>();

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current!();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

/**
 * Renders a single key-value item
 */
const Item = ({ k, snapshot, setSnapshot }: { k: string; snapshot: Snapshot; setSnapshot: (s: Snapshot) => void }) => {
  const [value, setValue] = useState(snapshot.doc[k]);

  const runUpdate = async () => {
    const events = await event("UPSERT", snapshot.version, k, value);
    try {
      setSnapshot(events.reduce(applyEvent, snapshot));
    } catch (e: any) {
      alert(e.message || "Unknown error");
    }
  };

  const runDelete = async () => {
    const events = await event("DELETE", snapshot.version, k);
    try {
      setSnapshot(events.reduce(applyEvent, snapshot));
    } catch (e: any) {
      alert(e.message || "Unknown error");
    }
  };

  return (
    <div id={k} className="item">
      <div className="key">{k}</div>
      <div className="value">
        <textarea value={value} onChange={(e) => setValue(e.currentTarget.value)} />
      </div>
      <div className="controls">
        <button onClick={runUpdate}>UPDATE</button> <button onClick={runDelete}>DELETE</button>
      </div>
    </div>
  );
};

const App = () => {
  const [snapshot, setSnapshot] = useState<Snapshot>({ version: 0, doc: {} });
  const [insertVal, setInsertVal] = useState("");
  const [insertKey, setInsertKey] = useState("");

  // Loads the initial state
  useEffect(() => {
    (async () => {
      const result = await fetch("/load");
      const data = await result.json();

      if (data.status === "error") {
        alert(data.message);
      } else {
        setSnapshot(data.snapshot);
      }
    })();
  }, []);

  // Sets up the polling mechanism
  useInterval(async () => {
    const result = await fetch(`/sync/${snapshot.version}`);
    const data = await result.json();

    if (data.status === "error") {
      alert(data.message);
    } else {
      setSnapshot(data.events.reduce(applyEvent, snapshot));
    }
  }, 5000); // TODO: don't use magic numbers, this should come as config

  const runInsert = async () => {
    if (!insertVal || !insertKey) {
      return;
    }
    const events = await event("UPSERT", snapshot.version, insertKey, insertVal);
    try {
      setSnapshot(events.reduce(applyEvent, snapshot));
      setInsertKey("");
      setInsertVal("");
    } catch (e: any) {
      alert(e.message || "Unknown error");
    }
  };

  return (
    <div className="root">
      <h2>Data Synchronization - Technical Challenge</h2>
      {Object.keys(snapshot.doc)
        .sort()
        .map((k) => (
          <Item key={k + snapshot.doc[k]} k={k} snapshot={snapshot} setSnapshot={setSnapshot} />
        ))}
      <div className="divider">
        <h3>Insert/update record</h3>
      </div>
      <div className="item">
        <div className="key">
          <input
            maxLength={3}
            placeholder="key"
            value={insertKey}
            onChange={(v) => setInsertKey(v.currentTarget.value)}
          />
        </div>
        <div className="value">
          <textarea placeholder="value" value={insertVal} onChange={(v) => setInsertVal(v.currentTarget.value)} />
        </div>
        <div className="controls">
          <button onClick={runInsert}>UPSERT</button>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
