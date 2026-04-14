
import React, { useState, useEffect, useMemo } from 'react';
import { Customer, Transaction, AppState, Bank } from './types';
import Dashboard from './components/Dashboard';
import CustomerLedger from './components/CustomerLedger';
import MonthlyReport from './components/MonthlyReport';
import DailyTradeReport from './components/DailyTradeReport';
import CustomerSummaryReport from './components/CustomerSummaryReport';
import BankLedger from './components/BankLedger';
import { Layout } from './components/Layout';
import { api } from './api';

const STORAGE_KEY = 'haroon_gold_smith_v2';
const THEME_KEY = 'haroon_dark_mode';

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem(THEME_KEY) === 'true';
  });

  const [useDatabase, setUseDatabase] = useState(true);
  
  const [currentView, setCurrentView] = useState<{
    type: 'dashboard' | 'ledger' | 'report' | 'summary' | 'banks' | 'daily';
    customerId?: string;
  }>({ type: 'dashboard' });

  const [state, setState] = useState<AppState>(() => {
    // Start with default state
    return {
      customers: [
        { id: '1', name: 'Ali Ahmed', address: 'Quetta', phone: '0300-1234567' }
      ],
      transactions: [],
      banks: [
        { id: 'b1', name: 'Meezan Bank', accountNumber: '010101', initialBalance: 0 }
      ]
    };
  });

  // Load data from server API on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.getAppData();
        if (data && data.customers && data.transactions !== undefined) {
          setState(data);
          setUseDatabase(true);
          console.log('Loaded data from server');
          return;
        }
      } catch (error) {
        console.warn('Server not available, falling back to localStorage:', error);
      }

      // Fallback to localStorage
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setState(JSON.parse(saved));
          setUseDatabase(false);
          console.log('Loaded data from localStorage');
        }
      } catch (error) {
        console.error('Error loading from localStorage:', error);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Save data to server API on state change
  useEffect(() => {
    const saveData = async () => {
      try {
        if (useDatabase) {
          const result = await api.saveAppData(state);
          if (result && result.success) {
            return;
          }
        }
      } catch (error) {
        console.warn('Server save failed, using localStorage:', error);
      }

      // Fallback to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.error('Error saving data:', error);
      }
    };

    saveData();
  }, [state, useDatabase]);

  const addCustomer = (customer: Customer) => {
    setState(prev => ({ ...prev, customers: [...prev.customers, customer] }));
  };

  const updateCustomer = (updatedCustomer: Customer) => {
    setState(prev => ({
      ...prev,
      customers: prev.customers.map(c => c.id === updatedCustomer.id ? updatedCustomer : c)
    }));
  };

  const deleteCustomer = (id: string) => {
    setState(prev => ({
      ...prev,
      customers: prev.customers.filter(c => c.id !== id),
      transactions: prev.transactions.filter(t => t.customerId !== id)
    }));
    if (currentView.customerId === id) {
      setCurrentView({ type: 'dashboard' });
    }
  };

  const addBank = (bank: Bank) => {
    setState(prev => ({ ...prev, banks: [...prev.banks, bank] }));
  };

  const updateBank = (updatedBank: Bank) => {
    setState(prev => ({ 
      ...prev, 
      banks: prev.banks.map(b => b.id === updatedBank.id ? updatedBank : b) 
    }));
  };

  const deleteBank = (id: string) => {
    setState(prev => ({
      ...prev,
      banks: prev.banks.filter(b => b.id !== id),
      transactions: prev.transactions.filter(t => t.bankId !== id)
    }));
  };

  const addTransaction = (transaction: Transaction) => {
    setState(prev => ({ ...prev, transactions: [...prev.transactions, transaction] }));
  };

  const updateTransaction = (updatedTransaction: Transaction) => {
    setState(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === updatedTransaction.id ? updatedTransaction : t)
    }));
  };

  const deleteTransaction = (id: string) => {
    setState(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id)
    }));
  };

  // Backup database - download as file
  const handleBackup = async () => {
    try {
      await api.downloadBackup();
      alert('Backup downloaded!');
    } catch (error) {
      console.error('Backup error:', error);
      alert('Backup failed: ' + (error as Error).message);
    }
  };

  // Restore database from uploaded file
  const handleRestore = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && confirm('This will replace all current data with the backup. Are you sure?')) {
        try {
          const result = await api.restoreBackup(file);
          if (result.success && result.data) {
            setState(result.data);
            alert('Restore completed successfully!');
          } else {
            alert('Restore failed: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          console.error('Restore error:', error);
          alert('Restore failed: ' + (error as Error).message);
        }
      }
    };
    input.click();
  };

  const currentCustomer = useMemo(() => {
    return state.customers.find(c => c.id === currentView.customerId);
  }, [state.customers, currentView.customerId]);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <Layout 
        onLogoClick={() => setCurrentView({ type: 'dashboard' })}
        onViewReport={() => setCurrentView({ type: 'report' })}
        onViewSummary={() => setCurrentView({ type: 'summary' })}
        onViewDashboard={() => setCurrentView({ type: 'dashboard' })}
        onViewBanks={() => setCurrentView({ type: 'banks' })}
        onViewDaily={() => setCurrentView({ type: 'daily' })}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        isDarkMode={isDarkMode}
        onBackup={handleBackup}
        onRestore={handleRestore}
        useDatabase={useDatabase}
        activeView={currentView.type === 'ledger' ? 'dashboard' : currentView.type}
        title={
          currentView.type === 'ledger' ? `Ledger: ${currentCustomer?.name}` : 
          currentView.type === 'report' ? '30-Day Activity Report' : 
          currentView.type === 'summary' ? 'Customer Summary Report' :
          currentView.type === 'banks' ? 'Bank Statement Manager' :
          currentView.type === 'daily' ? 'Daily Buy/Sell Sheet' :
          'New Jehlum Gold Smith'
        }
      >
        {currentView.type === 'dashboard' ? (
          <Dashboard 
            customers={state.customers} 
            transactions={state.transactions}
            onSelectCustomer={(id) => setCurrentView({ type: 'ledger', customerId: id })}
            onAddCustomer={addCustomer}
            onUpdateCustomer={updateCustomer}
            onDeleteCustomer={deleteCustomer}
          />
        ) : currentView.type === 'report' ? (
          <MonthlyReport 
            transactions={state.transactions}
            customers={state.customers}
          />
        ) : currentView.type === 'daily' ? (
          <DailyTradeReport 
            transactions={state.transactions}
            customers={state.customers}
          />
        ) : currentView.type === 'summary' ? (
          <CustomerSummaryReport
            customers={state.customers}
            transactions={state.transactions}
          />
        ) : currentView.type === 'banks' ? (
          <BankLedger 
            banks={state.banks}
            transactions={state.transactions}
            customers={state.customers}
            onAddBank={addBank}
            onUpdateBank={updateBank}
            onDeleteBank={deleteBank}
            onAddTransaction={addTransaction}
          />
        ) : (
          currentCustomer && (
            <CustomerLedger 
              customer={currentCustomer}
              transactions={state.transactions.filter(t => t.customerId === currentCustomer.id)}
              allTransactions={state.transactions}
              banks={state.banks}
              onBack={() => setCurrentView({ type: 'dashboard' })}
              onAddTransaction={addTransaction}
              onUpdateTransaction={updateTransaction}
              onDeleteTransaction={deleteTransaction}
            />
          )
        )}
      </Layout>
    </div>
  );
};

export default App;
