import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth/authService';
import { settingsService } from '../../services/settings/settingsService';
import { listReleases, uploadRelease } from '../../services/appRelease/appReleaseService';
import { getInstalledVersionCode, getInstalledVersionName } from '../../utils/nativeAppVersion';

/**
 * Settings Screen (Admin)
 * UPI + publish APK for in-app updates
 */
export default function SettingsScreen({ onNavigate, onLogout }) {
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [releases, setReleases] = useState([]);
  const [releaseVersionCode, setReleaseVersionCode] = useState('');
  const [releaseVersionName, setReleaseVersionName] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [apkFile, setApkFile] = useState(null);
  const [uploadingApk, setUploadingApk] = useState(false);

  useEffect(() => {
    const check = async () => {
      const user = await authService.getCurrentUser();
      const r = Number(user?.role);
      if (r !== 0 && r !== 1) {
        onNavigate?.('Dashboard');
        return;
      }
      loadUpi();
      loadReleases();
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

  const loadReleases = async () => {
    try {
      const list = await listReleases();
      setReleases(Array.isArray(list) ? list : []);
    } catch {
      setReleases([]);
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

  const onPickApk = async () => {
    try {
      const picked = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });
      const name = (picked.name || '').toLowerCase();
      if (!name.endsWith('.apk')) {
        Alert.alert('Invalid file', 'Please select an .apk file.');
        return;
      }
      setApkFile(picked);
    } catch (e) {
      if (DocumentPicker.isCancel(e)) return;
      Alert.alert('Error', e?.message || 'Could not pick file');
    }
  };

  const onUploadApk = async () => {
    const code = Number(releaseVersionCode);
    const vName = releaseVersionName.trim();
    if (!apkFile?.uri) {
      Alert.alert('APK required', 'Select the release APK file first.');
      return;
    }
    if (!Number.isFinite(code) || code < 1) {
      Alert.alert('Version code', 'Enter versionCode (integer). Must be higher than installed on phones.');
      return;
    }
    if (!vName) {
      Alert.alert('Version name', 'Enter versionName (e.g. 1.2).');
      return;
    }
    if (code <= getInstalledVersionCode()) {
      Alert.alert(
        'Version code',
        `This build is ${getInstalledVersionCode()} on your phone. New APK versionCode must be greater (e.g. ${getInstalledVersionCode() + 1}).`
      );
      return;
    }
    try {
      setUploadingApk(true);
      await uploadRelease({
        uri: apkFile.fileCopyUri || apkFile.uri,
        name: apkFile.name,
        versionCode: code,
        versionName: vName,
        releaseNotes: releaseNotes.trim(),
        forceUpdate,
      });
      Alert.alert(
        'Published',
        'APK saved on server. Users with older version will see update popup when they open the app.'
      );
      setApkFile(null);
      setReleaseNotes('');
      await loadReleases();
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'Could not upload APK');
    } finally {
      setUploadingApk(false);
    }
  };

  const active = releases.find((r) => r.isActive);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="Settings"
        subtitle="UPI & app updates"
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

        {Platform.OS === 'android' && (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>App update (APK on server)</Text>
            <Text style={styles.hint}>
              Installed on this device: v{getInstalledVersionName()} (code {getInstalledVersionCode()}).{'\n'}
              After each new release: bump versionCode in android/app/build.gradle, build a universal APK (or arm64), upload here.
              Users get Download & update popup on app open — no manual APK sharing.
            </Text>
            {active ? (
              <Text style={styles.activeLine}>
                Live on server: v{active.versionName} (code {active.versionCode})
                {active.forceUpdate ? ' · forced' : ''}
              </Text>
            ) : (
              <Text style={styles.activeLine}>No APK published yet.</Text>
            )}
            <Text style={styles.label}>New version code (integer)</Text>
            <Input
              placeholder={`e.g. ${getInstalledVersionCode() + 1}`}
              value={releaseVersionCode}
              onChangeText={setReleaseVersionCode}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Text style={styles.label}>New version name</Text>
            <Input
              placeholder="e.g. 1.1"
              value={releaseVersionName}
              onChangeText={setReleaseVersionName}
              style={styles.input}
            />
            <Text style={styles.label}>Release notes (shown in popup)</Text>
            <Input
              placeholder="Bug fixes, new features..."
              value={releaseNotes}
              onChangeText={setReleaseNotes}
              multiline
              style={styles.input}
            />
            <Button
              title={apkFile ? `APK: ${apkFile.name}` : 'Select APK file'}
              onPress={onPickApk}
              disabled={uploadingApk}
            />
            <View style={styles.gap} />
            <Text style={styles.label}>
              Force update (hide &quot;Later&quot; button): {forceUpdate ? 'Yes' : 'No'}
            </Text>
            <Button
              title={forceUpdate ? 'Turn off force update' : 'Turn on force update'}
              onPress={() => setForceUpdate((v) => !v)}
              disabled={uploadingApk}
            />
            <View style={styles.gap} />
            <Button
              title={uploadingApk ? 'Uploading…' : 'Publish APK to server'}
              onPress={() => {
                Alert.alert('Publish update?', 'Users on older version will see update popup on next app open.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Publish', onPress: onUploadApk },
                ]);
              }}
              disabled={uploadingApk}
            />
            {releases.length > 0 && (
              <Text style={styles.historyTitle}>Recent uploads</Text>
            )}
            {releases.slice(0, 5).map((r) => (
              <Text key={r._id} style={styles.historyRow}>
                v{r.versionName} ({r.versionCode}){r.isActive ? ' · live' : ''}
              </Text>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  sectionGap: { marginTop: 28 },
  hint: { fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: { marginBottom: 16 },
  activeLine: { fontSize: 13, fontWeight: '700', color: '#2e7d32', marginBottom: 12 },
  gap: { height: 8 },
  historyTitle: { marginTop: 16, fontSize: 14, fontWeight: '700', color: '#555' },
  historyRow: { fontSize: 12, color: '#666', marginTop: 4 },
});
