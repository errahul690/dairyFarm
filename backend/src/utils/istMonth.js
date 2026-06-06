const { DateTime } = require("luxon");

const TZ = "Asia/Kolkata";

/** Calendar month YYYY-MM in Asia/Kolkata. */
function monthKeyFromDate(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  if (isNaN(d.getTime())) return null;
  return DateTime.fromJSDate(d, { zone: TZ }).toFormat("yyyy-MM");
}

/** Inclusive IST month range as JS Dates: [from, toExclusive). */
function monthRangeFromKey(monthKey) {
  const mk = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) return null;
  const start = DateTime.fromFormat(mk, "yyyy-MM", { zone: TZ }).startOf("month");
  if (!start.isValid) return null;
  const end = start.plus({ months: 1 });
  return { from: start.toJSDate(), to: end.toJSDate() };
}

module.exports = {
  TZ,
  monthKeyFromDate,
  monthRangeFromKey,
};
