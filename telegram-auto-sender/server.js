import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import { startBot, stopBot } from "./bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.disable("x-powered-by");

const PORT = 5000;
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_GROUP_ID = (process.env.TELEGRAM_GROUP_ID || "").trim();
const ERP_API_URL = (process.env.ERP_API_URL || "").trim();

app.get("/status", (_req, res) => {
  res.status(200).json({ status: "running" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
  startBot({
    token: TELEGRAM_BOT_TOKEN,
    groupId: TELEGRAM_GROUP_ID,
    erpApiUrl: ERP_API_URL,
  });
});

process.on("SIGINT", () => {
  stopBot();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  stopBot();
  server.close(() => process.exit(0));
});
