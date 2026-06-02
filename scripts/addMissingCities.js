import dotenv from "dotenv";
import mongoose from "mongoose";
import State from "../models/State.js";
import City from "../models/City.js";

dotenv.config();

// ─── Populate this array after running: npm run find:missing ────────────────
const MISSING_CITIES = [
  // paste the "MISSING FROM DB" output here, e.g.:
  // "Kishangarh Bas",
  // "Neem ka Thana",
];
// ────────────────────────────────────────────────────────────────────────────

async function run() {
  if (MISSING_CITIES.length === 0) {
    console.log("MISSING_CITIES array is empty. Run `npm run find:missing` first, then populate the array.");
    process.exit(0);
  }

  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  const stateDoc = await State.findOne({ name: { $regex: /^rajasthan$/i } });
  if (!stateDoc) {
    console.error("Rajasthan not found in State collection. Run seed:locations first.");
    process.exit(1);
  }

  // fetch existing cities for Rajasthan (case-insensitive check)
  const existing = await City.find({ state: stateDoc._id }, "name");
  const existingSet = new Set(existing.map((c) => c.name.trim().toLowerCase()));

  const toInsert = MISSING_CITIES
    .map((name) => name.trim())
    .filter((name) => {
      if (existingSet.has(name.toLowerCase())) {
        console.log(`  Skipping (already exists): ${name}`);
        return false;
      }
      return true;
    })
    .map((name) => ({ name, state: stateDoc._id }));

  if (toInsert.length === 0) {
    console.log("\nNo new cities to insert — all already exist in DB.");
    await mongoose.disconnect();
    return;
  }

  await City.insertMany(toInsert);
  console.log(`\nAdded ${toInsert.length} missing cities to Rajasthan:`);
  toInsert.forEach((c) => console.log(`  + ${c.name}`));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
