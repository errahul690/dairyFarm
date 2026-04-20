import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { buyerService } from '../../services/buyers/buyerService';
import { paymentService } from '../../services/payments/paymentService';
import { formatCurrency } from '../../utils/currencyUtils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return String(monthKey || '');
  return `${MONTHS[m - 1]} ${y}`;
}
function nextMonthKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return null;
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}
function endOfMonthYmd(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of month
  return lastDay.toISOString().slice(0, 10);
}

export default function BuyerMonthlyBillsScreen({ onNavigate, onLogout }) {
  const [monthly, setMonthly] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [list, pay] = await Promise.all([
        buyerService.getMyMonthlySummaries(36).catch(() => []),
        paymentService.getPayments().catch(() => []),
      ]);
      const sorted = (Array.isArray(list) ? list : []).slice().sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey)));
      setMonthly(sorted);
      setPayments(Array.isArray(pay) ? pay : []);
      if (!selectedMonth && sorted[0]?.monthKey) setSelectedMonth(sorted[0].monthKey);
    } catch (e) {
      Alert.alert('Error', 'Failed to load monthly bills.');
    } finally {
      setLoading(false);
    }
  };

  const monthTabs = useMemo(() => monthly.map((m) => m.monthKey), [monthly]);

  const selected = useMemo(() => monthly.find((m) => m.monthKey === selectedMonth) || null, [monthly, selectedMonth]);

  const paidStatus = useMemo(() => {
    if (!selected) return { due: 0, paidInNextMonth: 0, remaining: 0, isPaid: false };
    const due = Number(selected.closingBalance) || 0;
    const nextKey = nextMonthKey(selected.monthKey);
    const paidInNextMonth = (payments || []).reduce((sum, p) => {
      const dt = p?.paymentDate instanceof Date ? p.paymentDate : new Date(p?.paymentDate);
      if (isNaN(dt.getTime())) return sum;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (key !== nextKey) return sum;
      return sum + (Number(p.amount) || 0);
    }, 0);
    const remaining = Math.max(0, due - paidInNextMonth);
    return { due, paidInNextMonth, remaining, isPaid: due > 0 ? paidInNextMonth >= due : true };
  }, [selected, payments]);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Monthly Bills"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
      ) : monthly.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No monthly bills yet.</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthTabs} contentContainerStyle={styles.monthTabsContent}>
            {monthTabs.map((mk) => {
              const active = mk === selectedMonth;
              return (
                <TouchableOpacity
                  key={mk}
                  style={[styles.monthTab, active && styles.monthTabActive]}
                  onPress={() => setSelectedMonth(mk)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.monthTabText, active && styles.monthTabTextActive]}>{monthLabel(mk)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selected && (
            <>
              <View style={styles.billCard}>
                <Text style={styles.billTitle}>{monthLabel(selected.monthKey)}</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Opening</Text>
                  <Text style={styles.billValue}>{formatCurrency(selected.openingBalance || 0)}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Milk (In)</Text>
                  <Text style={[styles.billValue, styles.inText]}>{formatCurrency(selected.milkIn || 0)}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Payments (Out)</Text>
                  <Text style={[styles.billValue, styles.outText]}>{formatCurrency(selected.paymentsOut || 0)}</Text>
                </View>
                <View style={[styles.billRow, styles.billRowLast]}>
                  <Text style={styles.billLabelStrong}>Closing (Due)</Text>
                  <Text style={[styles.billValueStrong, (Number(selected.closingBalance) || 0) > 0 ? styles.dueText : styles.clearText]}>
                    {formatCurrency(selected.closingBalance || 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>Status</Text>
                <Text style={styles.statusLine}>
                  Due: {formatCurrency(paidStatus.due)} · Paid next month: {formatCurrency(paidStatus.paidInNextMonth)}
                </Text>
                <Text style={[styles.statusMain, paidStatus.remaining > 0 ? styles.dueText : styles.clearText]}>
                  {paidStatus.remaining > 0 ? `Remaining: ${formatCurrency(paidStatus.remaining)}` : 'Paid'}
                </Text>

                {paidStatus.remaining > 0 && (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => {
                      const upto = endOfMonthYmd(selected.monthKey);
                      onNavigate('Pending Payment', { initialPayUptoDate: upto });
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.payBtnText}>Pay via UPI / QR →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  loader: { marginTop: 40 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#777', fontSize: 16 },
  monthTabs: { marginBottom: 12 },
  monthTabsContent: { paddingRight: 6 },
  monthTab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#eeeeee', marginRight: 8 },
  monthTabActive: { backgroundColor: '#1565C0' },
  monthTabText: { color: '#444', fontWeight: '800', fontSize: 12 },
  monthTabTextActive: { color: '#fff' },
  billCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 2, shadowOpacity: 0.1, shadowRadius: 3 },
  billTitle: { fontSize: 16, fontWeight: '900', color: '#333', marginBottom: 10 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  billRowLast: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  billLabel: { fontSize: 12, color: '#546e7a', fontWeight: '700' },
  billValue: { fontSize: 13, color: '#263238', fontWeight: '900' },
  billLabelStrong: { fontSize: 13, color: '#263238', fontWeight: '900' },
  billValueStrong: { fontSize: 14, fontWeight: '900' },
  inText: { color: '#2e7d32' },
  outText: { color: '#c62828' },
  dueText: { color: '#c62828' },
  clearText: { color: '#2e7d32' },
  statusCard: { backgroundColor: '#F5F9FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E3F2FD' },
  statusTitle: { fontSize: 14, fontWeight: '900', color: '#1565C0' },
  statusLine: { marginTop: 6, fontSize: 12, color: '#455a64', fontWeight: '600' },
  statusMain: { marginTop: 10, fontSize: 14, fontWeight: '900' },
  payBtn: { marginTop: 12, backgroundColor: '#4CAF50', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  payBtnText: { color: '#fff', fontWeight: '900' },
});

