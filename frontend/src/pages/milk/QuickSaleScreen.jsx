import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { milkService } from '../../services/milk/milkService';
import { buyerService } from '../../services/buyers/buyerService';
import * as deliveryOverrideService from '../../services/deliveryOverride/deliveryOverrideService';
import { getYmdInIST, getTodayYmdIST } from '../../utils/dateUtils';
import { MILK_SOURCE_TYPES } from '../../constants';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const NAME_COL_W = 112;
const ROW_MIN_H = 76;
const HEADER_ROW_MIN_H = 52;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAL_WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function normalizeMobile(m) {
  const raw = String(m || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  // keep last 10 digits for India numbers (handles +91/0 prefixes)
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function addDaysYmd(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = dt.getUTCMonth() + 1;
  const dd = dt.getUTCDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** IST calendar day start (same as BuyerScheduleScreen). */
function getStartOfDayISTFromString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  const utcMidnight = Date.UTC(y, m - 1, d);
  return new Date(utcMidnight - IST_OFFSET_MS);
}

function isDeliveryDay(buyer, dateStartIST) {
  const deliveryDays = buyer.deliveryDays;
  if (deliveryDays && Array.isArray(deliveryDays) && deliveryDays.length > 0) {
    const dayOfWeek = new Date(dateStartIST.getTime() + IST_OFFSET_MS).getUTCDay();
    return deliveryDays.includes(dayOfWeek);
  }
  const cycleDays = Number(buyer.deliveryCycleDays);
  if (cycleDays > 1 && buyer.deliveryCycleStartDate) {
    const start = new Date(buyer.deliveryCycleStartDate);
    const startIST = new Date(start.getTime() + IST_OFFSET_MS);
    const startDayMs = Date.UTC(startIST.getUTCFullYear(), startIST.getUTCMonth(), startIST.getUTCDate()) - IST_OFFSET_MS;
    const startDay = new Date(startDayMs);
    const daysDiff = Math.round((dateStartIST.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
    return daysDiff >= 0 && daysDiff % cycleDays === 0;
  }
  return true;
}

function formatLongDateLine(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const noonIst = new Date(`${iso}T12:00:00+05:30`);
  const wd = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(noonIst);
  const monthName = MONTH_NAMES[m - 1];
  return `${wd}, ${d} ${monthName} ${y}`;
}

function padMondayFirst(jsDaySun0) {
  return jsDaySun0 === 0 ? 6 : jsDaySun0 - 1;
}

function buildMonthCells(year, month0) {
  const dim = new Date(year, month0 + 1, 0).getDate();
  const firstDow = new Date(year, month0, 1).getDay();
  const pad = padMondayFirst(firstDow);
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let day = 1; day <= dim; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function CalendarPickerModal({ visible, selectedYmd, onClose, onSelectDay }) {
  const parsed = useMemo(() => {
    const [y, m] = selectedYmd.split('-').map(Number);
    return { y, m0: m - 1 };
  }, [selectedYmd]);

  const [viewYear, setViewYear] = useState(parsed.y);
  const [viewMonth, setViewMonth] = useState(parsed.m0);

  useEffect(() => {
    if (visible) {
      setViewYear(parsed.y);
      setViewMonth(parsed.m0);
    }
  }, [visible, parsed.y, parsed.m0]);

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const cellRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [cells]);
  const todayYmd = getTodayYmdIST();

  const monthTitle = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const pickDay = (day) => {
    if (!day) return;
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelectDay(ymd);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={calStyles.overlay}>
        <Pressable style={calStyles.backdrop} onPress={onClose} />
        <View style={calStyles.box}>
          <View style={calStyles.monthNav}>
            <TouchableOpacity onPress={goPrevMonth} style={calStyles.monthArrow}>
              <Text style={calStyles.monthArrowText}>◀</Text>
            </TouchableOpacity>
            <Text style={calStyles.monthTitle}>{monthTitle}</Text>
            <TouchableOpacity onPress={goNextMonth} style={calStyles.monthArrow}>
              <Text style={calStyles.monthArrowText}>▶</Text>
            </TouchableOpacity>
          </View>
          <View style={calStyles.weekHeadRow}>
            {CAL_WEEK_HEADERS.map((h) => (
              <Text key={h} style={calStyles.weekHeadCell}>
                {h}
              </Text>
            ))}
          </View>
          {cellRows.map((row, ri) => (
            <View key={ri} style={calStyles.gridRow}>
              {row.map((day, ci) => {
                const idx = ri * 7 + ci;
                const ymd = day
                  ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  : '';
                const isToday = day && ymd === todayYmd;
                const isSelected = day && ymd === selectedYmd;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[calStyles.dayCell, isToday && calStyles.dayToday, isSelected && calStyles.daySelected]}
                    onPress={() => pickDay(day)}
                    disabled={!day}
                  >
                    {day ? (
                      <Text style={[calStyles.dayNum, isSelected && calStyles.dayNumOn]}>{day}</Text>
                    ) : (
                      <View style={calStyles.dayEmpty} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <TouchableOpacity style={calStyles.closeBtn} onPress={onClose}>
            <Text style={calStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const calStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  box: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
    zIndex: 1,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthArrow: { padding: 10 },
  monthArrowText: { fontSize: 18, color: '#2e7d32', fontWeight: '700' },
  monthTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  weekHeadRow: { flexDirection: 'row', marginBottom: 6 },
  weekHeadCell: { flex: 1, textAlign: 'center', fontSize: 11, color: '#888', fontWeight: '600' },
  gridRow: { flexDirection: 'row', marginBottom: 4 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 1,
  },
  dayEmpty: { width: 1, height: 1 },
  dayNum: { fontSize: 15, color: '#333', fontWeight: '600' },
  dayNumOn: { color: '#fff' },
  dayToday: { backgroundColor: '#e3f2fd', borderRadius: 22 },
  daySelected: { backgroundColor: '#4CAF50', borderRadius: 22 },
  closeBtn: { marginTop: 12, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  closeBtnText: { color: '#1565c0', fontWeight: '700', fontSize: 15 },
});

export default function QuickSaleScreen({ onNavigate, onLogout }) {
  const [buyers, setBuyers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [overridesByDate, setOverridesByDate] = useState({});
  const [balancesByMobile, setBalancesByMobile] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [customModal, setCustomModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [pickTxModal, setPickTxModal] = useState(null);
  const [pickDeleteModal, setPickDeleteModal] = useState(null);
  const [selectedDateYmd, setSelectedDateYmd] = useState(() => getTodayYmdIST());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const first = selectedDateYmd;
      const toExclusive = addDaysYmd(selectedDateYmd, 1);

      const [buyersList, txList, overridesList, balances] = await Promise.all([
        buyerService.getBuyers(true),
        milkService.getTransactions(first, toExclusive, 2000, 0, 'sale'),
        deliveryOverrideService.getOverridesForDate(selectedDateYmd).catch(() => []),
        buyerService.getBuyerBalances(true).catch(() => []),
      ]);

      const ob = { [selectedDateYmd]: Array.isArray(overridesList) ? overridesList : [] };

      const buyersArr = Array.isArray(buyersList) ? buyersList : [];
      setBuyers(buyersArr);
      setTransactions(Array.isArray(txList) ? txList : []);
      setOverridesByDate(ob);

      const list = Array.isArray(balances) ? balances : [];
      const map = {};
      list.forEach((b) => {
        const m = normalizeMobile(b.buyerMobile || '');
        if (!m) return;
        map[m] = Number(b.pendingAmount) || 0;
      });
      setBalancesByMobile(map);
    } catch (e) {
      if (!silent) Alert.alert('Error', 'Failed to load data.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDateYmd]);

  /** Keep sale day in sync with the header calendar if the user changes date while Custom is open. */
  useEffect(() => {
    setCustomModal((m) => (m ? { ...m, dateStr: selectedDateYmd } : m));
  }, [selectedDateYmd]);

  const haveDeliveryForCell = useCallback(
    (buyer, dateStr) => {
      const mobile = String(buyer.mobile || '').trim();
      if (!mobile) return false;
      const overrides = overridesByDate[dateStr] || [];
      const cancelled = overrides.some((o) => o.type === 'cancelled' && String(o.customerMobile).trim() === mobile);
      const added = overrides.some((o) => o.type === 'added' && String(o.customerMobile).trim() === mobile);
      const dateStart = getStartOfDayISTFromString(dateStr);
      const normallyOn = isDeliveryDay(buyer, dateStart);
      return (normallyOn && !cancelled) || added;
    },
    [overridesByDate]
  );

  const salesForBuyerDate = useCallback(
    (mobile, dateStr) => {
      const m = String(mobile).trim();
      return transactions.filter(
        (t) =>
          t.type === 'sale' &&
          String(t.buyerPhone || '').trim() === m &&
          getYmdInIST(t.date) === dateStr
      );
    },
    [transactions]
  );

  const buyersSorted = useMemo(() => {
    return [...buyers]
      .filter((b) => b.mobile)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en'));
  }, [buyers]);

  const dateStr = selectedDateYmd;
  const isViewingToday = selectedDateYmd === getTodayYmdIST();

  const handleDelivered = async (buyer, ds) => {
    if (!buyer.mobile) return;
    const txs = salesForBuyerDate(buyer.mobile, ds);
    if (txs.length > 0) {
      Alert.alert('Already delivered', 'This day already has sale(s).');
      return;
    }
    const hasDeliveryItems = Array.isArray(buyer.deliveryItems) && buyer.deliveryItems.length > 0;
    const dailyQ = hasDeliveryItems
      ? buyer.deliveryItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
      : Number(buyer.quantity) || 0;
    const rateOk = hasDeliveryItems || (Number(buyer.rate) >= 0 && dailyQ > 0);
    if (!(dailyQ > 0 && rateOk)) {
      Alert.alert('Set rate & quantity', 'Set this buyer\'s delivery items (or daily quantity and rate) in Buyer screen first.');
      return;
    }
    const saleYmd = String(ds || '').trim() || selectedDateYmd;
    try {
      setActionLoading(`${buyer.mobile}-${ds}`);
      await milkService.quickSale(buyer.mobile, null, null, null, saleYmd);
      await loadData(true);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Quick sale failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const openCustom = (buyer, ds) => {
    if (!buyer.mobile) return;
    const hasDeliveryItems = Array.isArray(buyer.deliveryItems) && buyer.deliveryItems.length > 0;
    if (hasDeliveryItems) {
      const lines = buyer.deliveryItems.map((it) => {
        const src = (it.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(String(it.milkSource).toLowerCase()))
          ? String(it.milkSource).toLowerCase()
          : 'cow';
        return {
          milkSource: src,
          quantity: String(it.quantity != null ? it.quantity : ''),
          pricePerLiter: String(it.rate != null ? it.rate : ''),
        };
      });
      setCustomModal({
        name: buyer.name,
        mobile: String(buyer.mobile).trim(),
        dateStr: ds,
        multiLine: true,
        lines,
      });
      return;
    }
    const dailyQuantity = Number(buyer.quantity) || 0;
    const rate = Number(buyer.rate) || 0;
    const src = (buyer.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(String(buyer.milkSource).toLowerCase()))
      ? String(buyer.milkSource).toLowerCase()
      : 'cow';
    setCustomModal({
      name: buyer.name,
      mobile: String(buyer.mobile).trim(),
      dateStr: ds,
      multiLine: true,
      lines: [
        {
          milkSource: src,
          quantity: String(dailyQuantity || ''),
          pricePerLiter: String(rate || ''),
        },
      ],
    });
  };

  const submitCustomSale = async () => {
    if (!customModal) return;
    const saleYmd = String(customModal.dateStr || '').trim() || selectedDateYmd;
    try {
      setActionLoading(`${customModal.mobile}-custom`);
      const lines = Array.isArray(customModal.lines) ? customModal.lines : [];
      if (lines.length === 0) {
        Alert.alert('Error', 'Add at least one milk line.');
        setActionLoading(null);
        return;
      }
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const q = parseFloat(line.quantity);
        const p = parseFloat(line.pricePerLiter);
        if (!(q > 0 && p >= 0)) {
          Alert.alert('Error', `Milk line ${i + 1}: enter valid quantity and rate.`);
          setActionLoading(null);
          return;
        }
      }
      for (const line of lines) {
        await milkService.quickSale(
          customModal.mobile,
          parseFloat(line.quantity),
          parseFloat(line.pricePerLiter),
          line.milkSource,
          saleYmd
        );
      }
      setCustomModal(null);
      await loadData(true);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Quick sale failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModalForTx = (buyer, ds, t) => {
    setEditModal({
      _id: t._id,
      buyerName: buyer.name,
      mobile: String(buyer.mobile).trim(),
      dateStr: ds,
      quantity: String(t.quantity ?? ''),
      pricePerLiter: String(t.pricePerLiter ?? ''),
      milkSource: t.milkSource || 'cow',
      buyer: t.buyer,
      buyerPhone: t.buyerPhone,
      buyerId: t.buyerId,
      type: 'sale',
      paymentType: t.paymentType || 'credit',
      amountReceived: t.amountReceived != null ? String(t.amountReceived) : '',
      notes: t.notes || '',
    });
  };

  const openEdit = (buyer, ds, specificTx = null) => {
    const txs = salesForBuyerDate(buyer.mobile, ds);
    if (txs.length === 0) return;
    if (specificTx) {
      openEditModalForTx(buyer, ds, specificTx);
      return;
    }
    if (txs.length > 1) {
      setPickTxModal({ buyer, dateStr: ds, txs });
      return;
    }
    openEditModalForTx(buyer, ds, txs[0]);
  };

  const submitEdit = async () => {
    if (!editModal) return;
    const q = parseFloat(editModal.quantity);
    const p = parseFloat(editModal.pricePerLiter);
    if (!(q > 0 && p >= 0)) {
      Alert.alert('Error', 'Enter valid quantity and rate.');
      return;
    }
    const totalAmount = Math.round(q * p * 100) / 100;
    const dayDate = new Date(`${editModal.dateStr}T12:00:00+05:30`);
    try {
      setActionLoading(`edit-${editModal._id}`);
      await milkService.updateTransaction(editModal._id, {
        type: 'sale',
        date: dayDate,
        quantity: q,
        pricePerLiter: p,
        totalAmount,
        buyer: editModal.buyer,
        buyerPhone: editModal.buyerPhone,
        buyerId: editModal.buyerId,
        notes: editModal.notes || undefined,
        milkSource: editModal.milkSource,
        paymentType: editModal.paymentType || 'credit',
        amountReceived:
          editModal.paymentType === 'cash' && editModal.amountReceived
            ? parseFloat(editModal.amountReceived)
            : undefined,
      });
      setEditModal(null);
      await loadData(true);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Update failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCell = (buyer, ds) => {
    const txs = salesForBuyerDate(buyer.mobile, ds);
    if (txs.length === 0) return;
    if (txs.length > 1) {
      setPickDeleteModal({ buyer, dateStr: ds, txs });
      return;
    }
    Alert.alert(
      'Delete sales',
      `Delete ${txs.length} sale record(s) for ${buyer.name} on ${ds}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(`del-${buyer.mobile}-${ds}`);
              await Promise.all(txs.map((t) => milkService.deleteTransaction(t._id)));
              await loadData(true);
            } catch (e) {
              Alert.alert('Error', e?.message || 'Delete failed.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const shiftDay = (delta) => {
    setSelectedDateYmd((prev) => addDaysYmd(prev, delta));
  };

  const renderCell = (b) => {
    const ok = haveDeliveryForCell(b, dateStr);
    const txs = salesForBuyerDate(b.mobile, dateStr);
    const delivered = txs.length > 0;
    const qtySum = txs.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
    const bySource = txs.reduce((acc, t) => {
      const key = String(t.milkSource || 'cow');
      acc[key] = (acc[key] || 0) + (Number(t.quantity) || 0);
      return acc;
    }, {});
    const sourceLine = delivered
      ? Object.entries(bySource)
          .filter(([, q]) => q > 0)
          .map(([src, q]) => {
            const label = MILK_SOURCE_TYPES.find((s) => s.value === src)?.label || src;
            return `${label} ${Number(q).toFixed(1)}L`;
          })
          .join(' · ')
      : '';

    if (!ok) {
      return (
        <View style={[styles.cell, styles.cellOff, { minHeight: ROW_MIN_H }]}>
          <Text style={styles.cellOffText}>—</Text>
        </View>
      );
    }

    if (!delivered) {
      const busyHere = actionLoading === `${String(b.mobile).trim()}-${dateStr}`;
      return (
        <View style={[styles.cell, { minHeight: ROW_MIN_H }]}>
          <TouchableOpacity
            style={[styles.miniBtn, styles.miniDeliver]}
            onPress={() => handleDelivered(b, dateStr)}
            disabled={busyHere || actionLoading !== null}
          >
            <Text style={styles.miniBtnTextDelivered} numberOfLines={2}>
              {busyHere ? '...' : 'Delivered'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.miniBtn, styles.miniCust]}
            onPress={() => openCustom(b, dateStr)}
            disabled={actionLoading !== null}
          >
            <Text style={styles.miniBtnText} numberOfLines={1}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.cell, styles.cellDone, { minHeight: ROW_MIN_H }]}>
        <Text style={styles.cellQty} numberOfLines={1}>
          {qtySum.toFixed(1)}L
        </Text>
        {!!sourceLine && (
          <Text style={styles.cellSub} numberOfLines={2}>
            {sourceLine}
          </Text>
        )}
        <View style={styles.cellActions}>
          <TouchableOpacity style={styles.linkBtn} onPress={() => openCustom(b, dateStr)} disabled={actionLoading !== null}>
            <Text style={styles.linkAdd}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={() => openEdit(b, dateStr)} disabled={actionLoading !== null}>
            <Text style={styles.linkEdit}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={() => handleDeleteCell(b, dateStr)} disabled={actionLoading !== null}>
            <Text style={styles.linkDel}>Del</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Quick Sale"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />

      <View style={styles.dateNavBar}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => shiftDay(-1)} accessibilityLabel="Previous day">
          <Text style={styles.dateNavBtnText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateNavCenter} onPress={() => setCalendarOpen(true)} activeOpacity={0.75}>
          <Text style={styles.dateNavMain} numberOfLines={2}>
            {formatLongDateLine(selectedDateYmd)}
          </Text>
          <Text style={styles.dateNavHint}>Tap to open calendar</Text>
          {isViewingToday && <Text style={styles.dateNavTodayBadge}>Today</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => shiftDay(1)} accessibilityLabel="Next day">
          <Text style={styles.dateNavBtnText}>▶</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.todayStrip}>
        <Text style={styles.todayStripText}>Default: today&apos;s date · use arrows or calendar to change</Text>
        <TouchableOpacity onPress={() => setSelectedDateYmd(getTodayYmdIST())} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.todayStripLink}>Go to today</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
      ) : buyersSorted.length === 0 ? (
        <Text style={styles.emptyText}>No buyers. Add buyers with rate and daily quantity first.</Text>
      ) : (
        <ScrollView style={styles.listScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.tableHeader}>
            <View style={[styles.cornerCell, { width: NAME_COL_W, minHeight: HEADER_ROW_MIN_H }]}>
              <Text style={styles.cornerText}>Buyer</Text>
            </View>
            <View style={[styles.headDelivery, { minHeight: HEADER_ROW_MIN_H }]}>
              <Text style={styles.headDeliveryText}>Delivery</Text>
            </View>
          </View>
          {buyersSorted.map((b) => (
            <View key={b.mobile} style={styles.tableRow}>
              <View style={[styles.nameCell, { width: NAME_COL_W, minHeight: ROW_MIN_H }]}>
                <View style={styles.nameCellTopRow}>
                  <TouchableOpacity
                    onPress={() => onNavigate('Buyer', { focusMobile: String(b.mobile || '').trim() })}
                    activeOpacity={0.7}
                    disabled={!String(b.mobile || '').trim()}
                    style={{ flex: 1 }}
                  >
                    <Text style={styles.nameTextLink} numberOfLines={3}>
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.nameCellActions}>
                    <TouchableOpacity
                      onPress={() => onNavigate('Buyer', { focusMobile: String(b.mobile || '').trim(), openEdit: true })}
                      disabled={!String(b.mobile || '').trim()}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.buyerEditLink}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        onNavigate('Payments', {
                          openAddPayment: true,
                          customerMobile: String(b.mobile || '').trim(),
                          customerName: String(b.name || '').trim(),
                          paymentDate: selectedDateYmd,
                        })
                      }
                      disabled={!String(b.mobile || '').trim()}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.buyerPayLink}>Pay</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {String(b.mobile || '').trim() ? (
                  <>
                    <Text style={styles.buyerMobileText} numberOfLines={1}>
                      {String(b.mobile || '').trim()}
                    </Text>
                    {balancesByMobile[normalizeMobile(b.mobile || '')] != null && (
                      <Text
                        style={[
                          styles.buyerBalanceText,
                          balancesByMobile[normalizeMobile(b.mobile || '')] > 0 ? styles.buyerBalanceDue : styles.buyerBalanceClear,
                        ]}
                        numberOfLines={1}
                      >
                        Pending: ₹{Number(balancesByMobile[normalizeMobile(b.mobile || '')] || 0).toFixed(0)}
                      </Text>
                    )}
                  </>
                ) : null}
              </View>
              <View style={styles.cellWrap}>{renderCell(b)}</View>
            </View>
          ))}
        </ScrollView>
      )}

      <CalendarPickerModal
        visible={calendarOpen}
        selectedYmd={selectedDateYmd}
        onClose={() => setCalendarOpen(false)}
        onSelectDay={(ymd) => setSelectedDateYmd(ymd)}
      />

      <Modal visible={!!customModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Custom Delivered</Text>
            {customModal && (
              <>
                <Text style={styles.modalName}>{customModal.name}</Text>
                <Text style={styles.modalDate}>Date: {customModal.dateStr}</Text>
                {customModal.multiLine && Array.isArray(customModal.lines) ? (
                  <ScrollView style={styles.customLinesScroll} keyboardShouldPersistTaps="handled">
                    <Text style={styles.modalHint}>One row per milk type (same as buyer delivery). Adjust qty/rate if needed.</Text>
                    <TouchableOpacity
                      style={styles.addLineBtn}
                      onPress={() =>
                        setCustomModal((m) => {
                          if (!m) return m;
                          const nextLines = Array.isArray(m.lines) ? [...m.lines] : [];
                          nextLines.push({ milkSource: 'cow', quantity: '', pricePerLiter: '' });
                          return { ...m, multiLine: true, lines: nextLines };
                        })
                      }
                      disabled={!!actionLoading}
                    >
                      <Text style={styles.addLineBtnText}>+ Add more</Text>
                    </TouchableOpacity>
                    {customModal.lines.map((line, idx) => (
                      <View key={idx} style={styles.customLineCard}>
                        <View style={styles.lineHeaderRow}>
                          <Text style={styles.modalLabel}>Line {idx + 1}</Text>
                          {customModal.lines.length > 1 && (
                            <TouchableOpacity
                              onPress={() =>
                                setCustomModal((m) => {
                                  if (!m?.lines) return m;
                                  const next = m.lines.filter((_, j) => j !== idx);
                                  return { ...m, lines: next };
                                })
                              }
                              disabled={!!actionLoading}
                            >
                              <Text style={styles.removeLineText}>Remove</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={styles.milkSourceRow}>
                          {MILK_SOURCE_TYPES.map((src) => {
                            const isActive = line.milkSource === src.value;
                            return (
                              <TouchableOpacity
                                key={src.value}
                                style={[styles.milkSourceBtn, isActive && styles.milkSourceBtnActive]}
                                onPress={() =>
                                  setCustomModal((m) => {
                                    if (!m?.lines) return m;
                                    const lines = m.lines.map((ln, j) => (j === idx ? { ...ln, milkSource: src.value } : ln));
                                    return { ...m, lines };
                                  })
                                }
                              >
                                <Text style={[styles.milkSourceBtnText, isActive && styles.milkSourceBtnTextActive]}>{src.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Input
                          placeholder="Quantity (L)"
                          keyboardType="decimal-pad"
                          value={line.quantity}
                          onChangeText={(q) =>
                            setCustomModal((m) => {
                              if (!m?.lines) return m;
                              const lines = m.lines.map((ln, j) => (j === idx ? { ...ln, quantity: q } : ln));
                              return { ...m, lines };
                            })
                          }
                          style={styles.input}
                        />
                        <Input
                          placeholder="Rate per liter (₹)"
                          keyboardType="decimal-pad"
                          value={line.pricePerLiter}
                          onChangeText={(p) =>
                            setCustomModal((m) => {
                              if (!m?.lines) return m;
                              const lines = m.lines.map((ln, j) => (j === idx ? { ...ln, pricePerLiter: p } : ln));
                              return { ...m, lines };
                            })
                          }
                          style={styles.input}
                        />
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <>
                    <Text style={styles.modalLabel}>Milk type</Text>
                    <View style={styles.milkSourceRow}>
                      {MILK_SOURCE_TYPES.map((src) => {
                        const isActive = customModal.milkSource === src.value;
                        return (
                          <TouchableOpacity
                            key={src.value}
                            style={[styles.milkSourceBtn, isActive && styles.milkSourceBtnActive]}
                            onPress={() => setCustomModal((m) => ({ ...m, milkSource: src.value }))}
                          >
                            <Text style={[styles.milkSourceBtnText, isActive && styles.milkSourceBtnTextActive]}>{src.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Input
                      placeholder="Quantity (L)"
                      keyboardType="decimal-pad"
                      value={customModal.quantity}
                      onChangeText={(q) => setCustomModal((m) => ({ ...m, quantity: q }))}
                      style={styles.input}
                    />
                    <Input
                      placeholder="Rate per liter (₹)"
                      keyboardType="decimal-pad"
                      value={customModal.pricePerLiter}
                      onChangeText={(p) => setCustomModal((m) => ({ ...m, pricePerLiter: p }))}
                      style={styles.input}
                    />
                  </>
                )}
                <View style={styles.modalButtons}>
                  <Button title="Cancel" onPress={() => setCustomModal(null)} style={styles.cancelBtn} />
                  <Button title={actionLoading ? 'Saving...' : 'Save'} onPress={submitCustomSale} disabled={!!actionLoading} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!pickTxModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choose entry to edit</Text>
            {pickTxModal && (
              <>
                <Text style={styles.modalName}>{pickTxModal.buyer.name}</Text>
                <Text style={styles.modalDate}>{pickTxModal.dateStr}</Text>
                <ScrollView style={styles.pickTxScroll}>
                  {pickTxModal.txs.map((tx) => (
                    <TouchableOpacity
                      key={tx._id}
                      style={styles.pickTxRow}
                      onPress={() => {
                        const { buyer, dateStr } = pickTxModal;
                        setPickTxModal(null);
                        openEditModalForTx(buyer, dateStr, tx);
                      }}
                    >
                      <Text style={styles.pickTxMain}>
                        {MILK_SOURCE_TYPES.find((s) => s.value === (tx.milkSource || 'cow'))?.label || tx.milkSource}:{' '}
                        {Number(tx.quantity || 0).toFixed(2)} L @ ₹{Number(tx.pricePerLiter || 0)}/L
                      </Text>
                      <Text style={styles.pickTxSub}>{Number(tx.totalAmount || 0).toFixed(2)} ₹</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Button title="Cancel" onPress={() => setPickTxModal(null)} style={styles.cancelBtn} />
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!pickDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choose entry to delete</Text>
            {pickDeleteModal && (
              <>
                <Text style={styles.modalName}>{pickDeleteModal.buyer.name}</Text>
                <Text style={styles.modalDate}>{pickDeleteModal.dateStr}</Text>
                <ScrollView style={styles.pickTxScroll}>
                  {pickDeleteModal.txs.map((tx) => (
                    <TouchableOpacity
                      key={tx._id}
                      style={styles.pickTxRow}
                      onPress={() => {
                        const { buyer, dateStr } = pickDeleteModal;
                        setPickDeleteModal(null);
                        Alert.alert(
                          'Delete sale',
                          `Delete this sale entry for ${buyer.name} on ${dateStr}?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  setActionLoading(`del-${buyer.mobile}-${dateStr}-${tx._id}`);
                                  await milkService.deleteTransaction(tx._id);
                                  await loadData(true);
                                } catch (e) {
                                  Alert.alert('Error', e?.message || 'Delete failed.');
                                } finally {
                                  setActionLoading(null);
                                }
                              },
                            },
                          ]
                        );
                      }}
                      disabled={actionLoading !== null}
                    >
                      <Text style={styles.pickTxMain}>
                        {MILK_SOURCE_TYPES.find((s) => s.value === (tx.milkSource || 'cow'))?.label || tx.milkSource}:{' '}
                        {Number(tx.quantity || 0).toFixed(2)} L @ ₹{Number(tx.pricePerLiter || 0)}/L
                      </Text>
                      <Text style={styles.pickTxSub}>{Number(tx.totalAmount || 0).toFixed(2)} ₹</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.modalButtons}>
                  <Button title="Cancel" onPress={() => setPickDeleteModal(null)} style={styles.cancelBtn} />
                  <Button
                    title="Delete all"
                    onPress={() => {
                      const { buyer, dateStr, txs } = pickDeleteModal;
                      Alert.alert(
                        'Delete all sales',
                        `Delete ${txs.length} sale record(s) for ${buyer.name} on ${dateStr}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete all',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                setPickDeleteModal(null);
                                setActionLoading(`del-${buyer.mobile}-${dateStr}-all`);
                                await Promise.all(txs.map((t) => milkService.deleteTransaction(t._id)));
                                await loadData(true);
                              } catch (e) {
                                Alert.alert('Error', e?.message || 'Delete failed.');
                              } finally {
                                setActionLoading(null);
                              }
                            },
                          },
                        ]
                      );
                    }}
                    disabled={actionLoading !== null}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!editModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit sale</Text>
            {editModal && (
              <>
                <Text style={styles.modalName}>{editModal.buyerName}</Text>
                <Text style={styles.modalDate}>{editModal.dateStr}</Text>
                <Text style={styles.modalLabel}>Milk type</Text>
                <View style={styles.milkSourceRow}>
                  {MILK_SOURCE_TYPES.map((src) => {
                    const isActive = editModal.milkSource === src.value;
                    return (
                      <TouchableOpacity
                        key={src.value}
                        style={[styles.milkSourceBtn, isActive && styles.milkSourceBtnActive]}
                        onPress={() => setEditModal((m) => ({ ...m, milkSource: src.value }))}
                      >
                        <Text style={[styles.milkSourceBtnText, isActive && styles.milkSourceBtnTextActive]}>{src.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Input
                  placeholder="Quantity (L)"
                  keyboardType="decimal-pad"
                  value={editModal.quantity}
                  onChangeText={(q) => setEditModal((m) => ({ ...m, quantity: q }))}
                  style={styles.input}
                />
                <Input
                  placeholder="Rate per liter (₹)"
                  keyboardType="decimal-pad"
                  value={editModal.pricePerLiter}
                  onChangeText={(p) => setEditModal((m) => ({ ...m, pricePerLiter: p }))}
                  style={styles.input}
                />
                <View style={styles.modalButtons}>
                  <Button title="Cancel" onPress={() => setEditModal(null)} style={styles.cancelBtn} />
                  <Button title={actionLoading ? 'Saving...' : 'Save'} onPress={submitEdit} disabled={!!actionLoading} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loader: { marginTop: 40 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24, paddingHorizontal: 16 },
  dateNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateNavBtn: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#e8f5e9', borderRadius: 10 },
  dateNavBtnText: { fontSize: 20, color: '#2e7d32', fontWeight: '700' },
  dateNavCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  dateNavMain: { fontSize: 15, fontWeight: '700', color: '#1b5e20', textAlign: 'center' },
  dateNavHint: { fontSize: 11, color: '#78909c', marginTop: 4 },
  dateNavTodayBadge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#1565c0',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  todayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#e8f5e9',
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  todayStripText: { flex: 1, fontSize: 12, color: '#2e7d32', fontWeight: '500' },
  todayStripLink: { fontSize: 13, color: '#1565c0', fontWeight: '700' },
  listScroll: { flex: 1, backgroundColor: '#fff' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', backgroundColor: '#fafafa' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'stretch' },
  cornerCell: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRightWidth: 1,
    borderRightColor: '#c8e6c9',
  },
  cornerText: { fontWeight: '700', fontSize: 12, color: '#2e7d32' },
  headDelivery: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 8 },
  headDeliveryText: { fontSize: 13, fontWeight: '700', color: '#555' },
  nameCell: {
    padding: 8,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#eee',
    backgroundColor: '#fafafa',
  },
  nameText: { fontSize: 12, fontWeight: '600', color: '#333' },
  nameTextLink: { fontSize: 12, fontWeight: '600', color: '#1565C0', textDecorationLine: 'underline' },
  nameCellTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  buyerEditLink: { fontSize: 12, color: '#2e7d32', fontWeight: '800' },
  nameCellActions: { alignItems: 'flex-end', gap: 6 },
  buyerPayLink: { fontSize: 12, color: '#1565C0', fontWeight: '900' },
  buyerMobileText: { marginTop: 2, fontSize: 11, color: '#666' },
  buyerBalanceText: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  buyerBalanceDue: { color: '#c62828' },
  buyerBalanceClear: { color: '#2e7d32' },
  customLinesScroll: { maxHeight: 320, marginBottom: 8 },
  customLineCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  addLineBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  addLineBtnText: { color: '#1565c0', fontWeight: '800' },
  lineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  removeLineText: { color: '#c62828', fontWeight: '800', fontSize: 12 },
  modalHint: { fontSize: 12, color: '#666', marginBottom: 10 },
  pickTxScroll: { maxHeight: 280, marginVertical: 8 },
  pickTxRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pickTxMain: { fontSize: 14, fontWeight: '600', color: '#333' },
  pickTxSub: { fontSize: 12, color: '#666', marginTop: 4 },
  cellWrap: { flex: 1, minWidth: 0 },
  cell: {
    padding: 6,
    justifyContent: 'center',
    flex: 1,
  },
  cellOff: { backgroundColor: '#f5f5f5', alignItems: 'center' },
  cellOffText: { color: '#bbb', fontSize: 18 },
  cellDone: { backgroundColor: '#e8f5e9' },
  cellQty: { fontSize: 13, fontWeight: '700', color: '#2e7d32', textAlign: 'center' },
  cellSub: { fontSize: 11, color: '#546e7a', textAlign: 'center', marginTop: 2 },
  cellActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 4 },
  linkBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  linkAdd: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
  linkEdit: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
  linkDel: { fontSize: 12, color: '#c62828', fontWeight: '700' },
  miniBtn: { borderRadius: 6, paddingVertical: 8, alignItems: 'center', marginBottom: 4 },
  miniDeliver: { backgroundColor: '#4CAF50' },
  miniCust: { backgroundColor: '#2196F3' },
  miniBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  miniBtnTextDelivered: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalName: { fontSize: 15, color: '#666', marginBottom: 4 },
  modalDate: { fontSize: 13, color: '#888', marginBottom: 12 },
  modalLabel: { fontSize: 12, color: '#999', marginBottom: 6 },
  milkSourceRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  milkSourceBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f0f0f0', marginRight: 8, marginBottom: 8 },
  milkSourceBtnActive: { backgroundColor: '#2196F3' },
  milkSourceBtnText: { fontSize: 14, color: '#333' },
  milkSourceBtnTextActive: { color: '#fff', fontWeight: '600' },
  input: { marginBottom: 12, backgroundColor: '#f5f5f5' },
  modalButtons: { flexDirection: 'row', marginTop: 8 },
  cancelBtn: { backgroundColor: '#9e9e9e', marginRight: 12 },
});
