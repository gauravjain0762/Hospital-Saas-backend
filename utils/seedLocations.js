import dotenv from "dotenv";
import mongoose from "mongoose";
import Location from "../models/Location.js";

dotenv.config();

const BASE_URL = "https://countriesnow.space/api/v0.1/countries";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchStates() {
  const res = await fetch(`${BASE_URL}/states`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ country: "India" }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.msg || "Failed to fetch states");
  return json.data.states; // [{ name, state_code }, ...]
}

async function fetchCities(stateName) {
  const res = await fetch(`${BASE_URL}/state/cities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ country: "India", state: stateName }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    console.warn(`  ⚠  No cities for "${stateName}": ${json.msg}`);
    return [];
  }
  return json.data; // string[]
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB");

  console.log("Fetching Indian states...");
  const states = await fetchStates();
  console.log(`Found ${states.length} states`);

  let saved = 0;
  let failed = 0;

  for (let i = 0; i < states.length; i++) {
    const stateName = states[i].name;
    process.stdout.write(`[${i + 1}/${states.length}] ${stateName} ... `);

    const cities = await fetchCities(stateName);
    console.log(`${cities.length} cities`);

    await Location.findOneAndUpdate(
      { state: stateName },
      { state: stateName, cities },
      { upsert: true }
    );
    saved++;

    if (i < states.length - 1) await delay(300);
  }

  console.log(`\nDone. Saved: ${saved}, Failed: ${failed}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
