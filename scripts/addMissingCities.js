import dotenv from "dotenv";
import mongoose from "mongoose";
import State from "../models/State.js";
import City from "../models/City.js";

dotenv.config();

// ─── Populate this array after running: npm run find:missing ────────────────
const MISSING_CITIES = [
  "Banswara", "Barmer", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh",
  "Churu", "Dholpur", "Dungarpur", "Jhalawar", "Jhunjhunu", "Nagaur",
  "Pali", "Sawai Madhopur", "Sikar", "Sri Ganganagar", "Beawar", "Makrana",
  "Sujangarh", "Sardarshahar", "Gangapur City", "Lakheri", "Nimbahera",
  "Begun", "Rawatbhata", "Deeg", "Dig", "Kaman", "Nadbai", "Weir",
  "Rupbas", "Kumher", "Pahari", "Lachhmangarh", "Ramgarh", "Shrimadhopur",
  "Pilani", "Chirawa", "Mandawa", "Bissau", "Baggar", "Balotra",
  "Pachpadra", "Siwana", "Sheo", "Baytu", "Gudamalani", "Sanchore",
  "Bhinmal", "Ahore", "Jaswantpura", "Raniwara", "Sagwara", "Aspur",
  "Bichhiwara", "Simalwara", "Bagidora", "Garhi", "Kushalgarh",
  "Sajjangarh", "Abu Road", "Reodar", "Pindwara", "Mount Abu", "Mandal",
  "Jahazpur", "Gulabpura", "Gangapur", "Hindoli", "Indargarh", "Kapren",
  "Talera", "Ramganj Mandi", "Jhalarapatan", "Khanpur", "Pirawa",
  "Chhipabarod", "Kishanganj", "Atru", "Rajakhera", "Bari", "Baseri",
  "Saramathura", "Nadoti", "Mandrail", "Sapotra", "Wazirpur", "Bonli",
  "Khandar", "Newai", "Malpura", "Uniara", "Lalsot", "Bandikui", "Sikrai",
  "Mahuwa", "Rajgarh", "Thanagazi", "Kishangarh Bas", "Mundawar", "Tijara",
  "Bansur", "Kotkasim", "Bayana", "Bidasar", "Taranagar", "Sangaria",
  "Pilibanga", "Bhadra", "Rawatsar", "Tibbi", "Suratgarh", "Raisinghnagar",
  "Anupgarh", "Gharsana", "Ladnun", "Didwana", "Mundwa", "Merta City",
  "Kuchaman City", "Parbatsar", "Jayal", "Nawa", "Marwar Junction", "Bali",
  "Desuri", "Jaitaran", "Rohat", "Sumerpur", "Nathdwara", "Railmagra",
  "Deogarh", "Bhim", "Khamnor", "Kapasan", "Bari Sadri", "Mavli",
  "Vallabhnagar", "Salumbar", "Sarada", "Gogunda", "Girwa", "Kherwara",
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
