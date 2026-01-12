Names-only Slash Command Leaderboard Bot (ready-to-run)

You get:
- Slash commands like /add, /leaderboard, /lbpin (clean UI like your screenshot)
- Names-only leaderboard (no Discord linking, no @mentions)
- Uses ONE live leaderboard message (the bot EDITS it on updates; no spam)
- SQLite database (scores.db)
- Optional single-channel lock

Quick start:
1) Extract zip
2) Edit .env:
   BOT_TOKEN
   CLIENT_ID (Application ID)
   GUILD_ID (Server ID)
   Optional ALLOWED_CHANNEL_ID
3) Install:
   npm install
4) Register slash commands (instant):
   npm run deploy
5) Run bot:
   npm start

One-time in your leaderboard channel:
- Run /lbpin
This creates the live leaderboard message.

Normal usage:
- /player_add name:"Dek"
- /add name:"Dek" amount:2
- /leaderboard limit:20

Notes:
- /add refuses unknown names (anti-typo). Add players first with /player_add.
- If you set ALLOWED_CHANNEL_ID, the bot ignores commands elsewhere.
- scores.db is created beside index.js after first run.
