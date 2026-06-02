import dotenv from "dotenv";
import mongoose from "mongoose";
import State from "../models/State.js";
import City from "../models/City.js";

dotenv.config();

// All 143 cities confirmed missing from DB after running find:missing
const MISSING_CITIES = [
  "Banswara", "Barmer", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu",
  "Dholpur", "Dungarpur", "Jhalawar", "Jhunjhunu", "Nagaur", "Pali", "Sawai Madhopur",
  "Sikar", "Sri Ganganagar", "Beawar", "Makrana", "Sujangarh", "Sardarshahar",
  "Gangapur City", "Lakheri", "Nimbahera", "Begun", "Rawatbhata",
  "Deeg", "Dig", "Kaman", "Nadbai", "Weir", "Rupbas", "Kumher", "Pahari",
  "Lachhmangarh", "Ramgarh", "Shrimadhopur", "Pilani", "Chirawa", "Mandawa", "Bissau", "Baggar",
  "Balotra", "Pachpadra", "Siwana", "Sheo", "Baytu", "Gudamalani",
  "Sanchore", "Bhinmal", "Ahore", "Jaswantpura", "Raniwara",
  "Sagwara", "Aspur", "Bichhiwara", "Simalwara",
  "Bagidora", "Garhi", "Kushalgarh", "Sajjangarh",
  "Abu Road", "Reodar", "Pindwara", "Mount Abu",
  "Mandal", "Jahazpur", "Gulabpura", "Gangapur",
  "Hindoli", "Indargarh", "Kapren", "Talera",
  "Ramganj Mandi", "Jhalarapatan", "Khanpur", "Pirawa",
  "Chhipabarod", "Kishanganj", "Atru",
  "Rajakhera", "Bari", "Baseri", "Saramathura",
  "Nadoti", "Mandrail", "Sapotra",
  "Wazirpur", "Bonli", "Khandar",
  "Newai", "Malpura", "Uniara",
  "Lalsot", "Bandikui", "Sikrai", "Mahuwa",
  "Rajgarh", "Thanagazi", "Kishangarh Bas", "Mundawar", "Tijara", "Bansur", "Kotkasim",
  "Bayana", "Bidasar", "Taranagar",
  "Sangaria", "Pilibanga", "Bhadra", "Rawatsar", "Tibbi",
  "Suratgarh", "Raisinghnagar", "Anupgarh", "Gharsana",
  "Ladnun", "Didwana", "Mundwa", "Merta City", "Kuchaman City", "Parbatsar", "Jayal", "Nawa",
  "Marwar Junction", "Bali", "Desuri", "Jaitaran", "Rohat", "Sumerpur",
  "Nathdwara", "Railmagra", "Deogarh", "Bhim", "Khamnor",
  "Kapasan", "Bari Sadri",
  "Mavli", "Vallabhnagar", "Salumbar", "Sarada", "Gogunda", "Girwa", "Kherwara",
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  const stateDoc = await State.findOne({ name: "Rajasthan" }).lean();
  if (!stateDoc) {
    console.error("State 'Rajasthan' not found in DB");
    process.exit(1);
  }

  const existing = await City.find({ state: stateDoc._id }, "name").lean();
  const existingLower = new Set(existing.map((c) => c.name.toLowerCase()));

  const toInsert = MISSING_CITIES.filter((name) => !existingLower.has(name.toLowerCase()));

  if (toInsert.length === 0) {
    console.log("No missing cities to add — all already present.");
    await mongoose.disconnect();
    return;
  }

  await City.insertMany(toInsert.map((name) => ({ name, state: stateDoc._id })));
  console.log(`Added ${toInsert.length} missing cities to Rajasthan`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
