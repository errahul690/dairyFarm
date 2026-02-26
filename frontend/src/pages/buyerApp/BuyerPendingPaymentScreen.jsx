import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { milkService } from '../../services/milk/milkService';
import { paymentService } from '../../services/payments/paymentService';
import { settingsService } from '../../services/settings/settingsService';
import { formatCurrency } from '../../utils/currencyUtils';

export default function BuyerPendingPaymentScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upiSettings, setUpiSettings] = useState({ upiId: '', upiName: 'Farm', qrImageBase64: null });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txData, paymentData, upi] = await Promise.all([
        milkService.getTransactions(),
        paymentService.getPayments().catch(() => []),
        settingsService.getUpi().catch(() => ({ upiId: '', upiName: 'Farm', qrImageBase64: null })),
      ]);
      const sales = (Array.isArray(txData) ? txData : []).filter((t) => t.type === 'sale');
      setTransactions(sales);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
      setUpiSettings({
        upiId: upi.upiId || '',
        upiName: upi.upiName || 'Farm',
        qrImageBase64: upi.qrImageBase64 || null,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const totalMilkAmount = React.useMemo(
    () => transactions.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0),
    [transactions]
  );
  const totalPaid = React.useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payments]
  );
  const pendingAmount = totalMilkAmount - totalPaid;

  const upiString = React.useMemo(() => {
    const { upiId, upiName } = upiSettings;
    if (!upiId || !upiId.trim()) return null;
    const amount = pendingAmount > 0 ? pendingAmount.toFixed(2) : '0';
    const encodedName = encodeURIComponent(upiName.trim() || 'Farm');
    return `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodedName}&am=${amount}&cu=INR`;
  }, [upiSettings, pendingAmount]);

  const openPayViaUPI = () => {
    if (pendingAmount <= 0) {
      Alert.alert('Info', 'No pending amount to pay.');
      return;
    }
    if (!upiString) {
      Alert.alert('Info', 'UPI ID is not set by the farm. Please pay in cash and share the reference to the farm.');
      return;
    }
    Linking.openURL(upiString).catch(() => {
      Alert.alert(
        'Cannot open UPI',
        'Install GPay, PhonePe or any UPI app. Or scan the QR above and pay.'
      );
    });
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Pending Payment"
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
            </View>

            {upiSettings.upiId && upiSettings.upiId.trim() && (
              <View style={styles.qrCard}>
                <Text style={styles.qrTitle}>Scan QR to pay</Text>
                <Text style={styles.qrSub}>Amount: {formatCurrency(pendingAmount)}</Text>
                {upiSettings.qrImageBase64 ? (
                  <View style={styles.qrWrap}>
                    <Image
                      source={{ uri: `data:image/png;base64,${upiSettings.qrImageBase64}` }}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}
                <Text style={styles.upiIdText}>{upiSettings.upiId}</Text>
                <Text style={styles.upiNameText}>{upiSettings.upiName}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.payButton, pendingAmount <= 0 && styles.payButtonDisabled]}
              onPress={openPayViaUPI}
              disabled={pendingAmount <= 0}
            >
              <Text style={styles.payButtonText}>Pay via GPay / UPI</Text>
            </TouchableOpacity>

            <Text style={styles.note}>
              {upiSettings.upiId
                ? 'Scan the QR or tap the button to open your UPI app with the pending amount. After paying, share the transaction reference to the farm for confirmation.'
                : 'UPI is not configured yet. Please pay in cash and share the reference to the farm.'}
            </Text>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  cardValue: { fontSize: 28, fontWeight: '700', color: '#333' },
  pendingText: { color: '#d32f2f' },
  qrCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  qrTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  qrSub: { fontSize: 14, color: '#666', marginBottom: 16 },
  qrWrap: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
  },
  qrImage: { width: 200, height: 200 },
  upiIdText: { fontSize: 14, color: '#1565C0', fontWeight: '600' },
  upiNameText: { fontSize: 13, color: '#666', marginTop: 4 },
  payButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  payButtonDisabled: { backgroundColor: '#9e9e9e' },
  payButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  note: { fontSize: 12, color: '#666', textAlign: 'center', paddingHorizontal: 16 },
});
