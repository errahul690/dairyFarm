import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth/authService';
import { settingsService } from '../../services/settings/settingsService';

/**
 * Settings Screen (Admin)
 * Configure UPI ID for buyer payment QR / Pay link
 */
export default function SettingsScreen({ onNavigate, onLogout }) {
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const check = async () => {
      const user = await authService.getCurrentUser();
      const r = Number(user?.role);
      if (r !== 0 && r !== 1) {
        onNavigate?.('Dashboard');
        return;
      }
      loadUpi();
    };
    check();
  }, [onNavigate]);

  const loadUpi = async () => {
    try {
      setLoading(true);
      const s = await settingsService.getUpi();
      setUpiId(s.upiId || '');
      setUpiName(s.upiName || 'Farm');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const onSave = async () => {
    try {
      setSaving(true);
      await settingsService.updateUpi({ upiId: upiId.trim(), upiName: upiName.trim() || 'Farm' });
      Alert.alert('Success', 'UPI settings saved. Buyers will see this ID on the payment screen and QR.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="Settings"
        subtitle="UPI for payments"
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAuthenticated
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Payment UPI (for Buyer Pay / QR)</Text>
        <Text style={styles.hint}>
          Set your farm UPI ID and name. Buyers will see a QR code and Pay button on the Pending Payment screen.
        </Text>
        <Text style={styles.label}>UPI ID</Text>
        <Input
          placeholder="e.g. yournumber@ybl or name@paytm"
          value={upiId}
          onChangeText={setUpiId}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.label}>UPI Name (shown to buyer)</Text>
        <Input
          placeholder="e.g. HiTech Dairy Farm"
          value={upiName}
          onChangeText={setUpiName}
          style={styles.input}
        />
        <Button
          title={saving ? 'Saving...' : 'Save UPI Settings'}
          onPress={onSave}
          disabled={saving || loading}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  hint: { fontSize: 13, color: '#666', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: { marginBottom: 16 },
});
