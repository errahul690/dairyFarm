import { API_BASE_URL, apiClient } from '../api/apiClient';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform, Alert } from 'react-native';

/**
 * Public check — works without login.
 */
export async function checkForUpdate(installedVersionCode) {
  const url = `${API_BASE_URL}/app-release/check?platform=android&versionCode=${encodeURIComponent(
    String(installedVersionCode)
  )}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(json?.error || 'Update check failed');
  }
  return json;
}

export async function listReleases() {
  return apiClient.get('/app-release');
}

export async function uploadRelease({ uri, name, versionCode, versionName, releaseNotes, forceUpdate }) {
  const form = new FormData();
  form.append('apk', {
    uri,
    type: 'application/vnd.android.package-archive',
    name: name || `app-v${versionName}.apk`,
  });
  form.append('versionCode', String(versionCode));
  form.append('versionName', String(versionName));
  if (releaseNotes) form.append('releaseNotes', String(releaseNotes));
  form.append('forceUpdate', forceUpdate ? 'true' : 'false');
  return apiClient.uploadForm('/app-release', form);
}

/**
 * Download APK and open Android installer.
 */
export async function downloadAndInstallApk(downloadUrl, versionName, onProgress) {
  if (Platform.OS !== 'android') {
    throw new Error('In-app update is only supported on Android.');
  }

  const safeName = String(versionName || 'update').replace(/[^\w.-]+/g, '_');
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/hitech-dairy-${safeName}.apk`;

  const task = ReactNativeBlobUtil.config({
    fileCache: true,
    path,
  }).fetch('GET', downloadUrl);

  if (onProgress) {
    task.progress((received, total) => {
      const r = Number(received) || 0;
      const t = Number(total) || 0;
      if (t > 0) onProgress(Math.min(100, Math.round((r / t) * 100)));
    });
  }

  const res = await task;
  const filePath = res.path();
  await ReactNativeBlobUtil.android.actionViewIntent(
    filePath,
    'application/vnd.android.package-archive'
  );
  return filePath;
}

export function openUnknownSourcesHelp() {
  Alert.alert(
    'Install permission',
    'If install does not start, open Settings → Apps → HiTech Dairy Farm → Install unknown apps → Allow.'
  );
}
