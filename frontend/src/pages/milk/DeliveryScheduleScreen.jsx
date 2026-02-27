import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { buyerService } from '../../services/buyers/buyerService';
import * as deliveryOverrideService from '../../services/deliveryOverride/deliveryOverrideService';
import { formatCurrency } from '../../utils/currencyUtils';
import { MILK_SOURCE_TYPES } from '../../constants';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getMilkSourceLabel(value) {
  const found = MILK_SOURCE_TYPES.find((t) => t.value === (value || 'cow'));
  return found ? found.label : (value || 'Cow');
}
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Given YYYY-MM-DD, return start of that day in IST as Date. */
function getStartOfDayISTFromString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  const utcMidnight = Date.UTC(y, m - 1, d);
  return new Date(utcMidnight - IST_OFFSET_MS);
}

/** True if the given date (start of day IST) is a delivery day for this buyer. */
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

function getTodayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** YYYY-MM-DD for a date offset from today (0 = today, -1 = yesterday, 1 = tomorrow). */
function getDateStrForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** { dateStr, dayNum, dayName, monthName, isToday } for a date string. */
function getDateTabLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const isToday = dateStr === getTodayDateStr();
  return {
    dateStr,
    dayNum: d,
    dayName: DAY_SHORT[date.getDay()],
    monthName: MONTH_SHORT[date.getMonth()],
    isToday,
  };
}

const TOTAL_DAYS = 31;
const DAYS_BACK = 7;

/** Date tabs with today first, then future dates, then past dates. */
function buildDateTabs() {
  const list = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    list.push(getDateTabLabel(getDateStrForOffset(i)));
  }
  for (let i = -1; i >= -DAYS_BACK; i--) {
    list.push(getDateTabLabel(getDateStrForOffset(i)));
  }
  return list;
}

