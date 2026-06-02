import dotenv from "dotenv";
import mongoose from "mongoose";
import State from "../models/State.js";
import City from "../models/City.js";

dotenv.config();

const REFERENCE_CITIES = [
  "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bikaner", "Bundi",
  "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer",
  "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh",
  "Rajsamand", "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur",
  "Kishangarh", "Beawar", "Makrana", "Sujangarh", "Ratangarh", "Sardarshahar", "Nokha",
  "Gangapur City", "Hindaun", "Lakheri", "Nimbahera", "Begun", "Rawatbhata",
  "Deeg", "Dig", "Kaman", "Nadbai", "Weir", "Rupbas", "Kumher", "Nagar", "Pahari",
  "Fatehpur", "Lachhmangarh", "Ramgarh", "Khandela", "Neem ka Thana", "Shrimadhopur",
  "Pilani", "Chirawa", "Mandawa", "Nawalgarh", "Bissau", "Baggar",
  "Phalodi", "Balotra", "Pachpadra", "Siwana", "Sheo", "Baytu", "Gudamalani",
  "Sanchore", "Bhinmal", "Ahore", "Jaswantpura", "Raniwara",
  "Sagwara", "Aspur", "Bichhiwara", "Simalwara",
  "Bagidora", "Garhi", "Kushalgarh", "Sajjangarh",
  "Abu Road", "Sheoganj", "Reodar", "Pindwara", "Mount Abu",
  "Mandal", "Jahazpur", "Gulabpura", "Gangapur",
  "Hindoli", "Indargarh", "Nainwa", "Kapren", "Talera",
  "Ramganj Mandi", "Jhalarapatan", "Aklera", "Khanpur", "Pirawa",
  "Chhipabarod", "Kishanganj", "Atru", "Chhabra",
  "Rajakhera", "Bari", "Baseri", "Saramathura",
  "Nadoti", "Mandrail", "Sapotra",
  "Wazirpur", "Bonli", "Khandar",
  "Newai", "Malpura", "Todaraisingh", "Uniara",
  "Lalsot", "Bandikui", "Sikrai", "Mahuwa",
  "Rajgarh", "Thanagazi", "Kishangarh Bas", "Mundawar", "Tijara", "Behror", "Bansur", "Kotkasim",
  "Bayana", "Bidasar", "Taranagar",
  "Sangaria", "Pilibanga", "Nohar", "Bhadra", "Rawatsar", "Tibbi",
  "Suratgarh", "Raisinghnagar", "Anupgarh", "Gharsana", "Padampur",
  "Ladnun", "Didwana", "Mundwa", "Merta City", "Kuchaman City", "Parbatsar", "Jayal", "Nawa",
  "Sojat", "Raipur", "Marwar Junction", "Bali", "Desuri", "Jaitaran", "Rohat", "Sumerpur",
  "Nathdwara", "Railmagra", "Amet", "Deogarh", "Bhim", "Khamnor",
  "Kapasan", "Bari Sadri",
  "Mavli", "Vallabhnagar", "Salumbar", "Sarada", "Gogunda", "Girwa", "Kherwara",
];

// Deduplicate reference list (case-insensitive)
const uniqueRef = [...new Map(REFERENCE_CITIES.map((c) => [c.toLowerCase(), c])).values()];

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  const stateDoc = await State.findOne({ name: "Rajasthan" }).lean();
  if (!stateDoc) {
    console.error("State 'Rajasthan' not found in DB");
    process.exit(1);
  }

  const dbCities = await City.find({ state: stateDoc._id }, "name").lean();
  const dbNames = dbCities.map((c) => c.name);
  const dbNamesLower = new Set(dbNames.map((n) => n.toLowerCase()));
  const refNamesLower = new Set(uniqueRef.map((n) => n.toLowerCase()));

  const missing = uniqueRef.filter((c) => !dbNamesLower.has(c.toLowerCase()));
  const extra = dbNames.filter((c) => !refNamesLower.has(c.toLowerCase()));

  console.log(`DB has ${dbNames.length} cities for Rajasthan`);
  console.log(`Reference list has ${uniqueRef.length} unique cities\n`);

  console.log(`MISSING FROM DB (${missing.length}):`);
  missing.forEach((c) => console.log(`  - ${c}`));

  console.log(`\nEXTRA IN DB (${extra.length}) — possible duplicates/variations:`);
  extra.forEach((c) => console.log(`  - ${c}`));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
