import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
    date: { type: String, default: "" },
    projectId: { type: String, default: "" },
    projectName: { type: String, default: "" },
    type: { type: String, default: "" },
    ustaId: { type: String, default: "" },
    ustaName: { type: String, default: "" },
    brigadeId: { type: String, default: "" },
    brigadeName: { type: String, default: "" },
    comment: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Expense = mongoose.model("Expense", expenseSchema);
