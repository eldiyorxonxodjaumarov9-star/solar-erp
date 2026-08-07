import mongoose from "mongoose";

const workerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true, default: "" },
    password: { type: String, required: true },
    role: { type: String, enum: ["usta", "admin"], default: "usta" },
    brigade_id: { type: mongoose.Schema.Types.ObjectId, ref: "Brigade", default: null },
    brigadeId: { type: String, default: "" },
    brigadeName: { type: String, default: "" },
    position: { type: String, default: "" },
    experienceYears: { type: String, default: "" },
    rating: { type: String, default: "" },
    salary: { type: Number, default: 0 },
    dailySalary: { type: Number, default: 0 },
    telegramUserId: { type: String, default: "" },
    telegramUsername: { type: String, default: "" },
    status: { type: String, default: "active" },
    login: { type: String, required: true, trim: true, unique: true },
    loginLower: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true },
);

export const Worker = mongoose.model("Worker", workerSchema);
