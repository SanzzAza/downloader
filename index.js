require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const db = require("./database");

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_BASE = process.env.API_BASE || "https://dramafeed.vercel.app/api/downloader";
const ADMIN_ID = Number(process.env.ADMIN_ID || 8126241407);
const WELCOME_IMAGE = "./welcome.png";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("threads.com") || u.includes("threads.net")) return "threads";
  return null;
}

function isPhotoUrl(url) {
  return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
}

function getMedia(data) {
  const medias = [];

  if (data.video) {
    const url = data.video.hdplay || data.video.play || data.video.wmplay;
    if (url) medias.push({ type: "video", url });
  }

  if (data.data && (data.data.hd || data.data.sd)) {
    medias.push({ type: "video", url: data.data.hd || data.data.sd });
  }

  if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      const url = item.url || item.video || item.link || item.download_url;
      if (url) medias.push({ type: isPhotoUrl(url) ? "photo" : "video", url });
    }
  }

  const candidates =
    data.medias ||
    data.media ||
    (data.data && data.data.medias) ||
    (data.data && data.data.media) ||
    (data.result && data.result.medias) ||
    (data.result && data.result.media);

  if (Array.isArray(candidates)) {
    for (const item of candidates) {
      const url = item.url || item.link || item.download_url || item.video || item.image;
      if (!url) continue;

      const typeRaw = String(item.type || item.ext || item.mime || "").toLowerCase();
      const type = typeRaw.includes("image") || isPhotoUrl(url) ? "photo" : "video";

      medias.push({ type, url });
    }
  }

  const direct =
    data.url ||
    data.download_url ||
    data.video_url ||
    data.image_url ||
    (data.data && data.data.url) ||
    (data.data && data.data.download_url) ||
    (data.data && data.data.video_url) ||
    (data.data && data.data.image_url) ||
    (data.result && data.result.url) ||
    (data.result && data.result.download_url) ||
    (data.result && data.result.video_url) ||
    (data.result && data.result.image_url);

  if (!medias.length && direct) {
    medias.push({ type: isPhotoUrl(direct) ? "photo" : "video", url: direct });
  }

  return medias.filter((m, i, arr) => arr.findIndex((x) => x.url === m.url) === i);
}

function getAudio(data) {
  if (data.audio && data.audio.play) {
    return {
      url: data.audio.play,
      title: data.audio.title || "TikTok Audio",
      author: data.audio.author || "MediaMuncher",
      duration: data.audio.duration || 0,
    };
  }

  return null;
}

function menuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📥 Download", "help_download"),
      Markup.button.callback("📌 Command", "help_command"),
    ],
    [Markup.button.url("👨‍💻 Owner", "https://t.me/einsteinsocrates46")],
  ]);
}

function welcomeText() {
  return (
    "🤖 *Welcome to MediaMuncher!*\n\n" +
    "Downloader social media cepat, simpel, dan rapi.\n\n" +
    "✅ TikTok Video + Audio\n" +
    "✅ Instagram Reels\n" +
    "✅ Facebook Reels\n" +
    "✅ X/Twitter\n" +
    "✅ Threads\n\n" +
    "📌 Kirim link langsung, nanti bot proses otomatis."
  );
}

function helpText() {
  return (
    "📖 *MediaMuncher Help*\n\n" +
    "Kirim link langsung:\n" +
    "`https://vt.tiktok.com/xxxx`\n\n" +
    "Command:\n" +
    "`/tt link_tiktok`\n" +
    "`/ig link_instagram`\n" +
    "`/fb link_facebook`\n" +
    "`/x link_twitter`\n" +
    "`/threads link_threads`\n\n" +
    "🎵 TikTok otomatis dikirim video + audio.\n\n" +
    "Admin:\n" +
    "`/stats`\n" +
    "`/users`\n" +
    "`/broadcast pesan`"
  );
}

