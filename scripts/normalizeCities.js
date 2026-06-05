import dotenv from "dotenv";
import mongoose from "mongoose";
import City from "../models/City.js";

dotenv.config();

const normalize = (str) =>
  str.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  const allCities = await City.find({}, "_id name state");

  let updated = 0;
  let removed = 0;

  for (const city of allCities) {
    const clean = normalize(city.name);
    if (clean === city.name) continue; // already clean

    // Check if a clean-name version already exists in same state
    const duplicate = await City.findOne({
      name: { $regex: `^${clean}$`, $options: "i" },
      state: city.state,
      _id: { $ne: city._id },
    });

    if (duplicate) {
      // clean version already exists — remove the diacritical duplicate
      await City.deleteOne({ _id: city._id });
      console.log(`  Removed duplicate: "${city.name}" (kept "${duplicate.name}")`);
      removed++;
    } else {
      // no clean version — update this city's name
      await City.updateOne({ _id: city._id }, { name: clean });
      console.log(`  Updated: "${city.name}" → "${clean}"`);
      updated++;
    }
  }

  console.log(`\nDone — updated: ${updated}, removed duplicates: ${removed}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
