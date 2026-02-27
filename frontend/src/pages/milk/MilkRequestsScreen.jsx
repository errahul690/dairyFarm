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
  Modal,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { milkService } from '../../services/milk/milkService';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currencyUtils';
import { MILK_SOURCE_TYPES } from '../../constants';

export default function MilkRequestsScreen({ onNavigate, onLogout }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [editPricePerLiter, setEditPricePerLiter] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

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

  const openSetPrice = (req) => {
    setEditingRequest(req);
    setEditPricePerLiter(req.pricePerLiter != null && req.pricePerLiter > 0 ? String(req.pricePerLiter) : '');
  };

  const handleSavePrice = async () => {
    if (!editingRequest) return;
    const p = parseFloat(editPricePerLiter);
    if (isNaN(p) || p < 0) {
      Alert.alert('Error', 'Enter valid price per liter (₹).');
      return;
    }
    const q = Number(editingRequest.quantity) || 0;
    const totalAmount = Math.round(q * p * 100) / 100;
    try {
      setSavingPrice(true);
      const date = editingRequest.date instanceof Date ? editingRequest.date : new Date(editingRequest.date);
      await milkService.updateTransaction(editingRequest._id, {
        type: 'sale',
        date,
        quantity: editingRequest.quantity,
        pricePerLiter: p,
        totalAmount,
        buyer: editingRequest.buyer,
        buyerPhone: editingRequest.buyerPhone,
        notes: editingRequest.notes,
        milkSource: editingRequest.milkSource || 'cow',
      });
      setEditingRequest(null);
      setEditPricePerLiter('');
      await loadRequests();
      Alert.alert('Done', 'Price updated.');
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to update price.');
    } finally {
      setSavingPrice(false);
    }
  };

  const getMilkSourceLabel = (value) => MILK_SOURCE_TYPES.find((s) => s.value === (value || 'cow'))?.label || (value || 'Cow');

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
                <View style={styles.milkSourceBadge}>
                  <Text style={styles.milkSourceText}>{getMilkSourceLabel(req.milkSource)}</Text>
                </View>
                <View style={styles.details}>
                  <Text style={styles.quantity}>{Number(req.quantity || 0).toFixed(2)} L</Text>
                  {(req.pricePerLiter != null && req.pricePerLiter > 0) ? (
                    <>
                      <Text style={styles.rate}>@ {formatCurrency(req.pricePerLiter)}/L</Text>
                      <Text style={styles.total}>{formatCurrency(req.totalAmount || 0)}</Text>
                    </>
                  ) : (
                    <Text style={styles.noRate}>Rate not set — add price below</Text>
                  )}
                </View>
                {(req.pricePerLiter == null || req.pricePerLiter === 0) ? (
                  <TouchableOpacity style={styles.setPriceButton} onPress={() => openSetPrice(req)}>
                    <Text style={styles.setPriceButtonText}>Set price</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.editPriceButton} onPress={() => openSetPrice(req)}>
                    <Text style={styles.editPriceButtonText}>Edit price</Text>
                  </TouchableOpacity>
                )}
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

      <Modal visible={!!editingRequest} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Set price</Text>
            {editingRequest ? (
              <>
                <Text style={styles.modalInfo}>
                  {editingRequest.buyer || 'Buyer'} · {Number(editingRequest.quantity || 0).toFixed(2)} L · {getMilkSourceLabel(editingRequest.milkSource)}
                </Text>
                <Text style={styles.modalLabel}>Price per liter (₹)</Text>
                <Input
                  placeholder="e.g. 55"
                  value={editPricePerLiter}
                  onChangeText={setEditPricePerLiter}
                  keyboardType="decimal-pad"
                  style={styles.modalInput}
                />
                {editPricePerLiter && !isNaN(parseFloat(editPricePerLiter)) && parseFloat(editPricePerLiter) >= 0 && (
                  <Text style={styles.modalTotal}>
                    Total: {formatCurrency((Number(editingRequest.quantity) || 0) * parseFloat(editPricePerLiter))}
                  </Text>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => { setEditingRequest(null); setEditPricePerLiter(''); }}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <Button title={savingPrice ? 'Saving...' : 'Save'} onPress={handleSavePrice} disabled={savingPrice} style={styles.modalSave} />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
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
  milkSourceBadge: { marginBottom: 6 },
  milkSourceText: { fontSize: 14, fontWeight: '600', color: '#1f6b5b' },
  details: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quantity: { fontSize: 16, fontWeight: '600', color: '#1f6b5b' },
  rate: { fontSize: 14, color: '#556d73' },
  total: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  noRate: { fontSize: 13, color: '#e65100', fontStyle: 'italic' },
  setPriceButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#1f6b5b', borderRadius: 8, marginBottom: 8 },
  setPriceButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  editPriceButton: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#E8F5E9', borderRadius: 8, marginBottom: 8 },
  editPriceButtonText: { color: '#2E7D32', fontSize: 13, fontWeight: '600' },
  notes: { fontSize: 13, color: '#556d73', fontStyle: 'italic', marginBottom: 8 },
  milkLink: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#E8F5E9', borderRadius: 8 },
  milkLinkText: { fontSize: 14, fontWeight: '600', color: '#2E7D32' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  modalInfo: { fontSize: 14, color: '#556d73', marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  modalInput: { marginBottom: 8 },
  modalTotal: { fontSize: 16, fontWeight: '600', color: '#1f6b5b', marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: '#555' },
  modalSave: { flex: 1 },
});
