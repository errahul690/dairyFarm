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
import Input from '../../components/common/Input';
import { milkService } from '../../services/milk/milkService';
import { paymentService } from '../../services/payments/paymentService';
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

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function BuyerDashboardScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => getMonthStart(new Date()));
  const [dateTo, setDateTo] = useState(getTodayStr());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txData, paymentData, settlementData] = await Promise.all([
        milkService.getTransactions(),
        paymentService.getPayments().catch(() => []),
        paymentService.getSettlements().catch(() => []),
      ]);
      const sales = (Array.isArray(txData) ? txData : []).filter((t) => t.type === 'sale');
      setTransactions(sales);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
      setSettlements(Array.isArray(settlementData) ? settlementData : []);
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

  const inRangeTx = useMemo(
    () => transactionsAfterCutoff.filter((t) => {
      const d = txDateStr(t);
      return d && d >= dateFrom && d <= dateTo;
    }),
    [transactionsAfterCutoff, dateFrom, dateTo]
  );
  const inRangePay = useMemo(
    () => paymentsAfterCutoff.filter((p) => {
      const d = payDateStr(p);
      return d && d >= dateFrom && d <= dateTo;
    }),
    [paymentsAfterCutoff, dateFrom, dateTo]
  );

  const periodMilk = useMemo(
    () => inRangeTx.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0),
    [inRangeTx]
  );
  const periodPaid = useMemo(
    () => inRangePay.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [inRangePay]
  );

  const pendingUptoToDate = useMemo(() => {
    const milkUpto = transactionsAfterCutoff
      .filter((t) => txDateStr(t) && txDateStr(t) <= dateTo)
      .reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
    const paidUpto = paymentsAfterCutoff
      .filter((p) => payDateStr(p) && payDateStr(p) <= dateTo)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return milkUpto - paidUpto;
  }, [transactionsAfterCutoff, paymentsAfterCutoff, dateTo]);

  const recentInRange = useMemo(
    () => [...inRangeTx].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    [inRangeTx]
  );

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
            <View style={styles.filterCard}>
              <Text style={styles.filterTitle}>Date filter</Text>
              <View style={styles.filterRow}>
                <View style={styles.filterField}>
                  <Text style={styles.filterLabel}>From</Text>
                  <Input
                    value={dateFrom}
                    onChangeText={setDateFrom}
                    placeholder="YYYY-MM-DD"
                    style={styles.filterInput}
                  />
                </View>
                <View style={styles.filterField}>
                  <Text style={styles.filterLabel}>To</Text>
                  <Input
                    value={dateTo}
                    onChangeText={setDateTo}
                    placeholder="YYYY-MM-DD"
                    style={styles.filterInput}
                  />
                </View>
              </View>
              <Text style={styles.periodSummary}>
                In this period: Milk {formatCurrency(periodMilk)} · Paid {formatCurrency(periodPaid)} · Pending (as of {dateTo}): {formatCurrency(pendingUptoToDate)}
              </Text>
            </View>

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

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent in selected period</Text>
              {recentInRange.length === 0 ? (
                <Text style={styles.emptyText}>No milk purchases in this date range.</Text>
              ) : (
                recentInRange.map((tx, i) => {
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
  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  filterRow: { flexDirection: 'row' },
  filterField: { flex: 1, marginRight: 8 },
  filterLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  filterInput: { fontSize: 14 },
  periodSummary: { fontSize: 13, color: '#555', marginTop: 12 },
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
