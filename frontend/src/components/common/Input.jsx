import React, { useState } from 'react';
import { TextInput, StyleSheet, View, TouchableOpacity, Text } from 'react-native';

/**
 * Common Input Component
 * Reusable text input component with optional password visibility toggle
 */
export default function Input({ style, showPasswordToggle, secureTextEntry, ...props }) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  if (showPasswordToggle && secureTextEntry) {
    return (
      <View style={[styles.inputContainer, style]}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          secureTextEntry={!isPasswordVisible}
          placeholderTextColor="#999999"
          {...props}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setIsPasswordVisible(!isPasswordVisible)}
        >
          <Text style={styles.eyeIcon}>{isPasswordVisible ? '👁️' : '👁️‍🗨️'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TextInput 
      style={[styles.input, style]} 
      secureTextEntry={secureTextEntry} 
      placeholderTextColor="#999999"
      {...props} 
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    flex: 1,
    backgroundColor: '#FFFFFF',
    color: '#000000',
    minHeight: 48,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingRight: 12,
    backgroundColor: '#FFFFFF',
    minHeight: 48,
  },
  eyeButton: {
    padding: 8,
  },
  eyeIcon: {
    fontSize: 20,
  },
});

