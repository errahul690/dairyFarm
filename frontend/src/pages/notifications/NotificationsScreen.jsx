import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { notificationService } from '../../services/notifications/notificationService';

/**
 * Notifications Screen (Admin)
 * Lists admin notifications (e.g. milk request from buyer app) with mark read.
 */
export default function NotificationsScreen({ onNavigate, onLogout }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationService.getList({ limit: 50 });
      setList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      Alert.alert('Error', 'Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markRead(id);
      setList((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    } catch (e) {
      console.error('Mark read failed:', e);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setList((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.error('Mark all read failed:', e);
      Alert.alert('Error', 'Failed to mark all as read.');
    }
  };

  const unreadCount = list.filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Notifications"
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
        <>
          {unreadCount > 0 && (
            <View style={styles.markAllBar}>
              <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} activeOpacity={0.7}>
                <Text style={styles.markAllText}>Mark all as read</Text>
              </TouchableOpacity>
            </View>
          )}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
            }
          >
            {list.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🔔</Text>
                <Text style={styles.emptyText}>No notifications yet.</Text>
              </View>
            ) : (
              list.map((n) => (
                <View
                  key={n._id}
                  style={[styles.card, n.read ? styles.cardRead : styles.cardUnread]}
                >
                  <Text style={styles.message}>{n.message}</Text>
                  {n.data?.buyerPhone && (
                    <Text style={styles.meta}>{n.data.buyerPhone}</Text>
                  )}
                  <Text style={styles.time}>
                    {n.createdAt
                      ? new Date(n.createdAt).toLocaleString('en-IN')
                      : ''}
                  </Text>
                  {!n.read && (
                    <TouchableOpacity
                      onPress={() => handleMarkRead(n._id)}
                      style={styles.readBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.readBtnText}>Mark read</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#556d73',
  },
  markAllBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
  },
  markAllBtn: {
    alignSelf: 'flex-end',
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#556d73',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  cardRead: {
    opacity: 0.9,
  },
  message: {
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 4,
  },
  meta: {
    fontSize: 14,
    color: '#556d73',
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: '#9e9e9e',
    marginBottom: 8,
  },
  readBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
  },
  readBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2E7D32',
  },
});
