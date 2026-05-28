import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  downloadAndInstallApk,
  openUnknownSourcesHelp,
} from '../services/appRelease/appReleaseService';

export default function AppUpdateModal({ visible, updateInfo, onLater }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const latest = updateInfo?.latest;
  const force = !!latest?.forceUpdate;

  const handleUpdate = async () => {
    if (!latest?.downloadUrl) return;
    try {
      setError(null);
      setDownloading(true);
      setProgress(0);
      await downloadAndInstallApk(latest.downloadUrl, latest.versionName, setProgress);
    } catch (e) {
      setError(e?.message || 'Download failed');
      openUnknownSourcesHelp();
    } finally {
      setDownloading(false);
    }
  };

  if (Platform.OS !== 'android') return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={force ? undefined : onLater}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>App update available</Text>
          <Text style={styles.version}>
            New version {latest?.versionName || ''} (build {latest?.versionCode})
          </Text>
          {!!latest?.releaseNotes && (
            <Text style={styles.notes}>{latest.releaseNotes}</Text>
          )}
          <Text style={styles.hint}>
            Download will start. After download, tap Install when Android asks.
          </Text>
          {downloading && (
            <View style={styles.progressRow}>
              <ActivityIndicator color="#2e7d32" />
              <Text style={styles.progressText}>
                Downloading… {progress > 0 ? `${progress}%` : ''}
              </Text>
            </View>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            {!force && (
              <TouchableOpacity
                style={[styles.btn, styles.btnLater]}
                onPress={onLater}
                disabled={downloading}
              >
                <Text style={styles.btnLaterText}>Later</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnUpdate, force && styles.btnUpdateFull]}
              onPress={handleUpdate}
              disabled={downloading}
            >
              <Text style={styles.btnUpdateText}>{downloading ? 'Please wait…' : 'Download & update'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#1b5e20', marginBottom: 8 },
  version: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 8 },
  notes: { fontSize: 13, color: '#555', marginBottom: 10, lineHeight: 18 },
  hint: { fontSize: 12, color: '#777', marginBottom: 12, lineHeight: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  progressText: { fontSize: 13, color: '#2e7d32' },
  error: { fontSize: 12, color: '#c62828', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnLater: { backgroundColor: '#eee' },
  btnLaterText: { color: '#555', fontWeight: '700' },
  btnUpdate: { backgroundColor: '#4CAF50' },
  btnUpdateFull: { flex: 1 },
  btnUpdateText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
