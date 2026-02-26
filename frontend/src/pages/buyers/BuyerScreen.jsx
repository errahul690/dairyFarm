import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { milkService } from '../../services/milk/milkService';
import { buyerService } from '../../services/buyers/buyerService';
import { sellerService } from '../../services/sellers/sellerService';
import { paymentService } from '../../services/payments/paymentService';
import { userService } from '../../services/users/userService';
import { formatCurrency } from '../../utils/currencyUtils';
import { authService } from '../../services/auth/authService';
import { MILK_SOURCE_TYPES } from '../../constants';

export default function BuyerScreen({ onNavigate, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [buyersData, setBuyersData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [logTab, setLogTab] = useState('milk'); // 'milk' | 'payments' for expanded buyer logs
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    milkFixedPrice: '',
    dailyMilkQuantity: '',
    milkSource: 'cow',
    deliveryScheduleType: 'daily',
    deliveryDays: [],
    deliveryCycleDays: '2',
    deliveryCycleStartDate: '',
  });
  const [showAddMilkModal, setShowAddMilkModal] = useState(false);
  const [addMilkBuyer, setAddMilkBuyer] = useState(null);
  const [addMilkLoading, setAddMilkLoading] = useState(false);
  const [milkTxForm, setMilkTxForm] = useState({ quantity: '', date: '', pricePerLiter: '' });
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [addPaymentBuyer, setAddPaymentBuyer] = useState(null);
  const [addPaymentLoading, setAddPaymentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: '' });
  const [buyerFilterTab, setBuyerFilterTab] = useState('active'); // 'active' | 'inactive'
  const [addAsSellerLoading, setAddAsSellerLoading] = useState(null);

  const canEditUsers = currentUser?.role === 0 || currentUser?.role === 1;

  const getTodayDateStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const openAddMilkModal = (buyer) => {
    setAddMilkBuyer(buyer);
    setMilkTxForm({
      quantity: buyer.dailyQuantity != null ? String(buyer.dailyQuantity) : '',
      date: getTodayDateStr(),
      pricePerLiter: buyer.fixedPrice != null ? String(buyer.fixedPrice) : '',
    });
    setShowAddMilkModal(true);
  };

  const handleAddMilkTransaction = async () => {
    if (!addMilkBuyer?.phone) return;
    const q = parseFloat(milkTxForm.quantity);
    const rate = parseFloat(milkTxForm.pricePerLiter);
    if (isNaN(q) || q <= 0) {
      Alert.alert('Error', 'Enter valid quantity (number > 0)');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      Alert.alert('Error', 'Enter valid rate per liter');
      return;
    }
    const dateObj = new Date(milkTxForm.date);
    if (isNaN(dateObj.getTime())) {
      Alert.alert('Error', 'Enter valid date (e.g. YYYY-MM-DD)');
      return;
    }
    const totalAmount = Math.round(q * rate * 100) / 100;
    const milkSource = (addMilkBuyer.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(addMilkBuyer.milkSource)) ? addMilkBuyer.milkSource : 'cow';
    try {
      setAddMilkLoading(true);
      await milkService.recordSale({
        date: dateObj,
        quantity: q,
        pricePerLiter: rate,
        totalAmount,
        buyer: addMilkBuyer.name,
        buyerPhone: addMilkBuyer.phone,
        milkSource,
      });
      setShowAddMilkModal(false);
      setAddMilkBuyer(null);
      await loadData(true);
      Alert.alert('Success', 'Milk transaction added.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to add transaction.');
    } finally {
      setAddMilkLoading(false);
    }
  };

  const openAddPaymentModal = (buyer) => {
    setAddPaymentBuyer(buyer);
    setPaymentForm({ amount: '', date: getTodayDateStr() });
    setShowAddPaymentModal(true);
  };

  const handleAddPaymentTransaction = async () => {
    if (!addPaymentBuyer?.phone || !addPaymentBuyer?.userId) return;
    const amount = parseFloat(paymentForm.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Enter valid amount (number > 0)');
      return;
    }
    const dateObj = new Date(paymentForm.date);
    if (isNaN(dateObj.getTime())) {
      Alert.alert('Error', 'Enter valid date (e.g. YYYY-MM-DD)');
      return;
    }
    try {
      setAddPaymentLoading(true);
      await paymentService.createPayment({
        customerId: addPaymentBuyer.userId,
        customerName: addPaymentBuyer.name,
        customerMobile: addPaymentBuyer.phone,
        amount,
        paymentDate: dateObj,
        paymentType: 'cash',
        paymentDirection: 'from_buyer',
      });
      setShowAddPaymentModal(false);
      setAddPaymentBuyer(null);
      await loadData(true);
      Alert.alert('Success', 'Payment recorded.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to add payment.');
    } finally {
      setAddPaymentLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
    };
    loadUser();
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [txData, buyersList, paymentData] = await Promise.all([
        milkService.getTransactions(),
        buyerService.getBuyers().catch(() => []),
        paymentService.getPayments().catch(() => []),
      ]);
      setTransactions(txData);
      setBuyersData(buyersList);
      setPayments(paymentData);
    } catch (error) {
      console.error('Failed to load data:', error);
      if (!silent) Alert.alert('Error', 'Failed to load buyer data. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Get all buyers with their statistics
  const buyers = useMemo(() => {
    const buyerMap = new Map();

    // Add buyers from buyers table
    buyersData.forEach((buyer) => {
      if (buyer.mobile) {
        const key = buyer.mobile.trim();
        buyerMap.set(key, {
          _id: buyer._id,
          userId: buyer.userId,
          name: buyer.name,
          phone: buyer.mobile,
          email: buyer.email || '',
          totalQuantity: 0,
          totalAmount: 0,
          transactionCount: 0,
          fixedPrice: buyer.rate,
          dailyQuantity: buyer.quantity,
          milkSource: buyer.milkSource || 'cow',
          active: buyer.active !== false,
          isAlsoSeller: buyer.isAlsoSeller === true,
          deliveryDays: buyer.deliveryDays,
          deliveryCycleDays: buyer.deliveryCycleDays,
          deliveryCycleStartDate: buyer.deliveryCycleStartDate,
        });
      }
    });

    // Process transactions and calculate statistics
    transactions.forEach((tx) => {
      if (tx.type === 'sale' && tx.buyerPhone) {
        const key = tx.buyerPhone.trim();
        const buyer = buyerMap.get(key);
        
        if (buyer) {
          buyer.totalQuantity += tx.quantity;
          buyer.totalAmount += tx.totalAmount;
          buyer.transactionCount += 1;

          const txDate = new Date(tx.date);
          if (!buyer.lastTransactionDate || txDate > buyer.lastTransactionDate) {
            buyer.lastTransactionDate = txDate;
          }

          buyerMap.set(key, buyer);
        }
      }
    });

    // Pending balance = milk total - payments received from this buyer
    const buyerList = Array.from(buyerMap.values());
    buyerList.forEach((buyer) => {
      const phone = (buyer.phone || '').trim();
      const totalPaid = (payments || [])
        .filter((p) => String(p.customerMobile || '').trim() === phone)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      buyer.pendingBalance = (buyer.totalAmount || 0) - totalPaid;
    });

    // Sort A-Z by name for easy finding
    return buyerList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en'));
  }, [transactions, buyersData, payments]);

  const filteredBuyers = useMemo(
    () => buyers.filter((b) => (buyerFilterTab === 'active' ? b.active : !b.active)),
    [buyers, buyerFilterTab]
  );

  const getBuyerTransactions = (phone) => {
    return transactions
      .filter((tx) => tx.type === 'sale' && tx.buyerPhone?.trim() === phone.trim())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  /** Payments for this buyer from Payments schema (all payment types). */
  const getBuyerPaymentTransactions = (phone) => {
    const p = String(phone || '').trim();
    return (payments || [])
      .filter((pay) => String(pay.customerMobile || '').trim() === p)
      .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const openEditForm = (buyer) => {
    setEditingBuyer(buyer);
    const hasDays = buyer.deliveryDays && buyer.deliveryDays.length > 0;
    const hasCycle = Number(buyer.deliveryCycleDays) > 1 && buyer.deliveryCycleStartDate;
    let scheduleType = 'daily';
    if (hasDays) scheduleType = 'specific_days';
    else if (hasCycle) scheduleType = 'cycle';
    const startDate = buyer.deliveryCycleStartDate
      ? new Date(buyer.deliveryCycleStartDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setFormData({
      name: buyer.name || '',
      mobile: buyer.phone || '',
      email: buyer.email || '',
      milkFixedPrice: buyer.fixedPrice != null ? String(buyer.fixedPrice) : '',
      dailyMilkQuantity: buyer.dailyQuantity != null ? String(buyer.dailyQuantity) : '',
      milkSource: (buyer.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(buyer.milkSource)) ? buyer.milkSource : 'cow',
      deliveryScheduleType: scheduleType,
      deliveryDays: Array.isArray(buyer.deliveryDays) ? [...buyer.deliveryDays] : [],
      deliveryCycleDays: buyer.deliveryCycleDays ? String(buyer.deliveryCycleDays) : '2',
      deliveryCycleStartDate: startDate,
    });
    setShowEditForm(true);
  };

  const handleUpdateBuyer = async () => {
    if (!editingBuyer?.userId) {
      Alert.alert('Error', 'Cannot update this buyer.');
      return;
    }
    if (!formData.name || !formData.mobile) {
      Alert.alert('Error', 'Please fill name and mobile number');
      return;
    }
    if (!/^[0-9]{10}$/.test(formData.mobile.trim())) {
      Alert.alert('Error', 'Mobile must be exactly 10 digits');
      return;
    }
    if (formData.deliveryScheduleType === 'specific_days' && (!formData.deliveryDays || formData.deliveryDays.length === 0)) {
      Alert.alert('Error', 'Select at least one delivery day');
      return;
    }
    if (formData.deliveryScheduleType === 'cycle' && !formData.deliveryCycleStartDate?.trim()) {
      Alert.alert('Error', 'Enter start date for delivery cycle');
      return;
    }
    try {
      setLoading(true);
      const fixedPrice = formData.milkFixedPrice?.trim() ? parseFloat(formData.milkFixedPrice) : undefined;
      const dailyQuantity = formData.dailyMilkQuantity?.trim() ? parseFloat(formData.dailyMilkQuantity) : undefined;
      await userService.updateUser(editingBuyer.userId, {
        name: formData.name.trim(),
        email: formData.email?.trim() || '',
        mobile: formData.mobile.trim(),
        milkFixedPrice: fixedPrice,
        dailyMilkQuantity: dailyQuantity,
      });
      const deliveryPayload = {};
      if (formData.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(formData.milkSource)) {
        deliveryPayload.milkSource = formData.milkSource;
      }
      if (formData.deliveryScheduleType === 'daily') {
        deliveryPayload.deliveryDays = [];
        deliveryPayload.deliveryCycleDays = null;
        deliveryPayload.deliveryCycleStartDate = null;
      } else if (formData.deliveryScheduleType === 'specific_days') {
        deliveryPayload.deliveryDays = formData.deliveryDays && formData.deliveryDays.length ? formData.deliveryDays : [];
        deliveryPayload.deliveryCycleDays = null;
        deliveryPayload.deliveryCycleStartDate = null;
      } else {
        const cycleDays = parseInt(formData.deliveryCycleDays, 10) || 2;
        deliveryPayload.deliveryDays = null;
        deliveryPayload.deliveryCycleDays = cycleDays;
        deliveryPayload.deliveryCycleStartDate = formData.deliveryCycleStartDate
          ? new Date(formData.deliveryCycleStartDate).toISOString()
          : null;
      }
      if (editingBuyer._id) {
        await buyerService.updateBuyer(editingBuyer._id, deliveryPayload);
      }
      setShowEditForm(false);
      setEditingBuyer(null);
      await loadData(true);
      Alert.alert('Success', 'Buyer updated successfully!');
    } catch (error) {
      console.error('Failed to update buyer:', error);
      Alert.alert('Error', error.message || 'Failed to update buyer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBuyer = async () => {
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
    if (formData.deliveryScheduleType === 'specific_days' && (!formData.deliveryDays || formData.deliveryDays.length === 0)) {
      Alert.alert('Error', 'Select at least one delivery day');
      return;
    }
    if (formData.deliveryScheduleType === 'cycle' && !formData.deliveryCycleStartDate?.trim()) {
      Alert.alert('Error', 'Enter start date for delivery cycle');
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
      
      // Create buyer with fixed password 123456#
      const milkSource = (formData.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(formData.milkSource)) ? formData.milkSource : 'cow';
      await authService.signup(
        formData.name.trim(),
        formData.email.trim() || '',
        '123456#', // Fixed password
        formData.mobile.trim(),
        undefined, // gender
        undefined, // address
        fixedPrice,
        dailyQuantity,
        2, // role: CONSUMER (Buyer)
        milkSource
      );

      await loadData(true);

      // Apply delivery schedule: find new buyer by mobile and update
      const deliveryPayload = {};
      if (formData.deliveryScheduleType === 'daily') {
        deliveryPayload.deliveryDays = [];
        deliveryPayload.deliveryCycleDays = null;
        deliveryPayload.deliveryCycleStartDate = null;
      } else if (formData.deliveryScheduleType === 'specific_days') {
        deliveryPayload.deliveryDays = formData.deliveryDays && formData.deliveryDays.length ? formData.deliveryDays : [];
        deliveryPayload.deliveryCycleDays = null;
        deliveryPayload.deliveryCycleStartDate = null;
      } else {
        const cycleDays = parseInt(formData.deliveryCycleDays, 10) || 2;
        deliveryPayload.deliveryDays = null;
        deliveryPayload.deliveryCycleDays = cycleDays;
        deliveryPayload.deliveryCycleStartDate = formData.deliveryCycleStartDate
          ? new Date(formData.deliveryCycleStartDate).toISOString()
          : null;
      }
      const mobileTrim = formData.mobile.trim();
      const allBuyers = await buyerService.getBuyers(false);
      const newBuyer = allBuyers.find((b) => (b.mobile || '').toString().trim() === mobileTrim);
      if (newBuyer && newBuyer._id) {
        const updatePayload = { ...deliveryPayload };
        if (milkSource) updatePayload.milkSource = milkSource;
        await buyerService.updateBuyer(newBuyer._id, updatePayload);
      }

      // Reset form
      setFormData({
        name: '', mobile: '', email: '', milkFixedPrice: '', dailyMilkQuantity: '', milkSource: 'cow',
        deliveryScheduleType: 'daily', deliveryDays: [], deliveryCycleDays: '2',
        deliveryCycleStartDate: new Date().toISOString().slice(0, 10),
      });
      setShowAddForm(false);
      await loadData(true);

      Alert.alert('Success', 'Buyer created successfully!');
    } catch (error) {
      console.error('Failed to create buyer:', error);
      Alert.alert('Error', error.message || 'Failed to create buyer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Buyers"
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
          <Text style={styles.addButtonText}>+ Add New Buyer</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.centerContainer}>
            <Text style={styles.loadingText}>Loading buyers...</Text>
          </View>
        ) : buyers.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No buyers found</Text>
            <Text style={styles.emptySubtext}>Click "Add New Buyer" to create a buyer</Text>
          </View>
        ) : (
          <>
            <View style={styles.buyerListTabs}>
              <TouchableOpacity
                style={[styles.buyerListTab, buyerFilterTab === 'active' && styles.buyerListTabActive]}
                onPress={() => { setBuyerFilterTab('active'); setSelectedBuyer(null); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.buyerListTabText, buyerFilterTab === 'active' && styles.buyerListTabTextActive]}>
                  Active ({buyers.filter((b) => b.active).length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buyerListTab, buyerFilterTab === 'inactive' && styles.buyerListTabActive]}
                onPress={() => { setBuyerFilterTab('inactive'); setSelectedBuyer(null); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.buyerListTabText, buyerFilterTab === 'inactive' && styles.buyerListTabTextActive]}>
                  Inactive ({buyers.filter((b) => !b.active).length})
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle} numberOfLines={2}>
                {buyerFilterTab === 'active' ? 'Active' : 'Inactive'} Buyers
              </Text>
              <Text style={styles.summaryValue}>{filteredBuyers.length}</Text>
            </View>

            {filteredBuyers.length === 0 ? (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>
                  No {buyerFilterTab === 'active' ? 'active' : 'inactive'} buyers.
                </Text>
              </View>
            ) : filteredBuyers.map((buyer, index) => {
              const buyerTransactions = getBuyerTransactions(buyer.phone);
              const buyerPaymentTransactions = getBuyerPaymentTransactions(buyer.phone);
              const isExpanded = selectedBuyer === buyer.phone;

              return (
                <View key={index} style={styles.buyerCard}>
                  <TouchableOpacity
                    onPress={() => {
                      if (isExpanded) {
                        setSelectedBuyer(null);
                      } else {
                        setSelectedBuyer(buyer.phone);
                        setLogTab('milk');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.buyerHeader}>
                      <View style={styles.buyerHeaderLeft}>
                        <Text style={styles.buyerName}>{buyer.name}</Text>
                        <Text style={styles.buyerPhone}>{buyer.phone}</Text>
                      </View>
                      <View style={styles.buyerHeaderRight}>
                        {canEditUsers && buyer._id != null && (
                          <View style={styles.activeRow}>
                            <Text style={styles.activeLabel}>{buyer.active ? 'Active' : 'Inactive'}</Text>
                            <Switch
                              value={buyer.active}
                              onValueChange={async (value) => {
                                const prevData = buyersData;
                                setBuyersData((prev) =>
                                  prev.map((b) =>
                                    (b._id === buyer._id || b._id?.toString() === buyer._id?.toString())
                                      ? { ...b, active: value }
                                      : b
                                  )
                                );
                                try {
                                  await buyerService.updateBuyerActive(buyer._id, value);
                                } catch (e) {
                                  setBuyersData(prevData);
                                  Alert.alert('Error', e?.message || 'Failed to update.');
                                }
                              }}
                              trackColor={{ false: '#ccc', true: '#81c784' }}
                              thumbColor="#fff"
                            />
                          </View>
                        )}
                        <View style={styles.buyerActionsRow}>
                          {canEditUsers && buyer.userId && (
                            <TouchableOpacity
                              style={styles.editButton}
                              onPress={() => openEditForm(buyer)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.editButtonText}>Edit</Text>
                            </TouchableOpacity>
                          )}
                          {canEditUsers && buyer._id && !buyer.isAlsoSeller && (
                            <TouchableOpacity
                              style={styles.addAsSellerButton}
                              onPress={async () => {
                                setAddAsSellerLoading(buyer._id);
                                try {
                                  await sellerService.addSellerFromBuyer(buyer._id);
                                  await loadData(true);
                                  Alert.alert('Done', `${buyer.name} is now also in Seller list. Payment & milk can be managed from both Buyer and Seller screens.`);
                                } catch (e) {
                                  Alert.alert('Error', e?.message || 'Failed to add as seller.');
                                } finally {
                                  setAddAsSellerLoading(null);
                                }
                              }}
                              disabled={!!addAsSellerLoading}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.addAsSellerButtonText}>
                                {addAsSellerLoading === buyer._id ? '...' : 'Add as Seller'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {buyer.isAlsoSeller && (
                            <Text style={styles.alsoSellerBadge}>Buyer + Seller</Text>
                          )}
                        </View>
                        <Text style={styles.buyerAmount}>{formatCurrency(buyer.totalAmount)}</Text>
                        <Text style={styles.buyerQuantity}>{buyer.totalQuantity.toFixed(2)} L</Text>
                        <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                      </View>
                    </View>
                    <View style={styles.buyerStats}>
                      <Text style={styles.statText}>
                        {buyer.transactionCount} Transaction{buyer.transactionCount !== 1 ? 's' : ''}
                      </Text>
                      {buyer.lastTransactionDate && (
                        <Text style={styles.statText}>
                          Last: {formatDate(buyer.lastTransactionDate)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.pendingRow}>
                      <Text style={styles.pendingLabel}>Balance: </Text>
                      <Text
                        style={[
                          styles.pendingAmount,
                          (buyer.pendingBalance || 0) > 0 && styles.pendingAmountDue,
                          (buyer.pendingBalance || 0) < 0 && styles.pendingAmountAdvance,
                        ]}
                      >
                        {(buyer.pendingBalance || 0) > 0
                          ? `${formatCurrency(buyer.pendingBalance)} pending`
                          : (buyer.pendingBalance || 0) < 0
                            ? `${formatCurrency(-buyer.pendingBalance)} advance`
                            : 'Settled'}
                      </Text>
                    </View>
                    {(buyer.fixedPrice || buyer.dailyQuantity || buyer.milkSource) && (
                      <View style={styles.buyerDetails}>
                        {buyer.milkSource && (
                          <Text style={styles.buyerDetailText}>
                            Milk: {MILK_SOURCE_TYPES.find((s) => s.value === buyer.milkSource)?.label || buyer.milkSource}
                          </Text>
                        )}
                        {buyer.fixedPrice && (
                          <Text style={styles.buyerDetailText}>
                            Fixed Price: {formatCurrency(buyer.fixedPrice)}/L
                          </Text>
                        )}
                        {buyer.dailyQuantity && (
                          <Text style={styles.buyerDetailText}>
                            Daily Quantity: {buyer.dailyQuantity.toFixed(2)} L
                          </Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.transactionsContainer}>
                      <View style={styles.logTabs}>
                        <TouchableOpacity
                          style={[styles.logTab, logTab === 'milk' && styles.logTabActive]}
                          onPress={() => setLogTab('milk')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.logTabText, logTab === 'milk' && styles.logTabTextActive]}>
                            Milk Transactions ({buyerTransactions.length})
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.logTab, logTab === 'payments' && styles.logTabActive]}
                          onPress={() => setLogTab('payments')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.logTabText, logTab === 'payments' && styles.logTabTextActive]}>
                            Payment Transactions ({buyerPaymentTransactions.length})
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {logTab === 'milk' && (
                        <>
                          {canEditUsers && (
                            <TouchableOpacity
                              style={styles.addMilkTxButton}
                              onPress={() => openAddMilkModal(buyer)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.addMilkTxButtonText}>+ Add Milk Transaction</Text>
                            </TouchableOpacity>
                          )}
                          {buyerTransactions.length > 0 ? (
                            buyerTransactions.map((tx) => (
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
                            ))
                          ) : (
                            <Text style={styles.noLogsText}>No milk transactions yet.</Text>
                          )}
                        </>
                      )}

                      {logTab === 'payments' && (
                        <>
                          {canEditUsers && (
                            <TouchableOpacity
                              style={styles.addMilkTxButton}
                              onPress={() => openAddPaymentModal(buyer)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.addMilkTxButtonText}>+ Add Payment</Text>
                            </TouchableOpacity>
                          )}
                          {buyerPaymentTransactions.length > 0 ? (
                            buyerPaymentTransactions.map((pay) => (
                              <View key={pay._id} style={styles.transactionItem}>
                                <View style={styles.transactionRow}>
                                  <Text style={styles.transactionDate}>{formatDate(pay.paymentDate)}</Text>
                                  <Text style={styles.transactionAmount}>{formatCurrency(pay.amount)}</Text>
                                </View>
                                <View style={styles.transactionRow}>
                                  <Text style={styles.transactionDetails}>
                                    {[pay.paymentType, pay.paymentDirection].filter(Boolean).join(' · ') || 'Payment'}
                                  </Text>
                                </View>
                                {pay.notes ? <Text style={styles.transactionNotes}>{pay.notes}</Text> : null}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.noLogsText}>No payment transactions yet.</Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Edit Buyer Modal */}
      <Modal
        visible={showEditForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setShowEditForm(false); setEditingBuyer(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Buyer</Text>
              <TouchableOpacity
                onPress={() => { setShowEditForm(false); setEditingBuyer(null); }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formContainer}>
              <Text style={styles.label}>Name *</Text>
              <Input
                placeholder="Enter buyer name"
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

              <Text style={styles.label}>Milk source *</Text>
              <View style={styles.milkSourceRow}>
                {MILK_SOURCE_TYPES.map((src) => {
                  const isActive = formData.milkSource === src.value;
                  return (
                    <TouchableOpacity
                      key={src.value}
                      style={[styles.milkSourceButton, isActive && styles.milkSourceButtonActive]}
                      onPress={() => setFormData({ ...formData, milkSource: src.value })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.milkSourceButtonText, isActive && styles.milkSourceButtonTextActive]}>
                        {src.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Delivery schedule (Quick Sale)</Text>
              <Text style={styles.hint}>Choose when this buyer gets milk. They will appear in Quick Sale only on these days.</Text>
              <View style={styles.scheduleTypeRow}>
                {['daily', 'specific_days', 'cycle'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.scheduleTypeBtn, formData.deliveryScheduleType === type && styles.scheduleTypeBtnActive]}
                    onPress={() => setFormData({ ...formData, deliveryScheduleType: type })}
                  >
                    <Text style={[styles.scheduleTypeBtnText, formData.deliveryScheduleType === type && styles.scheduleTypeBtnTextActive]}>
                      {type === 'daily' ? 'Daily' : type === 'specific_days' ? 'Specific days' : 'Every N days'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {formData.deliveryScheduleType === 'specific_days' && (
                <View style={styles.daysRow}>
                  {DAY_LABELS.map((label, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.dayChip, formData.deliveryDays && formData.deliveryDays.includes(idx) && styles.dayChipActive]}
                      onPress={() => {
                        const current = formData.deliveryDays || [];
                        const next = current.includes(idx) ? current.filter((d) => d !== idx) : [...current, idx].sort((a, b) => a - b);
                        setFormData({ ...formData, deliveryDays: next });
                      }}
                    >
                      <Text style={[styles.dayChipText, formData.deliveryDays && formData.deliveryDays.includes(idx) && styles.dayChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {formData.deliveryScheduleType === 'cycle' && (
                <View style={styles.cycleRow}>
                  <View style={styles.cycleField}>
                    <Text style={styles.sublabel}>Every</Text>
                    <View style={styles.cycleSelectRow}>
                      {[2, 3].map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[styles.cycleOption, formData.deliveryCycleDays === String(n) && styles.cycleOptionActive]}
                          onPress={() => setFormData({ ...formData, deliveryCycleDays: String(n) })}
                        >
                          <Text style={[styles.cycleOptionText, formData.deliveryCycleDays === String(n) && styles.cycleOptionTextActive]}>
                            {n === 2 ? '2nd day' : '3rd day'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.cycleField}>
                    <Text style={styles.sublabel}>Start date</Text>
                    <Input
                      placeholder="YYYY-MM-DD"
                      value={formData.deliveryCycleStartDate}
                      onChangeText={(text) => setFormData({ ...formData, deliveryCycleStartDate: text })}
                      style={styles.input}
                    />
                  </View>
                </View>
              )}

              <Button
                title={loading ? 'Updating...' : 'Update Buyer'}
                onPress={handleUpdateBuyer}
                disabled={loading}
                style={styles.createButton}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Buyer Modal */}
      <Modal
        visible={showAddForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Buyer</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddForm(false);
                  setFormData({
                    name: '', mobile: '', email: '', milkFixedPrice: '', dailyMilkQuantity: '', milkSource: 'cow',
                    deliveryScheduleType: 'daily', deliveryDays: [], deliveryCycleDays: '2',
                    deliveryCycleStartDate: new Date().toISOString().slice(0, 10),
                  });
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.label}>Name *</Text>
              <Input
                placeholder="Enter buyer name"
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

              <Text style={styles.label}>Milk source *</Text>
              <View style={styles.milkSourceRow}>
                {MILK_SOURCE_TYPES.map((src) => {
                  const isActive = formData.milkSource === src.value;
                  return (
                    <TouchableOpacity
                      key={src.value}
                      style={[styles.milkSourceButton, isActive && styles.milkSourceButtonActive]}
                      onPress={() => setFormData({ ...formData, milkSource: src.value })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.milkSourceButtonText, isActive && styles.milkSourceButtonTextActive]}>
                        {src.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Delivery schedule (Quick Sale)</Text>
              <Text style={styles.hint}>Choose when this buyer gets milk. They will appear in Quick Sale only on these days.</Text>
              <View style={styles.scheduleTypeRow}>
                {['daily', 'specific_days', 'cycle'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.scheduleTypeBtn, formData.deliveryScheduleType === type && styles.scheduleTypeBtnActive]}
                    onPress={() => setFormData({ ...formData, deliveryScheduleType: type })}
                  >
                    <Text style={[styles.scheduleTypeBtnText, formData.deliveryScheduleType === type && styles.scheduleTypeBtnTextActive]}>
                      {type === 'daily' ? 'Daily' : type === 'specific_days' ? 'Specific days' : 'Every N days'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {formData.deliveryScheduleType === 'specific_days' && (
                <View style={styles.daysRow}>
                  {DAY_LABELS.map((label, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.dayChip, formData.deliveryDays && formData.deliveryDays.includes(idx) && styles.dayChipActive]}
                      onPress={() => {
                        const current = formData.deliveryDays || [];
                        const next = current.includes(idx) ? current.filter((d) => d !== idx) : [...current, idx].sort((a, b) => a - b);
                        setFormData({ ...formData, deliveryDays: next });
                      }}
                    >
                      <Text style={[styles.dayChipText, formData.deliveryDays && formData.deliveryDays.includes(idx) && styles.dayChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {formData.deliveryScheduleType === 'cycle' && (
                <View style={styles.cycleRow}>
                  <View style={styles.cycleField}>
                    <Text style={styles.sublabel}>Every</Text>
                    <View style={styles.cycleSelectRow}>
                      {[2, 3].map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[styles.cycleOption, formData.deliveryCycleDays === String(n) && styles.cycleOptionActive]}
                          onPress={() => setFormData({ ...formData, deliveryCycleDays: String(n) })}
                        >
                          <Text style={[styles.cycleOptionText, formData.deliveryCycleDays === String(n) && styles.cycleOptionTextActive]}>
                            {n === 2 ? '2nd day' : '3rd day'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.cycleField}>
                    <Text style={styles.sublabel}>Start date</Text>
                    <Input
                      placeholder="YYYY-MM-DD"
                      value={formData.deliveryCycleStartDate}
                      onChangeText={(text) => setFormData({ ...formData, deliveryCycleStartDate: text })}
                      style={styles.input}
                    />
                  </View>
                </View>
              )}

              <Text style={styles.infoText}>
                Password will be set to: 123456#
              </Text>

              <Button
                title={loading ? 'Creating...' : 'Create Buyer'}
                onPress={handleCreateBuyer}
                disabled={loading}
                style={styles.createButton}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Milk Transaction Modal */}
      <Modal
        visible={showAddMilkModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setShowAddMilkModal(false); setAddMilkBuyer(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Milk Transaction</Text>
              <TouchableOpacity
                onPress={() => { setShowAddMilkModal(false); setAddMilkBuyer(null); }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {addMilkBuyer && (
              <View style={styles.addMilkBuyerInfo}>
                <Text style={styles.addMilkBuyerName}>{addMilkBuyer.name}</Text>
                <Text style={styles.addMilkBuyerPhone}>{addMilkBuyer.phone}</Text>
                <View style={styles.addMilkSourceRow}>
                  <Text style={styles.addMilkSourceLabel}>Milk source (from buyer):</Text>
                  <Text style={styles.addMilkBuyerMilkSource}>
                    {MILK_SOURCE_TYPES.find((s) => s.value === (addMilkBuyer.milkSource || 'cow'))?.label || String(addMilkBuyer.milkSource || 'cow').charAt(0).toUpperCase() + String(addMilkBuyer.milkSource || 'cow').slice(1)}
                  </Text>
                </View>
              </View>
            )}
            <ScrollView style={styles.formContainer}>
              <Text style={styles.label}>Quantity (L) *</Text>
              <Input
                placeholder="e.g. 10"
                value={milkTxForm.quantity}
                onChangeText={(text) => setMilkTxForm((f) => ({ ...f, quantity: text }))}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.label}>Date (YYYY-MM-DD) *</Text>
              <Input
                placeholder="e.g. 2025-02-18"
                value={milkTxForm.date}
                onChangeText={(text) => setMilkTxForm((f) => ({ ...f, date: text }))}
                style={styles.input}
              />
              <Text style={styles.label}>Rate (₹/L) *</Text>
              <Input
                placeholder="e.g. 55"
                value={milkTxForm.pricePerLiter}
                onChangeText={(text) => setMilkTxForm((f) => ({ ...f, pricePerLiter: text }))}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              {milkTxForm.quantity && milkTxForm.pricePerLiter && (
                <Text style={styles.totalPreview}>
                  Total: {formatCurrency(
                    (parseFloat(milkTxForm.quantity) || 0) * (parseFloat(milkTxForm.pricePerLiter) || 0)
                  )}
                </Text>
              )}
              <Button
                title={addMilkLoading ? 'Adding...' : 'Add Transaction'}
                onPress={handleAddMilkTransaction}
                disabled={addMilkLoading}
                style={styles.createButton}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Payment Modal */}
      <Modal
        visible={showAddPaymentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setShowAddPaymentModal(false); setAddPaymentBuyer(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Payment</Text>
              <TouchableOpacity
                onPress={() => { setShowAddPaymentModal(false); setAddPaymentBuyer(null); }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {addPaymentBuyer && (
              <View style={styles.addMilkBuyerInfo}>
                <Text style={styles.addMilkBuyerName}>{addPaymentBuyer.name}</Text>
                <Text style={styles.addMilkBuyerPhone}>{addPaymentBuyer.phone}</Text>
              </View>
            )}
            <ScrollView style={styles.formContainer}>
              <Text style={styles.label}>Amount (₹) *</Text>
              <Input
                placeholder="e.g. 500"
                value={paymentForm.amount}
                onChangeText={(text) => setPaymentForm((f) => ({ ...f, amount: text }))}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.label}>Date (YYYY-MM-DD) *</Text>
              <Input
                placeholder="e.g. 2025-02-18"
                value={paymentForm.date}
                onChangeText={(text) => setPaymentForm((f) => ({ ...f, date: text }))}
                style={styles.input}
              />
              <Button
                title={addPaymentLoading ? 'Adding...' : 'Add Payment'}
                onPress={handleAddPaymentTransaction}
                disabled={addPaymentLoading}
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
  buyerListTabs: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 10,
    padding: 4,
  },
  buyerListTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  buyerListTabActive: {
    backgroundColor: '#4CAF50',
  },
  buyerListTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  buyerListTabTextActive: {
    color: '#FFFFFF',
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
  buyerCard: {
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
  buyerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  buyerHeaderLeft: {
    flex: 1,
  },
  buyerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  buyerPhone: {
    fontSize: 14,
    color: '#666',
  },
  buyerHeaderRight: {
    alignItems: 'flex-end',
  },
  buyerAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  buyerQuantity: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  expandIcon: {
    fontSize: 12,
    color: '#666',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  activeLabel: {
    fontSize: 12,
    color: '#555',
    marginRight: 6,
  },
  buyerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 6,
    gap: 6,
  },
  editButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  addAsSellerButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addAsSellerButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  alsoSellerBadge: {
    fontSize: 11,
    color: '#1976D2',
    fontWeight: '600',
  },
  buyerStats: {
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
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  pendingLabel: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  pendingAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  pendingAmountDue: {
    color: '#D32F2F',
  },
  pendingAmountAdvance: {
    color: '#2E7D32',
  },
  transactionsContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  logTabs: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#E8E8E8',
    borderRadius: 8,
    padding: 4,
  },
  logTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  logTabActive: {
    backgroundColor: '#2196F3',
  },
  logTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  logTabTextActive: {
    color: '#FFFFFF',
  },
  noLogsText: {
    fontSize: 13,
    color: '#777',
    marginTop: 4,
    marginBottom: 8,
  },
  addMilkTxButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  addMilkTxButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addMilkBuyerInfo: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  addMilkBuyerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  addMilkBuyerPhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  addMilkSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    gap: 8,
  },
  addMilkSourceLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  addMilkBuyerMilkSource: {
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '700',
  },
  totalPreview: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 12,
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
  hint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  scheduleTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  scheduleTypeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  scheduleTypeBtnActive: {
    backgroundColor: '#4CAF50',
  },
  scheduleTypeBtnText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  scheduleTypeBtnTextActive: {
    color: '#fff',
  },
  milkSourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  milkSourceButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  milkSourceButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  milkSourceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  milkSourceButtonTextActive: {
    color: '#FFFFFF',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  dayChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  dayChipActive: {
    backgroundColor: '#2196F3',
  },
  dayChipText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: '#fff',
  },
  cycleRow: {
    marginBottom: 12,
  },
  cycleField: {
    marginBottom: 10,
  },
  sublabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  cycleSelectRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  cycleOption: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  cycleOptionActive: {
    backgroundColor: '#4CAF50',
  },
  cycleOptionText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  cycleOptionTextActive: {
    color: '#fff',
  },
  createButton: {
    marginTop: 10,
    marginBottom: 10,
  },
  buyerDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  buyerDetailText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
});

