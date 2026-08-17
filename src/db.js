require('dotenv').config();
const neo4j = require('neo4j-driver');

const uri = process.env.COGNODB_URI;
const user = process.env.COGNODB_USER;
const pass = process.env.COGNODB_PASSWORD;

if (!uri || !user || !pass) {
  console.error('Missing CognoDB credentials — check your .env file (see .env.example)');
}

// disableLosslessIntegers so we get normal JS numbers back instead of Neo4j's Integer wrapper
const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
  disableLosslessIntegers: true,
});

async function verifyConnection() {
  try {
    await driver.verifyConnectivity();
    console.log('Connected to CognoDB');
    return true;
  } catch (err) {
    console.error('Could not connect to CognoDB:', err.message);
    return false;
  }
}

// small wrapper so every query gets a fresh session and always closes it
async function runQuery(cypher, params) {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params || {});
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

module.exports = { driver, verifyConnection, runQuery };
