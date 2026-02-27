import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthKey(d) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = dt.getMonth();
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export default function BuyerTransactionHistoryScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txData, paymentData] = await Promise.all([
        milkService.getTransactions(),
        paymentService.getPayments().catch(() => []),
      ]);
      const sales = (Array.isArray(txData) ? txData : []).filter((t) => t.type === 'sale');
      setTransactions(sales.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setPayments(Array.isArray(paymentData) ? paymentData : []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  };

  const byMonth = useMemo(() => {
    const map = new Map();

    transactions.forEach((tx) => {
      const key = getMonthKey(tx.date);
      if (!map.has(key)) map.set(key, { milk: [], payments: [] });
      map.get(key).milk.push(tx);
    });

    payments.forEach((p) => {
      const key = getMonthKey(p.paymentDate);
      if (!map.has(key)) map.set(key, { milk: [], payments: [] });
      map.get(key).payments.push(p);
    });

    const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return keys.map((key) => ({
      monthKey: key,
      label: getMonthLabel(key),
      milk: (map.get(key)?.milk || []).sort((a, b) => new Date(b.date) - new Date(a.date)),
      payments: (map.get(key)?.payments || []).sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate)),
    }));
  }, [transactions, payments]);

  const totalPending = useMemo(() => {
    const milk = transactions.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
    const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return milk - paid;
  }, [transactions, payments]);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Transaction History"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
        pendingAmount={totalPending > 0 ? totalPending : undefined}
      />
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : byMonth.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet.</Text>
        ) : (
          byMonth.map(({ monthKey, label, milk, payments: monthPayments }) => (
            <View key={monthKey} style={styles.monthSection}>
              <Text style={styles.monthTitle}>{label}</Text>

              {milk.length > 0 && (
                <>
                  <Text style={styles.sectionSubtitle}>Milk</Text>
                  {milk.map((tx, i) => {
                    const src = tx.milkSource || 'cow';
                    const sourceLabel = MILK_SOURCE_TYPES.find((s) => s.value === src)?.label || src;
                    return (
                      <View key={tx._id || i} style={styles.txCard}>
                        <View style={styles.txCardRow}>
                          <Text style={styles.txDate}>{formatDate(tx.date)}</Text>
                          <Text style={styles.txAmount}>{formatCurrency(tx.totalAmount)}</Text>
                        </View>
                        <Text style={styles.txDetail}>
                          {sourceLabel} · {Number(tx.quantity).toFixed(2)} L @ {formatCurrency(tx.pricePerLiter)}/L
                          {tx.notes ? ` · ${tx.notes}` : ''}
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}

              {monthPayments.length > 0 && (
                <>
                  <Text style={styles.sectionSubtitle}>Payments</Text>
                  {monthPayments.map((p, i) => (
                    <View key={p._id || i} style={[styles.txCard, styles.paymentCard]}>
                      <View style={styles.txCardRow}>
                        <Text style={styles.txDate}>{formatDate(p.paymentDate)}</Text>
                        <Text style={styles.paymentAmount}>{formatCurrency(p.amount)}</Text>
                      </View>
                      <Text style={styles.txDetail}>
                        {p.paymentType || 'Payment'}
                        {p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {milk.length === 0 && monthPayments.length === 0 && (
                <Text style={styles.noInMonth}>No transactions in this month.</Text>
              )}
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
  monthSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
    marginBottom: 6,
  },
  txCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  paymentCard: { borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  txCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txDate: { fontSize: 14, fontWeight: '600', color: '#333' },
  txAmount: { fontSize: 15, fontWeight: '700', color: '#333' },
  paymentAmount: { fontSize: 15, fontWeight: '700', color: '#4CAF50' },
  txDetail: { fontSize: 13, color: '#666', marginTop: 4 },
  noInMonth: { fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 8 },
});
