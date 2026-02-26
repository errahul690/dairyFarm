import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { milkService } from '../../services/milk/milkService';
import { buyerService } from '../../services/buyers/buyerService';
import * as deliveryOverrideService from '../../services/deliveryOverride/deliveryOverrideService';
import { formatCurrency } from '../../utils/currencyUtils';
import { MILK_SOURCE_TYPES } from '../../constants';

function getTodayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Today 00:00 to 24:00 in India (IST). Use midnight UTC on IST date so saved dates align. */
function getTodayStartEndIST() {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { start, end };
}

/** True if today (IST) is a delivery day for this buyer. */
function isDeliveryDayToday(buyer, todayStartIST) {
  const deliveryDays = buyer.deliveryDays;
  if (deliveryDays && Array.isArray(deliveryDays) && deliveryDays.length > 0) {
    const dayOfWeekIST = new Date(todayStartIST.getTime() + IST_OFFSET_MS).getUTCDay();
    return deliveryDays.includes(dayOfWeekIST);
  }
  const cycleDays = Number(buyer.deliveryCycleDays);
  if (cycleDays > 1 && buyer.deliveryCycleStartDate) {
    const start = new Date(buyer.deliveryCycleStartDate);
    const startIST = new Date(start.getTime() + IST_OFFSET_MS);
    const startDayMs = Date.UTC(startIST.getUTCFullYear(), startIST.getUTCMonth(), startIST.getUTCDate()) - IST_OFFSET_MS;
    const startDay = new Date(startDayMs);
    const daysDiff = Math.round((todayStartIST.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
    return daysDiff >= 0 && daysDiff % cycleDays === 0;
  }
  return true;
}

export default function QuickSaleScreen({ onNavigate, onLogout }) {
  const [buyers, setBuyers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [customModal, setCustomModal] = useState(null);

  const todayDateStr = useMemo(() => getTodayDateStr(), []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [buyersList, txList, overridesList] = await Promise.all([
        buyerService.getBuyers(true),
        milkService.getTransactions(),
        deliveryOverrideService.getOverridesForDate(todayDateStr).catch(() => []),
      ]);
      setBuyers(Array.isArray(buyersList) ? buyersList : []);
      setTransactions(Array.isArray(txList) ? txList : []);
      setOverrides(Array.isArray(overridesList) ? overridesList : []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const { start: todayStart, end: todayEnd } = useMemo(() => getTodayStartEndIST(), []);

  const cancelledMobiles = useMemo(
    () => new Set(overrides.filter((o) => o.type === 'cancelled').map((o) => String(o.customerMobile).trim())),
    [overrides]
  );
  const addedMobiles = useMemo(
    () => new Set(overrides.filter((o) => o.type === 'added').map((o) => String(o.customerMobile).trim())),
    [overrides]
  );

  const todaySales = useMemo(() => {
    return transactions.filter(
      (t) => t.type === 'sale' && new Date(t.date) >= todayStart && new Date(t.date) < todayEnd
    );
  }, [transactions, todayStart, todayEnd]);

  const buyersWithStatus = useMemo(() => {
    const list = buyers
      .filter((b) => {
        if (!b.mobile) return false;
        const mobile = String(b.mobile).trim();
        const normallyOn = isDeliveryDayToday(b, todayStart);
        if (cancelledMobiles.has(mobile)) return false;
        if (addedMobiles.has(mobile)) return true;
        return normallyOn;
      })
      .map((b) => {
        const mobile = String(b.mobile).trim();
        const today = todaySales.filter((t) => String(t.buyerPhone || '').trim() === mobile);
        const deliveredToday = today.length > 0;
        const todayQty = today.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
        const todayAmt = today.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
        const todayLines = today.map((t) => {
          const src = t.milkSource || 'cow';
          const label = MILK_SOURCE_TYPES.find((s) => s.value === src)?.label || src;
          return { milkSource: src, label, quantity: Number(t.quantity) || 0, totalAmount: Number(t.totalAmount) || 0 };
        });
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
          deliveredToday,
          todayQuantity: todayQty,
          todayAmount: todayAmt,
          todayLines,
          deliveryItems: b.deliveryItems,
        };
      });
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en'));
  }, [buyers, todaySales, todayStart, cancelledMobiles, addedMobiles]);

  const todayRequirement = useMemo(
    () => buyersWithStatus.reduce((s, b) => s + b.dailyQuantity, 0),
    [buyersWithStatus]
  );
  const deliveredCount = useMemo(
    () => buyersWithStatus.filter((b) => b.deliveredToday).length,
    [buyersWithStatus]
  );

  const handleDelivered = async (buyer) => {
    if (!buyer.mobile) return;
    if (buyer.deliveredToday) {
      Alert.alert('Already delivered', `${buyer.name} already has a sale recorded for today.`);
      return;
    }
    if (!(buyer.dailyQuantity > 0 && (buyer.rate >= 0 || (buyer.deliveryItems && buyer.deliveryItems.length > 0)))) {
      Alert.alert('Set rate & quantity', 'Set this buyer\'s milk delivery items (or daily quantity and rate) in Buyer screen first.');
      return;
    }
    try {
      setActionLoading(buyer.mobile);
      await milkService.quickSale(buyer.mobile);
      await loadData();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Quick sale failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCustomDelivered = (buyer) => {
    if (!buyer.mobile) return;
    setCustomModal({
      ...buyer,
      quantity: String(buyer.dailyQuantity || ''),
      pricePerLiter: String(buyer.rate || ''),
      milkSource: buyer.milkSource || 'cow',
    });
  };

  const submitCustomSale = async () => {
    if (!customModal) return;
    const q = parseFloat(customModal.quantity);
    const p = parseFloat(customModal.pricePerLiter);
    if (!(q > 0 && p >= 0)) {
      Alert.alert('Error', 'Enter valid quantity and rate.');
      return;
    }
    try {
      setActionLoading(customModal.mobile);
      await milkService.quickSale(customModal.mobile, q, p, customModal.milkSource);
      setCustomModal(null);
      await loadData();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Quick sale failed.');
    } finally {
      setActionLoading(null);
    }
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
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Today&apos;s requirement</Text>
              <Text style={styles.summaryValue}>{todayRequirement.toFixed(2)} L</Text>
              <Text style={styles.summarySub}>
                Delivered {deliveredCount} / {buyersWithStatus.length} buyers
              </Text>
            </View>

            {buyersWithStatus.length === 0 ? (
              <Text style={styles.emptyText}>No buyers. Add buyers with rate and daily quantity first.</Text>
            ) : (
              buyersWithStatus.map((b) => (
                <View key={b.mobile} style={[styles.card, b.deliveredToday && styles.cardDelivered]}>
                  <View style={styles.cardRow}>
                    <Text style={styles.buyerName}>{b.name}</Text>
                    {b.deliveredToday ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Delivered</Text>
                        {b.todayLines && b.todayLines.length > 0 ? (
                          b.todayLines.map((line, i) => (
                            <Text key={i} style={styles.badgeSub}>
                              {line.label} {line.quantity.toFixed(2)} L @ {formatCurrency(line.totalAmount / line.quantity)}/L → {formatCurrency(line.totalAmount)}
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.badgeSub}>{b.todayQuantity.toFixed(2)} L · {formatCurrency(b.todayAmount)}</Text>
                        )}
                        <Text style={styles.badgeTotal}>Total: {b.todayQuantity.toFixed(2)} L · {formatCurrency(b.todayAmount)}</Text>
                      </View>
                    ) : (
                      <Text style={styles.notDelivered}>Not delivered</Text>
                    )}
                  </View>
                  <Text style={styles.detail}>
                    {b.deliveryItems && b.deliveryItems.length > 0
                      ? b.deliveryItems.map((it, i) => {
                          const label = MILK_SOURCE_TYPES.find((s) => s.value === it.milkSource)?.label || it.milkSource;
                          return `${(Number(it.quantity) || 0).toFixed(2)} L ${label} @ ${formatCurrency(Number(it.rate) || 0)}/L`;
                        }).join(' · ')
                      : `${b.dailyQuantity.toFixed(2)} L/day @ ${formatCurrency(b.rate)}/L`}
                  </Text>
                  <View style={styles.buttons}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnDelivered, b.deliveredToday && styles.btnDisabled]}
                      onPress={() => handleDelivered(b)}
                      disabled={b.deliveredToday || actionLoading !== null}
                    >
                      <Text style={styles.btnText}>
                        {actionLoading === b.mobile ? '...' : 'Delivered'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnCustom, actionLoading !== null && styles.btnDisabled]}
                      onPress={() => handleCustomDelivered(b)}
                      disabled={actionLoading !== null}
                    >
                      <Text style={styles.btnText}>{b.deliveredToday ? 'Add another milk' : 'Custom Delivered'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!customModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Custom Delivered</Text>
            {customModal && (
              <>
                <Text style={styles.modalName}>{customModal.name}</Text>
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
                <View style={styles.modalButtons}>
                  <Button title="Cancel" onPress={() => setCustomModal(null)} style={styles.cancelBtn} />
                  <Button
                    title={actionLoading ? 'Saving...' : 'Save'}
                    onPress={submitCustomSale}
                    disabled={!!actionLoading}
                  />
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
  content: { flex: 1, padding: 16 },
  loader: { marginTop: 40 },
  summaryCard: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  summaryTitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
  summaryValue: { fontSize: 28, fontWeight: '700', color: '#fff' },
  summarySub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardDelivered: { borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  buyerName: { fontSize: 17, fontWeight: '600', color: '#333' },
  badge: { alignItems: 'flex-end' },
  badgeText: { fontSize: 13, fontWeight: '600', color: '#4CAF50' },
  badgeSub: { fontSize: 12, color: '#666', marginTop: 2 },
  badgeTotal: { fontSize: 12, color: '#333', fontWeight: '600', marginTop: 4 },
  notDelivered: { fontSize: 13, color: '#d32f2f', fontWeight: '500' },
  detail: { fontSize: 13, color: '#666', marginBottom: 12 },
  buttons: { flexDirection: 'row' },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnDelivered: { backgroundColor: '#4CAF50' },
  btnCustom: { backgroundColor: '#2196F3', marginLeft: 10 },
  btnDisabled: { backgroundColor: '#9e9e9e' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalName: { fontSize: 15, color: '#666', marginBottom: 12 },
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
