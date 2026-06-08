var ROOM_PREFIX = "room:";
var MAX_ROOM_ID_LENGTH = 80;
var MAX_PARTICIPANTS = 50;

function doGet(e) {
  return handleRoomRequest_(e, "GET");
}

function doPost(e) {
  var payload = parseJsonBody_(e);
  if (payload && payload.type === "participant_connected") {
    handleParticipantNotification_(payload);
    return jsonOutput_({ ok: true, type: "participant_connected" });
  }

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
  var participant = sanitizeParticipant_(body.participant);
  var googleClientId = sanitizeGoogleClientId_(body.googleClientId);
  if (!participant && !googleClientId) {
    return jsonOutput_({ error: "valid participant or googleClientId is required" });
  }

  var nextParticipants = participant
    ? [participant].concat((current.participants || []).filter(function (item) {
        return item.id !== participant.id;
      })).slice(0, MAX_PARTICIPANTS)
    : (current.participants || []);

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

function handleParticipantNotification_(payload) {
  var notifyTo = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (!notifyTo) return;

  var participant = payload.participant || {};
  var lines = [
    "A participant connected a Google Calendar.",
    "",
    "Room: " + (payload.roomId || ""),
    "Name: " + (participant.name || ""),
    "Email: " + (participant.email || ""),
    "Connected at: " + (payload.connectedAt || "")
  ];

  MailApp.sendEmail({
    to: notifyTo,
    subject: "[調整くん] New participant connected",
    body: lines.join("\n")
  });
}

function jsonOutput_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
