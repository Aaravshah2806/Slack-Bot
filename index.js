require("dotenv").config();

const { App } = require("@slack/bolt");
const axios = require("axios");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

app.command("/jarvis-ping", async ({ command, ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `Pong!\nLatency: ${latency}ms` });
});

(async () => {
  await app.start();
  console.log("bot is running!");
})();

app.command("/jarvis-help", async ({ack, respond }) => {
    await ack();
    await respond({
      text:
        `Available Commands:
        /jarvis-ping - Check Bot Latency
        /jarvis-help - Show Available Commands
        /jarvis-catfact - Get a cat fact
        /jarvis-joke - Get a random joke
        /jarvis-quote - Get the quote of the day
        /jarvis-weather <city-name> - Show the weather of that city
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
        // wttr.in format=3 returns: "London: ⛅️ +12°C"
        const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
        await respond({ text: `☀️ *Weather Info:*\n${response.data}` });
    } catch (err) {
        await respond({ text: `⚠️ Failed to fetch weather for *${city}*.` });
    }
});