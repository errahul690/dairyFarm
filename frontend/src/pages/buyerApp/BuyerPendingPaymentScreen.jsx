import React, { useState, useEffect, useMemo } from 'react';
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
import Input from '../../components/common/Input';
import { milkService } from '../../services/milk/milkService';
import { paymentService } from '../../services/payments/paymentService';
import { settingsService } from '../../services/settings/settingsService';
import { formatCurrency } from '../../utils/currencyUtils';

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function txDateStr(tx) {
  return tx.date ? (typeof tx.date === 'string' ? tx.date : new Date(tx.date).toISOString().split('T')[0]) : '';
}
function payDateStr(p) {
  return p.paymentDate
    ? (p.paymentDate instanceof Date ? p.paymentDate.toISOString().split('T')[0] : new Date(p.paymentDate).toISOString().split('T')[0])
    : '';
}

export default function BuyerPendingPaymentScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payUptoDate, setPayUptoDate] = useState(getTodayStr());
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

  const totalMilkAmount = useMemo(
    () => transactions.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0),
    [transactions]
  );
  const totalPaid = useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payments]
  );
  const pendingAmount = totalMilkAmount - totalPaid;

  const pendingUptoSelectedDate = useMemo(() => {
    const milkUpto = transactions
      .filter((t) => txDateStr(t) && txDateStr(t) <= payUptoDate)
      .reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
    const paidUpto = payments
      .filter((p) => payDateStr(p) && payDateStr(p) <= payUptoDate)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.max(0, milkUpto - paidUpto);
  }, [transactions, payments, payUptoDate]);

  const amountToPay = pendingUptoSelectedDate;

  const upiString = useMemo(() => {
    const { upiId, upiName } = upiSettings;
    if (!upiId || !upiId.trim()) return null;
    const amount = amountToPay > 0 ? amountToPay.toFixed(2) : '0';
    const encodedName = encodeURIComponent(upiName.trim() || 'Farm');
    return `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodedName}&am=${amount}&cu=INR`;
  }, [upiSettings, amountToPay]);

  const openPayViaUPI = () => {
    if (amountToPay <= 0) {
      Alert.alert('Info', `No pending amount up to ${payUptoDate}. You can change "Pay up to date" or you are already clear.`);
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
        pendingAmount={pendingAmount > 0 ? pendingAmount : undefined}
      />
      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Total Pending (all)</Text>
              <Text style={[styles.cardValue, pendingAmount > 0 && styles.pendingText]}>
                {formatCurrency(pendingAmount)}
              </Text>
            </View>

            <View style={styles.dateCard}>
              <Text style={styles.dateCardLabel}>Pay up to date</Text>
              <Text style={styles.dateCardHint}>Select the date up to which you want to clear dues (e.g. 10 Feb). Amount below will be for milk & payments up to this date.</Text>
              <Input
                value={payUptoDate}
                onChangeText={setPayUptoDate}
                placeholder="YYYY-MM-DD"
                style={styles.dateInput}
              />
              <Text style={styles.pendingUptoText}>
                Pending up to {payUptoDate}: {formatCurrency(pendingUptoSelectedDate)}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Pay this amount</Text>
              <Text style={[styles.cardValue, amountToPay > 0 && styles.pendingText]}>
                {formatCurrency(amountToPay)}
              </Text>
            </View>

            {upiSettings.upiId && upiSettings.upiId.trim() && (
              <View style={styles.qrCard}>
                <Text style={styles.qrTitle}>Scan QR to pay</Text>
                <Text style={styles.qrSub}>Amount: {formatCurrency(amountToPay)}</Text>
                {upiSettings.qrImageBase64 && amountToPay > 0 ? (
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
              style={[styles.payButton, amountToPay <= 0 && styles.payButtonDisabled]}
              onPress={openPayViaUPI}
              disabled={amountToPay <= 0}
            >
              <Text style={styles.payButtonText}>
                Pay {amountToPay > 0 ? formatCurrency(amountToPay) : ''} via GPay / UPI
              </Text>
            </TouchableOpacity>

            <Text style={styles.note}>
              {upiSettings.upiId
                ? 'Choose "Pay up to date" to clear dues up to that date. Scan the QR or tap the button to open UPI with that amount. After paying, share the transaction reference to the farm.'
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
  dateCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  dateCardLabel: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8 },
  dateCardHint: { fontSize: 13, color: '#666', marginBottom: 12 },
  dateInput: { marginBottom: 12 },
  pendingUptoText: { fontSize: 15, fontWeight: '600', color: '#1565C0' },
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
