var ROOM_PREFIX = "room:";
var MAX_ROOM_ID_LENGTH = 80;
var MAX_PARTICIPANTS = 50;

function doGet(e) {
  return handleRoomRequest_(e, "GET");
}

function doPost(e) {
  var payload = parseJsonBody_(e);
  return handleRoomRequest_(e, "POST", payload);
}

function handleRoomRequest_(e, method, payload) {
  var params = (e && e.parameter) || {};
  var roomId = sanitizeToken_(params.room, MAX_ROOM_ID_LENGTH);
  var hostKey = sanitizeToken_(params.host, MAX_ROOM_ID_LENGTH);

  if (!roomId) {
    return jsonOutput_({ error: "room is required" });
  }

  var current = readRoom_(roomId);
  if (method === "GET") {
    return jsonOutput_(presentRoom_(current, hostKey));
  }

  if (method !== "POST") {
    return jsonOutput_({ error: "method not allowed" });
  }

  var body = payload || {};
  if (body.action === "create_event") {
    return handleCreateEvent_(current, body);
  }

  var participant = sanitizeParticipant_(body.participant);
  var googleClientId = sanitizeGoogleClientId_(body.googleClientId);
  if (!participant && !googleClientId) {
    return jsonOutput_({ error: "valid participant or googleClientId is required" });
  }

  var currentParticipants = current.participants || [];

  var nextParticipants = participant
    ? [participant].concat(currentParticipants.filter(function (item) {
        return item.id !== participant.id;
      })).slice(0, MAX_PARTICIPANTS)
    : currentParticipants;

  var nextRoom = {
    roomId: roomId,
    hostKey: current.hostKey || hostKey || "",
    googleClientId: current.googleClientId || googleClientId || "",
    participants: nextParticipants,
    updatedAt: new Date().toISOString()
  };

  writeRoom_(roomId, nextRoom);
  return jsonOutput_(presentRoom_(nextRoom, hostKey));
}

function parseJsonBody_(e) {
  try {
    var body = (e && e.postData && e.postData.contents) || "";
    return body ? JSON.parse(body) : {};
  } catch (error) {
    return {};
  }
}

function roomKey_(roomId) {
  return ROOM_PREFIX + roomId;
}

function readRoom_(roomId) {
  var raw = PropertiesService.getScriptProperties().getProperty(roomKey_(roomId));
  if (!raw) {
    return { roomId: roomId, participants: [] };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return { roomId: roomId, participants: [] };
  }
}

function writeRoom_(roomId, room) {
  PropertiesService.getScriptProperties().setProperty(roomKey_(roomId), JSON.stringify(room));
}

function sanitizeToken_(value, limit) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, limit);
}

function sanitizeGoogleClientId_(clientId) {
  var value = String(clientId || "").trim();
  if (!value) return "";
  return /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(value) ? value.slice(0, 200) : "";
}

function sanitizeParticipant_(participant) {
  if (!participant || typeof participant !== "object") return null;
  if (!participant.id || !participant.name || !participant.busy) return null;

  return {
    id: String(participant.id).slice(0, 160),
    name: String(participant.name).slice(0, 120),
    email: participant.email ? String(participant.email).slice(0, 160) : "",
    initials: participant.initials ? String(participant.initials).slice(0, 8) : "G",
    calendars: Array.isArray(participant.calendars)
      ? participant.calendars.map(function (calendar) {
          return String(calendar).slice(0, 120);
        }).slice(0, 30)
      : [],
    source: "google",
    customName: Boolean(participant.customName),
    preference: {
      morning: Number(participant.preference && participant.preference.morning || 12),
      afternoon: Number(participant.preference && participant.preference.afternoon || 12),
      buffer: Number(participant.preference && participant.preference.buffer || 12),
      avoidFridayLate: Number(participant.preference && participant.preference.avoidFridayLate || 8)
    },
    busy: participant.busy,
    updatedAt: new Date().toISOString()
  };
}

function presentRoom_(room, hostKey) {
  var canSeeEmails = Boolean(room && room.hostKey && hostKey && room.hostKey === hostKey);
  return {
    roomId: room.roomId || "",
    hostKey: room.hostKey || "",
    googleClientId: room.googleClientId || "",
    participants: (room.participants || []).map(function (participant) {
      return {
        id: participant.id,
        name: participant.name,
        email: canSeeEmails ? participant.email || "" : "",
        initials: participant.initials || "G",
        calendars: Array.isArray(participant.calendars) ? participant.calendars : [],
        source: participant.source || "google",
        customName: Boolean(participant.customName),
        preference: participant.preference || {},
        busy: participant.busy || {},
        updatedAt: participant.updatedAt || ""
      };
    }),
    updatedAt: room.updatedAt || ""
  };
}

function jsonOutput_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleCreateEvent_(room, body) {
  var accessToken = String(body.accessToken || "").trim();
  var calendarId = String(body.calendarId || "primary").trim() || "primary";
  var organizerEmail = String(body.organizerEmail || "").trim().toLowerCase();
  var event = body.event || {};

  if (!accessToken) {
    return jsonOutput_({ error: "accessToken is required" });
  }

  var attendees = (room.participants || [])
    .map(function (participant) {
      return String(participant.email || "").trim().toLowerCase();
    })
    .filter(function (email, index, emails) {
      return email && email !== organizerEmail && emails.indexOf(email) === index;
    })
    .map(function (email) {
      return { email: email };
    });

  var payload = {
    summary: String(event.summary || "調整くん予定"),
    description: String(event.description || ""),
    attendees: attendees,
    start: event.start || {},
    end: event.end || {},
    transparency: "opaque"
  };

  var response = UrlFetchApp.fetch(
    "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calendarId) + "/events?sendUpdates=all",
    {
      method: "post",
      contentType: "application/json; charset=utf-8",
      headers: {
        Authorization: "Bearer " + accessToken
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  var status = response.getResponseCode();
  var text = response.getContentText();
  if (status < 200 || status >= 300) {
    return jsonOutput_({ error: status + " " + text });
  }

  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}
