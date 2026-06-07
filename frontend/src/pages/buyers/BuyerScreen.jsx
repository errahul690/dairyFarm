import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Switch,
  Linking,
  ActivityIndicator,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import BuyerEditModal, { MilkLinesBlock, defaultMilkLine } from '../../components/buyers/BuyerEditModal';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { milkService } from '../../services/milk/milkService';
import { buyerService } from '../../services/buyers/buyerService';
import { sellerService } from '../../services/sellers/sellerService';
import { paymentService } from '../../services/payments/paymentService';
import { userService } from '../../services/users/userService';
import { formatCurrency } from '../../utils/currencyUtils';
import { getYmdInIST } from '../../utils/dateUtils';
import { authService } from '../../services/auth/authService';
import { MILK_SOURCE_TYPES } from '../../constants';
import { downloadAndShareFile } from '../../utils/downloadFile';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function emptyAddBuyerForm() {
  return {
    name: '',
    mobile: '',
    email: '',
    milkFixedPrice: '',
    dailyMilkQuantity: '',
    milkSource: 'cow',
    deliveryItems: [defaultMilkLine()],
    morningDeliveryItems: [defaultMilkLine()],
    eveningDeliveryItems: [defaultMilkLine()],
    deliveryScheduleType: 'daily',
    deliveryDays: [],
    deliveryCycleDays: '2',
    deliveryCycleStartDate: new Date().toISOString().slice(0, 10),
    billingMode: 'none',
    billingDayOfMonth: '',
    deliveryShift: 'both',
  };
}

