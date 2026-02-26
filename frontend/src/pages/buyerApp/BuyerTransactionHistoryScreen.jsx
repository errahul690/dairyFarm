import React, { useState, useEffect } from 'react';
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
import { formatCurrency } from '../../utils/currencyUtils';

const formatDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function BuyerTransactionHistoryScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await milkService.getTransactions();
      const sales = (Array.isArray(data) ? data : []).filter((t) => t.type === 'sale');
      setTransactions(sales.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (error) {
      Alert.alert('Error', 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Milk Buying History"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : transactions.length === 0 ? (
          <Text style={styles.emptyText}>No milk transactions yet.</Text>
        ) : (
          transactions.map((tx, i) => (
            <View key={tx._id || i} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.date}>{formatDate(tx.date)}</Text>
                <Text style={styles.amount}>{formatCurrency(tx.totalAmount)}</Text>
              </View>
              <Text style={styles.detail}>
                {Number(tx.quantity).toFixed(2)} L @ {formatCurrency(tx.pricePerLiter)}/L
                {tx.notes ? ` · ${tx.notes}` : ''}
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
