require("dotenv").config();

const { App } = require("@slack/bolt");
const axios = require("axios");
const cron = require("node-cron");
const http = require("http");
const db = require("./db");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

// Helper to determine the target Slack channel for notifications
async function getBroadcastChannel() {
  if (process.env.SLACK_CHANNEL_ID) {
    return process.env.SLACK_CHANNEL_ID;
  }
  try {
    const result = await app.client.conversations.list({
      types: "public_channel",
      exclude_archived: true
    });
    // Look for a channel named general, or default to the first available channel
    const generalChannel = result.channels.find(c => c.name === "general") || result.channels[0];
    return generalChannel ? generalChannel.id : null;
  } catch (err) {
    console.error("Error fetching channels:", err);
    return null;
  }
}

// ----------------------------------------------------
// 1. Daily Standup Reporter
// ----------------------------------------------------
app.command("/jarvis-standup", async ({ command, ack, respond }) => {
  await ack();
  const text = command.text.trim();
  const userId = command.user_id;

  if (!text) {
    await respond({
      text: "Please provide your standup details. Example:\n`/jarvis-standup Yesterday I built the DB layer; Today I am writing bot commands; No blockers.`"
    });
    return;
  }

  db.saveStandup(userId, text);
  await respond({ text: "✅ Your standup has been recorded! It will be posted in the daily summary at 9:00 AM." });
});

// Cron job to run at 9:00 AM every day
cron.schedule("0 9 * * *", async () => {
  console.log("Running Daily Standup reporter...");
  const standups = db.getStandups();
  const channelId = await getBroadcastChannel();
  if (!channelId) {
    console.error("No channel found to post the standup summary.");
    return;
  }

  if (Object.keys(standups).length === 0) {
    await app.client.chat.postMessage({
      channel: channelId,
      text: "☀️ *Daily Standup Summary (9:00 AM)*:\nNo standups were submitted for today."
    });
    return;
  }

  let summaryText = "☀️ *Daily Standup Summary (9:00 AM)*:\n\n";
  for (const [userId, text] of Object.entries(standups)) {
    summaryText += `• *<@${userId}>*:\n${text}\n\n`;
  }

  await app.client.chat.postMessage({
    channel: channelId,
    text: summaryText
  });

  db.clearStandups(); // Clear for tomorrow
  console.log("Daily Standup summary posted successfully.");
});

// ----------------------------------------------------
// 2. Fun Facts (/jarvis-fact)
// ----------------------------------------------------
app.command("/jarvis-fact", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
    await respond({
      text: `💡 *Did you know?*\n${response.data.text}`
    });
  } catch (err) {
    await respond({ text: "Failed to fetch a fun fact." });
  }
});

// ----------------------------------------------------
// 3. Moderation (Banned Words)
// ----------------------------------------------------
app.command("/jarvis-mod", async ({ command, ack, respond }) => {
  await ack();
  const parts = command.text.trim().split(" ");
  const action = parts[0].toLowerCase();
  const word = parts.slice(1).join(" ").trim();

  if (action === "add") {
    if (!word) {
      await respond({ text: "Please specify a word to add. Example: `/jarvis-mod add forbidden`" });
      return;
    }
    const added = db.addBannedWord(word);
    await respond({
      text: added ? `✅ Added *"${word}"* to the banned words list.` : `⚠️ *"${word}"* is already in the list.`
    });
  } else if (action === "remove") {
    if (!word) {
      await respond({ text: "Please specify a word to remove. Example: `/jarvis-mod remove forbidden`" });
      return;
    }
    const removed = db.removeBannedWord(word);
    await respond({
      text: removed ? `✅ Removed *"${word}"* from the banned words list.` : `⚠️ *"${word}"* was not found in the list.`
    });
  } else if (action === "list") {
    const list = db.getBannedWords();
    if (list.length === 0) {
      await respond({ text: "The banned words list is currently empty." });
    } else {
      await respond({ text: `🚫 *Banned Words List:*\n${list.map(w => `• ${w}`).join("\n")}` });
    }
  } else {
    await respond({
      text: "Invalid moderation command. Options:\n• `/jarvis-mod add <word>`\n• `/jarvis-mod remove <word>`\n• `/jarvis-mod list`"
    });
  }
});

