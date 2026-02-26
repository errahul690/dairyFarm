import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth/authService';

const isValidMobile = (v) => /^[0-9]{10}$/.test((v || '').replace(/\D/g, ''));

/**
 * Login Screen
 * User authentication - Password login + OTP login (same OTP flow as Forgot Password)
 */
export default function LoginScreen({ onNavigate, onLoginSuccess }) {
  const [loginMode, setLoginMode] = useState('password'); // 'password' | 'otp'
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const mobileOnly = (loginMode === 'otp' ? (emailOrMobile || '').replace(/\D/g, '').slice(0, 10) : '');

  const onLogin = async () => {
    if (!emailOrMobile || !password) {
      Alert.alert('Error', 'Please enter email/mobile and password');
      return;
    }
    try {
      setLoading(true);
      const user = await authService.login(emailOrMobile.trim(), password);
      if (onLoginSuccess) onLoginSuccess();
      else onNavigate('Dashboard');
    } catch (e) {
      console.error('[LoginScreen] Login error:', e);
      Alert.alert('Login failed', e?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const onSendOtp = async () => {
    const mobile = (emailOrMobile || '').replace(/\D/g, '').slice(0, 10);
    if (!isValidMobile(mobile)) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    try {
      setLoading(true);
      const result = await authService.sendOtpForLogin(mobile);
      const msg = (result && result.message) ? String(result.message) : '';
      const success = /otp has been sent|otp sent/i.test(msg);
      if (success) {
        setOtpSent(true);
        Alert.alert('OTP Sent', 'Enter the 4-digit OTP sent to your mobile.');
      } else {
        Alert.alert('Error', msg || 'Failed to send OTP. This mobile may not be registered.');
      }
    } catch (e) {
      const errMsg = e?.response?.data?.error || e?.message || 'Failed to send OTP.';
      Alert.alert('Error', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    const mobile = (emailOrMobile || '').replace(/\D/g, '').slice(0, 10);
    if (!isValidMobile(mobile)) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (!otp || otp.trim().length !== 4) {
      Alert.alert('Error', 'Please enter the 4-digit OTP');
      return;
    }
    try {
      setLoading(true);
      await authService.loginWithOtp(mobile, otp.trim());
      if (onLoginSuccess) onLoginSuccess();
      else onNavigate('Dashboard');
    } catch (e) {
      const errMsg = e?.response?.data?.message || e?.message || 'Invalid OTP. Please try again.';
      Alert.alert('Login failed', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setLoginMode((m) => (m === 'password' ? 'otp' : 'password'));
    setOtpSent(false);
    setOtp('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HiTech Dairy Farm</Text>
        <Text style={styles.headerSubtitle}>Login</Text>
      </View>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Login</Text>

        <Input
          placeholder={loginMode === 'otp' ? '10-digit Mobile Number' : 'Email or Mobile Number'}
          autoCapitalize="none"
          keyboardType={loginMode === 'otp' ? 'phone-pad' : 'default'}
          value={loginMode === 'otp' ? mobileOnly : emailOrMobile}
          onChangeText={(t) => (loginMode === 'otp' ? setEmailOrMobile(t.replace(/\D/g, '')) : setEmailOrMobile(t))}
          style={styles.input}
          maxLength={loginMode === 'otp' ? 10 : undefined}
          editable={!otpSent}
        />

        {loginMode === 'password' && (
          <>
            <Input
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            <Button title={loading ? 'Logging in...' : 'Login'} onPress={onLogin} disabled={loading} />
          </>
        )}

        {loginMode === 'otp' && (
          <>
            {!otpSent ? (
              <Button title={loading ? 'Sending OTP...' : 'Send OTP'} onPress={onSendOtp} disabled={loading || mobileOnly.length !== 10} />
            ) : (
              <>
                <Input
                  placeholder="Enter 4-digit OTP"
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 4))}
                  style={styles.input}
                  maxLength={4}
                />
                <Button title={loading ? 'Verifying...' : 'Verify OTP & Login'} onPress={onVerifyOtp} disabled={loading || otp.length !== 4} />
                <TouchableOpacity onPress={onSendOtp} disabled={loading} style={styles.resendOtp}>
                  <Text style={styles.linkText}>Resend OTP</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <View style={{ height: 16 }} />
        <TouchableOpacity onPress={() => onNavigate('ForgotPassword')} style={styles.forgotPasswordLink}>
          <Text style={styles.linkText}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={switchMode} style={styles.useOtpLink}>
          <Text style={styles.linkText}>
            {loginMode === 'password' ? 'Use OTP instead' : 'Use password instead'}
          </Text>
        </TouchableOpacity>
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
    marginBottom: 16,
    color: '#000000',
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  forgotPasswordLink: {
    alignItems: 'center',
    marginVertical: 8,
  },
  useOtpLink: {
    alignItems: 'center',
    marginVertical: 8,
  },
  linkText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  resendOtp: {
    alignItems: 'center',
    marginTop: 12,
  },
});

