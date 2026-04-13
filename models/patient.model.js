import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
    {
        mobile: {
            type: String,
            required: true,
            unique: true,
        },
    },
    { timestamps: true }
);

export default mongoose.model("Patient", patientSchema);
