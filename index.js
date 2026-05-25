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

function isPhotoUrl(url) {
  return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
}

function getMedia(data) {
  const medias = [];

  // TikTok
  if (data.video) {
    const url = data.video.hdplay || data.video.play || data.video.wmplay;
    if (url) medias.push({ type: "video", url });
  }

  // Facebook format: data.data.hd / data.data.sd
  if (data.data && (data.data.hd || data.data.sd)) {
    medias.push({
      type: "video",
      url: data.data.hd || data.data.sd,
    });
  }

  // Twitter/X kadang array
  if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      const url = item.url || item.video || item.link;
      if (url) medias.push({ type: isPhotoUrl(url) ? "photo" : "video", url });
    }
  }

  // Instagram / Threads / umum
  const candidates =
    data.medias ||
    data.media ||
    (data.data && data.data.medias) ||
    (data.data && data.data.media) ||
    (data.result && data.result.medias) ||
    (data.result && data.result.media);

  if (Array.isArray(candidates)) {
    for (const item of candidates) {
      const url =
        item.url ||
        item.link ||
        item.download_url ||
        item.video ||
        item.image;

      if (!url) continue;

      const typeRaw = String(item.type || item.ext || item.mime || "").toLowerCase();
      const type =
        typeRaw.includes("image") || isPhotoUrl(url) ? "photo" : "video";

      medias.push({ type, url });
    }
  }

  // Direct fallback
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
    medias.push({
      type: isPhotoUrl(direct) ? "photo" : "video",
      url: direct,
    });
  }

  return medias.filter(
    (m, i, arr) => arr.findIndex((x) => x.url === m.url) === i
  );
}

async function processLink(ctx, url) {
  const platform = detectPlatform(url);

  if (!platform) {
    return ctx.reply("❌ Platform belum support mas.");
  }

  const loading = await ctx.reply("⏳ Sedang proses mas...");

  try {
    const apiUrl =
      API_BASE + "?platform=" + platform + "&url=" + encodeURIComponent(url);

    const res = await axios.get(apiUrl, {
      timeout: 60000,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const medias = getMedia(res.data);

    if (!medias.length) {
      console.log(JSON.stringify(res.data, null, 2));
      return ctx.reply("❌ Gagal ambil media mas.");
    }

    for (const media of medias.slice(0, 10)) {
      try {
        if (media.type === "photo") {
          await ctx.replyWithPhoto(
            { url: media.url },
            { caption: "✅ " + platform.toUpperCase() + " Downloader" }
          );
        } else {
          await ctx.replyWithVideo(
            { url: media.url },
            { caption: "✅ " + platform.toUpperCase() + " Downloader" }
          );
        }
      } catch (e) {
        console.error("Gagal kirim media:", e.message);

        // Threads sering gagal fetch image dari Telegram, jangan spam link
        if (platform !== "threads") {
          await ctx.reply("✅ Link media:\n" + media.url);
        }
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
}

bot.start((ctx) => {
  ctx.reply(
    "👋 Halo mas!\n\n" +
      "Kirim link video/foto:\n" +
      "✅ TikTok\n" +
      "✅ Instagram\n" +
      "✅ Facebook\n" +
      "✅ X/Twitter\n" +
      "✅ Threads\n\n" +
      "Contoh:\n" +
      "https://vt.tiktok.com/xxxx"
  );
});

bot.command("tt", async (ctx) => {
  const url = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!url) return ctx.reply("Contoh:\n/tt https://vt.tiktok.com/xxxx");
  return processLink(ctx, url);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (!text.startsWith("http")) {
    return ctx.reply("Kirim link video/foto nya mas.");
  }

  return processLink(ctx, text);
});

bot.launch();
console.log("Bot downloader aktif...");
