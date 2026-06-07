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

export default async (request) => {
  const url = new URL(request.url);
  const roomId = url.searchParams.get("room");
  if (!roomId) return json(400, { error: "room is required" });

  const store = getStore("slotwise-rooms");
  const key = roomKey(roomId);
  const current = (await store.get(key, { type: "json" })) || { participants: [] };

  if (request.method === "GET") {
    return json(200, current);
  }

  if (request.method !== "POST") {
    return json(405, { error: "method not allowed" });
  }

  const body = await request.json().catch(() => null);
  const participant = sanitizeParticipant(body?.participant);
  if (!participant) return json(400, { error: "valid participant is required" });

  const participants = Array.isArray(current.participants) ? current.participants : [];
  const nextParticipants = [
    participant,
    ...participants.filter((item) => item.id !== participant.id)
  ].slice(0, 50);

  const next = {
    roomId,
    participants: nextParticipants,
    updatedAt: new Date().toISOString()
  };
  await store.setJSON(key, next);
  return json(200, next);
};
