const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const fs = require("fs");
const app = express();
app.use(express.json());
app.use((req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); res.header("Access-Control-Allow-Headers", "*"); next(); });
const users = {};
const BOT_FOOTER = "\n\n━━━━━━━━━━━━\n🤖 Powered by Michat Bot\n🔗 Join Michat: https://michat.lovable.app\nPost every day inside Michat or Bot go stop in 3 days!";
app.get("/", (req, res) => res.json({ ok: true, message: "Michat Bot Server is running!", users: Object.keys(users).length }));
app.post("/api/activate-bot", (req, res) => {
  const { phone } = req.body;
  if (users[phone]) { users[phone].lastPost = Date.now(); users[phone].active = true; }
  res.json({ ok: true });
});
app.post("/api/get-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ error: "No phone" });
  try {
    if (!users[phone]) {
      if (!fs.existsSync("sessions")) fs.mkdirSync("sessions");
      const { state, saveCreds } = await useMultiFileAuthState(`sessions/${phone}`);
      const sock = makeWASocket({ version: (await fetchLatestBaileysVersion()).version, auth: state, printQRInTerminal: false });
      sock.ev.on("creds.update", saveCreds);
      users[phone] = { sock, lastPost: Date.now(), active: true };
      sock.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
          if (!msg.message) continue;
          const u = users[phone];
          if (!u.active) continue;
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
    const code = await users[phone].sock.requestPairingCode(phone);
    res.json({ code });
  } catch (e) { console.log(e); res.json({ code: "ALREADY-LINKED" }); }
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Michat Bot Server running on " + PORT));
