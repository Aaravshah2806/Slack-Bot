const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "db.json");

const defaultData = {
  standups: {}, // user_id -> text
  scores: {},    // user_id -> score
  bannedWords: []
};

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDb(defaultData);
      return defaultData;
    }
    const content = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading database:", err);
    return defaultData;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing to database:", err);
  }
}

// Banned words API
function getBannedWords() {
  const db = readDb();
  return db.bannedWords || [];
}

function addBannedWord(word) {
  const db = readDb();
  const lowerWord = word.toLowerCase().trim();
  if (lowerWord && !db.bannedWords.includes(lowerWord)) {
    db.bannedWords.push(lowerWord);
    writeDb(db);
    return true;
  }
  return false;
}

function removeBannedWord(word) {
  const db = readDb();
  const lowerWord = word.toLowerCase().trim();
  const index = db.bannedWords.indexOf(lowerWord);
  if (index !== -1) {
    db.bannedWords.splice(index, 1);
    writeDb(db);
    return true;
  }
  return false;
}

// Standups API
function saveStandup(userId, text) {
  const db = readDb();
  db.standups[userId] = text;
  writeDb(db);
}

function getStandups() {
  const db = readDb();
  return db.standups || {};
}

function clearStandups() {
  const db = readDb();
  db.standups = {};
  writeDb(db);
}

// Trivia Scores API
function getScores() {
  const db = readDb();
  return db.scores || {};
}

function addScore(userId, points = 1) {
  const db = readDb();
  if (!db.scores[userId]) {
    db.scores[userId] = 0;
  }
  db.scores[userId] += points;
  writeDb(db);
  return db.scores[userId];
}

module.exports = {
  getBannedWords,
  addBannedWord,
  removeBannedWord,
  saveStandup,
  getStandups,
  clearStandups,
  getScores,
  addScore
};
