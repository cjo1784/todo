import mongoose from "mongoose";
import { toJSON } from "@/lib/db";

const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    year: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "year must be an integer" },
    },
  },
  { toJSON },
);

export const YearGoal =
  (mongoose.models.YearGoal as mongoose.Model<mongoose.InferSchemaType<typeof schema>>) ??
  mongoose.model("YearGoal", schema);
