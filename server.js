import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import cron from "node-cron";

import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import patientRoutes from "./routes/patient.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import User from "./models/User.js";
import analyticsRoutes from "./routes/Analytics.routes.js";
import { checkAppVersion, getLegalContent } from "./controllers/adminController.js";


dotenv.config();

console.log("Cloudinary ENV:", {
  CLOUD_NAME: process.env.CLOUD_NAME,
  CLOUD_API_KEY: process.env.CLOUD_API_KEY,
  CLOUD_API_SECRET: process.env.CLOUD_API_SECRET ? "[HIDDEN]" : undefined,
});

const app = express();
const PORT = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/admin/analytics", analyticsRoutes);

// public — no auth needed, called by mobile apps on launch
app.get("/api/app-version/:appType/:platform", checkAppVersion);
app.get("/api/legal/:type", getLegalContent);

// global error
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Server Error",
  });
});

// create http server
const server = http.createServer(app);

// socket io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"],
  },
});

// use in controllers
app.set("io", io);

// socket connection
io.on("connection", (socket) => {
  console.log(`[SOCKET] New connection | socketId=${socket.id}`);

  // patient joins doctor room
  socket.on("joinDoctorQueue", (doctorId) => {
    console.log(`[SOCKET] joinDoctorQueue received | socketId=${socket.id} | doctorId=${JSON.stringify(doctorId)} | type=${typeof doctorId}`);
    const room = `doctor_${doctorId}`;
    socket.join(room);
    const rooms = Array.from(socket.rooms);
    console.log(`[SOCKET] Socket joined room=${room} | allRooms=${JSON.stringify(rooms)}`);
    socket.emit("joinedRoom", { room, status: "joined", receivedDoctorId: JSON.stringify(doctorId) });
    console.log(`[SOCKET] Sent joinedRoom confirmation to socketId=${socket.id} | room=${room}`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[SOCKET] Disconnected | socketId=${socket.id} | reason=${reason}`);
  });
});

// auto reset all doctors to inactive at 11:59 PM every night
cron.schedule("59 23 * * *", async () => {
  try {
    const result = await User.updateMany(
      { activeStatus: "active" },
      { activeStatus: "inactive" }
    );
    console.log(`[CRON] 11:59 PM IST — reset ${result.modifiedCount} doctor(s) to inactive`);
  } catch (err) {
    console.error("[CRON] Failed to reset doctor duty status:", err.message);
  }
}, { timezone: "Asia/Kolkata" });

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4,
    });

    await User.syncIndexes();

    console.log("MongoDB Connected");

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

startServer();
