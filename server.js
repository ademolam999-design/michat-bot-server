const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const users = {};
const BOT_FOOTER = "\n\n━━━━━━━━━━━━\n🤖 Powered by Michat Bot\n🔗 Join Michat: https://michat.lovable.app\nPost every day inside Michat or Bot go stop in 3 days!";

app.get("/", (req, res) => res.json({ ok: true, message: "Michat Bot Server is running!", users: Object.keys(users).length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("Michat Bot Server running on " + PORT));

app.post("/api/activate-bot", (req, res) => {
  const { phone } = req.body;
  if (users[phone]) { users[phone].lastPost = Date.now(); users[phone].active = true; }
  res.json({ ok: true });
});

// NEW: CHECK REAL STATUS - Are you really connected?
app.post("/api/status", (req, res) => {
  const { phone } = req.body;
  const u = users[phone];
  res.json({ ok: true, connected: !!(u && u.connected), hasSession: !!u });
});

// NEW: CLEAR OLD DEAD SESSION - Fixes "Already Linked" bug
app.post("/api/reset", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ ok: false, message: "No phone" });
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");
  try {
    if (users[cleanPhone]) {
      try { await users[cleanPhone].sock.logout(); } catch (e) {}
      try { users[cleanPhone].sock.end(); } catch (e) {}
      delete users[cleanPhone];
    }
    const sessionPath = path.join(__dirname, "sessions", cleanPhone);
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    console.log("Reset done for " + cleanPhone);
    res.json({ ok: true, message: "Old session cleared. Press GET MY CODE again now." });
  } catch (e) {
    console.log(e);
    res.json({ ok: false, message: "Could not clear: " + e.message });
  }
});

app.post("/api/get-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ error: "No phone" });
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");

  try {
    // If user already exists AND is really connected, then they are truly linked
    if (users[cleanPhone] && users[cleanPhone].connected) {
      return res.json({ message: "ALREADY-LINKED - You are already connected. Go to WhatsApp and type .menu" });
    }

    // If user exists but NOT connected, delete old socket and start fresh
    if (users[cleanPhone] && !users[cleanPhone].connected) {
      try { users[cleanPhone].sock.end(); } catch (e) {}
      delete users[cleanPhone];
    }

    if (!users[cleanPhone]) {
      if (!fs.existsSync("sessions")) fs.mkdirSync("sessions");
      const { state, saveCreds } = await useMultiFileAuthState(`sessions/${cleanPhone}`);
      const sock = makeWASocket({ version: (await fetchLatestBaileysVersion()).version, auth: state, printQRInTerminal: false });
      sock.ev.on("creds.update", saveCreds);

      users[cleanPhone] = { sock, lastPost: Date.now(), active: true, connected: false };

      // Listen for real connection - this was missing before
      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
          console.log("CONNECTED: " + cleanPhone);
          users[cleanPhone].connected = true;
        }
        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode;
          console.log("DISCONNECTED: " + cleanPhone + " reason: " + code);
          users[cleanPhone].connected = false;
          // If WhatsApp logged out, delete the dead session so user can link again
          if (code === DisconnectReason.loggedOut) {
            delete users[cleanPhone];
            const p = path.join(__dirname, "sessions", cleanPhone);
            if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
          }
        }
      });

      sock.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
          if (!msg.message) continue;
          const u = users[cleanPhone];
          if (!u || !u.active) continue;
          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
          const jid = msg.key.remoteJid;
          if (text === ".menu") {
            await sock.sendMessage(jid, { text: `🤖 MICHAT BOT - MENUS\n\n👥 GROUP:\n.kick .block .promote .demote .antilink .tagall .mute\n\n🎨 .ai [text] - Create picture\n🎵 Paste TikTok link - Download video\n👁️ .vv - Open View Once\n${BOT_FOOTER}` });
          }
          if (text.startsWith(".kick")) {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (mentioned) { await sock.groupParticipantsUpdate(jid, [mentioned], "remove"); await sock.sendMessage(jid, { text: `✅ Person removed!${BOT_FOOTER}` }); }
          }
          if (text.startsWith(".block")) {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (mentioned) { await sock.updateBlockStatus(mentioned, "block"); await sock.sendMessage(jid, { text: `🚫 Person blocked!${BOT_FOOTER}` }); }
          }
          if (text === ".tagall") {
            try { const g = await sock.groupMetadata(jid); const members = g.participants.map(p => p.id); await sock.sendMessage(jid, { text: `👋 Tagging all!${BOT_FOOTER}`, mentions: members }); } catch {}
          }
          if (text.includes("tiktok.com")) {
            await sock.sendMessage(jid, { text: `🎵 Downloading TikTok...${BOT_FOOTER}` });
            try { const r = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`); const d = await r.json(); const url = d.data?.play; if (url) await sock.sendMessage(jid, { video: { url }, caption: `🎵 Your TikTok - No Watermark!${BOT_FOOTER}` }); } catch {}
          }
        }
      });
    }

    const code = await users[cleanPhone].sock.requestPairingCode(cleanPhone);
    res.json({ code });
  } catch (e) {
    console.log("get-code error:", e);
    // FIXED: Do NOT say ALREADY-LINKED when it is an error. Tell the real error.
    res.json({ message: "Could not generate code: " + (e.message || "Try pressing Clear Old Session, then GET MY CODE again") });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const phone in users) {
    const u = users[phone];
    const days = Math.floor((now - u.lastPost) / (24*60*60*1000));
    if (days >= 3 && u.active) {
      u.active = false;
      u.sock.sendMessage(phone + "@s.whatsapp.net", { text: `⚠️ You did not post today oh! Your Michat Bot has STOPPED because you no post for 3 days. Go post inside Michat to activate am again!${BOT_FOOTER}` }).catch(()=>{});
    }
  }
}, 60*60*1000);
