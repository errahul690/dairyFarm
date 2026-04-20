import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import { reportService } from '../../services/reports/reportService';
import { paymentService } from '../../services/payments/paymentService';

const formatCurrency = (value) => {
  const amount = Number(value ?? 0);
  return `₹${amount
    .toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace('₹', '')}`;
};

const formatLiters = (value) => {
  const liters = Number(value ?? 0);
  return `${liters.toFixed(2)} L`;
};

const trendOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
function getIstStartOfDayUtcInstant(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  return new Date(startMs);
}
function getIstStartOfMonthUtcInstant(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS;
  return new Date(startMs);
}
function getIstStartOfYearUtcInstant(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startMs = Date.UTC(ist.getUTCFullYear(), 0, 1) - IST_OFFSET_MS;
  return new Date(startMs);
}

export default function DashboardScreen({ onNavigate, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState({ daily: 0, monthly: 0, yearly: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendPeriod, setTrendPeriod] = useState('weekly');
  const [selectedBuyerMobile, setSelectedBuyerMobile] = useState(null);
  const [reportMonthYear, setReportMonthYear] = useState(() => {
    const today = new Date();
    return {
      month: today.getUTCMonth() + 1,
      year: today.getUTCFullYear(),
    };
  });

  useEffect(() => {
    let isMounted = true;
    const fetchSummary = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await reportService.getDashboardSummary({
          trendPeriod,
          buyerMobile: selectedBuyerMobile,
        });
        if (isMounted) {
          setSummary(response);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Unable to load dashboard details');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchSummary();
    return () => {
      isMounted = false;
    };
  }, [trendPeriod, selectedBuyerMobile]);

  // Fetch payment summary
  useEffect(() => {
    let isMounted = true;
    const fetchPaymentSummary = async () => {
      try {
        const payments = await paymentService.getPayments();
        if (!isMounted) return;

        const now = new Date();
        const todayStart = getIstStartOfDayUtcInstant(now);
        const monthStart = getIstStartOfMonthUtcInstant(now);
        const yearStart = getIstStartOfYearUtcInstant(now);

        let dailyTotal = 0;
        let monthlyTotal = 0;
        let yearlyTotal = 0;

        payments.forEach((payment) => {
          const paymentDate = new Date(payment.paymentDate);
          const amount = Number(payment.amount) || 0;

          // Only count cash payments
          if (payment.paymentType === 'cash') {
            // Daily total
            if (paymentDate >= todayStart) {
              dailyTotal += amount;
            }
            // Monthly total
            if (paymentDate >= monthStart) {
              monthlyTotal += amount;
            }
            // Yearly total
            if (paymentDate >= yearStart) {
              yearlyTotal += amount;
            }
          }
        });

        if (isMounted) {
          setPaymentSummary({
            daily: dailyTotal,
            monthly: monthlyTotal,
            yearly: yearlyTotal,
          });
        }
      } catch (err) {
        console.error('Error fetching payment summary:', err);
        // Don't show error, just log it
      }
    };
    fetchPaymentSummary();
    return () => {
      isMounted = false;
    };
  }, []);

  const salesTrend = summary?.salesTrend ?? [];
  const maxTrendAmount = useMemo(() => {
    if (!salesTrend.length) return 1;
    return Math.max(...salesTrend.map((item) => item.totalAmount), 1);
  }, [salesTrend]);

  const trendMetadata = summary?.trendMetadata;
  const trendDisplayLabel = trendMetadata?.periodLabel ?? 'Weekly';
  const selectedBuyer = summary?.selectedBuyer;
  const buyerList = summary?.userConsumptions ?? [];

  const handleBuyerDownload = () => {
    if (!selectedBuyer?.mobile) {
      return;
    }
    const { month, year } = reportMonthYear;
    const url = reportService.getBuyerConsumptionDownloadUrl({
      month,
      year,
      buyerMobile: selectedBuyer.mobile,
    });
    Linking.openURL(url);
  };

  const handleBuyerPress = (mobile) => {
    if (!mobile) return;
    const normalized = mobile.trim();
    if (!normalized) return;
    setSelectedBuyerMobile((current) => (current === normalized ? null : normalized));
  };

  const monthOptions = useMemo(() => {
    const options = [];
    const reference = new Date();
    reference.setUTCDate(1);
    for (let i = 0; i < 6; i += 1) {
      const month = reference.getUTCMonth() + 1;
      const year = reference.getUTCFullYear();
      const label = reference.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      options.push({ month, year, label });
      reference.setUTCMonth(reference.getUTCMonth() - 1);
    }
    return options;
  }, []);

  const handleMonthSelect = (option) => {
    setReportMonthYear({ month: option.month, year: option.year });
  };

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Dashboard"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.periodSelector}>
          {trendOptions.map((option) => {
            const isActive = trendPeriod === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.periodButton,
                  isActive && styles.periodButtonActive,
                ]}
                onPress={() => setTrendPeriod(option.value)}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    isActive && styles.periodButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2f8c6e" />
            <Text style={styles.loadingText}>Refreshing dashboard...</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.messageContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && summary && (
          <>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Total Sales</Text>
              <Text style={styles.overviewAmount}>
                {formatCurrency(summary.monthlySales?.amount)}
              </Text>
              <Text style={styles.overviewMeta}>
                {formatLiters(summary.monthlySales?.quantity)} ·{' '}
                {summary.monthlySales?.transactions ?? 0} Tx
              </Text>
              <Text style={styles.todayMeta}>
                Today: {formatCurrency(summary.dailySales?.amount)} ·{' '}
                {formatLiters(summary.dailySales?.quantity)}
              </Text>
            </View>

            {summary.salesByMilkSource && (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>Monthly Milk Sales by Source</Text>
                <Text style={styles.overviewMeta}>
                  Current month: {formatLiters(summary.salesByMilkSource.reduce((s, x) => s + x.quantity, 0))} · {formatCurrency(summary.salesByMilkSource.reduce((s, x) => s + x.amount, 0))}
                </Text>
                {summary.salesByMilkSource.map((item) => (
                  <View key={item.milkSource} style={styles.listRow}>
                    <View>
                      <Text style={styles.listTitle}>{item.label}</Text>
                      <Text style={styles.listSubtitle}>{item.transactions ?? 0} transactions</Text>
                    </View>
                    <View style={styles.listValues}>
                      <Text style={styles.listAmount}>{formatLiters(item.quantity)}</Text>
                      <Text style={styles.listAmount}>{formatCurrency(item.amount)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Today's Sales</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(summary.dailySales?.amount)}
                </Text>
                <Text style={styles.summaryMeta}>
                  {formatLiters(summary.dailySales?.quantity)} ·{' '}
                  {summary.dailySales?.transactions ?? 0} Tx
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Daily Expenses</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(summary.dailyExpenses)}
                </Text>
                <Text style={styles.summaryMeta}>
                  Chara: {formatCurrency(summary.dailyExpenseBreakdown?.charaPurchases)} ·
                  Milk: {formatCurrency(summary.dailyExpenseBreakdown?.milkPurchases)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Cash Received (Today)</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(paymentSummary.daily)}
                </Text>
                <Text style={styles.summaryMeta}>Cash payments received today</Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Cash Received (Monthly)</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(paymentSummary.monthly)}
                </Text>
                <Text style={styles.summaryMeta}>Cash payments this month</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Cash Received (Yearly)</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(paymentSummary.yearly)}
                </Text>
                <Text style={styles.summaryMeta}>Cash payments this year</Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Active Buyers</Text>
                <Text style={styles.summaryValue}>
                  {buyerList.length ?? 0}
                </Text>
                <Text style={styles.summaryMeta}>Consumption tracked this month</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Monthly Sales</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(summary.monthlySales?.amount)}
                </Text>
                <Text style={styles.summaryMeta}>
                  {formatLiters(summary.monthlySales?.quantity)} over{' '}
                  {summary.monthlySales?.transactions ?? 0} Tx
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Yearly Sales</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(summary.yearlySales?.amount)}
                </Text>
                <Text style={styles.summaryMeta}>
                  {formatLiters(summary.yearlySales?.quantity)} over{' '}
                  {summary.yearlySales?.transactions ?? 0} Tx
                </Text>
              </View>
            </View>

            {summary.yearlySalesByMilkSource && (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>Yearly Milk Sales by Source</Text>
                <Text style={styles.overviewMeta}>
                  This year: {formatLiters(summary.yearlySalesByMilkSource.reduce((s, x) => s + x.quantity, 0))} · {formatCurrency(summary.yearlySalesByMilkSource.reduce((s, x) => s + x.amount, 0))}
                </Text>
                {summary.yearlySalesByMilkSource.map((item) => (
                  <View key={`yearly-${item.milkSource}`} style={styles.listRow}>
                    <View>
                      <Text style={styles.listTitle}>{item.label}</Text>
                      <Text style={styles.listSubtitle}>{item.transactions ?? 0} transactions</Text>
                    </View>
                    <View style={styles.listValues}>
                      <Text style={styles.listAmount}>{formatLiters(item.quantity)}</Text>
                      <Text style={styles.listAmount}>{formatCurrency(item.amount)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.chartCard}>
              <Text style={styles.cardHeading}>{trendDisplayLabel} Sales Trend</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chartScrollContent}
              >
                <View style={styles.chartBars}>
                  {salesTrend.map((item) => {
                    const height = (item.totalAmount / maxTrendAmount) * 120;
                    // Adjust bar width based on period: weekly (7), monthly (30), yearly (12)
                    const barWidth = trendPeriod === 'weekly' ? undefined : trendPeriod === 'monthly' ? 30 : 50;
                    return (
                      <View key={item.date} style={[styles.chartColumn, barWidth && { minWidth: barWidth }]}>
                        <View style={styles.chartBarBackground}>
                          <View
                            style={[
                              styles.chartBar,
                              { height: Math.max(height, 4) },
                            ]}
                          />
                        </View>
                        <Text style={styles.chartLabel} numberOfLines={1}>
                          {item.label ?? item.date}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              <Text style={styles.chartMeta}>
                Last updated {new Date(summary.generatedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>

            {selectedBuyer && (
              <View style={[styles.card, styles.selectedBuyerCard]}>
                <View style={styles.selectedBuyerHeader}>
                  <View>
                    <Text style={styles.cardHeading}>{selectedBuyer.name}</Text>
                    <Text style={styles.listSubtitle}>{selectedBuyer.mobile}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedBuyerMobile(null)}>
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.monthSelectorRow}>
                  {monthOptions.map((option) => {
                    const isActive =
                      reportMonthYear.month === option.month && reportMonthYear.year === option.year;
                    return (
                      <TouchableOpacity
                        key={`${option.month}-${option.year}`}
                        style={[
                          styles.monthOption,
                          isActive && styles.monthOptionActive,
                        ]}
                        onPress={() => handleMonthSelect(option)}
                      >
                        <Text
                          style={[
                            styles.monthOptionText,
                            isActive && styles.monthOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={handleBuyerDownload}
                >
                  <Text style={styles.downloadButtonText}>Download buyer report</Text>
                </TouchableOpacity>
                <View style={styles.selectedBuyerStats}>
                  <View style={styles.selectedBuyerStat}>
                    <Text style={styles.selectedBuyerValue}>
                      {formatLiters(selectedBuyer.dailySales?.quantity)}
                    </Text>
                    <Text style={styles.selectedBuyerLabel}>Today quantity</Text>
                  </View>
                  <View style={styles.selectedBuyerStat}>
                    <Text style={styles.selectedBuyerValue}>
                      {formatCurrency(selectedBuyer.dailySales?.amount)}
                    </Text>
                    <Text style={styles.selectedBuyerLabel}>Today amount</Text>
                  </View>
                  <View style={styles.selectedBuyerStat}>
                    <Text style={styles.selectedBuyerValue}>
                      {formatLiters(selectedBuyer.monthlySales?.quantity)}
                    </Text>
                    <Text style={styles.selectedBuyerLabel}>Month quantity</Text>
                  </View>
                  <View style={styles.selectedBuyerStat}>
                    <Text style={styles.selectedBuyerValue}>
                      {formatCurrency(selectedBuyer.monthlySales?.amount)}
                    </Text>
                    <Text style={styles.selectedBuyerLabel}>Month amount</Text>
                  </View>
                </View>
                {selectedBuyer.trend?.length ? (
                  <View style={styles.buyerTrendList}>
                    {selectedBuyer.trend.map((entry) => (
                      <View
                        key={`${selectedBuyer.mobile}-${entry.date}`}
                        style={styles.buyerTrendRow}
                      >
                        <Text style={styles.buyerTrendLabel}>{entry.label}</Text>
                        <Text style={styles.buyerTrendValue}>
                          {formatCurrency(entry.totalAmount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.placeholderText}>
                    No trend history found for this buyer.
                  </Text>
                )}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardHeading}>
                User Consumption – {summary.trendMetadata?.length ?? 0} points
              </Text>
              {buyerList.length ? (
                buyerList.map((buyer) => {
                  const mobileId = buyer.mobile?.trim() ?? '';
                  const isActive = mobileId && mobileId === selectedBuyerMobile;
                  return (
                    <TouchableOpacity
                      key={buyer.mobile}
                      style={[styles.listRow, isActive && styles.selectedRow]}
                      onPress={() => handleBuyerPress(buyer.mobile)}
                    >
                      <View>
                        <Text style={styles.listTitle}>{buyer.name}</Text>
                        <Text style={styles.listSubtitle}>{buyer.mobile}</Text>
                      </View>
                      <View style={styles.listValues}>
                        <Text style={styles.listAmount}>
                          {formatLiters(buyer.totalQuantity)}
                        </Text>
                        <Text style={styles.listAmount}>
                          {formatCurrency(buyer.totalAmount)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.placeholderText}>No buyer consumption recorded yet.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => onNavigate('Milk', { openAddSale: true })}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f6',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginVertical: 10,
  },
  periodButton: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c6d1d7',
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginHorizontal: 6,
    marginBottom: 6,
  },
  periodButtonText: {
    fontSize: 13,
    color: '#456066',
    fontWeight: '600',
  },
  periodButtonActive: {
    backgroundColor: '#1f6b5b',
    borderColor: '#1f6b5b',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 13,
    color: '#556d73',
    fontWeight: '600',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f6b5b',
  },
  summaryMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#77838a',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f6b5b',
    marginBottom: 12,
  },
  chartCard: {
    backgroundColor: '#1ea1b8',
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
  },
  chartScrollContent: {
    paddingVertical: 8,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    height: 160,
    paddingHorizontal: 4,
  },
  chartColumn: {
    alignItems: 'center',
    marginHorizontal: 4,
    minWidth: 35,
  },
  chartBarBackground: {
    height: 130,
    width: '100%',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  chartBar: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  chartLabel: {
    marginTop: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 60,
  },
  chartMeta: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 10,
  },
  overviewCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  overviewLabel: {
    fontSize: 12,
    color: '#8c9ca2',
    marginBottom: 4,
    fontWeight: '600',
  },
  overviewAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f6b5b',
  },
  overviewMeta: {
    marginTop: 6,
    fontSize: 13,
    color: '#556d73',
  },
  todayMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#7c8a8f',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  selectedRow: {
    backgroundColor: 'rgba(31,107,91,0.08)',
    borderRadius: 10,
    padding: 12,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f6b5b',
  },
  listSubtitle: {
    fontSize: 12,
    color: '#7c8a8f',
  },
  listValues: {
    alignItems: 'flex-end',
  },
  listAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f6b5b',
  },
  placeholderText: {
    fontSize: 13,
    color: '#7c8a8f',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#556d73',
  },
  messageContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#a64343',
    fontSize: 14,
  },
  selectedBuyerCard: {
    backgroundColor: '#fff7ef',
  },
  selectedBuyerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#1f6b5b',
    fontWeight: '600',
  },
  selectedBuyerStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  selectedBuyerStat: {
    width: '48%',
    marginBottom: 10,
  },
  selectedBuyerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f6b5b',
  },
  selectedBuyerLabel: {
    fontSize: 12,
    color: '#7c8a8f',
  },
  buyerTrendList: {
    marginTop: 12,
  },
  buyerTrendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    alignItems: 'center',
  },
  buyerTrendLabel: {
    fontSize: 12,
    color: '#7c8a8f',
  },
  buyerTrendValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f6b5b',
  },
  downloadButton: {
    marginTop: 10,
    backgroundColor: '#1f6b5b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderRadius: 8,
  },
  downloadButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  monthSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 8,
  },
  monthOption: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c6d1d7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  monthOptionActive: {
    backgroundColor: '#1f6b5b',
    borderColor: '#1f6b5b',
  },
  monthOptionText: {
    fontSize: 12,
    color: '#456066',
    fontWeight: '600',
  },
  monthOptionTextActive: {
    color: '#fff',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1f6b5b',
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
});

