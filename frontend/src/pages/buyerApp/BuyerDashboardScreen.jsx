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
import { formatCurrency } from '../../utils/currencyUtils';
import { MILK_SOURCE_TYPES } from '../../constants';

const formatDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function BuyerDashboardScreen({ onNavigate, onLogout }) {
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
      setTransactions(sales);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
    } catch (error) {
      console.error('Buyer dashboard load error:', error);
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const totalMilkAmount = useMemo(
    () => transactions.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0),
    [transactions]
  );
  const totalPaid = useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payments]
  );
  const pendingAmount = totalMilkAmount - totalPaid;
  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    [transactions]
  );

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Buyer Dashboard"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Pending Amount</Text>
              <Text style={[styles.cardValue, pendingAmount > 0 && styles.pendingText]}>
                {formatCurrency(pendingAmount)}
              </Text>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => onNavigate('Pending Payment')}
              >
                <Text style={styles.linkButtonText}>View & Pay →</Text>
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
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              {recentTransactions.length === 0 ? (
                <Text style={styles.emptyText}>No milk purchases yet.</Text>
              ) : (
                recentTransactions.map((tx, i) => {
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
        onPress={() => onNavigate('Milk Request')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+ Milk Request</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  loader: { marginTop: 40 },
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
    right: 24,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
