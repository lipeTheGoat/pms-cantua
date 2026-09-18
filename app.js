/* ============================================================
   PMS Cantuá — sistema simples de reservas
   Persistência: localStorage (cache local instantâneo) + Firebase
   Firestore (sincronização em tempo real entre toda a equipe).
   ============================================================ */

const STORAGE_KEY = "pms_cantua_v1";

/* ================= Sincronização em nuvem (Firebase Firestore) =================
   Preencha com as credenciais do seu projeto Firebase (Configurações do
   projeto > Seus apps > SDK setup and configuration). É gratuito.
   Enquanto não for preenchido, o sistema funciona só localmente (por navegador). */
const firebaseConfig = {
  apiKey: "AIzaSyBxphPlmSqTX1ekfHRGdQjJC3hAYvTlBPM",
  authDomain: "pms-cantua.firebaseapp.com",
  projectId: "pms-cantua",
  storageBucket: "pms-cantua.firebasestorage.app",
  messagingSenderId: "699423480983",
  appId: "1:699423480983:web:f317b2a5b8265043c89dd2",
};
const CLOUD_DOC = { collection: "cantua", id: "state" };

let cloudDb = null;
let cloudDocRef = null;
let cloudEnabled = false;
let applyingRemoteUpdate = false;

async function initCloudSync() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "COLOQUE_AQUI") {
    setSyncStatus("offline", "Modo local (Firebase não configurado)");
    return;
  }
  try {
    const [{ initializeApp }, { getFirestore, doc, onSnapshot, setDoc, getDoc }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"),
    ]);
    const fbApp = initializeApp(firebaseConfig);
    cloudDb = getFirestore(fbApp);
    cloudDocRef = doc(cloudDb, CLOUD_DOC.collection, CLOUD_DOC.id);
    cloudFns = { doc, onSnapshot, setDoc, getDoc };

    setSyncStatus("syncing", "Conectando...");
    const snap = await cloudFns.getDoc(cloudDocRef);
    if (snap.exists()) {
      state = migrateState(snap.data());
    } else {
      await cloudFns.setDoc(cloudDocRef, state);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    cloudEnabled = true;
    setSyncStatus("online", "Sincronizado com a equipe");
    render();

    cloudFns.onSnapshot(cloudDocRef, (snap2) => {
      if (!snap2.exists()) return;
      const incoming = snap2.data();
      if (JSON.stringify(incoming) === JSON.stringify(state)) return;
      applyingRemoteUpdate = true;
      state = migrateState(incoming);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      applyingRemoteUpdate = false;
      setSyncStatus("online", "Sincronizado com a equipe");
    }, () => setSyncStatus("offline", "Sem conexão com a nuvem"));
  } catch (e) {
    console.error("Falha ao iniciar sincronização:", e);
    setSyncStatus("offline", "Sem conexão com a nuvem");
  }
}
let cloudFns = null;

let pushTimer = null;
function pushToCloud() {
  if (!cloudEnabled || applyingRemoteUpdate) return;
  setSyncStatus("syncing", "Salvando...");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    cloudFns.setDoc(cloudDocRef, state)
      .then(() => setSyncStatus("online", "Sincronizado com a equipe"))
      .catch(() => setSyncStatus("offline", "Sem conexão com a nuvem"));
  }, 500);
}
function setSyncStatus(kind, label) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.className = "sync-status " + kind;
  el.textContent = label;
}

/* ---------- Catálogo padrão (usado só na primeira instalação) ---------- */
const DEFAULT_CATALOG = [
  { name: "Água sem Gás 500ml", price: 6 },
  { name: "Água com Gás 500ml", price: 7 },
  { name: "Refrigerante Lata", price: 10 },
  { name: "Cerveja Long Neck", price: 12 },
  { name: "Café da Manhã Extra", price: 35 },
  { name: "Taxa de Rolha", price: 30 },
  { name: "Late Check-out", price: 80 },
  { name: "Taxa de Limpeza Extra", price: 50 },
  { name: "Passeio a Cavalo", price: 60 },
  { name: "Massagem Relaxante", price: 120 },
];

/* ================= Utilidades de data ================= */
function toDate(iso) { return new Date(iso + "T00:00:00"); }
function fmtISO(d) { return d.toISOString().slice(0, 10); }
function addDays(iso, n) { const d = toDate(iso); d.setDate(d.getDate() + n); return fmtISO(d); }
function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
function todayISO() { return fmtISO(new Date()); }
function fmtBR(iso) { const [y, m, d] = iso.split("-"); return `${d}/${m}`; }
function fmtBRFull(iso) { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
function weekday(iso) { return WEEKDAYS[toDate(iso).getDay()]; }

/* ================= Dinheiro ================= */
function money(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function uid(prefix) {
  return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ================= Ícones lineares (estilo Lucide, sem dependência externa) ================= */
const ICON_PATHS = {
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="6" y="13" width="12" height="8" rx="1"/><path d="M6 17H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2"/>',
  undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
  arrows: '<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  receipt: '<path d="M4 3h16v18l-3-2-2 2-2-2-2 2-2-2-2 2-3-2V3z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
function icon(name, size) {
  return `<svg class="icon" width="${size || 15}" height="${size || 15}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ""}</svg>`;
}

/* ================= Estado / Persistência ================= */
let state = null;

function seedState() {
  const t = todayISO();
  const catStd = "cat_std", catLux = "cat_lux", catSte = "cat_ste";
  const rooms = [
    { id: "r1", name: "Quarto 01", categoryId: catStd, basePrice: 420, extraBedFee: 60 },
    { id: "r2", name: "Quarto 02", categoryId: catStd, basePrice: 420, extraBedFee: 60 },
    { id: "r3", name: "Quarto 03", categoryId: catStd, basePrice: 400, extraBedFee: 60 },
    { id: "r4", name: "Quarto 04", categoryId: catStd, basePrice: 400, extraBedFee: 60 },
    { id: "r5", name: "Quarto 05", categoryId: catStd, basePrice: 400, extraBedFee: 60 },
    { id: "r6", name: "Quarto 06", categoryId: catStd, basePrice: 400, extraBedFee: 60 },
    { id: "r7", name: "Quarto 07", categoryId: catLux, basePrice: 560, extraBedFee: 90 },
    { id: "r8", name: "Quarto 08", categoryId: catLux, basePrice: 560, extraBedFee: 90 },
    { id: "r9", name: "Quarto 09", categoryId: catLux, basePrice: 560, extraBedFee: 90 },
    { id: "r10", name: "Quarto 10", categoryId: catLux, basePrice: 560, extraBedFee: 90 },
    { id: "r11", name: "Quarto 11", categoryId: catSte, basePrice: 780, extraBedFee: 120 },
    { id: "r12", name: "Quarto 12", categoryId: catSte, basePrice: 780, extraBedFee: 120 },
  ];

  function mkRes(o) {
    return Object.assign({
      id: uid("res"),
      type: "reserva",
      adults: 2,
      children: 0,
      extraBeds: 0,
      manualAdjustment: 0,
      paymentMethod: "Pix",
      channel: "Reserva Manual",
      observations: "",
      charges: [],
      payments: [],
      checkinAt: null,
      checkoutAt: null,
    }, o);
  }

  const reservations = [
    mkRes({
      code: 1001, roomId: "r1", guestName: "Renato", guestSurname: "Henrique",
      guestPhone: "(31) 99911-2233", guestEmail: "renato.h@email.com", guestDocument: "123.456.789-00",
      checkIn: addDays(t, -2), checkOut: addDays(t, 2), pricePerNight: 420,
      paymentStatus: "parcial", payments: [{ id: uid("pay"), amount: 500, method: "Pix", date: addDays(t, -2) }],
      checkinAt: addDays(t, -2) + "T14:10", observations: "Casal em lua de mel — deixar espumante no quarto.",
    }),
    mkRes({
      code: 1002, roomId: "r2", guestName: "Dora", guestSurname: "Maria Barbosa",
      guestPhone: "(31) 98822-1144", guestEmail: "dora.barbosa@email.com", guestDocument: "",
      checkIn: t, checkOut: addDays(t, 3), pricePerNight: 420,
      paymentStatus: "pendente", payments: [],
      observations: "Chegada prevista à tarde.",
    }),
    mkRes({
      code: 1003, roomId: "r7", guestName: "Miguel", guestSurname: "Lima Campos",
      guestPhone: "(31) 99321-0512", guestEmail: "miguellimacampos1@email.com", guestDocument: "135.256.756-31",
      checkIn: addDays(t, -5), checkOut: t, pricePerNight: 560,
      paymentStatus: "pago", payments: [{ id: uid("pay"), amount: 2800, method: "Cartão de Crédito", date: addDays(t, -5) }],
      checkinAt: addDays(t, -5) + "T15:00",
      charges: [{ id: uid("ch"), name: "Café da Manhã Extra", qty: 2, price: 35 }],
    }),
    mkRes({
      code: 1004, roomId: "r11", guestName: "Juliana", guestSurname: "Prado",
      guestPhone: "(31) 99110-7788", guestEmail: "juliana.prado@email.com", guestDocument: "",
      checkIn: addDays(t, 3), checkOut: addDays(t, 6), pricePerNight: 780,
      paymentStatus: "pago", payments: [{ id: uid("pay"), amount: 2340, method: "Cartão de Crédito", date: addDays(t, -1) }],
      observations: "",
    }),
    mkRes({
      code: 1005, roomId: "r3", guestName: "Eduardo", guestSurname: "Tofani",
      guestPhone: "(31) 99777-4455", guestEmail: "", guestDocument: "",
      checkIn: addDays(t, -10), checkOut: addDays(t, -7), pricePerNight: 400,
      paymentStatus: "pago", payments: [{ id: uid("pay"), amount: 1200, method: "Dinheiro", date: addDays(t, -10) }],
      checkinAt: addDays(t, -10) + "T13:30", checkoutAt: addDays(t, -7) + "T11:00",
    }),
    mkRes({
      code: 1006, roomId: "r4", type: "bloqueio",
      guestName: "Manutenção", guestSurname: "", guestPhone: "", guestEmail: "", guestDocument: "",
      checkIn: addDays(t, 1), checkOut: addDays(t, 3), pricePerNight: 0,
      paymentStatus: "pago", payments: [],
      observations: "Troca do ar-condicionado.",
    }),
  ];

  return {
    property: { name: "Cantuá" },
    categories: [
      { id: catStd, name: "Standard" },
      { id: catLux, name: "Luxo" },
      { id: catSte, name: "Suíte Master" },
    ],
    rooms,
    reservations,
    catalog: DEFAULT_CATALOG.map(c => ({ id: uid("prod"), name: c.name, price: c.price })),
    nextCode: 1007,
    range: { start: addDays(t, -3), days: 14 },
    collapsedCats: {},
  };
}

function migrateState(s) {
  if (!s.catalog) s.catalog = DEFAULT_CATALOG.map(c => ({ id: uid("prod"), name: c.name, price: c.price }));
  (s.rooms || []).forEach(r => {
    if (r.basePrice == null) r.basePrice = 400;
    if (r.extraBedFee == null) r.extraBedFee = 80;
  });
  (s.reservations || []).forEach(r => {
    if (r.extraBeds == null) r.extraBeds = 0;
    if (r.manualAdjustment == null) r.manualAdjustment = 0;
    if (r.charges == null) r.charges = [];
    if (r.payments == null) r.payments = [];
  });
  if (!s.range) s.range = { start: addDays(todayISO(), -1), days: 14 };
  if (!s.collapsedCats) s.collapsedCats = {};
  if (!s.property) s.property = { name: "Cantuá" };
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.rooms) return migrateState(parsed);
    }
  } catch (e) { /* ignore corrupt storage */ }
  return seedState();
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  pushToCloud();
}

/* ================= Helpers de domínio ================= */
function getRoom(id) { return state.rooms.find(r => r.id === id); }
function getCategory(id) { return state.categories.find(c => c.id === id); }
function roomsOfCategory(catId) { return state.rooms.filter(r => r.categoryId === catId); }

function reservationStatus(r) {
  if (r.type === "bloqueio") return "bloqueio";
  if (r.checkoutAt) return "saiu";
  if (r.checkinAt) return "em_casa";
  return "reservado";
}
function statusLabel(s) {
  return { reservado: "Reservado", em_casa: "Em casa", saiu: "Check-out feito", bloqueio: "Bloqueado" }[s] || s;
}
function statusPillClass(s) {
  return { reservado: "pill-blue", em_casa: "pill-sage", saiu: "pill-gray", bloqueio: "pill-gray" }[s] || "pill-gray";
}

function reservationNights(r) { return Math.max(1, daysBetween(r.checkIn, r.checkOut)); }
function reservationRoomTotal(r) { return reservationNights(r) * (r.pricePerNight || 0); }
function reservationChargesTotal(r) { return (r.charges || []).reduce((s, c) => s + c.qty * c.price, 0); }
function reservationExtraBedTotal(r) {
  const room = getRoom(r.roomId);
  const fee = room ? (room.extraBedFee || 0) : 0;
  return reservationNights(r) * (r.extraBeds || 0) * fee;
}
function reservationTotal(r) {
  return reservationRoomTotal(r) + reservationChargesTotal(r) + reservationExtraBedTotal(r) + (r.manualAdjustment || 0);
}
function reservationPaid(r) { return (r.payments || []).reduce((s, p) => s + p.amount, 0); }
function reservationBalance(r) { return +(reservationTotal(r) - reservationPaid(r)).toFixed(2); }

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}
function roomIsFree(roomId, checkIn, checkOut, excludeId) {
  return !state.reservations.some(r =>
    r.roomId === roomId && r.id !== excludeId &&
    overlaps(r.checkIn, r.checkOut, checkIn, checkOut)
  );
}
function findReservation(id) { return state.reservations.find(r => r.id === id); }

