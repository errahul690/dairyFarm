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

const formatDate = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function BuyerPaymentHistoryScreen({ onNavigate, onLogout }) {
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [paymentData, txData] = await Promise.all([
        paymentService.getPayments(),
        milkService.getTransactions().catch(() => []),
      ]);
      setPayments(Array.isArray(paymentData) ? paymentData.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate)) : []);
      const sales = (Array.isArray(txData) ? txData : []).filter((t) => t.type === 'sale');
      setTransactions(sales);
    } catch (error) {
      Alert.alert('Error', 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  };

  const pendingAmount = useMemo(() => {
    const milk = transactions.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
    const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.max(0, milk - paid);
  }, [transactions, payments]);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Payment History"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
        pendingAmount={pendingAmount > 0 ? pendingAmount : undefined}
      />
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : payments.length === 0 ? (
          <Text style={styles.emptyText}>No payments yet.</Text>
        ) : (
          payments.map((p, i) => (
            <View key={p._id || i} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.date}>{formatDate(p.paymentDate)}</Text>
                <Text style={styles.amount}>{formatCurrency(p.amount)}</Text>
              </View>
              <Text style={styles.detail}>
                {p.paymentType || 'Payment'}
                {p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}
                {p.notes ? ` · ${p.notes}` : ''}
              </Text>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 15, fontWeight: '600', color: '#333' },
  amount: { fontSize: 16, fontWeight: '700', color: '#4CAF50' },
  detail: { fontSize: 13, color: '#666', marginTop: 6 },
});