export default function BuyerScreen({ onNavigate, onLogout, initialFocusMobile, onConsumedFocusParam, openEditOnFocus = false }) {
  const [buyersData, setBuyersData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [monthTabByBuyer, setMonthTabByBuyer] = useState({}); // { [mobile]: 'YYYY-MM' }
  const [buyerLedgerById, setBuyerLedgerById] = useState({}); // { [buyerId]: month ledger from API }
  const [buyerLedgerLoading, setBuyerLedgerLoading] = useState(null);
  const [ledgerExportLoading, setLedgerExportLoading] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState(emptyAddBuyerForm);
  const [showAddMilkModal, setShowAddMilkModal] = useState(false);
  const [addMilkBuyer, setAddMilkBuyer] = useState(null);
  const [addMilkLoading, setAddMilkLoading] = useState(false);
  const [milkTxForm, setMilkTxForm] = useState({ quantity: '', date: '', pricePerLiter: '', milkSource: 'cow' });
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [addPaymentBuyer, setAddPaymentBuyer] = useState(null);
  const [addPaymentLoading, setAddPaymentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: '' });
  const [buyerFilterTab, setBuyerFilterTab] = useState('active'); // 'active' | 'inactive'
  const [addAsSellerLoading, setAddAsSellerLoading] = useState(null);
  const [buyerBillsCache, setBuyerBillsCache] = useState({});
  const [editMilkTx, setEditMilkTx] = useState(null);
  const [editMilkLoading, setEditMilkLoading] = useState(false);
  const [editPaymentTx, setEditPaymentTx] = useState(null);
  const [editPaymentLoading, setEditPaymentLoading] = useState(false);
  const contentScrollRef = useRef(null);
  const buyerRowYRef = useRef({});
  const [pendingScrollToMobile, setPendingScrollToMobile] = useState(null);

  const tryScrollToBuyer = useCallback((mobile) => {
    const m = mobile && String(mobile).trim();
    if (!m) return;
    const y = buyerRowYRef.current[m];
    if (y == null || !contentScrollRef.current) return;
    contentScrollRef.current.scrollTo({ y: Math.max(0, y - 16), animated: true });
    setPendingScrollToMobile(null);
  }, []);

  const openDialer = useCallback(async (rawMobile) => {
    const digits = String(rawMobile || '').replace(/\D/g, '');
    const n = digits.length > 10 ? digits.slice(-10) : digits;
    if (!n || n.length < 10) {
      Alert.alert('Call', 'Mobile number missing or invalid.');
      return;
    }
    const url = `tel:${n}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Call', 'Could not open phone dialer.');
    }
  }, []);

  /** YYYY-MM in Asia/Kolkata (matches milk/payment business dates). */
  const monthKeyFromDate = (d) => {
    const ymd = getYmdInIST(d);
    return ymd && ymd.length >= 7 ? ymd.slice(0, 7) : '';
  };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = (monthKey) => {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    if (!y || !m) return String(monthKey || '');
    return `${MONTHS[m - 1]} ${y}`;
  };

  const canEditUsers = currentUser?.role === 0 || currentUser?.role === 1;

  const getTodayDateStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const openAddMilkModal = (buyer) => {
    setAddMilkBuyer(buyer);
    const items = Array.isArray(buyer.deliveryItems) && buyer.deliveryItems.length > 0 ? buyer.deliveryItems : null;
    const defaultSrc = items && items[0]?.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(items[0].milkSource)
      ? items[0].milkSource
      : (buyer.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(buyer.milkSource) ? buyer.milkSource : 'cow');
    setMilkTxForm({
      quantity: buyer.dailyQuantity != null ? String(buyer.dailyQuantity) : '',
      date: getTodayDateStr(),
      pricePerLiter: buyer.fixedPrice != null ? String(buyer.fixedPrice) : '',
      milkSource: defaultSrc,
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
    const milkSource = (milkTxForm.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(milkTxForm.milkSource))
      ? milkTxForm.milkSource
      : 'cow';
    try {
      setAddMilkLoading(true);
      await milkService.recordSale({
        date: dateObj,
        quantity: q,
        pricePerLiter: rate,
        totalAmount,
        buyer: addMilkBuyer.name,
        buyerPhone: addMilkBuyer.phone,
        buyerId: addMilkBuyer.userId,
        milkSource,
      });
      setShowAddMilkModal(false);
      setAddMilkBuyer(null);
      await loadData(true);
      await refreshExpandedBuyerLedger();
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
      await refreshExpandedBuyerLedger();
      Alert.alert('Success', 'Payment recorded.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to add payment.');
    } finally {
      setAddPaymentLoading(false);
    }
  };

  const txToYmd = (txDate) => {
    const d = new Date(txDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const openEditMilkModal = (buyer, tx) => {
    setEditMilkTx({
      buyer,
      _id: tx._id,
      buyerName: buyer.name,
      buyerPhone: buyer.phone,
      buyerId: buyer.userId,
      quantity: String(tx.quantity ?? ''),
      date: txToYmd(tx.date),
      pricePerLiter: String(tx.pricePerLiter ?? ''),
      milkSource: (tx.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(tx.milkSource)) ? tx.milkSource : 'cow',
      paymentType: tx.paymentType || 'credit',
      amountReceived: tx.amountReceived != null ? String(tx.amountReceived) : '',
      notes: tx.notes || '',
      buyerLabel: tx.buyer || buyer.name,
    });
  };

  const submitEditMilk = async () => {
    if (!editMilkTx) return;
    const q = parseFloat(editMilkTx.quantity);
    const p = parseFloat(editMilkTx.pricePerLiter);
    if (!(q > 0 && p >= 0)) {
      Alert.alert('Error', 'Enter valid quantity and rate');
      return;
    }
    const dateObj = new Date(`${editMilkTx.date}T12:00:00`);
    if (isNaN(dateObj.getTime())) {
      Alert.alert('Error', 'Enter valid date');
      return;
    }
    const totalAmount = Math.round(q * p * 100) / 100;
    try {
      setEditMilkLoading(true);
      await milkService.updateTransaction(editMilkTx._id, {
        type: 'sale',
        date: dateObj,
        quantity: q,
        pricePerLiter: p,
        totalAmount,
        buyer: editMilkTx.buyerLabel,
        buyerPhone: editMilkTx.buyerPhone,
        buyerId: editMilkTx.buyerId,
        notes: editMilkTx.notes || undefined,
        milkSource: editMilkTx.milkSource,
        paymentType: editMilkTx.paymentType || 'credit',
        amountReceived:
          editMilkTx.paymentType === 'cash' && editMilkTx.amountReceived
            ? parseFloat(editMilkTx.amountReceived)
            : undefined,
      });
      setEditMilkTx(null);
      await loadData(true);
      await refreshExpandedBuyerLedger();
      Alert.alert('Success', 'Milk transaction updated.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Update failed.');
    } finally {
      setEditMilkLoading(false);
    }
  };

  const confirmDeleteMilkTx = (buyer, tx) => {
    Alert.alert('Delete milk sale?', `${formatDate(new Date(tx.date))} · ${formatCurrency(tx.totalAmount)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await milkService.deleteTransaction(tx._id);
            await loadData(true);
            await refreshExpandedBuyerLedger();
          } catch (e) {
            Alert.alert('Error', e?.message || 'Delete failed.');
          }
        },
      },
    ]);
  };

  const openEditPaymentModal = (buyer, pay) => {
    setEditPaymentTx({
      buyer,
      _id: pay._id,
      amount: String(pay.amount ?? ''),
      date: txToYmd(pay.paymentDate),
      notes: pay.notes || '',
    });
  };

  const submitEditPayment = async () => {
    if (!editPaymentTx) return;
    const amt = parseFloat(editPaymentTx.amount);
    if (!(amt > 0)) {
      Alert.alert('Error', 'Enter valid amount');
      return;
    }
    const dateObj = new Date(`${editPaymentTx.date}T12:00:00`);
    if (isNaN(dateObj.getTime())) {
      Alert.alert('Error', 'Enter valid date');
      return;
    }
    try {
      setEditPaymentLoading(true);
      await paymentService.updatePayment(editPaymentTx._id, {
        amount: amt,
        paymentDate: dateObj,
        notes: editPaymentTx.notes || undefined,
      });
      setEditPaymentTx(null);
      await loadData(true);
      await refreshExpandedBuyerLedger();
      Alert.alert('Success', 'Payment updated.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Update failed.');
    } finally {
      setEditPaymentLoading(false);
    }
  };

  const confirmDeletePayment = (pay) => {
    Alert.alert('Delete payment?', `${formatDate(pay.paymentDate)} · ${formatCurrency(pay.amount)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await paymentService.deletePayment(pay._id);
            await loadData(true);
            await refreshExpandedBuyerLedger();
          } catch (e) {
            Alert.alert('Error', e?.message || 'Delete failed.');
          }
        },
      },
    ]);
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

  useEffect(() => {
    const m = initialFocusMobile && String(initialFocusMobile).trim();
    if (!m) return;
    let cancelled = false;
    (async () => {
      await loadData(true);
      if (cancelled) return;
      setBuyerFilterTab('active');
      setSelectedBuyer(m);
      setPendingScrollToMobile(m);
      if (openEditOnFocus) {
        // Open edit modal once buyer list is ready (layout + buyers computed).
        setTimeout(() => {
          try {
            const buyerObj = buyersData.find((b) => String((b.phone || b.mobile) || '').trim() === m);
            if (buyerObj) openEditForm(buyerObj);
          } catch (_) {}
        }, 80);
      }
      if (typeof onConsumedFocusParam === 'function') onConsumedFocusParam();
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFocusMobile, openEditOnFocus]);

  useEffect(() => {
    if (!pendingScrollToMobile) return;
    // Wait a tick for layouts to be measured and stored via onLayout.
    const t = setTimeout(() => tryScrollToBuyer(pendingScrollToMobile), 60);
    return () => clearTimeout(t);
  }, [pendingScrollToMobile, tryScrollToBuyer]);

  const loadBuyerLedger = useCallback(async (buyer, monthKey) => {
    const id = buyer?._id != null ? String(buyer._id) : '';
    const mk = String(monthKey || '').trim();
    if (!id || !mk) return null;
    setBuyerLedgerLoading(id);
    try {
      const ledger = await buyerService.getBuyerMonthLedger(buyer._id, mk);
      if (ledger) {
        setBuyerLedgerById((prev) => ({ ...prev, [id]: ledger }));
        return ledger;
      }
      return null;
    } catch (e) {
      console.error('[BuyerScreen] loadBuyerLedger failed', e);
      return null;
    } finally {
      setBuyerLedgerLoading((cur) => (cur === id ? null : cur));
    }
  }, []);

  const handleDownloadMonthLedger = useCallback(async (buyer, monthKey, format) => {
    const id = buyer?._id != null ? String(buyer._id) : '';
    const mk = String(monthKey || '').trim();
    if (!id || !mk) return;
    const loadKey = `${id}-${mk}-${format}`;
    try {
      setLedgerExportLoading(loadKey);
      const safeName = String(buyer.name || 'buyer').replace(/\s+/g, '-').slice(0, 24);
      if (format === 'pdf') {
        await downloadAndShareFile({
          url: buyerService.getBuyerMonthLedgerPdfUrl(buyer._id, mk),
          filename: `buyer-ledger-${safeName}-${mk}.pdf`,
          mimeType: 'application/pdf',
          title: `Buyer Ledger ${monthLabel(mk)} (PDF)`,
        });
      } else {
        await downloadAndShareFile({
          url: buyerService.getBuyerMonthLedgerExcelUrl(buyer._id, mk),
          filename: `buyer-ledger-${safeName}-${mk}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          title: `Buyer Ledger ${monthLabel(mk)} (Excel)`,
        });
      }
    } catch (e) {
      if (e?.message !== 'User did not share') {
        Alert.alert('Error', e?.message || 'Download failed.');
      }
    } finally {
      setLedgerExportLoading(null);
    }
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [buyersList, balances] = await Promise.all([
        buyerService.getBuyers().catch(() => []),
        buyerService.getBuyerBalances(false).catch(() => []),
      ]);
      const list = Array.isArray(buyersList) ? buyersList : [];
      const balMap = {};
      (Array.isArray(balances) ? balances : []).forEach((b) => {
        const m = String(b.buyerMobile || '').trim();
        if (!m) return;
        balMap[m] = {
          pendingAmount: Number(b.pendingAmount) || 0,
          totalMilkAmount: Number(b.totalMilkAmount) || 0,
          totalPaidAmount: Number(b.totalPaidAmount) || 0,
        };
      });
      setBuyersData(
        list.map((b) => {
          const mobile = String(b.mobile || '').trim();
          const bal = balMap[mobile];
          if (!bal) return b;
          return {
            ...b,
            pendingBalance: bal.pendingAmount,
            totalMilkAmount: bal.totalMilkAmount,
            totalPaidAmount: bal.totalPaidAmount,
          };
        })
      );
    } catch (error) {
      console.error('Failed to load data:', error);
      if (!silent) Alert.alert('Error', 'Failed to load buyer data. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Stored balance totals from backend — no heavy transaction scan.
  const buyers = useMemo(() => {
    const buyerList = (buyersData || [])
      .filter((buyer) => buyer.mobile)
      .map((buyer) => ({
        _id: buyer._id,
        userId: buyer.userId,
        name: buyer.name,
        phone: buyer.mobile.trim(),
        email: buyer.email || '',
        totalAmount: Number(buyer.totalMilkAmount) || 0,
        pendingBalance: Number(buyer.pendingBalance) || 0,
        fixedPrice: buyer.rate,
        dailyQuantity: buyer.quantity,
        milkSource: buyer.milkSource || 'cow',
        deliveryItems: Array.isArray(buyer.deliveryItems) ? buyer.deliveryItems : undefined,
        active: buyer.active !== false,
        isAlsoSeller: buyer.isAlsoSeller === true,
        deliveryDays: buyer.deliveryDays,
        deliveryCycleDays: buyer.deliveryCycleDays,
        deliveryCycleStartDate: buyer.deliveryCycleStartDate,
        billingMode: buyer.billingMode,
        billingDayOfMonth: buyer.billingDayOfMonth,
        lastBillingPeriodEnd: buyer.lastBillingPeriodEnd,
        deliveryShift: buyer.deliveryShift || 'both',
        morningDeliveryItems: buyer.morningDeliveryItems,
        eveningDeliveryItems: buyer.eveningDeliveryItems,
      }));

    return buyerList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en'));
  }, [buyersData]);

  const filteredBuyers = useMemo(
    () => buyers.filter((b) => (buyerFilterTab === 'active' ? b.active : !b.active)),
    [buyers, buyerFilterTab]
  );

  const refreshExpandedBuyerLedger = useCallback(async () => {
    if (!selectedBuyer) return;
    const buyer = buyers.find((b) => String(b.phone).trim() === String(selectedBuyer).trim());
    if (!buyer?._id) return;
    const mk = monthTabByBuyer[buyer.phone] || monthKeyFromDate(new Date());
    await loadBuyerLedger(buyer, mk);
  }, [selectedBuyer, buyers, monthTabByBuyer, loadBuyerLedger]);

  const fifoFromSummaries = useCallback((summaries) => {
    const chrono = (Array.isArray(summaries) ? summaries : [])
      .slice()
      .sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)));
    if (chrono.length === 0) return { fifoRemainingByMonth: {}, fifoAllocLog: [] };

    const buckets = [];
    const first = chrono[0];
    const openingCarry = Math.max(0, Number(first?.openingBalance) || 0);
    if (openingCarry > 0) {
      buckets.push({
        monthKey: first.monthKey,
        kind: 'carry',
        label: `${monthLabel(first.monthKey)} · prior due`,
        remaining: openingCarry,
      });
    }
    chrono.forEach((m) => {
      buckets.push({
        monthKey: m.monthKey,
        kind: 'milk',
        label: `${monthLabel(m.monthKey)} · milk`,
        remaining: Math.max(0, Number(m.milkIn) || 0),
      });
    });

    const paySorted = chrono
      .map((m) => ({
        monthKey: m.monthKey,
        amount: Math.max(0, Number(m.paymentsOut) || 0),
      }))
      .filter((p) => p.amount > 0);

    let bi = 0;
    const fifoAllocLog = [];
    paySorted.forEach((p) => {
      let left = p.amount;
      const allocations = [];
      while (left > 0.000001 && bi < buckets.length) {
        if (buckets[bi].remaining <= 0.000001) {
          bi += 1;
          continue;
        }
        const take = Math.min(left, buckets[bi].remaining);
        buckets[bi].remaining -= take;
        left -= take;
        allocations.push({
          label: buckets[bi].label,
          monthKey: buckets[bi].monthKey,
          kind: buckets[bi].kind,
          amount: Math.round(take * 100) / 100,
        });
        if (buckets[bi].remaining <= 0.000001) bi += 1;
      }
      if (p.amount > 0) {
        fifoAllocLog.push({
          id: p.monthKey,
          date: null,
          total: p.amount,
          allocations,
          unallocated: Math.round(Math.max(0, left) * 100) / 100,
          monthKey: p.monthKey,
        });
      }
    });

    const fifoRemainingByMonth = {};
    buckets.forEach((b) => {
      fifoRemainingByMonth[b.monthKey] =
        (fifoRemainingByMonth[b.monthKey] || 0) + Math.round((b.remaining || 0) * 100) / 100;
    });
    return { fifoRemainingByMonth, fifoAllocLog };
  }, []);

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openEditForm = (buyer) => {
    setEditingBuyer(buyer);
    setShowEditForm(true);
  };

  const applyAddDeliveryShiftChange = (optId) => {
    setFormData((fd) => {
      if (optId === 'both') {
        const rows =
          fd.deliveryItems && fd.deliveryItems.length
            ? fd.deliveryItems.map((x) => ({ ...x }))
            : [defaultMilkLine()];
        return {
          ...fd,
          deliveryShift: 'both',
          morningDeliveryItems: rows.map((x) => ({ ...x })),
          eveningDeliveryItems: rows.map((x) => ({ ...x })),
        };
      }
      if (fd.deliveryShift === 'both') {
        if (optId === 'morning') {
          const rows =
            fd.morningDeliveryItems && fd.morningDeliveryItems.length ? fd.morningDeliveryItems : fd.deliveryItems;
          return {
            ...fd,
            deliveryShift: 'morning',
            deliveryItems:
              rows && rows.length ? rows.map((x) => ({ ...x })) : fd.deliveryItems || [defaultMilkLine()],
          };
        }
        if (optId === 'evening') {
          const rows =
            fd.eveningDeliveryItems && fd.eveningDeliveryItems.length ? fd.eveningDeliveryItems : fd.deliveryItems;
          return {
            ...fd,
            deliveryShift: 'evening',
            deliveryItems:
              rows && rows.length ? rows.map((x) => ({ ...x })) : fd.deliveryItems || [defaultMilkLine()],
          };
        }
      }
      return { ...fd, deliveryShift: optId };
    });
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

    const buildValidLines = (raw) =>
      (raw || [])
        .map((it) => {
          const q = parseFloat(it.quantity);
          const r = parseFloat(it.rate);
          if (!(q > 0 && r >= 0)) return null;
          const src = it.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(it.milkSource) ? it.milkSource : 'cow';
          return { milkSource: src, quantity: q, rate: r };
        })
        .filter(Boolean);

    const dupSource = (lines) => {
      const seen = new Set();
      for (const l of lines) {
        if (seen.has(l.milkSource)) return l.milkSource;
        seen.add(l.milkSource);
      }
      return null;
    };

    let builtItems;
    let builtMorning;
    let builtEvening;
    if (formData.deliveryShift === 'both') {
      builtMorning = buildValidLines(formData.morningDeliveryItems);
      builtEvening = buildValidLines(formData.eveningDeliveryItems);
      if (builtMorning.length === 0) {
        Alert.alert('Error', 'Morning: add at least one milk type with quantity and rate.');
        return;
      }
      if (builtEvening.length === 0) {
        Alert.alert('Error', 'Evening: add at least one milk type with quantity and rate.');
        return;
      }
      const dM = dupSource(builtMorning);
      if (dM) {
        Alert.alert('Error', `Morning: duplicate milk type (${dM}). One row per type.`);
        return;
      }
      const dE = dupSource(builtEvening);
      if (dE) {
        Alert.alert('Error', `Evening: duplicate milk type (${dE}). One row per type.`);
        return;
      }
      builtItems = [...builtMorning, ...builtEvening];
    } else {
      builtItems = buildValidLines(formData.deliveryItems);
      if (builtItems.length === 0) {
        Alert.alert('Error', 'Add at least one milk type with quantity (L) and rate (₹/L)');
        return;
      }
    }

    if (formData.billingMode === 'custom') {
      const br = String(formData.billingDayOfMonth || '').trim();
      if (!br) {
        Alert.alert('Error', 'Enter billing day (1–31) for custom schedule');
        return;
      }
      const bn = parseInt(br, 10);
      if (!Number.isInteger(bn) || bn < 1 || bn > 31) {
        Alert.alert('Error', 'Billing day must be between 1 and 31');
        return;
      }
    }

    try {
      setLoading(true);
      const first = formData.deliveryShift === 'both' ? builtMorning[0] : builtItems[0];
      const fixedPrice = first.rate;
      const dailyQuantity = builtItems.reduce((s, it) => s + it.quantity, 0);
      const milkSource = first.milkSource;

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
      if (formData.deliveryShift === 'both') {
        deliveryPayload.morningDeliveryItems = builtMorning;
        deliveryPayload.eveningDeliveryItems = builtEvening;
        deliveryPayload.deliveryItems = null;
      } else {
        deliveryPayload.deliveryItems = builtItems;
        deliveryPayload.morningDeliveryItems = null;
        deliveryPayload.eveningDeliveryItems = null;
      }
      deliveryPayload.quantity = first.quantity;
      deliveryPayload.rate = first.rate;
      deliveryPayload.milkSource = milkSource;
      if (formData.billingMode === 'none') {
        deliveryPayload.billingMode = null;
        deliveryPayload.billingDayOfMonth = null;
      } else if (formData.billingMode === 'daily') {
        deliveryPayload.billingMode = 'daily';
        deliveryPayload.billingDayOfMonth = null;
      } else if (formData.billingMode === 'month_end') {
        deliveryPayload.billingMode = 'month_end';
        deliveryPayload.billingDayOfMonth = null;
      } else if (formData.billingMode === 'custom') {
        deliveryPayload.billingMode = 'custom';
        deliveryPayload.billingDayOfMonth = parseInt(String(formData.billingDayOfMonth || '').trim(), 10);
      }
      if (formData.deliveryShift === 'morning' || formData.deliveryShift === 'evening' || formData.deliveryShift === 'both') {
        deliveryPayload.deliveryShift = formData.deliveryShift;
      }

      const mobileTrim = formData.mobile.trim();
      const allBuyers = await buyerService.getBuyers(false);
      const newBuyer = allBuyers.find((b) => (b.mobile || '').toString().trim() === mobileTrim);
      if (newBuyer && newBuyer._id) {
        await buyerService.updateBuyer(newBuyer._id, deliveryPayload);
      }

      setFormData(emptyAddBuyerForm());
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
        title="Rahul Dairy Farm"
        subtitle="Buyers"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content} ref={contentScrollRef}>
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
              const isExpanded = selectedBuyer === buyer.phone;
              const ledger = buyerLedgerById[String(buyer._id)] || null;
              const ledgerLoading = buyerLedgerLoading === String(buyer._id);
              const phone = String(buyer.phone || '').trim();
              const monthKeys = ledger?.monthKeys || [];
              const selectedMonth = monthTabByBuyer[phone] || monthKeys[0] || monthKeyFromDate(new Date());
              const summary = ledger?.summary || {};
              const opening = Number(summary.openingBalance) || 0;
              const inAmt = Number(summary.milkIn) || 0;
              const outAmt = Number(summary.paymentsOut) || 0;
              const closing = Number(summary.closingBalance) || 0;
              const { fifoRemainingByMonth, fifoAllocLog } = fifoFromSummaries(ledger?.summaries || []);
              const allMonthKeysAsc = (ledger?.summaries || [])
                .map((s) => s.monthKey)
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)));
              const idxSel = allMonthKeysAsc.indexOf(selectedMonth);
              const keysUpToFifo = idxSel >= 0 ? allMonthKeysAsc.slice(0, idxSel + 1) : [];
              const fifoRemainingUpTo = keysUpToFifo.reduce((s, k) => s + (Number(fifoRemainingByMonth[k]) || 0), 0);
              const fifoPaid = fifoRemainingUpTo <= 0.0001;
              const monthEntries = ledger?.entries || [];
              const exportPdfKey = `${String(buyer._id)}-${selectedMonth}-pdf`;
              const exportExcelKey = `${String(buyer._id)}-${selectedMonth}-excel`;
              const pdfLoading = ledgerExportLoading === exportPdfKey;
              const excelLoading = ledgerExportLoading === exportExcelKey;

              return (
                <View
                  key={index}
                  style={styles.buyerCard}
                  onLayout={(e) => {
                    buyerRowYRef.current[buyer.phone] = e.nativeEvent.layout.y;
                    if (pendingScrollToMobile && String(pendingScrollToMobile).trim() === String(buyer.phone).trim()) {
                      // If this is the focused buyer, scroll as soon as we have its Y.
                      tryScrollToBuyer(pendingScrollToMobile);
                    }
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      if (isExpanded) {
                        setSelectedBuyer(null);
                      } else {
                        setSelectedBuyer(buyer.phone);
                        const mk = monthTabByBuyer[buyer.phone] || monthKeyFromDate(new Date());
                        setMonthTabByBuyer((m) => ({ ...m, [buyer.phone]: mk }));
                        loadBuyerLedger(buyer, mk);
                        if (canEditUsers && buyer._id) {
                          buyerService.getBillsForBuyer(buyer._id).then((list) => {
                            setBuyerBillsCache((c) => ({ ...c, [String(buyer._id)]: Array.isArray(list) ? list : [] }));
                          }).catch(() => {});
                        }
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
                          {!!String(buyer.phone || '').trim() && (
                            <TouchableOpacity
                              style={styles.callButton}
                              onPress={() => openDialer(buyer.phone)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.callButtonText}>Call</Text>
                            </TouchableOpacity>
                          )}
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
                        <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                      </View>
                    </View>
                    <View style={styles.pendingRow}>
                      <Text style={styles.pendingLabel}>To collect: </Text>
                      <Text
                        style={[
                          styles.pendingAmount,
                          (buyer.pendingBalance || 0) > 0 && styles.pendingAmountDue,
                          (buyer.pendingBalance || 0) < 0 && styles.pendingAmountAdvance,
                        ]}
                      >
                        {(buyer.pendingBalance || 0) > 0
                          ? `${formatCurrency(buyer.pendingBalance)} to collect`
                          : (buyer.pendingBalance || 0) < 0
                            ? `${formatCurrency(-buyer.pendingBalance)} advance`
                            : 'Settled'}
                      </Text>
                    </View>
                    {(() => {
                      const hint =
                        buyer.billingMode === 'daily'
                          ? 'Every day @ 23:59'
                          : buyer.billingMode === 'month_end'
                            ? 'Last day of month @ 23:59'
                            : buyer.billingMode === 'custom' || (buyer.billingDayOfMonth != null && !buyer.billingMode)
                              ? `Day ${buyer.billingDayOfMonth} @ 23:59`
                              : null;
                      if (!hint) return null;
                      return (
                        <View style={styles.billingHintRow}>
                          <Text style={styles.billingHintLabel}>Auto bill (IST):</Text>
                          <Text style={styles.billingHintValue}>{hint}</Text>
                        </View>
                      );
                    })()}
                    {(buyer.fixedPrice || buyer.dailyQuantity || buyer.milkSource || (buyer.deliveryItems && buyer.deliveryItems.length > 0)) && (
                      <View style={styles.buyerDetails}>
                        {buyer.deliveryItems && buyer.deliveryItems.length > 0 ? (
                          buyer.deliveryItems.map((it, i) => (
                            <Text key={i} style={styles.buyerDetailText}>
                              {MILK_SOURCE_TYPES.find((s) => s.value === it.milkSource)?.label || it.milkSource}: {(Number(it.quantity) || 0).toFixed(2)} L @ {formatCurrency(Number(it.rate) || 0)}/L
                            </Text>
                          ))
                        ) : (
                          <>
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
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.transactionsContainer}>
                      {ledgerLoading ? (
                        <Text style={styles.loadingText}>Loading month data…</Text>
                      ) : (
                        <>
                          {monthKeys.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthTabs} contentContainerStyle={styles.monthTabsContent}>
                              {monthKeys.map((mk) => {
                                const active = mk === selectedMonth;
                                return (
                                  <TouchableOpacity
                                    key={mk}
                                    style={[styles.monthTab, active && styles.monthTabActive]}
                                    onPress={() => {
                                      setMonthTabByBuyer((m) => ({ ...m, [phone]: mk }));
                                      loadBuyerLedger(buyer, mk);
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={[styles.monthTabText, active && styles.monthTabTextActive]}>{monthLabel(mk)}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          )}

                          <View style={styles.tallyCard}>
                            <View style={styles.tallyRow}>
                              <Text style={styles.tallyLabel}>Opening</Text>
                              <Text style={styles.tallyValue}>{formatCurrency(opening)}</Text>
                            </View>
                            <View style={styles.tallyRow}>
                              <Text style={styles.tallyLabel}>Milk (In)</Text>
                              <Text style={[styles.tallyValue, styles.tallyIn]}>{formatCurrency(inAmt)}</Text>
                            </View>
                            <View style={styles.tallyRow}>
                              <Text style={styles.tallyLabel}>Payments (Out)</Text>
                              <Text style={[styles.tallyValue, styles.tallyOut]}>{formatCurrency(outAmt)}</Text>
                            </View>
                            <View style={[styles.tallyRow, styles.tallyRowLast]}>
                              <Text style={styles.tallyLabelStrong}>Closing</Text>
                              <Text style={[styles.tallyValueStrong, closing > 0 ? styles.tallyDue : styles.tallyClear]}>{formatCurrency(closing)}</Text>
                            </View>
                            {fifoAllocLog.length > 0 && (
                              <View style={styles.fifoAllocWrap}>
                                <Text style={styles.fifoAllocHeading}>FIFO — payment adjustments (by month)</Text>
                                {fifoAllocLog.map((row, ri) => (
                                  <View key={String(row.id || `pay-${ri}`)} style={styles.fifoAllocItem}>
                                    <Text style={styles.fifoAllocItemTitle}>{monthLabel(row.monthKey)}</Text>
                                    <Text style={styles.fifoAllocItemPay}>Payment {formatCurrency(row.total)}</Text>
                                    {row.allocations.map((a, ai) => (
                                      <Text key={`${String(row.id || ri)}-a-${ai}`} style={styles.fifoAllocAllocLine}>
                                        → {a.label}: {formatCurrency(a.amount)}
                                      </Text>
                                    ))}
                                    {row.unallocated > 0.0001 ? (
                                      <Text style={styles.fifoAllocUnalloc}>
                                        Not applied to older dues (advance / overpay): {formatCurrency(row.unallocated)}
                                      </Text>
                                    ) : null}
                                  </View>
                                ))}
                              </View>
                            )}
                            <View style={styles.tallyRow}>
                              <Text style={styles.tallyLabel}>FIFO (all months)</Text>
                              <Text style={[styles.tallyValueStrong, fifoPaid ? styles.tallyClear : styles.tallyDue]}>
                                {fifoPaid ? 'Paid' : formatCurrency(fifoRemainingUpTo)}
                              </Text>
                            </View>
                            <Text style={styles.fifoHint}>
                              Opening/closing from server (all history). Only this month&apos;s entries are loaded below.
                            </Text>
                          </View>

                          <View style={styles.ledgerExportRow}>
                            <TouchableOpacity
                              style={[styles.ledgerExportBtn, pdfLoading && styles.ledgerExportBtnDisabled]}
                              onPress={() => handleDownloadMonthLedger(buyer, selectedMonth, 'pdf')}
                              disabled={!!pdfLoading || !!excelLoading || ledgerLoading}
                              activeOpacity={0.8}
                            >
                              {pdfLoading ? (
                                <ActivityIndicator size="small" color="#1565C0" />
                              ) : (
                                <Text style={styles.ledgerExportBtnText}>📄 PDF Ledger</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.ledgerExportBtn, styles.ledgerExportBtnExcel, excelLoading && styles.ledgerExportBtnDisabled]}
                              onPress={() => handleDownloadMonthLedger(buyer, selectedMonth, 'excel')}
                              disabled={!!pdfLoading || !!excelLoading || ledgerLoading}
                              activeOpacity={0.8}
                            >
                              {excelLoading ? (
                                <ActivityIndicator size="small" color="#2e7d32" />
                              ) : (
                                <Text style={[styles.ledgerExportBtnText, styles.ledgerExportBtnTextExcel]}>📊 Excel Ledger</Text>
                              )}
                            </TouchableOpacity>
                          </View>

                          {canEditUsers && (
                            <View style={styles.monthActionsRow}>
                              <TouchableOpacity style={styles.addMilkTxButton} onPress={() => openAddMilkModal(buyer)} activeOpacity={0.7}>
                                <Text style={styles.addMilkTxButtonText}>+ Add Milk</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.addPayBtn} onPress={() => openAddPaymentModal(buyer)} activeOpacity={0.7}>
                                <Text style={styles.addPayBtnText}>+ Add Payment</Text>
                              </TouchableOpacity>
                            </View>
                          )}

                          {monthEntries.length > 0 ? (
                            monthEntries.map((e, idx) => {
                              if (e.kind === 'milk') {
                                const tx = {
                                  ...e,
                                  totalAmount: Number(e.amount) || 0,
                                  date: e.date,
                                };
                                return (
                                  <View key={tx._id || `m-${idx}`} style={[styles.transactionItem, styles.txMilkCard]}>
                                    <View style={styles.tallyEntryTop}>
                                      <View style={styles.tallyEntryLeft}>
                                        <View style={[styles.tallyBadge, styles.tallyBadgeMilk]}>
                                          <Text style={styles.tallyBadgeText}>Milk</Text>
                                        </View>
                                        <Text style={styles.tallyEntryDate}>{formatDate(new Date(tx.date))}</Text>
                                      </View>
                                      <View style={styles.tallyEntryRight}>
                                        <Text style={styles.tallyEntryLabel}>Debit</Text>
                                        <Text style={[styles.tallyEntryAmount, styles.tallyEntryDebit]}>
                                          {formatCurrency(tx.totalAmount)}
                                        </Text>
                                      </View>
                                    </View>
                                    <Text style={styles.tallyEntryDetails}>
                                      {MILK_SOURCE_TYPES.find((s) => s.value === (tx.milkSource || 'cow'))?.label || tx.milkSource || 'Cow'} ·{' '}
                                      {Number(tx.quantity || 0).toFixed(2)} L @ {formatCurrency(tx.pricePerLiter)}/L
                                    </Text>
                                    {tx.notes && <Text style={styles.transactionNotes}>{tx.notes}</Text>}
                                    {canEditUsers && (
                                      <View style={styles.txActionRow}>
                                        <TouchableOpacity onPress={() => openEditMilkModal(buyer, tx)} style={styles.txActionBtn}>
                                          <Text style={styles.txActionEdit}>Edit</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => confirmDeleteMilkTx(buyer, tx)} style={styles.txActionBtn}>
                                          <Text style={styles.txActionDel}>Delete</Text>
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                );
                              }
                              const pay = {
                                ...e,
                                paymentDate: e.date,
                                amount: Number(e.amount) || 0,
                              };
                              return (
                                <View key={pay._id || `p-${idx}`} style={[styles.transactionItem, styles.txPaymentCard]}>
                                  <View style={styles.tallyEntryTop}>
                                    <View style={styles.tallyEntryLeft}>
                                      <View style={[styles.tallyBadge, styles.tallyBadgePayment]}>
                                        <Text style={styles.tallyBadgeText}>Pay</Text>
                                      </View>
                                      <Text style={styles.tallyEntryDate}>{formatDate(pay.paymentDate)}</Text>
                                    </View>
                                    <View style={styles.tallyEntryRight}>
                                      <Text style={styles.tallyEntryLabel}>Credit</Text>
                                      <Text style={[styles.tallyEntryAmount, styles.tallyEntryCredit]}>
                                        {formatCurrency(pay.amount)}
                                      </Text>
                                    </View>
                                  </View>
                                  <Text style={styles.tallyEntryDetails}>
                                    {[pay.paymentType, pay.paymentDirection].filter(Boolean).join(' · ') || 'Payment'}
                                  </Text>
                                  {pay.notes ? <Text style={styles.transactionNotes}>{pay.notes}</Text> : null}
                                  {canEditUsers && (
                                    <View style={styles.txActionRow}>
                                      <TouchableOpacity onPress={() => openEditPaymentModal(buyer, pay)} style={styles.txActionBtn}>
                                        <Text style={styles.txActionEdit}>Edit</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity onPress={() => confirmDeletePayment(pay)} style={styles.txActionBtn}>
                                        <Text style={styles.txActionDel}>Delete</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              );
                            })
                          ) : (
                            <Text style={styles.noLogsText}>No entries in this month.</Text>
                          )}
                        </>
                      )}

                      {canEditUsers && (buyer.billingMode === 'daily' || buyer.billingMode === 'month_end' || buyer.billingMode === 'custom' || (buyer.billingDayOfMonth != null && !buyer.billingMode)) && (
                        <View style={styles.billsSection}>
                          <Text style={styles.billsSectionTitle}>Auto-generated bills</Text>
                          {(buyerBillsCache[String(buyer._id)] || []).length === 0 ? (
                            <Text style={styles.billEmpty}>No bills yet (runs at 23:59 IST per your schedule).</Text>
                          ) : (
                            (buyerBillsCache[String(buyer._id)] || []).map((bill) => (
                              <View key={bill._id} style={styles.billCard}>
                                <Text style={styles.billPeriod}>Period end {bill.billingPeriodKey}</Text>
                                <Text style={styles.billLine}>
                                  Cycle milk: {Number(bill.cycleMilkQuantity || 0).toFixed(2)} L · {formatCurrency(bill.cycleMilkAmount || 0)}
                                </Text>
                                <Text style={styles.billLine}>
                                  Previous balance: {formatCurrency(bill.previousBalance || 0)} · Paid in cycle: {formatCurrency(bill.paymentsInCycle || 0)}
                                </Text>
                                <Text style={styles.billDue}>Due (cycle): {formatCurrency(bill.totalDue || 0)}</Text>
                              </View>
                            ))
                          )}
                        </View>
                      )}

                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.addBuyerFab}
        onPress={() => setShowAddForm(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.addBuyerFabText}>+ Add Buyer</Text>
      </TouchableOpacity>

      <BuyerEditModal
        visible={showEditForm}
        buyer={editingBuyer}
        onClose={() => { setShowEditForm(false); setEditingBuyer(null); }}
        onSaved={() => loadData(true)}
      />

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
                  setFormData(emptyAddBuyerForm());
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

              <Text style={styles.label}>Delivery shift (Quick Sale)</Text>
              <Text style={styles.hint}>Morning / evening only, or both rounds with separate milk per round.</Text>
              <View style={styles.billingModeRow}>
                {[
                  { id: 'morning', label: 'Morning' },
                  { id: 'evening', label: 'Evening' },
                  { id: 'both', label: 'Both' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.billingModeChip, formData.deliveryShift === opt.id && styles.billingModeChipActive]}
                    onPress={() => applyAddDeliveryShiftChange(opt.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.billingModeChipText, formData.deliveryShift === opt.id && styles.billingModeChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formData.deliveryShift === 'both' ? (
                <>
                  <MilkLinesBlock
                    sectionTitle="Morning milk *"
                    sectionHint="One row per milk type (no duplicate type). Add lines for cow, buffalo, etc."
                    lines={formData.morningDeliveryItems}
                    onChangeLines={(next) => setFormData((fd) => ({ ...fd, morningDeliveryItems: next }))}
                    uniqueSources
                    styles={styles}
                  />
                  <MilkLinesBlock
                    sectionTitle="Evening milk *"
                    sectionHint="Separate from morning. Same rules: one row per type in this round."
                    lines={formData.eveningDeliveryItems}
                    onChangeLines={(next) => setFormData((fd) => ({ ...fd, eveningDeliveryItems: next }))}
                    uniqueSources
                    styles={styles}
                  />
                </>
              ) : (
                <MilkLinesBlock
                  sectionTitle="Milk delivery (per day) *"
                  sectionHint={'Add one or more milk types with quantity and rate. Quick Sale "Delivered" uses this for that shift.'}
                  lines={formData.deliveryItems}
                  onChangeLines={(next) => setFormData((fd) => ({ ...fd, deliveryItems: next }))}
                  uniqueSources={false}
                  styles={styles}
                />
              )}

              <Text style={styles.label}>Auto billing</Text>
              <Text style={styles.hint}>Bill closes at 23:59 IST. Pick how often to generate a bill.</Text>
              <View style={styles.billingModeRow}>
                {[
                  { id: 'none', label: 'Off' },
                  { id: 'daily', label: 'Daily' },
                  { id: 'month_end', label: 'Month end' },
                  { id: 'custom', label: 'Custom day' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.billingModeChip, formData.billingMode === opt.id && styles.billingModeChipActive]}
                    onPress={() => setFormData({ ...formData, billingMode: opt.id })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.billingModeChipText, formData.billingMode === opt.id && styles.billingModeChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {formData.billingMode === 'custom' && (
                <>
                  <Text style={styles.sublabel}>Day of month (1–31)</Text>
                  <Input
                    placeholder="e.g. 10"
                    value={formData.billingDayOfMonth}
                    onChangeText={(text) => setFormData({ ...formData, billingDayOfMonth: text })}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </>
              )}

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
              </View>
            )}
            <ScrollView style={styles.formContainer}>
              <Text style={styles.label}>Milk type *</Text>
              <View style={styles.addMilkSourceChips}>
                {MILK_SOURCE_TYPES.map((src) => {
                  const isActive = milkTxForm.milkSource === src.value;
                  return (
                    <TouchableOpacity
                      key={src.value}
                      style={[styles.milkSourceChip, isActive && styles.milkSourceChipActive]}
                      onPress={() => setMilkTxForm((f) => ({ ...f, milkSource: src.value }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.milkSourceChipText, isActive && styles.milkSourceChipTextActive]}>{src.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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

      {/* Edit milk sale */}
      <Modal
        visible={!!editMilkTx}
        animationType="slide"
        transparent
        onRequestClose={() => setEditMilkTx(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit milk sale</Text>
              <TouchableOpacity onPress={() => setEditMilkTx(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {editMilkTx && (
              <ScrollView style={styles.formContainer}>
                <Text style={styles.label}>Milk type *</Text>
                <View style={styles.addMilkSourceChips}>
                  {MILK_SOURCE_TYPES.map((src) => {
                    const isActive = editMilkTx.milkSource === src.value;
                    return (
                      <TouchableOpacity
                        key={src.value}
                        style={[styles.milkSourceChip, isActive && styles.milkSourceChipActive]}
                        onPress={() => setEditMilkTx((m) => (m ? { ...m, milkSource: src.value } : m))}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.milkSourceChipText, isActive && styles.milkSourceChipTextActive]}>{src.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.label}>Quantity (L) *</Text>
                <Input
                  value={editMilkTx.quantity}
                  onChangeText={(t) => setEditMilkTx((m) => (m ? { ...m, quantity: t } : m))}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Text style={styles.label}>Rate (₹/L) *</Text>
                <Input
                  value={editMilkTx.pricePerLiter}
                  onChangeText={(t) => setEditMilkTx((m) => (m ? { ...m, pricePerLiter: t } : m))}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Text style={styles.label}>Date (YYYY-MM-DD) *</Text>
                <Input
                  value={editMilkTx.date}
                  onChangeText={(t) => setEditMilkTx((m) => (m ? { ...m, date: t } : m))}
                  style={styles.input}
                />
                <Text style={styles.label}>Notes</Text>
                <Input
                  value={editMilkTx.notes}
                  onChangeText={(t) => setEditMilkTx((m) => (m ? { ...m, notes: t } : m))}
                  style={styles.input}
                />
                <Button
                  title={editMilkLoading ? 'Saving...' : 'Save'}
                  onPress={submitEditMilk}
                  disabled={editMilkLoading}
                  style={styles.createButton}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit payment */}
      <Modal
        visible={!!editPaymentTx}
        animationType="slide"
        transparent
        onRequestClose={() => setEditPaymentTx(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit payment</Text>
              <TouchableOpacity onPress={() => setEditPaymentTx(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {editPaymentTx && (
              <ScrollView style={styles.formContainer}>
                <Text style={styles.label}>Amount (₹) *</Text>
                <Input
                  value={editPaymentTx.amount}
                  onChangeText={(t) => setEditPaymentTx((m) => (m ? { ...m, amount: t } : m))}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Text style={styles.label}>Date (YYYY-MM-DD) *</Text>
                <Input
                  value={editPaymentTx.date}
                  onChangeText={(t) => setEditPaymentTx((m) => (m ? { ...m, date: t } : m))}
                  style={styles.input}
                />
                <Text style={styles.label}>Notes</Text>
                <Input
                  value={editPaymentTx.notes}
                  onChangeText={(t) => setEditPaymentTx((m) => (m ? { ...m, notes: t } : m))}
                  style={styles.input}
                />
                <Button
                  title={editPaymentLoading ? 'Saving...' : 'Save'}
                  onPress={submitEditPayment}
                  disabled={editPaymentLoading}
                  style={styles.createButton}
                />
              </ScrollView>
            )}
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
  // Date range strip removed (moved to month-wise ledger tabs inside each buyer).
  addBuyerFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  addBuyerFabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  ledgerExportRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  ledgerExportBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#90CAF9',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  ledgerExportBtnExcel: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  ledgerExportBtnDisabled: {
    opacity: 0.65,
  },
  ledgerExportBtnText: {
    color: '#1565C0',
    fontWeight: '800',
    fontSize: 13,
  },
  ledgerExportBtnTextExcel: {
    color: '#2e7d32',
  },
  content: {
    flex: 1,
    padding: 15,
    paddingBottom: 100,
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
  callButton: {
    backgroundColor: '#00897B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  billingHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  billingHintLabel: {
    fontSize: 12,
    color: '#666',
  },
  billingHintValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#37474F',
    marginLeft: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  billingModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  billingModeChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#E8E8E8',
    marginRight: 8,
    marginBottom: 8,
  },
  billingModeChipActive: {
    backgroundColor: '#1565C0',
  },
  billingModeChipText: {
    fontSize: 13,
    color: '#444',
    fontWeight: '600',
  },
  billingModeChipTextActive: {
    color: '#fff',
  },
  billsSection: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: '#F5F9FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E3F2FD',
  },
  billsSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 8,
  },
  billEmpty: {
    fontSize: 13,
    color: '#666',
  },
  billCard: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#BBDEFB',
  },
  billPeriod: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  billLine: {
    fontSize: 12,
    color: '#555',
    marginTop: 4,
  },
  billDue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C62828',
    marginTop: 6,
  },
  transactionsContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  monthTabs: { marginBottom: 10 },
  monthTabsContent: { paddingRight: 6 },
  monthTab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#eeeeee',
    marginRight: 8,
  },
  monthTabActive: { backgroundColor: '#1565C0' },
  monthTabText: { color: '#444', fontWeight: '700', fontSize: 12 },
  monthTabTextActive: { color: '#fff' },
  tallyCard: {
    backgroundColor: '#F5F9FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3F2FD',
    marginBottom: 12,
  },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  tallyRowLast: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#D7E9FF' },
  tallyLabel: { fontSize: 12, color: '#546e7a', fontWeight: '700' },
  tallyValue: { fontSize: 13, color: '#263238', fontWeight: '800' },
  tallyIn: { color: '#2e7d32' },
  tallyOut: { color: '#c62828' },
  tallyLabelStrong: { fontSize: 13, color: '#263238', fontWeight: '900' },
  tallyValueStrong: { fontSize: 14, fontWeight: '900' },
  tallyDue: { color: '#c62828' },
  tallyClear: { color: '#2e7d32' },
  fifoHint: { fontSize: 11, color: '#78909c', marginTop: 4, lineHeight: 15 },
  fifoAllocWrap: {
    marginTop: 8,
    marginBottom: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E3F2FD',
  },
  fifoAllocHeading: { fontSize: 12, fontWeight: '900', color: '#1565C0', marginBottom: 8 },
  fifoAllocItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  fifoAllocItemTitle: { fontSize: 12, fontWeight: '800', color: '#37474f' },
  fifoAllocItemPay: { fontSize: 12, fontWeight: '800', color: '#263238', marginTop: 4 },
  fifoAllocAllocLine: { fontSize: 11, color: '#455a64', marginTop: 3, fontWeight: '600' },
  fifoAllocUnalloc: { fontSize: 11, color: '#6a1b9a', marginTop: 4, fontWeight: '700' },
  monthActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  addPayBtn: {
    backgroundColor: '#1565C0',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  addPayBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
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
  txMilkCard: {
    backgroundColor: '#fff5f5',
    borderLeftWidth: 4,
    borderLeftColor: '#c62828',
  },
  txPaymentCard: {
    backgroundColor: '#f1f8e9',
    borderLeftWidth: 4,
    borderLeftColor: '#2e7d32',
  },
  tallyEntryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tallyEntryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  tallyEntryRight: { alignItems: 'flex-end' },
  tallyBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  tallyBadgeMilk: { backgroundColor: '#ffebee' },
  tallyBadgePayment: { backgroundColor: '#e8f5e9' },
  tallyBadgeText: { fontSize: 12, fontWeight: '900', color: '#333' },
  tallyEntryDate: { fontSize: 14, fontWeight: '700', color: '#333' },
  tallyEntryLabel: { fontSize: 11, fontWeight: '800', color: '#78909c' },
  tallyEntryAmount: { fontSize: 15, fontWeight: '900' },
  tallyEntryDebit: { color: '#c62828' },
  tallyEntryCredit: { color: '#2e7d32' },
  tallyEntryDetails: { fontSize: 13, color: '#455a64', marginTop: 6 },
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
  txActionRow: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  txActionBtn: {
    marginRight: 16,
    paddingVertical: 4,
  },
  txActionEdit: {
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '700',
  },
  txActionDel: {
    fontSize: 14,
    color: '#C62828',
    fontWeight: '700',
  },
  addMilkSourceChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
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
  deliveryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  deliveryItemCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  deliveryItemCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  deliveryItemSourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    marginHorizontal: -4,
  },
  milkSourceChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginHorizontal: 4,
    marginBottom: 8,
  },
  milkSourceChipActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  milkSourceChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212529',
  },
  milkSourceChipTextActive: {
    color: '#fff',
  },
  milkSourceChipDisabled: {
    opacity: 0.45,
  },
  milkSourceChipDisabledText: {
    color: '#999',
  },
  deliveryItemInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  deliveryItemField: {
    flex: 1,
    minWidth: 90,
    marginHorizontal: 5,
    marginBottom: 4,
  },
  deliveryItemFieldLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
    fontWeight: '500',
  },
  deliveryItemSource: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  deliveryItemInputs: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  deliveryItemInput: {
    width: 70,
    marginBottom: 0,
  },
  removeItemBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  removeItemBtnText: {
    color: '#c62828',
    fontSize: 13,
    fontWeight: '600',
  },
  addDeliveryItemBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
  },
  addDeliveryItemBtnText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
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

