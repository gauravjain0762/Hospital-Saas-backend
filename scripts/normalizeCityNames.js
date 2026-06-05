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

// Strip diacritics: NFD decompose then remove combining characters
function stripDiacritics(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeKey(name) {
  return stripDiacritics(name).toLowerCase().replace(/\s+/g, " ").trim();
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  const stateDoc = await State.findOne({ name: "Rajasthan" }).lean();
  if (!stateDoc) {
    console.error("State 'Rajasthan' not found in DB");
    process.exit(1);
  }

  // Build reference lookup: normalized key → canonical name
  const refMap = new Map();
  for (const city of REFERENCE_CITIES) {
    refMap.set(normalizeKey(city), city);
  }

  const dbCities = await City.find({ state: stateDoc._id }).lean();
  console.log(`Found ${dbCities.length} cities in DB for Rajasthan\n`);

  let updated = 0;
  let deleted = 0;
  let noMatch = [];

  // Group cities by their normalized+canonical name to detect duplicates
  // Key: canonical ref name (or normalized DB name if no ref match)
  const grouped = new Map();

  for (const city of dbCities) {
    const key = normalizeKey(city.name);
    const canonicalName = refMap.get(key);

    const groupKey = canonicalName ? canonicalName.toLowerCase() : key;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push({ city, canonicalName });
  }

  for (const [, entries] of grouped) {
    const { canonicalName } = entries[0];

    if (!canonicalName) {
      // No reference match — still strip diacritics, then deduplicate
      // Sort: prefer already-plain names (no diacritics)
      entries.sort((a, b) => {
        const aPlain = stripDiacritics(a.city.name) === a.city.name ? 0 : 1;
        const bPlain = stripDiacritics(b.city.name) === b.city.name ? 0 : 1;
        return aPlain - bPlain;
      });

      const [keep, ...dupes] = entries;
      const plainName = stripDiacritics(keep.city.name)
        .replace(/\s+/g, " ")
        .trim();

      if (keep.city.name !== plainName) {
        await City.findByIdAndUpdate(keep.city._id, { name: plainName });
        console.log(`  UPDATED (no-ref): "${keep.city.name}" → "${plainName}"`);
        updated++;
      } else {
        noMatch.push(keep.city.name);
      }

      for (const dupe of dupes) {
        await City.findByIdAndDelete(dupe.city._id);
        console.log(`  DELETED duplicate (no-ref): "${dupe.city.name}" (kept: "${plainName}")`);
        deleted++;
      }
      continue;
    }

    // Sort: prefer the one whose name already equals canonical (least work)
    entries.sort((a, b) => {
      if (a.city.name === canonicalName) return -1;
      if (b.city.name === canonicalName) return 1;
      return 0;
    });

    const [keep, ...dupes] = entries;

    // Update the keeper if its name differs from canonical
    if (keep.city.name !== canonicalName) {
      await City.findByIdAndUpdate(keep.city._id, { name: canonicalName });
      console.log(`  UPDATED: "${keep.city.name}" → "${canonicalName}"`);
      updated++;
    }

    // Delete duplicates
    for (const dupe of dupes) {
      await City.findByIdAndDelete(dupe.city._id);
      console.log(`  DELETED duplicate: "${dupe.city.name}" (canonical: "${canonicalName}")`);
      deleted++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Updated: ${updated}`);
  console.log(`Deleted (duplicates): ${deleted}`);
  console.log(`No reference match (left unchanged): ${noMatch.length}`);
  if (noMatch.length) {
    noMatch.forEach((n) => console.log(`  - ${n}`));
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
