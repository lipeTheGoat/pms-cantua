/* Histórico de alterações — funções puras (sem DOM e sem Firebase).
   Compara dois estados do sistema e descreve, em português, o que mudou. */

const BR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = v => BR.format(Number(v) || 0);
export const brDate = iso => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m ? `${d}/${m}/${y}` : String(iso);
};
const trunc = (s, n = 60) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const norm = v => (v == null ? "" : v);
const mapById = arr => new Map((arr || []).map(x => [x.id, x]));
const guestOf = r => (r.type === "bloqueio" ? "Bloqueio" : (`${r.guestName || ""} ${r.guestSurname || ""}`.trim() || "(sem nome)"));
const MAX_ENTRIES = 300;

export const GROUP_LABEL = {
  room: "Quarto", category: "Categoria", product: "Estoque", property: "Propriedade",
  reservation: "Reserva", block: "Bloqueio", payment: "Pagamento", charge: "Consumo", system: "Sistema",
};
export const groupOf = type => String(type || "").split(".")[0];
export const isDanger = type => /\.(remove|reverse|checkin_revert|checkout_revert)$/.test(type || "") || /^system\.(reset|bulk)/.test(type || "");

export function stableStringify(v) {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
export function stripUi(s) {
  const { range, collapsedCats, ...rest } = s || {};
  return rest;
}

function diffList(a, b, h) {
  const ma = mapById(a), mb = mapById(b);
  mb.forEach((x, id) => { if (!ma.has(id)) h.add(x); else h.edit(ma.get(id), x); });
  ma.forEach((x, id) => { if (!mb.has(id)) h.remove(x); });
}

const RES_FIELDS = [
  ["roomId", "quarto", "room"], ["checkIn", "check-in", "date"], ["checkOut", "check-out", "date"],
  ["guestName", "nome"], ["guestSurname", "sobrenome"], ["guestPhone", "telefone"], ["guestEmail", "e-mail"],
  ["guestDocument", "documento"], ["adults", "adultos", "num"], ["children", "crianças", "num"],
  ["extraBeds", "camas extras", "num"], ["pricePerNight", "diária", "money"], ["manualAdjustment", "ajuste manual", "money"],
  ["paymentMethod", "forma de pagamento"], ["paymentStatus", "status do pagamento"], ["channel", "canal"],
  ["observations", "observações"],
];

export function diffState(prev, next) {
  const out = [];
  const catNames = new Map(), roomNames = new Map();
  [...(prev.categories || []), ...(next.categories || [])].forEach(c => catNames.set(c.id, c.name));
  [...(prev.rooms || []), ...(next.rooms || [])].forEach(r => roomNames.set(r.id, r.name));
  const catN = id => catNames.get(id) || "?";
  const roomN = id => roomNames.get(id) || "?";

  if (norm(prev.property && prev.property.name) !== norm(next.property && next.property.name)) {
    out.push({ type: "property.rename", summary: `Nome da propriedade alterado: "${prev.property && prev.property.name}" → "${next.property && next.property.name}"` });
  }

  diffList(prev.categories, next.categories, {
    add: c => out.push({ type: "category.add", summary: `Categoria criada: ${c.name}`, data: { after: c } }),
    remove: c => out.push({ type: "category.remove", id: `del_category_${c.id}`, summary: `Categoria REMOVIDA: ${c.name}`, data: { before: c } }),
    edit: (a, b) => { if (a.name !== b.name) out.push({ type: "category.edit", summary: `Categoria renomeada: "${a.name}" → "${b.name}"` }); },
  });

  diffList(prev.rooms, next.rooms, {
    add: r => out.push({ type: "room.add", summary: `Quarto adicionado: ${r.name} (${catN(r.categoryId)}) — diária ${money(r.basePrice)}, cama extra ${money(r.extraBedFee)}`, data: { after: r } }),
    remove: r => out.push({ type: "room.remove", id: `del_room_${r.id}`, summary: `Quarto REMOVIDO: ${r.name} (${catN(r.categoryId)})`, data: { before: r } }),
    edit: (a, b) => {
      const ch = [];
      if (a.name !== b.name) ch.push(`nome: "${a.name}" → "${b.name}"`);
      if (a.categoryId !== b.categoryId) ch.push(`categoria: ${catN(a.categoryId)} → ${catN(b.categoryId)}`);
      if (Number(a.basePrice) !== Number(b.basePrice)) ch.push(`diária: ${money(a.basePrice)} → ${money(b.basePrice)}`);
      if (Number(a.extraBedFee) !== Number(b.extraBedFee)) ch.push(`cama extra: ${money(a.extraBedFee)} → ${money(b.extraBedFee)}`);
      if (ch.length) out.push({ type: "room.edit", summary: `${b.name} alterado:${ch.join("; ")}`, data: { before: a, after: b } });
    },
  });

  diffList(prev.catalog, next.catalog, {
    add: p => out.push({ type: "product.add", summary: `Produto adicionado ao estoque: ${p.name} — ${money(p.price)}`, data: { after: p } }),
    remove: p => out.push({ type: "product.remove", id: `del_product_${p.id}`, summary: `Produto REMOVIDO do estoque: ${p.name} (${money(p.price)})`, data: { before: p } }),
    edit: (a, b) => {
      const ch = [];
      if (a.name !== b.name) ch.push(`nome: "${a.name}" → "${b.name}"`);
      if (Number(a.price) !== Number(b.price)) ch.push(`preço: ${money(a.price)} → ${money(b.price)}`);
      if (ch.length) out.push({ type: "product.edit", summary: `Estoque, ${b.name}: ${ch.join("; ")}`, data: { before: a, after: b } });
    },
  });

  diffList(prev.reservations, next.reservations, {
    add: r => {
      const isB = r.type === "bloqueio";
      out.push({
        type: isB ? "block.add" : "reservation.add",
        summary: isB
          ? `Bloqueio criado: ${roomN(r.roomId)} · ${brDate(r.checkIn)} → ${brDate(r.checkOut)}${r.observations ? " — " + trunc(r.observations, 50) : ""}`
          : `Reserva #${r.code} criada: ${guestOf(r)} · ${roomN(r.roomId)} · ${brDate(r.checkIn)} → ${brDate(r.checkOut)} · diária ${money(r.pricePerNight)}`,
        data: { after: r },
      });
      (r.payments || []).forEach(p => out.push({ type: "payment.add", summary: `Pagamento de ${money(p.amount)} (${p.method}) registrado — reserva #${r.code} (${guestOf(r)})`, data: { payment: p } }));
    },
    remove: r => {
      const isB = r.type === "bloqueio";
      out.push({
        type: isB ? "block.remove" : "reservation.remove",
        id: `del_res_${r.id}`,
        summary: isB
          ? `Bloqueio REMOVIDO: ${roomN(r.roomId)} · ${brDate(r.checkIn)} → ${brDate(r.checkOut)}`
          : `Reserva #${r.code} REMOVIDA: ${guestOf(r)} · ${roomN(r.roomId)} · ${brDate(r.checkIn)} → ${brDate(r.checkOut)}`,
        data: { before: r },
      });
    },
    edit: (a, b) => diffReservation(a, b, roomN, out),
  });

  if (out.length > MAX_ENTRIES) {
    const extra = out.length - MAX_ENTRIES;
    out.length = MAX_ENTRIES;
    out.push({ type: "system.bulk", summary: `Alteração em massa: mais ${extra} registros não detalhados` });
  }
  return out;
}

function diffReservation(a, b, roomN, out) {
  const isB = b.type === "bloqueio";
  const who = `#${b.code} (${guestOf(b)})`;

  const ch = [], changes = [];
  RES_FIELDS.forEach(([k, label, kind]) => {
    const same = (kind === "num" || kind === "money")
      ? Number(a[k] || 0) === Number(b[k] || 0)
      : String(norm(a[k])) === String(norm(b[k]));
    if (same) return;
    const f = kind === "room" ? roomN : kind === "date" ? brDate : kind === "money" ? money
      : (x => (norm(x) === "" ? "(vazio)" : trunc(x)));
    ch.push(`${label}: ${f(a[k])} → ${f(b[k])}`);
    changes.push({ field: k, from: a[k] ?? null, to: b[k] ?? null });
  });
  if (ch.length) {
    out.push({
      type: isB ? "block.edit" : "reservation.edit",
      summary: isB ? `Bloqueio alterado: ${ch.join("; ")}` : `Reserva ${who} alterada: ${ch.join("; ")}`,
      data: { changes },
    });
  }

  if (!a.checkinAt && b.checkinAt) out.push({ type: "reservation.checkin", summary: `Check-in feito: ${who} · ${roomN(b.roomId)}` });
  if (a.checkinAt && !b.checkinAt) out.push({ type: "reservation.checkin_revert", summary: `Check-in REVERTIDO: ${who}` });
  if (!a.checkoutAt && b.checkoutAt) out.push({ type: "reservation.checkout", summary: `Check-out feito: ${who} · ${roomN(b.roomId)}` });
  if (a.checkoutAt && !b.checkoutAt) out.push({ type: "reservation.checkout_revert", summary: `Check-out REVERTIDO: ${who}` });

  diffList(a.payments, b.payments, {
    add: p => out.push({ type: "payment.add", summary: `Pagamento de ${money(p.amount)} (${p.method}) registrado — reserva ${who}`, data: { payment: p } }),
    remove: p => out.push({ type: "payment.remove", summary: `Pagamento APAGADO do registro: ${money(p.amount)} (${p.method}) — reserva ${who}`, data: { before: p } }),
    edit: (pa, pb) => {
      if (!pa.estornado && pb.estornado) out.push({ type: "payment.reverse", summary: `Pagamento ESTORNADO: ${money(pb.amount)} (${pb.method}) — reserva ${who}`, data: { payment: pb } });
      else if (pa.estornado && !pb.estornado) out.push({ type: "payment.edit", summary: `Estorno desfeito: ${money(pb.amount)} (${pb.method}) — reserva ${who}`, data: { payment: pb } });
    },
  });

  diffList(a.charges, b.charges, {
    add: c => out.push({ type: "charge.add", summary: `Consumo lançado: ${c.qty}× ${c.name} (${money(c.price)} cada) — reserva ${who}`, data: { after: c } }),
    remove: c => out.push({ type: "charge.remove", summary: `Consumo REMOVIDO: ${c.qty}× ${c.name} (${money(c.price)} cada) — reserva ${who}`, data: { before: c } }),
    edit: (ca, cb) => {
      const parts = [];
      if (Number(ca.qty) !== Number(cb.qty)) parts.push(`quantidade ${ca.qty} → ${cb.qty}`);
      if (Number(ca.price) !== Number(cb.price)) parts.push(`preço ${money(ca.price)} → ${money(cb.price)}`);
      if (parts.length) out.push({ type: "charge.edit", summary: `Consumo alterado (${cb.name}): ${parts.join("; ")} — reserva ${who}`, data: { before: ca, after: cb } });
    },
  });
}

/* Só o que é remoção "rastreável" (usado para detectar sumiços causados por outro aparelho). */
export function removalsOnly(entries) {
  return entries.filter(e => e.id && e.id.startsWith("del_"));
}
