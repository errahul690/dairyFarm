import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth/authService';

/**
 * Forgot Password Screen
 * Step 1: Enter email or mobile to receive 4-digit OTP
 * Step 2: Enter OTP and new password (OTP sent to registered email or mobile)
 * Master OTP is not shown or used on frontend.
 */
export default function ForgotPasswordScreen({ onNavigate }) {
  const [step, setStep] = useState(1); // 1: Request OTP, 2: Reset Password
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
  const isValidMobile = (v) => /^[0-9]{10}$/.test((v || '').trim());

  const handleRequestOTP = async () => {
    const value = emailOrMobile.trim();
    if (!value) {
      Alert.alert('Error', 'Please enter your email or mobile number');
      return;
    }
    if (!isValidEmail(value) && !isValidMobile(value)) {
      Alert.alert('Error', 'Please enter a valid email or 10-digit mobile number');
      return;
    }

    try {
      setLoading(true);
      const result = await authService.forgotPassword(value);
      // Only show success when backend actually sent OTP (has "otp" / "sent" in message)
      const serverMsg = (result && result.message) ? String(result.message) : '';
      const isRealSuccess = /otp has been sent|otp sent/i.test(serverMsg);
      if (isRealSuccess) {
        Alert.alert(
          'OTP Sent',
          'A 4-digit OTP has been sent to your registered email or mobile. Please check and enter it below.',
          [{ text: 'OK', onPress: () => setStep(2) }]
        );
      } else {
        // Backend returned 200 but with generic/no OTP message (e.g. user not found in old API)
        Alert.alert('Error', serverMsg || 'User not found. This email or mobile is not registered.');
      }
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Failed to send OTP. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const value = emailOrMobile.trim();
    if (!value || !otp.trim() || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    if (otp.trim().length !== 4) {
      Alert.alert('Error', 'OTP must be 4 digits');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      await authService.resetPassword(value, otp.trim(), newPassword);
      Alert.alert(
        'Success',
        'Password reset successful! Please login with your new password.',
        [
          {
            text: 'OK',
            onPress: () => {
              setStep(1);
              setEmailOrMobile('');
              setOtp('');
              setNewPassword('');
              setConfirmPassword('');
              onNavigate('Login');
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      onNavigate('Login');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HiTech Dairy Farm</Text>
        <Text style={styles.headerSubtitle}>Forgot Password</Text>
      </View>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>
          {step === 1 ? 'Request OTP' : 'Reset Password'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 1
            ? 'Enter your registered email or mobile number to receive a 4-digit OTP'
            : 'Enter the 4-digit OTP sent to your email or mobile and set a new password'}
        </Text>

        {step === 1 ? (
          <>
            <Input
              placeholder="Email or Mobile (10 digits)"
              autoCapitalize="none"
              keyboardType="email-address"
              value={emailOrMobile}
              onChangeText={setEmailOrMobile}
              style={styles.input}
            />
            <Button
              title={loading ? 'Sending OTP...' : 'Send OTP'}
              onPress={handleRequestOTP}
              disabled={loading}
            />
          </>
        ) : (
          <>
            <Input
              placeholder="Email or Mobile"
              autoCapitalize="none"
              value={emailOrMobile}
              editable={false}
              style={[styles.input, styles.disabledInput]}
            />
            <Input
              placeholder="Enter 4-digit OTP"
              keyboardType="number-pad"
              maxLength={4}
              value={otp}
              onChangeText={setOtp}
              style={styles.input}
            />
            <Input
              placeholder="New Password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              style={styles.input}
            />
            <Input
              placeholder="Confirm New Password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.input}
            />
            <Button
              title={loading ? 'Resetting Password...' : 'Reset Password'}
              onPress={handleResetPassword}
              disabled={loading}
            />
            <TouchableOpacity
              style={styles.resendLink}
              onPress={async () => {
                const value = emailOrMobile.trim();
                if (!value) return;
                try {
                  setLoading(true);
                  await authService.resendOtp(value);
                  Alert.alert('Done', 'OTP resend successfully. Check your mobile.');
                } catch (e) {
                  Alert.alert('Error', e?.response?.data?.error || e?.message || 'Resend failed.');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              <Text style={styles.resendLinkText}>Resend OTP</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.footer}>
          <TouchableOpacity onPress={goBack}>
            <Text style={styles.backLink}>
              {step === 1 ? '← Back to Login' : '← Back'}
            </Text>
          </TouchableOpacity>
        </View>
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
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
  },
  disabledInput: {
    backgroundColor: '#e0e0e0',
    opacity: 0.7,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  backLink: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  resendLink: {
    marginTop: 12,
    alignSelf: 'center',
  },
  resendLinkText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
});

