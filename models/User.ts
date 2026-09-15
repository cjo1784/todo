import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    githubId: { type: Number, required: true, unique: true },
    username: { type: String, required: true },
    avatarUrl: { type: String, required: true },
  },
  { timestamps: true },
);

export const User =
  (mongoose.models.User as mongoose.Model<mongoose.InferSchemaType<typeof schema>>) ??
  mongoose.model("User", schema);

export type UserDoc = mongoose.HydratedDocument<mongoose.InferSchemaType<typeof schema>>;
