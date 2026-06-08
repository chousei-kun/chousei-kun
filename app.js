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
const hostKeyStorageKey = `chousei-kun.hostKey.${roomId}`;
const storedHostKey = localStorage.getItem(hostKeyStorageKey) || "";
const hostKeyFromUrl = pageParams.get("host") || "";

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

const storedClientId = localStorage.getItem("slotwise.googleClientId");
if (configuredGoogleClientId) {
  document.querySelector("#googleClientId").value = configuredGoogleClientId;
  document.querySelector("#clientIdField").hidden = true;
} else if (storedClientId) {
  document.querySelector("#googleClientId").value = storedClientId;
}
document.querySelector("#currentOrigin").textContent = window.location.origin;
document.querySelector("#inviteBanner").hidden = !isInviteLink;

function currentGoogleClientId() {
  return configuredGoogleClientId || state.roomGoogleClientId || document.querySelector("#googleClientId").value.trim();
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

refreshShareUrl();
if (isInviteLink) {
  document.querySelector("#clientIdField").hidden = true;
  const note = document.querySelector(".client-id-note");
  if (note) note.hidden = true;
  const originBox = document.querySelector(".origin-box");
  if (originBox) originBox.hidden = true;
}

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

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function normalizedDurationMinutes() {
  const input = document.querySelector("#duration");
  const fallback = 30;
  const parsed = Number(input.value);
  const nextValue = Number.isFinite(parsed) ? parsed : fallback;
  const normalized = Math.min(480, Math.max(15, Math.round(nextValue / 5) * 5));
  if (String(normalized) !== input.value) {
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
    reasons.push("午前の承認率が高い");
  }

  if (hour === 12 || hour === 13) {
    score -= 14;
    reasons.push("昼休み付近");
  }

  if (meetingType === "onsite") {
    score -= hour < 11 ? 2 : 0;
    reasons.push("移動余白を考慮");
  }

  if (duration <= 30) {
    score += 5;
    reasons.push("短時間で確定しやすい");
  }

  if (date.getDay() === 0 || date.getDay() === 6) {
    score -= 20;
    reasons.push("週末候補");
  }

  if (!reasons.length) {
    reasons.push("全員の予定と衝突なし");
  }

  return {
    score: Math.max(1, Math.min(99, Math.round(score))),
    reasons
  };
}

function generateSuggestions() {
  if (!people.length) return [];

  const duration = normalizedDurationMinutes();
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
  document.querySelector("#privacyBadge").textContent = hideOwner ? "詳細非表示" : "担当者表示";

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
    return hasBusy ? "一部予定あり" : "終日空き";
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
          ${peopleRows || '<div class="empty-state timeline-empty">参加者が接続するとユーザー別の空き状況を表示します。</div>'}
        </div>
      </div>
    `;
  }).join("");

  timeline.innerHTML = `
    <div class="timeline-summary">候補検索: ${formatDate(dates[0])} - ${formatDate(dates[dates.length - 1])} / 表示: 先頭${timelinePreviewDays}日</div>
    ${rows}
  `;
}

function renderSuggestions() {
  const suggestions = document.querySelector("#suggestions");
  const candidates = generateSuggestions();
  if (!people.length) {
    suggestions.innerHTML = `
      <article class="suggestion-card empty-state">
        <strong>Google カレンダーを接続してください</strong>
        <span>参加者が追加されると、2カ月先までの空き候補を生成します。</span>
      </article>
    `;
    return;
  }

  if (!candidates.length) {
    suggestions.innerHTML = `
      <article class="suggestion-card empty-state">
        <strong>候補が見つかりません</strong>
        <span>業務時間、所要時間、前後バッファを調整してください。</span>
      </article>
    `;
    return;
  }

  suggestions.innerHTML = candidates.map((candidate, index) => `
    <article class="suggestion-card" data-date="${candidate.dateText}" data-start="${candidate.start}" data-end="${candidate.end}">
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
      <button class="primary-button create-event-button" type="button" data-date="${candidate.dateText}" data-start="${candidate.start}" data-end="${candidate.end}">
        <span aria-hidden="true">＋</span><span>予定作成</span>
      </button>
    </article>
  `).join("");

  suggestions.querySelectorAll(".create-event-button").forEach((button) => {
    button.addEventListener("click", () => createCalendarEventFromCandidate(button));
  });
}

function renderPeople() {
  const peopleList = document.querySelector("#peopleList");
  if (!people.length) {
    peopleList.innerHTML = `
      <article class="person-card empty-state">
        <strong>参加者はまだいません</strong>
        <span>各ユーザーが Google で許可すると、ここに参加者として追加されます。</span>
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
          <div class="pill secure">Google接続済み</div>
        </div>
      </div>
      <label class="name-editor">
        <span>参加者名</span>
        <input
          class="name-input"
          type="text"
          maxlength="120"
          data-participant-id="${escapeHtml(person.id)}"
          data-saved-name="${escapeHtml(person.name)}"
          value="${escapeHtml(person.name)}"
        />
      </label>
      <p class="person-meta">表示名は自由に変更できます。Gmail アドレスは他の参加者には表示されません。</p>
      <div class="calendar-stack">
        ${person.calendars.map((calendar) => `
          <div class="calendar-row"><span>${escapeHtml(calendar)}</span><strong>freeBusy</strong></div>
        `).join("")}
      </div>
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
    setImportStatus(`${nextName} の表示名を更新しました`);
  } catch (error) {
    upsertParticipant({
      ...participant,
      name: previousName,
      initials: initialsFromName(previousName),
      customName: participant.customName ?? false
    });
    updateAll();
    setImportStatus(`表示名の保存に失敗しました: ${error.message}`, "error");
  }
}

