# J.A.R.V.I.S Slack Bot

A feature-rich Slack bot built with Node.js and `@slack/bolt`. J.A.R.V.I.S provides utility, moderation, fun features, and GitHub integration straight to your Slack workspace.

## Features

- **Daily Standups:** Record your daily updates. J.A.R.V.I.S automatically broadcasts a summary every day at 9:00 AM.
- **Moderation:** Automatically detects and deletes messages containing banned words.
- **Trivia Game:** Play interactive trivia directly in Slack with a persistent leaderboard.
- **GitHub PR Webhook:** Receive notifications in Slack whenever a Pull Request is opened or updated on GitHub.
- **Fun Utilities:** Get weather, jokes, cat facts, fun facts, and the quote of the day.

## Prerequisites

- Node.js
- A Slack App with Socket Mode enabled
- Slack Bot Token (`xoxb-...`)
- Slack App Token (`xapp-...`)

## Setup & Installation

1. **Clone the repository** and navigate to the project directory.
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your credentials:
   ```env
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token
   SLACK_CHANNEL_ID=your-default-channel-id # Optional, for standup summaries and PR notifications
   PORT=3000 # Optional, for GitHub webhook server
   ```
4. **Run the bot:**
   ```bash
   node index.js
   ```

## Available Commands

| Command | Description |
|---|---|
| `/jarvis-help` | Show the list of available commands. |
| `/jarvis-ping` | Check the bot's latency. |
| `/jarvis-standup <text>` | Record your daily standup status. |
| `/jarvis-mod <add/remove/list> <word>` | Manage the banned words list for moderation. |
| `/jarvis-trivia` | Start a trivia game. Use `/jarvis-trivia leaderboard` to see scores. |
| `/jarvis-fact` | Get a random fun fact. |
| `/jarvis-catfact` | Get a random cat fact. |
| `/jarvis-joke` | Get a random joke. |
| `/jarvis-quote` | Get the quote of the day. |
| `/jarvis-weather <city>` | Show the weather for a specified city. |

## GitHub Webhook Integration

J.A.R.V.I.S runs an HTTP server (default port 3000) that listens for GitHub webhook events.
Configure your GitHub repository webhook to point to `http://<your-server-domain>/github-webhook` to receive PR updates in your Slack channel.