export default function DeliveryScheduleScreen({ onNavigate, onLogout }) {
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState([]);
  const [overrideLoading, setOverrideLoading] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
  const dateScrollRef = useRef(null);

  const dateTabs = useMemo(() => buildDateTabs(), []);

  const loadData = async () => {
    try {
      setLoading(true);
      const list = await buyerService.getBuyers(true);
      setBuyers(Array.isArray(list) ? list : []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load buyers.');
    } finally {
      setLoading(false);
    }
  };

  const loadOverrides = async () => {
    try {
      const list = await deliveryOverrideService.getOverridesForDate(selectedDate);
      setOverrides(Array.isArray(list) ? list : []);
    } catch (e) {
      setOverrides([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadOverrides();
  }, [selectedDate]);

  const dateStart = useMemo(
    () => getStartOfDayISTFromString(selectedDate),
    [selectedDate]
  );

  const cancelledMobiles = useMemo(
    () => new Set(overrides.filter((o) => o.type === 'cancelled').map((o) => String(o.customerMobile).trim())),
    [overrides]
  );
  const addedMobiles = useMemo(
    () => new Set(overrides.filter((o) => o.type === 'added').map((o) => String(o.customerMobile).trim())),
    [overrides]
  );

  const buyersOnDate = useMemo(() => {
    const withMeta = buyers
      .filter((b) => b.mobile)
      .map((b) => {
        const mobile = String(b.mobile).trim();
        const normallyOn = isDeliveryDay(b, dateStart);
        const cancelled = cancelledMobiles.has(mobile);
        const added = addedMobiles.has(mobile);
        const show = (normallyOn && !cancelled) || added;
        const hasDeliveryItems = Array.isArray(b.deliveryItems) && b.deliveryItems.length > 0;
        const dailyQuantity = hasDeliveryItems
          ? b.deliveryItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
          : (Number(b.quantity) || 0);
        const rate = hasDeliveryItems && b.deliveryItems[0] ? Number(b.deliveryItems[0].rate) || 0 : (Number(b.rate) || 0);
        const totalAmount = hasDeliveryItems
          ? b.deliveryItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0)
          : dailyQuantity * (Number(b.rate) || 0);
        return {
          ...b,
          mobile,
          rate,
          dailyQuantity,
          totalAmount,
          deliveryItems: b.deliveryItems,
          milkSource: b.milkSource || 'cow',
          normallyOn,
          isOverrideAdded: added,
          show,
        };
      })
      .filter((b) => b.show);
    return withMeta.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en'));
  }, [buyers, dateStart, cancelledMobiles, addedMobiles]);

  const buyersNotOnDate = useMemo(() => {
    const onSet = new Set(buyersOnDate.map((b) => b.mobile));
    return buyers
      .filter((b) => b.mobile && !onSet.has(String(b.mobile).trim()))
      .map((b) => {
        const mobile = String(b.mobile).trim();
        const normallyOn = isDeliveryDay(b, dateStart);
        const cancelled = cancelledMobiles.has(mobile);
        const hasDeliveryItems = Array.isArray(b.deliveryItems) && b.deliveryItems.length > 0;
        const dailyQuantity = hasDeliveryItems
          ? b.deliveryItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
          : (Number(b.quantity) || 0);
        const rate = hasDeliveryItems && b.deliveryItems[0] ? Number(b.deliveryItems[0].rate) || 0 : (Number(b.rate) || 0);
        return {
          ...b,
          mobile,
          rate,
          dailyQuantity,
          deliveryItems: b.deliveryItems,
          milkSource: b.milkSource || 'cow',
          normallyOn,
          isCancelled: normallyOn && cancelled,
        };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en'));
  }, [buyers, buyersOnDate, dateStart, cancelledMobiles]);

  const totalLiters = useMemo(
    () => buyersOnDate.reduce((s, b) => s + b.dailyQuantity, 0),
    [buyersOnDate]
  );

  const handleCancelForDate = async (mobile) => {
    try {
      setOverrideLoading(mobile);
      await deliveryOverrideService.setOverride(selectedDate, mobile, 'cancelled');
      await loadOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to cancel.');
    } finally {
      setOverrideLoading(null);
    }
  };

  const handleRemoveCancel = async (mobile) => {
    try {
      setOverrideLoading(mobile);
      await deliveryOverrideService.removeOverride(selectedDate, mobile, 'cancelled');
      await loadOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to remove cancel.');
    } finally {
      setOverrideLoading(null);
    }
  };

  const handleAddForDate = async (mobile) => {
    try {
      setOverrideLoading(mobile);
      await deliveryOverrideService.setOverride(selectedDate, mobile, 'added');
      await loadOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to add.');
    } finally {
      setOverrideLoading(null);
    }
  };

  const handleRemoveAdd = async (mobile) => {
    try {
      setOverrideLoading(mobile);
      await deliveryOverrideService.removeOverride(selectedDate, mobile, 'added');
      await loadOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to remove.');
    } finally {
      setOverrideLoading(null);
    }
  };

  const selectedLabel = useMemo(() => getDateTabLabel(selectedDate), [selectedDate]);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Delivery Schedule"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <View style={styles.dateRowWrap}>
        <ScrollView
          ref={dateScrollRef}
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.dateRowContent}
          style={styles.dateRow}
        >
          {dateTabs.map((tab) => {
            const isSelected = tab.dateStr === selectedDate;
            return (
              <TouchableOpacity
                key={tab.dateStr}
                style={[styles.dateTab, isSelected && styles.dateTabSelected, tab.isToday && !isSelected && styles.dateTabToday]}
                onPress={() => setSelectedDate(tab.dateStr)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateTabDayName, isSelected && styles.dateTabTextSelected]}>
                  {tab.dayName}
                </Text>
                <Text style={[styles.dateTabNum, isSelected && styles.dateTabTextSelected]}>
                  {tab.dayNum}
                </Text>
                <Text style={[styles.dateTabMonth, isSelected && styles.dateTabTextSelected]}>
                  {tab.monthName}
                </Text>
                {tab.isToday && (
                  <Text style={[styles.dateTabTodayLabel, isSelected && styles.dateTabTodayLabelSelected]}>
                    Today
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>
                {selectedLabel.dayName}, {selectedLabel.dayNum} {selectedLabel.monthName}
                {selectedLabel.isToday ? ' (Today)' : ''}
              </Text>
              <Text style={styles.summaryValue}>{totalLiters.toFixed(2)} L</Text>
              <Text style={styles.summarySub}>
                {buyersOnDate.length} buyer{buyersOnDate.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {buyersOnDate.length === 0 && buyersNotOnDate.length === 0 ? (
              <Text style={styles.emptyText}>
                No buyers. Add buyers with a delivery schedule first.
              </Text>
            ) : (
              <>
                {buyersOnDate.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Delivery on this date</Text>
                    {buyersOnDate.map((b) => (
                      <View key={b.mobile} style={[styles.card, b.isOverrideAdded && styles.cardAdded]}>
                        <Text style={styles.buyerName}>{b.name}</Text>
                        {Array.isArray(b.deliveryItems) && b.deliveryItems.length > 0 ? (
                          b.deliveryItems.map((it, idx) => (
                            <Text key={idx} style={styles.detail}>
                              {getMilkSourceLabel(it.milkSource)}: {Number(it.quantity || 0).toFixed(2)} L @ {formatCurrency(Number(it.rate) || 0)}/L
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.detail}>
                            {getMilkSourceLabel(b.milkSource)}: {b.dailyQuantity.toFixed(2)} L @ {formatCurrency(b.rate)}/L
                          </Text>
                        )}
                        {b.isOverrideAdded && (
                          <Text style={styles.detail}>(added for this date)</Text>
                        )}
                        <Text style={styles.amountLine}>
                          {formatCurrency(b.totalAmount != null ? b.totalAmount : b.dailyQuantity * b.rate)} total
                        </Text>
                        <TouchableOpacity
                          style={styles.overrideBtn}
                          onPress={() => (b.isOverrideAdded ? handleRemoveAdd(b.mobile) : handleCancelForDate(b.mobile))}
                          disabled={!!overrideLoading}
                        >
                          <Text style={styles.overrideBtnText}>
                            {overrideLoading === b.mobile ? '...' : b.isOverrideAdded ? 'Remove from this date' : 'Cancel for this date'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}
                {buyersNotOnDate.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Add or undo cancel</Text>
                    {buyersNotOnDate.map((b) => (
                      <View key={b.mobile} style={styles.cardMuted}>
                        <Text style={styles.buyerName}>{b.name}</Text>
                        {Array.isArray(b.deliveryItems) && b.deliveryItems.length > 0 ? (
                          b.deliveryItems.map((it, idx) => (
                            <Text key={idx} style={styles.detail}>
                              {getMilkSourceLabel(it.milkSource)}: {Number(it.quantity || 0).toFixed(2)} L @ {formatCurrency(Number(it.rate) || 0)}/L
                              {b.isCancelled && idx === 0 && ' (cancelled for this date)'}
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.detail}>
                            {getMilkSourceLabel(b.milkSource)}: {b.dailyQuantity.toFixed(2)} L @ {formatCurrency(b.rate)}/L
                            {b.isCancelled && ' (cancelled for this date)'}
                          </Text>
                        )}
                        <TouchableOpacity
                          style={b.isCancelled ? styles.overrideBtnUndo : styles.overrideBtnAdd}
                          onPress={() => (b.isCancelled ? handleRemoveCancel(b.mobile) : handleAddForDate(b.mobile))}
                          disabled={!!overrideLoading}
                        >
                          <Text style={styles.overrideBtnText}>
                            {overrideLoading === b.mobile ? '...' : b.isCancelled ? 'Undo cancel' : 'Add for this date'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const TAB_WIDTH = 72;
const TAB_MARGIN = 8;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  loader: { marginTop: 40 },
  dateRowWrap: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    maxHeight: 96,
  },
  dateRow: {
    maxHeight: 72,
  },
  dateRowContent: {
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateTab: {
    width: TAB_WIDTH,
    marginRight: TAB_MARGIN,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dateTabSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#1976D2',
  },
  dateTabToday: {
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  dateTabDayName: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
  },
  dateTabNum: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },
  dateTabMonth: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  dateTabTextSelected: {
    color: '#fff',
  },
  dateTabTodayLabel: {
    fontSize: 9,
    color: '#4CAF50',
    fontWeight: '700',
    marginTop: 4,
  },
  dateTabTodayLabelSelected: {
    color: 'rgba(255,255,255,0.95)',
  },
  summaryCard: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  summaryTitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
  summaryValue: { fontSize: 28, fontWeight: '700', color: '#fff' },
  summarySub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardAdded: { borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  cardMuted: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  buyerName: { fontSize: 17, fontWeight: '600', color: '#333', marginBottom: 4 },
  detail: { fontSize: 14, color: '#666', marginBottom: 4 },
  amountLine: { fontSize: 13, color: '#2196F3', fontWeight: '600', marginBottom: 10 },
  overrideBtn: {
    backgroundColor: '#f44336',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  overrideBtnAdd: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  overrideBtnUndo: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  overrideBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
