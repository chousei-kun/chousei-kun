const people = [];
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const timelinePreviewDays = 21;
const state = {
  meetingType: "online",
  learnedAt: new Date(),
  connected: false,
  accessToken: "",
  googleCalendars: [],
  selectedCalendarIds: new Set(),
  currentGoogleUser: null,
  hostKey: "",
  roomGoogleClientId: "",
  rememberedPreferredAccount: false,
  selectedCandidateKeys: new Set(),
  lastRoomSync: ""
};

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events"
].join(" ");

const formatLocalDateText = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addMonths = (date, months) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

const createDateRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = addMonths(start, 2);
  const range = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    range.push(formatLocalDateText(cursor));
  }
  return range;
};

const dates = createDateRange();
const pageParams = new URLSearchParams(window.location.search);
const initialRoomId = pageParams.get("room");
const roomId = initialRoomId || crypto.randomUUID();
const isInviteLink = pageParams.get("invite") === "1";
const configuredGoogleClientId = window.SLOTWISE_CONFIG?.googleClientId || "";
const configuredRoomStore = window.SLOTWISE_CONFIG?.roomStore || "";
const configuredPreferredGoogleAccount = window.SLOTWISE_CONFIG?.preferredGoogleAccount || "";
const configuredNotificationWebhookUrl = window.SLOTWISE_CONFIG?.notificationWebhookUrl || "";
const prefersLocalRoomStore = configuredRoomStore === "local" || window.location.hostname.endsWith("github.io");
const hostKeyStorageKey = `chousei-kun.hostKey.${roomId}`;
const storedHostKey = localStorage.getItem(hostKeyStorageKey) || "";
const hostKeyFromUrl = pageParams.get("host") || "";
const localRoomStorageKey = `chousei-kun.room.${roomId}`;
const preferredAccountSnapshotKey = "chousei-kun.preferred-account-snapshot";

if (!state.hostKey) {
  if (hostKeyFromUrl) {
    state.hostKey = hostKeyFromUrl;
  } else if (storedHostKey) {
    state.hostKey = storedHostKey;
  } else if (!isInviteLink && !initialRoomId) {
    state.hostKey = crypto.randomUUID();
  } else {
    state.hostKey = "";
  }
}

if (state.hostKey) {
  localStorage.setItem(hostKeyStorageKey, state.hostKey);
}

document.querySelector("#currentOrigin").textContent = window.location.origin;
document.querySelector("#inviteBanner").hidden = !isInviteLink;

function currentGoogleClientId() {
  return configuredGoogleClientId || state.roomGoogleClientId || "";
}

function currentPreferredGoogleAccount() {
  return configuredPreferredGoogleAccount.trim().toLowerCase();
}

function currentNotificationWebhookUrl() {
  return configuredNotificationWebhookUrl.trim();
}

function updateConnectionUi() {
  const button = document.querySelector("#connectButton");
  const status = document.querySelector("#oauthStatus");

  if (state.connected) {
    button.innerHTML = '<span aria-hidden="true">✓</span><span>Google連携済み</span>';
    status.textContent = state.rememberedPreferredAccount ? "連携済み（再開）" : "連携済み";
  } else {
    button.innerHTML = '<span aria-hidden="true">＋</span><span>カレンダー連携</span>';
    status.textContent = "未連携";
  }

  updateHostUi();
}

function updateHostUi() {
  const hostStatus = document.querySelector("#hostStatus");
  const hostButtonLabel = document.querySelector("#becomeHostButton span:last-child");

  if (hostStatus) {
    hostStatus.textContent = state.hostKey ? "ホスト中" : "未設定";
  }

  if (hostButtonLabel) {
    hostButtonLabel.textContent = state.hostKey ? "ホスト設定" : "ホストになる";
  }
}

function persistHostKey(hostKey) {
  state.hostKey = hostKey || "";
  if (state.hostKey) {
    localStorage.setItem(hostKeyStorageKey, state.hostKey);
  } else {
    localStorage.removeItem(hostKeyStorageKey);
  }
  updateHostUi();
}

function resetGoogleConnectionState() {
  state.connected = false;
  state.accessToken = "";
  state.currentGoogleUser = null;
  state.googleCalendars = [];
  state.selectedCalendarIds = new Set();
  state.rememberedPreferredAccount = false;
  localStorage.removeItem(preferredAccountSnapshotKey);
  updateConnectionUi();
  updateAll();
}

async function claimHostRole() {
  const hostKey = state.hostKey || crypto.randomUUID();
  persistHostKey(hostKey);

  try {
    await roomRequest({
      method: "POST",
      body: JSON.stringify({
        action: "setHost",
        hostKey
      })
    });
    await loadRoomParticipants({ quiet: true });
    setImportStatus("ホスト権限を有効にしました");
  } catch (error) {
    setImportStatus(`ホスト権限の設定に失敗しました: ${error.message}`, "error");
  }
}

async function disconnectGoogleConnection() {
  const participantId = state.currentGoogleUser ? participantIdForProfile(state.currentGoogleUser) : "";
  const token = state.accessToken;

  if (token && window.google?.accounts?.oauth2?.revoke) {
    await new Promise((resolve) => {
      window.google.accounts.oauth2.revoke(token, () => resolve());
    }).catch(() => {});
  }

  if (participantId) {
    const removedIndex = people.findIndex((person) => person.id === participantId);
    if (removedIndex >= 0) {
      people.splice(removedIndex, 1);
    }
    try {
      await roomRequest({
        method: "POST",
        body: JSON.stringify({
          action: "removeParticipant",
          removeParticipantId: participantId,
          hostKey: state.hostKey
        })
      });
    } catch {
      // Local state still clears even if the room update fails.
    }
  }

  resetGoogleConnectionState();
  updateAll();
  setImportStatus("Google 連携を解除しました");
}

