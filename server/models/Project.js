import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    client_name: { type: String, default: "" },
    location: { type: String, default: "" },
    power: { type: Number, default: 0 },
    brigade_id: { type: mongoose.Schema.Types.ObjectId, ref: "Brigade", default: null },
    status: { type: String, enum: ["jarayonda", "tugallandi"], default: "jarayonda" },
    created_at: { type: Date, default: Date.now },
    projectNumber: { type: String, default: "" },
    clientName: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    holat: { type: String, default: "Jarayonda" },
    brigadeId: { type: String, default: "" },
    brigadeName: { type: String, default: "" },
    ustaId: { type: String, default: "" },
    ustaName: { type: String, default: "" },
    assignedWorkerId: { type: String, default: "" },
    powerKw: { type: String, default: "" },
    paymentSom: { type: String, default: "" },
    systemType: { type: String, default: "" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    izoh: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Project = mongoose.model("Project", projectSchema);
