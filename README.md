# 調整くん

Slotwise is an appointment scheduling app powered by Google Calendar `free/busy` data.

## Local development

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173
```

Check:

```powershell
npm run check
```

## First setup

1. Edit `config.js` and set your Google OAuth Client ID
2. Use `config.example.js` as the reference template
3. Start the local server with `npm run dev`

## Project structure

- `index.html` application shell
- `styles.css` interface styles
- `app.js` scheduling logic, Google OAuth, and room sync
- `server.mjs` local server and local room API
- `netlify/functions/room.mjs` Netlify room sync API
- `config.js` local runtime config
- `config.example.js` example runtime config
- `DEPLOY.md` deployment notes

## Runtime config

Set the Google OAuth Client ID in `config.js`.

```js
window.SLOTWISE_CONFIG = {
  googleClientId: "xxxxx.apps.googleusercontent.com"
};
```

The OAuth Client ID is public. Do not put a client secret in this repository.

## Current features

- suggests meeting times in 30 minute increments
- looks ahead 2 months
- imports Google Calendar free/busy per participant
- shares room URLs for invitees
- aggregates participant availability into the host view
- creates Google Calendar events and invites attendees
- visualizes daily availability by participant

## Deployment

See `DEPLOY.md`.

## GitHub readiness

- repository initialized on `main`
- local-only files such as `.data/`, logs, zips, `outputs/`, and `work/` are ignored
- Netlify Functions live under `netlify/functions`
