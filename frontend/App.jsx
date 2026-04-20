import React, { useState, useEffect } from 'react';
import { StatusBar, useColorScheme, ActivityIndicator, View, Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import DashboardScreen from './src/pages/dashboard/DashboardScreen';
import AnimalScreen from './src/pages/animals/AnimalScreen';
import MilkScreen from './src/pages/milk/MilkScreen';
import CharaScreen from './src/pages/chara/CharaScreen';
import ProfitLossScreen from './src/pages/reports/ProfitLossScreen';
import MilkSalesReportScreen from './src/pages/reports/MilkSalesReportScreen';
import BuyerScreen from './src/pages/buyers/BuyerScreen';
import BuyerMonthlySummaryScreen from './src/pages/buyers/BuyerMonthlySummaryScreen';
import SellerScreen from './src/pages/sellers/SellerScreen';
import QuickSaleScreen from './src/pages/milk/QuickSaleScreen';
import DeliveryScheduleScreen from './src/pages/milk/DeliveryScheduleScreen';
import MilkRequestsScreen from './src/pages/milk/MilkRequestsScreen';
import NotificationsScreen from './src/pages/notifications/NotificationsScreen';
import AddAdminScreen from './src/pages/admin/AddAdminScreen';
import AdminListScreen from './src/pages/admin/AdminListScreen';
import PaymentScreen from './src/pages/payments/PaymentScreen';
import PendingPaymentsScreen from './src/pages/payments/PendingPaymentsScreen';
import SettingsScreen from './src/pages/settings/SettingsScreen';
import BuyerDashboardScreen from './src/pages/buyerApp/BuyerDashboardScreen';
import BuyerMilkRequestScreen from './src/pages/buyerApp/BuyerMilkRequestScreen';
import BuyerTransactionHistoryScreen from './src/pages/buyerApp/BuyerTransactionHistoryScreen';
import BuyerPaymentHistoryScreen from './src/pages/buyerApp/BuyerPaymentHistoryScreen';
import BuyerPendingPaymentScreen from './src/pages/buyerApp/BuyerPendingPaymentScreen';
import BuyerScheduleScreen from './src/pages/buyerApp/BuyerScheduleScreen';
import BuyerLedgerScreen from './src/pages/buyerApp/BuyerLedgerScreen';
import BuyerMonthlyBillsScreen from './src/pages/buyerApp/BuyerMonthlyBillsScreen';
import LoginScreen from './src/pages/auth/LoginScreen';
import SignupScreen from './src/pages/auth/SignupScreen';
import ForgotPasswordScreen from './src/pages/auth/ForgotPasswordScreen';
import { authService } from './src/services/auth/authService';
import { setOnTokenExpired } from './src/services/api/apiClient';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null); // 0,1 = admin; 2 = buyer
  const [currentScreen, setCurrentScreen] = useState('Login/Signup');
  const [navParams, setNavParams] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const handleTokenExpired = async () => {
    console.log('[App] Token expired, redirecting to login');
    try {
      await authService.logout();
    } catch (error) {
      console.error('[App] Error during token expiry logout:', error);
    }
    setIsAuthenticated(false);
    setCurrentScreen('Login/Signup');
  };

  // Set up token expiry callback
  useEffect(() => {
    setOnTokenExpired(handleTokenExpired);
  }, []);

  // Check for saved authentication on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await authService.checkAuthToken();
        if (token) {
          const user = await authService.getCurrentUser();
          setUserRole(user?.role ?? null);
          setIsAuthenticated(true);
          if (user?.role === 2) {
            setCurrentScreen('Buyer Dashboard');
          } else {
            setCurrentScreen('Dashboard');
          }
          console.log('[App] Auto-login successful');
        } else {
          setIsAuthenticated(false);
          setCurrentScreen('Login/Signup');
          console.log('[App] No saved token, showing login');
        }
      } catch (error) {
        console.error('[App] Error checking auth:', error);
        setIsAuthenticated(false);
        setCurrentScreen('Login/Signup');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const navigateToScreen = (screen, params) => {
    // Protected screens - only accessible after login
    const protectedScreens = ['Dashboard', 'Animals', 'Milk', 'Quick Sale', 'Delivery Schedule', 'Milk Requests', 'Notifications', 'Chara', 'Profit/Loss', 'Milk Sales Report', 'Buyer', 'Monthly Summary', 'Seller', 'Payments', 'Pending Payments', 'Payments to collect', 'Admin List', 'Add Admin', 'Settings', 'Buyer Dashboard', 'Milk Request', 'My Schedule', 'Ledger', 'Monthly Bills', 'Transaction History', 'Payment History', 'Pending Payment'];
    
    // If trying to access protected screen without login, redirect to login
    if (protectedScreens.includes(screen) && !isAuthenticated) {
      setCurrentScreen('Login/Signup');
      return;
    }
    
    // Allow navigation to login/signup/forgot password screens always
    if (screen === 'Login/Signup' || screen === 'Signup' || screen === 'ForgotPassword') {
      setCurrentScreen(screen);
      setNavParams((p) => ({ ...p, [screen]: undefined }));
      return;
    }
    
    setCurrentScreen(screen);
    setNavParams((p) => ({ ...p, [screen]: params }));
  };

  const handleLoginSuccess = async () => {
    try {
      const user = await authService.getCurrentUser();
      setUserRole(user?.role ?? null);
      setIsAuthenticated(true);
      if (user?.role === 2) {
        setCurrentScreen('Buyer Dashboard');
      } else {
        setCurrentScreen('Dashboard');
      }
    } catch (_) {
      setIsAuthenticated(true);
      setCurrentScreen('Dashboard');
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUserRole(null);
    setIsAuthenticated(false);
    setCurrentScreen('Login/Signup');
  };

  const renderScreen = () => {
    // If not authenticated, only show login/signup screens
    if (!isAuthenticated) {
      switch (currentScreen) {
        case 'Signup':
          return <SignupScreen onNavigate={navigateToScreen} />;
        case 'ForgotPassword':
          return <ForgotPasswordScreen onNavigate={navigateToScreen} />;
        case 'Login/Signup':
        default:
          return <LoginScreen onNavigate={navigateToScreen} onLoginSuccess={handleLoginSuccess} />;
      }
    }

    // If authenticated, show all screens
    switch (currentScreen) {
      case 'Dashboard':
        return <DashboardScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Animals':
        return <AnimalScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Milk':
        return (
          <MilkScreen
            onNavigate={navigateToScreen}
            onLogout={handleLogout}
            openAddSale={navParams['Milk']?.openAddSale}
            onConsumedNavParam={() => setNavParams((p) => ({ ...p, Milk: undefined }))}
          />
        );
      case 'Quick Sale':
        return <QuickSaleScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Delivery Schedule':
        return <DeliveryScheduleScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Milk Requests':
        return <MilkRequestsScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Notifications':
        return <NotificationsScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Chara':
        return <CharaScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Profit/Loss':
        return <ProfitLossScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Milk Sales Report':
        return <MilkSalesReportScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Buyer':
        return (
          <BuyerScreen
            onNavigate={navigateToScreen}
            onLogout={handleLogout}
            initialFocusMobile={navParams?.Buyer?.focusMobile}
            onConsumedFocusParam={() => setNavParams((p) => ({ ...p, Buyer: undefined }))}
            openEditOnFocus={!!navParams?.Buyer?.openEdit}
          />
        );
      case 'Monthly Summary':
        return <BuyerMonthlySummaryScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Seller':
        return <SellerScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Admin List':
        return <AdminListScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Add Admin':
        return <AddAdminScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Payments':
        return (
          <PaymentScreen
            onNavigate={navigateToScreen}
            onLogout={handleLogout}
            openAddPayment={!!navParams?.Payments?.openAddPayment}
            initialCustomerMobile={navParams?.Payments?.customerMobile}
            initialCustomerName={navParams?.Payments?.customerName}
            initialPaymentDate={navParams?.Payments?.paymentDate}
            onConsumedNavParam={() => setNavParams((p) => ({ ...p, Payments: undefined }))}
          />
        );
      case 'Pending Payments':
      case 'Payments to collect':
        return <PendingPaymentsScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Settings':
        return <SettingsScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Buyer Dashboard':
        return <BuyerDashboardScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Milk Request':
        return <BuyerMilkRequestScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'My Schedule':
        return <BuyerScheduleScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Ledger':
        return <BuyerLedgerScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Monthly Bills':
        return <BuyerMonthlyBillsScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Transaction History':
        return <BuyerTransactionHistoryScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Payment History':
        return <BuyerPaymentHistoryScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
      case 'Pending Payment':
        return (
          <BuyerPendingPaymentScreen
            onNavigate={navigateToScreen}
            onLogout={handleLogout}
            initialPayUptoDate={navParams?.['Pending Payment']?.initialPayUptoDate}
          />
        );
      case 'Login/Signup':
        return <LoginScreen onNavigate={navigateToScreen} onLoginSuccess={handleLoginSuccess} />;
      case 'Signup':
        return <SignupScreen onNavigate={navigateToScreen} />;
      default:
        if (userRole === 2) return <BuyerDashboardScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
        return <DashboardScreen onNavigate={navigateToScreen} onLogout={handleLogout} />;
    }
  };

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f7f6' }}>
          <ActivityIndicator size="large" color="#1f6b5b" />
          <Text style={{ marginTop: 16, color: '#556d73', fontSize: 14 }}>Loading...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenWithSafePadding>{renderScreen()}</ScreenWithSafePadding>
    </SafeAreaProvider>
  );
}

/** Wraps screen content with bottom (and top) safe area padding so text/buttons are visible on real devices. */
function ScreenWithSafePadding({ children }) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 20);
  const top = Math.max(insets.top, 12);
  return (
    <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom }}>
      {children}
    </View>
  );
}

export default App;

