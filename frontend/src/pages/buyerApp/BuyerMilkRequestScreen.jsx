import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth/authService';
import { milkService } from '../../services/milk/milkService';

export default function BuyerMilkRequestScreen({ onNavigate, onLogout }) {
  const [user, setUser] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authService.getCurrentUser().then(setUser);
  }, []);

  const handleSubmit = async () => {
    const q = parseFloat(quantity);
    const p = parseFloat(pricePerLiter);
    if (!user || !user.mobile) {
      Alert.alert('Error', 'User not found. Please login again.');
      return;
    }
    if (!q || q <= 0) {
      Alert.alert('Error', 'Enter valid quantity (liters).');
      return;
    }
    if (!p || p <= 0) {
      Alert.alert('Error', 'Enter valid price per liter.');
      return;
    }
    const totalAmount = q * p;
    try {
      setLoading(true);
      await milkService.recordSale({
        date: new Date(),
        quantity: q,
        pricePerLiter: p,
        totalAmount,
        buyer: user.name || 'Buyer',
        buyerPhone: String(user.mobile).trim(),
        notes: notes.trim() || undefined,
      });
      Alert.alert('Done', 'Milk request recorded.', [
        { text: 'OK', onPress: () => onNavigate('Buyer Dashboard') },
      ]);
      setQuantity('');
      setPricePerLiter('');
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
      />
      <ScrollView style={styles.content}>
        <Text style={styles.instruction}>
          Enter milk quantity and rate. This will be recorded as your purchase.
        </Text>
        <Input placeholder="Quantity (liters)" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} style={styles.input} />
        <Input placeholder="Price per liter (Rs)" keyboardType="decimal-pad" value={pricePerLiter} onChangeText={setPricePerLiter} style={styles.input} />
        <Input placeholder="Notes (optional)" value={notes} onChangeText={setNotes} style={styles.input} />
        <Button title={loading ? 'Saving...' : 'Submit Milk Request'} onPress={handleSubmit} disabled={loading} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 20 },
  instruction: { fontSize: 14, color: '#666', marginBottom: 20 },
  input: { marginBottom: 12, backgroundColor: '#fff' },
});
