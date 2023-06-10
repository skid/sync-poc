import sqlite from "sqlite3";
const db = new sqlite.Database("db.db");

db.run(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    state TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events (id)
  )
`);

db.close();
