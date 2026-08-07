import mongoose from "mongoose";

const stagePhotoSchema = new mongoose.Schema(
  {
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
    projectId: { type: String, required: true, index: true },
    stage_index: { type: Number, default: 0 },
    stageId: { type: String, required: true },
    photos: {
      type: [String],
      default: ["", "", ""],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length === 3;
        },
        message: "photos must have exactly 3 slots",
      },
    },
    slotNumber: { type: Number, min: 1, max: 3, default: 1 },
    imageUrl: { type: String, default: "" },
    imageData: { type: String, default: "" },
    ustaId: { type: String, default: "" },
    ustaName: { type: String, default: "" },
    brigadeId: { type: String, default: "" },
    brigadeName: { type: String, default: "" },
    uploadDate: { type: String, default: "" },
  },
  { timestamps: true },
);

export const StagePhoto = mongoose.model("StagePhoto", stagePhotoSchema);
