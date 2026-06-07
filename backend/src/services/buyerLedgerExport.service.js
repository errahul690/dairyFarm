const { DateTime } = require("luxon");
const PDFDocument = require("pdfkit-table");
const XLSX = require("xlsx");
const { getBuyerById } = require("../models/buyers");
const { User } = require("../models/users");
const { getBuyerMonthLedger } = require("./buyerBalance.service");
const { TZ } = require("../utils/istMonth");

const MILK_LABELS = { cow: "Cow", buffalo: "Buffalo", sheep: "Sheep", goat: "Goat" };

function fmtMoney(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toFixed(2);
}

function fmtDateIST(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  if (isNaN(d.getTime())) return "";
  return DateTime.fromJSDate(d, { zone: TZ }).toFormat("dd-MMM-yyyy");
}

function monthLabelFromKey(monthKey) {
  const dt = DateTime.fromFormat(String(monthKey || ""), "yyyy-MM", { zone: TZ });
  if (!dt.isValid) return String(monthKey || "");
  return dt.toFormat("MMMM yyyy");
}

function milkParticulars(entry) {
  const src = MILK_LABELS[entry.milkSource] || entry.milkSource || "Cow";
  const qty = Number(entry.quantity) || 0;
  const rate = Number(entry.pricePerLiter) || 0;
  return `Milk sale — ${src} ${qty.toFixed(2)} L @ ₹${rate.toFixed(2)}/L`;
}

function paymentParticulars(entry) {
  const pt = entry.paymentType ? String(entry.paymentType).replace(/_/g, " ") : "cash";
  return `Payment received — ${pt}`;
}

function buildTallyRows(ledger) {
  const opening = Number(ledger?.summary?.openingBalance) || 0;
  const closing = Number(ledger?.summary?.closingBalance) || 0;
  const entries = (ledger?.entries || [])
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const rows = [];
  let running = opening;

  rows.push({
    date: "",
    particulars: "Opening Balance",
    debit: "",
    credit: "",
    balance: fmtMoney(running),
    isOpening: true,
  });

  entries.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.kind === "milk") {
      running += amt;
      rows.push({
        date: fmtDateIST(e.date),
        particulars: milkParticulars(e),
        debit: fmtMoney(amt),
        credit: "",
        balance: fmtMoney(running),
      });
    } else {
      running -= amt;
      rows.push({
        date: fmtDateIST(e.date),
        particulars: paymentParticulars(e),
        debit: "",
        credit: fmtMoney(amt),
        balance: fmtMoney(running),
      });
    }
  });

  rows.push({
    date: "",
    particulars: "Closing Balance",
    debit: "",
    credit: "",
    balance: fmtMoney(closing),
    isClosing: true,
  });

  return rows;
}

async function buildBuyerMonthLedgerExport(buyerId, monthKey) {
  const ledger = await getBuyerMonthLedger(buyerId, monthKey);
  if (!ledger) return null;

  const buyer = await getBuyerById(buyerId);
  const user = buyer?.userId ? await User.findById(buyer.userId) : null;
  const buyerName = buyer?.name || user?.name || "Buyer";
  const buyerMobile = user?.mobile || ledger.summary?.buyerMobile || "";

  const tallyRows = buildTallyRows(ledger);
  const mk = String(monthKey || ledger.monthKey || "").trim();

  return {
    buyerName,
    buyerMobile,
    monthKey: mk,
    monthLabel: monthLabelFromKey(mk),
    summary: ledger.summary || {},
    tallyRows,
  };
}

async function generateBuyerMonthLedgerPdf(buyerId, monthKey) {
  const data = await buildBuyerMonthLedgerExport(buyerId, monthKey);
  if (!data) return null;

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  const endPromise = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(16).font("Helvetica-Bold").text("Rahul Dairy Farm — Buyer Ledger", { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(11).font("Helvetica").text(`Buyer: ${data.buyerName}${data.buyerMobile ? ` (${data.buyerMobile})` : ""}`, { align: "center" });
  doc.text(`Month: ${data.monthLabel}`, { align: "center" });
  doc.text(`Generated: ${DateTime.now().setZone(TZ).toFormat("dd-MMM-yyyy HH:mm")} IST`, { align: "center" });
  doc.moveDown(0.8);

  doc.fontSize(10).font("Helvetica-Bold").text(`Opening Balance: ₹${fmtMoney(data.summary.openingBalance)}`);
  doc.moveDown(0.5);

  const tableRows = data.tallyRows.map((r) => [
    r.date,
    String(r.particulars || "").slice(0, 42),
    r.debit ? `₹${r.debit}` : "",
    r.credit ? `₹${r.credit}` : "",
    r.balance ? `₹${r.balance}` : "",
  ]);

  const table = {
    headers: ["Date", "Particulars", "Debit (₹)", "Credit (₹)", "Balance (₹)"],
    rows: tableRows,
  };

  await doc.table(table, {
    columnsSize: [72, 200, 68, 68, 72],
    divider: { horizontal: { width: 0.5 }, vertical: { width: 0.5 } },
    prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
    prepareRow: () => doc.font("Helvetica").fontSize(8),
  });

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(10).text("Month summary");
  doc.font("Helvetica").fontSize(9);
  doc.text(`Milk (Debit): ₹${fmtMoney(data.summary.milkIn)}`);
  doc.text(`Payments (Credit): ₹${fmtMoney(data.summary.paymentsOut)}`);
  doc.text(`Closing Balance: ₹${fmtMoney(data.summary.closingBalance)}`);

  doc.end();
  const buffer = await endPromise;
  const safeName = String(data.buyerName || "buyer").replace(/\s+/g, "-").slice(0, 24);
  const filename = `buyer-ledger-${safeName}-${data.monthKey}.pdf`;
  return { buffer, filename, contentType: "application/pdf" };
}

async function generateBuyerMonthLedgerExcel(buyerId, monthKey) {
  const data = await buildBuyerMonthLedgerExport(buyerId, monthKey);
  if (!data) return null;

  const headerBlock = [
    ["Rahul Dairy Farm — Buyer Ledger"],
    [`Buyer: ${data.buyerName}`, `Mobile: ${data.buyerMobile || ""}`],
    [`Month: ${data.monthLabel}`],
    [`Opening Balance: ₹${fmtMoney(data.summary.openingBalance)}`],
    [],
    ["Date", "Particulars", "Debit (₹)", "Credit (₹)", "Balance (₹)"],
  ];

  const body = data.tallyRows.map((r) => [
    r.date,
    r.particulars,
    r.debit !== "" ? Number(r.debit) : "",
    r.credit !== "" ? Number(r.credit) : "",
    r.balance !== "" ? Number(r.balance) : "",
  ]);

  const footer = [
    [],
    ["Month summary"],
    ["Milk (Debit)", Number(fmtMoney(data.summary.milkIn))],
    ["Payments (Credit)", Number(fmtMoney(data.summary.paymentsOut))],
    ["Closing Balance", Number(fmtMoney(data.summary.closingBalance))],
  ];

  const wsData = [...headerBlock, ...body, ...footer];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 14 }, { wch: 42 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ledger");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = String(data.buyerName || "buyer").replace(/\s+/g, "-").slice(0, 24);
  const filename = `buyer-ledger-${safeName}-${data.monthKey}.xlsx`;
  return {
    buffer,
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

module.exports = {
  buildBuyerMonthLedgerExport,
  generateBuyerMonthLedgerPdf,
  generateBuyerMonthLedgerExcel,
};
