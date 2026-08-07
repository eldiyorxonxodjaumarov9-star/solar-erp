import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let memoryServer = null;

export async function connectDb() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solar_erp";
  const safeUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
  console.log(`[DB] Connecting to ${safeUri}`);

  mongoose.connection.on("connected", () => {
    console.log("[DB] MongoDB connected");
  });
  mongoose.connection.on("error", (error) => {
    console.error("[DB] MongoDB connection error:", error.message);
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("[DB] MongoDB disconnected");
  });

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
  } catch (error) {
    console.warn("[DB] Primary Mongo unavailable, starting in-memory MongoDB fallback...");
    if (!memoryServer) {
      memoryServer = await MongoMemoryServer.create();
    }
    const memUri = memoryServer.getUri();
    await mongoose.connect(memUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log("[DB] Connected to in-memory MongoDB fallback");
  }

  return mongoose.connection;
}
