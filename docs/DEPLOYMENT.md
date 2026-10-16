# Deployment guide

## 1. Prerequisites

- A [Vercel](https://vercel.com) account (the free Hobby plan is enough)
- A Redis database: [Vercel Marketplace → Redis](https://vercel.com/marketplace?category=storage), Upstash, Redis Cloud, or any server reachable with a `redis://` / `rediss://` URL
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Optional: an [OpenRouter](https://openrouter.ai) API key for creating reminders from free text or voice

## 2. Deploy to Vercel

1. Fork or import this repository in Vercel (**Add New → Project**). No build settings are needed.
2. Connect a Redis database, or add `REDIS_URL` manually.
3. Add the environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `REDIS_URL` | ✅ | Redis connection string |
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from BotFather. Without it sign-up is disabled, because Telegram chat ownership can't be verified |
| `CRON_SECRET` | Recommended | Protects `/api/cron` |
| `OPENROUTER_API_KEY` | Optional | Enables the AI tab |
| `OPENROUTER_MODEL` | Optional | Defaults to `openrouter/auto` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Optional | Generated automatically and stored in Redis if omitted |
| `VAPID_SUBJECT` | Optional | Defaults to `https://<your-domain>` |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Defaults to a value derived from the bot token |

See [`.env.example`](../.env.example).

4. Deploy. Keep **one** Vercel project per Redis database, so the cron doesn't send duplicate messages.

## 3. Connect the Telegram bot

Point the bot at your deployment once:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-domain>/api/webhook"
```

You don't need to set a secret here. On its first run, `/api/cron` re-registers the same webhook with a `secret_token`, then rejects forged requests. It also publishes the command menu (`/today`, `/list`, `/summary`, `/help`, `/id`).

Send `/start` to the bot: it replies with your chat ID, which you enter on the sign-up form.

## 4. Schedule the cron (every minute)

Vercel Cron on the Hobby plan runs at most once a day, so use an external scheduler such as [cron-job.org](https://cron-job.org):

- URL: `https://<your-domain>/api/cron`
- Schedule: every minute
- Header: `Authorization: Bearer <CRON_SECRET>` (or append `?secret=<CRON_SECRET>` to the URL)

**Settings → Notification status** in the app shows when the cron last ran.

## 5. Notifications on each device

- **Android / desktop:** open the app, tap the 🔔 icon or **Settings → Send test notification**, and allow notifications.
- **iPhone / iPad (iOS 16.4+):** open the site in Safari → Share → **Add to Home Screen**, open it from the icon, then allow notifications. Web Push does not work in a regular Safari tab.
- If the test says the push service **accepted** the message but nothing appears, the device is hiding it: turn off **Focus / Do Not Disturb** and check the app in the system notification settings.

## Alternative: Render (free, ads allowed)

Vercel's Hobby plan is for non-commercial use only: donations are fine, but ads are not (see [MONETIZATION.md](MONETIZATION.md)). `server.js` runs the same `api/*.js` handlers and static files as a plain Node server, so the app also runs on Render's free plan, which has no such rule. It also runs on Koyeb, a VPS or Docker.

1. On [render.com](https://render.com) → **New → Blueprint**, pick this repository. `render.yaml` creates a free Node web service.
2. Fill in the environment variables it asks for (the same ones as on Vercel).
3. Point the Telegram webhook at `https://<service>.onrender.com/api/webhook`, and the cron-job.org job at `https://<service>.onrender.com/api/cron`.

A free Render service sleeps after 15 minutes without requests. The every-minute cron request keeps it awake, and 750 free hours a month cover one service running all month. `npm start` runs the same server locally (port `$PORT`, default 3000).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in REDIS_URL and TELEGRAM_BOT_TOKEN
npx vercel dev
```

```bash
npm test            # API, bot, cron and service-worker tests (in-memory Redis, no network)
npm run build:css   # rebuild styles.css after adding Tailwind classes to index.html
```