function persistPreferredAccountSnapshot(participant) {
  if (!currentPreferredGoogleAccount()) return;
  if ((participant.email || "").toLowerCase() !== currentPreferredGoogleAccount()) return;

  const snapshot = {
    savedAt: new Date().toISOString(),
    participant,
    currentGoogleUser: state.currentGoogleUser,
    selectedCalendarIds: [...state.selectedCalendarIds]
  };
  localStorage.setItem(preferredAccountSnapshotKey, JSON.stringify(snapshot));
}

function restorePreferredAccountSnapshot() {
  if (!currentPreferredGoogleAccount()) return;

  try {
    const snapshot = JSON.parse(localStorage.getItem(preferredAccountSnapshotKey) || "null");
    if (!snapshot?.participant) return;
    if ((snapshot.participant.email || "").toLowerCase() !== currentPreferredGoogleAccount()) return;

    upsertParticipant(snapshot.participant);
    state.currentGoogleUser = snapshot.currentGoogleUser || null;
    state.selectedCalendarIds = new Set(snapshot.selectedCalendarIds || []);
    state.connected = true;
    state.rememberedPreferredAccount = true;
    updateConnectionUi();
    setImportStatus("以前の連携状態を復元しました。新しい候補を再読み込みしています。");
  } catch {
    // Ignore broken local snapshots.
  }
}

