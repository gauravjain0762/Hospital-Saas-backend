import mongoose from "mongoose";

const qualificationSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
  },
});

export default mongoose.model("Qualification", qualificationSchema);