/* ================= Toast ================= */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ================= Navegação ================= */
let currentView = "mapa";
let searchTerm = "";
let pendingSelection = null; // {roomId, date} — 1º clique da seleção de período no mapa

function setView(view) {
  currentView = view;
  pendingSelection = null;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  render();
}

/* ================= Render raiz ================= */
function render() {
  document.getElementById("propName").textContent = state.property.name;
  const app = document.getElementById("app");
  if (currentView === "mapa") app.innerHTML = renderMapaView();
  else if (currentView === "emcasa") app.innerHTML = renderEmCasaView();
  else app.innerHTML = renderConfigView();
  bindViewEvents();
}

/* ============================================================
   VIEW: MAPA DE QUARTOS
   ============================================================ */
function rangeDatesArray() {
  const arr = [];
  for (let i = 0; i < state.range.days; i++) arr.push(addDays(state.range.start, i));
  return arr;
}

function renderMapaView() {
  const dates = rangeDatesArray();
  const rangeEnd = dates[dates.length - 1];
  const minWidth = 176 + dates.length * 68;

  let html = "";
  html += `<div class="page-head">
    <div>
      <div class="page-title">Reservas</div>
      <div class="page-subtitle">Acompanhe a operação da Cantuá.</div>
    </div>
    <button class="btn btn-primary" id="btnNovaReserva">${icon("plus", 14)} Nova reserva</button>
  </div>`;

  html += `<div class="controls-row">
    <div class="range-nav">
      <button class="btn btn-icon" id="btnPrevWeek" title="Semana anterior">${icon("chevronLeft")}</button>
      <div class="range-label">${fmtBRFull(state.range.start)} — ${fmtBRFull(rangeEnd)}</div>
      <button class="btn btn-icon" id="btnNextWeek" title="Próxima semana">${icon("chevronRight")}</button>
    </div>
    <button class="btn btn-sm" id="btnHoje">Hoje</button>
    <div class="field">
      <input type="date" id="jumpDate" value="${state.range.start}" />
    </div>
    <div class="field">
      <select id="daysVisible">
        ${[7, 14, 21, 30].map(n => `<option value="${n}" ${n === state.range.days ? "selected" : ""}>${n} dias</option>`).join("")}
      </select>
    </div>
    <div class="toolbar-spacer"></div>
    <div class="field search-field">
      ${icon("search")}
      <input type="text" id="searchGuest" placeholder="Buscar hóspede ou nº da reserva" value="${searchTerm}" />
    </div>
    <button class="btn btn-sm" id="btnBloqueio">${icon("lock", 13)} Bloquear quarto</button>
  </div>`;

  if (pendingSelection) {
    const room = getRoom(pendingSelection.roomId);
    html += `<div class="selection-banner">Selecionando período em <b>${room ? room.name : ""}</b> a partir de <b>${fmtBRFull(pendingSelection.date)}</b> — clique na data final (ou na mesma data para 1 noite).
      <button class="btn btn-sm" id="btnCancelSelection">Cancelar</button>
    </div>`;
  }

  html += `<div class="legend">
    <span><i class="dot" style="background:var(--bar-reservado)"></i> Reservado</span>
    <span><i class="dot" style="background:var(--bar-emcasa)"></i> Em casa</span>
    <span><i class="dot" style="background:var(--bar-saiu)"></i> Check-out</span>
    <span><i class="dot-block"></i> Bloqueado</span>
    <span><i class="dot-pend"></i> Pagamento pendente</span>
  </div>`;

  html += `<div class="map-scroll"><div class="grid-wrap" style="min-width:${minWidth}px">`;

  // header
  html += `<div class="grid-header"><div class="name-col">Acomodação</div><div class="day-track" style="grid-template-columns:repeat(${dates.length},1fr)">`;
  dates.forEach(d => {
    const [, , dnum] = d.split("-");
    html += `<div class="day-cell-h ${d === todayISO() ? "today" : ""}"><span class="wk">${weekday(d)}</span><span class="dnum">${dnum}</span></div>`;
  });
  html += `</div></div>`;

  state.categories.forEach(cat => {
    const rooms = roomsOfCategory(cat.id);
    const collapsed = !!state.collapsedCats[cat.id];
    html += `<div class="cat-section ${collapsed ? "collapsed" : ""}" data-cat="${cat.id}">`;
    html += `<div class="cat-header" data-toggle-cat="${cat.id}"><div class="name-col"><span class="caret">${icon("chevronDown", 12)}</span> ${cat.name} <span style="color:var(--text-faint);font-weight:500;text-transform:none;letter-spacing:0;">(${rooms.length})</span></div>`;
    html += `<div class="day-track" style="grid-template-columns:repeat(${dates.length},1fr)">`;
    dates.forEach(d => {
      const occ = rooms.filter(rm => state.reservations.some(r => r.roomId === rm.id && r.type !== "bloqueio" && overlaps(r.checkIn, r.checkOut, d, addDays(d, 1)))).length;
      html += `<div class="cat-count">${occ}/${rooms.length}</div>`;
    });
    html += `</div></div>`;

    rooms.forEach(room => {
      html += renderRoomRow(room, dates);
    });
    html += `</div>`;
  });

  html += `</div></div>`;
  return html;
}

