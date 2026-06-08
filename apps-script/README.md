# Apps Script room API

Use the code in `Code.gs` as a single Google Apps Script Web App that serves both:

- shared room storage for participants and free/busy aggregation
- notification emails when a new participant connects

## Setup

1. Open your Google Apps Script project.
2. Replace the existing `Code.gs` contents with `apps-script/Code.gs`.
3. Deploy as `Web app`.
5. Set:
   - `Execute as`: Me
   - `Who has access`: Anyone

4. Copy the Web App URL.

## App config

After the Web App is deployed, put the URL into `config.js` like this:

```js
window.SLOTWISE_CONFIG = {
  googleClientId: "xxxxx.apps.googleusercontent.com",
  roomStore: "remote",
  roomApiUrl: "https://script.google.com/macros/s/your-web-app-id/exec",
  preferredGoogleAccount: "your-account@gmail.com",
  notificationWebhookUrl: "https://script.google.com/macros/s/your-web-app-id/exec"
};
```

The same Web App URL can be used for both `roomApiUrl` and `notificationWebhookUrl`.

## Host email notifications

When the host connects their Google Calendar first, the room API stores that host email automatically.
After that, when another participant connects a Google Calendar, an email is sent to the host's Gmail address.