function buildShareUrl() {
  const params = new URLSearchParams({
    room: roomId,
    invite: "1"
  });
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function refreshShareUrl() {
  document.querySelector("#shareUrl").value = buildShareUrl();
}

function renderShareModeNote() {
  const note = document.querySelector("#shareModeNote");
  if (!note) return;
  note.textContent = prefersLocalRoomStore
    ? "GitHub Pages ではルーム情報をこのブラウザ内に保存します。複数人の自由な共有を見るには、通常の保存方式を使ってください。"
    : "URL から読み込めます。Google 連携をすると自由に予定を作れます。";
}

refreshShareUrl();
renderShareModeNote();
updateConnectionUi();

const minuteOfDay = (time) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

const timeFromMinute = (minutes) => {
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
};

const formatDate = (dateText) => {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`;
};

const formatCandidateMessageDate = (dateText) => {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`;
};

const candidateKey = (candidate) => `${candidate.dateText}-${candidate.start}-${candidate.end}`;

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function normalizedDurationMinutes({ commit = false } = {}) {
  const input = document.querySelector("#duration");
  const parsed = Number(input.value);
  if (!input.value.trim() || !Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.min(480, Math.max(1, Math.round(parsed)));
  if (commit && String(normalized) !== input.value) {
    input.value = String(normalized);
  }
  return normalized;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initialsFromName(name) {
  return String(name || "Google User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "G";
}

function participantById(participantId) {
  return people.find((person) => person.id === participantId) || null;
}

function currentParticipantId() {
  return state.currentGoogleUser ? participantIdForProfile(state.currentGoogleUser) : "";
}

function canEditParticipant(person) {
  if (!isInviteLink) return true;
  return person.id === currentParticipantId();
}

function renderParticipantNameControl(person) {
  if (!canEditParticipant(person)) {
    return `
      <div class="name-editor readonly">
        <span>蜿ょ刈閠・錐</span>
        <div class="readonly-name">${escapeHtml(person.name)}</div>
      </div>
    `;
  }

  return `
    <label class="name-editor">
      <span>蜿ょ刈閠・錐</span>
      <input
        class="name-input"
        type="text"
        maxlength="120"
        data-participant-id="${escapeHtml(person.id)}"
        data-saved-name="${escapeHtml(person.name)}"
        value="${escapeHtml(person.name)}"
      />
    </label>
  `;
}

function sanitizeGoogleClientIdClient(clientId) {
  const value = String(clientId || "").trim();
  if (!value) return "";
  return /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(value) ? value.slice(0, 200) : "";
}

function readLocalRoom() {
  try {
    const stored = localStorage.getItem(localRoomStorageKey);
    return stored ? JSON.parse(stored) : { roomId, participants: [] };
  } catch {
    return { roomId, participants: [] };
  }
}

function writeLocalRoom(room) {
  localStorage.setItem(localRoomStorageKey, JSON.stringify(room));
}

function presentLocalRoom(room) {
  const canSeeEmails = Boolean(room?.hostKey && state.hostKey && room.hostKey === state.hostKey);
  return {
    ...room,
    googleClientId: room.googleClientId || "",
    participants: (room.participants || []).map((participant) => ({
      ...participant,
      email: canSeeEmails ? participant.email || "" : ""
    }))
  };
}

function renderCandidateMessage(candidates = []) {
  const textarea = document.querySelector("#candidateMessage");
  if (!textarea) return;
  const selected = candidates.filter((candidate) => state.selectedCandidateKeys.has(candidateKey(candidate)));

  if (!selected.length) {
    textarea.value = "";
    return;
  }

  textarea.value = selected.map((candidate, index) => {
    const marker = ["竭", "竭｡", "竭｢", "竭｣", "竭､", "竭･", "竭ｦ", "竭ｧ"][index] || `${index + 1}.`;
    return `${marker}${formatCandidateMessageDate(candidate.dateText)} ${timeFromMinute(candidate.start)}~`;
  }).join("\n");
}

async function localRoomRequest(options = {}) {
  const current = readLocalRoom();

  if (!options.method || options.method === "GET") {
    return presentLocalRoom(current);
  }

  if (options.method !== "POST") {
    throw new Error("method not allowed");
  }

  const body = JSON.parse(options.body || "{}");
  const action = String(body.action || "");
  const participant = body.participant && typeof body.participant === "object" ? body.participant : null;
  const googleClientId = sanitizeGoogleClientIdClient(body.googleClientId);
  const nextHostKey = String(body.hostKey || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const removeParticipantId = body.removeParticipantId ? String(body.removeParticipantId).slice(0, 160) : "";

  if (action === "setHost") {
    if (!nextHostKey) throw new Error("hostKey is required");
    const nextRoom = {
      roomId,
      hostKey: nextHostKey,
      googleClientId: current.googleClientId || googleClientId || "",
      participants: Array.isArray(current.participants) ? current.participants : [],
      updatedAt: new Date().toISOString()
    };
    writeLocalRoom(nextRoom);
    return presentLocalRoom(nextRoom);
  }

  if (action === "removeParticipant") {
    if (!removeParticipantId) throw new Error("removeParticipantId is required");
    const nextRoom = {
      roomId,
      hostKey: current.hostKey || nextHostKey || "",
      googleClientId: current.googleClientId || googleClientId || "",
      participants: (Array.isArray(current.participants) ? current.participants : []).filter(
        (item) => item.id !== removeParticipantId
      ),
      updatedAt: new Date().toISOString()
    };
    writeLocalRoom(nextRoom);
    return presentLocalRoom(nextRoom);
  }


  if (!participant && !googleClientId) {
    throw new Error("valid participant or googleClientId is required");
  }

  const nextParticipants = participant
    ? [
        participant,
        ...((current.participants || []).filter((item) => item.id !== participant.id))
      ].slice(0, 50)
    : (current.participants || []);

  const nextRoom = {
    roomId,
    hostKey: current.hostKey || state.hostKey || "",
    googleClientId: current.googleClientId || googleClientId || "",
    participants: nextParticipants,
    updatedAt: new Date().toISOString()
  };

  writeLocalRoom(nextRoom);
  return presentLocalRoom(nextRoom);
}

async function notifyNewParticipantConnection(participant) {
  const webhookUrl = currentNotificationWebhookUrl();
  if (!webhookUrl || !participant?.email) return;

  try {
    const payload = JSON.stringify({
      type: "participant_connected",
      app: "隱ｿ謨ｴ縺上ｓ",
      roomId,
      participant: {
        id: participant.id,
        name: participant.name,
        email: participant.email
      },
      connectedAt: new Date().toISOString()
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(webhookUrl, blob)) return;
    }

    await fetch(webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: payload,
      keepalive: true
    });
  } catch {
    // Ignore notification failures so calendar import still succeeds.
  }
}

function mergedBusyForDate(dateText, bufferMinutes) {
  const ranges = [];
  people.forEach((person) => {
    (person.busy[dateText] || []).forEach(([start, end]) => {
      ranges.push({
        start: Math.max(0, minuteOfDay(start) - bufferMinutes),
        end: Math.min(24 * 60, minuteOfDay(end) + bufferMinutes),
        person: person.name
      });
    });
  });
  return ranges.sort((a, b) => a.start - b.start);
}

function slotIsFree(dateText, start, end, bufferMinutes) {
  return !mergedBusyForDate(dateText, bufferMinutes).some((range) =>
    overlaps(start, end, range.start, range.end)
  );
}

function scoreSlot(dateText, start, duration, meetingType) {
  const hour = Math.floor(start / 60);
  const date = new Date(`${dateText}T00:00:00+09:00`);
  let score = 60;
  const reasons = [];

  const preferenceScore = people.reduce((sum, person) => {
    const dayPart = hour < 12 ? person.preference.morning : person.preference.afternoon;
    const fridayPenalty = date.getDay() === 5 && hour >= 16 ? person.preference.avoidFridayLate : 0;
    return sum + dayPart - fridayPenalty + person.preference.buffer * 0.35;
  }, 0);

  score += preferenceScore / Math.max(people.length, 1);

  if (hour >= 10 && hour <= 11) {
    score += 8;
    reasons.push("午前に近い時間");
  }

  if (hour === 12 || hour === 13) {
    score -= 14;
    reasons.push("昼休みの時間帯");
  }

  if (meetingType === "onsite") {
    score -= hour < 11 ? 2 : 0;
    reasons.push("対面向けの調整");
  }

  if (duration <= 30) {
    score += 5;
    reasons.push("短時間で調整しやすい");
  }

  if (date.getDay() === 0 || date.getDay() === 6) {
    score -= 20;
    reasons.push("週末は優先度を下げる");
  }

  if (!reasons.length) {
    reasons.push("全体のバランスがよい");
  }

  return {
    score: Math.max(1, Math.min(99, Math.round(score))),
    reasons
  };
}

function generateSuggestions() {
  if (!people.length) return [];

  const duration = normalizedDurationMinutes();
  if (!duration) return [];
  const count = Number(document.querySelector("#candidateCount").value);
  const workStart = minuteOfDay(document.querySelector("#workStart").value);
  const workEnd = minuteOfDay(document.querySelector("#workEnd").value);
  const buffer = document.querySelector("#bufferToggle").checked ? 15 : 0;
  const candidates = [];

  dates.forEach((dateText) => {
    for (let start = workStart; start + duration <= workEnd; start += 30) {
      const end = start + duration;
      if (!slotIsFree(dateText, start, end, buffer)) continue;
      const scored = scoreSlot(dateText, start, duration, state.meetingType);
      candidates.push({ dateText, start, end, ...scored });
    }
  });

  return candidates
    .sort((a, b) => b.score - a.score || a.dateText.localeCompare(b.dateText) || a.start - b.start)
    .slice(0, count);
}

function renderTimeline() {
  const timeline = document.querySelector("#timeline");
  const buffer = document.querySelector("#bufferToggle").checked ? 15 : 0;
  const workStart = minuteOfDay(document.querySelector("#workStart").value);
  const workEnd = minuteOfDay(document.querySelector("#workEnd").value);
  const span = workEnd - workStart;
  const hideOwner = document.querySelector("#hideOwnerToggle").checked;
  document.querySelector("#privacyBadge").textContent = hideOwner ? "隧ｳ邏ｰ髱櫁｡ｨ遉ｺ" : "諡・ｽ楢・｡ｨ遉ｺ";

  const ticks = [];
  for (let minute = workStart; minute <= workEnd; minute += 120) {
    ticks.push({ minute, label: timeFromMinute(minute) });
  }
  if (!ticks.some((tick) => tick.minute === workEnd)) {
    ticks.push({ minute: workEnd, label: timeFromMinute(workEnd) });
  }

  const renderTicks = () => ticks.map((tick) => {
    const left = ((tick.minute - workStart) / span) * 100;
    return `<span class="time-tick" style="left:${left}%">${tick.label}</span>`;
  }).join("");

  const renderBusyBlocks = (ranges, dateText, personName = "") => ranges.map((range) => {
    const left = Math.max(0, ((range.start - workStart) / span) * 100);
    const right = Math.min(100, ((range.end - workStart) / span) * 100);
    const width = Math.max(2, right - left);
    const title = personName ? `${personName} busy` : (hideOwner ? "busy" : `${range.person} busy`);
    return `<span class="busy-block" title="${title}" style="left:${left}%;width:${width}%"></span>`;
  }).join("");

  const renderFreeBadge = (dateText, person) => {
    const hasBusy = (person.busy[dateText] || []).some(([start, end]) =>
      overlaps(workStart, workEnd, minuteOfDay(start), minuteOfDay(end))
    );
    return hasBusy ? "予定あり" : "空きあり";
  };

  const rows = dates.slice(0, timelinePreviewDays).map((dateText) => {
    const summaryBlocks = renderBusyBlocks(mergedBusyForDate(dateText, buffer), dateText);
    const peopleRows = people.map((person) => {
      const personalRanges = (person.busy[dateText] || []).map(([start, end]) => ({
        start: Math.max(0, minuteOfDay(start) - buffer),
        end: Math.min(24 * 60, minuteOfDay(end) + buffer)
      })).sort((a, b) => a.start - b.start);
      return `
        <div class="person-availability-row">
          <div class="person-availability-name">
            <span>${person.name}</span>
            <strong>${renderFreeBadge(dateText, person)}</strong>
          </div>
          <div class="bar person-bar" aria-label="${formatDate(dateText)} ${person.name}">
            ${renderTicks()}
            ${renderBusyBlocks(personalRanges, dateText, person.name)}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="day-card">
        <div class="day-row">
          <div class="day-label">${formatDate(dateText)}</div>
          <div class="bar" aria-label="${formatDate(dateText)}">
            ${renderTicks()}
            ${summaryBlocks}
          </div>
        </div>
        <div class="person-availability">
          ${peopleRows || '<div class="empty-state timeline-empty">蜿ょ刈閠・′謗･邯壹☆繧九→繝ｦ繝ｼ繧ｶ繝ｼ蛻･縺ｮ遨ｺ縺咲憾豕√ｒ陦ｨ遉ｺ縺励∪縺吶・/div>'}
        </div>
      </div>
    `;
  }).join("");

  timeline.innerHTML = `
    <div class="timeline-summary">蛟呵｣懈､懃ｴ｢: ${formatDate(dates[0])} - ${formatDate(dates[dates.length - 1])} / 陦ｨ遉ｺ: 蜈磯ｭ${timelinePreviewDays}譌･</div>
    ${rows}
  `;
}

function renderSuggestions() {
  const suggestions = document.querySelector("#suggestions");
  if (!people.length) {
    suggestions.innerHTML = `
      <article class="suggestion-card empty-state">
        <strong>Google 繧ｫ繝ｬ繝ｳ繝繝ｼ繧呈磁邯壹＠縺ｦ縺上□縺輔＞</strong>
        <span>蜿ょ刈閠・′霑ｽ蜉縺輔ｌ繧九→縲・繧ｫ譛亥・縺ｾ縺ｧ縺ｮ遨ｺ縺榊呵｣懊ｒ逕滓・縺励∪縺吶・/span>
      </article>
    `;
    renderCandidateMessage([]);
    return;
  }

  const duration = normalizedDurationMinutes();
  if (!duration) {
    suggestions.innerHTML = `
      <article class="suggestion-card empty-state">
        <strong>謇隕∵凾髢薙ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞</strong>
        <span>1蛻・腰菴阪〒閾ｪ逕ｱ縺ｫ蜈･蜉帙〒縺阪∪縺吶よ焚蟄励ｒ蜈･繧後ｋ縺ｨ蛟呵｣懊ｒ險育ｮ励＠縺ｾ縺吶・/span>
      </article>
    `;
    renderCandidateMessage([]);
    return;
  }

  const candidates = generateSuggestions();
  const candidateKeys = new Set(candidates.map(candidateKey));
  state.selectedCandidateKeys = new Set(
    [...state.selectedCandidateKeys].filter((key) => candidateKeys.has(key))
  );

  if (!candidates.length) {
    suggestions.innerHTML = `
      <article class="suggestion-card empty-state">
        <strong>蛟呵｣懊′隕九▽縺九ｊ縺ｾ縺帙ｓ</strong>
        <span>讌ｭ蜍呎凾髢薙∵園隕∵凾髢薙∝燕蠕後ヰ繝・ヵ繧｡繧定ｪｿ謨ｴ縺励※縺上□縺輔＞縲・/span>
      </article>
    `;
    renderCandidateMessage([]);
    return;
  }

  suggestions.innerHTML = candidates.map((candidate, index) => `
    <article class="suggestion-card ${state.selectedCandidateKeys.has(candidateKey(candidate)) ? "selected" : ""}" data-date="${candidate.dateText}" data-start="${candidate.start}" data-end="${candidate.end}">
      <div class="suggestion-head">
        <div>
          <div class="suggestion-date">${index + 1}. ${formatDate(candidate.dateText)}</div>
          <div>${timeFromMinute(candidate.start)} - ${timeFromMinute(candidate.end)}</div>
        </div>
        <div class="score">${candidate.score}</div>
      </div>
      <div class="reason-list">
        ${candidate.reasons.map((reason) => `<span class="reason">${reason}</span>`).join("")}
      </div>
      <button class="ghost-button select-candidate-button" type="button" data-key="${candidateKey(candidate)}">
        <span aria-hidden="true">${state.selectedCandidateKeys.has(candidateKey(candidate)) ? "✓" : "＋"}</span><span>${state.selectedCandidateKeys.has(candidateKey(candidate)) ? "選択中" : "候補に追加"}</span>
      </button>
      <button class="primary-button create-event-button" type="button" data-date="${candidate.dateText}" data-start="${candidate.start}" data-end="${candidate.end}">
        <span aria-hidden="true">＋</span><span>予定を作成</span>
      </button>
    </article>
  `).join("");

  suggestions.querySelectorAll(".create-event-button").forEach((button) => {
    button.addEventListener("click", () => createCalendarEventFromCandidate(button));
  });

  suggestions.querySelectorAll(".select-candidate-button").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      if (!key) return;
      if (state.selectedCandidateKeys.has(key)) {
        state.selectedCandidateKeys.delete(key);
      } else {
        state.selectedCandidateKeys.add(key);
      }
      renderSuggestions();
    });
  });

  renderCandidateMessage(candidates);
}

function renderPeople() {
  const peopleList = document.querySelector("#peopleList");
  if (!people.length) {
    peopleList.innerHTML = `
      <article class="person-card empty-state">
        <strong>蜿ょ刈閠・・縺ｾ縺縺・∪縺帙ｓ</strong>
        <span>蜷・Θ繝ｼ繧ｶ繝ｼ縺・Google 縺ｧ險ｱ蜿ｯ縺吶ｋ縺ｨ縲√％縺薙↓蜿ょ刈閠・→縺励※霑ｽ蜉縺輔ｌ縺ｾ縺吶・/span>
      </article>
    `;
    return;
  }

  peopleList.innerHTML = people.map((person) => `
      <article class="person-card">
        <div class="person-head">
          <div class="avatar">${person.initials}</div>
          <div>
            <strong>${escapeHtml(person.name)}</strong>
            <div class="pill secure">Google謗･邯壽ｸ医∩</div>
          </div>
        </div>
      ${renderParticipantNameControl(person)}
      <p class="person-meta">${
        canEditParticipant(person)
          ? "名前はその場で編集できます。メールアドレスは他の参加者には表示されません。"
          : "この参加者の名前は編集できません。メールアドレスは他の参加者には表示されません。"
      }</p>
    </article>
  `).join("");

  attachParticipantNameEditors();
}

function upsertParticipant(participant) {
  const existingIndex = people.findIndex((person) => person.id === participant.id);
  if (existingIndex >= 0) {
    const current = people[existingIndex];
    people[existingIndex] = {
      ...current,
      ...participant,
      email: participant.email || current.email || "",
      customName: participant.customName ?? current.customName ?? false
    };
  } else {
    people.unshift(participant);
  }
}

function attachParticipantNameEditors() {
  document.querySelectorAll(".name-input").forEach((input) => {
    const commit = () => saveParticipantName(input);
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });
}

async function saveParticipantName(input) {
  const participantId = input.dataset.participantId;
  const previousName = input.dataset.savedName || "";
  const nextName = input.value.trim();

  if (!participantId) return;
  if (!nextName) {
    input.value = previousName;
    return;
  }
  if (nextName === previousName) return;

  const participant = participantById(participantId);
  if (!participant) return;
  if (!canEditParticipant(participant)) {
    input.value = previousName;
    setImportStatus("諡帛ｾ・・縺ｧ縺ｯ莉悶・蜿ょ刈閠・錐縺ｯ邱ｨ髮・〒縺阪∪縺帙ｓ", "error");
    return;
  }

  const updatedParticipant = {
    ...participant,
    name: nextName,
    initials: initialsFromName(nextName),
    customName: true
  };

  upsertParticipant(updatedParticipant);
  updateAll();

  try {
    await publishParticipantToRoom(updatedParticipant);
    setImportStatus(`${nextName} 縺ｮ陦ｨ遉ｺ蜷阪ｒ譖ｴ譁ｰ縺励∪縺励◆`);
  } catch (error) {
    upsertParticipant({
      ...participant,
      name: previousName,
      initials: initialsFromName(previousName),
      customName: participant.customName ?? false
    });
    updateAll();
    setImportStatus(`陦ｨ遉ｺ蜷阪・菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆: ${error.message}`, "error");
  }
}

async function roomRequest(options = {}) {
  if (prefersLocalRoomStore) {
    return localRoomRequest(options);
  }

  const queryParams = new URLSearchParams({ room: roomId });
  if (state.hostKey) {
    queryParams.set("host", state.hostKey);
  }
  const query = queryParams.toString();
  const requestOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };
  let response;
  try {
    response = await fetch(`/api/room?${query}`, requestOptions);

    if (response.status === 404) {
      response = await fetch(`/.netlify/functions/room?${query}`, requestOptions);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${body}`);
    }

    return response.json();
  } catch (error) {
    if (prefersLocalRoomStore) {
      return localRoomRequest(options);
    }
    throw error;
  }
}

async function loadRoomParticipants({ quiet = false } = {}) {
  try {
    const room = await roomRequest();
    if (room.googleClientId && !configuredGoogleClientId) {
      state.roomGoogleClientId = room.googleClientId;
    }
    (room.participants || []).forEach(upsertParticipant);
    if (room.updatedAt && room.updatedAt !== state.lastRoomSync) {
      state.lastRoomSync = room.updatedAt;
      updateAll();
      if (!quiet) {
        setImportStatus(`${room.participants?.length || 0}莠ｺ縺ｮ蜿ょ刈閠・ｒ繝ｫ繝ｼ繝縺九ｉ隱ｭ縺ｿ霎ｼ縺ｿ縺ｾ縺励◆`);
      }
    }
  } catch (error) {
    if (!quiet) {
      setImportStatus(`繝ｫ繝ｼ繝蜷梧悄縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ${error.message}`, "error");
    }
  }
}

async function publishParticipantToRoom(participant) {
  const room = await roomRequest({
    method: "POST",
    body: JSON.stringify({
      participant,
      googleClientId: currentGoogleClientId()
    })
  });
  if (room.googleClientId && !configuredGoogleClientId) {
    state.roomGoogleClientId = room.googleClientId;
  }
  state.lastRoomSync = room.updatedAt || "";
  (room.participants || []).forEach(upsertParticipant);
  updateAll();
  return room;
}

async function syncRoomGoogleClientId({ quiet = true } = {}) {
  const googleClientId = currentGoogleClientId();
  if (!googleClientId || !state.hostKey) return;

  try {
    const room = await roomRequest({
      method: "POST",
      body: JSON.stringify({ googleClientId })
    });
    state.roomGoogleClientId = room.googleClientId || googleClientId;
    if (!quiet) {
      setImportStatus("Google 連携設定を更新しました");
    }
  } catch (error) {
    if (!quiet) {
      setImportStatus(`Google 連携設定の更新に失敗しました: ${error.message}`, "error");
    }
  }
}

function setImportStatus(message, tone = "neutral") {
  const status = document.querySelector("#calendarImportStatus");
  const checklist = document.querySelector("#oauthChecklist");
  status.textContent = message;
  status.style.borderColor = tone === "error" ? "rgba(233, 135, 112, 0.7)" : "";
  status.style.background = tone === "error" ? "rgba(233, 135, 112, 0.12)" : "";
  checklist.hidden = tone !== "error";
}

function googleAuthErrorMessage(error) {
  const type = error?.type || "unknown";
  if (type === "popup_closed") {
    return `Google の認可ポップアップが閉じられました。Cloud Console の origin / test user / API 設定を確認してください。現在の origin: ${window.location.origin}`;
  }
  if (type === "popup_failed_to_open") {
    return "Google の認可画面を開けませんでした。ブラウザのポップアップブロックを確認してください。";
  }
  return `Google 認可に失敗しました: ${type}`;
}

function renderCalendarSelection() {
  const containers = [
    document.querySelector("#calendarSelection"),
    document.querySelector("#inlineCalendarSelection")
  ].filter(Boolean);

  if (!containers.length) return;

  const markup = state.googleCalendars.length
    ? state.googleCalendars.map((calendar) => `
      <label class="calendar-chip">
        <span>${calendar.summaryOverride || calendar.summary}</span>
        <input type="checkbox" data-calendar-id="${calendar.id}" ${
          state.selectedCalendarIds.has(calendar.id) ? "checked" : ""
        } />
      </label>
    `).join("")
    : '<div class="field-note">Google騾｣謳ｺ蠕後↓繧ｫ繝ｬ繝ｳ繝繝ｼ蛟呵｣懊′陦ｨ遉ｺ縺輔ｌ縺ｾ縺吶・/div>';

  containers.forEach((container) => {
    container.innerHTML = markup;
    container.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const calendarId = checkbox.dataset.calendarId;
        if (!calendarId) return;

        if (checkbox.checked) {
          state.selectedCalendarIds.add(calendarId);
        } else {
          state.selectedCalendarIds.delete(calendarId);
        }

        document.querySelectorAll(`input[data-calendar-id="${calendarId}"]`).forEach((input) => {
          input.checked = state.selectedCalendarIds.has(calendarId);
        });

        importGoogleFreeBusy();
      });
    });
  });
}

async function googleRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body}`);
  }

  return response.json();
}

function localDateTime(dateText, minutes) {
  return `${dateText}T${timeFromMinute(minutes)}:00`;
}

function eventDescription() {
  return [
    "Slotwise 縺ｧ菴懈・",
    `Room: ${roomId}`,
    `Participants: ${people.map((person) => person.name).join(", ")}`
  ].join("\n");
}

function eventAttendees() {
  const currentEmail = state.currentGoogleUser?.email || "";
  const emails = [...new Set(
    people
      .map((person) => person.email)
      .filter((email) => email && email !== currentEmail)
  )];
  return emails.map((email) => ({ email }));
}

function writableCalendars() {
  return state.googleCalendars.filter((calendar) =>
    ["owner", "writer"].includes(calendar.accessRole)
  );
}

function targetCalendarId() {
  const selectedWritable = writableCalendars().find((calendar) =>
    state.selectedCalendarIds.has(calendar.id)
  );
  return selectedWritable?.id || "primary";
}

async function createCalendarEventFromCandidate(button) {
  if (!state.accessToken || !state.currentGoogleUser) {
    setImportStatus("予定を作成するには Google 連携が必要です", "error");
    document.querySelector("#connectDialog").showModal();
    return;
  }

  const dateText = button.dataset.date;
  const start = Number(button.dataset.start);
  const end = Number(button.dataset.end);
  const title = document.querySelector("#meetingTitle").value.trim() || "Slotwise meeting";
  const calendarId = targetCalendarId();

  button.disabled = true;
  button.querySelector("span:last-child").textContent = "菴懈・荳ｭ";

  try {
    const event = await googleRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: title,
          description: eventDescription(),
          attendees: eventAttendees(),
          start: {
            dateTime: localDateTime(dateText, start),
            timeZone: "Asia/Tokyo"
          },
          end: {
            dateTime: localDateTime(dateText, end),
            timeZone: "Asia/Tokyo"
          },
          transparency: "opaque"
        })
      }
    );
    setImportStatus(`莠亥ｮ壹ｒ菴懈・縺励∪縺励◆: ${event.htmlLink || title}`);
    button.querySelector("span:last-child").textContent = "菴懈・貂医∩";
    await importGoogleFreeBusy();
  } catch (error) {
    button.disabled = false;
    button.querySelector("span:last-child").textContent = "莠亥ｮ壻ｽ懈・";
    setImportStatus(`莠亥ｮ壻ｽ懈・縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ${error.message}`, "error");
  }
}

