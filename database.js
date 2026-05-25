const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./bot.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      downloads INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      platform TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function addUser(user) {
  db.run(
    `INSERT OR IGNORE INTO users (id, username, first_name) VALUES (?, ?, ?)`,
    [user.id, user.username || "", user.first_name || ""]
  );
}

function addDownload(userId, platform) {
  db.run(`INSERT INTO downloads (user_id, platform) VALUES (?, ?)`, [userId, platform]);
  db.run(`UPDATE users SET downloads = downloads + 1 WHERE id = ?`, [userId]);
}

function getStats(callback) {
  db.get(`SELECT COUNT(*) AS total_users FROM users`, (e1, users) => {
    db.get(`SELECT COUNT(*) AS total_downloads FROM downloads`, (e2, downloads) => {
      db.all(
        `SELECT platform, COUNT(*) AS total FROM downloads GROUP BY platform ORDER BY total DESC`,
        (e3, platforms) => {
          callback({
            totalUsers: users ? users.total_users : 0,
            totalDownloads: downloads ? downloads.total_downloads : 0,
            platforms: platforms || [],
          });
        }
      );
    });
  });
}

function getUsers(callback) {
  db.all(`SELECT * FROM users ORDER BY downloads DESC LIMIT 100`, callback);
}

module.exports = { addUser, addDownload, getStats, getUsers };
