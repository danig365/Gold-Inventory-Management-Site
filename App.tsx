
import React, { useState, useEffect, useMemo } from 'react';
import { Customer, Transaction, AppState, Bank, AuthUser } from './types';
import Dashboard from './components/Dashboard';
import CustomerLedger from './components/CustomerLedger';
import MonthlyReport from './components/MonthlyReport';
import DailyTradeReport from './components/DailyTradeReport';
import CustomerSummaryReport from './components/CustomerSummaryReport';
import BankLedger from './components/BankLedger';
import { Layout } from './components/Layout';
import { AuthPortal } from './components/AuthPortal';
import { api } from './api';

const THEME_KEY = 'haroon_dark_mode';

const emptyState: AppState = {
  customers: [],
  transactions: [],
  banks: [],
};

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem(THEME_KEY) === 'true';
  });

  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const [useDatabase, setUseDatabase] = useState(true);
  
  const [currentView, setCurrentView] = useState<{
    type: 'dashboard' | 'ledger' | 'report' | 'summary' | 'banks' | 'daily';
    customerId?: string;
  }>({ type: 'dashboard' });

  const [state, setState] = useState<AppState>(emptyState);

  // Restore existing session on mount
  useEffect(() => {
    const restoreSession = async () => {
      if (!api.hasToken()) {
        setAuthChecking(false);
        return;
      }

      try {
        const user = await api.getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.warn('Session restore failed:', error);
        await api.logout();
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    };

    restoreSession();
  }, []);

  // Load user-scoped data when a user logs in
  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) {
        setState(emptyState);
        setHasLoadedData(false);
        return;
      }

      setIsLoadingData(true);
      setHasLoadedData(false);

      try {
        const data = await api.getAppData();
        if (data && data.customers && data.transactions !== undefined && data.banks !== undefined) {
          setState(data as AppState);
          setUseDatabase(true);
        } else {
          setState(emptyState);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        if ((error as Error).message.toLowerCase().includes('unauthorized')) {
          await api.logout();
          setCurrentUser(null);
          setState(emptyState);
        }
      } finally {
        setHasLoadedData(true);
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [currentUser]);

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
    if (!currentUser || !hasLoadedData) return;

    const saveData = async () => {
      try {
        if (useDatabase) {
          const result = await api.saveAppData(state);
          if (result && result.success) {
            return;
          }
        }
      } catch (error) {
        console.warn('Server save failed:', error);
        if ((error as Error).message.toLowerCase().includes('unauthorized')) {
          await api.logout();
          setCurrentUser(null);
        }
      }
    };

    saveData();
  }, [state, useDatabase, currentUser, hasLoadedData]);

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

  const handleLogin = async (username: string, password: string) => {
    const user = await api.login(username, password);
    setCurrentUser(user);
    setCurrentView({ type: 'dashboard' });
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setState(emptyState);
    setCurrentView({ type: 'dashboard' });
    setHasLoadedData(false);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-200">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium tracking-wide">Restoring session...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPortal onLogin={handleLogin} />;
  }

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-200">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium tracking-wide">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <Layout 
        projectName={currentUser.projectName}
        userDisplayName={currentUser.displayName}
        userRole={currentUser.role}
        onLogoClick={() => setCurrentView({ type: 'dashboard' })}
        onViewReport={() => setCurrentView({ type: 'report' })}
        onViewSummary={() => setCurrentView({ type: 'summary' })}
        onViewDashboard={() => setCurrentView({ type: 'dashboard' })}
        onViewBanks={() => setCurrentView({ type: 'banks' })}
        onViewDaily={() => setCurrentView({ type: 'daily' })}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onLogout={handleLogout}
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
          currentUser.projectName
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
