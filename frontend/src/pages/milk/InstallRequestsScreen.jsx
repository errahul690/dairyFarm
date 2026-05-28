import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Linking, Image } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { milkService } from '../../services/milk/milkService';
import { formatDate } from '../../utils/dateUtils';

function formatLatLng(tx) {
  const lat = tx?.installRequest?.lat;
  const lng = tx?.installRequest?.lng;
  if (lat == null || lng == null) return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { lat: a, lng: b };
}

function staticMapUrl(lat, lng) {
  // OSM static map image (no API key)
  // Example: https://staticmap.openstreetmap.de/staticmap.php?center=LAT,LNG&zoom=16&size=600x300&markers=LAT,LNG,red-pushpin
  const center = `${lat},${lng}`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(center)}&zoom=16&size=600x300&markers=${encodeURIComponent(center)},red-pushpin`;
}

export default function InstallRequestsScreen({ onNavigate, onLogout }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await milkService.getInstallRequests();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to load install requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const total = useMemo(() => list.length, [list]);

  const openMaps = async (tx) => {
    const ll = formatLatLng(tx);
    const link = tx?.installRequest?.mapsLink ? String(tx.installRequest.mapsLink).trim() : '';
    const address = tx?.installRequest?.address ? String(tx.installRequest.address).trim() : '';
    const url = link || (ll ? `https://maps.google.com/?q=${ll.lat},${ll.lng}` : address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : '');
    if (!url) {
      Alert.alert('Maps', 'No location link / GPS / address found.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Maps', 'Could not open maps.');
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="Rahul Dairy Farm"
        subtitle={`Install Requests (${total})`}
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAuthenticated={true}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        >
          {list.length === 0 ? (
            <Text style={styles.emptyText}>No install/delivery requests yet.</Text>
          ) : (
            list.map((tx, idx) => {
              const ir = tx.installRequest || {};
              const ll = formatLatLng(tx);
              return (
                <View key={tx._id || idx} style={styles.card}>
                  <View style={styles.topRow}>
                    <Text style={styles.name}>{ir.name || tx.buyer || 'Customer'}</Text>
                    <Text style={styles.date}>{formatDate(tx.date)}</Text>
                  </View>
                  <Text style={styles.mobile}>📱 {ir.mobile || tx.buyerPhone || '—'}</Text>
                  {!!tx.milkSource && <Text style={styles.meta}>Milk: {String(tx.milkSource).toUpperCase()}</Text>}
                  {!!tx.quantity && <Text style={styles.meta}>Qty: {Number(tx.quantity).toFixed(2)} L</Text>}

                  {(ir.address || ir.landmark) ? (
                    <Text style={styles.address}>
                      📍 {ir.address || '—'}
                      {ir.landmark ? `\nLandmark: ${ir.landmark}` : ''}
                    </Text>
                  ) : null}

                  {ll ? (
                    <TouchableOpacity onPress={() => openMaps(tx)} activeOpacity={0.85} style={styles.mapPreviewWrap}>
                      <Image
                        source={{ uri: staticMapUrl(ll.lat, ll.lng) }}
                        style={styles.mapPreview}
                        resizeMode="cover"
                      />
                      <Text style={styles.mapPreviewHint}>Tap map to open</Text>
                    </TouchableOpacity>
                  ) : null}

                  {ll ? <Text style={styles.gps}>GPS: {ll.lat}, {ll.lng}</Text> : null}
                  {ir.mapsLink ? <Text style={styles.link}>Link: {String(ir.mapsLink).trim()}</Text> : null}
                  {tx.notes ? <Text style={styles.notes}>Notes: {String(tx.notes)}</Text> : null}

                  <TouchableOpacity style={styles.mapsBtn} onPress={() => openMaps(tx)} activeOpacity={0.8}>
                    <Text style={styles.mapsBtnText}>Open in Maps</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  content: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#556d73' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24, fontSize: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontSize: 16, fontWeight: '800', color: '#263238', flex: 1, paddingRight: 12 },
  date: { fontSize: 12, color: '#607d8b', fontWeight: '700' },
  mobile: { marginTop: 6, fontSize: 14, color: '#37474f', fontWeight: '700' },
  meta: { marginTop: 4, fontSize: 13, color: '#455a64', fontWeight: '600' },
  address: { marginTop: 8, fontSize: 13, color: '#263238', lineHeight: 18 },
  gps: { marginTop: 6, fontSize: 12, color: '#546e7a', fontWeight: '700' },
  link: { marginTop: 6, fontSize: 12, color: '#1565c0', fontWeight: '700' },
  notes: { marginTop: 6, fontSize: 12, color: '#546e7a' },
  mapPreviewWrap: { marginTop: 10, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e0e0' },
  mapPreview: { width: '100%', height: 160, backgroundColor: '#f0f0f0' },
  mapPreviewHint: { position: 'absolute', bottom: 8, right: 10, color: '#fff', fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, overflow: 'hidden', fontSize: 12 },
  mapsBtn: { marginTop: 10, backgroundColor: '#4CAF50', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  mapsBtnText: { color: '#fff', fontWeight: '900' },
});

