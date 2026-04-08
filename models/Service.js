import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema({
    name: {
        type: String,
        unique: true,
    },
});

export default mongoose.model("Service", serviceSchema);