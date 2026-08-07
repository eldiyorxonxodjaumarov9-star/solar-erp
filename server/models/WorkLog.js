import mongoose from "mongoose";

const workLogSchema = new mongoose.Schema(
  {
    worker_id: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", default: null },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
    workerId: { type: String, default: "" },
    projectId: { type: String, default: "" },
    start_time: { type: String, default: "" },
    end_time: { type: String, default: "" },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    date: { type: String, default: "" },
    restDay: { type: Boolean, default: false },
    dayOff: { type: Boolean, default: false },
    dayOffReason: { type: String, default: "" },
    restMessage: { type: String, default: "" },
    /** ISO 8601 timestamps */
    arrivalTime: { type: String, default: "" },
    departureTime: { type: String, default: "" },
    /** Base64 JPEG data URLs, 3:4 cropped */
    arrivalImage: { type: String, default: "" },
    departureImage: { type: String, default: "" },
    totalWorkDuration: { type: String, default: "" },
    startPhoto: { type: String, default: "" },
    endPhoto: { type: String, default: "" },
  },
  { timestamps: true },
);

export const WorkLog = mongoose.model("WorkLog", workLogSchema);
