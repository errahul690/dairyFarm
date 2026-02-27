import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currencyUtils';
import { milkService } from '../../services/milk/milkService';
import { buyerService } from '../../services/buyers/buyerService';
import { sellerService } from '../../services/sellers/sellerService';
import { MILK_SOURCE_TYPES } from '../../constants';

/**
 * Unified Milk Screen
 * Manage both milk sales and purchase transactions
 */
export default function MilkScreen({ onNavigate, onLogout, openAddSale, onConsumedNavParam }) {
  const [transactionType, setTransactionType] = useState('purchase');
  const [transactions, setTransactions] = useState([]);
  const [buyers, setBuyers] = useState([]); // Buyers from buyers table
  const [sellers, setSellers] = useState([]); // Sellers from sellers table
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showBuyerList, setShowBuyerList] = useState(false);
  const [showSellerList, setShowSellerList] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [buyersForModal, setBuyersForModal] = useState([]);
  const [sellersForModal, setSellersForModal] = useState([]);
  const [buyerSearchQuery, setBuyerSearchQuery] = useState('');
  const [sellerSearchQuery, setSellerSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    pricePerLiter: '',
    contactName: '',
    contactPhone: '',
    notes: '',
    paymentType: 'cash',
    amountReceived: '',
    milkSource: 'cow',
  });

  // Load transactions, buyers, and sellers on mount
  useEffect(() => {
    loadTransactions();
    loadBuyers();
    loadSellers();
  }, []);

  // Quick-add sale from Dashboard FAB
  useEffect(() => {
    if (openAddSale) {
      setTransactionType('sale');
      setShowForm(true);
      setShowContactDropdown(false);
      onConsumedNavParam?.();
    }
  }, [openAddSale, onConsumedNavParam]);

  const loadBuyers = async () => {
    try {
      console.log('[MilkScreen] Starting to load buyers...');
      // Load buyers from buyers table (active only for sale list)
      const data = await buyerService.getBuyers(true);
      console.log('[MilkScreen] Received buyers data:', data);
      console.log('[MilkScreen] Buyers count:', data?.length || 0);
      
      const buyersList = Array.isArray(data) ? data : [];
      console.log('[MilkScreen] Setting buyers to state:', buyersList.length);
      setBuyers(buyersList);
      return buyersList;
    } catch (error) {
      console.error('[MilkScreen] Failed to load buyers:', error);
      console.error('[MilkScreen] Error stack:', error.stack);
      Alert.alert('Error', `Failed to load buyers: ${error.message || 'Unknown error'}`);
      setBuyers([]);
      return [];
    }
  };

  const loadSellers = async () => {
    try {
      console.log('[MilkScreen] Starting to load sellers...');
      // Load sellers from sellers table
      const data = await sellerService.getSellers();
      console.log('[MilkScreen] Received sellers data:', data);
      console.log('[MilkScreen] Sellers count:', data?.length || 0);
      
      const sellersList = Array.isArray(data) ? data : [];
      console.log('[MilkScreen] Setting sellers to state:', sellersList.length);
      setSellers(sellersList);
      return sellersList;
    } catch (error) {
      console.error('[MilkScreen] Failed to load sellers:', error);
      console.error('[MilkScreen] Error stack:', error.stack);
      // Don't show alert for sellers, just log it
      setSellers([]);
      return [];
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await milkService.getTransactions();
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      Alert.alert('Error', 'Failed to load transactions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Get contacts from buyers/sellers table and from transactions (optimized with useMemo)
  const contacts = useMemo(() => {
    const contactMap = new Map();
    
    // Add contacts from buyers table (for sales)
    if (transactionType === 'sale') {
      buyers.forEach((buyer) => {
        if (buyer.mobile) {
          const key = buyer.mobile.trim();
          contactMap.set(key, {
            name: buyer.name,
            phone: buyer.mobile,
            fixedPrice: buyer.rate, // rate from buyers table
            dailyQuantity: buyer.quantity, // quantity from buyers table
          });
        }
      });
    }
    
    // Add contacts from sellers table (for purchases)
    if (transactionType === 'purchase') {
      sellers.forEach((seller) => {
        if (seller.mobile) {
          const key = seller.mobile.trim();
          contactMap.set(key, {
            name: seller.name,
            phone: seller.mobile,
            fixedPrice: seller.rate, // rate from sellers table
            dailyQuantity: seller.quantity, // quantity from sellers table
          });
        }
      });
    }
    
    // Add contacts from transactions (to include customers who might not be in buyers/sellers table)
    transactions.forEach((tx) => {
      if (transactionType === 'sale' && tx.buyerPhone) {
        const key = tx.buyerPhone.trim();
        if (!contactMap.has(key)) {
          contactMap.set(key, {
            name: tx.buyer || 'Unknown',
            phone: tx.buyerPhone,
          });
        }
      } else if (transactionType === 'purchase' && tx.sellerPhone) {
        const key = tx.sellerPhone.trim();
        if (!contactMap.has(key)) {
          contactMap.set(key, {
            name: tx.seller || 'Unknown',
            phone: tx.sellerPhone,
          });
        }
      }
    });
    
    // Convert map to array and sort by name
    return Array.from(contactMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [buyers, sellers, transactions, transactionType]);

  // Filtered buyers based on search query
  const filteredBuyers = useMemo(() => {
    const buyersToFilter = buyersForModal.length > 0 ? buyersForModal : buyers;
    if (!buyerSearchQuery.trim()) {
      return buyersToFilter;
    }
    const query = buyerSearchQuery.toLowerCase().trim();
    return buyersToFilter.filter((buyer) => {
      const nameMatch = buyer.name?.toLowerCase().includes(query);
      const mobileMatch = buyer.mobile?.toLowerCase().includes(query);
      return nameMatch || mobileMatch;
    });
  }, [buyersForModal, buyers, buyerSearchQuery]);

  // Filtered sellers based on search query
  const filteredSellers = useMemo(() => {
    const sellersToFilter = sellersForModal.length > 0 ? sellersForModal : sellers;
    if (!sellerSearchQuery.trim()) {
      return sellersToFilter;
    }
    const query = sellerSearchQuery.toLowerCase().trim();
    return sellersToFilter.filter((seller) => {
      const nameMatch = seller.name?.toLowerCase().includes(query);
      const mobileMatch = seller.mobile?.toLowerCase().includes(query);
      return nameMatch || mobileMatch;
    });
  }, [sellersForModal, sellers, sellerSearchQuery]);

  const handleAddTransaction = async () => {
    // Validation
    if (!formData.quantity || !formData.pricePerLiter || !formData.contactName) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    const quantity = parseFloat(formData.quantity);
    const pricePerLiter = parseFloat(formData.pricePerLiter);

    // Better validation
    if (isNaN(quantity) || quantity <= 0) {
      Alert.alert('Error', 'Please enter a valid quantity (greater than 0)');
      return;
    }

    if (isNaN(pricePerLiter) || pricePerLiter <= 0) {
      Alert.alert('Error', 'Please enter a valid price per liter (greater than 0)');
      return;
    }

    // Date validation
    const selectedDate = new Date(formData.date);
    if (isNaN(selectedDate.getTime())) {
      Alert.alert('Error', 'Please enter a valid date');
      return;
    }

    // Phone validation (optional but check format if provided)
    if (formData.contactPhone && formData.contactPhone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number (at least 10 digits)');
      return;
    }

    if (formData.paymentType === 'cash') {
      const amt = parseFloat(formData.amountReceived);
      if (!formData.amountReceived || isNaN(amt) || amt < 0) {
        Alert.alert('Error', 'Please enter amount received (Cash)');
        return;
      }
    }

    try {
      setLoading(true);
      const totalAmount = quantity * pricePerLiter;

      // Get buyer's/seller's fixed price for reference
      let fixedPrice = undefined;
      if (transactionType === 'sale' && formData.contactPhone) {
        const buyer = buyers.find((b) => b.mobile?.trim() === formData.contactPhone.trim());
        if (buyer && buyer.rate) {
          fixedPrice = buyer.rate;
        }
      } else if (transactionType === 'purchase' && formData.contactPhone) {
        const seller = sellers.find((s) => s.mobile?.trim() === formData.contactPhone.trim());
        if (seller && seller.rate) {
          fixedPrice = seller.rate;
        }
      }

      const transactionData = {
        type: editingTransaction ? editingTransaction.type : transactionType,
        date: new Date(formData.date),
        quantity: quantity,
        pricePerLiter: pricePerLiter,
        totalAmount: totalAmount,
        [editingTransaction ? (editingTransaction.type === 'sale' ? 'buyer' : 'seller') : (transactionType === 'sale' ? 'buyer' : 'seller')]: formData.contactName,
        [editingTransaction ? (editingTransaction.type === 'sale' ? 'buyerPhone' : 'sellerPhone') : (transactionType === 'sale' ? 'buyerPhone' : 'sellerPhone')]: formData.contactPhone || undefined,
        notes: formData.notes,
        fixedPrice: fixedPrice,
        paymentType: formData.paymentType || 'cash',
        amountReceived: formData.paymentType === 'cash' && formData.amountReceived
          ? parseFloat(formData.amountReceived) : undefined,
        milkSource: formData.milkSource || 'cow',
      };
      if (transactionType === 'sale' && formData.contactPhone) {
        const buyer = buyers.find((b) => b.mobile?.trim() === formData.contactPhone.trim());
        if (buyer?.userId) transactionData.buyerId = buyer.userId;
      } else if (transactionType === 'purchase' && formData.contactPhone) {
        const seller = sellers.find((s) => s.mobile?.trim() === formData.contactPhone.trim());
        if (seller?.userId) transactionData.sellerId = seller.userId;
      }
      if (editingTransaction) {
        if (editingTransaction.buyerId) transactionData.buyerId = editingTransaction.buyerId;
        if (editingTransaction.sellerId) transactionData.sellerId = editingTransaction.sellerId;
      }

      if (editingTransaction) {
        // Update existing transaction
        if (!editingTransaction._id) {
          Alert.alert('Error', 'Transaction ID is missing. Cannot update transaction.');
          return;
        }
        console.log('[MilkScreen] Updating transaction:', { id: editingTransaction._id, type: editingTransaction.type });
        await milkService.updateTransaction(editingTransaction._id, transactionData);
        Alert.alert('Success', `Milk ${editingTransaction.type === 'sale' ? 'sale' : 'purchase'} updated successfully!`);
      } else {
        // Create new transaction
        let savedTransaction;
        if (transactionType === 'sale') {
          savedTransaction = await milkService.recordSale(transactionData);
        } else {
          savedTransaction = await milkService.recordPurchase(transactionData);
        }
        Alert.alert('Success', `Milk ${transactionType === 'sale' ? 'sale' : 'purchase'} saved to database!`);
      }

      // Reload all transactions to get the latest data from DB
      await loadTransactions();

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        quantity: '',
        pricePerLiter: '',
        contactName: '',
        contactPhone: '',
        notes: '',
        paymentType: 'cash',
        amountReceived: '',
      });
      setEditingTransaction(null);
      setShowForm(false);
    } catch (error) {
      console.error('Failed to save transaction:', error);
      Alert.alert('Error', error.message || 'Failed to save transaction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleContactSelect = (contact) => {
    // Find last transaction for this customer
    const customerPhone = contact.phone?.trim();
    let lastTransaction = null;
    let fixedPrice = contact.fixedPrice; // From buyers table
    let dailyQuantity = contact.dailyQuantity; // From buyers table

    // Find the most recent transaction for this customer
    if (customerPhone) {
      const customerTransactions = transactions.filter((tx) => {
        if (transactionType === 'sale') {
          return tx.type === 'sale' && tx.buyerPhone?.trim() === customerPhone;
        } else {
          return tx.type === 'purchase' && tx.sellerPhone?.trim() === customerPhone;
        }
      });
      
      if (customerTransactions.length > 0) {
        // Sort by date (most recent first) and get the first one
        lastTransaction = customerTransactions.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];
      }
    }
    
    // Auto-fill form with customer details
    // Priority: daily quantity > last transaction quantity
    const quantityToFill = dailyQuantity 
      ? dailyQuantity.toString() 
      : (lastTransaction ? lastTransaction.quantity.toString() : '');
    
    setFormData({
      ...formData,
      contactName: contact.name,
      contactPhone: contact.phone || '',
      // Auto-fill quantity: prefer daily quantity, else last transaction
      quantity: quantityToFill,
      // Auto-fill fixed price if available, otherwise keep empty
      pricePerLiter: fixedPrice ? fixedPrice.toString() : '',
    });
    setShowContactDropdown(false);
  };

  const handleAddNewContact = () => {
    setShowContactDropdown(false);
    // Form already has input fields, user can type new contact
  };

  const handleEdit = (transaction) => {
    console.log('[MilkScreen] handleEdit called with transaction:', { 
      _id: transaction._id, 
      type: transaction.type,
      fullTransaction: transaction 
    });
    
    if (!transaction._id) {
      Alert.alert('Error', 'Transaction ID is missing. Cannot edit this transaction.');
      return;
    }
    
    setEditingTransaction(transaction);
    // Set transactionType to match the transaction being edited
    setTransactionType(transaction.type);
    setFormData({
      date: new Date(transaction.date).toISOString().split('T')[0],
      quantity: String(transaction.quantity),
      pricePerLiter: String(transaction.pricePerLiter),
      contactName: transaction.type === 'sale' ? transaction.buyer : transaction.seller,
      contactPhone: transaction.type === 'sale' ? transaction.buyerPhone : transaction.sellerPhone,
      notes: transaction.notes || '',
      paymentType: transaction.paymentType || 'cash',
      amountReceived: transaction.amountReceived ? String(transaction.amountReceived) : '',
      milkSource: transaction.milkSource || 'cow',
    });
    setShowForm(true);
  };

  const handleUpdate = async () => {
    if (!editingTransaction) return;

    const quantity = parseFloat(formData.quantity);
    const pricePerLiter = parseFloat(formData.pricePerLiter);

    if (!quantity || quantity <= 0) {
      Alert.alert('Error', 'Please enter a valid quantity');
      return;
    }

    if (!pricePerLiter || pricePerLiter <= 0) {
      Alert.alert('Error', 'Please enter a valid price per liter');
      return;
    }

    if (!formData.contactName) {
      Alert.alert('Error', `Please enter ${transactionType === 'sale' ? 'buyer' : 'seller'} name`);
      return;
    }

    try {
      setLoading(true);
      const totalAmount = quantity * pricePerLiter;

      // Get buyer's/seller's fixed price for reference
      let fixedPrice = undefined;
      if (editingTransaction.type === 'sale' && formData.contactPhone) {
        const buyer = buyers.find((b) => b.mobile?.trim() === formData.contactPhone.trim());
        if (buyer && buyer.rate) {
          fixedPrice = buyer.rate;
        }
      } else if (editingTransaction.type === 'purchase' && formData.contactPhone) {
        const seller = sellers.find((s) => s.mobile?.trim() === formData.contactPhone.trim());
        if (seller && seller.rate) {
          fixedPrice = seller.rate;
        }
      }

      if (!editingTransaction._id) {
        Alert.alert('Error', 'Transaction ID is missing. Cannot update transaction.');
        return;
      }

      const transactionData = {
        type: editingTransaction.type,
        date: new Date(formData.date),
        quantity: quantity,
        pricePerLiter: pricePerLiter,
        totalAmount: totalAmount,
        [editingTransaction.type === 'sale' ? 'buyer' : 'seller']: formData.contactName,
        [editingTransaction.type === 'sale' ? 'buyerPhone' : 'sellerPhone']: formData.contactPhone || undefined,
        notes: formData.notes,
        fixedPrice: fixedPrice,
        paymentType: formData.paymentType || 'cash',
        amountReceived: formData.paymentType === 'cash' && formData.amountReceived
          ? parseFloat(formData.amountReceived) : undefined,
        milkSource: formData.milkSource || 'cow',
      };

      console.log('[MilkScreen] handleUpdate - Updating transaction:', { id: editingTransaction._id, type: editingTransaction.type });
      await milkService.updateTransaction(editingTransaction._id, transactionData);
      await loadTransactions();

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        quantity: '',
        pricePerLiter: '',
        contactName: '',
        contactPhone: '',
        notes: '',
        paymentType: 'cash',
        amountReceived: '',
      });
      setEditingTransaction(null);
      setShowForm(false);
      Alert.alert('Success', `Milk ${editingTransaction.type === 'sale' ? 'sale' : 'purchase'} updated successfully!`);
    } catch (error) {
      console.error('Failed to update transaction:', error);
      Alert.alert('Error', error.message || 'Failed to update transaction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (transaction) => {
    // Get transaction type from the transaction object itself
    const txType = transaction.type || transactionType;
    Alert.alert(
      `Delete ${txType === 'sale' ? 'Sale' : 'Purchase'}`,
      `Are you sure you want to delete this ${txType === 'sale' ? 'sale' : 'purchase'} record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const transactionId = transaction._id || transaction;
              await milkService.deleteTransaction(transactionId);
              await loadTransactions(); // Reload from database
              Alert.alert('Success', `${txType === 'sale' ? 'Sale' : 'Purchase'} record deleted!`);
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

  const filteredTransactions = useMemo(() => {
    let list = transactions.filter((t) => t.type === transactionType);
    if (useDateFilter && dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
        list = list.filter((t) => {
          const d = new Date(t.date);
          return d >= from && d <= to;
        });
      }
    }
    return list;
  }, [transactions, transactionType, useDateFilter, dateFrom, dateTo]);

  const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
  const totalQuantity = filteredTransactions.reduce((sum, t) => sum + t.quantity, 0);

  // Helper function to get unique contact identifier (name + phone)
  const getContactKey = (transaction) => {
    const name = transactionType === 'sale' ? transaction.buyer : transaction.seller;
    const phone = transactionType === 'sale' ? transaction.buyerPhone : transaction.sellerPhone;
    return phone ? `${name} | ${phone}` : name || '';
  };

  // Helper function to get contact display name with phone
  const getContactDisplayName = (transaction) => {
    const name = transactionType === 'sale' ? transaction.buyer : transaction.seller;
    const phone = transactionType === 'sale' ? transaction.buyerPhone : transaction.sellerPhone;
    return phone ? `${name} (${phone})` : name || '';
  };

  // Monthly sales summary by milk source (only for sales)
  const getMonthlySalesByMilkSource = () => {
    if (transactionType !== 'sale') return {};

    const [year, month] = selectedMonth.split('-').map(Number);
    const monthlySales = transactions.filter((t) => {
      if (t.type !== 'sale') return false;
      const tDate = new Date(t.date);
      return tDate.getFullYear() === year && tDate.getMonth() + 1 === month;
    });

    const sourceSummary = { cow: { quantity: 0, totalAmount: 0 }, buffalo: { quantity: 0, totalAmount: 0 }, sheep: { quantity: 0, totalAmount: 0 }, goat: { quantity: 0, totalAmount: 0 } };

    monthlySales.forEach((sale) => {
      const src = sale.milkSource || 'cow';
      if (sourceSummary[src]) {
        sourceSummary[src].quantity += sale.quantity;
        sourceSummary[src].totalAmount += sale.totalAmount;
      } else {
        sourceSummary[src] = { quantity: sale.quantity, totalAmount: sale.totalAmount };
      }
    });

    return sourceSummary;
  };

  const monthlySalesByMilkSource = getMonthlySalesByMilkSource();

  // Monthly sales summary by buyer (only for sales)
  const getMonthlySalesByBuyer = () => {
    if (transactionType !== 'sale') return {};

    const [year, month] = selectedMonth.split('-').map(Number);
    const monthlySales = transactions.filter((t) => {
      if (t.type !== 'sale' || !t.buyer) return false;
      const tDate = new Date(t.date);
      return tDate.getFullYear() === year && tDate.getMonth() + 1 === month;
    });

    const buyerSummary = {};

    monthlySales.forEach((sale) => {
      if (sale.buyer) {
        const key = getContactKey(sale);
        if (!buyerSummary[key]) {
          buyerSummary[key] = { quantity: 0, totalAmount: 0, name: sale.buyer, phone: sale.buyerPhone };
        }
        buyerSummary[key].quantity += sale.quantity;
        buyerSummary[key].totalAmount += sale.totalAmount;
      }
    });

    return buyerSummary;
  };

  const monthlySalesByBuyer = getMonthlySalesByBuyer();
  const monthlyBuyers = Object.keys(monthlySalesByBuyer).sort();

  // Get month name in Hindi/English format
  const getMonthDisplayName = (monthYear) => {
    const [year, month] = monthYear.split('-').map(Number);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return `${months[month - 1]} ${year}`;
  };

  // Generate month options (last 12 months)
  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      options.push(`${year}-${month}`);
    }
    return options;
  };

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

  // Get day-wise summary by contact (buyer for sales, seller for purchases)
  const getDayWiseSummary = (transactions) => {
    const summary = {};

    transactions.forEach((transaction) => {
      const key = getContactKey(transaction);
      const name = transactionType === 'sale' ? transaction.buyer : transaction.seller;
      const phone = transactionType === 'sale' ? transaction.buyerPhone : transaction.sellerPhone;

      if (name) {
        if (!summary[key]) {
          summary[key] = { quantity: 0, totalAmount: 0, name, phone };
        }
        summary[key].quantity += transaction.quantity;
        summary[key].totalAmount += transaction.totalAmount;
      }
    });

    return summary;
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Milk"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        {/* Transaction Type Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, transactionType === 'purchase' && styles.toggleButtonActive]}
            onPress={() => {
              setTransactionType('purchase');
              setShowContactDropdown(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, transactionType === 'purchase' && styles.toggleTextActive]}>
              Purchase
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, transactionType === 'sale' && styles.toggleButtonActive]}
            onPress={() => {
              setTransactionType('sale');
              setShowContactDropdown(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, transactionType === 'sale' && styles.toggleTextActive]}>
              Sales
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dateFilterStrip}>
          <TouchableOpacity
            style={[styles.dateFilterTab, !useDateFilter && styles.dateFilterTabActive]}
            onPress={() => setUseDateFilter(false)}
          >
            <Text style={[styles.dateFilterTabText, !useDateFilter && styles.dateFilterTabTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateFilterTab, useDateFilter && styles.dateFilterTabActive]}
            onPress={() => setUseDateFilter(true)}
          >
            <Text style={[styles.dateFilterTabText, useDateFilter && styles.dateFilterTabTextActive]}>Date</Text>
          </TouchableOpacity>
          {useDateFilter && (
            <View style={styles.dateFilterInputRow}>
              <View style={styles.dateFilterField}>
                <Text style={styles.dateFilterLabel}>From</Text>
                <Input value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" style={styles.dateFilterInput} />
              </View>
              <View style={styles.dateFilterField}>
                <Text style={styles.dateFilterLabel}>To</Text>
                <Input value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" style={styles.dateFilterInput} />
              </View>
            </View>
          )}
        </View>

        <View style={[styles.summaryCard, transactionType === 'sale' ? styles.summaryCardSale : styles.summaryCardPurchase]}>
          <Text style={styles.summaryTitle} numberOfLines={1}>
            {useDateFilter ? `Total ${transactionType === 'sale' ? 'Sales' : 'Purchases'} (period)` : `Total ${transactionType === 'sale' ? 'Sales' : 'Purchases'}`}
          </Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{formatCurrency(totalAmount)}</Text>
          <Text style={styles.summarySubtext} numberOfLines={1}>{totalQuantity.toFixed(2)} Liters</Text>
          <Text style={styles.summarySubtext} numberOfLines={1}>{filteredTransactions.length} Transactions</Text>
        </View>

        {/* Buyer List Button (only for sales) */}
        {transactionType === 'sale' && (
          <TouchableOpacity
            style={styles.buyerListButton}
            onPress={async () => {
              try {
                setBuyersLoading(true);
                const loadedBuyers = await loadBuyers(); // Reload buyers before showing list
                console.log('[MilkScreen] Loaded buyers count:', loadedBuyers.length);
                console.log('[MilkScreen] Loaded buyers data:', loadedBuyers);
                
                // Set buyers for modal explicitly
                setBuyersForModal(loadedBuyers);
                
                if (loadedBuyers.length === 0) {
                  Alert.alert(
                    'No Buyers',
                    'No buyers found. Please create buyers from the Buyer screen first.',
                    [{ text: 'OK' }]
                  );
                } else {
                  // Small delay to ensure state is set
                  setTimeout(() => {
                    setShowBuyerList(true);
                  }, 100);
                }
              } catch (error) {
                console.error('Error opening buyer list:', error);
                Alert.alert('Error', `Failed to load buyer list: ${error.message || 'Unknown error'}`);
              } finally {
                setBuyersLoading(false);
              }
            }}
            activeOpacity={0.7}
            disabled={buyersLoading}
          >
            <Text style={styles.buyerListButtonText}>
              {buyersLoading ? 'Loading...' : '📋 Buyer List - Select & Sell'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Monthly Sales Summary by Buyer (only for sales) */}
        {transactionType === 'sale' && (
          <View style={styles.monthlySummaryContainer}>
            <View style={styles.monthSelectorContainer}>
              <Text style={styles.monthSelectorLabel}>Select Month:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.monthSelector}
              >
                {getMonthOptions().map((monthOption) => (
                  <TouchableOpacity
                    key={monthOption}
                    style={[
                      styles.monthOption,
                      selectedMonth === monthOption && styles.monthOptionActive,
                    ]}
                    onPress={() => setSelectedMonth(monthOption)}
                  >
                    <Text
                      style={[
                        styles.monthOptionText,
                        selectedMonth === monthOption && styles.monthOptionTextActive,
                      ]}
                    >
                      {getMonthDisplayName(monthOption)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {monthlyBuyers.length > 0 || Object.values(monthlySalesByMilkSource).some((s) => s.quantity > 0) ? (
              <View style={styles.buyerSummaryCard}>
                <Text style={styles.buyerSummaryTitle}>
                  Monthly Sales Summary - {getMonthDisplayName(selectedMonth)}
                </Text>
                {Object.keys(monthlySalesByMilkSource).some((k) => monthlySalesByMilkSource[k].quantity > 0) ? (
                  <>
                    <View style={styles.milkSourceSummary}>
                      <Text style={styles.buyerSummaryHeaderText}>Milk Source</Text>
                      <Text style={styles.buyerSummaryHeaderText}>Qty</Text>
                      <Text style={styles.buyerSummaryHeaderText}>Amount</Text>
                    </View>
                    {Object.entries(monthlySalesByMilkSource).map(([src, data]) => {
                      if (data.quantity <= 0) return null;
                      const label = MILK_SOURCE_TYPES.find((s) => s.value === src)?.label || src;
                      return (
                        <View key={src} style={styles.buyerSummaryRow}>
                          <View style={styles.buyerNameContainer}>
                            <Text style={styles.buyerName}>{label}</Text>
                          </View>
                          <Text style={styles.buyerQuantity}>{data.quantity.toFixed(2)} L</Text>
                          <Text style={styles.buyerAmount}>{formatCurrency(data.totalAmount)}</Text>
                        </View>
                      );
                    })}
                  </>
                ) : null}
                {monthlyBuyers.length > 0 && (
                  <>
                    <View style={styles.buyerSummaryHeader}>
                      <Text style={styles.buyerSummaryHeaderText}>Buyer</Text>
                      <Text style={styles.buyerSummaryHeaderText}>Quantity</Text>
                      <Text style={styles.buyerSummaryHeaderText}>Total</Text>
                    </View>
                    {monthlyBuyers.map((buyerKey) => {
                      const summary = monthlySalesByBuyer[buyerKey];
                      const displayName = summary.phone
                        ? `${summary.name} (${summary.phone})`
                        : summary.name;
                      return (
                        <View key={buyerKey} style={styles.buyerSummaryRow}>
                          <View style={styles.buyerNameContainer}>
                            <Text style={styles.buyerName}>{summary.name}</Text>
                            {summary.phone && (
                              <Text style={styles.buyerPhone}>{summary.phone}</Text>
                            )}
                          </View>
                          <Text style={styles.buyerQuantity}>
                            {summary.quantity.toFixed(2)} L
                          </Text>
                          <Text style={styles.buyerAmount}>
                            {formatCurrency(summary.totalAmount)}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}
                <View style={styles.buyerSummaryTotal}>
                  <Text style={styles.buyerSummaryTotalLabel}>Grand Total:</Text>
                  <Text style={styles.buyerSummaryTotalQuantity}>
                    {Object.values(monthlySalesByMilkSource)
                      .reduce((sum, s) => sum + (s.quantity || 0), 0)
                      .toFixed(2)}{' '}
                    L
                  </Text>
                  <Text style={styles.buyerSummaryTotalAmount}>
                    {formatCurrency(
                      Object.values(monthlySalesByMilkSource).reduce(
                        (sum, s) => sum + (s.totalAmount || 0),
                        0
                      )
                    )}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyMonthlySummary}>
                <Text style={styles.emptyMonthlySummaryText}>
                  No sales records for {getMonthDisplayName(selectedMonth)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Add New Sale Button (only for sales) */}
        {transactionType === 'sale' && (
          <TouchableOpacity
            style={[styles.addButton, styles.addButtonSale]}
            onPress={() => {
              setShowForm(true);
              setShowContactDropdown(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>+ Add New Sale</Text>
          </TouchableOpacity>
        )}

        {/* Seller List Button (only for purchases - replaces Add New Purchase) */}
        {transactionType === 'purchase' && (
          <TouchableOpacity
            style={styles.buyerListButton}
            onPress={async () => {
              try {
                setSellersLoading(true);
                const loadedSellers = await loadSellers(); // Reload sellers before showing list
                console.log('[MilkScreen] Loaded sellers count:', loadedSellers.length);
                console.log('[MilkScreen] Loaded sellers data:', loadedSellers);
                
                // Set sellers for modal explicitly
                setSellersForModal(loadedSellers);
                
                if (loadedSellers.length === 0) {
                  Alert.alert(
                    'No Sellers',
                    'No sellers found. Please create sellers from the Seller screen first.',
                    [{ text: 'OK' }]
                  );
                } else {
                  // Small delay to ensure state is set
                  setTimeout(() => {
                    setShowSellerList(true);
                  }, 100);
                }
              } catch (error) {
                console.error('Error opening seller list:', error);
                Alert.alert('Error', `Failed to load seller list: ${error.message || 'Unknown error'}`);
              } finally {
                setSellersLoading(false);
              }
            }}
            activeOpacity={0.7}
            disabled={sellersLoading}
          >
            <Text style={styles.buyerListButtonText}>
              {sellersLoading ? 'Loading...' : '📋 Seller List - Select & Purchase'}
            </Text>
          </TouchableOpacity>
        )}

        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No {transactionType === 'sale' ? 'sale' : 'purchase'} records yet</Text>
            <Text style={styles.emptySubtext}>
              {transactionType === 'sale' 
                ? 'Tap "Add New Sale" to add one' 
                : 'Tap "Seller List" to select a seller and purchase milk'}
            </Text>
          </View>
        ) : (
          dayWiseTransactions.map((dayGroup) => {
            const daySummary = getDayWiseSummary(dayGroup.transactions);
            const dayTotalQuantity = dayGroup.transactions.reduce(
              (sum, t) => sum + t.quantity,
              0
            );
            const dayTotalAmount = dayGroup.transactions.reduce(
              (sum, t) => sum + t.totalAmount,
              0
            );
            const contacts = Object.keys(daySummary).sort();

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
                      {dayGroup.transactions.length} Transaction{dayGroup.transactions.length !== 1 ? 's' : ''} • {dayTotalQuantity.toFixed(2)} L • {formatCurrency(dayTotalAmount)}
                    </Text>
                  </View>
                </View>

                {/* Day-wise Breakdown by Contact */}
                {contacts.length > 0 && (
                  <View style={styles.dayBreakdownCard}>
                    <Text style={styles.dayBreakdownTitle}>
                      {transactionType === 'sale' ? 'Buyers' : 'Sellers'} for this day:
                    </Text>
                    {contacts.map((contactKey) => {
                      const summary = daySummary[contactKey];
                      return (
                        <View key={contactKey} style={styles.dayBreakdownRow}>
                          <View style={styles.dayBreakdownContactContainer}>
                            <Text style={styles.dayBreakdownContact}>{summary.name}</Text>
                            {summary.phone && (
                              <Text style={styles.dayBreakdownPhone}>{summary.phone}</Text>
                            )}
                          </View>
                          <View style={styles.dayBreakdownDetails}>
                            <Text style={[styles.dayBreakdownQuantity, { marginRight: 15 }]}>
                              {summary.quantity.toFixed(2)} L
                            </Text>
                            <Text style={[
                              styles.dayBreakdownAmount,
                              transactionType === 'sale' ? styles.dayBreakdownAmountSale : styles.dayBreakdownAmountPurchase,
                            ]}>
                              {formatCurrency(summary.totalAmount)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Individual Transactions for the Day */}
                {dayGroup.transactions.map((transaction) => (
                  <View key={transaction._id} style={styles.transactionCard}>
                    <View style={styles.transactionHeader}>
                      <View style={styles.transactionHeaderLeft}>
                        <Text style={styles.transactionTime}>
                          {new Date(transaction.date).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                        <Text style={styles.transactionQuantity}>
                          {transaction.quantity} Liters @ {formatCurrency(transaction.pricePerLiter)}/L
                        </Text>
                      </View>
                      <View style={styles.transactionActions}>
                        <TouchableOpacity
                          onPress={() => handleEdit(transaction)}
                          style={styles.editButton}
                        >
                          <Text style={styles.editButtonText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDelete(transaction)}
                          style={styles.deleteButton}
                        >
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.transactionDetails}>
                      {transaction.milkSource && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Milk Source:</Text>
                          <Text style={styles.detailValue}>
                            {MILK_SOURCE_TYPES.find((s) => s.value === transaction.milkSource)?.label || transaction.milkSource}
                          </Text>
                        </View>
                      )}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{transaction.type === 'sale' ? 'Buyer:' : 'Seller:'}</Text>
                        <View style={styles.detailValueContainer}>
                          <Text style={styles.detailValue}>
                            {transaction.type === 'sale' ? transaction.buyer : transaction.seller}
                          </Text>
                          {(transactionType === 'sale' ? transaction.buyerPhone : transaction.sellerPhone) && (
                            <Text style={styles.detailPhone}>
                              {(transactionType === 'sale' ? transaction.buyerPhone : transaction.sellerPhone)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Total Amount:</Text>
                        <Text style={styles.detailValue}>{formatCurrency(transaction.totalAmount)}</Text>
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

      {/* Buyer List Modal */}
      <Modal
        visible={showBuyerList}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowBuyerList(false);
          setSelectedBuyer(null);
          setBuyerSearchQuery(''); // Clear search when modal closes
          // Don't clear buyersForModal, keep it for next time
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Buyer List</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowBuyerList(false);
                  setSelectedBuyer(null);
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              {selectedBuyer ? (
              // Buyer Details View
              <ScrollView 
                style={styles.buyerDetailsContainer}
                contentContainerStyle={styles.buyerDetailsContentContainer}
              >
                <View style={styles.buyerDetailsCard}>
                  <Text style={styles.buyerDetailsName}>{selectedBuyer.name}</Text>
                  {selectedBuyer.mobile && (
                    <Text style={styles.buyerDetailsPhone}>📱 {selectedBuyer.mobile}</Text>
                  )}
                  {selectedBuyer.email && (
                    <Text style={styles.buyerDetailsEmail}>✉️ {selectedBuyer.email}</Text>
                  )}
                  
                  <View style={styles.buyerDetailsDivider} />
                  
                  <View style={styles.buyerDetailsRow}>
                    <Text style={styles.buyerDetailsLabel}>Fixed Milk Price:</Text>
                    <Text style={styles.buyerDetailsValue}>
                      {selectedBuyer.rate 
                        ? `₹${selectedBuyer.rate.toFixed(2)}/Liter`
                        : 'Not Set'
                      }
                    </Text>
                  </View>
                  
                  <View style={styles.buyerDetailsRow}>
                    <Text style={styles.buyerDetailsLabel}>Daily Milk Quantity:</Text>
                    <Text style={styles.buyerDetailsValue}>
                      {selectedBuyer.quantity 
                        ? `${selectedBuyer.quantity.toFixed(2)} Liters`
                        : 'Not Set'
                      }
                    </Text>
                  </View>
                </View>

                <View style={styles.buyerDetailsActions}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSelectedBuyer(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.backButtonText}>← Back to List</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.sellMilkButton}
                    onPress={() => {
                      // Pre-fill form with buyer data
                      const quantityToFill = selectedBuyer.quantity 
                        ? selectedBuyer.quantity.toString() 
                        : '';
                      const priceToFill = selectedBuyer.rate 
                        ? selectedBuyer.rate.toString() 
                        : '';
                      
                      setFormData({
                        date: new Date().toISOString().split('T')[0],
                        quantity: quantityToFill,
                        pricePerLiter: priceToFill,
                        contactName: selectedBuyer.name,
                        contactPhone: selectedBuyer.mobile || '',
                        notes: '',
                        paymentType: 'cash',
                        amountReceived: '',
                        milkSource: 'cow',
                      });
                      
                      setShowBuyerList(false);
                      setSelectedBuyer(null);
                      setShowForm(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sellMilkButtonText}>💰 Sell Milk</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              // Buyer List View
              <View style={{ flex: 1 }}>
                {/* Search Box */}
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or mobile..."
                    placeholderTextColor="#999"
                    value={buyerSearchQuery}
                    onChangeText={setBuyerSearchQuery}
                    autoCapitalize="none"
                  />
                </View>
                <ScrollView 
                  style={styles.buyerListContainer}
                  contentContainerStyle={styles.buyerListContentContainer}
                >
                  {filteredBuyers.length === 0 ? (
                  <View style={styles.emptyBuyerList}>
                    <Text style={styles.emptyBuyerListText}>No buyers found</Text>
                    <Text style={styles.emptyBuyerListSubtext}>
                      Create buyers from the Buyer screen
                    </Text>
                    <TouchableOpacity
                      style={styles.refreshButton}
                      onPress={async () => {
                        try {
                          setLoading(true);
                          const refreshed = await loadBuyers();
                          setBuyersForModal(refreshed);
                        } catch (error) {
                          console.error('Error refreshing buyers:', error);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  filteredBuyers.map((buyer, index) => {
                    console.log(`[MilkScreen] Rendering buyer ${index}:`, buyer);
                    return (
                      <TouchableOpacity
                        key={buyer._id || `buyer-${index}`}
                        style={styles.buyerListItem}
                        onPress={() => {
                          console.log('[MilkScreen] Buyer selected:', buyer);
                          setSelectedBuyer(buyer);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.buyerListItemContent}>
                          <Text style={styles.buyerListItemName}>{buyer.name || 'Unknown'}</Text>
                          {buyer.mobile && (
                            <Text style={styles.buyerListItemPhone}>{buyer.mobile}</Text>
                          )}
                          <View style={styles.buyerListItemDetails}>
                            {buyer.rate && (
                              <Text style={styles.buyerListItemDetail}>
                                ₹{buyer.rate.toFixed(2)}/L
                              </Text>
                            )}
                            {buyer.quantity && (
                              <Text style={styles.buyerListItemDetail}>
                                {buyer.quantity.toFixed(2)}L/day
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={styles.buyerListItemArrow}>→</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
              </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Seller List Modal */}
      <Modal
        visible={showSellerList}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSellerList(false);
          setSelectedSeller(null);
          setSellerSearchQuery(''); // Clear search when modal closes
          // Don't clear sellersForModal, keep it for next time
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seller List</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowSellerList(false);
                  setSelectedSeller(null);
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              {selectedSeller ? (
              // Seller Details View
              <ScrollView 
                style={styles.buyerDetailsContainer}
                contentContainerStyle={styles.buyerDetailsContentContainer}
              >
                <View style={styles.buyerDetailsCard}>
                  <Text style={styles.buyerDetailsName}>{selectedSeller.name}</Text>
                  {selectedSeller.mobile && (
                    <Text style={styles.buyerDetailsPhone}>📱 {selectedSeller.mobile}</Text>
                  )}
                  {selectedSeller.email && (
                    <Text style={styles.buyerDetailsEmail}>✉️ {selectedSeller.email}</Text>
                  )}
                  
                  <View style={styles.buyerDetailsDivider} />
                  
                  <View style={styles.buyerDetailsRow}>
                    <Text style={styles.buyerDetailsLabel}>Fixed Milk Price:</Text>
                    <Text style={styles.buyerDetailsValue}>
                      {selectedSeller.rate 
                        ? `₹${selectedSeller.rate.toFixed(2)}/Liter`
                        : 'Not Set'
                      }
                    </Text>
                  </View>
                  
                  <View style={styles.buyerDetailsRow}>
                    <Text style={styles.buyerDetailsLabel}>Daily Milk Quantity:</Text>
                    <Text style={styles.buyerDetailsValue}>
                      {selectedSeller.quantity 
                        ? `${selectedSeller.quantity.toFixed(2)} Liters`
                        : 'Not Set'
                      }
                    </Text>
                  </View>
                </View>

                <View style={styles.buyerDetailsActions}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSelectedSeller(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.backButtonText}>← Back to List</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.sellMilkButton}
                    onPress={() => {
                      // Pre-fill form with seller data
                      const quantityToFill = selectedSeller.quantity 
                        ? selectedSeller.quantity.toString() 
                        : '';
                      const priceToFill = selectedSeller.rate 
                        ? selectedSeller.rate.toString() 
                        : '';
                      
                      setFormData({
                        date: new Date().toISOString().split('T')[0],
                        quantity: quantityToFill,
                        pricePerLiter: priceToFill,
                        contactName: selectedSeller.name,
                        contactPhone: selectedSeller.mobile || '',
                        notes: '',
                        paymentType: 'cash',
                        amountReceived: '',
                        milkSource: 'cow',
                      });
                      
                      setShowSellerList(false);
                      setSelectedSeller(null);
                      setShowForm(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sellMilkButtonText}>💰 Purchase Milk</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              // Seller List View
              <View style={{ flex: 1 }}>
                {/* Search Box */}
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or mobile..."
                    placeholderTextColor="#999"
                    value={sellerSearchQuery}
                    onChangeText={setSellerSearchQuery}
                    autoCapitalize="none"
                  />
                </View>
                <ScrollView 
                  style={styles.buyerListContainer}
                  contentContainerStyle={styles.buyerListContentContainer}
                >
                  {filteredSellers.length === 0 ? (
                  <View style={styles.emptyBuyerList}>
                    <Text style={styles.emptyBuyerListText}>No sellers found</Text>
                    <Text style={styles.emptyBuyerListSubtext}>
                      Create sellers from the Seller screen
                    </Text>
                    <TouchableOpacity
                      style={styles.refreshButton}
                      onPress={async () => {
                        try {
                          setLoading(true);
                          const refreshed = await loadSellers();
                          setSellersForModal(refreshed);
                        } catch (error) {
                          console.error('Error refreshing sellers:', error);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  filteredSellers.map((seller, index) => {
                    console.log(`[MilkScreen] Rendering seller ${index}:`, seller);
                    return (
                      <TouchableOpacity
                        key={seller._id || `seller-${index}`}
                        style={styles.buyerListItem}
                        onPress={() => {
                          console.log('[MilkScreen] Seller selected:', seller);
                          setSelectedSeller(seller);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.buyerListItemContent}>
                          <Text style={styles.buyerListItemName}>{seller.name || 'Unknown'}</Text>
                          {seller.mobile && (
                            <Text style={styles.buyerListItemPhone}>{seller.mobile}</Text>
                          )}
                          <View style={styles.buyerListItemDetails}>
                            {seller.rate && (
                              <Text style={styles.buyerListItemDetail}>
                                ₹{seller.rate.toFixed(2)}/L
                              </Text>
                            )}
                            {seller.quantity && (
                              <Text style={styles.buyerListItemDetail}>
                                {seller.quantity.toFixed(2)}L/day
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={styles.buyerListItemArrow}>→</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
              </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

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
              <Text style={styles.modalTitle}>
                {editingTransaction ? 'Edit' : 'Add'} Milk {editingTransaction ? (editingTransaction.type === 'sale' ? 'Sale' : 'Purchase') : (transactionType === 'sale' ? 'Sale' : 'Purchase')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowForm(false);
                  setShowContactDropdown(false);
                  setEditingTransaction(null);
                  setFormData({
                    date: new Date().toISOString().split('T')[0],
                    quantity: '',
                    pricePerLiter: '',
                    contactName: '',
                    contactPhone: '',
                    notes: '',
                    paymentType: 'cash',
                    amountReceived: '',
                    milkSource: 'cow',
                  });
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.formContainer}
              contentContainerStyle={styles.formContentContainer}
            >
              <Text style={styles.label}>{transactionType === 'sale' ? 'Sale' : 'Purchase'} Date *</Text>
              <Input
                placeholder="YYYY-MM-DD"
                value={formData.date}
                onChangeText={(text) => setFormData({ ...formData, date: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Milk Source *</Text>
              <View style={styles.milkSourceRow}>
                {MILK_SOURCE_TYPES.map((src) => {
                  const isActive = formData.milkSource === src.value;
                  return (
                    <TouchableOpacity
                      key={src.value}
                      style={[
                        styles.milkSourceButton,
                        isActive && styles.milkSourceButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, milkSource: src.value })}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.milkSourceButtonText,
                          isActive && styles.milkSourceButtonTextActive,
                        ]}
                      >
                        {src.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>{transactionType === 'sale' ? 'Buyer' : 'Seller'} Name *</Text>
              <View style={styles.contactInputContainer}>
                <TouchableOpacity
                  style={styles.contactSelectorButton}
                  onPress={() => setShowContactDropdown(!showContactDropdown)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.contactSelectorButtonText}>
                    {contacts.length > 0 ? '📋 Select from list' : 'No previous contacts'}
                  </Text>
                  <Text style={styles.contactSelectorArrow}>
                    {showContactDropdown ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
                {showContactDropdown && contacts.length > 0 && (
                  <View style={styles.contactDropdown}>
                    <ScrollView style={styles.contactDropdownList} nestedScrollEnabled>
                      {contacts.map((contact, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.contactDropdownItem}
                          onPress={() => handleContactSelect(contact)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.contactDropdownItemContent}>
                            <Text style={styles.contactDropdownItemName}>{contact.name}</Text>
                            {contact.phone && (
                              <Text style={styles.contactDropdownItemPhone}>{contact.phone}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.contactDropdownItem, styles.contactDropdownItemNew]}
                        onPress={handleAddNewContact}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.contactDropdownItemNewText}>+ Add New Contact</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
                <Input
                  placeholder={`Enter ${transactionType === 'sale' ? 'buyer' : 'seller'} name`}
                  value={formData.contactName}
                  onChangeText={(text) => setFormData({ ...formData, contactName: text })}
                  style={styles.input}
                />
              </View>

              <Text style={styles.label}>Quantity (Liters) *</Text>
              <Input
                placeholder="Enter quantity in liters"
                value={formData.quantity}
                onChangeText={(text) => setFormData({ ...formData, quantity: text })}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Price per Liter (₹) *</Text>
              <Input
                placeholder="Enter price per liter"
                value={formData.pricePerLiter}
                onChangeText={(text) => setFormData({ ...formData, pricePerLiter: text })}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              {formData.quantity && formData.pricePerLiter && (
                <View style={styles.totalPreview}>
                  <Text style={styles.totalPreviewLabel}>Total Amount:</Text>
                  <Text style={styles.totalPreviewValue}>
                    {formatCurrency(parseFloat(formData.quantity || '0') * parseFloat(formData.pricePerLiter || '0'))}
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Payment</Text>
              <View style={styles.paymentTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.paymentTypeButton,
                    formData.paymentType === 'cash' && styles.paymentTypeButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, paymentType: 'cash', amountReceived: formData.amountReceived || '' })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.paymentTypeButtonText, formData.paymentType === 'cash' && styles.paymentTypeButtonTextActive]}>
                    💵 Cash
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.paymentTypeButton,
                    formData.paymentType === 'credit' && styles.paymentTypeButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, paymentType: 'credit', amountReceived: '' })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.paymentTypeButtonText, formData.paymentType === 'credit' && styles.paymentTypeButtonTextActive]}>
                    📋 Credit
                  </Text>
                </TouchableOpacity>
              </View>

              {formData.paymentType === 'cash' && (
                <>
                  <Text style={styles.label}>Amount Received (₹) *</Text>
                  <Input
                    placeholder="Enter amount received in cash"
                    value={formData.amountReceived}
                    onChangeText={(text) => setFormData({ ...formData, amountReceived: text })}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </>
              )}

              <Text style={styles.label}>{transactionType === 'sale' ? 'Buyer' : 'Seller'} Phone</Text>
              <Input
                placeholder={`Enter ${transactionType === 'sale' ? 'buyer' : 'seller'} phone`}
                value={formData.contactPhone}
                onChangeText={(text) => setFormData({ ...formData, contactPhone: text })}
                keyboardType="phone-pad"
                style={styles.input}
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
                title={editingTransaction ? `Update ${editingTransaction.type === 'sale' ? 'Sale' : 'Purchase'}` : `Save ${transactionType === 'sale' ? 'Sale' : 'Purchase'}`}
                onPress={handleAddTransaction}
                disabled={loading}
                style={{
                  ...styles.saveButton,
                  ...(editingTransaction ? (editingTransaction.type === 'sale' ? styles.saveButtonSale : styles.saveButtonPurchase) : (transactionType === 'sale' ? styles.saveButtonSale : styles.saveButtonPurchase)),
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {transactionType === 'sale' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            setShowForm(true);
            setShowContactDropdown(false);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
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
  dateFilterStrip: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateFilterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignSelf: 'flex-start',
  },
  dateFilterTabActive: {
    backgroundColor: '#2196F3',
  },
  dateFilterTabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  dateFilterTabTextActive: {
    color: '#fff',
  },
  dateFilterInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  dateFilterField: {
    flex: 1,
  },
  dateFilterLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dateFilterInput: {
    marginBottom: 0,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    fontWeight: '300',
    color: '#fff',
    lineHeight: 32,
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
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  transactionHeaderLeft: {
    flex: 1,
  },
  transactionTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  transactionQuantity: {
    fontSize: 14,
    color: '#666',
  },
  transactionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  transactionHeaderLeft: {
    flex: 1,
  },
  transactionTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  transactionQuantity: {
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
  formContentContainer: {
    paddingBottom: 30,
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
    marginTop: 20,
    marginBottom: 10,
  },
  saveButtonPurchase: {
    backgroundColor: '#4CAF50',
  },
  saveButtonSale: {
    backgroundColor: '#2196F3',
  },
  paymentTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  paymentTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  paymentTypeButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  paymentTypeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  paymentTypeButtonTextActive: {
    color: '#FFFFFF',
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
  contactInputContainer: {
    marginBottom: 12,
  },
  contactSelectorButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  contactSelectorButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  contactSelectorArrow: {
    fontSize: 12,
    color: '#666',
  },
  contactDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  contactDropdownList: {
    maxHeight: 200,
  },
  contactDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  contactDropdownItemContent: {
    flexDirection: 'column',
  },
  contactDropdownItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  contactDropdownItemPhone: {
    fontSize: 12,
    color: '#666',
  },
  contactDropdownItemNew: {
    backgroundColor: '#E3F2FD',
    borderBottomWidth: 0,
  },
  contactDropdownItemNewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    textAlign: 'center',
  },
  monthlySummaryContainer: {
    marginBottom: 15,
  },
  monthSelectorContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  monthSelectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  monthSelector: {
    flexDirection: 'row',
  },
  monthOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  monthOptionActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  monthOptionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  monthOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  buyerSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buyerSummaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  milkSourceSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#2196F3',
    marginBottom: 10,
  },
  buyerSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#2196F3',
    marginBottom: 10,
  },
  buyerSummaryHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
    flex: 1,
    textAlign: 'center',
  },
  buyerSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  buyerNameContainer: {
    flex: 1,
  },
  buyerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  buyerPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  buyerQuantity: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    textAlign: 'center',
  },
  buyerAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
    flex: 1,
    textAlign: 'right',
  },
  buyerListButton: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buyerListButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buyerListContainer: {
    flex: 1,
    padding: 10,
    minHeight: 200,
  },
  buyerListContentContainer: {
    paddingBottom: 30,
  },
  buyerListItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buyerListItemContent: {
    flex: 1,
  },
  buyerListItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  buyerListItemPhone: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  buyerListItemDetails: {
    flexDirection: 'row',
    gap: 10,
  },
  buyerListItemDetail: {
    fontSize: 12,
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  buyerListItemArrow: {
    fontSize: 20,
    color: '#2196F3',
    marginLeft: 10,
  },
  emptyBuyerList: {
    padding: 40,
    alignItems: 'center',
  },
  emptyBuyerListText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptyBuyerListSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 15,
  },
  refreshButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buyerDetailsContainer: {
    flex: 1,
    padding: 10,
  },
  buyerDetailsContentContainer: {
    paddingBottom: 30,
  },
  buyerDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buyerDetailsName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  buyerDetailsPhone: {
    fontSize: 16,
    color: '#666',
    marginBottom: 6,
  },
  buyerDetailsEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  buyerDetailsDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 15,
  },
  buyerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  buyerDetailsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  buyerDetailsValue: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  buyerDetailsActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
    paddingBottom: 10,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  sellMilkButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  sellMilkButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buyerSummaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
    marginTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#2196F3',
    alignItems: 'center',
  },
  buyerSummaryTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  buyerSummaryTotalQuantity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    flex: 1,
    textAlign: 'center',
  },
  buyerSummaryTotalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    flex: 1,
    textAlign: 'right',
  },
  emptyMonthlySummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyMonthlySummaryText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
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
  dayBreakdownCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dayBreakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  dayBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dayBreakdownContactContainer: {
    flex: 1,
  },
  dayBreakdownContact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  dayBreakdownPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  dayBreakdownDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayBreakdownQuantity: {
    fontSize: 13,
    color: '#666',
    minWidth: 60,
    textAlign: 'right',
  },
  dayBreakdownAmount: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'right',
  },
  dayBreakdownAmountSale: {
    color: '#2196F3',
  },
  dayBreakdownAmountPurchase: {
    color: '#4CAF50',
  },
  searchContainer: {
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
});

