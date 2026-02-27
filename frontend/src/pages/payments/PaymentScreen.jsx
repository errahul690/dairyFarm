import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { paymentService } from '../../services/payments/paymentService';
import { buyerService } from '../../services/buyers/buyerService';
import { userService } from '../../services/users/userService';
import { milkService } from '../../services/milk/milkService';
import { formatCurrency } from '../../utils/currencyUtils';
import { authService } from '../../services/auth/authService';
import { getAuthToken } from '../../services/api/apiClient';
import ReactNativeBlobUtil from 'react-native-blob-util';
import RNShare from 'react-native-share';

export default function PaymentScreen({ onNavigate, onLogout }) {
  const [payments, setPayments] = useState([]);
  const [paymentsToSellers, setPaymentsToSellers] = useState([]);
  const [milkTransactions, setMilkTransactions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [settlementsToSellers, setSettlementsToSellers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [activePaymentTab, setActivePaymentTab] = useState('buyer'); // 'buyer' | 'seller'
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [pendingMilkTransactions, setPendingMilkTransactions] = useState([]);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [settlingCustomerMobile, setSettlingCustomerMobile] = useState(null);
  const [downloadClearedPdfLoading, setDownloadClearedPdfLoading] = useState(null); // null | 'all' | customerMobile
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    customerMobile: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: 'cash',
    notes: '',
    referenceNumber: '',
  });

  // Date filter: 'all' | 'date' — filter payments list by date range
  const [paymentDateFilter, setPaymentDateFilter] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [filterDateTo, setFilterDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadData();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    const user = await authService.getCurrentUser();
    setCurrentUser(user);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [paymentsData, paymentsToSellersData, milkData, settlementsData, settlementsSellersData] = await Promise.all([
        paymentService.getPayments(null, null, 'from_buyer'),
        paymentService.getPayments(null, null, 'to_seller'),
        milkService.getTransactions().catch(() => []),
        paymentService.getSettlements('from_buyer').catch(() => []),
        paymentService.getSettlements('to_seller').catch(() => []),
      ]);
      setPayments(paymentsData);
      setPaymentsToSellers(paymentsToSellersData);
      setMilkTransactions(Array.isArray(milkData) ? milkData : []);
      setSettlements(Array.isArray(settlementsData) ? settlementsData : []);
      setSettlementsToSellers(Array.isArray(settlementsSellersData) ? settlementsSellersData : []);
      
      // Fetch buyers, consumers (CONSUMER), and sellers (SELLER)
      let buyersData = [];
      let consumersData = [];
      let sellersData = [];
      
      try {
        buyersData = await buyerService.getBuyers();
        console.log('[PaymentScreen] Buyers fetched:', buyersData.length, buyersData);
      } catch (err) {
        console.warn('[PaymentScreen] Failed to fetch buyers:', err);
        buyersData = [];
      }
      
      try {
        consumersData = await userService.getUsersByRole(2); // CONSUMER – matches backend users.js
        console.log('[PaymentScreen] Consumers fetched:', consumersData.length, consumersData);
      } catch (err) {
        console.error('[PaymentScreen] Failed to fetch consumers:', err);
        console.error('[PaymentScreen] Consumer error details:', {
          message: err.message,
          response: err.response,
          status: err.response?.status,
        });
        consumersData = [];
      }
      
      try {
        sellersData = await userService.getUsersByRole(3); // SELLER – matches backend users.js
        console.log('[PaymentScreen] Sellers fetched:', sellersData.length, sellersData);
      } catch (err) {
        console.error('[PaymentScreen] Failed to fetch sellers:', err);
        console.error('[PaymentScreen] Seller error details:', {
          message: err.message,
          response: err.response,
          status: err.response?.status,
        });
        sellersData = [];
      }
      
      // Combine buyers and consumers into a single customers list
      const allCustomers = [];
      const customerMap = new Map(); // Use Map to avoid duplicates by mobile or userId
      
      // Add buyers
      if (Array.isArray(buyersData)) {
        buyersData.forEach((buyer) => {
          const userId = buyer.userId ? buyer.userId.toString() : (buyer._id ? buyer._id.toString() : null);
          const mobile = buyer.mobile ? buyer.mobile.trim() : null;
          const name = buyer.name ? buyer.name.trim() : null;
          
          if (userId && name) {
            // Use mobile as key if available, otherwise use userId
            const key = mobile || userId;
            if (!customerMap.has(key)) {
              customerMap.set(key, {
                userId: userId,
                name: name,
                mobile: mobile || 'N/A',
                email: buyer.email || '',
                type: 'buyer',
              });
              console.log('[PaymentScreen] Added buyer:', name, mobile || userId);
            }
          } else {
            console.warn('[PaymentScreen] Skipping buyer - missing required fields:', { userId, name, mobile });
          }
        });
      }
      
      // Add consumers (CONSUMER)
      if (Array.isArray(consumersData)) {
        consumersData.forEach((consumer) => {
          const userId = consumer._id ? consumer._id.toString() : (consumer.id ? consumer.id.toString() : null);
          const mobile = consumer.mobile ? consumer.mobile.trim() : null;
          const name = consumer.name ? consumer.name.trim() : null;
          
          if (userId && name) {
            // Use mobile as key if available, otherwise use userId
            const key = mobile || userId;
            // Only add if not already added as buyer
            if (!customerMap.has(key)) {
              customerMap.set(key, {
                userId: userId,
                name: name,
                mobile: mobile || 'N/A',
                email: consumer.email || '',
                type: 'consumer',
              });
              console.log('[PaymentScreen] Added consumer:', name, mobile || userId);
            } else {
              console.log('[PaymentScreen] Skipping consumer - already exists as buyer:', name, mobile || userId);
            }
          } else {
            console.warn('[PaymentScreen] Skipping consumer - missing required fields:', { userId, name, mobile, consumer });
          }
        });
      } else {
        console.warn('[PaymentScreen] Consumers data is not an array:', typeof consumersData, consumersData);
      }
      
      // Add sellers (SELLER)
      if (Array.isArray(sellersData)) {
        sellersData.forEach((seller) => {
          const userId = seller._id ? seller._id.toString() : (seller.id ? seller.id.toString() : null);
          const mobile = seller.mobile ? seller.mobile.trim() : null;
          const name = seller.name ? seller.name.trim() : null;
          
          if (userId && name) {
            // Use mobile as key if available, otherwise use userId
            const key = mobile || userId;
            // Only add if not already added as buyer or consumer
            if (!customerMap.has(key)) {
              customerMap.set(key, {
                userId: userId,
                name: name,
                mobile: mobile || 'N/A',
                email: seller.email || '',
                type: 'seller',
              });
              console.log('[PaymentScreen] Added seller:', name, mobile || userId);
            } else {
              console.log('[PaymentScreen] Skipping seller - already exists:', name, mobile || userId);
            }
          } else {
            console.warn('[PaymentScreen] Skipping seller - missing required fields:', { userId, name, mobile, seller });
          }
        });
      } else {
        console.warn('[PaymentScreen] Sellers data is not an array:', typeof sellersData, sellersData);
      }
      
      const sellersList = Array.isArray(sellersData)
        ? sellersData
            .filter((s) => (s.userId || s._id) && (s.name || '').trim())
            .map((s) => ({
              userId: (s.userId || s._id).toString(),
              name: (s.name || '').trim(),
              mobile: (s.mobile || '').trim() || 'N/A',
            }))
        : [];
      setSellers(sellersList);

      // Convert Map to Array
      allCustomers.push(...Array.from(customerMap.values()));
      
      console.log(`[PaymentScreen] Final customers list: ${allCustomers.length} total (${buyersData.length} buyers, ${consumersData.length} consumers, ${sellersData.length} sellers)`);
      console.log('[PaymentScreen] Customers:', allCustomers);
      setCustomers(allCustomers);
    } catch (error) {
      console.error('[PaymentScreen] Failed to load data:', error);
      Alert.alert('Error', 'Failed to load payment data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerSelect = async (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      ...formData,
      customerId: customer.userId,
      customerName: customer.name,
      customerMobile: customer.mobile,
    });
    
    // Load unpaid milk transactions for this customer
    try {
      const unpaid = await milkService.getUnpaidTransactions(customer.mobile, customer.userId);
      setPendingMilkTransactions(unpaid);
      
      // Calculate total pending amount
      const totalPending = unpaid.reduce((sum, tx) => {
        const unpaidAmount = tx.totalAmount - (tx.paidAmount || 0);
        return sum + unpaidAmount;
      }, 0);
      
      // Auto-fill amount if there are pending transactions
      if (unpaid.length > 0 && !formData.amount) {
        setFormData(prev => ({
          ...prev,
          customerId: customer.userId,
          customerName: customer.name,
          customerMobile: customer.mobile,
          amount: totalPending.toFixed(2),
        }));
      }
    } catch (error) {
      console.error('Failed to load unpaid milk transactions:', error);
      setPendingMilkTransactions([]);
    }
  };
  
  const handleCreatePayment = async () => {
    if (submittingPayment) return; // Double-tap / double submit prevent
    // Validation
    if (!formData.customerId || !formData.customerName || !formData.customerMobile) {
      Alert.alert('Error', 'Please select a customer');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!formData.paymentDate) {
      Alert.alert('Error', 'Please select a payment date');
      return;
    }

    try {
      setSubmittingPayment(true);
      setLoading(true);
      const paymentPayload = {
        customerId: formData.customerId,
        customerName: formData.customerName,
        customerMobile: formData.customerMobile,
        amount: parseFloat(formData.amount),
        paymentDate: new Date(formData.paymentDate),
        paymentType: formData.paymentType,
        notes: formData.notes || '',
        referenceNumber: formData.referenceNumber || '',
        autoLinkMilk: true,
      };
      if (activePaymentTab === 'seller') paymentPayload.paymentDirection = 'to_seller';
      await paymentService.createPayment(paymentPayload);

      // Reset form
      setFormData({
        customerId: '',
        customerName: '',
        customerMobile: '',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentType: 'cash',
        notes: '',
        referenceNumber: '',
      });
      setSelectedCustomer(null);
      setShowAddForm(false);

      // Reload data
      await loadData();
      Alert.alert('Success', 'Payment recorded successfully!');
    } catch (error) {
      console.error('Failed to create payment:', error);
      Alert.alert('Error', error.message || 'Failed to create payment. Please try again.');
    } finally {
      setSubmittingPayment(false);
      setLoading(false);
    }
  };

  const handleSettle = async (row, isSeller = false) => {
    if (!row.customerId || !row.customerName || !row.customerMobile || row.amountToReturn <= 0) return;
    const msg = isSeller
      ? `Pay ${formatCurrency(row.amountToReturn)} to ${row.customerName}? Balance will become 0,0,0 and new records will start.`
      : `Return ${formatCurrency(row.amountToReturn)} to ${row.customerName}? Balance will become 0,0,0 and new records will start.`;
    Alert.alert(
      'Settle done',
      msg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Settle',
          onPress: async () => {
            try {
              setSettlingCustomerMobile(row.customerMobile);
              const payload = {
                customerId: row.customerId,
                customerName: row.customerName,
                customerMobile: row.customerMobile,
                amountReturned: row.amountToReturn,
              };
              if (isSeller) payload.paymentDirection = 'to_seller';
              await paymentService.createSettlement(payload);
              await loadData();
              Alert.alert('Done', 'Settlement saved. Balance is now zero; new records will show from here.');
            } catch (e) {
              Alert.alert('Error', e?.message || 'Failed to save settlement');
            } finally {
              setSettlingCustomerMobile(null);
            }
          },
        },
      ]
    );
  };

  const handleDownloadClearedStatementPdf = async (customerMobile = null) => {
    try {
      setDownloadClearedPdfLoading(customerMobile == null ? 'all' : customerMobile);
      const token = await getAuthToken();
      if (!token) {
        Alert.alert('Error', 'Please log in to download.');
        return;
      }
      const options = customerMobile ? { customerMobile } : {};
      if (activePaymentTab === 'seller') options.paymentDirection = 'to_seller';
      const url = paymentService.getClearedStatementPdfUrl(options);
      const filename = customerMobile ? `cleared-statement-${customerMobile}.pdf` : 'cleared-statement-all.pdf';
      const mimeType = 'application/pdf';
      const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
      const res = await ReactNativeBlobUtil.config({
        fileCache: true,
        path: cachePath,
        addAndroidDownloads: { useDownloadManager: true, notification: true, path: ReactNativeBlobUtil.fs.dirs.DownloadDir + '/' + filename },
      }).fetch('GET', url, { Authorization: `Bearer ${token}` });

      const status = res.respInfo?.status ?? res.info?.()?.status;
      if (status != null && (status < 200 || status >= 300)) {
        let errMsg = `Download failed (${status}).`;
        try {
          const text = await (typeof res.text === 'function' ? res.text() : Promise.resolve(res.data));
          const body = typeof text === 'string' ? text : String(text);
          const parsed = body.startsWith('{') ? JSON.parse(body) : null;
          if (parsed?.error) errMsg = parsed.error;
          else if (parsed?.message) errMsg = parsed.message;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const path = res.path();
      if (!path || typeof path !== 'string') throw new Error('Download failed: no file received.');

      const pathWithScheme = path.startsWith('file://') ? path : `file://${path}`;
      const shareTitle = 'Cleared Statement (PDF)';

      const shareOptions = {
        type: mimeType,
        message: shareTitle,
        title: shareTitle,
        filename,
        failOnCancel: false,
      };

      if (Platform.OS === 'android') {
        const base64Data = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
        const base64Url = `data:${mimeType};base64,${base64Data}`;
        await RNShare.open({
          ...shareOptions,
          url: base64Url,
          useInternalStorage: true,
        });
      } else {
        await RNShare.open({ ...shareOptions, url: pathWithScheme });
      }
    } catch (error) {
      if (error?.message !== 'User did not share') {
        Alert.alert('Error', error.message || 'Download failed. Please try again.');
      }
    } finally {
      setDownloadClearedPdfLoading(null);
    }
  };

  const handleDeletePayment = (payment) => {
    Alert.alert(
      'Delete Payment',
      `Are you sure you want to delete this payment of ${formatCurrency(payment.amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await paymentService.deletePayment(payment._id);
              await loadData();
              Alert.alert('Success', 'Payment deleted successfully');
            } catch (error) {
              console.error('Failed to delete payment:', error);
              Alert.alert('Error', 'Failed to delete payment. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getTotalPayments = () => {
    return filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);
  };

  const getLatestSettlementByPhone = (settlementsList) => {
    const list = settlementsList || settlements;
    const byPhone = new Map();
    (list || []).forEach((s) => {
      const phone = (s.customerMobile || '').trim();
      if (!phone) return;
      const settledAt = s.settledAt instanceof Date ? s.settledAt : new Date(s.settledAt);
      if (!byPhone.has(phone) || settledAt > (byPhone.get(phone).settledAt)) {
        byPhone.set(phone, { ...s, settledAt });
      }
    });
    return byPhone;
  };

  const latestSettlements = getLatestSettlementByPhone(settlements);
  const latestSettlementsSeller = getLatestSettlementByPhone(settlementsToSellers);

  // Customer balance: after settlement only milk/payments after settledAt count (so 0,0,0 then new records)
  const getCustomerBalancesFromMilk = () => {
    const sales = (milkTransactions || []).filter((tx) => tx.type === 'sale' && (tx.buyerPhone || tx.buyer));
    const byPhone = new Map();
    sales.forEach((tx) => {
      const phone = (tx.buyerPhone || '').trim() || 'unknown';
      const settlement = latestSettlements.get(phone);
      const cutoff = settlement ? (settlement.settledAt instanceof Date ? settlement.settledAt : new Date(settlement.settledAt)) : null;
      if (cutoff && new Date(tx.date) <= cutoff) return; // skip milk before settlement
      if (!byPhone.has(phone)) {
        const match = customers.find((c) => (c.mobile || '').trim() === phone);
        byPhone.set(phone, {
          customerName: tx.buyer || match?.name || phone,
          customerMobile: phone,
          customerId: match?.userId || null,
          totalAmount: 0,
          paidAmount: 0,
          milkTransactions: [],
        });
      }
      const row = byPhone.get(phone);
      row.totalAmount += Number(tx.totalAmount) || 0;
      const milkCash = tx.paymentType === 'cash' && tx.amountReceived != null ? Number(tx.amountReceived) : 0;
      row.paidAmount += milkCash;
      row.milkTransactions.push(tx);
    });
    (payments || []).forEach((p) => {
      const phone = (p.customerMobile || '').trim();
      if (!phone) return;
      const settlement = latestSettlements.get(phone);
      const cutoff = settlement ? (settlement.settledAt instanceof Date ? settlement.settledAt : new Date(settlement.settledAt)) : null;
      const pDate = p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate);
      if (cutoff && pDate <= cutoff) return;
      if (!byPhone.has(phone)) {
        const match = customers.find((c) => (c.mobile || '').trim() === phone);
        byPhone.set(phone, {
          customerName: p.customerName || match?.name || phone,
          customerMobile: phone,
          customerId: p.customerId || match?.userId || null,
          totalAmount: 0,
          paidAmount: 0,
          milkTransactions: [],
        });
      }
      byPhone.get(phone).paidAmount += Number(p.amount) || 0;
    });
    // Customers with settlement but no new tx after — show 0,0,0
    latestSettlements.forEach((s, phone) => {
      if (byPhone.has(phone)) return;
      const match = customers.find((c) => (c.mobile || '').trim() === phone);
      byPhone.set(phone, {
        customerName: s.customerName || match?.name || phone,
        customerMobile: phone,
        customerId: s.customerId || match?.userId || null,
        totalAmount: 0,
        paidAmount: 0,
        milkTransactions: [],
        remaining: 0,
        amountToReturn: 0,
      });
    });
    return Array.from(byPhone.values())
      .map((r) => {
        const remaining = r.remaining != null ? r.remaining : (r.totalAmount - r.paidAmount);
        const amountToReturn = r.amountToReturn != null ? r.amountToReturn : (remaining < 0 ? Math.abs(remaining) : 0);
        return { ...r, remaining: Math.max(0, remaining), amountToReturn };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);
  };

  const customerBalances = getCustomerBalancesFromMilk();

  const getSellerBalancesFromMilk = () => {
    const purchases = (milkTransactions || []).filter((tx) => tx.type === 'purchase' && (tx.sellerPhone || tx.seller));
    const byPhone = new Map();
    // Seed with ALL sellers (role 3) so every seller shows on screen (e.g. Golu), even with 0,0,0,0
    (sellers || []).forEach((s) => {
      const phone = (s.mobile || '').trim();
      if (!phone || phone === 'N/A') return;
      if (!byPhone.has(phone)) {
        byPhone.set(phone, {
          customerName: s.name || phone,
          customerMobile: phone,
          customerId: s.userId || null,
          totalAmount: 0,
          paidAmount: 0,
          milkTransactions: [],
        });
      }
    });
    purchases.forEach((tx) => {
      const phone = (tx.sellerPhone || '').trim() || 'unknown';
      if (!byPhone.has(phone)) return; // only update if already a role-3 seller (seeded above)
      const settlement = latestSettlementsSeller.get(phone);
      const cutoff = settlement ? (settlement.settledAt instanceof Date ? settlement.settledAt : new Date(settlement.settledAt)) : null;
      if (cutoff && new Date(tx.date) <= cutoff) return;
      const row = byPhone.get(phone);
      row.totalAmount += Number(tx.totalAmount) || 0;
      const milkCash = tx.paymentType === 'cash' && tx.amountReceived != null ? Number(tx.amountReceived) : 0;
      row.paidAmount += milkCash;
      row.milkTransactions.push(tx);
    });
    (paymentsToSellers || []).filter((p) => p.paymentDirection === 'to_seller').forEach((p) => {
      const phone = (p.customerMobile || '').trim();
      if (!phone || !byPhone.has(phone)) return; // only role-3 sellers (seeded above)
      const settlement = latestSettlementsSeller.get(phone);
      const cutoff = settlement ? (settlement.settledAt instanceof Date ? settlement.settledAt : new Date(settlement.settledAt)) : null;
      const pDate = p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate);
      if (cutoff && pDate <= cutoff) return;
      byPhone.get(phone).paidAmount += Number(p.amount) || 0;
    });
    latestSettlementsSeller.forEach((s, phone) => {
      if (byPhone.has(phone)) return;
      const match = sellers.find((c) => (c.mobile || '').trim() === phone);
      if (!match) return; // only add if this phone is a role-3 seller
      byPhone.set(phone, {
        customerName: s.customerName || match?.name || phone,
        customerMobile: phone,
        customerId: s.customerId || match?.userId || null,
        totalAmount: 0,
        paidAmount: 0,
        milkTransactions: [],
        remaining: 0,
        amountToReturn: 0,
      });
    });
    // Only show sellers who are role 3 (in sellers list from getUsersByRole(SELLER))
    const sellerPhones = new Set((sellers || []).map((s) => (s.mobile || '').trim()).filter((p) => p && p !== 'N/A'));
    return Array.from(byPhone.values())
      .filter((r) => sellerPhones.has((r.customerMobile || '').trim()))
      .map((r) => {
        const remaining = r.remaining != null ? r.remaining : (r.totalAmount - r.paidAmount);
        const amountToReturn = r.amountToReturn != null ? r.amountToReturn : (remaining < 0 ? Math.abs(remaining) : 0);
        return { ...r, remaining: Math.max(0, remaining), amountToReturn };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);
  };

  const sellerBalances = getSellerBalancesFromMilk();

  // Only show/count payments that are actually to sellers (avoid showing buyer payments by mistake)
  const sellerPaymentsOnly = (paymentsToSellers || []).filter((p) => p.paymentDirection === 'to_seller');

  const filterByDateRange = (list, dateFrom, dateTo) => {
    if (!dateFrom || !dateTo) return list;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return list;
    return (list || []).filter((p) => {
      const d = p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate);
      return d >= from && d <= to;
    });
  };

  const filteredPayments = useMemo(
    () => (paymentDateFilter === 'date' ? filterByDateRange(payments, filterDateFrom, filterDateTo) : payments),
    [paymentDateFilter, filterDateFrom, filterDateTo, payments]
  );

  const filteredPaymentsToSellers = useMemo(
    () => (paymentDateFilter === 'date' ? filterByDateRange(sellerPaymentsOnly, filterDateFrom, filterDateTo) : sellerPaymentsOnly),
    [paymentDateFilter, filterDateFrom, filterDateTo, sellerPaymentsOnly]
  );

  const getPaymentsByCustomer = () => {
    const customerMap = new Map();
    filteredPayments.forEach((payment) => {
      const key = payment.customerMobile || payment.customerId;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customerId: payment.customerId,
          customerName: payment.customerName,
          customerMobile: payment.customerMobile,
          totalAmount: 0,
          paymentCount: 0,
          payments: [],
        });
      }
      const customer = customerMap.get(key);
      customer.totalAmount += payment.amount;
      customer.paymentCount += 1;
      customer.payments.push(payment);
    });
    return Array.from(customerMap.values());
  };

  const getPaymentsBySeller = () => {
    const sellerPhones = new Set((sellers || []).map((s) => (s.mobile || '').trim()).filter((p) => p && p !== 'N/A'));
    const sellerMap = new Map();
    filteredPaymentsToSellers.forEach((payment) => {
      const phone = (payment.customerMobile || '').trim();
      if (!phone || !sellerPhones.has(phone)) return; // only role-3 sellers
      const key = payment.customerMobile || payment.customerId;
      if (!sellerMap.has(key)) {
        sellerMap.set(key, {
          customerId: payment.customerId,
          customerName: payment.customerName,
          customerMobile: payment.customerMobile,
          totalAmount: 0,
          paymentCount: 0,
          payments: [],
        });
      }
      const seller = sellerMap.get(key);
      seller.totalAmount += payment.amount;
      seller.paymentCount += 1;
      seller.payments.push(payment);
    });
    return Array.from(sellerMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  };

  const canEdit = currentUser?.role === 0 || currentUser?.role === 1; // Super Admin, Admin – matches backend users.js

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="Payments"
        subtitle={activePaymentTab === 'buyer' ? 'From buyers' : 'To sellers'}
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activePaymentTab === 'buyer' && styles.tabActive]}
          onPress={() => setActivePaymentTab('buyer')}
        >
          <Text style={[styles.tabText, activePaymentTab === 'buyer' && styles.tabTextActive]}>From buyers</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activePaymentTab === 'seller' && styles.tabActive]}
          onPress={() => setActivePaymentTab('seller')}
        >
          <Text style={[styles.tabText, activePaymentTab === 'seller' && styles.tabTextActive]}>To sellers</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.dateFilterBar}>
        <View style={styles.dateFilterRow}>
          <TouchableOpacity
            style={[styles.dateFilterTab, paymentDateFilter === 'all' && styles.dateFilterTabActive]}
            onPress={() => setPaymentDateFilter('all')}
          >
            <Text style={[styles.dateFilterTabText, paymentDateFilter === 'all' && styles.dateFilterTabTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateFilterTab, paymentDateFilter === 'date' && styles.dateFilterTabActive]}
            onPress={() => setPaymentDateFilter('date')}
          >
            <Text style={[styles.dateFilterTabText, paymentDateFilter === 'date' && styles.dateFilterTabTextActive]}>Date</Text>
          </TouchableOpacity>
        </View>
        {paymentDateFilter === 'date' && (
          <View style={styles.dateFilterInputs}>
            <View style={styles.dateFilterField}>
              <Text style={styles.dateFilterLabel}>From</Text>
              <Input
                value={filterDateFrom}
                onChangeText={setFilterDateFrom}
                placeholder="YYYY-MM-DD"
                style={styles.dateFilterInput}
              />
            </View>
            <View style={styles.dateFilterField}>
              <Text style={styles.dateFilterLabel}>To</Text>
              <Input
                value={filterDateTo}
                onChangeText={setFilterDateTo}
                placeholder="YYYY-MM-DD"
                style={styles.dateFilterInput}
              />
            </View>
          </View>
        )}
      </View>
      <ScrollView style={styles.content}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>
            {activePaymentTab === 'seller' ? '+ Add Payment (to seller)' : '+ Add Payment'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.downloadClearedButton, downloadClearedPdfLoading === 'all' && styles.downloadClearedButtonDisabled]}
          onPress={() => handleDownloadClearedStatementPdf()}
          disabled={downloadClearedPdfLoading === 'all'}
          activeOpacity={0.7}
        >
          {downloadClearedPdfLoading === 'all' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.downloadClearedButtonText}>
              📄 All cleared statements (PDF)
            </Text>
          )}
        </TouchableOpacity>

        {loading && (activePaymentTab === 'buyer' ? payments : sellerPaymentsOnly).length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading payments...</Text>
          </View>
        ) : (
          <>
            {activePaymentTab === 'buyer' && (
              <View style={[styles.summaryCard, styles.summaryCardBuyer]}>
                <Text style={styles.summaryTitle}>From buyers</Text>
                <Text style={styles.summaryValue}>{formatCurrency(getTotalPayments())}</Text>
                <Text style={styles.summarySubtext}>{filteredPayments.length} Payment{filteredPayments.length !== 1 ? 's' : ''}</Text>
              </View>
            )}
            {activePaymentTab === 'seller' && (
              <View style={[styles.summaryCard, styles.summaryCardSeller]}>
                <Text style={styles.summaryTitle}>To sellers</Text>
                <Text style={styles.summaryValue}>{formatCurrency(sellerPaymentsOnly.reduce((s, p) => s + (p.amount || 0), 0))}</Text>
                <Text style={styles.summarySubtext}>{filteredPaymentsToSellers.length} Payment{filteredPaymentsToSellers.length !== 1 ? 's' : ''}</Text>
              </View>
            )}

            {activePaymentTab === 'buyer' && customerBalances.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Customer balance (from milk sales)</Text>
                <Text style={styles.sectionSubtext}>Total amount, amount paid, remaining, amount to return. Add cash from here or via button above.</Text>
                {customerBalances.map((row, index) => (
                  <View key={row.customerMobile + index} style={styles.balanceCard}>
                    <View style={styles.balanceHeader}>
                      <View style={styles.balanceCustomer}>
                        <Text style={styles.balanceName}>{row.customerName}</Text>
                        <Text style={styles.balanceMobile}>{row.customerMobile}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.addCashSmallButton}
                        onPress={() => {
                          const cust = customers.find((c) => (c.mobile || '').trim() === (row.customerMobile || '').trim()) || (row.customerId ? { userId: row.customerId, name: row.customerName, mobile: row.customerMobile } : null);
                          if (cust) {
                            setSelectedCustomer(cust);
                            setFormData((prev) => ({ ...prev, customerId: cust.userId, customerName: cust.name, customerMobile: cust.mobile }));
                            setShowAddForm(true);
                          } else {
                            Alert.alert('Note', 'Select this customer from "Add Payment" and enter amount.');
                            setShowAddForm(true);
                          }
                        }}
                      >
                        <Text style={styles.addCashSmallButtonText}>+ Add Cash</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Total amount</Text>
                      <Text style={styles.balanceValue}>{formatCurrency(row.totalAmount)}</Text>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Amount paid</Text>
                      <Text style={[styles.balanceValue, styles.paidValue]}>{formatCurrency(row.paidAmount)}</Text>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Remaining</Text>
                      <Text style={[styles.balanceValue, row.remaining > 0 ? styles.remainingDue : styles.remainingZero]}>{formatCurrency(row.remaining ?? 0)}</Text>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Amount to return</Text>
                      <Text style={[styles.balanceValue, row.amountToReturn > 0 ? styles.returnAmount : styles.remainingZero]}>{formatCurrency(row.amountToReturn)}</Text>
                    </View>
                    <View style={styles.balanceCardActions}>
                      {row.amountToReturn > 0 && row.customerId && (
                        <TouchableOpacity
                          style={[styles.settleButton, settlingCustomerMobile === row.customerMobile && styles.settleButtonDisabled]}
                          onPress={() => handleSettle(row)}
                          disabled={settlingCustomerMobile === row.customerMobile}
                        >
                          <Text style={styles.settleButtonText}>
                            {settlingCustomerMobile === row.customerMobile ? 'Saving...' : 'Return'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.clearedPdfButton, downloadClearedPdfLoading === row.customerMobile && styles.clearedPdfButtonDisabled]}
                        onPress={() => handleDownloadClearedStatementPdf(row.customerMobile)}
                        disabled={downloadClearedPdfLoading === row.customerMobile}
                      >
                        {downloadClearedPdfLoading === row.customerMobile ? (
                          <ActivityIndicator size="small" color="#2196F3" />
                        ) : (
                          <Text style={styles.clearedPdfButtonText}>📄 Cleared PDF</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {activePaymentTab === 'seller' && sellerBalances.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Seller balance (from milk purchases)</Text>
                <Text style={styles.sectionSubtext}>Total purchase amount, amount paid, remaining, amount to return.</Text>
                {sellerBalances.map((row, index) => (
                  <View key={row.customerMobile + index} style={styles.balanceCard}>
                    <View style={styles.balanceHeader}>
                      <View style={styles.balanceCustomer}>
                        <Text style={styles.balanceName}>{row.customerName}</Text>
                        <Text style={styles.balanceMobile}>{row.customerMobile}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.addCashSmallButton}
                        onPress={() => {
                          const cust = sellers.find((c) => (c.mobile || '').trim() === (row.customerMobile || '').trim()) || (row.customerId ? { userId: row.customerId, name: row.customerName, mobile: row.customerMobile } : null);
                          if (cust) {
                            setSelectedCustomer(cust);
                            setFormData((prev) => ({ ...prev, customerId: cust.userId, customerName: cust.name, customerMobile: cust.mobile }));
                            setShowAddForm(true);
                          } else {
                            Alert.alert('Note', 'Select this seller from "Add Payment" and enter amount.');
                            setShowAddForm(true);
                          }
                        }}
                      >
                        <Text style={styles.addCashSmallButtonText}>+ Add Payment</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Total amount</Text>
                      <Text style={styles.balanceValue}>{formatCurrency(row.totalAmount)}</Text>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Amount paid</Text>
                      <Text style={[styles.balanceValue, styles.paidValue]}>{formatCurrency(row.paidAmount)}</Text>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Remaining</Text>
                      <Text style={[styles.balanceValue, row.remaining > 0 ? styles.remainingDue : styles.remainingZero]}>{formatCurrency(row.remaining ?? 0)}</Text>
                    </View>
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Amount to return</Text>
                      <Text style={[styles.balanceValue, row.amountToReturn > 0 ? styles.returnAmount : styles.remainingZero]}>{formatCurrency(row.amountToReturn)}</Text>
                    </View>
                    <View style={styles.balanceCardActions}>
                      {row.amountToReturn > 0 && row.customerId && (
                        <TouchableOpacity
                          style={[styles.settleButton, settlingCustomerMobile === row.customerMobile && styles.settleButtonDisabled]}
                          onPress={() => handleSettle(row, true)}
                          disabled={settlingCustomerMobile === row.customerMobile}
                        >
                          <Text style={styles.settleButtonText}>
                            {settlingCustomerMobile === row.customerMobile ? 'Saving...' : 'Settle'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.clearedPdfButton, downloadClearedPdfLoading === row.customerMobile && styles.clearedPdfButtonDisabled]}
                        onPress={() => handleDownloadClearedStatementPdf(row.customerMobile)}
                        disabled={downloadClearedPdfLoading === row.customerMobile}
                      >
                        {downloadClearedPdfLoading === row.customerMobile ? (
                          <ActivityIndicator size="small" color="#2196F3" />
                        ) : (
                          <Text style={styles.clearedPdfButtonText}>Cleared PDF</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {((activePaymentTab === 'buyer' && filteredPayments.length === 0 && customerBalances.length === 0) || (activePaymentTab === 'seller' && filteredPaymentsToSellers.length === 0 && sellerBalances.length === 0)) && (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>No payments recorded yet</Text>
                <Text style={styles.emptySubtext}>
                  {activePaymentTab === 'seller'
                    ? 'Milk purchases from sellers will appear here. Use "Add Payment" to record payment to a seller.'
                    : 'Milk sales with cash will appear here. Use "Add Payment" to record a payment.'}
                </Text>
              </View>
            )}

            {activePaymentTab === 'buyer' && filteredPayments.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Payments by Customer</Text>
                {getPaymentsByCustomer().map((customer, index) => (
                  <View key={index} style={styles.customerCard}>
                    <View style={styles.customerHeader}>
                      <View style={styles.customerInfo}>
                        <Text style={styles.customerName}>{customer.customerName}</Text>
                        <Text style={styles.customerMobile}>{customer.customerMobile}</Text>
                      </View>
                      <View style={styles.customerAmount}>
                        <Text style={styles.amountText}>{formatCurrency(customer.totalAmount)}</Text>
                        <Text style={styles.paymentCount}>
                          {customer.paymentCount} payment{customer.paymentCount !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.paymentsList}>
                      {customer.payments.map((payment) => (
                        <View key={payment._id} style={styles.paymentItem}>
                          <View style={styles.paymentRow}>
                            <Text style={styles.paymentDate}>{formatDate(payment.paymentDate)}</Text>
                            <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                            {canEdit && (
                              <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeletePayment(payment)}
                              >
                                <Text style={styles.deleteButtonText}>Delete</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={styles.paymentDetails}>
                            <Text style={styles.paymentType}>
                              {payment.paymentType === 'cash' ? '💵 Cash' :
                               payment.paymentType === 'bank_transfer' ? '🏦 Bank Transfer' :
                               payment.paymentType === 'upi' ? '📱 UPI' : '💳 Other'}
                            </Text>
                            {payment.referenceNumber && (
                              <Text style={styles.referenceNumber}>Ref: {payment.referenceNumber}</Text>
                            )}
                            {payment.notes && (
                              <Text style={styles.paymentNotes}>{payment.notes}</Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}

            {activePaymentTab === 'seller' && filteredPaymentsToSellers.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Payments by Seller</Text>
                {getPaymentsBySeller().map((seller, index) => (
                  <View key={index} style={styles.customerCard}>
                    <View style={styles.customerHeader}>
                      <View style={styles.customerInfo}>
                        <Text style={styles.customerName}>{seller.customerName}</Text>
                        <Text style={styles.customerMobile}>{seller.customerMobile}</Text>
                      </View>
                      <View style={styles.customerAmount}>
                        <Text style={styles.amountText}>{formatCurrency(seller.totalAmount)}</Text>
                        <Text style={styles.paymentCount}>
                          {seller.paymentCount} payment{seller.paymentCount !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.paymentsList}>
                      {seller.payments.map((payment) => (
                        <View key={payment._id} style={styles.paymentItem}>
                          <View style={styles.paymentRow}>
                            <Text style={styles.paymentDate}>{formatDate(payment.paymentDate)}</Text>
                            <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                            {canEdit && (
                              <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeletePayment(payment)}
                              >
                                <Text style={styles.deleteButtonText}>Delete</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={styles.paymentDetails}>
                            <Text style={styles.paymentType}>
                              {payment.paymentType === 'cash' ? '💵 Cash' : payment.paymentType === 'bank_transfer' ? '🏦 Bank' : payment.paymentType === 'upi' ? '📱 UPI' : '💳 Other'}
                            </Text>
                            {payment.referenceNumber && <Text style={styles.referenceNumber}>Ref: {payment.referenceNumber}</Text>}
                            {payment.notes && <Text style={styles.paymentNotes}>{payment.notes}</Text>}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Add Payment Modal */}
      <Modal
        visible={showAddForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowAddForm(false);
          setSelectedCustomer(null);
          setCustomerSearchQuery('');
          setFormData({
            customerId: '',
            customerName: '',
            customerMobile: '',
            amount: '',
            paymentDate: new Date().toISOString().split('T')[0],
            paymentType: 'cash',
            notes: '',
            referenceNumber: '',
          });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activePaymentTab === 'seller' ? 'Add Payment (to seller)' : 'Add Payment'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddForm(false);
                  setSelectedCustomer(null);
                  setCustomerSearchQuery('');
                  setFormData({
                    customerId: '',
                    customerName: '',
                    customerMobile: '',
                    amount: '',
                    paymentDate: new Date().toISOString().split('T')[0],
                    paymentType: 'cash',
                    notes: '',
                    referenceNumber: '',
                  });
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.label}>{activePaymentTab === 'seller' ? 'Select Seller *' : 'Select Customer *'}</Text>
              {selectedCustomer ? (
                <View style={styles.selectedCustomer}>
                  <Text style={styles.selectedCustomerName}>{selectedCustomer.name}</Text>
                  <Text style={styles.selectedCustomerMobile}>{selectedCustomer.mobile}</Text>
                  <TouchableOpacity
                    style={styles.changeCustomerButton}
                    onPress={() => setSelectedCustomer(null)}
                  >
                    <Text style={styles.changeCustomerText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                (() => {
                  const list = activePaymentTab === 'seller' ? sellers : customers;
                  const listLabel = activePaymentTab === 'seller' ? 'sellers' : 'customers';
                  return (
                    <>
                      <Input
                        placeholder="Search by name or phone"
                        value={customerSearchQuery}
                        onChangeText={setCustomerSearchQuery}
                        style={styles.customerSearchInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <ScrollView style={styles.customerList} nestedScrollEnabled>
                        {list.length === 0 ? (
                          <Text style={styles.noCustomersText}>No {listLabel} found. Please add {listLabel} first.</Text>
                        ) : (() => {
                          const q = (customerSearchQuery || '').trim().toLowerCase();
                          const filtered = q
                            ? list.filter(
                                (c) =>
                                  (c.name && c.name.toLowerCase().includes(q)) ||
                                  (c.mobile && String(c.mobile).replace(/\s/g, '').includes(q))
                              )
                            : list;
                          return filtered.length === 0 ? (
                            <Text style={styles.noCustomersText}>No {listLabel.slice(0, -1)} matching "{customerSearchQuery}"</Text>
                          ) : (
                            filtered.map((customer) => (
                              <TouchableOpacity
                                key={customer.userId}
                                style={styles.customerOption}
                                onPress={() => handleCustomerSelect(customer)}
                              >
                                <Text style={styles.customerOptionName}>{customer.name}</Text>
                                <Text style={styles.customerOptionMobile}>{customer.mobile}</Text>
                              </TouchableOpacity>
                            ))
                          );
                        })()}
                      </ScrollView>
                    </>
                  );
                })()
              )}

              {/* Pending Milk Transactions */}
              {selectedCustomer && pendingMilkTransactions.length > 0 && (
                <View style={styles.pendingMilkContainer}>
                  <Text style={styles.pendingMilkTitle}>📋 Pending Milk Transactions</Text>
                  {pendingMilkTransactions.map((tx) => {
                    const unpaidAmount = tx.totalAmount - (tx.paidAmount || 0);
                    const unpaidQuantity = tx.quantity - (tx.paidQuantity || 0);
                    const paymentStatus = tx.paymentStatus || 'unpaid';
                    
                    return (
                      <View key={tx._id} style={styles.pendingMilkItem}>
                        <View style={styles.pendingMilkHeader}>
                          <Text style={styles.pendingMilkDate}>
                            {new Date(tx.date).toLocaleDateString('en-IN')}
                          </Text>
                          <Text style={[
                            styles.pendingMilkStatus,
                            paymentStatus === 'paid' && styles.statusPaid,
                            paymentStatus === 'partial' && styles.statusPartial,
                          ]}>
                            {paymentStatus === 'paid' ? '✅ Paid' : 
                             paymentStatus === 'partial' ? '⚠️ Partial' : '❌ Unpaid'}
                          </Text>
                        </View>
                        <Text style={styles.pendingMilkDetails}>
                          {unpaidQuantity.toFixed(2)}L @ {formatCurrency(tx.pricePerLiter)}/L
                        </Text>
                        <View style={styles.pendingMilkAmounts}>
                          <Text style={styles.pendingMilkTotal}>
                            Total: {formatCurrency(tx.totalAmount)}
                          </Text>
                          <Text style={styles.pendingMilkUnpaid}>
                            Unpaid: {formatCurrency(unpaidAmount)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  <View style={styles.pendingMilkSummary}>
                    <Text style={styles.pendingMilkSummaryText}>
                      Total Pending: {formatCurrency(
                        pendingMilkTransactions.reduce((sum, tx) => {
                          return sum + (tx.totalAmount - (tx.paidAmount || 0));
                        }, 0)
                      )}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.label}>Amount (₹) *</Text>
              <Input
                placeholder="Enter payment amount"
                value={formData.amount}
                onChangeText={(text) => setFormData({ ...formData, amount: text.replace(/[^0-9.]/g, '') })}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Payment Date *</Text>
              <Input
                placeholder="YYYY-MM-DD"
                value={formData.paymentDate}
                onChangeText={(text) => setFormData({ ...formData, paymentDate: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Payment Type</Text>
              <View style={styles.paymentTypeRow}>
                {['cash', 'bank_transfer', 'upi', 'other'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.paymentTypeButton,
                      formData.paymentType === type && styles.paymentTypeButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, paymentType: type })}
                  >
                    <Text
                      style={[
                        styles.paymentTypeButtonText,
                        formData.paymentType === type && styles.paymentTypeButtonTextActive,
                      ]}
                    >
                      {type === 'cash' ? '💵 Cash' :
                       type === 'bank_transfer' ? '🏦 Bank' :
                       type === 'upi' ? '📱 UPI' : '💳 Other'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Reference Number (Optional)</Text>
              <Input
                placeholder="Enter reference/transaction number"
                value={formData.referenceNumber}
                onChangeText={(text) => setFormData({ ...formData, referenceNumber: text })}
                style={styles.input}
              />

              <Text style={styles.label}>Notes (Optional)</Text>
              <Input
                placeholder="Enter any additional notes"
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                multiline
                numberOfLines={3}
                style={styles.input}
              />

              <Button
                title={submittingPayment ? 'Saving...' : 'Save Payment'}
                onPress={handleCreatePayment}
                disabled={submittingPayment || !selectedCustomer}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#4CAF50',
  },
  tabText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  dateFilterBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateFilterRow: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  dateFilterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  dateFilterTabActive: {
    backgroundColor: '#4CAF50',
  },
  dateFilterTabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  dateFilterTabTextActive: {
    color: '#fff',
  },
  dateFilterInputs: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
    marginTop: 12,
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
  addButton: {
    backgroundColor: '#4CAF50',
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
  downloadClearedButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  downloadClearedButtonDisabled: {
    opacity: 0.7,
  },
  downloadClearedButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 15,
  },
  summaryCard: {
    borderRadius: 10,
    padding: 16,
    marginBottom: 15,
    alignItems: 'center',
  },
  summaryCardBuyer: {
    backgroundColor: '#2196F3',
  },
  summaryCardSeller: {
    backgroundColor: '#2E7D32',
  },
  summaryTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  summarySubtext: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionSubtext: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceCustomer: { flex: 1 },
  balanceName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  balanceMobile: { fontSize: 14, color: '#666', marginTop: 2 },
  addCashSmallButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addCashSmallButtonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  balanceLabel: { fontSize: 14, color: '#666' },
  balanceValue: { fontSize: 15, fontWeight: '600', color: '#333' },
  paidValue: { color: '#2E7D32' },
  remainingValue: { color: '#D32F2F' },
  remainingZero: { color: '#2E7D32' },
  remainingDue: { color: '#E65100', fontWeight: '700' },
  returnAmount: { color: '#1976D2', fontWeight: '700' },
  settleButton: {
    marginTop: 12,
    backgroundColor: '#1976D2',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  settleButtonDisabled: { opacity: 0.6 },
  settleButtonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  balanceCardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  clearedPdfButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
    backgroundColor: '#fff',
    alignItems: 'center',
    minWidth: 100,
  },
  clearedPdfButtonDisabled: { opacity: 0.6 },
  clearedPdfButtonText: { color: '#2196F3', fontSize: 13, fontWeight: '600' },
  customerCard: {
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
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  customerMobile: {
    fontSize: 14,
    color: '#666',
  },
  customerAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  paymentCount: {
    fontSize: 12,
    color: '#999',
  },
  paymentsList: {
    marginTop: 8,
  },
  paymentItem: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  paymentDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  paymentType: {
    fontSize: 12,
    color: '#666',
    marginRight: 12,
  },
  referenceNumber: {
    fontSize: 12,
    color: '#999',
    marginRight: 12,
  },
  paymentNotes: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    flex: 1,
  },
  pendingMilkContainer: {
    backgroundColor: '#FFF9E6',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  pendingMilkTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  pendingMilkItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  pendingMilkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pendingMilkDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  pendingMilkStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F44336',
  },
  statusPaid: {
    color: '#4CAF50',
  },
  statusPartial: {
    color: '#FF9800',
  },
  pendingMilkDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  pendingMilkAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pendingMilkTotal: {
    fontSize: 14,
    color: '#666',
  },
  pendingMilkUnpaid: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F44336',
  },
  pendingMilkSummary: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  pendingMilkSummaryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
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
  customerSearchInput: {
    marginBottom: 8,
  },
  customerList: {
    maxHeight: 200,
    marginBottom: 12,
  },
  customerOption: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  customerOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  customerOptionMobile: {
    fontSize: 14,
    color: '#666',
  },
  selectedCustomer: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  selectedCustomerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  selectedCustomerMobile: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  changeCustomerButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeCustomerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  noCustomersText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
  paymentTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  paymentTypeButton: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  paymentTypeButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  paymentTypeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  paymentTypeButtonTextActive: {
    color: '#FFFFFF',
  },
  createButton: {
    marginTop: 10,
    marginBottom: 10,
  },
});

