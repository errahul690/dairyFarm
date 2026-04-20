import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { milkService } from '../../services/milk/milkService';
import { paymentService } from '../../services/payments/paymentService';
import { buyerService } from '../../services/buyers/buyerService';
import { formatCurrency } from '../../utils/currencyUtils';
import { MILK_SOURCE_TYPES } from '../../constants';

const formatDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function getMonthStart(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().split('T')[0];
}

function monthKeyFromDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function endOfMonthYmd(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return null;
  const lastDay = new Date(Date.UTC(y, m, 0));
  return lastDay.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return String(monthKey || '');
  return `${MONTHS[m - 1]} ${y}`;
}

export default function BuyerDashboardScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txData, paymentData, settlementData, monthlyList] = await Promise.all([
        milkService.getTransactions(),
        paymentService.getPayments().catch(() => []),
        paymentService.getSettlements().catch(() => []),
        buyerService.getMyMonthlySummaries(24).catch(() => []),
      ]);
      const sales = (Array.isArray(txData) ? txData : []).filter((t) => t.type === 'sale');
      setTransactions(sales);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
      setSettlements(Array.isArray(settlementData) ? settlementData : []);
      setMonthly(Array.isArray(monthlyList) ? monthlyList : []);
    } catch (error) {
      console.error('Buyer dashboard load error:', error);
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const latestCutoff = useMemo(() => {
    let max = null;
    (settlements || []).forEach((s) => {
      const dt = s?.settledAt instanceof Date ? s.settledAt : new Date(s?.settledAt);
      if (isNaN(dt.getTime())) return;
      if (!max || dt > max) max = dt;
    });
    return max;
  }, [settlements]);

  const transactionsAfterCutoff = useMemo(() => {
    if (!latestCutoff) return transactions;
    return (transactions || []).filter((t) => {
      const dt = new Date(t.date);
      return !isNaN(dt.getTime()) && dt > latestCutoff;
    });
  }, [transactions, latestCutoff]);

  const paymentsAfterCutoff = useMemo(() => {
    if (!latestCutoff) return payments;
    return (payments || []).filter((p) => {
      const dt = p?.paymentDate instanceof Date ? p.paymentDate : new Date(p?.paymentDate);
      return !isNaN(dt.getTime()) && dt > latestCutoff;
    });
  }, [payments, latestCutoff]);

  const totalMilkAmount = useMemo(
    () => transactionsAfterCutoff.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0),
    [transactionsAfterCutoff]
  );
  const totalPaid = useMemo(
    () => paymentsAfterCutoff.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [paymentsAfterCutoff]
  );
  const pendingAmount = totalMilkAmount - totalPaid;

  const txDateStr = (tx) =>
    tx.date ? (typeof tx.date === 'string' ? tx.date : new Date(tx.date).toISOString().split('T')[0]) : '';
  const payDateStr = (p) =>
    p.paymentDate
      ? (p.paymentDate instanceof Date ? p.paymentDate.toISOString().split('T')[0] : new Date(p.paymentDate).toISOString().split('T')[0])
      : '';

  const monthStartStr = useMemo(() => getMonthStart(new Date()), []);
  const recentThisMonth = useMemo(() => {
    return [...transactionsAfterCutoff]
      .filter((t) => {
        const d = txDateStr(t);
        return d && d >= monthStartStr;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }, [transactionsAfterCutoff, monthStartStr]);

  const billsPreview = useMemo(() => {
    const list = (monthly || []).slice();
    // Ensure chronological for FIFO computation
    const chrono = list.slice().sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)));
    const remainingByMonth = {};
    // charges = milkIn; payments = paymentsOut from summary
    const buckets = chrono.map((m) => ({
      monthKey: m.monthKey,
      remaining: Math.max(0, Number(m.milkIn) || 0),
    }));
    const paymentsChrono = chrono.map((m) => Math.max(0, Number(m.paymentsOut) || 0));
    let i = 0;
    paymentsChrono.forEach((amt0) => {
      let amt = amt0;
      while (amt > 0 && i < buckets.length) {
        if (buckets[i].remaining <= 0) {
          i += 1;
          continue;
        }
        const pay = Math.min(amt, buckets[i].remaining);
        buckets[i].remaining -= pay;
        amt -= pay;
        if (buckets[i].remaining <= 0) i += 1;
      }
    });
    buckets.forEach((b) => {
      remainingByMonth[b.monthKey] = Math.round((b.remaining || 0) * 100) / 100;
    });

    const nowKey = monthKeyFromDate(new Date());
    const [y, m] = nowKey.split('-').map(Number);
    const prevKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;

    const byKey = {};
    chrono.forEach((x) => {
      byKey[x.monthKey] = x;
    });

    const current = byKey[nowKey] || null;
    const last = byKey[prevKey] || null;

    const statusFor = (monthKey) => {
      if (!monthKey) return { remainingUpTo: 0, isPaid: true };
      const keys = chrono.map((x) => x.monthKey);
      const idx = keys.indexOf(monthKey);
      const upTo = idx >= 0 ? keys.slice(0, idx + 1) : [];
      const remainingUpTo = upTo.reduce((s, k) => s + (Number(remainingByMonth[k]) || 0), 0);
      const rem = Math.round(Math.max(0, remainingUpTo) * 100) / 100;
      return { remainingUpTo: rem, isPaid: rem <= 0.0001 };
    };

    return {
      current: current ? { ...current, status: statusFor(current.monthKey) } : null,
      last: last ? { ...last, status: statusFor(last.monthKey) } : null,
      nowKey,
      prevKey,
    };
  }, [monthly]);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Buyer Dashboard"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
        pendingAmount={pendingAmount > 0 ? pendingAmount : undefined}
      />
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Total Pending (all)</Text>
              <Text style={[styles.cardValue, pendingAmount > 0 && styles.pendingText]}>
                {formatCurrency(pendingAmount)}
              </Text>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => onNavigate('Pending Payment')}
              >
                <Text style={styles.linkButtonText}>View & Pay →</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreLinkInline} onPress={() => onNavigate('Ledger')}>
                <Text style={styles.moreLinkTextInline}>View Ledger →</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreLinkInline} onPress={() => onNavigate('Monthly Bills')}>
                <Text style={styles.moreLinkTextInline}>Monthly Bills →</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <View style={[styles.card, styles.halfCard]}>
                <Text style={styles.cardLabel}>Milk Purchases</Text>
                <Text style={styles.cardValue}>{formatCurrency(totalMilkAmount)}</Text>
              </View>
              <View style={[styles.card, styles.halfCard]}>
                <Text style={styles.cardLabel}>Total Paid</Text>
                <Text style={styles.cardValue}>{formatCurrency(totalPaid)}</Text>
              </View>
            </View>

            {(billsPreview.current || billsPreview.last) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Bills</Text>

                {billsPreview.current && (
                  <View style={styles.billMiniCard}>
                    <Text style={styles.billMiniTitle}>Current month · {monthLabel(billsPreview.current.monthKey)}</Text>
                    <Text style={styles.billMiniLine}>
                      Closing (Due): {formatCurrency(billsPreview.current.closingBalance || 0)}
                    </Text>
                    <Text style={[styles.billMiniStatus, billsPreview.current.status.isPaid ? styles.billPaid : styles.billDue]}>
                      {billsPreview.current.status.isPaid ? 'Paid' : `Remaining: ${formatCurrency(billsPreview.current.status.remainingUpTo)}`}
                    </Text>
                    {!billsPreview.current.status.isPaid && (
                      <TouchableOpacity
                        style={styles.billPayBtn}
                        onPress={() => onNavigate('Pending Payment', { initialPayUptoDate: endOfMonthYmd(billsPreview.current.monthKey) })}
                      >
                        <Text style={styles.billPayBtnText}>Pay →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {billsPreview.last && (
                  <View style={styles.billMiniCard}>
                    <Text style={styles.billMiniTitle}>Last month · {monthLabel(billsPreview.last.monthKey)}</Text>
                    <Text style={styles.billMiniLine}>
                      Closing (Due): {formatCurrency(billsPreview.last.closingBalance || 0)}
                    </Text>
                    <Text style={[styles.billMiniStatus, billsPreview.last.status.isPaid ? styles.billPaid : styles.billDue]}>
                      {billsPreview.last.status.isPaid ? 'Paid' : `Remaining: ${formatCurrency(billsPreview.last.status.remainingUpTo)}`}
                    </Text>
                    {!billsPreview.last.status.isPaid && (
                      <TouchableOpacity
                        style={styles.billPayBtn}
                        onPress={() => onNavigate('Pending Payment', { initialPayUptoDate: endOfMonthYmd(billsPreview.last.monthKey) })}
                      >
                        <Text style={styles.billPayBtnText}>Pay →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent this month</Text>
              {recentThisMonth.length === 0 ? (
                <Text style={styles.emptyText}>No milk purchases this month.</Text>
              ) : (
                recentThisMonth.map((tx, i) => {
                  const src = tx.milkSource || 'cow';
                  const sourceLabel = MILK_SOURCE_TYPES.find((s) => s.value === src)?.label || src;
                  return (
                    <View key={tx._id || i} style={styles.txRow}>
                      <View style={styles.txLeft}>
                        <Text style={styles.txDate}>{formatDate(tx.date)}</Text>
                        <Text style={styles.txSource}>{sourceLabel}</Text>
                      </View>
                      <Text style={styles.txQty}>{Number(tx.quantity).toFixed(2)} L</Text>
                      <Text style={styles.txAmount}>{formatCurrency(tx.totalAmount)}</Text>
                    </View>
                  );
                })
              )}
              <TouchableOpacity onPress={() => onNavigate('Transaction History')} style={styles.moreLink}>
                <Text style={styles.moreLinkText}>View all →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => onNavigate('Pending Payment')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>Pay</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  loader: { marginTop: 40 },
  // Date filter removed (month-wise navigation lives in Ledger/Bills screens).
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  halfCard: { flex: 1, marginHorizontal: 4 },
  row: { flexDirection: 'row', marginBottom: 16 },
  cardLabel: { fontSize: 14, color: '#666', marginBottom: 4 },
  cardValue: { fontSize: 22, fontWeight: '700', color: '#333' },
  pendingText: { color: '#d32f2f' },
  linkButton: { marginTop: 8 },
  linkButtonText: { color: '#4CAF50', fontWeight: '600', fontSize: 14 },
  moreLinkInline: { marginTop: 10, alignSelf: 'center' },
  moreLinkTextInline: { color: '#1565C0', fontWeight: '700', fontSize: 14 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 24, elevation: 2, shadowOpacity: 0.1, shadowRadius: 3 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#333' },
  emptyText: { color: '#888', fontSize: 14 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  txLeft: { flex: 1 },
  txDate: { fontSize: 14, color: '#555' },
  txSource: { fontSize: 12, color: '#2196F3', marginTop: 2, fontWeight: '600' },
  txQty: { fontSize: 14, color: '#555', marginRight: 12 },
  txAmount: { fontSize: 14, fontWeight: '600', color: '#333' },
  moreLink: { marginTop: 12 },
  moreLinkText: { color: '#4CAF50', fontWeight: '600', fontSize: 14 },
  billMiniCard: {
    backgroundColor: '#F5F9FF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3F2FD',
    marginBottom: 12,
  },
  billMiniTitle: { fontSize: 14, fontWeight: '900', color: '#1565C0' },
  billMiniLine: { marginTop: 8, fontSize: 13, color: '#263238', fontWeight: '700' },
  billMiniStatus: { marginTop: 8, fontSize: 13, fontWeight: '900' },
  billPaid: { color: '#2e7d32' },
  billDue: { color: '#c62828' },
  billPayBtn: { marginTop: 10, backgroundColor: '#4CAF50', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  billPayBtnText: { color: '#fff', fontWeight: '900' },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    marginLeft: -36,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 18 },
});
