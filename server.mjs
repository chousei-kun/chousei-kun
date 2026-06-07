import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const dataDir = join(root, ".data");
const roomsFile = join(dataDir, "rooms.json");

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const fullPath = normalize(join(root, cleanPath));

  if (!fullPath.startsWith(root)) {
    return null;
  }

  return fullPath;
}

async function readRooms() {
  try {
    return JSON.parse(await readFile(roomsFile, "utf8"));
  } catch {
    return {};
  }
}

async function writeRooms(rooms) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(roomsFile, JSON.stringify(rooms, null, 2));
}

function sanitizeRoomId(roomId) {
  return String(roomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
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

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleRoomApi(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const roomId = sanitizeRoomId(url.searchParams.get("room"));
  if (!roomId) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "room is required" }));
    return;
  }

  const rooms = await readRooms();
  const current = rooms[roomId] || { roomId, participants: [] };

  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(current));
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  const body = JSON.parse(await readRequestBody(request) || "{}");
  const participant = sanitizeParticipant(body.participant);
  if (!participant) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "valid participant is required" }));
    return;
  }

  rooms[roomId] = {
    roomId,
    participants: [
      participant,
      ...(current.participants || []).filter((item) => item.id !== participant.id)
    ].slice(0, 50),
    updatedAt: new Date().toISOString()
  };
  await writeRooms(rooms);

  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(rooms[roomId]));
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (request.url.startsWith("/api/room")) {
    try {
      await handleRoomApi(request, response);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Close the other server window or set PORT to another value.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Slotwise is running at http://127.0.0.1:${port}`);
});
