const fs = require("fs");

const DB_FILE = "./bot.json";

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: {}, downloads: [] };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function addUser(user) {
  const db = loadDB();
  if (!db.users[user.id]) {
    db.users[user.id] = {
      id: user.id,
      username: user.username || "",
      first_name: user.first_name || "",
      downloads: 0,
      created_at: new Date().toISOString()
    };
  }
  saveDB(db);
}

function addDownload(userId, platform) {
  const db = loadDB();
  db.downloads.push({
    user_id: userId,
    platform,
    created_at: new Date().toISOString()
  });

  if (db.users[userId]) {
    db.users[userId].downloads += 1;
  }

  saveDB(db);
}

function getStats(callback) {
  const db = loadDB();
  const platforms = {};

  for (const d of db.downloads) {
    platforms[d.platform] = (platforms[d.platform] || 0) + 1;
  }

  callback({
    totalUsers: Object.keys(db.users).length,
    totalDownloads: db.downloads.length,
    platforms: Object.entries(platforms)
      .map(([platform, total]) => ({ platform, total }))
      .sort((a, b) => b.total - a.total)
  });
}

function getUsers(callback) {
  const db = loadDB();
  const rows = Object.values(db.users).sort((a, b) => b.downloads - a.downloads);
  callback(null, rows);
}

module.exports = { addUser, addDownload, getStats, getUsers };
