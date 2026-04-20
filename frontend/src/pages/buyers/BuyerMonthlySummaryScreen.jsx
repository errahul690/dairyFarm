import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { buyerService } from '../../services/buyers/buyerService';
import { formatCurrency } from '../../utils/currencyUtils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKeyFromDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return String(monthKey || '');
  return `${MONTHS[m - 1]} ${y}`;
}

function lastNMonthKeys(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKeyFromDate(d));
  }
  return out;
}

export default function BuyerMonthlySummaryScreen({ onNavigate, onLogout }) {
  const monthTabs = useMemo(() => lastNMonthKeys(12), []);
  const [selectedMonth, setSelectedMonth] = useState(monthTabs[0] || monthKeyFromDate(new Date()));
  const [loading, setLoading] = useState(false);
  const [buyers, setBuyers] = useState([]);
  const [rows, setRows] = useState([]); // monthly summary rows (all buyers)
  const [selectedBuyerMobile, setSelectedBuyerMobile] = useState(null);
  const listRef = useRef(null);
  const buyerRowYRef = useRef({});

  useEffect(() => {
    (async () => {
      try {
        const list = await buyerService.getBuyers(true);
        setBuyers(Array.isArray(list) ? list : []);
      } catch (_) {
        setBuyers([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const list = await buyerService.getBuyerMonthlySummaryByMonthKey(selectedMonth, true, 10000);
        setRows(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error('[BuyerMonthlySummaryScreen] load month error', e);
        Alert.alert('Error', 'Failed to load monthly summary.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedMonth]);

  const rowsMerged = useMemo(() => {
    const byMobile = {};
    (rows || []).forEach((r) => {
      const mobile = String(r.buyerMobile || '').trim();
      if (!mobile) return;
      byMobile[mobile] = r;
    });
    const list = (buyers || [])
      .map((b) => {
        const mobile = String(b.mobile || '').trim();
        const r = byMobile[mobile] || null;
        return {
          mobile,
          name: b.name,
          milkIn: r ? Number(r.milkIn) || 0 : 0,
          paymentsOut: r ? Number(r.paymentsOut) || 0 : 0,
        };
      })
      .filter((x) => x.mobile);
    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return list;
  }, [rows, buyers]);

  const visibleRows = useMemo(() => {
    const m = selectedBuyerMobile && String(selectedBuyerMobile).trim();
    if (!m) return rowsMerged;
    return rowsMerged.filter((r) => String(r.mobile).trim() === m);
  }, [rowsMerged, selectedBuyerMobile]);

  const totals = useMemo(() => {
    const tMilk = visibleRows.reduce((s, r) => s + (Number(r.milkIn) || 0), 0);
    const tPay = visibleRows.reduce((s, r) => s + (Number(r.paymentsOut) || 0), 0);
    return { tMilk, tPay };
  }, [visibleRows]);

  const scrollToBuyer = (mobile) => {
    const y = buyerRowYRef.current[String(mobile || '').trim()];
    if (y == null || !listRef.current) return;
    listRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu title="Monthly Summary" subtitle="Month-wise totals for buyers" onNavigate={onNavigate} onLogout={onLogout} isAuthenticated />

      <View style={styles.monthTabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthTabs}>
          {monthTabs.map((mk) => (
            <TouchableOpacity
              key={mk}
              style={[styles.monthTab, selectedMonth === mk && styles.monthTabOn]}
              onPress={() => {
                setSelectedMonth(mk);
                setSelectedBuyerMobile(null);
              }}
            >
              <Text style={[styles.monthTabText, selectedMonth === mk && styles.monthTabTextOn]}>{monthLabel(mk)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.body}>
        <View style={styles.left}>
          <Text style={styles.leftTitle}>Buyers</Text>
          <ScrollView>
            <TouchableOpacity
              style={[styles.leftBuyer, !selectedBuyerMobile && styles.leftBuyerOn]}
              onPress={() => setSelectedBuyerMobile(null)}
            >
              <Text style={[styles.leftBuyerName, !selectedBuyerMobile && styles.leftBuyerNameOn]}>All</Text>
            </TouchableOpacity>
            {(buyers || []).map((b) => {
              const m = String(b.mobile || '').trim();
              const on = selectedBuyerMobile && String(selectedBuyerMobile).trim() === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.leftBuyer, on && styles.leftBuyerOn]}
                  onPress={() => {
                    setSelectedBuyerMobile(m);
                    setTimeout(() => scrollToBuyer(m), 50);
                  }}
                >
                  <Text style={[styles.leftBuyerName, on && styles.leftBuyerNameOn]} numberOfLines={2}>
                    {b.name}
                  </Text>
                  <Text style={styles.leftBuyerMobile} numberOfLines={1}>
                    {m}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.right}>
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Milk</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.tMilk)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Payments</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.tPay)}</Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 24 }} />
          ) : (
            <ScrollView ref={listRef} style={styles.rightList}>
              {visibleRows.length === 0 ? (
                <Text style={styles.emptyText}>No data for this month.</Text>
              ) : (
                visibleRows.map((r) => (
                  <View
                    key={r.mobile}
                    style={styles.rowCard}
                    onLayout={(e) => {
                      buyerRowYRef.current[String(r.mobile).trim()] = e.nativeEvent.layout.y;
                    }}
                  >
                    <View style={styles.rowTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{r.name}</Text>
                        <Text style={styles.rowMobile}>{r.mobile}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => onNavigate('Buyer', { focusMobile: r.mobile })}
                        disabled={!r.mobile}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.openBuyerLink}>Open →</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.rowNumbers}>
                      <View style={styles.numBox}>
                        <Text style={styles.numLabel}>Milk sale</Text>
                        <Text style={[styles.numValue, styles.numDebit]}>{formatCurrency(r.milkIn)}</Text>
                      </View>
                      <View style={styles.numBox}>
                        <Text style={styles.numLabel}>Payment received</Text>
                        <Text style={[styles.numValue, styles.numCredit]}>{formatCurrency(r.paymentsOut)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  monthTabsWrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  monthTabs: { paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  monthTab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f1f8e9', borderWidth: 1, borderColor: '#c8e6c9' },
  monthTabOn: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  monthTabText: { color: '#2e7d32', fontWeight: '800', fontSize: 13 },
  monthTabTextOn: { color: '#fff' },
  body: { flex: 1, flexDirection: 'row' },
  left: { width: 150, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#eee' },
  leftTitle: { padding: 12, fontWeight: '900', color: '#333' },
  leftBuyer: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  leftBuyerOn: { backgroundColor: '#e8f5e9' },
  leftBuyerName: { fontWeight: '800', color: '#333', fontSize: 12 },
  leftBuyerNameOn: { color: '#1b5e20' },
  leftBuyerMobile: { marginTop: 2, fontSize: 11, color: '#777' },
  right: { flex: 1 },
  summaryBar: { flexDirection: 'row', gap: 10, padding: 12 },
  summaryItem: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2, shadowOpacity: 0.08, shadowRadius: 3 },
  summaryLabel: { fontSize: 12, color: '#666', fontWeight: '700' },
  summaryValue: { marginTop: 6, fontSize: 16, fontWeight: '900', color: '#333' },
  rightList: { paddingHorizontal: 12, paddingBottom: 16 },
  emptyText: { padding: 16, color: '#777' },
  rowCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 12, elevation: 2, shadowOpacity: 0.08, shadowRadius: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowName: { fontSize: 14, fontWeight: '900', color: '#333' },
  rowMobile: { marginTop: 2, fontSize: 11, color: '#777' },
  openBuyerLink: { color: '#1565C0', fontWeight: '900', marginLeft: 12 },
  rowNumbers: { flexDirection: 'row', gap: 10, marginTop: 12 },
  numBox: { flex: 1, backgroundColor: '#fafafa', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#eee' },
  numLabel: { fontSize: 11, color: '#666', fontWeight: '700' },
  numValue: { marginTop: 6, fontSize: 14, fontWeight: '900' },
  numDebit: { color: '#c62828' },
  numCredit: { color: '#2e7d32' },
});

