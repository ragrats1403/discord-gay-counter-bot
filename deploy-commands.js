require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

for (const k of ["BOT_TOKEN","CLIENT_ID","GUILD_ID"]) {
  if (!process.env[k]) { console.error(`❌ Missing ${k} in .env`); process.exit(1); }
}

const commands = [
  new SlashCommandBuilder()
    .setName("lbpin")
    .setDescription("Create the live leaderboard message that the bot will EDIT forever (recommended).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName("limit").setDescription("How many rows to show (1-25)").setMinValue(1).setMaxValue(25)),

  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add points to a player (names-only).")
    .addStringOption(o => o.setName("name").setDescription("Player name (spaces allowed)").setRequired(true))
    .addNumberOption(o => o.setName("amount").setDescription("Points to add (default 1)")),

  new SlashCommandBuilder()
    .setName("set")
    .setDescription("Set a player's score (Admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("name").setDescription("Player name (spaces allowed)").setRequired(true))
    .addNumberOption(o => o.setName("amount").setDescription("New score value").setRequired(true)),

  new SlashCommandBuilder()
    .setName("score")
    .setDescription("Show a player's score.")
    .addStringOption(o => o.setName("name").setDescription("Player name (spaces allowed)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Refresh the pinned leaderboard message (no spam).")
    .addIntegerOption(o => o.setName("limit").setDescription("How many rows to show (1-25)").setMinValue(1).setMaxValue(25)),

  new SlashCommandBuilder()
    .setName("player_add")
    .setDescription("Add a player (Admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("name").setDescription("Player name (spaces allowed)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("player_remove")
    .setDescription("Remove a player (Admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("name").setDescription("Player name (spaces allowed)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("player_rename")
    .setDescription("Rename a player (Admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("old_name").setDescription("Existing player name").setRequired(true))
    .addStringOption(o => o.setName("new_name").setDescription("New player name").setRequired(true)),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log("✅ Slash commands registered to this server (instant).");
})().catch(e => { console.error("❌ Failed to register commands:", e); process.exit(1); });
