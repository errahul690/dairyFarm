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
import { milkService } from '../../services/milk/milkService';
import { sellerService } from '../../services/sellers/sellerService';
import { buyerService } from '../../services/buyers/buyerService';
import { formatCurrency } from '../../utils/currencyUtils';
import { authService } from '../../services/auth/authService';

export default function SellerScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [sellersData, setSellersData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    milkFixedPrice: '',
    dailyMilkQuantity: '',
  });
  const [addAsBuyerLoading, setAddAsBuyerLoading] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txData, sellersList] = await Promise.all([
        milkService.getTransactions(),
        sellerService.getSellers(),
      ]);
      console.log('[SellerScreen] Loaded sellers:', sellersList);
      setTransactions(txData);
      setSellersData(Array.isArray(sellersList) ? sellersList : []);
    } catch (error) {
      console.error('Failed to load data:', error);
      // Don't show alert for seller fetch errors, just log it
      setSellersData([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  // Get all sellers with their statistics
  const sellers = useMemo(() => {
    const sellerMap = new Map();

    // Add sellers from sellers table
    sellersData.forEach((seller) => {
      if (seller.mobile) {
        const key = seller.mobile.trim();
        sellerMap.set(key, {
          _id: seller._id,
          userId: seller.userId,
          name: seller.name,
          phone: seller.mobile,
          totalQuantity: 0,
          totalAmount: 0,
          transactionCount: 0,
          fixedPrice: seller.rate,
          dailyQuantity: seller.quantity,
          isAlsoBuyer: seller.isAlsoBuyer === true,
        });
      }
    });

    // Process transactions and calculate statistics
    transactions.forEach((tx) => {
      if (tx.type === 'sale' && tx.buyerPhone) {
        const key = tx.buyerPhone.trim();
        const seller = sellerMap.get(key);
        
        if (seller) {
          seller.totalQuantity += tx.quantity;
          seller.totalAmount += tx.totalAmount;
          seller.transactionCount += 1;

          const txDate = new Date(tx.date);
          if (!seller.lastTransactionDate || txDate > seller.lastTransactionDate) {
            seller.lastTransactionDate = txDate;
          }

          sellerMap.set(key, seller);
        }
      }
    });

    // Return all sellers (including those with no transactions yet)
    // Sort by total amount (highest first), then by name
    return Array.from(sellerMap.values())
      .sort((a, b) => {
        // First sort by total amount (descending)
        if (b.totalAmount !== a.totalAmount) {
          return b.totalAmount - a.totalAmount;
        }
        // If amounts are equal, sort by name (ascending)
        return a.name.localeCompare(b.name);
      });
  }, [transactions, sellersData]);

  const getSellerTransactions = (phone) => {
    return transactions
      .filter((tx) => tx.type === 'sale' && tx.buyerPhone?.trim() === phone.trim())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleCreateSeller = async () => {
    // Validation
    if (!formData.name || !formData.mobile) {
      Alert.alert('Error', 'Please fill name and mobile number');
      return;
    }

    if (!/^[0-9]{10}$/.test(formData.mobile.trim())) {
      Alert.alert('Error', 'Mobile must be exactly 10 digits');
      return;
    }

    // Email validation - if provided, must contain @
    if (formData.email && formData.email.trim() && !formData.email.trim().includes('@')) {
      Alert.alert('Error', 'Email must contain @ symbol');
      return;
    }

    try {
      setLoading(true);
      // Parse fixed price and daily quantity, only if not empty
      const fixedPrice = formData.milkFixedPrice && formData.milkFixedPrice.trim() 
        ? parseFloat(formData.milkFixedPrice.trim()) 
        : undefined;
      const dailyQuantity = formData.dailyMilkQuantity && formData.dailyMilkQuantity.trim()
        ? parseFloat(formData.dailyMilkQuantity.trim())
        : undefined;
      
      // Validate parsed values
      if (formData.milkFixedPrice && formData.milkFixedPrice.trim()) {
        if (isNaN(fixedPrice) || fixedPrice <= 0) {
          Alert.alert('Error', 'Please enter a valid fixed price (greater than 0)');
          setLoading(false);
          return;
        }
      }
      if (formData.dailyMilkQuantity && formData.dailyMilkQuantity.trim()) {
        if (isNaN(dailyQuantity) || dailyQuantity <= 0) {
          Alert.alert('Error', 'Please enter a valid daily milk quantity (greater than 0)');
          setLoading(false);
          return;
        }
      }
      
      // Create seller with fixed password 123456#
      await authService.signup(
        formData.name.trim(),
        formData.email.trim() || '',
        '123456#', // Fixed password
        formData.mobile.trim(),
        undefined, // gender
        undefined, // address
        fixedPrice,
        dailyQuantity,
        3 // role: SELLER
      );

      // Reset form
      setFormData({ name: '', mobile: '', email: '', milkFixedPrice: '', dailyMilkQuantity: '' });
      setShowAddForm(false);
      
      // Show success message first
      Alert.alert('Success', 'Seller created successfully!');
      
      // Small delay to ensure backend has processed, then reload data
      setTimeout(async () => {
        await loadData();
      }, 500);
    } catch (error) {
      console.error('Failed to create seller:', error);
      const errorMessage = error?.message || error?.toString() || 'Failed to create seller';
      console.log('Full error details:', JSON.stringify(error, null, 2));
      Alert.alert('Error', `Failed to create seller: ${errorMessage})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Sellers"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ Add New Seller</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.centerContainer}>
            <Text style={styles.loadingText}>Loading sellers...</Text>
          </View>
        ) : sellers.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No sellers found</Text>
            <Text style={styles.emptySubtext}>Click "Add New Seller" to create a seller</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle} numberOfLines={2}>
                Total Sellers
              </Text>
              <Text style={styles.summaryValue}>{sellers.length}</Text>
            </View>

            {sellers.map((seller, index) => {
              const sellerTransactions = getSellerTransactions(seller.phone);
              const isExpanded = selectedSeller === seller.phone;

              return (
                <View key={index} style={styles.sellerCard}>
                  <TouchableOpacity
                    onPress={() => setSelectedSeller(isExpanded ? null : seller.phone)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sellerHeader}>
                      <View style={styles.sellerHeaderLeft}>
                        <Text style={styles.sellerName}>{seller.name}</Text>
                        <Text style={styles.sellerPhone}>{seller.phone}</Text>
                      </View>
                      <View style={styles.sellerHeaderRight}>
                        {seller._id && !seller.isAlsoBuyer && (
                          <TouchableOpacity
                            style={styles.addAsBuyerButton}
                            onPress={async () => {
                              setAddAsBuyerLoading(seller._id);
                              try {
                                await buyerService.addBuyerFromSeller(seller._id);
                                await loadData();
                                Alert.alert('Done', `${seller.name} is now also in Buyer list. Payment & milk can be managed from both Buyer and Seller screens.`);
                              } catch (e) {
                                Alert.alert('Error', e?.message || 'Failed to add as buyer.');
                              } finally {
                                setAddAsBuyerLoading(null);
                              }
                            }}
                            disabled={!!addAsBuyerLoading}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.addAsBuyerButtonText}>
                              {addAsBuyerLoading === seller._id ? '...' : 'Add as Buyer'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {seller.isAlsoBuyer && (
                          <Text style={styles.alsoBuyerBadge}>Buyer + Seller</Text>
                        )}
                        <Text style={styles.sellerAmount}>{formatCurrency(seller.totalAmount)}</Text>
                        <Text style={styles.sellerQuantity}>{seller.totalQuantity.toFixed(2)} L</Text>
                        <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                      </View>
                    </View>
                    <View style={styles.sellerStats}>
                      <Text style={styles.statText}>
                        {seller.transactionCount} Transaction{seller.transactionCount !== 1 ? 's' : ''}
                      </Text>
                      {seller.lastTransactionDate && (
                        <Text style={styles.statText}>
                          Last: {formatDate(seller.lastTransactionDate)}
                        </Text>
                      )}
                    </View>
                    {(seller.fixedPrice || seller.dailyQuantity) && (
                      <View style={styles.sellerDetails}>
                        {seller.fixedPrice && (
                          <Text style={styles.sellerDetailText}>
                            Fixed Price: {formatCurrency(seller.fixedPrice)}/L
                          </Text>
                        )}
                        {seller.dailyQuantity && (
                          <Text style={styles.sellerDetailText}>
                            Daily Quantity: {seller.dailyQuantity.toFixed(2)} L
                          </Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {isExpanded && sellerTransactions.length > 0 && (
                    <View style={styles.transactionsContainer}>
                      <Text style={styles.transactionsTitle}>Transaction History</Text>
                      {sellerTransactions.map((tx) => (
                        <View key={tx._id} style={styles.transactionItem}>
                          <View style={styles.transactionRow}>
                            <Text style={styles.transactionDate}>{formatDate(new Date(tx.date))}</Text>
                            <Text style={styles.transactionAmount}>{formatCurrency(tx.totalAmount)}</Text>
                          </View>
                          <View style={styles.transactionRow}>
                            <Text style={styles.transactionDetails}>
                              {tx.quantity.toFixed(2)} L @ {formatCurrency(tx.pricePerLiter)}/L
                            </Text>
                          </View>
                          {tx.notes && (
                            <Text style={styles.transactionNotes}>{tx.notes}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Add Seller Modal */}
      <Modal
        visible={showAddForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Seller</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddForm(false);
                  setFormData({ name: '', mobile: '', email: '', milkFixedPrice: '', dailyMilkQuantity: '' });
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.label}>Name *</Text>
              <Input
                placeholder="Enter seller name"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Mobile Number *</Text>
              <Input
                placeholder="Enter 10 digit mobile number"
                value={formData.mobile}
                onChangeText={(text) => setFormData({ ...formData, mobile: text })}
                keyboardType="phone-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Email (Optional)</Text>
              <Input
                placeholder="Enter email address"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />

              <Text style={styles.label}>Fixed Milk Price (₹/L) (Optional)</Text>
              <Input
                placeholder="Enter fixed price per liter"
                value={formData.milkFixedPrice}
                onChangeText={(text) => setFormData({ ...formData, milkFixedPrice: text })}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Daily Milk Quantity (Liters) (Optional)</Text>
              <Input
                placeholder="Enter expected daily milk quantity"
                value={formData.dailyMilkQuantity}
                onChangeText={(text) => setFormData({ ...formData, dailyMilkQuantity: text })}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.infoText}>
                Password will be set to: 123456#
              </Text>

              <Button
                title={loading ? 'Creating...' : 'Create Seller'}
                onPress={handleCreateSeller}
                disabled={loading}
                style={styles.createButton}
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
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
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
  summaryCard: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    padding: 20,
    marginBottom: 15,
    alignItems: 'center',
    width: '100%',
  },
  summaryTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    flexShrink: 1,
    paddingHorizontal: 5,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  sellerCard: {
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
  sellerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sellerHeaderLeft: {
    flex: 1,
  },
  sellerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sellerPhone: {
    fontSize: 14,
    color: '#666',
  },
  sellerHeaderRight: {
    alignItems: 'flex-end',
  },
  addAsBuyerButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 6,
  },
  addAsBuyerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  alsoBuyerBadge: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '600',
    marginBottom: 6,
  },
  sellerAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  sellerQuantity: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  expandIcon: {
    fontSize: 12,
    color: '#666',
  },
  sellerStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  statText: {
    fontSize: 12,
    color: '#999',
  },
  transactionsContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  transactionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  transactionItem: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  transactionDetails: {
    fontSize: 13,
    color: '#666',
  },
  transactionNotes: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  infoText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 15,
  },
  createButton: {
    marginTop: 10,
    marginBottom: 10,
  },
  sellerDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  sellerDetailText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
});
