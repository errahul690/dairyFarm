import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { authService } from '../../services/auth/authService';
import { notificationService } from '../../services/notifications/notificationService';
import { formatCurrency } from '../../utils/currencyUtils';

const { width } = Dimensions.get('window');

const baseMenuItems = [
  { id: 1, title: 'Dashboard', icon: '📊' },
  { id: 2, title: 'Animals', icon: '🐄' },
  { id: 3, title: 'Milk', icon: '🥛' },
  { id: 31, title: 'Quick Sale', icon: '⚡' },
  { id: 33, title: 'Delivery Schedule', icon: '📅' },
  { id: 32, title: 'Milk Requests', icon: '📋' },
  { id: 4, title: 'Chara', icon: '🌾' },
  { id: 5, title: 'Profit/Loss', icon: '💰' },
  { id: 6, title: 'Milk Sales Report', icon: '📈' },
  { id: 7, title: 'Buyer', icon: '👥' },
  { id: 8, title: 'Seller', icon: '🏪' },
  { id: 11, title: 'Payments', icon: '💵' },
  { id: 12, title: 'Payments to collect', icon: '📋' },
  { id: 14, title: 'Settings', icon: '⚙️' },
  { id: 13, title: 'Notifications', icon: '🔔' },
];

const buyerMenuItems = [
  { id: 21, title: 'Buyer Dashboard', icon: '📊' },
  { id: 22, title: 'Milk Request', icon: '🥛' },
  { id: 27, title: 'My Schedule', icon: '📅' },
  { id: 28, title: 'Ledger', icon: '📒' },
  { id: 23, title: 'Transaction History', icon: '📜' },
  { id: 24, title: 'Payment History', icon: '💵' },
  { id: 25, title: 'Pending Payment', icon: '💳' },
];

export default function HeaderWithMenu({ title, subtitle, onNavigate, isAuthenticated = false, onLogout, pendingAmount }) {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const load = async () => {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
    };
    load();
  }, [isAuthenticated]);

  const isBuyer = currentUser?.role === 2;
  const isAdmin = currentUser?.role === 0 || currentUser?.role === 1;

  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    const fetchCount = async () => {
      try {
        const count = await notificationService.getUnreadCount();
        setUnreadCount(count);
      } catch (_) {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, isAdmin]);
  const menuItems = isBuyer
    ? buyerMenuItems
    : [
        ...baseMenuItems,
        ...(isAdmin ? [{ id: 9, title: 'Admin List', icon: '👥' }] : []),
      ];
  const [showDrawer, setShowDrawer] = useState(false);
  const slideAnim = useRef(new Animated.Value(-width)).current;

  const toggleDrawer = () => {
    if (showDrawer) {
      Animated.timing(slideAnim, {
        toValue: -width,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowDrawer(false));
    } else {
      setShowDrawer(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const closeDrawer = () => {
    Animated.timing(slideAnim, {
      toValue: -width,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowDrawer(false));
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={toggleDrawer}
          style={styles.menuButton}
          activeOpacity={0.7}
        >
          <View style={styles.menuIcon}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </View>
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {isBuyer && pendingAmount != null && pendingAmount > 0 && (
            <Text style={styles.pendingBadge}>Pending: {formatCurrency(pendingAmount)}</Text>
          )}
        </View>
        {isAdmin && (
          <>
            <TouchableOpacity
              onPress={() => onNavigate('Notifications')}
              style={styles.bellButton}
              activeOpacity={0.8}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onNavigate('Quick Sale')}
              style={styles.quickSaleShortcut}
              activeOpacity={0.8}
            >
              <Text style={styles.quickSaleShortcutIcon}>⚡</Text>
              <Text style={styles.quickSaleShortcutText}>Quick Sale</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Drawer Menu */}
      <Modal
        transparent={true}
        visible={showDrawer}
        animationType="none"
        onRequestClose={closeDrawer}
      >
        <TouchableOpacity
          style={styles.drawerOverlay}
          activeOpacity={1}
          onPress={closeDrawer}
        >
          <Animated.View
            style={[
              styles.drawer,
              {
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Menu</Text>
              <TouchableOpacity onPress={closeDrawer} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.drawerContent}>
              {menuItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={() => {
                    closeDrawer();
                    onNavigate(item.title);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemIcon}>{item.icon}</Text>
                  <Text style={styles.menuItemText}>{item.title}</Text>
                </TouchableOpacity>
              ))}
              {/* Show Logout if authenticated, otherwise show Login/Signup */}
              {isAuthenticated ? (
                <TouchableOpacity
                  style={[styles.menuItem, styles.logoutItem]}
                  onPress={() => {
                    closeDrawer();
                    if (onLogout) {
                      onLogout();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemIcon}>🚪</Text>
                  <Text style={[styles.menuItemText, styles.logoutText]}>Logout</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    closeDrawer();
                    onNavigate('Login/Signup');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemIcon}>👤</Text>
                  <Text style={styles.menuItemText}>Login/Signup</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#4CAF50',
    padding: 20,
    paddingTop: 40,
    paddingBottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    marginRight: 15,
    padding: 5,
  },
  bellButton: {
    marginRight: 8,
    padding: 8,
    position: 'relative',
  },
  bellIcon: {
    fontSize: 22,
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF5252',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  quickSaleShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  quickSaleShortcutIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  quickSaleShortcutText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  menuIcon: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
  },
  menuLine: {
    width: 24,
    height: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    marginBottom: 3,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#E8F5E9',
  },
  pendingBadge: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: width,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  drawerHeader: {
    backgroundColor: '#4CAF50',
    padding: 20,
    paddingTop: 50,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  drawerContent: {
    flex: 1,
    paddingTop: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  menuItemIcon: {
    fontSize: 24,
  },
  menuItemText: {
    fontSize: 18,
    color: '#333',
    marginLeft: 15,
    fontWeight: '500',
  },
  logoutItem: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginTop: 10,
  },
  logoutText: {
    color: '#FF5252',
    fontWeight: '600',
  },
});

