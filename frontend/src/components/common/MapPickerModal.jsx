import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Platform } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';

const { width } = Dimensions.get('window');

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

export default function MapPickerModal({
  visible,
  title = 'Select location',
  initialLat,
  initialLng,
  onClose,
  onConfirm,
}) {
  const initial = useMemo(() => {
    const lat = initialLat != null ? Number(initialLat) : 20.5937; // India center default
    const lng = initialLng != null ? Number(initialLng) : 78.9629;
    return {
      latitude: clamp(lat, -90, 90),
      longitude: clamp(lng, -180, 180),
    };
  }, [initialLat, initialLng]);

  const [coord, setCoord] = useState(initial);

  const region = useMemo(
    () => ({
      latitude: coord.latitude,
      longitude: coord.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }),
    [coord]
  );

  const confirm = () => {
    onConfirm?.({ lat: coord.latitude, lng: coord.longitude });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mapWrap}>
            <MapView
              style={styles.map}
              initialRegion={region}
              onPress={(e) => {
                const c = e?.nativeEvent?.coordinate;
                if (!c) return;
                setCoord({ latitude: c.latitude, longitude: c.longitude });
              }}
            >
              {/* OSM tiles (no API key) */}
              <UrlTile
                urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maximumZ={19}
                flipY={false}
                tileSize={256}
                shouldReplaceMapContent={Platform.OS === 'android'}
              />
              <Marker
                coordinate={coord}
                draggable
                onDragEnd={(e) => {
                  const c = e?.nativeEvent?.coordinate;
                  if (!c) return;
                  setCoord({ latitude: c.latitude, longitude: c.longitude });
                }}
              />
            </MapView>
            <Text style={styles.hint}>Tap anywhere to drop pin · Drag pin to adjust</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose} activeOpacity={0.85}>
              <Text style={[styles.btnText, styles.cancelText]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.okBtn]} onPress={confirm} activeOpacity={0.85}>
              <Text style={[styles.btnText, styles.okText]}>Use this location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
    maxHeight: '92%',
  },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '900', color: '#263238', flex: 1, paddingRight: 10 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: '#555', fontWeight: '900' },
  mapWrap: { paddingHorizontal: 16 },
  map: { width: width - 32, height: 360, borderRadius: 14, overflow: 'hidden' },
  hint: { marginTop: 10, fontSize: 12, color: '#546e7a', fontWeight: '700', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '900' },
  cancelBtn: { backgroundColor: '#f0f0f0' },
  cancelText: { color: '#455a64' },
  okBtn: { backgroundColor: '#4CAF50' },
  okText: { color: '#fff' },
});