async function roomRequest(options = {}) {
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
  let response = await fetch(`/api/room?${query}`, requestOptions);

  if (response.status === 404) {
    response = await fetch(`/.netlify/functions/room?${query}`, requestOptions);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body}`);
  }

  return response.json();
}

async function loadRoomParticipants({ quiet = false } = {}) {
  try {
    const room = await roomRequest();
    if (room.googleClientId && !configuredGoogleClientId) {
      state.roomGoogleClientId = room.googleClientId;
      document.querySelector("#googleClientId").value = room.googleClientId;
      if (isInviteLink) {
        document.querySelector("#clientIdField").hidden = true;
      }
    }
    (room.participants || []).forEach(upsertParticipant);
    if (room.updatedAt && room.updatedAt !== state.lastRoomSync) {
      state.lastRoomSync = room.updatedAt;
      updateAll();
      if (!quiet) {
        setImportStatus(`${room.participants?.length || 0}人の参加者をルームから読み込みました`);
      }
    }
  } catch (error) {
    if (!quiet) {
      setImportStatus(`ルーム同期に失敗しました: ${error.message}`, "error");
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
    document.querySelector("#googleClientId").value = room.googleClientId;
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
    if (!configuredGoogleClientId) {
      document.querySelector("#googleClientId").value = state.roomGoogleClientId;
    }
    if (!quiet) {
      setImportStatus("Google OAuth Client ID を招待ルームへ保存しました");
    }
  } catch (error) {
    if (!quiet) {
      setImportStatus(`Google OAuth Client ID の保存に失敗しました: ${error.message}`, "error");
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
    return `認可ポップアップが完了前に閉じました。Google Cloud Console の origin/test user/API 設定を確認してください。現在の origin: ${window.location.origin}`;
  }
  if (type === "popup_failed_to_open") {
    return "認可ポップアップを開けませんでした。ブラウザのポップアップブロックを許可してください。";
  }
  return `Google 認可が完了しませんでした: ${type}`;
}

function renderCalendarSelection() {
  const selection = document.querySelector("#calendarSelection");
  if (!state.googleCalendars.length) {
    selection.innerHTML = "";
    return;
  }

  selection.innerHTML = state.googleCalendars.map((calendar) => `
    <label class="calendar-chip">
      <span>${calendar.summaryOverride || calendar.summary}</span>
      <input type="checkbox" data-calendar-id="${calendar.id}" ${
        state.selectedCalendarIds.has(calendar.id) ? "checked" : ""
      } />
    </label>
  `).join("");

  selection.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedCalendarIds.add(checkbox.dataset.calendarId);
      } else {
        state.selectedCalendarIds.delete(checkbox.dataset.calendarId);
      }
      importGoogleFreeBusy();
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
    "Slotwise で作成",
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
    setImportStatus("予定作成には Google 接続が必要です", "error");
    document.querySelector("#connectDialog").showModal();
    return;
  }

  const dateText = button.dataset.date;
  const start = Number(button.dataset.start);
  const end = Number(button.dataset.end);
  const title = document.querySelector("#meetingTitle").value.trim() || "Slotwise meeting";
  const calendarId = targetCalendarId();

  button.disabled = true;
  button.querySelector("span:last-child").textContent = "作成中";

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
    setImportStatus(`予定を作成しました: ${event.htmlLink || title}`);
    button.querySelector("span:last-child").textContent = "作成済み";
    await importGoogleFreeBusy();
  } catch (error) {
    button.disabled = false;
    button.querySelector("span:last-child").textContent = "予定作成";
    setImportStatus(`予定作成に失敗しました: ${error.message}`, "error");
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
    setImportStatus("読み込むカレンダーを1つ以上選んでください", "error");
    return;
  }

  setImportStatus("2カ月分の freeBusy を読み込み中...");
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
  document.querySelector("#connectButton").innerHTML = '<span aria-hidden="true">✓</span><span>Google接続済み</span>';
  document.querySelector("#oauthStatus").textContent = "接続済み";
  upsertParticipant(connectedPerson);
  try {
    const room = await publishParticipantToRoom(connectedPerson);
    setImportStatus(`${connectedPerson.name} をルームへ共有しました。現在 ${room.participants?.length || 1}人が参加中です`);
  } catch (error) {
    setImportStatus(`${connectedPerson.name} の free/busy は読み込み済みですが、ルーム共有に失敗しました: ${error.message}`, "error");
  }
  updateAll();
}

function requestGoogleCalendarAccess() {
  const clientId = currentGoogleClientId();
  if (!clientId) {
    setImportStatus("Google OAuth Client ID がまだルームに登録されていません。主催者が先に Google 連携すると、そのまま参加できます。", "error");
    return;
  }

  if (!window.google?.accounts?.oauth2) {
    setImportStatus("Google 認証ライブラリを読み込み中です。数秒後にもう一度押してください。", "error");
    return;
  }

  if (!configuredGoogleClientId) {
    localStorage.setItem("slotwise.googleClientId", clientId);
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
        const calendars = await fetchGoogleCalendars();
        await importGoogleFreeBusy();
        setImportStatus(`${state.currentGoogleUser.name || state.currentGoogleUser.email} と ${calendars.length}件のカレンダーを接続しました`);
      } catch (error) {
        setImportStatus(`Google Calendar の読み込みに失敗しました: ${error.message}`, "error");
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
    ["calendar.calendarlist.readonly", "カレンダー選択"],
    ["calendar.freebusy", "空き/埋まり判定"],
    ["calendar.events", "選択候補の予定作成"],
    ["openid email profile", "参加者名の識別"],
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

document.querySelector("#googleClientId").addEventListener("input", refreshShareUrl);
document.querySelector("#googleClientId").addEventListener("change", () => {
  refreshShareUrl();
  syncRoomGoogleClientId();
});

document.querySelector("#suggestButton").addEventListener("click", renderSuggestions);

document.querySelector("#copyShareUrlButton").addEventListener("click", async () => {
  const shareUrl = document.querySelector("#shareUrl").value;
  await syncRoomGoogleClientId();
  try {
    await navigator.clipboard.writeText(shareUrl);
    document.querySelector("#copyShareUrlButton span:last-child").textContent = "コピー済み";
  } catch {
    document.querySelector("#shareUrl").select();
    setImportStatus("共有URLを選択しました。コピーしてください。");
  }
});

document.querySelector("#relearnButton").addEventListener("click", () => {
  state.learnedAt = new Date();
  document.querySelector("#learningState").textContent = "更新済み";
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

document.querySelector("#inviteConnectButton").addEventListener("click", () => {
  document.querySelector("#connectDialog").showModal();
  requestGoogleCalendarAccess();
});

if (isInviteLink) {
  setTimeout(() => {
    document.querySelector("#connectDialog").showModal();
  }, 400);
}

loadRoomParticipants({ quiet: true });
setInterval(() => loadRoomParticipants({ quiet: true }), 10000);
updateAll();
