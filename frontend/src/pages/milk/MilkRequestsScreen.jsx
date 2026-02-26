import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { milkService } from '../../services/milk/milkService';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currencyUtils';

export default function MilkRequestsScreen({ onNavigate, onLogout }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRequests = async () => {
    try {
      const data = await milkService.getMilkRequests();
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load milk requests:', error);
      Alert.alert('Error', 'Failed to load milk requests. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadRequests();
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Milk Requests"
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAuthenticated={true}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
        >
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🥛</Text>
              <Text style={styles.emptyText}>No milk requests from buyers yet.</Text>
            </View>
          ) : (
            requests.map((req) => (
              <View key={req._id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.buyerName}>{req.buyer || 'Buyer'}</Text>
                  <Text style={styles.date}>{formatDate(req.date)}</Text>
                </View>
                {req.buyerPhone ? (
                  <Text style={styles.phone}>{req.buyerPhone}</Text>
                ) : null}
                <View style={styles.details}>
                  <Text style={styles.quantity}>{Number(req.quantity || 0).toFixed(2)} L</Text>
                  <Text style={styles.rate}>@ {formatCurrency(req.pricePerLiter || 0)}/L</Text>
                  <Text style={styles.total}>{formatCurrency(req.totalAmount || 0)}</Text>
                </View>
                {req.notes ? (
                  <Text style={styles.notes} numberOfLines={2}>{req.notes}</Text>
                ) : null}
                <TouchableOpacity
                  style={styles.milkLink}
                  onPress={() => onNavigate('Milk')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.milkLinkText}>Open Milk →</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#556d73' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#556d73' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  buyerName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  date: { fontSize: 13, color: '#556d73' },
  phone: { fontSize: 14, color: '#556d73', marginBottom: 8 },
  details: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quantity: { fontSize: 16, fontWeight: '600', color: '#1f6b5b' },
  rate: { fontSize: 14, color: '#556d73' },
  total: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  notes: { fontSize: 13, color: '#556d73', fontStyle: 'italic', marginBottom: 8 },
  milkLink: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#E8F5E9', borderRadius: 8 },
  milkLinkText: { fontSize: 14, fontWeight: '600', color: '#2E7D32' },
});