// Message scanner for moderation
app.message(async ({ message, say, client }) => {
  if (message.subtype === "bot_message" || message.bot_id) return;

  const text = message.text ? message.text.toLowerCase() : "";
  if (!text) return;

  const bannedWords = db.getBannedWords();
  const foundWords = bannedWords.filter(word => text.includes(word));

  if (foundWords.length > 0) {
    try {
      // Attempt to delete message
      await client.chat.delete({
        channel: message.channel,
        ts: message.ts
      });
      // Warn user
      await say(`⚠️ <@${message.user}>, your message was deleted because it contained a banned word.`);
    } catch (err) {
      // Fallback warning if bot does not have deletion permissions
      await say(`⚠️ <@${message.user}>, please watch your language! Banned words detected.`);
      console.error("Could not delete moderated message:", err.message);
    }
  }
});

// ----------------------------------------------------
// 4. Trivia Game with Score Tracking
// ----------------------------------------------------
const triviaQuestions = [
  {
    question: "What is the capital of France?",
    options: ["Paris", "London", "Berlin", "Madrid"],
    answer: "Paris"
  },
  {
    question: "Which programming language was created by Brendan Eich in 10 days?",
    options: ["Java", "JavaScript", "Python", "C++"],
    answer: "JavaScript"
  },
  {
    question: "What is the largest ocean on Earth?",
    options: ["Atlantic Ocean", "Indian Ocean", "Pacific Ocean", "Arctic Ocean"],
    answer: "Pacific Ocean"
  },
  {
    question: "What is the square root of 64?",
    options: ["6", "7", "8", "9"],
    answer: "8"
  },
  {
    question: "Who is known as the father of modern computer science?",
    options: ["Alan Turing", "Ada Lovelace", "Charles Babbage", "Bill Gates"],
    answer: "Alan Turing"
  }
];

const activeGames = {}; // channel_id -> { question, answer }

