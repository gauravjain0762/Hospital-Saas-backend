import dotenv from "dotenv";
import mongoose from "mongoose";
import State from "../models/State.js";
import City from "../models/City.js";

dotenv.config();

const REFERENCE_CITIES = [
  "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara",
  "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur",
  "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu",
  "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh", "Rajsamand",
  "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur",
  "Kishangarh", "Beawar", "Makrana", "Sujangarh", "Ratangarh", "Sardarshahar",
  "Nokha", "Gangapur City", "Hindaun", "Lakheri", "Nimbahera", "Begun",
  "Rawatbhata", "Deeg", "Dig", "Kaman", "Nadbai", "Weir", "Rupbas", "Kumher",
  "Nagar", "Pahari", "Fatehpur", "Lachhmangarh", "Ramgarh", "Khandela",
  "Neem ka Thana", "Shrimadhopur", "Pilani", "Chirawa", "Mandawa", "Nawalgarh",
  "Bissau", "Baggar", "Phalodi", "Balotra", "Pachpadra", "Siwana", "Sheo",
  "Baytu", "Gudamalani", "Sanchore", "Bhinmal", "Ahore", "Jaswantpura",
  "Raniwara", "Sagwara", "Aspur", "Bichhiwara", "Simalwara", "Bagidora",
  "Garhi", "Kushalgarh", "Sajjangarh", "Abu Road", "Sheoganj", "Reodar",
  "Pindwara", "Mount Abu", "Mandal", "Jahazpur", "Gulabpura", "Gangapur",
  "Hindoli", "Indargarh", "Nainwa", "Kapren", "Talera", "Ramganj Mandi",
  "Jhalarapatan", "Aklera", "Khanpur", "Pirawa", "Chhipabarod", "Kishanganj",
  "Atru", "Chhabra", "Rajakhera", "Bari", "Baseri", "Saramathura", "Nadoti",
  "Mandrail", "Sapotra", "Wazirpur", "Bonli", "Khandar", "Newai", "Malpura",
  "Todaraisingh", "Uniara", "Lalsot", "Bandikui", "Sikrai", "Mahuwa",
  "Rajgarh", "Thanagazi", "Kishangarh Bas", "Mundawar", "Tijara", "Behror",
  "Bansur", "Kotkasim", "Bayana", "Bidasar", "Taranagar", "Sangaria",
  "Pilibanga", "Nohar", "Bhadra", "Rawatsar", "Tibbi", "Suratgarh",
  "Raisinghnagar", "Anupgarh", "Gharsana", "Padampur", "Ladnun", "Didwana",
  "Mundwa", "Merta City", "Kuchaman City", "Parbatsar", "Jayal", "Nawa",
  "Sojat", "Raipur", "Marwar Junction", "Bali", "Desuri", "Jaitaran", "Rohat",
  "Sumerpur", "Nathdwara", "Railmagra", "Amet", "Deogarh", "Bhim", "Khamnor",
  "Kapasan", "Bari Sadri", "Mavli", "Vallabhnagar", "Salumbar", "Sarada",
  "Gogunda", "Girwa", "Kherwara",
];

// deduplicate the reference list (case-insensitive key, preserve original casing)
const refMap = new Map();
for (const city of REFERENCE_CITIES) {
  const key = city.trim().toLowerCase();
  if (!refMap.has(key)) refMap.set(key, city.trim());
}
const uniqueRef = [...refMap.values()];

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  const stateDoc = await State.findOne({ name: { $regex: /^rajasthan$/i } });
  if (!stateDoc) {
    console.error("Rajasthan not found in State collection. Run seed:locations first.");
    process.exit(1);
  }

  const dbCities = await City.find({ state: stateDoc._id }, "name");
  const dbMap = new Map();
  for (const c of dbCities) {
    dbMap.set(c.name.trim().toLowerCase(), c.name.trim());
  }

  const missing = uniqueRef.filter((city) => !dbMap.has(city.toLowerCase()));
  const extra = [...dbMap.values()].filter((city) => !refMap.has(city.toLowerCase()));

  console.log(`Rajasthan in DB  : ${dbCities.length} cities`);
  console.log(`Reference list   : ${uniqueRef.length} unique cities\n`);

  if (missing.length === 0) {
    console.log("MISSING FROM DB  : none ✓");
  } else {
    console.log(`MISSING FROM DB (${missing.length}):`);
    missing.forEach((c) => console.log(`  - ${c}`));
  }

  console.log();

  if (extra.length === 0) {
    console.log("EXTRA IN DB      : none");
  } else {
    console.log(`EXTRA IN DB (${extra.length}) — possible variations/duplicates:`);
    extra.forEach((c) => console.log(`  + ${c}`));
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
