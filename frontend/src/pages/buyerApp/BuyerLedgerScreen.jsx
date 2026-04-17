import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
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

function ymdFromDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthKeyFromYmd(ymd) {
  if (!ymd || ymd.length < 7) return '';
  return ymd.slice(0, 7);
}
function monthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export default function BuyerLedgerScreen({ onNavigate, onLogout }) {
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
        milkService.getTransactions().catch(() => []),
        paymentService.getPayments().catch(() => []),
        paymentService.getSettlements().catch(() => []),
      ]);
      const sales = (Array.isArray(txData) ? txData : []).filter((t) => t.type === 'sale');
      setTransactions(sales);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
      setSettlements(Array.isArray(settlementData) ? settlementData : []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load ledger.');
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

  const rows = useMemo(() => {
    const cutoff = latestCutoff;

    const milkRows = (transactions || [])
      .filter((t) => {
        const dt = new Date(t.date);
        if (isNaN(dt.getTime())) return false;
        if (cutoff && dt <= cutoff) return false;
        const ymd = ymdFromDate(dt);
        return ymd && ymd >= dateFrom && ymd <= dateTo;
      })
      .map((t) => {
        const dt = new Date(t.date);
        const src = t.milkSource || 'cow';
        const sourceLabel = MILK_SOURCE_TYPES.find((s) => s.value === src)?.label || src;
        return {
          kind: 'milk',
          date: dt,
          ymd: ymdFromDate(dt),
          title: `Milk · ${sourceLabel}`,
          detail: `${Number(t.quantity || 0).toFixed(2)} L @ ${formatCurrency(t.pricePerLiter)}/L${t.notes ? ` · ${t.notes}` : ''}`,
          debit: Number(t.totalAmount) || 0,
          credit: 0,
        };
      });

    const paymentRows = (payments || [])
      .filter((p) => {
        const dt = p?.paymentDate instanceof Date ? p.paymentDate : new Date(p?.paymentDate);
        if (isNaN(dt.getTime())) return false;
        if (cutoff && dt <= cutoff) return false;
        const ymd = ymdFromDate(dt);
        return ymd && ymd >= dateFrom && ymd <= dateTo;
      })
      .map((p) => {
        const dt = p?.paymentDate instanceof Date ? p.paymentDate : new Date(p?.paymentDate);
        return {
          kind: 'payment',
          date: dt,
          ymd: ymdFromDate(dt),
          title: 'Payment received',
          detail: `${p.paymentType || 'Payment'}${p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}${p.notes ? ` · ${p.notes}` : ''}`,
          debit: 0,
          credit: Number(p.amount) || 0,
        };
      });

    const settlementRows = (settlements || [])
      .filter((s) => {
        const dt = s?.settledAt instanceof Date ? s.settledAt : new Date(s?.settledAt);
        if (isNaN(dt.getTime())) return false;
        const ymd = ymdFromDate(dt);
        return ymd && ymd >= dateFrom && ymd <= dateTo;
      })
      .map((s) => {
        const dt = s?.settledAt instanceof Date ? s.settledAt : new Date(s?.settledAt);
        return {
          kind: 'settlement',
          date: dt,
          ymd: ymdFromDate(dt),
          title: 'Settlement (balance reset)',
          detail: s?.amountReturned != null ? `Returned ${formatCurrency(s.amountReturned)}` : '',
          debit: 0,
          credit: 0,
          isMarker: true,
        };
      });

    const all = [...milkRows, ...paymentRows, ...settlementRows].sort((a, b) => a.date - b.date);

    let running = 0;
    const withBalance = all.map((r) => {
      if (r.kind === 'settlement') {
        running = 0;
        return { ...r, balance: running };
      }
      running = Math.round((running + (r.debit || 0) - (r.credit || 0)) * 100) / 100;
      return { ...r, balance: running };
    });

    return withBalance.sort((a, b) => b.date - a.date);
  }, [transactions, payments, settlements, latestCutoff, dateFrom, dateTo]);

  const monthSections = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const mk = monthKeyFromYmd(r.ymd);
      if (!mk) return;
      if (!map.has(mk)) map.set(mk, []);
      map.get(mk).push(r);
    });
    const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return keys.map((k) => ({ monthKey: k, label: monthLabel(k), rows: map.get(k) }));
  }, [rows]);

  const pendingNow = useMemo(() => {
    // Pending (in filter period, after settlement cutoff): debits - credits.
    const deb = rows.reduce((s, r) => s + (r.debit || 0), 0);
    const cre = rows.reduce((s, r) => s + (r.credit || 0), 0);
    return Math.round((deb - cre) * 100) / 100;
  }, [rows]);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Ledger"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
        pendingAmount={pendingNow > 0 ? pendingNow : undefined}
      />
      <ScrollView style={styles.content}>
        <View style={styles.filterCard}>
          <Text style={styles.filterTitle}>Date filter</Text>
          <View style={styles.filterRow}>
            <View style={styles.filterField}>
              <Text style={styles.filterLabel}>From</Text>
              <Input value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" style={styles.filterInput} />
            </View>
            <View style={styles.filterField}>
              <Text style={styles.filterLabel}>To</Text>
              <Input value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" style={styles.filterInput} />
            </View>
          </View>
          {!!latestCutoff && (
            <Text style={styles.cutoffHint}>
              Note: Balance is calculated after last settlement ({formatDate(latestCutoff)}).
            </Text>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : monthSections.length === 0 ? (
          <Text style={styles.emptyText}>No ledger entries in this range.</Text>
        ) : (
          monthSections.map((sec) => (
            <View key={sec.monthKey} style={styles.monthCard}>
              <Text style={styles.monthTitle}>{sec.label}</Text>
              {sec.rows.map((r, idx) => (
                <View
                  key={`${r.kind}-${r.ymd}-${idx}`}
                  style={[styles.rowCard, r.kind === 'payment' && styles.paymentCard, r.kind === 'settlement' && styles.settlementCard]}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.rowDate}>{formatDate(r.date)}</Text>
                    {r.kind === 'milk' ? (
                      <Text style={styles.debitText}>{formatCurrency(r.debit)}</Text>
                    ) : r.kind === 'payment' ? (
                      <Text style={styles.creditText}>{formatCurrency(r.credit)}</Text>
                    ) : (
                      <Text style={styles.markerText}>Reset</Text>
                    )}
                  </View>
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  {!!r.detail && <Text style={styles.rowDetail}>{r.detail}</Text>}
                  <View style={styles.rowBottom}>
                    <Text style={styles.balanceLabel}>Balance</Text>
                    <Text style={[styles.balanceValue, r.balance > 0 ? styles.balanceDue : styles.balanceClear]}>
                      {formatCurrency(r.balance || 0)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  loader: { marginTop: 40 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 24, fontSize: 16 },
  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  filterTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 10 },
  filterRow: { flexDirection: 'row' },
  filterField: { flex: 1, marginRight: 8 },
  filterLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  filterInput: { fontSize: 14 },
  cutoffHint: { marginTop: 10, fontSize: 12, color: '#546e7a' },
  monthCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  monthTitle: { fontSize: 17, fontWeight: '800', color: '#333', marginBottom: 10 },
  rowCard: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10 },
  paymentCard: { borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  settlementCard: { borderLeftWidth: 4, borderLeftColor: '#1565c0' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowDate: { fontSize: 13, fontWeight: '700', color: '#333' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#222', marginTop: 6 },
  rowDetail: { fontSize: 12, color: '#666', marginTop: 4 },
  debitText: { fontSize: 14, fontWeight: '800', color: '#c62828' },
  creditText: { fontSize: 14, fontWeight: '800', color: '#2e7d32' },
  markerText: { fontSize: 12, fontWeight: '800', color: '#1565c0' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  balanceLabel: { fontSize: 12, color: '#777' },
  balanceValue: { fontSize: 13, fontWeight: '800' },
  balanceDue: { color: '#c62828' },
  balanceClear: { color: '#2e7d32' },
});

