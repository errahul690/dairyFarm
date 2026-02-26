import React, { useState, useEffect, useMemo } from 'react';
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
import { animalService } from '../../services/animals/animalService';

/**
 * Unified Animal Screen
 * Manage both animal sales and purchase transactions
 */
export default function AnimalScreen({ onNavigate, onLogout }) {
  const [transactionType, setTransactionType] = useState('purchase');
  const [transactions, setTransactions] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    price: '',
    animalName: '',
    animalType: '',
    breed: '',
    gender: '',
    location: '',
    temperament: '',
    description: '',
    contactName: '',
    contactPhone: '',
    notes: '',
  });

  // Load transactions and animals on mount
  useEffect(() => {
    loadTransactions();
    loadAnimals();
  }, []);

  const loadAnimals = async () => {
    try {
      const data = await animalService.getAnimals();
      setAnimals(data);
    } catch (error) {
      console.error('Failed to load animals:', error);
      Alert.alert('Error', 'Failed to load animals. Please try again.');
      setAnimals([]);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await animalService.getTransactions();
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      Alert.alert('Error', 'Failed to load transactions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async () => {
    // Validation
    if (!formData.price || !formData.animalName || !formData.contactName) {
      Alert.alert('Error', 'Please fill all required fields (Price, Animal Name, Contact Name)');
      return;
    }

    const price = parseFloat(formData.price);

    if (isNaN(price) || price <= 0) {
      Alert.alert('Error', 'Please enter a valid price (greater than 0)');
      return;
    }

    // Date validation
    const selectedDate = new Date(formData.date);
    if (isNaN(selectedDate.getTime())) {
      Alert.alert('Error', 'Please enter a valid date');
      return;
    }

    try {
      setLoading(true);

      const transactionData = {
        date: new Date(formData.date),
        price: price,
        animalName: formData.animalName,
        animalType: formData.animalType || undefined,
        breed: formData.breed || undefined,
        gender: formData.gender || undefined,
        location: formData.location || undefined,
        temperament: formData.temperament || undefined,
        description: formData.description || undefined,
        [transactionType === 'sale' ? 'buyer' : 'seller']: formData.contactName,
        [transactionType === 'sale' ? 'buyerPhone' : 'sellerPhone']: formData.contactPhone || undefined,
        notes: formData.notes || undefined,
      };

      let savedTransaction;
      if (transactionType === 'sale') {
        savedTransaction = await animalService.recordSale(transactionData);
      } else {
        savedTransaction = await animalService.recordPurchase(transactionData);
      }

      // Reload all transactions
      await loadTransactions();

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        price: '',
        animalName: '',
        animalType: '',
        breed: '',
        gender: '',
        location: '',
        temperament: '',
        description: '',
        contactName: formData.contactName, // Keep contact name
        contactPhone: formData.contactPhone, // Keep contact phone
        notes: '',
      });
      setShowForm(false);
      Alert.alert('Success', `Animal ${transactionType === 'sale' ? 'sale' : 'purchase'} saved successfully!`);
    } catch (error) {
      console.error('Failed to save transaction:', error);
      Alert.alert('Error', error.message || 'Failed to save transaction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (_id) => {
    Alert.alert(
      `Delete ${transactionType === 'sale' ? 'Sale' : 'Purchase'}`,
      `Are you sure you want to delete this ${transactionType === 'sale' ? 'sale' : 'purchase'} record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              // Note: You may need to add deleteTransaction to animalService
              Alert.alert('Info', 'Delete functionality needs to be implemented in the backend');
              await loadTransactions();
            } catch (error) {
              console.error('Failed to delete transaction:', error);
              Alert.alert('Error', error.message || 'Failed to delete transaction. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const filteredTransactions = transactions.filter((t) => t.type === transactionType);
  const totalAmount = filteredTransactions.reduce((sum, t) => sum + (t.price || 0), 0);
  const totalCount = filteredTransactions.length;

  // Group transactions by date for day-wise view
  const getDayWiseTransactions = () => {
    const grouped = {};

    filteredTransactions.forEach((transaction) => {
      const dateKey = new Date(transaction.date).toISOString().split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(transaction);
    });

    // Sort dates in descending order
    return Object.keys(grouped)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map((dateKey) => ({
        date: dateKey,
        transactions: grouped[dateKey],
      }));
  };

  const dayWiseTransactions = getDayWiseTransactions();

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Animals"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        {/* Transaction Type Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, transactionType === 'purchase' && styles.toggleButtonActive]}
            onPress={() => setTransactionType('purchase')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, transactionType === 'purchase' && styles.toggleTextActive]}>
              Purchase
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, transactionType === 'sale' && styles.toggleButtonActive]}
            onPress={() => setTransactionType('sale')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, transactionType === 'sale' && styles.toggleTextActive]}>
              Sales
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.summaryCard, transactionType === 'sale' ? styles.summaryCardSale : styles.summaryCardPurchase]}>
          <Text style={styles.summaryTitle} numberOfLines={1}>Total {transactionType === 'sale' ? 'Sales' : 'Purchases'}</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{formatCurrency(totalAmount)}</Text>
          <Text style={styles.summarySubtext} numberOfLines={1}>{totalCount} Animal{totalCount !== 1 ? 's' : ''}</Text>
        </View>

        <TouchableOpacity
          style={[styles.addButton, transactionType === 'sale' ? styles.addButtonSale : styles.addButtonPurchase]}
          onPress={() => setShowForm(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ Add New {transactionType === 'sale' ? 'Sale' : 'Purchase'}</Text>
        </TouchableOpacity>

        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No {transactionType === 'sale' ? 'sale' : 'purchase'} records yet</Text>
            <Text style={styles.emptySubtext}>Tap "Add New {transactionType === 'sale' ? 'Sale' : 'Purchase'}" to add one</Text>
          </View>
        ) : (
          dayWiseTransactions.map((dayGroup) => {
            const dayTotalAmount = dayGroup.transactions.reduce(
              (sum, t) => sum + (t.price || 0),
              0
            );

            return (
              <View key={dayGroup.date} style={styles.dayGroupCard}>
                {/* Day Header with Summary */}
                <View style={[
                  styles.dayHeader,
                  transactionType === 'sale' ? styles.dayHeaderSale : styles.dayHeaderPurchase,
                ]}>
                  <View style={styles.dayHeaderLeft}>
                    <Text style={styles.dayDate}>{formatDate(new Date(dayGroup.date))}</Text>
                    <Text style={styles.daySummaryText}>
                      {dayGroup.transactions.length} Transaction{dayGroup.transactions.length !== 1 ? 's' : ''} • {formatCurrency(dayTotalAmount)}
                    </Text>
                  </View>
                </View>

                {/* Individual Transactions for the Day */}
                {dayGroup.transactions.map((transaction) => (
                  <View key={transaction._id || transaction.id} style={styles.transactionCard}>
                    <View style={styles.transactionDetails}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Animal:</Text>
                        <Text style={styles.detailValue}>{transaction.animalName || 'N/A'}</Text>
                      </View>
                      {transaction.animalType && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Type:</Text>
                          <Text style={styles.detailValue}>{transaction.animalType}</Text>
                        </View>
                      )}
                      {transaction.breed && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Breed:</Text>
                          <Text style={styles.detailValue}>{transaction.breed}</Text>
                        </View>
                      )}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{transaction.type === 'sale' ? 'Buyer:' : 'Seller:'}</Text>
                        <View style={styles.detailValueContainer}>
                          <Text style={styles.detailValue}>
                            {transaction.type === 'sale' ? transaction.buyer : transaction.seller}
                          </Text>
                          {(transaction.type === 'sale' ? transaction.buyerPhone : transaction.sellerPhone) && (
                            <Text style={styles.detailPhone}>
                              {(transaction.type === 'sale' ? transaction.buyerPhone : transaction.sellerPhone)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Price:</Text>
                        <Text style={[styles.detailValue, styles.priceValue]}>
                          {formatCurrency(transaction.price || 0)}
                        </Text>
                      </View>
                      {transaction.notes && (
                        <View style={styles.notesContainer}>
                          <Text style={styles.notesLabel}>Notes:</Text>
                          <Text style={styles.notesText}>{transaction.notes}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add Transaction Modal */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Animal {transactionType === 'sale' ? 'Sale' : 'Purchase'}</Text>
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
                value={formData.date}
                onChangeText={(text) => setFormData({ ...formData, date: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Animal Name *</Text>
              <Input
                placeholder="Enter animal name"
                value={formData.animalName}
                onChangeText={(text) => setFormData({ ...formData, animalName: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Animal Type</Text>
              <Input
                placeholder="e.g., Cow, Buffalo, Goat"
                value={formData.animalType}
                onChangeText={(text) => setFormData({ ...formData, animalType: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Breed</Text>
              <Input
                placeholder="Enter breed"
                value={formData.breed}
                onChangeText={(text) => setFormData({ ...formData, breed: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Gender</Text>
              <Input
                placeholder="Male/Female"
                value={formData.gender}
                onChangeText={(text) => setFormData({ ...formData, gender: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Price (₹) *</Text>
              <Input
                placeholder="Enter price"
                value={formData.price}
                onChangeText={(text) => setFormData({ ...formData, price: text })}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.label}>{transactionType === 'sale' ? 'Buyer' : 'Seller'} Name *</Text>
              <Input
                placeholder={`Enter ${transactionType === 'sale' ? 'buyer' : 'seller'} name`}
                value={formData.contactName}
                onChangeText={(text) => setFormData({ ...formData, contactName: text })}
                style={styles.input}
              />

              <Text style={styles.label}>{transactionType === 'sale' ? 'Buyer' : 'Seller'} Phone</Text>
              <Input
                placeholder={`Enter ${transactionType === 'sale' ? 'buyer' : 'seller'} phone`}
                value={formData.contactPhone}
                onChangeText={(text) => setFormData({ ...formData, contactPhone: text })}
                keyboardType="phone-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Location</Text>
              <Input
                placeholder="Enter location"
                value={formData.location}
                onChangeText={(text) => setFormData({ ...formData, location: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Temperament</Text>
              <Input
                placeholder="Enter temperament"
                value={formData.temperament}
                onChangeText={(text) => setFormData({ ...formData, temperament: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Description</Text>
              <Input
                placeholder="Additional description (optional)"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                multiline
                numberOfLines={3}
                style={styles.textArea}
              />

              <Text style={styles.label}>Notes</Text>
              <Input
                placeholder="Additional notes (optional)"
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                multiline
                numberOfLines={3}
                style={styles.textArea}
              />

              <Button
                title={`Save ${transactionType === 'sale' ? 'Sale' : 'Purchase'}`}
                onPress={handleAddTransaction}
                style={{
                  ...styles.saveButton,
                  ...(transactionType === 'sale' ? styles.saveButtonSale : styles.saveButtonPurchase),
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    borderRadius: 10,
    padding: 20,
    paddingVertical: 24,
    marginBottom: 15,
    alignItems: 'center',
    minHeight: 160,
    justifyContent: 'center',
  },
  summaryCardPurchase: {
    backgroundColor: '#4CAF50',
  },
  summaryCardSale: {
    backgroundColor: '#2196F3',
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
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  addButtonPurchase: {
    backgroundColor: '#4CAF50',
  },
  addButtonSale: {
    backgroundColor: '#2196F3',
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
  transactionCard: {
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
  transactionDetails: {
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
  detailValueContainer: {
    alignItems: 'flex-end',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  detailPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  priceValue: {
    fontSize: 18,
    color: '#4CAF50',
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
    minHeight: 300,
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
  saveButton: {
    marginTop: 20,
    marginBottom: 10,
  },
  saveButtonPurchase: {
    backgroundColor: '#4CAF50',
  },
  saveButtonSale: {
    backgroundColor: '#2196F3',
  },
  dayGroupCard: {
    marginBottom: 15,
  },
  dayHeader: {
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  dayHeaderSale: {
    backgroundColor: '#E3F2FD',
    borderLeftColor: '#2196F3',
  },
  dayHeaderPurchase: {
    backgroundColor: '#E8F5E9',
    borderLeftColor: '#4CAF50',
  },
  dayHeaderLeft: {
    flex: 1,
  },
  dayDate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  daySummaryText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
});

