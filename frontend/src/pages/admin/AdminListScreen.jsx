import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Switch,
  ActivityIndicator,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { userService } from '../../services/users/userService';
import { authService } from '../../services/auth/authService';

const ROLE_SUPER_ADMIN = 0;
const ROLE_ADMIN = 1;
const ROLE_CONSUMER = 2;

export default function AdminListScreen({ onNavigate, onLogout }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', mobile: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const check = async () => {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
      const r = Number(user?.role);
      if (r !== 0 && r !== 1) {
        onNavigate?.('Dashboard');
      }
    };
    check();
  }, [onNavigate]);

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      setLoading(true);
      // Fetch both role 0 (Super Admin) and role 1 (Admin) - dono admin list mein dikhne chahiye
      const [superAdmins, adminsRole1] = await Promise.all([
        userService.getUsersByRole(ROLE_SUPER_ADMIN),
        userService.getUsersByRole(ROLE_ADMIN),
      ]);
      const list0 = Array.isArray(superAdmins) ? superAdmins : [];
      const list1 = Array.isArray(adminsRole1) ? adminsRole1 : [];
      const byId = new Map();
      [...list0, ...list1].forEach((u) => {
        const id = u._id?.toString?.() ?? u._id;
        if (id && !byId.has(id)) byId.set(id, { ...u, _id: id });
      });
      const adminsList = Array.from(byId.values());
      console.log('[AdminList] Loaded admins (role 0 + 1):', adminsList.length, adminsList);
      setAdmins(adminsList);
    } catch (e) {
      console.error('[AdminList] Load error:', e);
      Alert.alert('Error', e?.message || 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (admin) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name || '',
      mobile: admin.mobile || '',
      email: admin.email || '',
      address: admin.address || '',
    });
    setShowEditModal(true);
  };

  const handleUpdateAdmin = async () => {
    if (!editingAdmin || !formData.name || !formData.mobile) {
      Alert.alert('Error', 'Name and Mobile are required');
      return;
    }
    if (!/^[0-9]{10}$/.test(String(formData.mobile).trim())) {
      Alert.alert('Error', 'Mobile must be 10 digits');
      return;
    }
    try {
      setSaving(true);
      await userService.updateUser(editingAdmin._id, {
        name: formData.name.trim(),
        mobile: formData.mobile.trim(),
        email: (formData.email || '').trim() || undefined,
        address: (formData.address || '').trim() || undefined,
      });
      setShowEditModal(false);
      setEditingAdmin(null);
      loadAdmins();
      Alert.alert('Success', 'Admin updated');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (admin, newValue) => {
    const action = newValue ? 'activate' : 'deactivate';
    if (admin._id === currentUser?.id) {
      Alert.alert('Error', 'You cannot deactivate your own account');
      return;
    }
    Alert.alert(
      `Confirm ${action}`,
      `Are you sure you want to ${action} ${admin.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            try {
              await userService.updateUser(admin._id, { isActive: newValue });
              loadAdmins();
              Alert.alert('Success', `Admin ${action}d`);
            } catch (e) {
              Alert.alert('Error', e?.message || 'Failed');
            }
          },
        },
      ]
    );
  };

  const handleRemoveAdminControl = (admin) => {
    if (admin._id === currentUser?.id) {
      Alert.alert('Error', 'You cannot remove your own admin access');
      return;
    }
    Alert.alert(
      'Remove Admin Control',
      `Remove admin access from ${admin.name}? They will become a regular consumer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await userService.updateUser(admin._id, { role: ROLE_CONSUMER });
              loadAdmins();
              Alert.alert('Success', 'Admin access removed');
            } catch (e) {
              Alert.alert('Error', e?.message || 'Failed to remove admin');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="Admin List"
        subtitle="Manage admins"
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAuthenticated
      />
      <ScrollView style={styles.content}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onNavigate?.('Add Admin')}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ Add Admin</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 24 }} />
        ) : admins.length === 0 ? (
          <Text style={styles.emptyText}>No admins yet. Add one using the button above.</Text>
        ) : (
          admins.map((admin) => (
            <View key={admin._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {admin.name || 'Admin (No Name)'}
                  </Text>
                  {admin.mobile ? (
                    <Text style={styles.cardMobile}>{admin.mobile}</Text>
                  ) : (
                    <Text style={[styles.cardMobile, { color: '#999', fontStyle: 'italic' }]}>
                      Mobile: Not Available
                    </Text>
                  )}
                  {admin.email ? <Text style={styles.cardEmail} numberOfLines={1}>{admin.email}</Text> : null}
                </View>
                <View style={[styles.statusBadge, admin.isActive !== false ? styles.statusActive : styles.statusInactive]}>
                  <Text style={styles.statusText}>{admin.isActive !== false ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <Switch
                  value={admin.isActive !== false}
                  onValueChange={(v) => handleStatusToggle(admin, v)}
                  disabled={admin._id === currentUser?.id}
                  trackColor={{ false: '#ccc', true: '#81C784' }}
                  thumbColor={admin.isActive !== false ? '#4CAF50' : '#f4f3f4'}
                />
                <Text style={[styles.toggleLabel, { marginLeft: 8 }]}>Status</Text>
                <TouchableOpacity style={[styles.editBtn, { marginLeft: 12 }]} onPress={() => openEdit(admin)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                {admin._id !== currentUser?.id && (
                  <TouchableOpacity
                    style={[styles.removeBtn, { marginLeft: 12 }]}
                    onPress={() => handleRemoveAdminControl(admin)}
                  >
                    <Text style={styles.removeBtnText}>Remove Admin</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Admin</Text>
            <Input placeholder="Name *" value={formData.name} onChangeText={(v) => setFormData({ ...formData, name: v })} style={styles.input} />
            <Input
              placeholder="Mobile *"
              keyboardType="phone-pad"
              value={formData.mobile}
              onChangeText={(v) => setFormData({ ...formData, mobile: v.replace(/\D/g, '').slice(0, 10) })}
              maxLength={10}
              style={styles.input}
            />
            <Input
              placeholder="Email (Optional)"
              keyboardType="email-address"
              value={formData.email}
              onChangeText={(v) => setFormData({ ...formData, email: v })}
              style={styles.input}
            />
            <Input
              placeholder="Address (Optional)"
              value={formData.address}
              onChangeText={(v) => setFormData({ ...formData, address: v })}
              style={styles.input}
            />
            <View style={styles.modalButtons}>
              <View style={styles.modalBtnWrapper}>
                <Button title="Cancel" onPress={() => { setShowEditModal(false); setEditingAdmin(null); }} />
              </View>
              <View style={[styles.modalBtnWrapper, { marginLeft: 12 }]}>
                <Button title={saving ? 'Saving...' : 'Save'} onPress={handleUpdateAdmin} disabled={saving} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  addButton: {
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24, fontSize: 16 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardInfo: { flex: 1, marginRight: 12 },
  cardName: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  cardMobile: { fontSize: 15, color: '#444', marginTop: 6 },
  cardEmail: { fontSize: 13, color: '#666', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  statusActive: { backgroundColor: '#C8E6C9' },
  statusInactive: { backgroundColor: '#FFCDD2' },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  toggleLabel: { fontSize: 14, color: '#666' },
  editBtn: { backgroundColor: '#2196F3', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  editBtnText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  removeBtn: { backgroundColor: '#F44336', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  removeBtnText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  input: { marginBottom: 12 },
  modalButtons: { flexDirection: 'row', marginTop: 16 },
  modalBtnWrapper: { flex: 1 },
});
