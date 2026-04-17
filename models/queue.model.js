import mongoose from "mongoose";

const queueSchema = new mongoose.Schema(
{
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  date: {
    type: String,
    required: true,
  },

  currentToken: {
    type: Number,
    default: 0,
  },

  lastIssuedToken: {
    type: Number,
    default: 0,
  },
},
{ timestamps: true }
);

queueSchema.index({ doctorId: 1, date: 1 }, { unique: true });

export default mongoose.model("Queue", queueSchema);