app.command("/jarvis-trivia", async ({ command, ack, respond }) => {
  await ack();
  const text = command.text.trim().toLowerCase();
  const channelId = command.channel_id;

  if (text === "leaderboard") {
    const scores = db.getScores();
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      await respond({ text: "🏆 No scores recorded yet. Start playing with `/jarvis-trivia`!" });
      return;
    }
    let leaderboard = "🏆 *J.A.R.V.I.S Trivia Leaderboard* 🏆\n\n";
    sorted.forEach(([userId, score], index) => {
      leaderboard += `${index + 1}. <@${userId}>: *${score}* pts\n`;
    });
    await respond({ text: leaderboard });
    return;
  }

  // Check if a game is already active in this channel
  if (activeGames[channelId]) {
    await respond({ text: "⚠️ A trivia game is already active in this channel! Answer the active question first." });
    return;
  }

  // Start new trivia game
  const qObj = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
  activeGames[channelId] = qObj;

  // Send question using Block Kit Interactive Buttons
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🧠 *Trivia Question:* \n\n>${qObj.question}`
      }
    },
    {
      type: "actions",
      elements: qObj.options.map(option => ({
        type: "button",
        text: {
          type: "plain_text",
          text: option
        },
        value: option,
        action_id: `trivia_ans_${option.toLowerCase().replace(/\s+/g, "_")}`
      }))
    }
  ];

  await respond({ blocks });
});

// Interactive Button click handler for trivia answers
app.action(/^trivia_ans_/, async ({ action, ack, body, respond }) => {
  await ack();
  const channelId = body.channel.id;
  const userId = body.user.id;
  const game = activeGames[channelId];

  if (!game) {
    await respond({ text: "No active trivia game in this channel. Start a new one with `/jarvis-trivia`!" });
    return;
  }

  const selectedAnswer = action.value;
  if (selectedAnswer === game.answer) {
    delete activeGames[channelId]; // End game
    const newScore = db.addScore(userId, 1);
    await respond({
      text: `🎉 *Correct!* <@${userId}> answered *${selectedAnswer}* and scored 1 point! Total score: *${newScore}* points.`
    });
  } else {
    await respond({
      text: `❌ *Incorrect!* <@${userId}> guessed *${selectedAnswer}*. Try again!`
    });
  }
});

// ----------------------------------------------------
// 5. GitHub PR Webhook HTTP Server
// ----------------------------------------------------
const webhookServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/github-webhook") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        
        // Listen to Pull Request events
        if (payload.pull_request) {
          const action = payload.action;
          const prTitle = payload.pull_request.title;
          const prUrl = payload.pull_request.html_url;
          const prUser = payload.pull_request.user.login;
          const repoName = payload.repository.full_name;

          const broadcastText = `🔔 *GitHub PR Update* in *${repoName}*\n*Action:* PR was *${action}* by *${prUser}*\n*Title:* ${prTitle}\n*Link:* ${prUrl}`;
          
          const channelId = await getBroadcastChannel();
          if (channelId) {
            await app.client.chat.postMessage({
              channel: channelId,
              text: broadcastText
            });
          }
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Webhook received");
      } catch (err) {
        console.error("Error processing GitHub webhook:", err);
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request");
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

// Start the Github webhook server on port 3000 (or custom environment port)
const WEBHOOK_PORT = process.env.PORT || 3000;
webhookServer.listen(WEBHOOK_PORT, () => {
  console.log(`GitHub Webhook server listening on port ${WEBHOOK_PORT}`);
});

// ----------------------------------------------------
// Core Command Handlers (Original Functions Preserved)
// ----------------------------------------------------
app.command("/jarvis-ping", async ({ command, ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `Pong!\nLatency: ${latency}ms` });
});

app.command("/jarvis-help", async ({ ack, respond }) => {
  await ack();
  await respond({
    text: `Available Commands:
      /jarvis-ping - Check Bot Latency
      /jarvis-help - Show Available Commands
      /jarvis-catfact - Get a cat fact
      /jarvis-joke - Get a random joke
      /jarvis-quote - Get the quote of the day
      /jarvis-weather <city-name> - Show the weather of that city
      /jarvis-standup <text> - Record daily standup status
      /jarvis-fact - Get a random fun fact
      /jarvis-trivia - Play a quiz game (/jarvis-trivia leaderboard to check rankings)
      /jarvis-mod <add/remove/list> <word> - Moderation management (admin)
    `
  });
});

app.command("/jarvis-catfact", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://catfact.ninja/fact");
    await respond({ text: `Cat Fact:\n${response.data.fact}` });
  } catch (err) {
    await respond({ text: "Failed to fetch a cat fact." });
  }
});

app.command("/jarvis-joke", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://official-joke-api.appspot.com/random_joke");
    await respond({
      text: `${response.data.setup}\n\n${response.data.punchline}`
    });
  } catch (err) {
    await respond({ text: "Failed to fetch a joke." });
  }
});

const handleQuote = async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://zenquotes.io/api/today");
    const quote = response.data[0].q;
    const author = response.data[0].a;
    await respond({
      text: `📝 *Quote of the Day:*\n_"${quote}"_\n— *${author}*`
    });
  } catch (err) {
    await respond({ text: "Failed to fetch a quote." });
  }
};

app.command("/jarvis-quote", handleQuote);
app.command("/jarvis-qoute", handleQuote);

app.command("/jarvis-weather", async ({ command, ack, respond }) => {
  await ack();
  const city = command.text.trim();
  if (!city) {
    await respond({ text: "Please provide a city name. Example: `/jarvis-weather London`" });
    return;
  }
  try {
    const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
    await respond({ text: `☀️ *Weather Info:*\n${response.data}` });
  } catch (err) {
    await respond({ text: `⚠️ Failed to fetch weather for *${city}*.` });
  }
});

// Initialize Bolt app
(async () => {
  await app.start();
  console.log("J.A.R.V.I.S bot is running!");
})();