import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { milkService } from '../../services/milk/milkService';
import { paymentService } from '../../services/payments/paymentService';
import { formatCurrency } from '../../utils/currencyUtils';
import { MILK_SOURCE_TYPES } from '../../constants';

const formatDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

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
  const [selectedMonth, setSelectedMonth] = useState('');

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
        return true;
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
        return true;
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
        return true;
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
  }, [transactions, payments, settlements, latestCutoff]);

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

  useEffect(() => {
    if (selectedMonth) return;
    const first = monthSections[0]?.monthKey;
    if (first) setSelectedMonth(first);
  }, [monthSections, selectedMonth]);

  const selectedRows = useMemo(() => {
    if (!selectedMonth) return [];
    const sec = monthSections.find((s) => s.monthKey === selectedMonth);
    return sec?.rows || [];
  }, [monthSections, selectedMonth]);

  const tallyForSelectedMonth = useMemo(() => {
    if (!selectedMonth) return { opening: 0, milkIn: 0, paymentsOut: 0, closing: 0 };
    // Compute opening as closing balance of previous month in the filtered ledger rows.
    const keys = monthSections.map((s) => s.monthKey).slice().sort((a, b) => a.localeCompare(b));
    const idx = keys.indexOf(selectedMonth);
    const prevKey = idx > 0 ? keys[idx - 1] : null;
    const prevRows = prevKey ? (monthSections.find((s) => s.monthKey === prevKey)?.rows || []) : [];
    const opening = prevRows.length > 0 ? Number(prevRows[0]?.balance || 0) : 0; // rows are desc; first is month latest balance

    let milkIn = 0;
    let paymentsOut = 0;
    selectedRows.forEach((r) => {
      if (r.kind === 'milk') milkIn += Number(r.debit) || 0;
      if (r.kind === 'payment') paymentsOut += Number(r.credit) || 0;
    });
    const closing = opening + milkIn - paymentsOut;
    return {
      opening: Math.round(opening * 100) / 100,
      milkIn: Math.round(milkIn * 100) / 100,
      paymentsOut: Math.round(paymentsOut * 100) / 100,
      closing: Math.round(closing * 100) / 100,
    };
  }, [monthSections, selectedMonth, selectedRows]);

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
        {!!latestCutoff && (
          <View style={styles.cutoffStrip}>
            <Text style={styles.cutoffHint}>
              Note: Balance is calculated after last settlement ({formatDate(latestCutoff)}).
            </Text>
          </View>
        )}
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : monthSections.length === 0 ? (
          <Text style={styles.emptyText}>No ledger entries in this range.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthTabs} contentContainerStyle={styles.monthTabsContent}>
              {monthSections.map((sec) => {
                const active = sec.monthKey === selectedMonth;
                return (
                  <TouchableOpacity
                    key={sec.monthKey}
                    style={[styles.monthTab, active && styles.monthTabActive]}
                    onPress={() => setSelectedMonth(sec.monthKey)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.monthTabText, active && styles.monthTabTextActive]}>{sec.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.tallyCard}>
              <View style={styles.tallyRow}>
                <Text style={styles.tallyLabel}>Opening</Text>
                <Text style={styles.tallyValue}>{formatCurrency(tallyForSelectedMonth.opening)}</Text>
              </View>
              <View style={styles.tallyRow}>
                <Text style={styles.tallyLabel}>Milk (In)</Text>
                <Text style={[styles.tallyValue, styles.tallyIn]}>{formatCurrency(tallyForSelectedMonth.milkIn)}</Text>
              </View>
              <View style={styles.tallyRow}>
                <Text style={styles.tallyLabel}>Payments (Out)</Text>
                <Text style={[styles.tallyValue, styles.tallyOut]}>{formatCurrency(tallyForSelectedMonth.paymentsOut)}</Text>
              </View>
              <View style={[styles.tallyRow, styles.tallyRowLast]}>
                <Text style={styles.tallyLabelStrong}>Closing</Text>
                <Text style={[styles.tallyValueStrong, tallyForSelectedMonth.closing > 0 ? styles.tallyDue : styles.tallyClear]}>
                  {formatCurrency(tallyForSelectedMonth.closing)}
                </Text>
              </View>
            </View>

            <View style={styles.monthCard}>
              {selectedRows.map((r, idx) => (
                <View
                  key={`${r.kind}-${r.ymd}-${idx}`}
                  style={[
                    styles.entryCard,
                    r.kind === 'milk' && styles.txMilkCard,
                    r.kind === 'payment' && styles.txPaymentCard,
                    r.kind === 'settlement' && styles.txSettlementCard,
                  ]}
                >
                  <View style={styles.tallyEntryTop}>
                    <View style={styles.tallyEntryLeft}>
                      {r.kind !== 'settlement' ? (
                        <View style={[styles.tallyBadge, r.kind === 'milk' ? styles.tallyBadgeMilk : styles.tallyBadgePayment]}>
                          <Text style={styles.tallyBadgeText}>{r.kind === 'milk' ? 'Milk' : 'Pay'}</Text>
                        </View>
                      ) : (
                        <View style={[styles.tallyBadge, styles.tallyBadgeSettlement]}>
                          <Text style={styles.tallyBadgeText}>Reset</Text>
                        </View>
                      )}
                      <Text style={styles.tallyEntryDate}>{formatDate(r.date)}</Text>
                    </View>
                    <View style={styles.tallyEntryRight}>
                      {r.kind === 'milk' ? (
                        <>
                          <Text style={styles.tallyEntryLabel}>Debit</Text>
                          <Text style={[styles.tallyEntryAmount, styles.tallyEntryDebit]}>{formatCurrency(r.debit)}</Text>
                        </>
                      ) : r.kind === 'payment' ? (
                        <>
                          <Text style={styles.tallyEntryLabel}>Credit</Text>
                          <Text style={[styles.tallyEntryAmount, styles.tallyEntryCredit]}>{formatCurrency(r.credit)}</Text>
                        </>
                      ) : (
                        <Text style={styles.markerText}>Reset</Text>
                      )}
                    </View>
                  </View>

                  <Text style={styles.tallyEntryDetails}>{r.title}</Text>
                  {!!r.detail && <Text style={styles.rowDetail}>{r.detail}</Text>}

                  <View style={styles.rowBottom}>
                    <Text style={styles.balanceLabel}>Balance</Text>
                    <Text style={[styles.balanceValue, (r.balance || 0) > 0 ? styles.balanceDue : styles.balanceClear]}>
                      {formatCurrency(r.balance || 0)}
                    </Text>
                  </View>
                </View>
              ))}
              {selectedRows.length === 0 && <Text style={styles.emptyText}>No entries in this month.</Text>}
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
  emptyText: { textAlign: 'center', color: '#888', marginTop: 24, fontSize: 16 },
  cutoffStrip: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3F2FD',
  },
  cutoffHint: { fontSize: 12, color: '#546e7a', fontWeight: '600' },
  monthTabs: { marginBottom: 10 },
  monthTabsContent: { paddingRight: 6 },
  monthTab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#eeeeee',
    marginRight: 8,
  },
  monthTabActive: { backgroundColor: '#1565C0' },
  monthTabText: { color: '#444', fontWeight: '800', fontSize: 12 },
  monthTabTextActive: { color: '#fff' },
  tallyCard: {
    backgroundColor: '#F5F9FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3F2FD',
    marginBottom: 12,
  },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  tallyRowLast: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#D7E9FF' },
  tallyLabel: { fontSize: 12, color: '#546e7a', fontWeight: '700' },
  tallyValue: { fontSize: 13, color: '#263238', fontWeight: '900' },
  tallyIn: { color: '#2e7d32' },
  tallyOut: { color: '#c62828' },
  tallyLabelStrong: { fontSize: 13, color: '#263238', fontWeight: '900' },
  tallyValueStrong: { fontSize: 14, fontWeight: '900' },
  tallyDue: { color: '#c62828' },
  tallyClear: { color: '#2e7d32' },
  monthCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  entryCard: { borderRadius: 10, padding: 12, marginBottom: 10 },
  txMilkCard: { backgroundColor: '#fff5f5', borderLeftWidth: 4, borderLeftColor: '#c62828' },
  txPaymentCard: { backgroundColor: '#f1f8e9', borderLeftWidth: 4, borderLeftColor: '#2e7d32' },
  txSettlementCard: { backgroundColor: '#e3f2fd', borderLeftWidth: 4, borderLeftColor: '#1565c0' },
  rowDetail: { fontSize: 12, color: '#666', marginTop: 4 },
  markerText: { fontSize: 12, fontWeight: '800', color: '#1565c0' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  balanceLabel: { fontSize: 12, color: '#777' },
  balanceValue: { fontSize: 13, fontWeight: '800' },
  balanceDue: { color: '#c62828' },
  balanceClear: { color: '#2e7d32' },
  tallyEntryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tallyEntryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  tallyEntryRight: { alignItems: 'flex-end' },
  tallyBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  tallyBadgeMilk: { backgroundColor: '#ffebee' },
  tallyBadgePayment: { backgroundColor: '#e8f5e9' },
  tallyBadgeSettlement: { backgroundColor: '#bbdefb' },
  tallyBadgeText: { fontSize: 12, fontWeight: '900', color: '#333' },
  tallyEntryDate: { fontSize: 14, fontWeight: '700', color: '#333' },
  tallyEntryLabel: { fontSize: 11, fontWeight: '800', color: '#78909c' },
  tallyEntryAmount: { fontSize: 15, fontWeight: '900' },
  tallyEntryDebit: { color: '#c62828' },
  tallyEntryCredit: { color: '#2e7d32' },
  tallyEntryDetails: { fontSize: 13, color: '#455a64', marginTop: 6 },
});