async function fetchGoogleProfile() {
  return googleRequest("https://www.googleapis.com/oauth2/v3/userinfo");
}

async function fetchGoogleCalendars() {
  const data = await googleRequest(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader&maxResults=250"
  );
  state.googleCalendars = (data.items || []).filter((calendar) => !calendar.deleted);
  state.selectedCalendarIds = new Set(state.googleCalendars.map((calendar) => calendar.id));
  renderCalendarSelection();
  return state.googleCalendars;
}

function buildBusyByDate(freeBusy) {
  const busyByDate = Object.fromEntries(dates.map((dateText) => [dateText, []]));

  Object.values(freeBusy.calendars || {}).forEach((calendar) => {
    (calendar.busy || []).forEach((range) => {
      const start = new Date(range.start);
      const end = new Date(range.end);
      const dateText = formatLocalDateText(start);

      if (!busyByDate[dateText]) return;
      busyByDate[dateText].push([
        timeFromMinute(start.getHours() * 60 + start.getMinutes()),
        timeFromMinute(end.getHours() * 60 + end.getMinutes())
      ]);
    });
  });

  return busyByDate;
}

function participantIdForProfile(profile) {
  return `google-${profile.sub || profile.email}`;
}

function initialsForProfile(profile) {
  return initialsFromName(profile.name || profile.email || "Google User");
}

