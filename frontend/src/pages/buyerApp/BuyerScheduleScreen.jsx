import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { buyerService } from '../../services/buyers/buyerService';
import * as deliveryOverrideService from '../../services/deliveryOverride/deliveryOverrideService';
import { milkService } from '../../services/milk/milkService';
import { paymentService } from '../../services/payments/paymentService';
import { MILK_SOURCE_TYPES } from '../../constants';

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

function getMilkSourceLabel(value) {
  const found = MILK_SOURCE_TYPES.find((t) => t.value === (value || 'cow'));
  return found ? found.label : (value || 'Cow');
}

/** Date tabs with today first, then future, then past. */
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

export default function BuyerScheduleScreen({ onNavigate, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
  const [quantityEdit, setQuantityEdit] = useState('');
  const [deliveryItemsEdit, setDeliveryItemsEdit] = useState([]);
  const [updateQuantityLoading, setUpdateQuantityLoading] = useState(false);
  const [showQuantityForm, setShowQuantityForm] = useState(false);

  const dateTabs = useMemo(() => buildDateTabs(), []);

  const pendingAmount = useMemo(() => {
    const sales = (transactions || []).filter((t) => t.type === 'sale');
    const milk = sales.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
    const paid = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.max(0, milk - paid);
  }, [transactions, payments]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [p, o, txData, paymentData] = await Promise.all([
        buyerService.getMyProfile().catch(() => null),
        deliveryOverrideService.getOverridesForDate(selectedDate).catch(() => []),
        milkService.getTransactions().catch(() => []),
        paymentService.getPayments().catch(() => []),
      ]);
      setProfile(p);
      setOverrides(Array.isArray(o) ? o : []);
      setTransactions(Array.isArray(txData) ? txData : []);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
      if (p) {
        if (Array.isArray(p.deliveryItems) && p.deliveryItems.length > 0) {
          setDeliveryItemsEdit(p.deliveryItems.map((it) => ({ milkSource: it.milkSource || 'cow', quantity: String(it.quantity ?? ''), rate: Number(it.rate) || 0 })));
          setQuantityEdit('');
        } else {
          setQuantityEdit(String(p.quantity ?? ''));
          setDeliveryItemsEdit([]);
        }
      }
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

  const handleSaveQuantity = async () => {
    if (!profile) return;
    const hasDeliveryItems = Array.isArray(profile.deliveryItems) && profile.deliveryItems.length > 0;
    try {
      setUpdateQuantityLoading(true);
      if (hasDeliveryItems) {
        const items = deliveryItemsEdit
          .map((it) => {
            const q = parseFloat(it.quantity);
            if (!(q >= 0)) return null;
            return { milkSource: it.milkSource || 'cow', quantity: q, rate: it.rate };
          })
          .filter(Boolean);
        if (items.length === 0) {
          Alert.alert('Error', 'Enter valid quantity for at least one milk type.');
          return;
        }
        await buyerService.updateMyProfile({ deliveryItems: items });
      } else {
        const q = parseFloat(quantityEdit);
        if (!(q >= 0)) {
          Alert.alert('Error', 'Enter a valid quantity (0 or more).');
          return;
        }
        await buyerService.updateMyProfile({ quantity: q });
      }
      setShowQuantityForm(false);
      await loadData();
      Alert.alert('Done', 'Quantity updated.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update quantity.');
    } finally {
      setUpdateQuantityLoading(false);
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
        pendingAmount={pendingAmount > 0 ? pendingAmount : undefined}
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
                {tab.isToday && (
                  <Text style={[styles.dateTabTodayLabel, isSelected && styles.dateTabTodayLabelSelected]}>Today</Text>
                )}
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
                {selectedLabel.isToday ? ' (Today)' : ''}
              </Text>
              <Text style={styles.cardStatus}>
                {haveDelivery ? 'You have delivery on this date.' : 'You do not have delivery on this date.'}
              </Text>
              {haveDelivery && (
                <View style={styles.deliveryDetail}>
                  {Array.isArray(profile.deliveryItems) && profile.deliveryItems.length > 0 ? (
                    profile.deliveryItems.map((it, idx) => (
                      <Text key={idx} style={styles.deliveryDetailText}>
                        {getMilkSourceLabel(it.milkSource)}: {Number(it.quantity || 0).toFixed(2)} L
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.deliveryDetailText}>
                      {getMilkSourceLabel(profile.milkSource)}: {(Number(profile.quantity) || 0).toFixed(2)} L
                    </Text>
                  )}
                </View>
              )}
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

            <View style={styles.quantitySection}>
              <TouchableOpacity
                style={styles.updateScheduleButton}
                onPress={() => setShowQuantityForm((v) => !v)}
              >
                <Text style={styles.updateScheduleButtonText}>
                  {showQuantityForm ? 'Cancel' : 'Update quantity'}
                </Text>
              </TouchableOpacity>
              {showQuantityForm && (
                <View style={styles.quantityForm}>
                  {Array.isArray(profile.deliveryItems) && profile.deliveryItems.length > 0 ? (
                    <>
                      <Text style={styles.quantityFormTitle}>Quantity per milk type (L)</Text>
                      {deliveryItemsEdit.map((it, idx) => (
                        <View key={idx} style={styles.quantityRow}>
                          <Text style={styles.quantityLabel}>{getMilkSourceLabel(it.milkSource)}</Text>
                          <TextInput
                            style={styles.quantityInput}
                            value={it.quantity}
                            onChangeText={(text) => {
                              const next = [...deliveryItemsEdit];
                              next[idx] = { ...next[idx], quantity: text.replace(/[^0-9.]/g, '') };
                              setDeliveryItemsEdit(next);
                            }}
                            keyboardType="decimal-pad"
                            placeholder="0"
                          />
                          <Text style={styles.quantityRate}>@ rate set by admin</Text>
                        </View>
                      ))}
                    </>
                  ) : (
                    <>
                      <Text style={styles.quantityFormTitle}>Daily quantity (L)</Text>
                      <TextInput
                        style={styles.quantityInputSingle}
                        value={quantityEdit}
                        onChangeText={(t) => setQuantityEdit(t.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 5"
                      />
                    </>
                  )}
                  <TouchableOpacity
                    style={[styles.saveQuantityBtn, updateQuantityLoading && styles.saveQuantityBtnDisabled]}
                    onPress={handleSaveQuantity}
                    disabled={updateQuantityLoading}
                  >
                    <Text style={styles.saveQuantityBtnText}>{updateQuantityLoading ? 'Saving...' : 'Save quantity'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.requestChangeButton}
              onPress={() =>
                Alert.alert(
                  'Change delivery days',
                  'To change your delivery days (e.g. Mon/Wed/Fri), please contact the farm admin.',
                  [{ text: 'OK' }]
                )
              }
            >
              <Text style={styles.requestChangeButtonText}>Request schedule change (days)</Text>
            </TouchableOpacity>
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
  dateTabTodayLabel: { fontSize: 10, color: '#4CAF50', marginTop: 2, fontWeight: '600' },
  dateTabTodayLabelSelected: { color: '#fff' },
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
  deliveryDetail: { marginBottom: 16 },
  deliveryDetailText: { fontSize: 15, color: '#333', marginBottom: 4 },
  btnCancel: { backgroundColor: '#f44336', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnAdd: { backgroundColor: '#4CAF50', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnUndo: { backgroundColor: '#FF9800', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnRemove: { backgroundColor: '#9e9e9e', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  updateScheduleButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  updateScheduleButtonText: { color: '#2196F3', fontSize: 15, fontWeight: '600' },
  quantitySection: { marginTop: 16 },
  quantityForm: { marginTop: 12, padding: 16, backgroundColor: '#f9f9f9', borderRadius: 8 },
  quantityFormTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 12 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  quantityLabel: { width: 80, fontSize: 14, fontWeight: '600', color: '#555' },
  quantityInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: '#fff' },
  quantityRate: { fontSize: 12, color: '#888', marginLeft: 8 },
  quantityInputSingle: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff', marginBottom: 12 },
  saveQuantityBtn: { backgroundColor: '#4CAF50', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  saveQuantityBtnDisabled: { backgroundColor: '#9e9e9e' },
  saveQuantityBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  requestChangeButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#9e9e9e',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  requestChangeButtonText: { color: '#666', fontSize: 14, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24 },
});
