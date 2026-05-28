import { NativeModules, Platform } from 'react-native';

/**
 * Installed app version from Android build.gradle (versionCode / versionName).
 */
export function getInstalledVersionCode() {
  if (Platform.OS === 'android' && NativeModules.AppVersion?.versionCode != null) {
    return Number(NativeModules.AppVersion.versionCode) || 0;
  }
  return 0;
}

export function getInstalledVersionName() {
  if (Platform.OS === 'android' && NativeModules.AppVersion?.versionName) {
    return String(NativeModules.AppVersion.versionName);
  }
  return '0';
}