async function importGoogleFreeBusy() {
  if (!state.accessToken || !state.currentGoogleUser) return;
  const selectedIds = [...state.selectedCalendarIds];
  if (!selectedIds.length) {
    setImportStatus("隱ｭ縺ｿ霎ｼ繧繧ｫ繝ｬ繝ｳ繝繝ｼ繧・縺､莉･荳企∈繧薙〒縺上□縺輔＞", "error");
    return;
  }

  setImportStatus("2繧ｫ譛亥・縺ｮ freeBusy 繧定ｪｭ縺ｿ霎ｼ縺ｿ荳ｭ...");
  const timeMin = `${dates[0]}T00:00:00+09:00`;
  const timeMax = `${dates[dates.length - 1]}T23:59:59+09:00`;
  const freeBusy = await googleRequest("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: "Asia/Tokyo",
      items: selectedIds.map((id) => ({ id }))
    })
  });

  const profile = state.currentGoogleUser;
  const participantId = participantIdForProfile(profile);
  const existingParticipant = participantById(participantId);
  const isNewParticipant = !existingParticipant;
  const resolvedName = existingParticipant?.customName
    ? existingParticipant.name
    : (profile.name || profile.email || "Google User");
  const connectedPerson = {
    id: participantId,
    name: resolvedName,
    email: profile.email || "",
    initials: initialsFromName(resolvedName),
    calendars: state.googleCalendars
      .filter((calendar) => state.selectedCalendarIds.has(calendar.id))
      .map((calendar) => calendar.summaryOverride || calendar.summary),
    source: "google",
    customName: existingParticipant?.customName || false,
    preference: { morning: 12, afternoon: 12, buffer: 12, avoidFridayLate: 8 },
    busy: buildBusyByDate(freeBusy)
  };

  state.connected = true;
  state.rememberedPreferredAccount = false;
  updateConnectionUi();
  upsertParticipant(connectedPerson);
  persistPreferredAccountSnapshot(connectedPerson);
  try {
    const room = await publishParticipantToRoom(connectedPerson);
    if (isNewParticipant) {
      await notifyNewParticipantConnection(connectedPerson);
    }
    setImportStatus(`${connectedPerson.name} をルームに共有しました。現在 ${room.participants?.length || 1} 人が参加中です。`);
  } catch (error) {
    setImportStatus(`${connectedPerson.name} の free/busy は読み込めましたが、ルーム共有に失敗しました: ${error.message}`, "error");
  }
  updateAll();
}

