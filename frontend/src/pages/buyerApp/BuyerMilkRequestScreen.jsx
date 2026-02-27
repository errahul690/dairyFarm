import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth/authService';
import { milkService } from '../../services/milk/milkService';
import { paymentService } from '../../services/payments/paymentService';
import { MILK_SOURCE_TYPES } from '../../constants';

export default function BuyerMilkRequestScreen({ onNavigate, onLogout }) {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [milkSource, setMilkSource] = useState('cow');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authService.getCurrentUser().then(setUser);
  }, []);

  useEffect(() => {
    milkService.getTransactions().then((data) => {
      const sales = (Array.isArray(data) ? data : []).filter((t) => t.type === 'sale');
      setTransactions(sales);
    }).catch(() => setTransactions([]));
    paymentService.getPayments().then((data) => setPayments(Array.isArray(data) ? data : [])).catch(() => setPayments([]));
  }, []);

  const pendingAmount = useMemo(() => {
    const milk = transactions.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
    const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.max(0, milk - paid);
  }, [transactions, payments]);

  const handleSubmit = async () => {
    const q = parseFloat(quantity);
    if (!user || !user.mobile) {
      Alert.alert('Error', 'User not found. Please login again.');
      return;
    }
    if (!q || q <= 0) {
      Alert.alert('Error', 'Enter valid quantity (liters).');
      return;
    }
    // Rate is set by admin when they process the request (or from your profile for same milk type)
    const pricePerLiter = 0;
    const totalAmount = 0;
    try {
      setLoading(true);
      await milkService.recordSale({
        date: new Date(),
        quantity: q,
        pricePerLiter,
        totalAmount,
        buyer: user.name || 'Buyer',
        buyerPhone: String(user.mobile).trim(),
        buyerId: user._id || user.id,
        milkSource: milkSource || 'cow',
        notes: notes.trim() || undefined,
      });
      Alert.alert('Done', 'Milk request recorded. Admin will set the rate.', [
        { text: 'OK', onPress: () => onNavigate('Buyer Dashboard') },
      ]);
      setQuantity('');
      setNotes('');
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to record milk request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Milk Request"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
        pendingAmount={pendingAmount > 0 ? pendingAmount : undefined}
      />
      <ScrollView style={styles.content}>
        <Text style={styles.instruction}>
          Select milk type and quantity. Rate is as per your profile; if you request a different milk type, admin will set the price.
        </Text>
        <Text style={styles.label}>Milk type</Text>
        <View style={styles.milkSourceRow}>
          {MILK_SOURCE_TYPES.map((src) => {
            const isActive = milkSource === src.value;
            return (
              <TouchableOpacity
                key={src.value}
                style={[styles.milkSourceChip, isActive && styles.milkSourceChipActive]}
                onPress={() => setMilkSource(src.value)}
              >
                <Text style={[styles.milkSourceChipText, isActive && styles.milkSourceChipTextActive]}>{src.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.label}>Quantity (liters) *</Text>
        <Input placeholder="e.g. 5" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} style={styles.input} />
        <Text style={styles.label}>Notes (optional)</Text>
        <Input placeholder="Any note for admin" value={notes} onChangeText={setNotes} style={styles.input} />
        <Button title={loading ? 'Saving...' : 'Submit Milk Request'} onPress={handleSubmit} disabled={loading} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 20 },
  instruction: { fontSize: 14, color: '#666', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  milkSourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  milkSourceChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  milkSourceChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  milkSourceChipText: { fontSize: 15, fontWeight: '600', color: '#555' },
  milkSourceChipTextActive: { color: '#fff' },
  input: { marginBottom: 12, backgroundColor: '#fff' },
});