function renderRoomRow(room, dates) {
  const n = dates.length;
  const rangeStart = dates[0], rangeEndExcl = addDays(dates[n - 1], 1);
  let html = `<div class="room-row"><div class="name-col"><span class="rn">${room.name}</span><span class="rc">${money(room.basePrice)}/noite</span></div><div class="row-track-wrap"><div class="day-track" style="grid-template-columns:repeat(${n},1fr)">`;
  dates.forEach(d => {
    const isPendingStart = pendingSelection && pendingSelection.roomId === room.id && pendingSelection.date === d;
    html += `<div class="day-cell ${d === todayISO() ? "today" : ""} ${isPendingStart ? "pending-start" : ""}" data-cell data-room="${room.id}" data-date="${d}"></div>`;
  });
  html += `</div>`;

  const roomReservations = state.reservations.filter(r => r.roomId === room.id && overlaps(r.checkIn, r.checkOut, rangeStart, rangeEndExcl));
  roomReservations.forEach(r => {
    const clippedLeft = r.checkIn < rangeStart;
    const clippedRight = r.checkOut > rangeEndExcl;
    const clipStart = clippedLeft ? rangeStart : r.checkIn;
    const clipEnd = clippedRight ? rangeEndExcl : r.checkOut;
    const startIdx = daysBetween(rangeStart, clipStart);
    const endIdx = daysBetween(rangeStart, clipEnd);
    // a barra começa/termina no meio do dia de check-in/check-out (não na borda),
    // para deixar claro que a entrada e a saída são dias distintos mesmo em 1 noite
    const leftUnits = startIdx + (clippedLeft ? 0 : 0.5);
    const rightUnits = endIdx + (clippedRight ? 0 : 0.5);
    const left = (leftUnits / n) * 100, width = ((rightUnits - leftUnits) / n) * 100;
    const status = reservationStatus(r);
    const pendClass = (status !== "bloqueio" && status !== "saiu" && reservationBalance(r) > 0) ? "bar-pend" : "";
    const term = searchTerm.trim().toLowerCase();
    const guestFull = (r.guestName + " " + r.guestSurname).toLowerCase();
    let matchClass = "";
    if (term) matchClass = (guestFull.includes(term) || String(r.code).includes(term)) ? "hl" : "dim";
    const label = r.type === "bloqueio" ? (icon("lock", 11) + " Bloqueado") : (r.guestName + " " + r.guestSurname);
    const draggable = status !== "saiu";
    html += `<div class="bar bar-status-${status} ${pendClass} ${matchClass}" style="left:${left}%;width:calc(${width}% - 4px)" data-open-res="${r.id}" data-tooltip-res="${r.id}" ${draggable ? 'draggable="true"' : ''}>${label}</div>`;
  });

  html += `</div></div>`;
  return html;
}

/* ============================================================
   VIEW: EM CASA (dashboard)
   ============================================================ */
function renderEmCasaView() {
  const t = todayISO();
  const all = state.reservations.filter(r => r.type !== "bloqueio");
  const chegadasHoje = all.filter(r => reservationStatus(r) === "reservado" && r.checkIn === t);
  const emCasa = all.filter(r => reservationStatus(r) === "em_casa");
  const saidasHoje = emCasa.filter(r => r.checkOut === t);
  const saidasRecentes = all.filter(r => reservationStatus(r) === "saiu").sort((a, b) => (b.checkoutAt || "").localeCompare(a.checkoutAt || "")).slice(0, 8);
  const totalRooms = state.rooms.length;
  const occNow = emCasa.length;
  const occPct = totalRooms ? Math.round((occNow / totalRooms) * 100) : 0;

  let html = `<div class="page-head">
    <div>
      <div class="page-title">Hóspedes</div>
      <div class="page-subtitle">Quem está, quem chega e quem sai hoje na Cantuá.</div>
    </div>
  </div>`;

  html += `<div class="stat-row">
    <div class="stat-card"><div class="num">${occNow}/${totalRooms}</div><div class="lbl">Quartos ocupados</div></div>
    <div class="stat-card"><div class="num">${occPct}%</div><div class="lbl">Ocupação atual</div></div>
    <div class="stat-card"><div class="num">${chegadasHoje.length}</div><div class="lbl">Chegadas hoje</div></div>
    <div class="stat-card"><div class="num">${saidasHoje.length}</div><div class="lbl">Saídas hoje</div></div>
  </div>`;

  html += `<div class="cols3">`;

  // Chegadas hoje
  html += `<div class="panel"><div class="panel-head">Chegadas de hoje <span>${chegadasHoje.length}</span></div><div class="panel-body">`;
  if (!chegadasHoje.length) html += `<div class="empty-msg">Nenhuma chegada prevista para hoje.</div>`;
  chegadasHoje.forEach(r => {
    const room = getRoom(r.roomId);
    html += `<div class="guest-item">
      <div class="guest-info">
        <div class="name">${r.guestName} ${r.guestSurname}</div>
        <div class="meta">${room ? room.name : "-"} · saída ${fmtBRFull(r.checkOut)}</div>
      </div>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-icon" title="Fazer check-in" data-quick-checkin="${r.id}">${icon("check")}</button>
        <button class="btn btn-icon" title="Ver reserva" data-open-res="${r.id}">${icon("chevronRight")}</button>
      </div>
    </div>`;
  });
  html += `</div></div>`;

  // Em casa agora
  html += `<div class="panel"><div class="panel-head">Na casa agora <span>${emCasa.length}</span></div><div class="panel-body">`;
  if (!emCasa.length) html += `<div class="empty-msg">Nenhum hóspede na casa no momento.</div>`;
  emCasa.forEach(r => {
    const room = getRoom(r.roomId);
    const bal = reservationBalance(r);
    html += `<div class="guest-item">
      <div class="guest-info">
        <div class="name">${r.guestName} ${r.guestSurname}</div>
        <div class="meta">${room ? room.name : "-"} · até ${fmtBRFull(r.checkOut)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${bal > 0 ? `<span class="pill pill-amber">${money(bal)}</span>` : ""}
        <button class="btn btn-icon" title="Ver reserva" data-open-res="${r.id}">${icon("chevronRight")}</button>
      </div>
    </div>`;
  });
  html += `</div></div>`;

  // Saidas hoje + recentes
  html += `<div class="panel"><div class="panel-head">Saídas de hoje <span>${saidasHoje.length}</span></div><div class="panel-body">`;
  if (!saidasHoje.length) html += `<div class="empty-msg">Nenhuma saída prevista para hoje.</div>`;
  saidasHoje.forEach(r => {
    const room = getRoom(r.roomId);
    const bal = reservationBalance(r);
    html += `<div class="guest-item">
      <div class="guest-info">
        <div class="name">${r.guestName} ${r.guestSurname}</div>
        <div class="meta">${room ? room.name : "-"} · ${bal > 0 ? "saldo " + money(bal) : "quitado"}</div>
      </div>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-icon" title="Conta" data-open-conta="${r.id}">${icon("receipt")}</button>
        <button class="btn btn-icon" title="Fazer check-out" data-quick-checkout="${r.id}">${icon("check")}</button>
      </div>
    </div>`;
  });
  if (saidasRecentes.length) {
    html += `<div style="padding:14px 2px 6px;font-size:10.5px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:.04em;">Check-outs recentes</div>`;
    saidasRecentes.forEach(r => {
      const room = getRoom(r.roomId);
      const bal = reservationBalance(r);
      html += `<div class="guest-item">
        <div class="guest-info">
          <div class="name">${r.guestName} ${r.guestSurname}</div>
          <div class="meta">${room ? room.name : "-"} · saiu ${r.checkoutAt ? fmtBRFull(r.checkoutAt.split("T")[0]) : ""} ${bal > 0 ? "· saldo " + money(bal) : ""}</div>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-icon" title="Conta" data-open-conta="${r.id}">${icon("receipt")}</button>
          <button class="btn btn-icon" title="Reverter check-out" data-quick-revert="${r.id}">${icon("undo")}</button>
        </div>
      </div>`;
    });
  }
  html += `</div></div>`;

  html += `</div>`;
  return html;
}

/* ============================================================
   VIEW: CONFIGURAÇÕES
   ============================================================ */