function requestGoogleCalendarAccess() {
  const clientId = currentGoogleClientId();
  if (!clientId) {
    setImportStatus("Google OAuth Client ID が設定されていません。先に管理側で設定してください。", "error");
    return;
  }

  if (!window.google?.accounts?.oauth2) {
    setImportStatus("Google 認証ライブラリを読み込めませんでした。ページを再読み込みしてください。", "error");
    return;
  }

  refreshShareUrl();
  setImportStatus("Google の認可画面を開いています...");

  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    prompt: "select_account consent",
    include_granted_scopes: true,
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        setImportStatus(tokenResponse.error, "error");
        return;
      }

        try {
          state.accessToken = tokenResponse.access_token;
          state.currentGoogleUser = await fetchGoogleProfile();
          if (
            currentPreferredGoogleAccount() &&
            (state.currentGoogleUser?.email || "").toLowerCase() !== currentPreferredGoogleAccount()
          ) {
            const approved = window.confirm(
              `${state.currentGoogleUser?.email || "このアカウント"} で連携しますか？\n${currentPreferredGoogleAccount()} 以外のアカウントは優先連携の対象ではありません。`
            );
            if (!approved) {
              state.accessToken = "";
              state.currentGoogleUser = null;
              setImportStatus("別のアカウントでの連携をキャンセルしました");
              return;
            }
          }
          const calendars = await fetchGoogleCalendars();
          await importGoogleFreeBusy();
        setImportStatus(`${state.currentGoogleUser.name || state.currentGoogleUser.email} 縺ｨ ${calendars.length}莉ｶ縺ｮ繧ｫ繝ｬ繝ｳ繝繝ｼ繧呈磁邯壹＠縺ｾ縺励◆`);
      } catch (error) {
        setImportStatus(`Google Calendar 縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ${error.message}`, "error");
      }
    },
    error_callback: (error) => {
      setImportStatus(googleAuthErrorMessage(error), "error");
    }
  });

  tokenClient.requestAccessToken();
}

