import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import HeaderWithMenu from '../../components/common/HeaderWithMenu';
import Input from '../../components/common/Input';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currencyUtils';
import { MILK_SOURCE_TYPES } from '../../constants';
import { milkService } from '../../services/milk/milkService';
import { buyerService } from '../../services/buyers/buyerService';
import { reportService } from '../../services/reports/reportService';
import { getAuthToken } from '../../services/api/apiClient';
import ReactNativeBlobUtil from 'react-native-blob-util';
import RNShare from 'react-native-share';

/**
 * Milk Sales Report Screen
 * Comprehensive dashboard showing milk sales with buyer-wise breakdown
 */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getMilkSourceLabel(value) {
  const v = (value || 'cow').toLowerCase();
  return MILK_SOURCE_TYPES.find((t) => t.value === v)?.label || 'Cow';
}

export default function MilkSalesReportScreen({ onNavigate, onLogout }) {
  const now = new Date();
  const [transactions, setTransactions] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [downloadLoading, setDownloadLoading] = useState(null);
  const [selectedConsumerForDownload, setSelectedConsumerForDownload] = useState(null);
  const [showConsumerPicker, setShowConsumerPicker] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txData, buyersData] = await Promise.all([
        milkService.getTransactions(),
        buyerService.getBuyers().catch(() => []),
      ]);
      setTransactions(txData);
      setBuyers(buyersData);
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load sales data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExport = async (format, buyerMobile = null) => {
    try {
      const key = buyerMobile ? `${format}-${buyerMobile}` : format;
      setDownloadLoading(key);
      const token = await getAuthToken();
      if (!token) {
        Alert.alert('Error', 'Please log in to download.');
        return;
      }
      const normalizedBuyerMobile = buyerMobile ? String(buyerMobile).trim() || undefined : undefined;
      const url = reportService.getConsumerExportUrl({
        year: reportYear,
        month: reportMonth,
        format: format === 'pdf' ? 'pdf' : 'excel',
        buyerMobile: normalizedBuyerMobile,
      });
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const filename = `consumer-milk-${reportYear}-${String(reportMonth).padStart(2, '0')}${normalizedBuyerMobile ? `-${normalizedBuyerMobile}` : ''}.${ext}`;
      const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
      const shareTitle = normalizedBuyerMobile
        ? `Milk Report - ${MONTH_NAMES[reportMonth - 1]} ${reportYear}`
        : `Consumer Milk Report ${MONTH_NAMES[reportMonth - 1]} ${reportYear}`;

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
          useInternalStorage: true, // Fix for Uri.getScheme() null error on Android 12+
        });
      } else {
        await RNShare.open({ ...shareOptions, url: pathWithScheme });
      }
    } catch (error) {
      console.error('Download failed:', error);
      if (error?.message !== 'User did not share') {
        Alert.alert('Error', error.message || 'Download failed. Please try again.');
      }
    } finally {
      setDownloadLoading(null);
    }
  };

  const changeReportMonth = (delta) => {
    let m = reportMonth + delta;
    let y = reportYear;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    setReportMonth(m);
    setReportYear(y);
  };

  // Filter sales transactions only
  const salesTransactions = useMemo(() => {
    return transactions.filter((tx) => tx.type === 'sale');
  }, [transactions]);

  // Calculate buyer-wise sales summary
  const buyerSalesSummary = useMemo(() => {
    const summaryMap = new Map();

    // Initialize with buyers from buyers table
    buyers.forEach((buyer) => {
      if (buyer.mobile) {
        const key = buyer.mobile.trim();
        summaryMap.set(key, {
          name: buyer.name,
          mobile: buyer.mobile,
          email: buyer.email || '',
          fixedPrice: buyer.rate,
          dailyQuantity: buyer.quantity,
          totalQuantity: 0,
          totalAmount: 0,
          transactionCount: 0,
          transactions: [],
          milkSources: [],
        });
      }
    });

    // Process sales transactions
    salesTransactions.forEach((tx) => {
      if (tx.buyerPhone) {
        const key = tx.buyerPhone.trim();
        let buyerSummary = summaryMap.get(key);

        if (!buyerSummary) {
          // Buyer not in buyers table, create entry from transaction
          buyerSummary = {
            name: tx.buyer || 'Unknown',
            mobile: tx.buyerPhone,
            email: '',
            fixedPrice: undefined,
            dailyQuantity: undefined,
            totalQuantity: 0,
            totalAmount: 0,
            transactionCount: 0,
            transactions: [],
            milkSources: [],
          };
        }

        const src = (tx.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(String(tx.milkSource).toLowerCase()))
          ? String(tx.milkSource).toLowerCase()
          : 'cow';
        if (!buyerSummary.milkSources.includes(src)) buyerSummary.milkSources.push(src);
        buyerSummary.totalQuantity += tx.quantity || 0;
        buyerSummary.totalAmount += tx.totalAmount || 0;
        buyerSummary.transactionCount += 1;
        buyerSummary.transactions.push(tx);

        summaryMap.set(key, buyerSummary);
      }
    });

    return Array.from(summaryMap.values());
  }, [salesTransactions, buyers]);

  // Filter buyers based on search query
  const filteredBuyerSales = useMemo(() => {
    if (!searchQuery.trim()) {
      return buyerSalesSummary;
    }

    const query = searchQuery.toLowerCase().trim();
    return buyerSalesSummary.filter((buyer) => {
      const nameMatch = buyer.name?.toLowerCase().includes(query);
      const mobileMatch = buyer.mobile?.includes(query);
      const emailMatch = buyer.email?.toLowerCase().includes(query);
      return nameMatch || mobileMatch || emailMatch;
    });
  }, [buyerSalesSummary, searchQuery]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const totalAmount = salesTransactions.reduce((sum, tx) => sum + (tx.totalAmount || 0), 0);
    const totalQuantity = salesTransactions.reduce((sum, tx) => sum + (tx.quantity || 0), 0);
    const totalBuyers = buyerSalesSummary.length;
    const totalTransactions = salesTransactions.length;
    const avgPricePerLiter = totalQuantity > 0 ? totalAmount / totalQuantity : 0;

    return {
      totalAmount,
      totalQuantity,
      totalBuyers,
      totalTransactions,
      avgPricePerLiter,
    };
  }, [salesTransactions, buyerSalesSummary]);

  // Get date range
  const dateRange = useMemo(() => {
    if (salesTransactions.length === 0) return null;

    const dates = salesTransactions.map((tx) => new Date(tx.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    return {
      from: minDate,
      to: maxDate,
    };
  }, [salesTransactions]);

  return (
    <View style={styles.container}>
      <HeaderWithMenu
        title="HiTech Dairy Farm"
        subtitle="Milk Sales Report"
        onNavigate={onNavigate}
        isAuthenticated={true}
        onLogout={onLogout}
      />
      <ScrollView style={styles.content}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Input
            placeholder="Search by name, mobile, or email..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.trim() && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Download monthly report - Particular consumer or All */}
        <View style={styles.downloadSection}>
          <Text style={styles.downloadSectionTitle}>Download Monthly Consumer Report</Text>
        
          <TouchableOpacity
            style={styles.consumerSelectRow}
            onPress={() => setShowConsumerPicker(true)}
          >
            <Text style={styles.consumerSelectLabel}>Consumer:</Text>
            <Text style={styles.consumerSelectValue} numberOfLines={1}>
              {selectedConsumerForDownload ? selectedConsumerForDownload.name : 'All consumers'}
            </Text>
            <Text style={styles.consumerSelectArrow}>▼</Text>
          </TouchableOpacity>
          <Modal
            visible={showConsumerPicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowConsumerPicker(false)}
          >
            <TouchableOpacity
              style={styles.consumerPickerOverlay}
              activeOpacity={1}
              onPress={() => setShowConsumerPicker(false)}
            >
              <View style={styles.consumerPickerBox} onStartShouldSetResponder={() => true}>
                <Text style={styles.consumerPickerTitle}>Select consumer</Text>
                <TouchableOpacity
                  style={styles.consumerPickerItem}
                  onPress={() => {
                    setSelectedConsumerForDownload(null);
                    setShowConsumerPicker(false);
                  }}
                >
                  <Text style={styles.consumerPickerItemText}>All consumers</Text>
                </TouchableOpacity>
                <FlatList
                  data={filteredBuyerSales}
                  keyExtractor={(item) => item.mobile || ''}
                  style={{ maxHeight: 280 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.consumerPickerItem}
                      onPress={() => {
                        setSelectedConsumerForDownload({ name: item.name, mobile: item.mobile });
                        setShowConsumerPicker(false);
                      }}
                    >
                      <Text style={styles.consumerPickerItemText} numberOfLines={1}>
                        {item.name} ({item.mobile})
                      </Text>
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity
                  style={styles.consumerPickerCancel}
                  onPress={() => setShowConsumerPicker(false)}
                >
                  <Text style={styles.consumerPickerCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
          <View style={styles.monthSelectorRow}>
            <TouchableOpacity onPress={() => changeReportMonth(-1)} style={styles.monthArrow}>
              <Text style={styles.monthArrowText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTH_NAMES[reportMonth - 1]} {reportYear}
            </Text>
            <TouchableOpacity onPress={() => changeReportMonth(1)} style={styles.monthArrow}>
              <Text style={styles.monthArrowText}>→</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.downloadButtonsRow}>
            <TouchableOpacity
              style={[styles.downloadButton, styles.downloadButtonExcel]}
              onPress={() => handleDownloadExport('excel', selectedConsumerForDownload ? selectedConsumerForDownload.mobile : null)}
              disabled={downloadLoading != null}
            >
              {(downloadLoading === 'excel' || (selectedConsumerForDownload && downloadLoading === `excel-${selectedConsumerForDownload.mobile}`)) ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.downloadButtonText}>📥 Download Excel</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.downloadButton, styles.downloadButtonPdf]}
              onPress={() => handleDownloadExport('pdf', selectedConsumerForDownload ? selectedConsumerForDownload.mobile : null)}
              disabled={downloadLoading != null}
            >
              {(downloadLoading === 'pdf' || (selectedConsumerForDownload && downloadLoading === `pdf-${selectedConsumerForDownload.mobile}`)) ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.downloadButtonText}>📄 Download PDF</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Overall Statistics */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Overall Sales Summary</Text>
          
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, styles.statCardPrimary]}>
              <Text style={styles.statLabel}>Total Sales</Text>
              <Text style={styles.statValue}>{formatCurrency(overallStats.totalAmount)}</Text>
              <Text style={styles.statSubtext}>{overallStats.totalQuantity.toFixed(2)} Liters</Text>
            </View>

            <View style={[styles.statCard, styles.statCardSecondary]}>
              <Text style={styles.statLabel}>Total Buyers</Text>
              <Text style={styles.statValue}>{overallStats.totalBuyers}</Text>
              <Text style={styles.statSubtext}>{overallStats.totalTransactions} Transactions</Text>
            </View>

            <View style={[styles.statCard, styles.statCardTertiary]}>
              <Text style={styles.statLabel}>Avg Price/Liter</Text>
              <Text style={styles.statValue}>{formatCurrency(overallStats.avgPricePerLiter)}</Text>
              <Text style={styles.statSubtext}>Per Liter</Text>
            </View>
          </View>

          {dateRange && (
            <View style={styles.dateRangeCard}>
              <Text style={styles.dateRangeLabel}>Date Range:</Text>
              <Text style={styles.dateRangeText}>
                {formatDate(dateRange.from)} to {formatDate(dateRange.to)}
              </Text>
            </View>
          )}
        </View>

        {/* Flow Chart - commented out */}
        {/* <View style={styles.flowChartContainer}>
          <Text style={styles.sectionTitle}>Milk Sales Flow Chart</Text>
          <View style={styles.flowChart}>
            <View style={styles.flowNode}>
              <View style={[styles.flowNodeBox, styles.flowNodeSource]}>
                <Text style={styles.flowNodeIcon}>🐄</Text>
                <Text style={styles.flowNodeTitle}>HiTech Dairy Farm</Text>
                <Text style={styles.flowNodeSubtitle}>Milk Source</Text>
              </View>
            </View>
            <View style={styles.flowArrowContainer}>
              <View style={styles.flowArrowLine} />
              <Text style={styles.flowArrowText}>↓</Text>
              <Text style={styles.flowArrowLabel}>
                {overallStats.totalQuantity.toFixed(2)} L Total
              </Text>
            </View>
            <View style={styles.flowNode}>
              <View style={[styles.flowNodeBox, styles.flowNodeCenter]}>
                <Text style={styles.flowNodeIcon}>💰</Text>
                <Text style={styles.flowNodeTitle}>Sales</Text>
                <Text style={styles.flowNodeSubtitle}>
                  {overallStats.totalTransactions} Transactions
                </Text>
                <Text style={styles.flowNodeAmount}>
                  {formatCurrency(overallStats.totalAmount)}
                </Text>
              </View>
            </View>
            <View style={styles.flowArrowContainer}>
              <View style={styles.flowArrowLine} />
              <Text style={styles.flowArrowText}>↓</Text>
              <Text style={styles.flowArrowLabel}>
                {overallStats.totalBuyers} Buyers
              </Text>
            </View>
            <View style={styles.flowBuyersGrid}>
              {filteredBuyerSales
                .sort((a, b) => b.totalAmount - a.totalAmount)
                .slice(0, 6)
                .map((buyer, index) => (
                  <View key={index} style={styles.flowBuyerNode}>
                    <View style={[styles.flowNodeBox, styles.flowNodeBuyer]}>
                      <Text style={styles.flowNodeIcon}>👤</Text>
                      <Text style={styles.flowBuyerName} numberOfLines={1}>
                        {buyer.name}
                      </Text>
                      <Text style={styles.flowBuyerQuantity}>
                        {buyer.totalQuantity.toFixed(2)} L
                      </Text>
                      <Text style={styles.flowBuyerAmount}>
                        {formatCurrency(buyer.totalAmount)}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
            <View style={styles.flowSummary}>
              <View style={styles.flowSummaryItem}>
                <Text style={styles.flowSummaryLabel}>Total Buyers</Text>
                <Text style={styles.flowSummaryValue}>{overallStats.totalBuyers}</Text>
              </View>
              <View style={styles.flowSummaryItem}>
                <Text style={styles.flowSummaryLabel}>Total Sales</Text>
                <Text style={styles.flowSummaryValue}>
                  {formatCurrency(overallStats.totalAmount)}
                </Text>
              </View>
              <View style={styles.flowSummaryItem}>
                <Text style={styles.flowSummaryLabel}>Total Quantity</Text>
                <Text style={styles.flowSummaryValue}>
                  {overallStats.totalQuantity.toFixed(2)} L
                </Text>
              </View>
            </View>
          </View>
        </View> */}

        {/* Buyer-wise Breakdown */}
        <View style={styles.buyerBreakdownContainer}>
          <Text style={styles.sectionTitle}>
            Buyer-wise Sales Breakdown
            {searchQuery.trim() && (
              <Text style={styles.searchResultText}>
                {' '}({filteredBuyerSales.length} found)
              </Text>
            )}
          </Text>

          {loading ? (
            <View style={styles.centerContainer}>
              <Text style={styles.loadingText}>Loading sales data...</Text>
            </View>
          ) : filteredBuyerSales.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {searchQuery.trim() ? 'No buyers found matching your search' : 'No sales data available'}
              </Text>
            </View>
          ) : (
            filteredBuyerSales
              .sort((a, b) => b.totalAmount - a.totalAmount) // Sort by total amount (highest first)
              .map((buyer, index) => (
                <View key={index} style={styles.buyerCard}>
                  <View style={styles.buyerCardHeader}>
                    <View style={styles.buyerCardHeaderLeft}>
                      <Text style={styles.buyerName}>{buyer.name}</Text>
                      <View style={styles.buyerContactInfo}>
                        <Text style={styles.buyerMobile}>📱 {buyer.mobile}</Text>
                        {buyer.email && (
                          <Text style={styles.buyerEmail}>✉️ {buyer.email}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.buyerCardHeaderRight}>
                      <Text style={styles.buyerTotalAmount}>{formatCurrency(buyer.totalAmount)}</Text>
                      <Text style={styles.buyerTotalQuantity}>{buyer.totalQuantity.toFixed(2)} L</Text>
                    </View>
                  </View>
                  {buyer.milkSources && buyer.milkSources.length > 0 && (
                    <View style={styles.buyerMilkSourcesRow}>
                      <Text style={styles.buyerMilkSourcesLabel}>Source: </Text>
                      <Text style={styles.buyerMilkSourcesValue}>
                        {[...buyer.milkSources].sort().map((s) => getMilkSourceLabel(s)).join(', ')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.buyerCardBody}>
                    <View style={styles.buyerStatsRow}>
                      <View style={styles.buyerStatItem}>
                        <Text style={styles.buyerStatLabel}>Transactions</Text>
                        <Text style={styles.buyerStatValue}>{buyer.transactionCount}</Text>
                      </View>
                      <View style={styles.buyerStatItem}>
                        <Text style={styles.buyerStatLabel}>Avg Price/L</Text>
                        <Text style={styles.buyerStatValue}>
                          {buyer.totalQuantity > 0
                            ? formatCurrency(buyer.totalAmount / buyer.totalQuantity)
                            : 'N/A'}
                        </Text>
                      </View>
                      {buyer.fixedPrice && (
                        <View style={styles.buyerStatItem}>
                          <Text style={styles.buyerStatLabel}>Fixed Price</Text>
                          <Text style={styles.buyerStatValue}>{formatCurrency(buyer.fixedPrice)}/L</Text>
                        </View>
                      )}
                    </View>

                    {buyer.dailyQuantity && (
                      <View style={styles.buyerDetailRow}>
                        <Text style={styles.buyerDetailLabel}>Daily Quantity:</Text>
                        <Text style={styles.buyerDetailValue}>{buyer.dailyQuantity.toFixed(2)} L/day</Text>
                      </View>
                    )}

                    {/* Transaction List */}
                    {buyer.transactions.length > 0 && (
                      <View style={styles.transactionsList}>
                        <Text style={styles.transactionsListTitle}>Recent Transactions:</Text>
                        {buyer.transactions
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 5) // Show last 5 transactions
                          .map((tx, txIndex) => (
                            <View key={txIndex} style={styles.transactionRow}>
                              <View style={styles.transactionRowLeft}>
                                <Text style={styles.transactionDate}>{formatDate(new Date(tx.date))}</Text>
                                <Text style={styles.transactionDetails}>
                                  {tx.quantity.toFixed(2)} L {getMilkSourceLabel(tx.milkSource)} @ {formatCurrency(tx.pricePerLiter)}/L
                                </Text>
                              </View>
                              <Text style={styles.transactionAmount}>{formatCurrency(tx.totalAmount)}</Text>
                            </View>
                          ))}
                        {buyer.transactions.length > 5 && (
                          <Text style={styles.moreTransactionsText}>
                            +{buyer.transactions.length - 5} more transactions
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Download this customer - month from top selector */}
                    <View style={styles.buyerDownloadRow}>
                      <Text style={styles.buyerDownloadLabel}>Download this customer:</Text>
                      <View style={styles.buyerDownloadButtons}>
                        <TouchableOpacity
                          style={[styles.buyerDownloadBtn, styles.buyerDownloadBtnExcel]}
                          onPress={() => handleDownloadExport('excel', buyer.mobile)}
                          disabled={downloadLoading != null}
                        >
                          {downloadLoading === `excel-${buyer.mobile}` ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.buyerDownloadBtnText}>Excel</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.buyerDownloadBtn, styles.buyerDownloadBtnPdf]}
                          onPress={() => handleDownloadExport('pdf', buyer.mobile)}
                          disabled={downloadLoading != null}
                        >
                          {downloadLoading === `pdf-${buyer.mobile}` ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.buyerDownloadBtnText}>PDF</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              ))
          )}
        </View>
      </ScrollView>
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
  searchContainer: {
    marginBottom: 15,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E0E0',
  },
  clearButton: {
    position: 'absolute',
    right: 10,
    top: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: 'bold',
  },
  downloadSection: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  downloadSectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  downloadSectionSubtext: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
  },
  consumerSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  consumerSelectLabel: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
    marginRight: 8,
  },
  consumerSelectValue: {
    flex: 1,
    fontSize: 15,
    color: '#1B5E20',
  },
  consumerSelectArrow: {
    fontSize: 12,
    color: '#2E7D32',
  },
  consumerPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  consumerPickerBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '70%',
    padding: 16,
  },
  consumerPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  consumerPickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  consumerPickerItemText: {
    fontSize: 16,
    color: '#333',
  },
  consumerPickerCancel: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  consumerPickerCancelText: {
    fontSize: 16,
    color: '#C62828',
    fontWeight: '600',
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  monthArrow: {
    padding: 10,
    marginHorizontal: 8,
  },
  monthArrowText: {
    fontSize: 20,
    color: '#2E7D32',
    fontWeight: 'bold',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1B5E20',
    minWidth: 160,
    textAlign: 'center',
  },
  downloadButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  downloadButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 140,
    alignItems: 'center',
  },
  downloadButtonExcel: {
    backgroundColor: '#217346',
  },
  downloadButtonPdf: {
    backgroundColor: '#C62828',
  },
  downloadButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  searchResultText: {
    fontSize: 16,
    fontWeight: 'normal',
    color: '#666',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statCard: {
    width: '48%',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
  },
  statCardPrimary: {
    backgroundColor: '#2196F3',
  },
  statCardSecondary: {
    backgroundColor: '#4CAF50',
  },
  statCardTertiary: {
    width: '100%',
    backgroundColor: '#FF9800',
  },
  statLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 12,
    color: '#E8F5E9',
  },
  dateRangeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  dateRangeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  dateRangeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  buyerBreakdownContainer: {
    marginBottom: 20,
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
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  buyerCard: {
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
  buyerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  buyerCardHeaderLeft: {
    flex: 1,
  },
  buyerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  buyerContactInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  buyerMobile: {
    fontSize: 13,
    color: '#666',
  },
  buyerEmail: {
    fontSize: 13,
    color: '#666',
  },
  buyerCardHeaderRight: {
    alignItems: 'flex-end',
  },
  buyerTotalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  buyerTotalQuantity: {
    fontSize: 14,
    color: '#666',
  },
  buyerMilkSourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  buyerMilkSourcesLabel: {
    fontSize: 12,
    color: '#999',
  },
  buyerMilkSourcesValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  buyerCardBody: {
    marginTop: 10,
  },
  buyerStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  buyerStatItem: {
    alignItems: 'center',
  },
  buyerStatLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  buyerStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  buyerDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  buyerDetailLabel: {
    fontSize: 14,
    color: '#666',
  },
  buyerDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  transactionsList: {
    marginTop: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  transactionsListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  transactionRowLeft: {
    flex: 1,
  },
  transactionDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  transactionDetails: {
    fontSize: 12,
    color: '#666',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  moreTransactionsText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  buyerDownloadRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  buyerDownloadLabel: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
  },
  buyerDownloadButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  buyerDownloadBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  buyerDownloadBtnExcel: {
    backgroundColor: '#217346',
  },
  buyerDownloadBtnPdf: {
    backgroundColor: '#C62828',
  },
  buyerDownloadBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  flowChartContainer: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  flowChart: {
    alignItems: 'center',
  },
  flowNode: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 10,
  },
  flowNodeBox: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  flowNodeSource: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  flowNodeCenter: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  flowNodeBuyer: {
    backgroundColor: '#FFF3E0',
    borderWidth: 2,
    borderColor: '#FF9800',
    minWidth: 140,
    padding: 12,
  },
  flowNodeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  flowNodeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  flowNodeSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  flowNodeAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
    marginTop: 4,
  },
  flowBuyerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  flowBuyerQuantity: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  flowBuyerAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9800',
  },
  flowArrowContainer: {
    alignItems: 'center',
    marginVertical: 10,
    width: '100%',
  },
  flowArrowLine: {
    width: 2,
    height: 30,
    backgroundColor: '#2196F3',
    marginBottom: 5,
  },
  flowArrowText: {
    fontSize: 24,
    color: '#2196F3',
    fontWeight: 'bold',
  },
  flowArrowLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    fontWeight: '500',
  },
  flowBuyersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
    marginTop: 10,
    gap: 10,
  },
  flowBuyerNode: {
    width: '48%',
    marginBottom: 10,
  },
  flowSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#E0E0E0',
  },
  flowSummaryItem: {
    alignItems: 'center',
  },
  flowSummaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  flowSummaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
});

