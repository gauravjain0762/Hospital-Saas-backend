import dotenv from "dotenv";
import mongoose from "mongoose";
import State from "../models/State.js";
import City from "../models/City.js";

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
  return json.data.states.map((s) => s.name);
}

async function fetchCities(stateName) {
  const res = await fetch(`${BASE_URL}/state/cities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ country: "India", state: stateName }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    console.warn(`  Warning: No cities found for "${stateName}"`);
    return [];
  }
  return json.data;
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  console.log("Clearing existing State and City collections...");
  await State.deleteMany({});
  await City.deleteMany({});
  console.log("Collections cleared\n");

  console.log("Fetching Indian states from API...");
  const stateNames = await fetchStates();
  console.log(`Fetched ${stateNames.length} states\n`);

  const stateDocs = await State.insertMany(
    stateNames.map((name) => ({ name }))
  );

  const stateMap = Object.fromEntries(stateDocs.map((s) => [s.name, s._id]));

  let totalCities = 0;

  for (let i = 0; i < stateNames.length; i++) {
    const stateName = stateNames[i];
    const stateId = stateMap[stateName];

    const cityNames = await fetchCities(stateName);

    if (cityNames.length > 0) {
      await City.insertMany(
        cityNames.map((name) => ({ name, state: stateId }))
      );
    }

    console.log(`Seeding ${stateName}... ${cityNames.length} cities inserted`);
    totalCities += cityNames.length;

    if (i < stateNames.length - 1) await delay(300);
  }

  console.log(`\nDone. ${stateDocs.length} states, ${totalCities} cities total`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