function renderAuditLog() {
  const auditLog = document.querySelector("#auditLog");
  const entries = [
    ["calendar.calendarlist.readonly", "カレンダー一覧を読む"],
    ["calendar.freebusy", "空き時間を読む"],
    ["calendar.events", "予定を作成する"],
    ["openid email profile", "参加者名と本人確認"],
    ["events.readonly", "未使用"],
  ];
  auditLog.innerHTML = entries.map(([scope, purpose]) => `
    <div class="audit-item">
      <span>${scope}</span>
      <strong>${purpose}</strong>
    </div>
  `).join("");
}

function updateAll() {
  renderTimeline();
  renderSuggestions();
  renderPeople();
  renderAuditLog();
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.view}View`).classList.add("active");
  });
});

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.meetingType = button.dataset.meetingType;
    renderSuggestions();
  });
});

["duration", "candidateCount", "workStart", "workEnd", "bufferToggle", "hideOwnerToggle"].forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("input", updateAll);
});

document.querySelector("#duration").addEventListener("blur", () => {
  normalizedDurationMinutes({ commit: true });
  updateAll();
});

document.querySelector("#suggestButton").addEventListener("click", renderSuggestions);

document.querySelector("#copyShareUrlButton").addEventListener("click", async () => {
  const shareUrl = document.querySelector("#shareUrl").value;
  await syncRoomGoogleClientId();
  try {
    await navigator.clipboard.writeText(shareUrl);
    document.querySelector("#copyShareUrlButton span:last-child").textContent = "コピー完了";
  } catch {
    document.querySelector("#shareUrl").select();
    setImportStatus("共有 URL を選択しました。コピーしてお使いください。");
  }
});

document.querySelector("#copyCandidateMessageButton").addEventListener("click", async () => {
  const message = document.querySelector("#candidateMessage").value.trim();
  if (!message) {
    setImportStatus("先に候補を選んでください", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(message);
    setImportStatus("候補メッセージをコピーしました");
  } catch {
    document.querySelector("#candidateMessage").select();
    setImportStatus("候補メッセージを選択しました。コピーしてお使いください。");
  }
});

document.querySelector("#relearnButton").addEventListener("click", () => {
  state.learnedAt = new Date();
  document.querySelector("#learningState").textContent = "譖ｴ譁ｰ貂医∩";
  people.forEach((person) => {
    person.preference.morning += Math.round(Math.random() * 2);
    person.preference.afternoon += Math.round(Math.random() * 2);
  });
  renderSuggestions();
});

document.querySelector("#connectButton").addEventListener("click", () => {
  document.querySelector("#connectDialog").showModal();
});

document.querySelector("#googleConnectConfirm").addEventListener("click", requestGoogleCalendarAccess);

document.querySelector("#peopleConnectButton").addEventListener("click", () => {
  document.querySelector("#connectDialog").showModal();
});

document.querySelector("#editCalendarsButton").addEventListener("click", () => {
  document.querySelector("#connectDialog").showModal();
});

document.querySelector("#becomeHostButton").addEventListener("click", claimHostRole);

document.querySelector("#disconnectButton").addEventListener("click", disconnectGoogleConnection);

document.querySelector("#inviteConnectButton").addEventListener("click", () => {
  document.querySelector("#connectDialog").showModal();
  requestGoogleCalendarAccess();
});

restorePreferredAccountSnapshot();

if (isInviteLink) {
  setTimeout(() => {
    document.querySelector("#connectDialog").showModal();
  }, 400);
}

loadRoomParticipants({ quiet: true });
setInterval(() => loadRoomParticipants({ quiet: true }), 10000);
updateAll();

