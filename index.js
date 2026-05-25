require("dotenv").config();
const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_BASE = process.env.API_BASE;

function detectPlatform(url) {
  url = url.toLowerCase();

  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  if (url.includes("threads.com") || url.includes("threads.net")) return "threads";

  return null;
}

function findMediaUrl(obj) {
  const text = JSON.stringify(obj);
  const match = text.match(/https?:\/\/[^"'\\]+?\.(mp4|mov|m4v|webm)(\?[^"'\\]*)?/i);
  return match ? match[0] : null;
}

bot.start((ctx) => {
  ctx.reply(
`👋 Halo mas!

Kirim link video dari:
✅ TikTok
✅ Instagram Reels
✅ Facebook
✅ X/Twitter
✅ Threads

Contoh:
https://vt.tiktok.com/xxxx`
  );
});

bot.on("text", async (ctx) => {
  const url = ctx.message.text.trim();

  if (!url.startsWith("http")) {
    return ctx.reply("Kirim link video nya mas.");
  }

  const platform = detectPlatform(url);

  if (!platform) {
    return ctx.reply("Platform belum support mas.");
  }

  const loading = await ctx.reply("⏳ Sedang download mas...");

  try {
    const apiUrl = `${API_BASE}?platform=${platform}&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 60000 });

    const data = res.data;
    const mediaUrl = findMediaUrl(data);

    if (!mediaUrl) {
      console.log(JSON.stringify(data, null, 2));
      return ctx.reply("❌ Gagal ambil video mas. Respon API tidak nemu link mp4.");
    }

    await ctx.replyWithVideo(
      { url: mediaUrl },
      {
        caption: `✅ Berhasil download dari ${platform.toUpperCase()}`
      }
    );

  } catch (err) {
    console.error(err.response?.data || err.message);
    ctx.reply("❌ Error mas, API gagal merespon atau link tidak valid.");
  } finally {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);
    } catch {}
  }
});

bot.launch();

console.log("Bot downloader aktif...");
