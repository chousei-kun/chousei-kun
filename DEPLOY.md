# Deploy

## GitHub Pages

This repository is now prepared for GitHub Pages deployment with GitHub Actions.

- Repository: `https://github.com/chousei-kun/chousei-kun`
- Expected Pages URL for the current repo name: `https://chousei-kun.github.io/chousei-kun/`

If you want the shorter root URL `https://chousei-kun.github.io/`, GitHub's official Pages model requires a repository named `chousei-kun.github.io` for the organization site.

GitHub Pages is a static hosting service, so Netlify Functions and other server-side room APIs do not run there. In this Pages-ready build:

- Google Calendar OAuth still works
- free/busy loading still works
- candidate generation still works
- event creation still works
- room sharing falls back to browser-local storage on GitHub Pages

That means shared rooms on `github.io` do not automatically aggregate multiple people's data across different browsers or devices. Restoring that feature requires a separate backend or storage service.

## Enable Pages

1. Open the repository settings on GitHub
2. Go to `Pages`
3. Set `Source` to `GitHub Actions`
4. Push to `main`
5. Wait for the `pages` workflow to finish

The workflow file lives at:

```text
.github/workflows/pages.yml
```

## Google Cloud

1. Enable Google Calendar API
2. Create an OAuth client of type `Web application`
3. Add the GitHub Pages origin to `Authorized JavaScript origins`
4. Put the OAuth Client ID into `config.js` so the app can load it without showing it in the UI

Use this origin for the current repository setup:

```text
https://chousei-kun.github.io
```

Example runtime config:

```js
window.SLOTWISE_CONFIG = {
  googleClientId: "xxxxx.apps.googleusercontent.com",
  roomStore: "local",
  notificationWebhookUrl: "https://script.google.com/macros/s/your-web-app-id/exec"
};
```

`roomStore: "local"` makes the app use browser-local room storage on GitHub Pages.

## Notification email webhook

If you want an email when a new participant connects a Google Calendar, set `notificationWebhookUrl` to a webhook that accepts JSON `POST` requests.

The app sends:

```json
{
  "type": "participant_connected",
  "app": "調整くん",
  "roomId": "room-id",
  "participant": {
    "id": "google-...",
    "name": "Participant Name",
    "email": "participant@example.com"
  },
  "connectedAt": "2026-06-08T00:00:00.000Z"
}
```

One lightweight option is a Google Apps Script web app. Google documents both `doPost(e)` web apps and mail sending via `MailApp.sendEmail()`.

## Local development

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173
```

## References

- GitHub Pages overview: https://docs.github.com/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Pages custom workflows: https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