async function sendWelcome(ctx) {
  db.addUser(ctx.from);

  if (fs.existsSync(WELCOME_IMAGE)) {
    return ctx.replyWithPhoto(
      { source: WELCOME_IMAGE },
      { caption: welcomeText(), parse_mode: "Markdown", ...menuKeyboard() }
    );
  }

  return ctx.reply(welcomeText(), { parse_mode: "Markdown", ...menuKeyboard() });
}

async function loadingMessage(ctx) {
  const msg = await ctx.reply("⏳ Menghubungi server...");
  const steps = [
    "🔎 Mendeteksi platform...",
    "📡 Mengambil data media...",
    "🧩 Menyiapkan file...",
    "🚀 Mengirim ke Telegram...",
  ];

  for (const step of steps) {
    await sleep(500);
    try {
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, step);
    } catch (e) {}
  }

  return msg;
}

async function processLink(ctx, url, forcedPlatform = null) {
  db.addUser(ctx.from);

  const platform = forcedPlatform || detectPlatform(url);

  if (!platform) {
    return ctx.reply("❌ *Platform belum support atau link tidak valid.*", {
      parse_mode: "Markdown",
    });
  }

  const loading = await loadingMessage(ctx);

  try {
    const apiUrl = API_BASE + "?platform=" + platform + "&url=" + encodeURIComponent(url);

    const res = await axios.get(apiUrl, {
      timeout: 60000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const medias = getMedia(res.data);

    if (!medias.length) {
      console.log(JSON.stringify(res.data, null, 2));
      return ctx.reply("❌ *Media tidak ditemukan.*\n\nLink private/expired atau API berubah.", {
        parse_mode: "Markdown",
      });
    }

    db.addDownload(ctx.from.id, platform);

    let sent = 0;

    for (const media of medias.slice(0, 10)) {
      const caption =
        "✅ *MediaMuncher Downloader*\n\n" +
        "🌐 Platform: *" + platform.toUpperCase() + "*\n" +
        "📦 Tipe: *" + (media.type === "photo" ? "Photo" : "Video") + "*\n" +
        "⚡ Status: *Success*";

      try {
        if (media.type === "photo") {
          await ctx.replyWithPhoto({ url: media.url }, { caption, parse_mode: "Markdown" });
        } else {
          await ctx.replyWithVideo({ url: media.url }, { caption, parse_mode: "Markdown" });
        }
        sent++;
      } catch (e) {
        console.error("Gagal kirim media:", e.message);
        if (platform !== "threads") await ctx.reply("✅ Link media:\n" + media.url);
      }
    }

    if (platform === "tiktok") {
      const audio = getAudio(res.data);

      if (audio) {
        try {
          await ctx.replyWithAudio(
            { url: audio.url },
            {
              title: audio.title,
              performer: audio.author,
              duration: audio.duration,
              caption:
                "🎵 *MediaMuncher Audio*\n\n" +
                "🌐 Platform: *TIKTOK*\n" +
                "📦 Tipe: *Audio / MP3*\n" +
                "⚡ Status: *Success*",
              parse_mode: "Markdown",
            }
          );

          db.addDownload(ctx.from.id, "tiktok_audio");
        } catch (e) {
          console.error("Gagal kirim audio:", e.message);
          await ctx.reply("🎵 Link audio:\n" + audio.url);
        }
      }
    }

    if (!sent && platform === "threads") {
      await ctx.reply("⚠️ Media Threads terdeteksi, tapi Telegram gagal mengambil file dari CDN.");
    }
  } catch (err) {
    console.error((err.response && err.response.data) || err.message);
    ctx.reply("❌ *Gagal memproses link.*\n\nCoba cek lagi link-nya, atau API sedang sibuk.", {
      parse_mode: "Markdown",
    });
  } finally {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
    } catch (e) {}
  }
}

function getCommandUrl(ctx) {
  return ctx.message.text.split(" ").slice(1).join(" ").trim();
}

function adminOnly(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

bot.start(sendWelcome);

bot.help((ctx) => ctx.reply(helpText(), { parse_mode: "Markdown", ...menuKeyboard() }));

bot.action("help_download", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("📥 Kirim link video/foto langsung ke chat ini, nanti bot download otomatis.");
});

bot.action("help_command", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(helpText(), { parse_mode: "Markdown" });
});

