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

  slotQueues: {
    type: [
      {
        slot: { type: String, required: true },       // "10:00 AM - 11:00 AM"
        slotNumber: { type: Number, required: true }, // 1, 2, 3...
        currentToken: { type: Number, default: 0 },
        lastIssuedToken: { type: Number, default: 0 },
      },
    ],
    default: [],
  },
},
{ timestamps: true }
);

queueSchema.index({ doctorId: 1, date: 1 }, { unique: true });

export default mongoose.model("Queue", queueSchema);
