import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currencyUtils';

/**
 * Unified Chara Screen
 * Manage both chara (fodder) purchases and daily consumption
 */
export default function CharaScreen({ onNavigate, onLogout }) {
  const [viewType, setViewType] = useState('purchase');
  const [purchases, setPurchases] = useState([]);
  const [consumptions, setConsumptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [purchaseFormData, setPurchaseFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    pricePerKg: '',
    supplier: '',
    notes: '',
  });
  const [consumptionFormData, setConsumptionFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    animalId: '',
    notes: '',
  });

  const handleAddPurchase = () => {
    if (!purchaseFormData.quantity || !purchaseFormData.pricePerKg || !purchaseFormData.supplier) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    const quantity = parseFloat(purchaseFormData.quantity);
    const pricePerKg = parseFloat(purchaseFormData.pricePerKg);
    const totalAmount = quantity * pricePerKg;

    const newPurchase = {
      id: Date.now().toString(),
      date: new Date(purchaseFormData.date),
      quantity: quantity,
      pricePerKg: pricePerKg,
      totalAmount: totalAmount,
      supplier: purchaseFormData.supplier,
      notes: purchaseFormData.notes || undefined,
    };

    setPurchases([newPurchase, ...purchases]);
    setPurchaseFormData({
      date: new Date().toISOString().split('T')[0],
      quantity: '',
      pricePerKg: '',
      supplier: '',
      notes: '',
    });
    setShowForm(false);
    Alert.alert('Success', 'Chara purchase recorded successfully!');
  };

  const handleAddConsumption = () => {
    if (!consumptionFormData.quantity || !consumptionFormData.date) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    const quantity = parseFloat(consumptionFormData.quantity);

    const newConsumption = {
      id: Date.now().toString(),
      date: new Date(consumptionFormData.date),
      quantity: quantity,
      animalId: consumptionFormData.animalId || undefined,
      notes: consumptionFormData.notes || undefined,
    };

    setConsumptions([newConsumption, ...consumptions]);
    setConsumptionFormData({
      date: new Date().toISOString().split('T')[0],
      quantity: '',
      animalId: '',
      notes: '',
    });
    setShowForm(false);
    Alert.alert('Success', 'Daily consumption recorded successfully!');
  };

  const handleDeletePurchase = (id) => {
    Alert.alert(
      'Delete Purchase',
      'Are you sure you want to delete this purchase record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPurchases(purchases.filter((p) => p.id !== id));
            Alert.alert('Success', 'Purchase record deleted!');
          },
        },
      ]
    );
  };

  const handleDeleteConsumption = (id) => {
    Alert.alert(
      'Delete Consumption',
      'Are you sure you want to delete this consumption record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setConsumptions(consumptions.filter((c) => c.id !== id));
            Alert.alert('Success', 'Consumption record deleted!');
          },
        },
      ]
    );
  };

  const totalPurchases = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalPurchaseQuantity = purchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalConsumption = consumptions.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Chara (Fodder)"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        {/* View Type Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, viewType === 'purchase' && styles.toggleButtonActive]}
            onPress={() => setViewType('purchase')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, viewType === 'purchase' && styles.toggleTextActive]}>
              Purchase
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewType === 'consumption' && styles.toggleButtonActive]}
            onPress={() => setViewType('consumption')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, viewType === 'consumption' && styles.toggleTextActive]}>
              Daily Consumption
            </Text>
          </TouchableOpacity>
        </View>

        {viewType === 'purchase' ? (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle} numberOfLines={1}>Total Purchases</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>{formatCurrency(totalPurchases)}</Text>
              <Text style={styles.summarySubtext} numberOfLines={1}>{totalPurchaseQuantity.toFixed(2)} kg</Text>
              <Text style={styles.summarySubtext} numberOfLines={1}>{purchases.length} Transactions</Text>
            </View>

            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowForm(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addButtonText}>+ Add New Purchase</Text>
            </TouchableOpacity>

            {purchases.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No purchase records yet</Text>
                <Text style={styles.emptySubtext}>Tap "Add New Purchase" to add one</Text>
              </View>
            ) : (
              purchases.map((purchase) => (
                <View key={purchase.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardDate}>{formatDate(purchase.date)}</Text>
                      <Text style={styles.cardQuantity}>
                        {purchase.quantity} kg @ {formatCurrency(purchase.pricePerKg)}/kg
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeletePurchase(purchase.id)}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.cardDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Supplier:</Text>
                      <Text style={styles.detailValue}>{purchase.supplier}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Total Amount:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(purchase.totalAmount)}</Text>
                    </View>
                    {purchase.notes && (
                      <View style={styles.notesContainer}>
                        <Text style={styles.notesLabel}>Notes:</Text>
                        <Text style={styles.notesText}>{purchase.notes}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            <View style={[styles.summaryCard, styles.summaryCardConsumption]}>
              <Text style={styles.summaryTitle} numberOfLines={1}>Total Consumption</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>{totalConsumption.toFixed(2)} kg</Text>
              <Text style={styles.summarySubtext} numberOfLines={1}>{consumptions.length} Records</Text>
            </View>

            <TouchableOpacity
              style={[styles.addButton, styles.addButtonConsumption]}
              onPress={() => setShowForm(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addButtonText}>+ Add Daily Consumption</Text>
            </TouchableOpacity>

            {consumptions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No consumption records yet</Text>
                <Text style={styles.emptySubtext}>Tap "Add Daily Consumption" to add one</Text>
              </View>
            ) : (
              consumptions.map((consumption) => (
                <View key={consumption.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardDate}>{formatDate(consumption.date)}</Text>
                      <Text style={styles.cardQuantity}>{consumption.quantity} kg</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteConsumption(consumption.id)}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.cardDetails}>
                    {consumption.animalId && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Animal ID:</Text>
                        <Text style={styles.detailValue}>{consumption.animalId}</Text>
                      </View>
                    )}
                    {consumption.notes && (
                      <View style={styles.notesContainer}>
                        <Text style={styles.notesLabel}>Notes:</Text>
                        <Text style={styles.notesText}>{consumption.notes}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Add Purchase Modal */}
      {viewType === 'purchase' && (
        <Modal
          visible={showForm}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowForm(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Chara Purchase</Text>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.formContainer}>
                <Text style={styles.label}>Purchase Date *</Text>
                <Input
                  placeholder="YYYY-MM-DD"
                  value={purchaseFormData.date}
                  onChangeText={(text) => setPurchaseFormData({ ...purchaseFormData, date: text })}
                  style={styles.input}
                />

                <Text style={styles.label}>Quantity (kg) *</Text>
                <Input
                  placeholder="Enter quantity in kg"
                  value={purchaseFormData.quantity}
                  onChangeText={(text) => setPurchaseFormData({ ...purchaseFormData, quantity: text })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />

                <Text style={styles.label}>Price per kg (₹) *</Text>
                <Input
                  placeholder="Enter price per kg"
                  value={purchaseFormData.pricePerKg}
                  onChangeText={(text) => setPurchaseFormData({ ...purchaseFormData, pricePerKg: text })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />

                {purchaseFormData.quantity && purchaseFormData.pricePerKg && (
                  <View style={styles.totalPreview}>
                    <Text style={styles.totalPreviewLabel}>Total Amount:</Text>
                    <Text style={styles.totalPreviewValue}>
                      {formatCurrency(parseFloat(purchaseFormData.quantity || '0') * parseFloat(purchaseFormData.pricePerKg || '0'))}
                    </Text>
                  </View>
                )}

                <Text style={styles.label}>Supplier *</Text>
                <Input
                  placeholder="Enter supplier name"
                  value={purchaseFormData.supplier}
                  onChangeText={(text) => setPurchaseFormData({ ...purchaseFormData, supplier: text })}
                  style={styles.input}
                />

                <Text style={styles.label}>Notes</Text>
                <Input
                  placeholder="Additional notes (optional)"
                  value={purchaseFormData.notes}
                  onChangeText={(text) => setPurchaseFormData({ ...purchaseFormData, notes: text })}
                  multiline
                  numberOfLines={3}
                  style={styles.textArea}
                />

                <Button
                  title="Save Purchase"
                  onPress={handleAddPurchase}
                  style={styles.saveButton}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Add Consumption Modal */}
      {viewType === 'consumption' && (
        <Modal
          visible={showForm}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowForm(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Daily Consumption</Text>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.formContainer}>
                <Text style={styles.label}>Date *</Text>
                <Input
                  placeholder="YYYY-MM-DD"
                  value={consumptionFormData.date}
                  onChangeText={(text) => setConsumptionFormData({ ...consumptionFormData, date: text })}
                  style={styles.input}
                />

                <Text style={styles.label}>Quantity (kg) *</Text>
                <Input
                  placeholder="Enter quantity consumed in kg"
                  value={consumptionFormData.quantity}
                  onChangeText={(text) => setConsumptionFormData({ ...consumptionFormData, quantity: text })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />

                <Text style={styles.label}>Animal ID</Text>
                <Input
                  placeholder="Enter animal ID (optional)"
                  value={consumptionFormData.animalId}
                  onChangeText={(text) => setConsumptionFormData({ ...consumptionFormData, animalId: text })}
                  style={styles.input}
                />

                <Text style={styles.label}>Notes</Text>
                <Input
                  placeholder="Additional notes (optional)"
                  value={consumptionFormData.notes}
                  onChangeText={(text) => setConsumptionFormData({ ...consumptionFormData, notes: text })}
                  multiline
                  numberOfLines={3}
                  style={styles.textArea}
                />

                <Button
                  title="Save Consumption"
                  onPress={handleAddConsumption}
                  style={{
                    ...styles.saveButton,
                    ...styles.saveButtonConsumption,
                  }}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 15,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 4,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#4CAF50',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    padding: 20,
    paddingVertical: 24,
    marginBottom: 15,
    alignItems: 'center',
    minHeight: 160,
    justifyContent: 'center',
  },
  summaryCardConsumption: {
    backgroundColor: '#FF9800',
  },
  summaryTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  summarySubtext: {
    fontSize: 14,
    color: '#E8F5E9',
    marginTop: 6,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  addButtonConsumption: {
    backgroundColor: '#FF9800',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardDate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cardQuantity: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#FF5252',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  cardDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  notesContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  notesLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  formContainer: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F9F9F9',
    borderColor: '#E0E0E0',
    marginBottom: 4,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  totalPreview: {
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPreviewLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
  },
  totalPreviewValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    marginTop: 20,
    marginBottom: 10,
  },
  saveButtonConsumption: {
    backgroundColor: '#FF9800',
  },
});