function renderConfigView() {
  let html = `<div class="page-head">
    <div>
      <div class="page-title">Configurações</div>
      <div class="page-subtitle">Propriedade, categorias, quartos e estoque.</div>
    </div>
  </div>`;

  html += `<div class="section-block">
    <div class="section-block-title">Propriedade</div>
    <div class="controls-row" style="border-bottom:none;padding-bottom:0;">
      <div class="field" style="min-width:280px;">
        <label>Nome</label>
        <input type="text" id="cfgPropName" value="${state.property.name}" />
      </div>
      <button class="btn btn-primary btn-sm" id="btnSavePropName">Salvar</button>
    </div>
  </div>`;

  html += `<div class="config-grid">`;

  // Categorias
  html += `<div class="section-block"><div class="section-block-title">Categorias</div><div class="panel-body">`;
  state.categories.forEach(c => {
    html += `<div class="cfg-list-item">
      <span>${c.name} <span style="color:var(--text-faint);">(${roomsOfCategory(c.id).length} quartos)</span></span>
      <button class="btn btn-icon" data-del-cat="${c.id}" title="Remover">${icon("trash", 14)}</button>
    </div>`;
  });
  html += `</div><form class="inline-form" id="formAddCat"><input type="text" name="name" placeholder="Nova categoria (ex: Suíte)" required /><button class="btn btn-sm" type="submit">Adicionar</button></form></div>`;

  // Quartos — com preço e taxa de cama extra (RMS simples)
  html += `<div class="section-block"><div class="section-block-title">Quartos</div><div class="section-block-sub">Diária e taxa de cama extra por quarto.</div><div class="panel-body">`;
  state.rooms.forEach(r => {
    const cat = getCategory(r.categoryId);
    html += `<div class="cfg-room-item">
      <div class="cfg-room-head">
        <span class="rn">${r.name} <span class="rc">(${cat ? cat.name : "-"})</span></span>
        <button class="btn btn-icon" data-del-room="${r.id}" title="Remover">${icon("trash", 14)}</button>
      </div>
      <div class="cfg-room-prices">
        <div class="field"><label>Diária (R$)</label><input type="number" min="0" step="0.01" value="${r.basePrice}" data-room-price="${r.id}"></div>
        <div class="field"><label>Cama extra (R$/noite)</label><input type="number" min="0" step="0.01" value="${r.extraBedFee}" data-room-bedfee="${r.id}"></div>
      </div>
    </div>`;
  });
  html += `</div><form class="inline-form" id="formAddRoom">
    <input type="text" name="name" placeholder="Nome do quarto (ex: Quarto 13)" required />
    <select name="categoryId">${state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select>
    <button class="btn btn-sm" type="submit">Adicionar</button>
  </form></div>`;

  html += `</div>`;

  // Estoque / produtos e serviços da Conta
  html += `<div class="section-block"><div class="section-block-title">Estoque</div><div class="section-block-sub">Produtos e serviços disponíveis na Conta do hóspede.</div><div class="panel-body">`;
  state.catalog.forEach(p => {
    html += `<div class="cfg-list-item">
      <input type="text" value="${p.name}" data-prod-name="${p.id}" style="flex:1;border:1px solid var(--border-strong);border-radius:7px;padding:6px 9px;font-size:12.5px;font-family:var(--font-body);">
      <input type="number" min="0" step="0.01" value="${p.price}" data-prod-price="${p.id}" style="width:100px;border:1px solid var(--border-strong);border-radius:7px;padding:6px 9px;font-size:12.5px;font-family:var(--font-body);">
      <button class="btn btn-icon" data-del-prod="${p.id}" title="Remover">${icon("trash", 14)}</button>
    </div>`;
  });
  html += `</div><form class="inline-form" id="formAddProd">
    <input type="text" name="name" placeholder="Nome do produto/serviço" required />
    <input type="number" name="price" placeholder="Preço (R$)" min="0" step="0.01" required style="max-width:140px;">
    <button class="btn btn-sm" type="submit">Adicionar</button>
  </form></div>`;

  html += `<div class="section-block"><div class="section-block-title">Dados</div>
    <p style="color:var(--text-light);margin:0 0 12px;font-size:12.5px;">Tudo fica salvo no seu navegador, neste computador.</p>
    <button class="btn btn-danger btn-sm" id="btnResetData">${icon("undo", 13)} Restaurar dados de exemplo</button>
  </div>`;

  return html;
}

/* ============================================================
   EVENTOS DA VIEW ATUAL
   ============================================================ */
function bindViewEvents() {
  // Mapa
  const btnPrev = document.getElementById("btnPrevWeek");
  if (btnPrev) btnPrev.onclick = () => { state.range.start = addDays(state.range.start, -7); saveState(); render(); };
  const btnNext = document.getElementById("btnNextWeek");
  if (btnNext) btnNext.onclick = () => { state.range.start = addDays(state.range.start, 7); saveState(); render(); };
  const btnHoje = document.getElementById("btnHoje");
  if (btnHoje) btnHoje.onclick = () => { state.range.start = addDays(todayISO(), -1); saveState(); render(); };
  const jumpDate = document.getElementById("jumpDate");
  if (jumpDate) jumpDate.onchange = (e) => { state.range.start = e.target.value; saveState(); render(); };
  const daysVisible = document.getElementById("daysVisible");
  if (daysVisible) daysVisible.onchange = (e) => { state.range.days = +e.target.value; saveState(); render(); };
  const searchGuest = document.getElementById("searchGuest");
  if (searchGuest) {
    searchGuest.oninput = (e) => { searchTerm = e.target.value; renderSearchOnly(); };
  }
  const btnNovaReserva = document.getElementById("btnNovaReserva");
  if (btnNovaReserva) btnNovaReserva.onclick = () => openReservationForm();
  const btnBloqueio = document.getElementById("btnBloqueio");
  if (btnBloqueio) btnBloqueio.onclick = () => openReservationForm(null, true);
  const btnCancelSelection = document.getElementById("btnCancelSelection");
  if (btnCancelSelection) btnCancelSelection.onclick = () => { pendingSelection = null; render(); };

  document.querySelectorAll("[data-toggle-cat]").forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute("data-toggle-cat");
      state.collapsedCats[id] = !state.collapsedCats[id];
      saveState(); render();
    };
  });

  // Seleção de período em 2 cliques (dia inicial -> dia final) -> escolher Reserva ou Bloqueio
  document.querySelectorAll("[data-cell]").forEach(el => {
    el.onclick = () => {
      const roomId = el.dataset.room, date = el.dataset.date;
      if (!pendingSelection || pendingSelection.roomId !== roomId) {
        pendingSelection = { roomId, date };
        render();
        return;
      }
      const start = pendingSelection.date, end = date;
      const checkIn = start <= end ? start : end;
      const checkOutBase = start <= end ? end : start;
      const checkOut = addDays(checkOutBase, 1);
      pendingSelection = null;
      openActionChooser({ roomId, checkIn, checkOut });
    };
    // drop target para realocação via arrastar
    el.ondragover = (e) => {
      e.preventDefault();
      if (!el.classList.contains("drop-hover")) clearDropHover();
      el.classList.add("drop-hover");
    };
    el.ondrop = (e) => {
      e.preventDefault();
      clearDropHover();
      const resId = e.dataTransfer.getData("text/plain");
      handleReallocateDrop(resId, el.dataset.room, el.dataset.date);
    };
  });

  document.querySelectorAll("[data-open-res]").forEach(el => {
    el.onclick = (ev) => { ev.stopPropagation(); openDetail(el.getAttribute("data-open-res")); };
    el.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", el.getAttribute("data-open-res"));
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
    };
    el.ondragend = () => { el.classList.remove("dragging"); clearDropHover(); };
  });
  document.querySelectorAll("[data-tooltip-res]").forEach(el => {
    el.addEventListener("mouseenter", (e) => showBarTooltip(el.getAttribute("data-tooltip-res"), e));
    el.addEventListener("mousemove", (e) => positionTooltip(e));
    el.addEventListener("mouseleave", hideBarTooltip);
  });
  document.querySelectorAll("[data-open-conta]").forEach(el => {
    el.onclick = (ev) => { ev.stopPropagation(); openConta(el.getAttribute("data-open-conta")); };
  });
  document.querySelectorAll("[data-quick-checkin]").forEach(el => {
    el.onclick = () => { doCheckin(el.getAttribute("data-quick-checkin")); };
  });
  document.querySelectorAll("[data-quick-checkout]").forEach(el => {
    el.onclick = () => { openConta(el.getAttribute("data-quick-checkout")); };
  });
  document.querySelectorAll("[data-quick-revert]").forEach(el => {
    el.onclick = () => { doRevertCheckout(el.getAttribute("data-quick-revert")); };
  });

  // Config
  const btnSaveProp = document.getElementById("btnSavePropName");
  if (btnSaveProp) btnSaveProp.onclick = () => {
    const v = document.getElementById("cfgPropName").value.trim();
    if (v) { state.property.name = v; saveState(); render(); toast("Nome da propriedade atualizado."); }
  };
  const formAddCat = document.getElementById("formAddCat");
  if (formAddCat) formAddCat.onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    state.categories.push({ id: uid("cat"), name });
    saveState(); render(); toast("Categoria adicionada.");
  };
  const formAddRoom = document.getElementById("formAddRoom");
  if (formAddRoom) formAddRoom.onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const categoryId = e.target.categoryId.value;
    if (!name) return;
    state.rooms.push({ id: uid("room"), name, categoryId, basePrice: 400, extraBedFee: 80 });
    saveState(); render(); toast("Quarto adicionado.");
  };
  const formAddProd = document.getElementById("formAddProd");
  if (formAddProd) formAddProd.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get("name").trim();
    const price = +fd.get("price") || 0;
    if (!name) return;
    state.catalog.push({ id: uid("prod"), name, price });
    saveState(); render(); toast("Produto adicionado ao estoque.");
  };
  document.querySelectorAll("[data-room-price]").forEach(el => {
    el.onchange = () => {
      const room = getRoom(el.getAttribute("data-room-price"));
      if (room) { room.basePrice = +el.value || 0; saveState(); toast("Diária atualizada."); }
    };
  });
  document.querySelectorAll("[data-room-bedfee]").forEach(el => {
    el.onchange = () => {
      const room = getRoom(el.getAttribute("data-room-bedfee"));
      if (room) { room.extraBedFee = +el.value || 0; saveState(); toast("Taxa de cama extra atualizada."); }
    };
  });
  document.querySelectorAll("[data-prod-name]").forEach(el => {
    el.onchange = () => {
      const p = state.catalog.find(x => x.id === el.getAttribute("data-prod-name"));
      if (p) { p.name = el.value.trim() || p.name; saveState(); }
    };
  });
  document.querySelectorAll("[data-prod-price]").forEach(el => {
    el.onchange = () => {
      const p = state.catalog.find(x => x.id === el.getAttribute("data-prod-price"));
      if (p) { p.price = +el.value || 0; saveState(); }
    };
  });
  document.querySelectorAll("[data-del-cat]").forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute("data-del-cat");
      if (roomsOfCategory(id).length) { toast("Remova ou realoque os quartos desta categoria antes."); return; }
      confirmModal({
        title: "Remover categoria", message: "Tem certeza que deseja remover esta categoria?", danger: true,
        onConfirm: () => { state.categories = state.categories.filter(c => c.id !== id); saveState(); render(); }
      });
    };
  });
  document.querySelectorAll("[data-del-room]").forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute("data-del-room");
      if (state.reservations.some(r => r.roomId === id)) { toast("Este quarto possui reservas. Remova-as antes."); return; }
      confirmModal({
        title: "Remover quarto", message: "Tem certeza que deseja remover este quarto?", danger: true,
        onConfirm: () => { state.rooms = state.rooms.filter(r => r.id !== id); saveState(); render(); }
      });
    };
  });
  document.querySelectorAll("[data-del-prod]").forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute("data-del-prod");
      confirmModal({
        title: "Remover produto", message: "Remover este item do estoque?", danger: true,
        onConfirm: () => { state.catalog = state.catalog.filter(p => p.id !== id); saveState(); render(); toast("Produto removido."); }
      });
    };
  });
  const btnReset = document.getElementById("btnResetData");
  if (btnReset) btnReset.onclick = () => {
    confirmModal({
      title: "Restaurar dados de exemplo",
      message: "Isso vai apagar todos os dados atuais e recarregar os dados de exemplo. Deseja continuar?",
      danger: true,
      onConfirm: () => { state = seedState(); saveState(); render(); toast("Dados restaurados."); }
    });
  };
}

