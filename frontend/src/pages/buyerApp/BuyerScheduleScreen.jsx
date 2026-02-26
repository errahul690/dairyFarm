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

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function getTodayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getDateStrForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getDateTabLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    dateStr,
    dayNum: d,
    dayName: DAY_SHORT[date.getDay()],
    monthName: MONTH_SHORT[date.getMonth()],
    isToday: dateStr === getTodayDateStr(),
  };
}

const TOTAL_DAYS = 31;
const DAYS_BACK = 7;

export default function BuyerScheduleScreen({ onNavigate, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDateStr());

  const dateTabs = useMemo(() => {
    const list = [];
    for (let i = -DAYS_BACK; i < TOTAL_DAYS - DAYS_BACK; i++) {
      list.push(getDateTabLabel(getDateStrForOffset(i)));
    }
    return list;
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [p, o] = await Promise.all([
        buyerService.getMyProfile().catch(() => null),
        deliveryOverrideService.getOverridesForDate(selectedDate).catch(() => []),
      ]);
      setProfile(p);
      setOverrides(Array.isArray(o) ? o : []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    deliveryOverrideService.getOverridesForDate(selectedDate).then((o) => setOverrides(Array.isArray(o) ? o : [])).catch(() => setOverrides([]));
  }, [selectedDate]);

  const dateStart = useMemo(() => getStartOfDayISTFromString(selectedDate), [selectedDate]);
  const mobile = profile?.mobile ? String(profile.mobile).trim() : '';
  const hasCancelled = useMemo(() => overrides.some((o) => o.type === 'cancelled' && String(o.customerMobile).trim() === mobile), [overrides, mobile]);
  const hasAdded = useMemo(() => overrides.some((o) => o.type === 'added' && String(o.customerMobile).trim() === mobile), [overrides, mobile]);
  const normallyOn = useMemo(() => profile && mobile && isDeliveryDay(profile, dateStart), [profile, mobile, dateStart]);
  const haveDelivery = (normallyOn && !hasCancelled) || hasAdded;
  const selectedLabel = useMemo(() => getDateTabLabel(selectedDate), [selectedDate]);

  const refreshOverrides = async () => {
    const o = await deliveryOverrideService.getOverridesForDate(selectedDate).catch(() => []);
    setOverrides(Array.isArray(o) ? o : []);
  };

  const handleCancel = async () => {
    if (!mobile) return;
    try {
      setOverrideLoading(true);
      await deliveryOverrideService.setOverride(selectedDate, mobile, 'cancelled');
      await refreshOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to cancel.');
    } finally {
      setOverrideLoading(false);
    }
  };

  const handleRemoveCancel = async () => {
    if (!mobile) return;
    try {
      setOverrideLoading(true);
      await deliveryOverrideService.removeOverride(selectedDate, mobile, 'cancelled');
      await refreshOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to remove cancel.');
    } finally {
      setOverrideLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!mobile) return;
    try {
      setOverrideLoading(true);
      await deliveryOverrideService.setOverride(selectedDate, mobile, 'added');
      await refreshOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to add.');
    } finally {
      setOverrideLoading(false);
    }
  };

  const handleRemoveAdd = async () => {
    if (!mobile) return;
    try {
      setOverrideLoading(true);
      await deliveryOverrideService.removeOverride(selectedDate, mobile, 'added');
      await refreshOverrides();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to remove.');
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="My Schedule"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <View style={styles.dateRowWrap}>
        <ScrollView
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
              >
                <Text style={[styles.dateTabDayName, isSelected && styles.dateTabTextSelected]}>{tab.dayName}</Text>
                <Text style={[styles.dateTabNum, isSelected && styles.dateTabTextSelected]}>{tab.dayNum}</Text>
                <Text style={[styles.dateTabMonth, isSelected && styles.dateTabTextSelected]}>{tab.monthName}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : !profile ? (
          <Text style={styles.emptyText}>Could not load your schedule.</Text>
        ) : (
          <>
            <View style={[styles.card, haveDelivery ? styles.cardYes : styles.cardNo]}>
              <Text style={styles.cardTitle}>
                {selectedLabel.dayName}, {selectedLabel.dayNum} {selectedLabel.monthName}
              </Text>
              <Text style={styles.cardStatus}>
                {haveDelivery ? 'You have delivery on this date.' : 'You do not have delivery on this date.'}
              </Text>
              {haveDelivery ? (
                hasAdded ? (
                  <TouchableOpacity style={styles.btnRemove} onPress={handleRemoveAdd} disabled={overrideLoading}>
                    <Text style={styles.btnText}>{overrideLoading ? '...' : 'Remove from this date'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.btnCancel} onPress={handleCancel} disabled={overrideLoading}>
                    <Text style={styles.btnText}>{overrideLoading ? '...' : 'Cancel for this date'}</Text>
                  </TouchableOpacity>
                )
              ) : (
                hasCancelled ? (
                  <TouchableOpacity style={styles.btnUndo} onPress={handleRemoveCancel} disabled={overrideLoading}>
                    <Text style={styles.btnText}>{overrideLoading ? '...' : 'Undo cancel'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.btnAdd} onPress={handleAdd} disabled={overrideLoading}>
                    <Text style={styles.btnText}>{overrideLoading ? '...' : 'Add delivery for this date'}</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

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
  dateRow: { maxHeight: 72 },
  dateRowContent: { paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  dateTab: {
    width: 72,
    marginRight: 8,
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
  dateTabSelected: { backgroundColor: '#2196F3', borderColor: '#1976D2' },
  dateTabToday: { borderColor: '#4CAF50', borderWidth: 2 },
  dateTabDayName: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 2 },
  dateTabNum: { fontSize: 22, fontWeight: '700', color: '#333' },
  dateTabMonth: { fontSize: 11, color: '#888', marginTop: 2 },
  dateTabTextSelected: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardYes: { borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  cardNo: { borderLeftWidth: 4, borderLeftColor: '#9e9e9e' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  cardStatus: { fontSize: 16, color: '#666', marginBottom: 16 },
  btnCancel: { backgroundColor: '#f44336', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnAdd: { backgroundColor: '#4CAF50', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnUndo: { backgroundColor: '#FF9800', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnRemove: { backgroundColor: '#9e9e9e', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24 },
});
