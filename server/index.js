import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { connectDb } from "./config/db.js";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const port = Number(process.env.PORT || 5000);
const app = createApp();
const retryMs = Number(process.env.DB_RETRY_MS || 5000);

async function connectWithRetry() {
  try {
    await connectDb();
  } catch (error) {
    console.error("DB connect failed, retrying...", error?.message || error);
    setTimeout(connectWithRetry, retryMs);
  }
}

const host = process.env.HOST?.trim() || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`API server running on http://localhost:${port}`);
  console.log(
    `CORS: FRONTEND_ORIGIN=${process.env.FRONTEND_ORIGIN || "(default list)"} FRONTEND_ORIGINS=${process.env.FRONTEND_ORIGINS || ""}`,
  );
});

connectWithRetry();