// Re-renderiza só as classes de destaque da busca, sem perder o foco do campo
function renderSearchOnly() {
  document.querySelectorAll(".bar[data-open-res]").forEach(el => {
    const id = el.getAttribute("data-open-res");
    const r = findReservation(id);
    if (!r) return;
    const term = searchTerm.trim().toLowerCase();
    const guestFull = (r.guestName + " " + r.guestSurname).toLowerCase();
    el.classList.remove("hl", "dim");
    if (term) el.classList.add((guestFull.includes(term) || String(r.code).includes(term)) ? "hl" : "dim");
  });
}

/* ============================================================
   TOOLTIP (comentário e valores ao passar o mouse)
   ============================================================ */
function showBarTooltip(id, evt) {
  const r = findReservation(id);
  if (!r) return;
  const tip = document.getElementById("barTooltip");
  const isBlock = r.type === "bloqueio";
  let html = `<div class="tt-title">${isBlock ? "Bloqueio" : "#" + r.code + " — " + r.guestName + " " + r.guestSurname}</div>`;
  if (r.observations) html += `<div class="tt-obs">"${r.observations}"</div>`;
  html += `<div class="tt-row"><span class="tt-k">Período</span><span>${fmtBR(r.checkIn)} — ${fmtBR(r.checkOut)}</span></div>`;
  if (!isBlock) {
    html += `<div class="tt-row"><span class="tt-k">Total</span><span>${money(reservationTotal(r))}</span></div>`;
    html += `<div class="tt-row"><span class="tt-k">Pago</span><span>${money(reservationPaid(r))}</span></div>`;
    const bal = reservationBalance(r);
    html += `<div class="tt-row"><span class="tt-k">Saldo</span><span>${bal > 0 ? money(bal) : "quitado"}</span></div>`;
  }
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  positionTooltip(evt);
}
function positionTooltip(evt) {
  const tip = document.getElementById("barTooltip");
  if (tip.classList.contains("hidden")) return;
  const pad = 16;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const maxX = window.innerWidth - 280, maxY = window.innerHeight - 140;
  if (x > maxX) x = evt.clientX - 280 - 6;
  if (y > maxY) y = evt.clientY - 100;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function hideBarTooltip() {
  document.getElementById("barTooltip").classList.add("hidden");
}

/* ============================================================
   REALOCAÇÃO POR ARRASTAR (drag and drop) COM CONFIRMAÇÃO
   ============================================================ */
function clearDropHover() {
  document.querySelectorAll(".day-cell.drop-hover").forEach(el => el.classList.remove("drop-hover"));
}
document.addEventListener("dragend", clearDropHover);
document.addEventListener("drop", clearDropHover);

function handleReallocateDrop(resId, targetRoomId, targetDate) {
  const r = findReservation(resId);
  if (!r || !targetRoomId || !targetDate) return;
  const nights = reservationNights(r);
  const newCheckIn = targetDate;
  const newCheckOut = addDays(targetDate, nights);
  if (targetRoomId === r.roomId && newCheckIn === r.checkIn) return;
  if (!roomIsFree(targetRoomId, newCheckIn, newCheckOut, r.id)) { toast("Não é possível mover: quarto ocupado nesse período."); return; }
  const room = getRoom(targetRoomId);
  const who = r.type === "bloqueio" ? "o bloqueio" : `a reserva de <b>${r.guestName} ${r.guestSurname}</b>`;
  confirmModal({
    title: "Confirmar realocação",
    message: `Mover ${who} para <b>${room.name}</b>, período de <b>${fmtBRFull(newCheckIn)}</b> até <b>${fmtBRFull(newCheckOut)}</b> (${nights} noite(s))?`,
    confirmText: "Confirmar realocação",
    onConfirm: () => {
      r.roomId = targetRoomId; r.checkIn = newCheckIn; r.checkOut = newCheckOut;
      saveState(); render(); toast("Reserva realocada com sucesso.");
    }
  });
}

/* ============================================================
   MODAL genérico
   ============================================================ */
function showModal(html, sizeClass) {
  pendingSelection = null;
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  content.className = "modal" + (sizeClass ? " " + sizeClass : "");
  content.innerHTML = html;
  overlay.classList.remove("hidden");
}
function hideModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
  document.getElementById("modalContent").innerHTML = "";
}
document.addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") hideModal();
  if (e.target.closest("[data-close-modal]")) hideModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!document.getElementById("modalOverlay").classList.contains("hidden")) hideModal();
    else if (pendingSelection) { pendingSelection = null; render(); }
  }
});

/* ---------- Modal de confirmação reutilizável ---------- */
function confirmModal(opts) {
  const { title, message, confirmText = "Confirmar", cancelText = "Cancelar", danger = false, onConfirm } = opts;
  const html = `<div class="modal-head"><div><h3>${title}</h3></div><button class="modal-close" data-close-modal>${icon("x", 14)}</button></div>
    <div class="modal-body"><p style="margin:0;font-size:13.5px;line-height:1.6;color:var(--text);">${message}</p></div>
    <div class="modal-foot"><button class="btn" data-close-modal>${cancelText}</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirmYesBtn" style="${danger ? "background:var(--red-txt);color:#fff;" : ""}">${confirmText}</button></div>`;
  showModal(html, "narrow");
  document.getElementById("confirmYesBtn").onclick = () => { hideModal(); onConfirm(); };
}

/* ---------- Escolha de ação após selecionar período no mapa ---------- */
function openActionChooser(prefill) {
  const room = getRoom(prefill.roomId);
  const nights = daysBetween(prefill.checkIn, prefill.checkOut);
  const html = `<div class="modal-head">
    <div><h3>O que deseja fazer?</h3><div class="sub">${room ? room.name : ""} · ${fmtBRFull(prefill.checkIn)} — ${fmtBRFull(prefill.checkOut)} (${nights} noite${nights > 1 ? "s" : ""})</div></div>
    <button class="modal-close" data-close-modal>${icon("x", 14)}</button>
  </div>
  <div class="modal-body">
    <div class="action-choices">
      <div class="action-choice" id="chooseReserva"><div class="lb">Nova reserva</div><div class="ds">Hospedar um novo cliente neste período</div></div>
      <div class="action-choice" id="chooseBloqueio"><div class="lb">Bloqueio / manutenção</div><div class="ds">Deixar o quarto indisponível</div></div>
    </div>
  </div>`;
  showModal(html, "narrow");
  document.getElementById("chooseReserva").onclick = () => { hideModal(); openReservationForm(prefill); };
  document.getElementById("chooseBloqueio").onclick = () => { hideModal(); openReservationForm(prefill, true); };
}

/* ============================================================
   FORMULÁRIO: Nova Reserva / Editar Reserva / Bloqueio
   ============================================================ */
