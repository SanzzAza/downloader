require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_BASE = process.env.API_BASE || "https://dramafeed.vercel.app/api/downloader";

function detectPlatform(url) {
  const u = url.toLowerCase();

  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("threads.com") || u.includes("threads.net")) return "threads";

  return null;
}

function findMediaUrls(data) {
  const urls = [];

  if (data.video) {
    if (data.video.hdplay) urls.push(data.video.hdplay);
    if (data.video.play) urls.push(data.video.play);
    if (data.video.wmplay) urls.push(data.video.wmplay);
  }

  function scan(obj) {
    if (!obj) return;

    if (typeof obj === "string" && obj.startsWith("http")) {
      const s = obj.toLowerCase();

      if (
        s.includes("mime_type=video_mp4") ||
        s.includes(".mp4") ||
        s.includes("video") ||
        s.includes("tiktokcdn") ||
        s.includes("cdninstagram") ||
        s.includes("fbcdn") ||
        s.includes("twimg") ||
        s.includes("threads")
      ) {
        urls.push(obj.replace(/\\u0026/g, "&"));
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(scan);
      return;
    }

    if (typeof obj === "object") {
      Object.values(obj).forEach(scan);
    }
  }

  scan(data);

  return [...new Set(urls)];
}

bot.start((ctx) => {
  ctx.reply(
`👋 Halo mas!

Kirim link video:
✅ TikTok
✅ Instagram
✅ Facebook
✅ X/Twitter
✅ Threads

Contoh:
https://vt.tiktok.com/xxxx`
  );
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (!text.startsWith("http")) {
    return ctx.reply("Kirim link video nya mas.");
  }

  const platform = detectPlatform(text);

  if (!platform) {
    return ctx.reply("Platform belum support mas.");
  }

  const loading = await ctx.reply("⏳ Sedang proses mas...");

  try {
    const apiUrl = `${API_BASE}?platform=${platform}&url=${encodeURIComponent(text)}`;
    const res = await axios.get(apiUrl, {
      timeout: 60000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const mediaUrls = findMediaUrls(res.data);

    if (!mediaUrls.length) {
      console.log(JSON.stringify(res.data, null, 2));
      return ctx.reply("❌ Gagal ambil media mas.");
    }

    for (const mediaUrl of mediaUrls.slice(0, 5)) {
      try {
        await ctx.replyWithVideo(
          { url: mediaUrl },
          { caption: `✅ ${platform.toUpperCase()} Downloader` }
        );
      } catch (e) {
        await ctx.reply(`✅ Link media:\n${mediaUrl}`);
      }
    }

  } catch (err) {
    console.error((err.response && err.response.data) || err.message);
    ctx.reply("❌ Error mas, API gagal merespon atau link tidak valid.");
  } finally {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
    } catch (e) {}
  }
});

bot.launch();
console.log("Bot downloader aktif...");
