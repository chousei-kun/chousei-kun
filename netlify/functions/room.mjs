import { getStore } from "@netlify/blobs";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

function roomKey(roomId) {
  return `room-${roomId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
}

function sanitizeGoogleClientId(clientId) {
  const value = String(clientId || "").trim();
  if (!value) return "";
  return /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(value) ? value.slice(0, 200) : "";
}

function sanitizeHostKey(hostKey) {
  return String(hostKey || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function sanitizeParticipant(participant) {
  if (!participant || typeof participant !== "object") return null;
  if (!participant.id || !participant.name || !participant.busy) return null;

  return {
    id: String(participant.id).slice(0, 160),
    name: String(participant.name).slice(0, 120),
    email: participant.email ? String(participant.email).slice(0, 160) : "",
    initials: participant.initials ? String(participant.initials).slice(0, 8) : "G",
    calendars: Array.isArray(participant.calendars)
      ? participant.calendars.map((calendar) => String(calendar).slice(0, 120)).slice(0, 30)
      : [],
    source: "google",
    customName: Boolean(participant.customName),
    preference: {
      morning: Number(participant.preference?.morning || 12),
      afternoon: Number(participant.preference?.afternoon || 12),
      buffer: Number(participant.preference?.buffer || 12),
      avoidFridayLate: Number(participant.preference?.avoidFridayLate || 8)
    },
    busy: participant.busy,
    updatedAt: new Date().toISOString()
  };
}

function viewerCanSeeEmails(room, hostKey) {
  return Boolean(room?.hostKey && hostKey && room.hostKey === hostKey);
}

function presentRoom(room, hostKey) {
  const canSeeEmails = viewerCanSeeEmails(room, hostKey);
  return {
    ...room,
    googleClientId: room.googleClientId || "",
    participants: (room.participants || []).map((participant) => ({
      ...participant,
      email: canSeeEmails ? participant.email || "" : ""
    }))
  };
}

export default async (request) => {
  const url = new URL(request.url);
  const roomId = url.searchParams.get("room");
  const hostKey = sanitizeHostKey(url.searchParams.get("host"));
  if (!roomId) return json(400, { error: "room is required" });

  const store = getStore("slotwise-rooms");
  const key = roomKey(roomId);
  const current = (await store.get(key, { type: "json" })) || { participants: [] };

  if (request.method === "GET") {
    return json(200, presentRoom(current, hostKey));
  }

  if (request.method !== "POST") {
    return json(405, { error: "method not allowed" });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  const participant = sanitizeParticipant(body?.participant);
  const googleClientId = sanitizeGoogleClientId(body?.googleClientId);
  const nextHostKey = sanitizeHostKey(body?.hostKey);
  const removeParticipantId = body?.removeParticipantId ? String(body.removeParticipantId).slice(0, 160) : "";
  if (action === "setHost") {
    if (!nextHostKey) return json(400, { error: "hostKey is required" });
    const next = {
      roomId,
      hostKey: nextHostKey,
      googleClientId: current.googleClientId || googleClientId || "",
      participants: Array.isArray(current.participants) ? current.participants : [],
      updatedAt: new Date().toISOString()
    };
    await store.setJSON(key, next);
    return json(200, presentRoom(next, nextHostKey));
  }

  if (action === "removeParticipant") {
    if (!removeParticipantId) return json(400, { error: "removeParticipantId is required" });
    const next = {
      roomId,
      hostKey: current.hostKey || nextHostKey || "",
      googleClientId: current.googleClientId || googleClientId || "",
      participants: (Array.isArray(current.participants) ? current.participants : []).filter(
        (item) => item.id !== removeParticipantId
      ),
      updatedAt: new Date().toISOString()
    };
    await store.setJSON(key, next);
    return json(200, presentRoom(next, nextHostKey));
  }

  if (!participant && !googleClientId) {
    return json(400, { error: "valid participant or googleClientId is required" });
  }
  if (current.hostKey && hostKey && current.hostKey !== hostKey) {
    return json(403, { error: "invalid host key" });
  }

  const participants = Array.isArray(current.participants) ? current.participants : [];
  const nextParticipants = participant
    ? [
        participant,
        ...participants.filter((item) => item.id !== participant.id)
      ].slice(0, 50)
    : participants;

  const next = {
    roomId,
    hostKey: current.hostKey || hostKey || "",
    googleClientId: current.googleClientId || googleClientId || "",
    participants: nextParticipants,
    updatedAt: new Date().toISOString()
  };
  await store.setJSON(key, next);
  return json(200, presentRoom(next, hostKey));
};
