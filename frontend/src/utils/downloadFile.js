import { Platform, Alert } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import RNShare from 'react-native-share';
import { getAuthToken } from '../services/api/apiClient';

/**
 * Download authenticated file and open share sheet (save / open in app).
 */
export async function downloadAndShareFile({ url, filename, mimeType, title }) {
  const token = await getAuthToken();
  if (!token) {
    Alert.alert('Error', 'Please log in to download.');
    return;
  }

  const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
  const res = await ReactNativeBlobUtil.config({
    fileCache: true,
    path: cachePath,
    addAndroidDownloads: {
      useDownloadManager: true,
      notification: true,
      path: `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${filename}`,
    },
  }).fetch('GET', url, { Authorization: `Bearer ${token}` });

  const status = res.respInfo?.status ?? res.info?.()?.status;
  if (status != null && (status < 200 || status >= 300)) {
    let errMsg = `Download failed (${status}).`;
    try {
      const text = await (typeof res.text === 'function' ? res.text() : Promise.resolve(res.data));
      const body = typeof text === 'string' ? text : String(text);
      const parsed = body.startsWith('{') ? JSON.parse(body) : null;
      if (parsed?.error) errMsg = parsed.error;
      else if (parsed?.message) errMsg = parsed.message;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const path = res.path();
  if (!path || typeof path !== 'string') throw new Error('Download failed: no file received.');

  const pathWithScheme = path.startsWith('file://') ? path : `file://${path}`;
  const shareTitle = title || filename;
  const shareOptions = {
    type: mimeType,
    message: shareTitle,
    title: shareTitle,
    filename,
    failOnCancel: false,
  };

  if (Platform.OS === 'android') {
    const base64Data = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
    await RNShare.open({
      ...shareOptions,
      url: `data:${mimeType};base64,${base64Data}`,
      useInternalStorage: true,
    });
  } else {
    await RNShare.open({ ...shareOptions, url: pathWithScheme });
  }
}
