require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const DEFAULT_LIMIT = Math.min(Math.max(Number(process.env.LEADERBOARD_LIMIT || 20), 1), 25);
const ALLOWED_CHANNEL_ID = (process.env.ALLOWED_CHANNEL_ID || "").trim();

function isAllowedChannelId(channelId) {
  return !ALLOWED_CHANNEL_ID || channelId === ALLOWED_CHANNEL_ID;
}

if (!process.env.BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN in .env");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = new sqlite3.Database("./scores.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS players (
    guildId TEXT NOT NULL,
    name TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (guildId, name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS leaderboard_target (
    guildId TEXT PRIMARY KEY,
    channelId TEXT NOT NULL,
    messageId TEXT NOT NULL
  )`);
});

const run = (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, e => e?rej(e):res()));
const get = (sql, params=[]) => new Promise((res, rej) => db.get(sql, params, (e,r)=>e?rej(e):res(r)));
const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (e,r)=>e?rej(e):res(r)));

const normName = s => String(s||"").trim();
const isValidName = s => /^[a-zA-Z0-9 _-]{1,24}$/.test(s);

async function ensurePlayer(guildId, name){ await run(`INSERT OR IGNORE INTO players (guildId,name,score) VALUES (?,?,0)`, [guildId,name]); }
async function playerExists(guildId, name){ return !!(await get(`SELECT 1 ok FROM players WHERE guildId=? AND name=?`, [guildId,name])); }
async function addScore(guildId, name, amount){ await run(`UPDATE players SET score=score+? WHERE guildId=? AND name=?`, [amount,guildId,name]); }
async function setScore(guildId, name, value){ await run(`UPDATE players SET score=? WHERE guildId=? AND name=?`, [value,guildId,name]); }
async function deletePlayer(guildId, name){ await run(`DELETE FROM players WHERE guildId=? AND name=?`, [guildId,name]); }
async function renamePlayer(guildId, oldName, newName){ await run(`UPDATE players SET name=? WHERE guildId=? AND name=?`, [newName,guildId,oldName]); }
async function getScore(guildId, name){ const r = await get(`SELECT score FROM players WHERE guildId=? AND name=?`, [guildId,name]); return r?.score ?? null; }
async function getLeaderboard(guildId, limit){ return all(`SELECT name,score FROM players WHERE guildId=? ORDER BY score DESC, name ASC LIMIT ?`, [guildId,limit]); }

async function setLeaderboardTarget(guildId, channelId, messageId){
  await run(`INSERT INTO leaderboard_target (guildId,channelId,messageId) VALUES (?,?,?)
             ON CONFLICT(guildId) DO UPDATE SET channelId=excluded.channelId, messageId=excluded.messageId`,
            [guildId,channelId,messageId]);
}
async function getLeaderboardTarget(guildId){ return get(`SELECT channelId,messageId FROM leaderboard_target WHERE guildId=?`, [guildId]); }

const padRight = (s,w)=>{ s=String(s??""); return s.length>=w? s.slice(0,w): s+" ".repeat(w-s.length); };
const padLeft  = (s,w)=>{ s=String(s??""); return s.length>=w? s.slice(0,w): " ".repeat(w-s.length)+s; };
const fmtScore = v => Number.isInteger(Number(v)) ? String(Number(v)) : String(Number(v));

async function renderLeaderboardTable(rows){
  const mapped = rows.map(r=>({name:r.name, score:fmtScore(r.score)}));
  const rankW = Math.max(4, String(mapped.length||1).length);
  const nameW = Math.max(4, "Name".length, ...mapped.map(x=>x.name.length));
  const scoreW = Math.max(5, "Score".length, ...mapped.map(x=>x.score.length));
  const header = `${padRight("Rank",rankW)} | ${padRight("Name",nameW)} | ${padRight("Score",scoreW)}`;
  const sep = `${"-".repeat(rankW)}-+-${"-".repeat(nameW)}-+-${"-".repeat(scoreW)}`;
  const lines = ["```pgsql", header, sep];
  mapped.forEach((x,i)=> lines.push(`${padLeft(i+1,rankW)} | ${padRight(x.name,nameW)} | ${padLeft(x.score,scoreW)}`));
  lines.push("```");
  return lines.join("\n");
}

async function updatePinnedLeaderboard(guild, limit=DEFAULT_LIMIT){
  const target = await getLeaderboardTarget(guild.id);
  if (!target) return false;
  if (ALLOWED_CHANNEL_ID && target.channelId !== ALLOWED_CHANNEL_ID) return false;

  const channel = await guild.channels.fetch(target.channelId).catch(()=>null);
  if (!channel || !channel.isTextBased()) return false;
  const msg = await channel.messages.fetch(target.messageId).catch(()=>null);
  if (!msg) return false;

  const rows = await getLeaderboard(guild.id, limit);
  const table = await renderLeaderboardTable(rows);
  await msg.edit(table);
  return true;
}

client.on("interactionCreate", async (it) => {
  try {
    if (!it.isChatInputCommand()) return;
    if (!isAllowedChannelId(it.channelId)) return it.reply({content:"Use this in the allowed leaderboard channel.", ephemeral:true});

    const guild = it.guild;
    if (!guild) return;

    const cmd = it.commandName;

    if (cmd === "lbpin") {
      const limit = it.options.getInteger("limit") ?? DEFAULT_LIMIT;
      const rows = await getLeaderboard(guild.id, limit);
      const table = await renderLeaderboardTable(rows);
      const sent = await it.channel.send(table);
      await setLeaderboardTarget(guild.id, it.channelId, sent.id);
      return it.reply({content:"✅ Live leaderboard message created. I will edit that message on updates.", ephemeral:true});
    }

    if (cmd === "player_add") {
      const name = normName(it.options.getString("name", true));
      if (!isValidName(name)) return it.reply({content:"Invalid name. Use 1-24 chars: letters/numbers/space/_/-", ephemeral:true});
      await ensurePlayer(guild.id, name);
      await updatePinnedLeaderboard(guild).catch(()=>{});
      return it.reply({content:`✅ Added player: **${name}**`, ephemeral:true});
    }

    if (cmd === "player_remove") {
      const name = normName(it.options.getString("name", true));
      await deletePlayer(guild.id, name);
      await updatePinnedLeaderboard(guild).catch(()=>{});
      return it.reply({content:`✅ Removed player (if existed): **${name}**`, ephemeral:true});
    }

    if (cmd === "player_rename") {
      const oldName = normName(it.options.getString("old_name", true));
      const newName = normName(it.options.getString("new_name", true));
      if (!isValidName(newName)) return it.reply({content:"Invalid new name. Use 1-24 chars: letters/numbers/space/_/-", ephemeral:true});
      if (await playerExists(guild.id, newName)) return it.reply({content:"That new name already exists.", ephemeral:true});
      await renamePlayer(guild.id, oldName, newName);
      await updatePinnedLeaderboard(guild).catch(()=>{});
      return it.reply({content:`✅ Renamed **${oldName}** → **${newName}**`, ephemeral:true});
    }

    if (cmd === "add") {
      const name = normName(it.options.getString("name", true));
      const amount = it.options.getNumber("amount") ?? 1;
      if (!isValidName(name)) return it.reply({content:"Invalid name. Use 1-24 chars: letters/numbers/space/_/-", ephemeral:true});
      if (!Number.isFinite(amount) || amount <= 0) return it.reply({content:"Amount must be a positive number.", ephemeral:true});
      if (!await playerExists(guild.id, name)) return it.reply({content:`Player **${name}** not found. Add them first with /player_add`, ephemeral:true});
      await addScore(guild.id, name, amount);
      const updated = await updatePinnedLeaderboard(guild).catch(()=>false);
      if (!updated) return it.reply({content:"No pinned leaderboard yet. Run /lbpin once (Admin) in this channel.", ephemeral:true});
      return it.reply({content:`✅ Added **${amount}** to **${name}** (leaderboard updated).`, ephemeral:true});
    }

    if (cmd === "set") {
      const name = normName(it.options.getString("name", true));
      const value = it.options.getNumber("amount", true);
      if (!isValidName(name)) return it.reply({content:"Invalid name. Use 1-24 chars: letters/numbers/space/_/-", ephemeral:true});
      if (!await playerExists(guild.id, name)) return it.reply({content:`Player **${name}** not found.`, ephemeral:true});
      await setScore(guild.id, name, value);
      await updatePinnedLeaderboard(guild).catch(()=>{});
      return it.reply({content:`✅ Set **${name}** score to **${fmtScore(value)}**`, ephemeral:true});
    }

    if (cmd === "score") {
      const name = normName(it.options.getString("name", true));
      const s = await getScore(guild.id, name);
      if (s == null) return it.reply({content:`Player **${name}** not found.`, ephemeral:true});
      return it.reply({content:`📊 **${name}**: **${fmtScore(s)}**`, ephemeral:true});
    }

    if (cmd === "leaderboard") {
      const limit = it.options.getInteger("limit") ?? DEFAULT_LIMIT;
      const updated = await updatePinnedLeaderboard(guild, limit).catch(()=>false);
      if (!updated) return it.reply({content:"No pinned leaderboard yet. Run /lbpin once (Admin) in this channel.", ephemeral:true});
      return it.reply({content:"✅ Leaderboard refreshed.", ephemeral:true});
    }

  } catch (e) {
    console.error(e);
    try { if (it.isRepliable()) await it.reply({content:"❌ Something went wrong. Check bot logs.", ephemeral:true}); } catch {}
  }
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`Channel restriction: ${ALLOWED_CHANNEL_ID || "(none)"}`);
  console.log(`Default leaderboard limit: ${DEFAULT_LIMIT}`);
});

client.login(process.env.BOT_TOKEN);
