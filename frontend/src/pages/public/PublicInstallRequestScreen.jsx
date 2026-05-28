import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, PermissionsAndroid, Platform } from 'react-native';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { milkService } from '../../services/milk/milkService';
import { MILK_SOURCE_TYPES } from '../../constants';
import Geolocation from 'react-native-geolocation-service';
import MapPickerModal from '../../components/common/MapPickerModal';

export default function PublicInstallRequestScreen({ onNavigate }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [milkSource, setMilkSource] = useState('cow');
  const [quantity, setQuantity] = useState('1');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const normalizedMobile = useMemo(() => String(mobile || '').replace(/\D/g, '').slice(0, 10), [mobile]);

  const reverseGeocodeToAddress = async (latVal, lngVal) => {
    // Use OpenStreetMap Nominatim reverse geocoding (no API key).
    // Note: Rate-limited; good for small usage.
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      String(latVal)
    )}&lon=${encodeURIComponent(String(lngVal))}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Some providers require a UA; harmless if ignored.
        'User-Agent': 'RahulDairyFarmApp/1.0',
      },
    });
    const json = await res.json().catch(() => null);
    const display = json?.display_name ? String(json.display_name) : '';
    return display || '';
  };

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const granted = await PermissionsAndroid.request(fine, {
      title: 'Location permission',
      message: 'We need your location to auto-fill your delivery address.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const useCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      const ok = await requestLocationPermission();
      if (!ok) {
        Alert.alert('Location', 'Permission denied. You can paste Google Maps link or enter address manually.');
        return;
      }

      const pos = await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
      });

      const latVal = pos?.coords?.latitude;
      const lngVal = pos?.coords?.longitude;
      if (latVal == null || lngVal == null) {
        Alert.alert('Location', 'Could not read GPS coordinates.');
        return;
      }

      const latStr = String(latVal);
      const lngStr = String(lngVal);
      setLat(latStr);
      setLng(lngStr);

      const gLink = `https://maps.google.com/?q=${encodeURIComponent(latStr)},${encodeURIComponent(lngStr)}`;
      setMapsLink((prev) => (prev && prev.trim() ? prev : gLink));

      // Auto fill address (only if empty or too short)
      if (!address || address.trim().length < 5) {
        const addr = await reverseGeocodeToAddress(latVal, lngVal).catch(() => '');
        if (addr) setAddress(addr);
      }
    } catch (e) {
      Alert.alert('Location', e?.message || 'Failed to get current location.');
    } finally {
      setLocationLoading(false);
    }
  };

  const applyLatLng = async (latVal, lngVal) => {
    const latStr = String(latVal);
    const lngStr = String(lngVal);
    setLat(latStr);
    setLng(lngStr);
    const gLink = `https://maps.google.com/?q=${encodeURIComponent(latStr)},${encodeURIComponent(lngStr)}`;
    setMapsLink((prev) => (prev && prev.trim() ? prev : gLink));

    if (!address || address.trim().length < 5) {
      const addr = await reverseGeocodeToAddress(latVal, lngVal).catch(() => '');
      if (addr) setAddress(addr);
    }
  };

  const submit = async () => {
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert('Error', 'Enter your name');
      return;
    }
    if (!/^[0-9]{10}$/.test(normalizedMobile)) {
      Alert.alert('Error', 'Enter valid 10-digit mobile number');
      return;
    }
    if (!address.trim() || address.trim().length < 5) {
      Alert.alert('Error', 'Enter delivery address');
      return;
    }
    const q = parseFloat(quantity);
    if (isNaN(q) || q <= 0) {
      Alert.alert('Error', 'Enter valid quantity (liters)');
      return;
    }

    const latNum = lat.trim() ? Number(lat) : null;
    const lngNum = lng.trim() ? Number(lng) : null;
    if ((latNum != null && !Number.isFinite(latNum)) || (lngNum != null && !Number.isFinite(lngNum))) {
      Alert.alert('Error', 'Lat/Lng must be numbers (optional)');
      return;
    }
    if ((latNum != null) !== (lngNum != null)) {
      Alert.alert('Error', 'Enter both Latitude and Longitude (or keep both empty)');
      return;
    }

    try {
      setLoading(true);
      await milkService.submitInstallRequest({
        name: name.trim(),
        mobile: normalizedMobile,
        address: address.trim(),
        landmark: landmark.trim(),
        notes: notes.trim(),
        mapsLink: mapsLink.trim(),
        milkSource,
        quantity: q,
        lat: latNum,
        lng: lngNum,
      });
      Alert.alert('Done', 'Request submitted. Our admin will contact you soon.', [
        { text: 'OK', onPress: () => onNavigate('Login/Signup') },
      ]);
      setName('');
      setMobile('');
      setAddress('');
      setLandmark('');
      setNotes('');
      setMapsLink('');
      setQuantity('1');
      setLat('');
      setLng('');
      setMilkSource('cow');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rahul Dairy Farm</Text>
        <Text style={styles.headerSubtitle}>Milk Delivery / Install Request</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Request Milk Delivery</Text>
        <Text style={styles.hint}>
          Fill details so admin can see where milk is needed. If you have Google Maps link, paste it for exact location.
        </Text>

        <Input placeholder="Your Name *" value={name} onChangeText={setName} style={styles.input} />
        <Input
          placeholder="Mobile (10 digits) *"
          keyboardType="phone-pad"
          value={normalizedMobile}
          onChangeText={setMobile}
          maxLength={10}
          style={styles.input}
        />

        <Text style={styles.label}>Milk type</Text>
        <View style={styles.milkSourceRow}>
          {MILK_SOURCE_TYPES.map((src) => {
            const active = milkSource === src.value;
            return (
              <TouchableOpacity
                key={src.value}
                style={[styles.milkChip, active && styles.milkChipActive]}
                onPress={() => setMilkSource(src.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.milkChipText, active && styles.milkChipTextActive]}>{src.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input
          placeholder="Quantity (liters) *"
          keyboardType="decimal-pad"
          value={quantity}
          onChangeText={setQuantity}
          style={styles.input}
        />

        <Input
          placeholder="Full Address *"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={3}
          style={styles.addressInput}
        />
        <TouchableOpacity
          style={[styles.locationBtn, locationLoading && styles.locationBtnDisabled]}
          onPress={useCurrentLocation}
          disabled={locationLoading || loading}
          activeOpacity={0.8}
        >
          <Text style={styles.locationBtnText}>{locationLoading ? 'Getting location...' : 'Use current location (auto address)'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pickOnMapBtn}
          onPress={() => setMapOpen(true)}
          disabled={loading || locationLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.pickOnMapBtnText}>Pick location on map (drop pin)</Text>
        </TouchableOpacity>
        <Input placeholder="Landmark (optional)" value={landmark} onChangeText={setLandmark} style={styles.input} />
        <Input placeholder="Google Maps link (optional)" value={mapsLink} onChangeText={setMapsLink} style={styles.input} />

        <View style={styles.latLngRow}>
          <View style={{ flex: 1 }}>
            <Input placeholder="Latitude (optional)" keyboardType="decimal-pad" value={lat} onChangeText={setLat} style={styles.inputInline} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Input placeholder="Longitude (optional)" keyboardType="decimal-pad" value={lng} onChangeText={setLng} style={styles.inputInline} />
          </View>
        </View>

        <Input placeholder="Notes (optional)" value={notes} onChangeText={setNotes} style={styles.input} />

        <Button title={loading ? 'Submitting...' : 'Submit Request'} onPress={submit} disabled={loading} />
        <View style={{ height: 12 }} />
        <Button title="Back to Login" onPress={() => onNavigate('Login/Signup')} />
      </ScrollView>

      <MapPickerModal
        visible={mapOpen}
        title="Select delivery location"
        initialLat={lat.trim() ? Number(lat) : undefined}
        initialLng={lng.trim() ? Number(lng) : undefined}
        onClose={() => setMapOpen(false)}
        onConfirm={async ({ lat: a, lng: b }) => {
          setMapOpen(false);
          try {
            setLocationLoading(true);
            await applyLatLng(a, b);
          } finally {
            setLocationLoading(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#4CAF50', padding: 20, paddingTop: 50, paddingBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  headerSubtitle: { fontSize: 14, color: '#E8F5E9', fontWeight: '700' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8, color: '#000' },
  hint: { fontSize: 13, color: '#666', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8 },
  input: { marginBottom: 12, backgroundColor: '#fff' },
  addressInput: { minHeight: 90, textAlignVertical: 'top', marginBottom: 12, backgroundColor: '#fff' },
  milkSourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  milkChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' },
  milkChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  milkChipText: { fontSize: 14, fontWeight: '700', color: '#555' },
  milkChipTextActive: { color: '#fff' },
  latLngRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  inputInline: { marginBottom: 0, backgroundColor: '#fff' },
  locationBtn: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#90CAF9',
    alignItems: 'center',
  },
  locationBtnDisabled: { opacity: 0.6 },
  locationBtnText: { color: '#1565C0', fontWeight: '900' },
  pickOnMapBtn: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFCC80',
    alignItems: 'center',
  },
  pickOnMapBtnText: { color: '#E65100', fontWeight: '900' },
});

