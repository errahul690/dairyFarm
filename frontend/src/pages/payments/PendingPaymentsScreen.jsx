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
import { buyerService } from '../../services/buyers/buyerService';
import { paymentService } from '../../services/payments/paymentService';
import { formatCurrency } from '../../utils/currencyUtils';

/**
 * Pending Payments Screen
 * Shows list of buyers with pending balance (name + amount) and total pending amount.
 */
export default function PendingPaymentsScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [buyersData, setBuyersData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txData, buyersList, paymentData] = await Promise.all([
        milkService.getTransactions(),
        buyerService.getBuyers().catch(() => []),
        paymentService.getPayments().catch(() => []),
      ]);
      setTransactions(Array.isArray(txData) ? txData : []);
      setBuyersData(Array.isArray(buyersList) ? buyersList : []);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
    } catch (error) {
      console.error('Failed to load pending data:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const pendingList = useMemo(() => {
    const buyerMap = new Map();

    buyersData.forEach((b) => {
      if (b.mobile) {
        const key = b.mobile.trim();
        buyerMap.set(key, {
          name: b.name,
          phone: b.mobile,
          totalAmount: 0,
        });
      }
    });

    transactions.forEach((tx) => {
      if (tx.type === 'sale' && tx.buyerPhone) {
        const key = tx.buyerPhone.trim();
        const buyer = buyerMap.get(key);
        if (buyer) {
          buyer.totalAmount += tx.totalAmount || 0;
          buyerMap.set(key, buyer);
        }
      }
    });

    const list = [];
    buyerMap.forEach((buyer) => {
      const phone = (buyer.phone || '').trim();
      const totalPaid = payments
        .filter((p) => String(p.customerMobile || '').trim() === phone)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const pending = (buyer.totalAmount || 0) - totalPaid;
      if (pending > 0) {
        list.push({ name: buyer.name, phone: buyer.phone, pending });
      }
    });

    return list.sort((a, b) => b.pending - a.pending);
  }, [transactions, buyersData, payments]);

  const totalPending = useMemo(
    () => pendingList.reduce((sum, item) => sum + item.pending, 0),
    [pendingList]
  );

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Pending Payments"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#1f6b5b" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total Pending</Text>
              <Text style={styles.totalAmount}>{formatCurrency(totalPending)}</Text>
              <Text style={styles.totalSubtext}>
                {pendingList.length} buyer{pendingList.length !== 1 ? 's' : ''} with dues
              </Text>
            </View>

            {pendingList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No pending payments</Text>
                <Text style={styles.emptySubtext}>All buyer dues are settled.</Text>
              </View>
            ) : (
              <View style={styles.listContainer}>
                <Text style={styles.listTitle}>Name & Amount</Text>
                {pendingList.map((item, index) => (
                  <TouchableOpacity
                    key={`${item.phone}-${index}`}
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => onNavigate('Buyer')}
                  >
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name || item.phone || '—'}
                    </Text>
                    <Text style={styles.rowAmount}>{formatCurrency(item.pending)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  totalCard: {
    backgroundColor: '#1f6b5b',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  totalSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#555',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
  },
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D32F2F',
  },
});
