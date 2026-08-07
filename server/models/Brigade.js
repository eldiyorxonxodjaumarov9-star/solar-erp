import mongoose from "mongoose";

const brigadeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Brigada nomi majburiy."],
      trim: true,
      minlength: [2, "Brigada nomi kamida 2 ta belgidan iborat bo‘lishi kerak."],
    },
    phone: { type: String, default: "" },
    leader_id: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", default: null },
  },
  { timestamps: true },
);

export const Brigade = mongoose.model("Brigade", brigadeSchema);