bot.command("tt", (ctx) => {
  const url = getCommandUrl(ctx);
  if (!url) return ctx.reply("Contoh:\n/tt https://vt.tiktok.com/xxxx");
  return processLink(ctx, url, "tiktok");
});

bot.command("ig", (ctx) => {
  const url = getCommandUrl(ctx);
  if (!url) return ctx.reply("Contoh:\n/ig https://www.instagram.com/reel/xxxx");
  return processLink(ctx, url, "instagram");
});

bot.command("fb", (ctx) => {
  const url = getCommandUrl(ctx);
  if (!url) return ctx.reply("Contoh:\n/fb https://www.facebook.com/share/r/xxxx");
  return processLink(ctx, url, "facebook");
});

bot.command("x", (ctx) => {
  const url = getCommandUrl(ctx);
  if (!url) return ctx.reply("Contoh:\n/x https://x.com/user/status/xxxx");
  return processLink(ctx, url, "twitter");
});

bot.command("threads", (ctx) => {
  const url = getCommandUrl(ctx);
  if (!url) return ctx.reply("Contoh:\n/threads https://www.threads.com/@user/post/xxxx");
  return processLink(ctx, url, "threads");
});

bot.command("stats", (ctx) => {
  if (!adminOnly(ctx)) return ctx.reply("❌ Khusus admin.");

  db.getStats((stats) => {
    let text =
      "📊 *MediaMuncher Stats*\n\n" +
      "👥 Total Users: *" + stats.totalUsers + "*\n" +
      "📥 Total Downloads: *" + stats.totalDownloads + "*\n\n" +
      "🔥 *Platform Populer:*\n";

    if (!stats.platforms.length) text += "- Belum ada data\n";
    for (const p of stats.platforms) text += "• " + p.platform + ": " + p.total + "\n";

    ctx.reply(text, { parse_mode: "Markdown" });
  });
});

bot.command("users", (ctx) => {
  if (!adminOnly(ctx)) return ctx.reply("❌ Khusus admin.");

  db.getUsers((err, rows) => {
    if (err) return ctx.reply("❌ Gagal ambil users.");

    let text = "👥 *Top Users*\n\n";

    if (!rows.length) text += "Belum ada user.";
    for (const u of rows.slice(0, 30)) {
      text +=
        "• " + (u.first_name || "NoName") +
        " (@" + (u.username || "no_username") + ")\n" +
        "ID: `" + u.id + "`\n" +
        "Downloads: *" + u.downloads + "*\n\n";
    }

    ctx.reply(text, { parse_mode: "Markdown" });
  });
});

bot.command("broadcast", (ctx) => {
  if (!adminOnly(ctx)) return ctx.reply("❌ Khusus admin.");

  const msg = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!msg) return ctx.reply("Contoh:\n/broadcast Halo semua!");

  db.getUsers(async (err, rows) => {
    if (err) return ctx.reply("❌ Gagal ambil user.");

    let success = 0;
    let failed = 0;

    for (const user of rows) {
      try {
        await ctx.telegram.sendMessage(
          user.id,
          "📢 *Broadcast MediaMuncher*\n\n" + msg,
          { parse_mode: "Markdown" }
        );
        success++;
        await sleep(100);
      } catch (e) {
        failed++;
      }
    }

    ctx.reply("✅ Broadcast selesai.\n\nBerhasil: " + success + "\nGagal: " + failed);
  });
});

bot.on("text", async (ctx) => {
  db.addUser(ctx.from);

  const text = ctx.message.text.trim();
  if (!text.startsWith("http")) return ctx.reply("📌 Kirim link media nya mas, atau ketik /help.");

  return processLink(ctx, text);
});

bot.catch((err) => console.error("BOT ERROR:", err));

bot.launch();
console.log("MediaMuncher bot aktif...");
