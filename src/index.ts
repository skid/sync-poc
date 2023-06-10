import fs from "fs";
import express from "express";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import bodyParser from "body-parser";
import { EventPayload } from "./shared";
import { loadEventsBetween, loadLastState, storeEvent } from "./operations";

const app = express();
let db: Database;

app.get("/", (req, res) => {
  fs.createReadStream("./index.html").pipe(res);
});

app.get("/load", async (req, res) => {
  res.send(await loadLastState(db));
});

app.get("/sync/:version", async (req, res) => {
  res.send({
    status: "success",
    events: await loadEventsBetween(db, parseInt(req.params.version, 10)),
  });
});

app.post("/event", bodyParser.json(), async (req, res) => {
  res.send(await storeEvent(db, req.body as EventPayload));
});

app.use(express.static("./"));

(async () => {
  db = await open({
    filename: "db.db",
    driver: sqlite3.Database,
  });
  process.on("exit", () => {
    db.close();
  });
  app.listen(80, () => {
    console.log("Listening");
  });
})();
