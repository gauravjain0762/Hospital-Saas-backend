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
  if (json.error) throw new Error(`Failed to fetch states: ${json.msg}`);
  return json.data.states.map((s) => s.name);
}

async function fetchCities(stateName) {
  const res = await fetch(`${BASE_URL}/state/cities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ country: "India", state: stateName }),
  });
  const json = await res.json();
  if (json.error) return [];
  return json.data || [];
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB");

  await State.deleteMany({});
  await City.deleteMany({});
  console.log("Cleared existing State and City collections");

  const stateNames = await fetchStates();
  console.log(`Fetched ${stateNames.length} states`);

  const stateDocs = await State.insertMany(stateNames.map((name) => ({ name })));
  const stateMap = {};
  for (const doc of stateDocs) {
    stateMap[doc.name] = doc._id;
  }

  let totalCities = 0;

  for (const stateName of stateNames) {
    await delay(300);
    const cityNames = await fetchCities(stateName);
    if (cityNames.length === 0) {
      console.log(`Seeding ${stateName}... 0 cities inserted`);
      continue;
    }
    const stateId = stateMap[stateName];
    await City.insertMany(cityNames.map((name) => ({ name, state: stateId })));
    console.log(`Seeding ${stateName}... ${cityNames.length} cities inserted`);
    totalCities += cityNames.length;
  }

  console.log(`Done. ${stateNames.length} states, ${totalCities} cities total`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