function openReservationForm(prefill, isBlock) {
  const editing = prefill && prefill.id ? prefill : null;
  const data = editing || prefill || {};
  const block = isBlock || (editing && editing.type === "bloqueio");

  const initialRoom = data.roomId ? getRoom(data.roomId) : null;
  const catId = data.categoryId || (initialRoom ? initialRoom.categoryId : (state.categories[0] && state.categories[0].id));
  const checkIn = data.checkIn || todayISO();
  const checkOut = data.checkOut || addDays(checkIn, 1);
  const defaultPrice = data.pricePerNight != null ? data.pricePerNight : (initialRoom ? initialRoom.basePrice : 400);
  const defaultNights = Math.max(1, daysBetween(checkIn, checkOut));

  const title = block ? "Bloquear quarto" : (editing ? `Editar reserva #${editing.code}` : "Nova reserva");

  let html = `<div class="modal-head">
    <div><h3>${title}</h3><div class="sub">${block ? "O quarto ficará indisponível para reservas no período." : "Preencha os dados do hóspede e da hospedagem."}</div></div>
    <button class="modal-close" data-close-modal>${icon("x", 14)}</button>
  </div>
  <form id="resForm">
  <div class="modal-body">`;

  if (!block) {
    html += `<div class="section-title">Hóspede Responsável</div>
    <div class="form-grid">
      <div class="field"><label>Nome *</label><input type="text" name="guestName" required value="${data.guestName || ""}"></div>
      <div class="field"><label>Sobrenome</label><input type="text" name="guestSurname" value="${data.guestSurname || ""}"></div>
      <div class="field"><label>Telefone / WhatsApp</label><input type="text" name="guestPhone" value="${data.guestPhone || ""}"></div>
      <div class="field"><label>E-mail</label><input type="email" name="guestEmail" value="${data.guestEmail || ""}"></div>
      <div class="field"><label>Documento (CPF)</label><input type="text" name="guestDocument" value="${data.guestDocument || ""}"></div>
      <div class="field"><label>Origem / Canal</label>
        <select name="channel">
          ${["Reserva Manual", "Telefone", "WhatsApp", "Site", "Booking.com", "Airbnb", "Indicação"].map(o => `<option ${data.channel === o ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </div>
    </div>`;
  } else {
    html += `<div class="section-title">Motivo do Bloqueio</div>
    <div class="form-grid"><div class="field span2"><label>Motivo</label><input type="text" name="guestName" value="${data.observations || "Manutenção"}" placeholder="Ex: Manutenção, reforma, uso interno..."></div></div>`;
  }

  html += `<div class="section-title">Período e Acomodação</div>
  <div class="form-grid">
    <div class="field"><label>Check-in *</label><input type="date" name="checkIn" required value="${checkIn}"></div>
    <div class="field"><label>Check-out *</label><input type="date" name="checkOut" required value="${checkOut}"></div>
    <div class="field"><label>Categoria</label>
      <select name="categoryId" id="fCategoryId">
        ${state.categories.map(c => `<option value="${c.id}" ${c.id === catId ? "selected" : ""}>${c.name}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Quarto *</label>
      <select name="roomId" id="fRoomId" required></select>
    </div>
    ${!block ? `<div class="field"><label>Adultos</label><input type="number" min="1" name="adults" value="${data.adults || 2}"></div>
    <div class="field"><label>Crianças</label><input type="number" min="0" name="children" value="${data.children || 0}"></div>
    <div class="field"><label>Camas extras</label><input type="number" min="0" name="extraBeds" id="fExtraBeds" value="${data.extraBeds || 0}"><small id="extraBedHint"></small></div>` : ""}
  </div>`;

  if (!block) {
    html += `<div class="section-title">Valores e Pagamento</div>
    <div class="form-grid">
      <div class="field"><label>Valor da diária (R$)</label><input type="number" min="0" step="0.01" name="pricePerNight" id="fPrice" value="${defaultPrice}"><small id="priceHint"></small></div>
      <div class="field"><label>Valor total das diárias (R$)</label><input type="number" min="0" step="0.01" id="fTotal" value="${+(defaultPrice * defaultNights).toFixed(2)}"><small>Preencha aqui para digitar o total em vez da diária</small></div>
      <div class="field"><label>Ajuste manual (R$)</label><input type="number" step="0.01" name="manualAdjustment" value="${data.manualAdjustment || 0}"><small>Negativo = desconto · Positivo = acréscimo</small></div>
      <div class="field"><label>Forma de pagamento</label>
        <select name="paymentMethod">
          ${["Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Transferência/Depósito", "Faturado", "Cortesia", "Permuta"].map(o => `<option ${data.paymentMethod === o ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Status do pagamento</label>
        <select name="paymentStatus" id="fPayStatus">
          <option value="pendente" ${data.paymentStatus === "pendente" ? "selected" : ""}>Pendente</option>
          <option value="parcial" ${data.paymentStatus === "parcial" ? "selected" : ""}>Parcial (entrada)</option>
          <option value="pago" ${data.paymentStatus === "pago" ? "selected" : ""}>Pago integralmente</option>
        </select>
      </div>
      ${!editing ? `<div class="field" id="fEntradaWrap"><label>Valor pago agora (R$)</label><input type="number" min="0" step="0.01" name="entrada" value="0"></div>` : ""}
    </div>`;
  }

  html += `<div class="section-title">Observações</div>
  <div class="form-grid"><div class="field span2"><textarea name="observations" rows="3" placeholder="Observações internas sobre a reserva...">${block ? "" : (data.observations || "")}</textarea></div></div>`;

  html += `</div>
  <div class="modal-foot">
    <button type="button" class="btn" data-close-modal>Cancelar</button>
    <button type="submit" class="btn btn-primary">${editing ? "Salvar alterações" : (block ? "Bloquear" : "Criar reserva")}</button>
  </div>
  </form>`;

  showModal(html, false);

  function refreshRoomOptions(autoFillPrice) {
    const catSel = document.getElementById("fCategoryId").value;
    const roomSel = document.getElementById("fRoomId");
    const ci = document.querySelector('[name="checkIn"]').value;
    const co = document.querySelector('[name="checkOut"]').value;
    const rooms = roomsOfCategory(catSel);
    const preferredRoom = data.roomId;
    roomSel.innerHTML = rooms.map(r => {
      const free = roomIsFree(r.id, ci, co, editing ? editing.id : null);
      const selected = r.id === preferredRoom ? "selected" : "";
      return `<option value="${r.id}" ${selected} ${!free ? "disabled" : ""}>${r.name}${!free ? " — ocupado no período" : ""}</option>`;
    }).join("");
    syncRoomDependentFields(autoFillPrice);
  }
  function syncRoomDependentFields(autoFillPrice) {
    const roomSel = document.getElementById("fRoomId");
    const room = getRoom(roomSel.value);
    if (!block) {
      const hint = document.getElementById("extraBedHint");
      if (hint) hint.textContent = room ? `Taxa: ${money(room.extraBedFee)} por cama/noite` : "";
      if (autoFillPrice && !editing && room) {
        document.getElementById("fPrice").value = room.basePrice;
        syncTotalFromPrice();
      }
    }
  }
  document.getElementById("fCategoryId").onchange = () => refreshRoomOptions(true);
  document.getElementById("fRoomId").onchange = () => syncRoomDependentFields(true);
  document.querySelector('[name="checkIn"]').onchange = () => { refreshRoomOptions(false); syncTotalFromPrice(); };
  document.querySelector('[name="checkOut"]').onchange = () => { refreshRoomOptions(false); syncTotalFromPrice(); };
  refreshRoomOptions(false);

  function getFormNights() {
    const ci = document.querySelector('[name="checkIn"]').value;
    const co = document.querySelector('[name="checkOut"]').value;
    if (!ci || !co || co <= ci) return 1;
    return Math.max(1, daysBetween(ci, co));
  }
  function syncTotalFromPrice() {
    const fTotal = document.getElementById("fTotal");
    const fPrice = document.getElementById("fPrice");
    if (!fTotal || !fPrice) return;
    const nights = getFormNights();
    fTotal.value = (+fPrice.value * nights).toFixed(2);
    const hint = document.getElementById("priceHint");
    if (hint) hint.textContent = nights > 1 ? `× ${nights} noites` : "";
  }
  function syncPriceFromTotal() {
    const fTotal = document.getElementById("fTotal");
    const fPrice = document.getElementById("fPrice");
    if (!fTotal || !fPrice) return;
    const nights = getFormNights();
    fPrice.value = (+fTotal.value / nights).toFixed(2);
    const hint = document.getElementById("priceHint");
    if (hint) hint.textContent = nights > 1 ? `× ${nights} noites` : "";
  }
  if (!block) {
    document.getElementById("fPrice").oninput = syncTotalFromPrice;
    document.getElementById("fTotal").oninput = syncPriceFromTotal;
    syncTotalFromPrice();
  }

  if (!block) {
    const payStatus = document.getElementById("fPayStatus");
    const entradaWrap = document.getElementById("fEntradaWrap");
    if (entradaWrap) {
      function syncEntrada() { entradaWrap.style.display = payStatus.value === "pendente" ? "none" : ""; }
      payStatus.onchange = syncEntrada; syncEntrada();
    }
  }

  document.getElementById("resForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const roomId = fd.get("roomId");
    const checkInV = fd.get("checkIn");
    const checkOutV = fd.get("checkOut");
    if (!roomId) { toast("Selecione um quarto disponível."); return; }
    if (checkOutV <= checkInV) { toast("A data de check-out deve ser após o check-in."); return; }
    if (!roomIsFree(roomId, checkInV, checkOutV, editing ? editing.id : null)) { toast("Este quarto já está ocupado nesse período."); return; }

    if (block) {
      if (editing) {
        Object.assign(editing, { roomId, checkIn: checkInV, checkOut: checkOutV, observations: fd.get("guestName") || "Bloqueado" });
      } else {
        state.reservations.push({
          id: uid("res"), type: "bloqueio", code: state.nextCode++, roomId,
          guestName: "Manutenção", guestSurname: "", guestPhone: "", guestEmail: "", guestDocument: "",
          checkIn: checkInV, checkOut: checkOutV, adults: 0, children: 0, extraBeds: 0, pricePerNight: 0, manualAdjustment: 0,
          paymentMethod: "-", paymentStatus: "pago", channel: "-", observations: fd.get("guestName") || "Bloqueado",
          charges: [], payments: [], checkinAt: null, checkoutAt: null,
        });
      }
      saveState(); hideModal(); render(); toast(editing ? "Bloqueio atualizado." : "Quarto bloqueado.");
      return;
    }

    const payload = {
      type: "reserva",
      roomId, checkIn: checkInV, checkOut: checkOutV,
      guestName: fd.get("guestName"), guestSurname: fd.get("guestSurname"),
      guestPhone: fd.get("guestPhone"), guestEmail: fd.get("guestEmail"), guestDocument: fd.get("guestDocument"),
      channel: fd.get("channel"),
      adults: +fd.get("adults") || 1, children: +fd.get("children") || 0, extraBeds: +fd.get("extraBeds") || 0,
      pricePerNight: +fd.get("pricePerNight") || 0,
      manualAdjustment: +fd.get("manualAdjustment") || 0,
      paymentMethod: fd.get("paymentMethod"),
      paymentStatus: fd.get("paymentStatus"),
      observations: fd.get("observations"),
    };

    if (editing) {
      Object.assign(editing, payload);
      saveState(); hideModal(); render(); toast("Reserva atualizada.");
      openDetail(editing.id);
    } else {
      const nr = Object.assign({
        id: uid("res"), code: state.nextCode++, charges: [], payments: [], checkinAt: null, checkoutAt: null,
      }, payload);
      const entrada = +fd.get("entrada") || 0;
      if (entrada > 0) {
        nr.payments.push({ id: uid("pay"), amount: entrada, method: payload.paymentMethod, date: todayISO() });
      }
      state.reservations.push(nr);
      saveState(); hideModal(); render(); toast(`Reserva #${nr.code} criada com sucesso.`);
    }
  };
}

/* ============================================================
   DETALHE DA RESERVA
   ============================================================ */
function openDetail(id) {
  const r = findReservation(id);
  if (!r) return;
  const room = getRoom(r.roomId);
  const cat = room ? getCategory(room.categoryId) : null;
  const status = reservationStatus(r);
  const isBlock = r.type === "bloqueio";
  const paid = reservationPaid(r), bal = reservationBalance(r);
  const extraBedTotal = reservationExtraBedTotal(r);

  let html = `<div class="modal-head">
    <div><h3>${isBlock ? "Bloqueio" : r.guestName + " " + (r.guestSurname || "")}</h3>
    <div class="sub">${isBlock ? "" : "Reserva #" + r.code + " · "}${room ? room.name : "-"} ${cat ? "· " + cat.name : ""}</div></div>
    <button class="modal-close" data-close-modal>${icon("x", 14)}</button>
  </div>
  <div class="modal-body">
    <span class="pill ${statusPillClass(status)}">${statusLabel(status)}</span>
    ${!isBlock && bal > 0 ? `<span class="pill pill-amber" style="margin-left:6px;">Saldo a receber: ${money(bal)}</span>` : ""}
    ${!isBlock && bal <= 0 ? `<span class="pill pill-green" style="margin-left:6px;">Pagamento em dia</span>` : ""}

    <div class="detail-grid" style="margin-top:18px;">
      <div class="detail-item"><div class="k">Check-in</div><div class="v">${fmtBRFull(r.checkIn)}${r.checkinAt ? " · feito às " + r.checkinAt.split("T")[1] : ""}</div></div>
      <div class="detail-item"><div class="k">Check-out</div><div class="v">${fmtBRFull(r.checkOut)}${r.checkoutAt ? " · feito às " + r.checkoutAt.split("T")[1] : ""}</div></div>
      <div class="detail-item"><div class="k">Noites</div><div class="v">${reservationNights(r)}</div></div>
      <div class="detail-item"><div class="k">Acomodação</div><div class="v">${room ? room.name : "-"}</div></div>
      ${!isBlock ? `
      <div class="detail-item"><div class="k">Hóspedes</div><div class="v">${r.adults} adulto(s), ${r.children} criança(s)${r.extraBeds ? `, ${r.extraBeds} cama(s) extra` : ""}</div></div>
      <div class="detail-item"><div class="k">Telefone</div><div class="v">${r.guestPhone || "-"}</div></div>
      <div class="detail-item"><div class="k">E-mail</div><div class="v">${r.guestEmail || "-"}</div></div>
      <div class="detail-item"><div class="k">Documento</div><div class="v">${r.guestDocument || "-"}</div></div>
      <div class="detail-item"><div class="k">Canal</div><div class="v">${r.channel || "-"}</div></div>
      <div class="detail-item"><div class="k">Forma de pagamento</div><div class="v">${r.paymentMethod || "-"}</div></div>
      ` : ""}
    </div>

    ${r.observations ? `<div class="section-title">Observações</div><p style="margin:0;color:var(--text);">${r.observations}</p>` : ""}

    ${!isBlock ? `<div class="summary-box">
      <div><div class="k">Diárias</div><div class="v">${money(reservationRoomTotal(r))}</div></div>
      <div><div class="k">Consumo</div><div class="v">${money(reservationChargesTotal(r))}</div></div>
      <div><div class="k">Total Pago</div><div class="v pos">${money(paid)}</div></div>
      <div><div class="k">Saldo</div><div class="v ${bal > 0 ? "neg" : "pos"}">${money(bal)}</div></div>
    </div>
    <div class="summary-extra">
      ${extraBedTotal ? `<span>Cama extra: <b>${money(extraBedTotal)}</b></span>` : ""}
      ${r.manualAdjustment ? `<span>Ajuste manual: <b>${money(r.manualAdjustment)}</b></span>` : ""}
      <span>Total geral: <b>${money(reservationTotal(r))}</b></span>
    </div>` : ""}

    <div class="action-row">
      ${!isBlock && status === "reservado" ? `<button class="btn btn-primary" data-act="checkin">${icon("check", 14)} Fazer check-in</button>` : ""}
      ${!isBlock && status === "em_casa" ? `<button class="btn btn-primary" data-act="checkout">${icon("check", 14)} Fazer check-out</button>` : ""}
      ${!isBlock && status === "saiu" ? `<button class="btn btn-primary" data-act="conta">${icon("receipt", 14)} Conta / lançar consumo</button>` : ""}
      ${!isBlock && status !== "saiu" ? `<button class="btn" data-act="conta">${icon("receipt", 14)} Conta</button>` : ""}
      ${!isBlock && status === "em_casa" ? `<button class="btn" data-act="revertcheckin">${icon("undo", 14)} Reverter check-in</button>` : ""}
      ${!isBlock && status === "saiu" ? `<button class="btn" data-act="revert">${icon("undo", 14)} Reverter check-out</button>` : ""}
      <button class="btn" data-act="edit">${icon("pencil", 14)} Editar</button>
      ${!isBlock ? `<button class="btn" data-act="realocar">${icon("arrows", 14)} Realocar</button>` : ""}
      <span class="spacer"></span>
      <button class="btn btn-danger" data-act="remover">${icon("trash", 14)} Remover</button>
    </div>
  </div>`;

  showModal(html, false);

  document.querySelector('[data-act="checkin"]')?.addEventListener("click", () => { doCheckin(r.id); hideModal(); });
  document.querySelector('[data-act="checkout"]')?.addEventListener("click", () => { hideModal(); openConta(r.id); });
  document.querySelector('[data-act="conta"]')?.addEventListener("click", () => { hideModal(); openConta(r.id); });
  document.querySelector('[data-act="revert"]')?.addEventListener("click", () => { doRevertCheckout(r.id); });
  document.querySelector('[data-act="revertcheckin"]')?.addEventListener("click", () => { doRevertCheckin(r.id); });
  document.querySelector('[data-act="edit"]')?.addEventListener("click", () => { hideModal(); openReservationForm(r); });
  document.querySelector('[data-act="realocar"]')?.addEventListener("click", () => { hideModal(); openReservationForm(r); });
  document.querySelector('[data-act="remover"]')?.addEventListener("click", () => {
    confirmModal({
      title: "Remover",
      message: `Remover ${isBlock ? "este bloqueio" : "a reserva #" + r.code} permanentemente? Esta ação não pode ser desfeita.`,
      danger: true,
      onConfirm: () => {
        state.reservations = state.reservations.filter(x => x.id !== r.id);
        saveState(); render(); toast("Removido.");
      }
    });
  });
}

function doCheckin(id) {
  const r = findReservation(id);
  if (!r) return;
  r.checkinAt = todayISO() + "T" + new Date().toTimeString().slice(0, 5);
  saveState(); render(); toast(`Check-in de ${r.guestName} realizado.`);
}
function doRevertCheckin(id) {
  const r = findReservation(id);
  if (!r) return;
  confirmModal({
    title: "Reverter check-in",
    message: `Desfazer o check-in de <b>${r.guestName} ${r.guestSurname}</b>? O status voltará para "Reservado".`,
    confirmText: "Reverter check-in",
    onConfirm: () => {
      r.checkinAt = null;
      saveState(); render(); toast(`Check-in de ${r.guestName} revertido.`);
    }
  });
}
function doRevertCheckout(id) {
  const r = findReservation(id);
  if (!r) return;
  confirmModal({
    title: "Reverter check-out",
    message: `Reabrir a estadia de <b>${r.guestName} ${r.guestSurname}</b>? O status voltará para "Em Casa".`,
    confirmText: "Reverter check-out",
    onConfirm: () => {
      r.checkoutAt = null;
      saveState(); render(); toast(`Check-out de ${r.guestName} revertido.`);
    }
  });
}

/* ============================================================
   CONTA (consumo / fechamento) — pode ser usada antes ou depois do check-out
   ============================================================ */
function openConta(id) {
  const r = findReservation(id);
  if (!r || r.type === "bloqueio") return;

  function bodyHtml() {
    const room = getRoom(r.roomId);
    const status = reservationStatus(r);
    const total = reservationTotal(r), paid = reservationPaid(r), bal = reservationBalance(r);
    const extraBedTotal = reservationExtraBedTotal(r);
    let h = `<div class="modal-head">
      <div><h3>Conta — ${r.guestName} ${r.guestSurname || ""}</h3><div class="sub">${room ? room.name : "-"} · Reserva #${r.code} ${status === "saiu" ? "· já com check-out feito" : ""}</div></div>
      <button class="modal-close" data-close-modal>${icon("x", 14)}</button>
    </div>
    <div class="modal-body">
      ${status === "saiu" ? `<div class="pill pill-gray" style="margin-bottom:14px;">Hóspede já fez check-out — você ainda pode lançar consumo e registrar pagamentos.</div>` : ""}
      <div class="section-title">Adicionar item rápido</div>
      <div class="catalog">
        ${state.catalog.map(c => `<div class="catalog-item" data-add-catalog="${c.id}"><div class="nm">${c.name}</div><div class="pr">${money(c.price)}</div></div>`).join("")}
      </div>

      <form id="formCustomCharge" style="display:flex;gap:8px;align-items:flex-end;margin-bottom:16px;">
        <div class="field" style="flex:2;"><label>Item avulso</label><input type="text" name="name" placeholder="Descrição do item"></div>
        <div class="field" style="flex:1;"><label>Qtd</label><input type="number" name="qty" value="1" min="1"></div>
        <div class="field" style="flex:1;"><label>Preço (R$)</label><input type="number" name="price" step="0.01" min="0" value="0"></div>
        <button type="submit" class="btn btn-sm">Adicionar</button>
      </form>

      <div class="section-title">Itens da Conta</div>
      <table class="charges">
        <thead><tr><th>Item</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
          <tr><td>Diárias (${reservationNights(r)} noite(s) × ${money(r.pricePerNight)})</td><td>-</td><td>-</td><td>${money(reservationRoomTotal(r))}</td><td></td></tr>
          ${extraBedTotal ? `<tr><td>Cama extra (${r.extraBeds} × ${reservationNights(r)} noite(s))</td><td>-</td><td>-</td><td>${money(extraBedTotal)}</td><td></td></tr>` : ""}
          ${r.manualAdjustment ? `<tr><td>Ajuste manual</td><td>-</td><td>-</td><td>${money(r.manualAdjustment)}</td><td></td></tr>` : ""}
          ${(r.charges || []).map(c => `<tr>
            <td>${c.name}</td>
            <td><div class="qty-ctrl"><button type="button" data-dec="${c.id}">−</button>${c.qty}<button type="button" data-inc="${c.id}">+</button></div></td>
            <td>${money(c.price)}</td><td>${money(c.qty * c.price)}</td>
            <td><button type="button" class="btn btn-icon" data-del-charge="${c.id}">${icon("x", 12)}</button></td>
          </tr>`).join("")}
        </tbody>
      </table>

      <div class="summary-box">
        <div><div class="k">Total Geral</div><div class="v">${money(total)}</div></div>
        <div><div class="k">Total Pago</div><div class="v pos">${money(paid)}</div></div>
        <div><div class="k">Saldo a Receber</div><div class="v ${bal > 0 ? "neg" : "pos"}">${money(bal)}</div></div>
        <div><div class="k">Status</div><div class="v">${bal <= 0 ? "Quitado" : "Pendente"}</div></div>
      </div>

      <div class="section-title">Registrar Pagamento</div>
      <form id="formPayment" style="display:flex;gap:8px;align-items:flex-end;">
        <div class="field" style="flex:1;"><label>Valor (R$)</label><input type="number" name="amount" step="0.01" min="0" value="${bal > 0 ? bal.toFixed(2) : ""}"></div>
        <div class="field" style="flex:1;"><label>Forma de pagamento</label>
          <select name="method">${["Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Transferência/Depósito"].map(o => `<option>${o}</option>`).join("")}</select>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Registrar Pagamento</button>
      </form>
    </div>
    <div class="modal-foot">
      <div class="left">
        <button class="btn btn-icon" id="btnImprimirConta" title="Imprimir">${icon("printer", 15)}</button>
        ${status === "saiu" ? `<button class="btn btn-icon" id="btnRevertHere" title="Reverter check-out">${icon("undo", 15)}</button>` : ""}
      </div>
      <button class="btn" data-close-modal>Fechar</button>
      ${status === "em_casa" ? `<button class="btn btn-primary" id="btnFecharConta">Fechar conta e efetuar check-out</button>` : ""}
    </div>`;
    return h;
  }

  function mount() {
    showModal(bodyHtml(), true);

    document.querySelectorAll("[data-add-catalog]").forEach(el => {
      el.onclick = () => {
        const item = state.catalog.find(p => p.id === el.getAttribute("data-add-catalog"));
        if (!item) return;
        const existing = r.charges.find(c => c.name === item.name && c.price === item.price);
        if (existing) existing.qty += 1;
        else r.charges.push({ id: uid("ch"), name: item.name, qty: 1, price: item.price });
        saveState(); mount();
      };
    });
    document.querySelectorAll("[data-inc]").forEach(el => {
      el.onclick = () => { const c = r.charges.find(x => x.id === el.getAttribute("data-inc")); if (c) c.qty++; saveState(); mount(); };
    });
    document.querySelectorAll("[data-dec]").forEach(el => {
      el.onclick = () => {
        const c = r.charges.find(x => x.id === el.getAttribute("data-dec"));
        if (c) { c.qty--; if (c.qty <= 0) r.charges = r.charges.filter(x => x.id !== c.id); }
        saveState(); mount();
      };
    });
    document.querySelectorAll("[data-del-charge]").forEach(el => {
      el.onclick = () => { r.charges = r.charges.filter(x => x.id !== el.getAttribute("data-del-charge")); saveState(); mount(); };
    });
    document.getElementById("formCustomCharge").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = fd.get("name").trim();
      const qty = +fd.get("qty") || 1;
      const price = +fd.get("price") || 0;
      if (!name) { toast("Informe a descrição do item."); return; }
      r.charges.push({ id: uid("ch"), name, qty, price });
      saveState(); mount();
    };
    document.getElementById("formPayment").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const amount = +fd.get("amount") || 0;
      if (amount <= 0) { toast("Informe um valor válido."); return; }
      r.payments.push({ id: uid("pay"), amount, method: fd.get("method"), date: todayISO() });
      if (reservationBalance(r) <= 0) r.paymentStatus = "pago"; else r.paymentStatus = "parcial";
      saveState(); mount(); toast("Pagamento registrado.");
    };
    document.getElementById("btnImprimirConta").onclick = () => window.print();
    const btnFechar = document.getElementById("btnFecharConta");
    if (btnFechar) btnFechar.onclick = () => {
      const bal = reservationBalance(r);
      const doCheckout = () => {
        r.checkoutAt = todayISO() + "T" + new Date().toTimeString().slice(0, 5);
        saveState(); hideModal(); render(); toast(`Check-out de ${r.guestName} concluído.`);
      };
      if (bal > 0) {
        confirmModal({
          title: "Saldo em aberto",
          message: `Ainda há um saldo de <b>${money(bal)}</b> em aberto. Deseja efetuar o check-out mesmo assim?`,
          confirmText: "Efetuar check-out mesmo assim", danger: true,
          onConfirm: doCheckout
        });
      } else doCheckout();
    };
    const btnRevertHere = document.getElementById("btnRevertHere");
    if (btnRevertHere) btnRevertHere.onclick = () => {
      confirmModal({
        title: "Reverter check-out",
        message: `Reabrir a estadia de <b>${r.guestName} ${r.guestSurname}</b>?`,
        confirmText: "Reverter check-out",
        onConfirm: () => { r.checkoutAt = null; saveState(); mount(); toast("Check-out revertido."); }
      });
    };
  }

  mount();
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  state = loadState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => setView(t.dataset.view));
  });

  render();
  initCloudSync();
}

document.addEventListener("DOMContentLoaded", init);
