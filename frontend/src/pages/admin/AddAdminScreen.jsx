import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Dropdown from '../../components/common/Dropdown';
import { authService } from '../../services/auth/authService';

/**
 * Add Admin Screen
 * Only admin/super_admin can add new admin
 */
export default function AddAdminScreen({ onNavigate, onLogout }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      const user = await authService.getCurrentUser();
      const r = Number(user?.role);
      if (r !== 0 && r !== 1) {
        onNavigate?.('Dashboard');
      }
    };
    check();
  }, [onNavigate]);

  const handleMobileChange = (text) => {
    const numericText = text.replace(/[^0-9]/g, '');
    if (numericText.length <= 10) setMobile(numericText);
  };

  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ];

  const onSubmit = async () => {
    if (!name || !password || !mobile) {
      Alert.alert('Error', 'Name, Mobile and Password are required');
      return;
    }
    if (!/^[0-9]{10}$/.test(mobile.trim())) {
      Alert.alert('Error', 'Mobile must be exactly 10 digits');
      return;
    }
    // Email validation - if provided, must contain @
    if (email && email.trim() && !email.trim().includes('@')) {
      Alert.alert('Error', 'Email must contain @ symbol');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      await authService.signup(
        name.trim(),
        (email ?? '').toString().trim() || '',
        password,
        mobile.trim(),
        gender || undefined,
        address.trim() || undefined,
        undefined, // milkFixedPrice - not needed for admin
        undefined, // dailyMilkQuantity - not needed for admin
        1 // role = Admin
      );
      Alert.alert('Success', 'Admin added successfully');
      setName('');
      setEmail('');
      setMobile('');
      setPassword('');
      setConfirmPassword('');
      setGender('');
      setAddress('');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to add admin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="Add Admin"
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAuthenticated
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Input placeholder="Full Name *" value={name} onChangeText={setName} style={styles.input} />
        <Input
          placeholder="Email (Optional)"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <Input
          placeholder="Mobile Number *"
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={handleMobileChange}
          maxLength={10}
          style={styles.input}
        />
        <Input
          placeholder="Password *"
          secureTextEntry
          showPasswordToggle
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />
        <Input
          placeholder="Confirm Password *"
          secureTextEntry
          showPasswordToggle
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          style={styles.input}
        />
        <Dropdown
          options={genderOptions}
          selectedValue={gender}
          onSelect={setGender}
          placeholder="Gender (Optional)"
          style={styles.input}
        />
        <Input
          placeholder="Address (Optional)"
          multiline
          numberOfLines={3}
          value={address}
          onChangeText={setAddress}
          style={styles.addressInput}
        />
        <Button title={loading ? 'Adding...' : 'Add Admin'} onPress={onSubmit} disabled={loading} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20 },
  input: { marginBottom: 12 },
  addressInput: { minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
});
