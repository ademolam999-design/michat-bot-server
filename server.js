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
const BOT_FOOTER = "\n\n━━━━━━━━━━━━\n🤖 Powered by Michat Bot\n🔗 Join Michat: https://michat.lovable.app";
app.get("/", (req, res) => res.json({ ok: true, users: Object.keys(users).length }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("Running on " + PORT));

app.post("/api/activate-bot", (req, res) => {
  const { phone } = req.body;
  if (users[phone]) { users[phone].lastPost = Date.now(); users[phone].active = true; }
  res.json({ ok: true });
});
app.post("/api/status", (req, res) => {
  const p = String(req.body.phone || "").replace(/[^0-9]/g, "");
  res.json({ connected: !!(users[p] && users[p].connected) });
});
app.post("/api/reset", async (req, res) => {
  const p = String(req.body.phone || "").replace(/[^0-9]/g, "");
  if (users[p]) { try { await users[p].sock.logout(); } catch(e){} try { users[p].sock.end(); } catch(e){} delete users[p]; }
  const folder = path.join(__dirname, "sessions", p);
  if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
  res.json({ ok: true });
});
app.post("/api/get-code", async (req, res) => {
  const cleanPhone = String(req.body.phone || "").replace(/[^0-9]/g, "");
  try {
    if (users[cleanPhone]?.connected) return res.json({ message: "ALREADY-LINKED" });
    if (users[cleanPhone]) { try { users[cleanPhone].sock.end(); } catch(e){} delete users[cleanPhone]; }
    if (!fs.existsSync("sessions")) fs.mkdirSync("sessions");
    const { state, saveCreds } = await useMultiFileAuthState(`sessions/${cleanPhone}`);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, syncFullHistory: false, browser: ["Michat Bot", "Chrome", "1.0.0"] });
    sock.ev.on("creds.update", saveCreds);
    users[cleanPhone] = { sock, lastPost: Date.now(), active: true, connected: false };
    sock.ev.on("connection.update", (u) => {
      if (u.connection === "open") users[cleanPhone].connected = true;
      if (u.connection === "close") {
        if (users[cleanPhone]) users[cleanPhone].connected = false;
        if (u.lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
          delete users[cleanPhone];
          const f = path.join(__dirname, "sessions", cleanPhone);
          if (fs.existsSync(f)) fs.rmSync(f, { recursive: true, force: true });
        }
      }
    });
    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message) continue;
        const u = users[cleanPhone]; if (!u || !u.active) continue;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const jid = msg.key.remoteJid;
        if (text === ".menu") await sock.sendMessage(jid, { text: `🤖 MICHAT BOT\n\n.kick .block .promote .demote .tagall .antilink\n.ai [text] - Create picture\nPaste TikTok link - Download video\n.vv - Open View Once\n${BOT_FOOTER}` });
        if (text.startsWith(".kick")) { const m = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (m) { await sock.groupParticipantsUpdate(jid, [m], "remove"); await sock.sendMessage(jid, { text: `✅ Person removed!${BOT_FOOTER}` }); } }
        if (text.startsWith(".block")) { const m = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (m) { await sock.updateBlockStatus(m, "block"); await sock.sendMessage(jid, { text: `🚫 Person blocked!${BOT_FOOTER}` }); } }
        if (text === ".tagall") { try { const g = await sock.groupMetadata(jid); await sock.sendMessage(jid, { text: `👋 Tagging all!${BOT_FOOTER}`, mentions: g.participants.map(p => p.id) }); } catch{} }
        if (text.includes("tiktok.com")) { try { const r = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`); const d = await r.json(); if (d.data?.play) await sock.sendMessage(jid, { video: { url: d.data.play }, caption: `🎵 Your TikTok!${BOT_FOOTER}` }); } catch{} }
      }
    });
    await new Promise(r => setTimeout(r, 5000));
    const code = await sock.requestPairingCode(cleanPhone);
    res.json({ code });
  } catch(e) { res.json({ message: e.message }); }
});
