/* Análise financeira simplificada — funções puras (sem DOM e sem Firebase).
   Lê o estado do sistema e monta lançamentos, faturamento por mês e consumo. */

const TZ = "America/Sao_Paulo";
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const cents = v => Math.round((Number(v) || 0) * 100);
const fromCents = c => c / 100;

/* Todo id do sistema embute o momento da criação (base36 do Date.now() depois de 8 letras).
   É isso que dá a hora exata em que cada lançamento foi feito. */
export function idTime(id) {
  try {
    const ms = parseInt(String(id).split("_").slice(1).join("_").slice(8), 36);
    return ms > 1.5e12 && ms < 4e12 ? ms : null;
  } catch (e) { return null; }
}

function partsBR(ms) {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const o = {};
  f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
  if (o.hour === "24") o.hour = "00";
  return o;
}
export const fmtDateTimeBR = ms => { const p = partsBR(ms); return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`; };
export const fmtDateBR = iso => { const [y, m, d] = String(iso || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : "—"; };
export const monthOfMs = ms => { const p = partsBR(ms); return `${p.year}-${p.month}`; };
export const monthLabel = key => { const [y, m] = key.split("-"); return `${MONTHS[+m - 1]}/${y}`; };

/* Quando o lançamento foi feito: a hora exata do id; se faltar, a data gravada. */
export function launchMs(item) {
  return idTime(item.id) ?? (item.date ? new Date(item.date + "T12:00:00-03:00").getTime() : 0);
}

const guestName = r => `${r.guestName || ""} ${r.guestSurname || ""}`.trim() || "(sem nome)";
const nightsOf = r => Math.max(1, Math.round((Date.parse(r.checkOut + "T00:00:00Z") - Date.parse(r.checkIn + "T00:00:00Z")) / 86400000));

/* Todos os pagamentos lançados, na ordem em que foram lançados (do mais antigo ao mais novo). */
export function buildLedger(state) {
  const out = [];
  let seq = 0;
  (state.reservations || []).forEach(r => {
    if (r.type === "bloqueio") return;
    (r.payments || []).forEach(p => {
      out.push({
        seq: seq++, id: p.id, resId: r.id, code: r.code,
        checkIn: r.checkIn, checkOut: r.checkOut, guest: guestName(r),
        ms: launchMs(p), amount: Number(p.amount) || 0, method: p.method || "—",
        estornado: !!p.estornado, estornadoEm: p.estornadoEm || null,
      });
    });
  });
  out.sort((a, b) => a.ms - b.ms || a.seq - b.seq);
  return out;
}

export function ledgerTotal(rows) {
  return fromCents(rows.reduce((s, x) => s + (x.estornado ? 0 : cents(x.amount)), 0));
}

/* Faturamento por mês.
   - Recebido: pagamentos (sem estornos) pelo mês em que foram lançados.
   - Hospedagem: cada diária cai no mês da noite; ajuste manual no mês do check-in.
   - Consumo: pelo mês em que foi lançado. */
export function buildMonthly(state, currentMonth) {
  const rooms = new Map((state.rooms || []).map(r => [r.id, r]));
  const acc = new Map();
  const row = k => { if (!acc.has(k)) acc.set(k, { month: k, recebido: 0, hospedagem: 0, consumo: 0 }); return acc.get(k); };

  (state.reservations || []).forEach(r => {
    if (r.type === "bloqueio") return;
    const fee = (rooms.get(r.roomId) || {}).extraBedFee || 0;
    const perNight = cents(r.pricePerNight) + cents(fee) * (Number(r.extraBeds) || 0);
    const n = nightsOf(r);
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.parse(r.checkIn + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 7);
      row(d).hospedagem += perNight;
    }
    if (r.manualAdjustment) row(r.checkIn.slice(0, 7)).hospedagem += cents(r.manualAdjustment);
    (r.charges || []).forEach(c => { row(monthOfMs(launchMs(c))).consumo += Math.round((Number(c.qty) || 0) * cents(c.price)); });
  });
  buildLedger(state).forEach(x => { if (!x.estornado) row(monthOfMs(x.ms)).recebido += cents(x.amount); });

  const rows = [...acc.values()].sort((a, b) => a.month.localeCompare(b.month)).map(x => ({
    month: x.month, recebido: fromCents(x.recebido), hospedagem: fromCents(x.hospedagem), consumo: fromCents(x.consumo),
    total: fromCents(x.hospedagem + x.consumo), previsto: x.month > currentMonth,
  }));
  const sum = k => fromCents(rows.reduce((s, x) => s + cents(x[k]), 0));
  return { rows, totals: { recebido: sum("recebido"), hospedagem: sum("hospedagem"), consumo: sum("consumo"), total: sum("total") } };
}

/* Itens de consumo, do mais ao menos consumido. */
export function buildConsumption(state, month) {
  const map = new Map();
  (state.reservations || []).forEach(r => {
    if (r.type === "bloqueio") return;
    (r.charges || []).forEach(c => {
      if (month && monthOfMs(launchMs(c)) !== month) return;
      const key = String(c.name || "").trim().toLowerCase();
      if (!map.has(key)) map.set(key, { name: String(c.name || "").trim() || "(sem nome)", qty: 0, total: 0 });
      const it = map.get(key);
      it.qty += Number(c.qty) || 0;
      it.total += Math.round((Number(c.qty) || 0) * cents(c.price));
    });
  });
  const items = [...map.values()].map(x => ({ name: x.name, qty: x.qty, total: fromCents(x.total) }));
  const totalValue = fromCents(items.reduce((s, x) => s + cents(x.total), 0));
  const totalQty = items.reduce((s, x) => s + x.qty, 0);
  return { items, totalValue, totalQty };
}
