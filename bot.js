'use strict';

const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_USER_ID = process.env.USER_ID;

if (!TOKEN) {
  console.error('[ERROR] DISCORD_TOKEN environment variable is not set.');
  process.exit(1);
}

if (!TARGET_USER_ID) {
  console.error('[ERROR] USER_ID environment variable is not set.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

/** Reset the bot's presence to the default idle-watching state. */
function setDefaultPresence() {
  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'for activity changes',
        type: ActivityType.Watching,
      },
    ],
  });
}

/**
 * Extract the first Spotify or generic music (Listening) activity from a list.
 * Returns null if none is found.
 */
function findMusicActivity(activities) {
  return (
    activities.find(
      (a) => a.name === 'Spotify' || a.type === ActivityType.Listening
    ) ?? null
  );
}

/**
 * Update the bot's presence to mirror a music activity.
 * Falls back gracefully when details or state are absent.
 */
function setMusicPresence(activity) {
  const song = activity.details || activity.name;
  const artist = activity.state
    ? activity.state.replace(/^by\s+/i, '')
    : null;
  const album = activity.assets?.largeText || null;

  // Build a human-readable status label shown under the activity name
  const statusParts = [song];
  if (artist) statusParts.push(`by ${artist}`);
  if (album) statusParts.push(`(${album})`);

  const label = statusParts.join(' ');

  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: label,
        type: ActivityType.Listening,
      },
    ],
  });

  return { song, artist, album };
}

client.once('ready', () => {
  console.log(`[INFO] Logged in as ${client.user.tag}`);
  console.log(`[INFO] Monitoring activity for user ID: ${TARGET_USER_ID}`);
  setDefaultPresence();
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (!newPresence || newPresence.userId !== TARGET_USER_ID) return;

  const oldActivities = oldPresence ? oldPresence.activities : [];
  const newActivities = newPresence.activities;

  const oldNames = oldActivities.map((a) => a.name);
  const newNames = newActivities.map((a) => a.name);

  const added = newActivities.filter((a) => !oldNames.includes(a.name));
  const removed = oldActivities.filter((a) => !newNames.includes(a.name));

  const timestamp = new Date().toISOString();

  // --- Music presence mirroring ---
  const currentMusic = findMusicActivity(newActivities);
  const previousMusic = findMusicActivity(oldActivities);

  if (currentMusic) {
    // User is (or just started) listening to music — mirror it on the bot
    const { song, artist, album } = setMusicPresence(currentMusic);
    console.log(
      `[${timestamp}] [MUSIC] Now mirroring: "${song}"` +
        (artist ? ` by ${artist}` : '') +
        (album ? ` — ${album}` : '')
    );
  } else if (previousMusic && !currentMusic) {
    // User stopped listening — revert to default presence
    setDefaultPresence();
    console.log(
      `[${timestamp}] [MUSIC] Playback stopped — reverted to default presence`
    );
  }

  // --- General activity logging ---
  if (added.length === 0 && removed.length === 0) return;

  for (const activity of added) {
    console.log(
      `[${timestamp}] [ACTIVITY STARTED] User ${TARGET_USER_ID} — ${activity.name}` +
        (activity.details ? ` | ${activity.details}` : '') +
        (activity.state ? ` | ${activity.state}` : '')
    );
  }

  for (const activity of removed) {
    console.log(
      `[${timestamp}] [ACTIVITY ENDED]   User ${TARGET_USER_ID} — ${activity.name}`
    );
  }
});

client.on('error', (err) => {
  console.error('[ERROR] Discord client error:', err);
});

client.on('warn', (msg) => {
  console.warn('[WARN]', msg);
});

client.on('disconnect', () => {
  console.log('[INFO] Bot disconnected from Discord.');
});

// Graceful shutdown
const shutdown = () => {
  console.log('[INFO] Received shutdown signal. Destroying client...');
  client.destroy();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.login(TOKEN).catch((err) => {
  console.error('[ERROR] Failed to log in:', err);
  process.exit(1);
});
