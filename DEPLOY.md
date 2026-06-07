# Deploy

## Netlify

This app uses Netlify Functions and Netlify Blobs for room aggregation.
Prefer GitHub import deployment or Netlify CLI deployment instead of static drag and drop only.

Required Netlify settings:

- publish directory: `.`
- functions directory: `netlify/functions`

Important routes:

```text
/api/room
/.netlify/functions/room
```

After deploy, confirm this returns JSON:

```text
https://your-site.netlify.app/api/room?room=test
```

## Google Cloud

1. Enable Google Calendar API
2. Create an OAuth client of type `Web application`
3. Add your site to `Authorized JavaScript origins`
4. Put the OAuth Client ID into `config.js`

Example origins:

```text
https://your-site.netlify.app
http://127.0.0.1:4173
```

## Scopes used

```text
openid
email
profile
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.events
```

## Stored data

Stored:

- participant display name
- participant email
- selected calendar names
- 2 months of busy time ranges

Not stored:

- event titles
- event descriptions
- locations
- attendee lists from source calendars
