# Dairy Farm Management App - Folder Structure

## Overview
This is a React Native application for managing a dairy farm with features for user management, animal transactions, milk sales/purchases, fodder (chara) management, and financial reports.

## Folder Structure

```
src/
├── pages/              # Screen components
│   ├── auth/          # Authentication screens
│   │   ├── LoginScreen.tsx
│   │   └── SignupScreen.tsx
│   ├── dashboard/     # Dashboard screen
│   │   └── DashboardScreen.tsx
│   ├── animals/       # Animal management screens
│   │   ├── AnimalSalesScreen.tsx
│   │   └── AnimalPurchaseScreen.tsx
│   ├── milk/          # Milk transaction screens
│   │   ├── MilkSalesScreen.tsx
│   │   └── MilkPurchaseScreen.tsx
│   ├── chara/         # Fodder management screens
│   │   ├── CharaPurchaseScreen.tsx
│   │   └── DailyCharaConsumptionScreen.tsx
│   └── reports/       # Reports screens
│       └── ProfitLossScreen.tsx
│
├── components/         # Reusable components
│   ├── common/        # Common UI components
│   │   ├── Button.tsx
│   │   └── Input.tsx
│   └── forms/         # Form components
│
├── services/          # Business logic and API calls
│   ├── api/          # API client configuration
│   │   └── apiClient.ts
│   ├── auth/         # Authentication service
│   │   └── authService.ts
│   ├── animals/      # Animal service
│   │   └── animalService.ts
│   ├── milk/         # Milk service
│   │   └── milkService.ts
│   ├── chara/        # Chara (fodder) service
│   │   └── charaService.ts
│   └── reports/      # Reports service
│       └── reportService.ts
│
├── types/            # TypeScript type definitions
│   └── index.ts
│
├── utils/            # Utility functions
│   ├── dateUtils.ts
│   └── currencyUtils.ts
│
├── navigation/       # Navigation configuration
│   └── AppNavigator.tsx
│
├── context/          # Context API for state management
│
└── constants/       # App constants
    └── index.ts
```

## Features

### 1. User Management (Auth)
- Login/Signup functionality
- User authentication and session management

### 2. Animal Management
- Animal Sales: Record animal sales transactions
- Animal Purchase: Record animal purchase transactions

### 3. Milk Management
- Milk Sales: Record milk sales transactions
- Milk Purchase: Record milk purchase transactions

### 4. Chara (Fodder) Management
- Chara Purchase: Record fodder purchase transactions
- Daily Chara Consumption: Track daily fodder consumption

### 5. Reports
- Profit/Loss: Calculate and display financial reports

### 6. Dashboard
- Overview of all farm activities
- Summary statistics
- Quick access to main features

## Next Steps

1. Install navigation library (React Navigation)
2. Set up state management (Context API or Redux)
3. Implement API integration
4. Add form validation
5. Implement data persistence (AsyncStorage or database)
6. Add charts/graphs for reports
7. Style the UI components

