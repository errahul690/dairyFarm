import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Dropdown from '../../components/common/Dropdown';
import { authService } from '../../services/auth/authService';

/**
 * Signup Screen
 * User registration - Signup functionality
 */
export default function SignupScreen({ onNavigate }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle mobile number input - only allow numbers
  const handleMobileChange = (text) => {
    // Remove all non-numeric characters
    const numericText = text.replace(/[^0-9]/g, '');
    // Limit to 10 digits
    if (numericText.length <= 10) {
      setMobile(numericText);
    }
  };


  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ];

  const onSignup = async () => {
    if (!name || !password || !mobile) {
      Alert.alert('Error', 'Please fill all required fields (Name, Mobile, Password)');
      return;
    }
    
    // Validate mobile number
    if (!/^[0-9]{10}$/.test(mobile.trim())) {
      Alert.alert('Error', 'Mobile number must be exactly 10 digits');
      return;
    }

    // Email validation - if provided, must contain @
    if (email && email.trim() && !email.trim().includes('@')) {
      Alert.alert('Error', 'Email must contain @ symbol');
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    // Validate address if provided
    if (address && address.trim().length > 0 && address.trim().length < 2) {
      Alert.alert('Error', 'Address must be at least 2 characters if provided');
      return;
    }

    try {
      setLoading(true);
      await authService.signup(
        name.trim(),
        email.trim(),
        password,
        mobile.trim(),
        gender || undefined,
        address.trim() || undefined
      );
      Alert.alert('Success', 'Account created. Please login.');
      onNavigate?.('Login/Signup');
    } catch (e) {
      Alert.alert('Signup failed', e?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    onNavigate?.('Login/Signup');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HiTech Dairy Farm</Text>
        <Text style={styles.headerSubtitle}>Signup</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Signup</Text>
        
        <Input 
          placeholder="Full Name *" 
          value={name} 
          onChangeText={setName} 
          style={styles.input} 
        />
        
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
          placeholder="Set Password *"
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
          placeholder="Select Gender"
          style={styles.input}
        />
        
        <Input
          placeholder="Address"
          multiline
          numberOfLines={3}
          value={address}
          onChangeText={setAddress}
          style={styles.addressInput}
        />
        
        <Button 
          title={loading ? 'Creating...' : 'Create Account'} 
          onPress={onSignup} 
          disabled={loading} 
        />
        <View style={{ height: 16 }} />
        <Button title="Back to Login" onPress={goToLogin} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#4CAF50',
    padding: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E8F5E9',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  addressInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
});

