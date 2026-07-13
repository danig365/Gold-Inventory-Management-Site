
import React, { useState, useEffect, useMemo } from 'react';
import { Customer, Transaction, AppState, Bank, AuthUser, TrashEntry } from './types';
import Dashboard from './components/Dashboard';
import CustomerLedger from './components/CustomerLedger';
import MonthlyReport from './components/MonthlyReport';
import DailyTradeReport from './components/DailyTradeReport';
import CustomerSummaryReport from './components/CustomerSummaryReport';
import BankLedger from './components/BankLedger';
import BackupStatus from './components/BackupStatus';
import Trash from './components/Trash';
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

  const [showBackupPanel, setShowBackupPanel] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  
  const [currentView, setCurrentView] = useState<{
    type: 'dashboard' | 'ledger' | 'report' | 'summary' | 'banks' | 'daily' | 'trash';
    customerId?: string;
    metalFilter?: 'ALL' | 'GOLD' | 'SILVER' | 'COPPER';
  }>({ type: 'dashboard' });
  const [dashboardMetalFilter, setDashboardMetalFilter] = useState<'ALL' | 'GOLD' | 'SILVER' | 'COPPER'>('ALL');

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

      // Fetch latest backup time for sidebar health indicator
      try {
        const backups = await api.listMyBackups();
        if (backups.length > 0) setLastBackupAt(backups[0].createdAt);
      } catch {
        // Non-critical — sidebar dot stays grey
      }
    };

    loadData();
  }, [currentUser]);

  useEffect(() => {
    document.title = currentUser?.projectName ? `${currentUser.projectName}` : 'Gold Smith';
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

  const deleteCustomer = async (id: string) => {
    const customer = state.customers.find(c => c.id === id);
    if (!customer) return;
    const relatedTransactions = state.transactions.filter(t => t.customerId === id);
    try {
      await api.moveToTrash('customer', id, { customer, transactions: relatedTransactions }, customer.name);
    } catch (error) {
      console.error('Failed to move customer to trash:', error);
      alert('Failed to delete customer: ' + (error as Error).message);
      return;
    }
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

  const deleteBank = async (id: string) => {
    const bank = state.banks.find(b => b.id === id);
    if (!bank) return;
    const relatedTransactions = state.transactions.filter(t => t.bankId === id);
    try {
      await api.moveToTrash('bank', id, { bank, transactions: relatedTransactions }, bank.name);
    } catch (error) {
      console.error('Failed to move bank to trash:', error);
      alert('Failed to delete bank: ' + (error as Error).message);
      return;
    }
    setState(prev => ({
      ...prev,
      banks: prev.banks.filter(b => b.id !== id),
      transactions: prev.transactions.filter(t => t.bankId !== id)
    }));
  };

  const addTransaction = (transaction: Transaction) => {
    const withTimestamp: Transaction = { ...transaction, createdAt: transaction.createdAt || new Date().toISOString() };
    setState(prev => ({ ...prev, transactions: [...prev.transactions, withTimestamp] }));
  };

  const updateTransaction = (updatedTransaction: Transaction) => {
    setState(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === updatedTransaction.id ? updatedTransaction : t)
    }));
  };

  const deleteTransaction = async (id: string) => {
    const transaction = state.transactions.find(t => t.id === id);
    if (!transaction) return;
    const customerName = state.customers.find(c => c.id === transaction.customerId)?.name;
    const label = [transaction.type.split('_').join(' '), customerName, transaction.remarks].filter(Boolean).join(' - ');
    try {
      await api.moveToTrash('transaction', id, transaction, label);
    } catch (error) {
      console.error('Failed to move transaction to trash:', error);
      alert('Failed to delete transaction: ' + (error as Error).message);
      return;
    }
    setState(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id)
    }));
  };

  const restoreTrashItem = async (entry: TrashEntry) => {
    await api.restoreFromTrash(entry.id);
    if (entry.itemType === 'customer') {
      const { customer, transactions } = entry.itemData as { customer: Customer; transactions: Transaction[] };
      setState(prev => ({
        ...prev,
        customers: prev.customers.some(c => c.id === customer.id) ? prev.customers : [...prev.customers, customer],
        transactions: [...prev.transactions, ...transactions.filter(t => !prev.transactions.some(pt => pt.id === t.id))],
      }));
    } else if (entry.itemType === 'bank') {
      const { bank, transactions } = entry.itemData as { bank: Bank; transactions: Transaction[] };
      setState(prev => ({
        ...prev,
        banks: prev.banks.some(b => b.id === bank.id) ? prev.banks : [...prev.banks, bank],
        transactions: [...prev.transactions, ...transactions.filter(t => !prev.transactions.some(pt => pt.id === t.id))],
      }));
    } else if (entry.itemType === 'transaction') {
      const transaction = entry.itemData as Transaction;
      setState(prev => ({
        ...prev,
        transactions: prev.transactions.some(t => t.id === transaction.id) ? prev.transactions : [...prev.transactions, transaction],
      }));
    }
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
        onViewTrash={() => setCurrentView({ type: 'trash' })}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        onBackup={handleBackup}
        onRestore={handleRestore}
        useDatabase={useDatabase}
        onOpenBackupPanel={() => setShowBackupPanel(true)}
        lastBackupAt={lastBackupAt}
        activeView={currentView.type === 'ledger' ? 'dashboard' : currentView.type}
        title={
          currentView.type === 'ledger' ? `Ledger: ${currentCustomer?.name}` : 
          currentView.type === 'report' ? '30-Day Activity Report' : 
          currentView.type === 'summary' ? 'Customer Summary Report' :
          currentView.type === 'banks' ? 'Bank Statement Manager' :
          currentView.type === 'daily' ? 'Daily Buy/Sell Sheet' :
          currentView.type === 'trash' ? 'Trash' :
          currentUser.projectName
        }
      >
        {currentView.type === 'dashboard' ? (
          <Dashboard
            customers={state.customers}
            transactions={state.transactions}
            banks={state.banks}
            onSelectCustomer={(id, mf) => setCurrentView({ type: 'ledger', customerId: id, metalFilter: mf })}
            onAddCustomer={addCustomer}
            onUpdateCustomer={updateCustomer}
            onDeleteCustomer={deleteCustomer}
            projectName={currentUser.projectName}
            shopPhone={currentUser.phone || ''}
            metalFilter={dashboardMetalFilter}
            onMetalFilterChange={setDashboardMetalFilter}
            hideCopper={currentUser.id === 'u_haroon'}
          />
        ) : currentView.type === 'report' ? (
          <MonthlyReport 
            transactions={state.transactions}
            customers={state.customers}
            projectName={currentUser.projectName}
            shopPhone={currentUser.phone || ''}
            hideCopper={currentUser.id === 'u_haroon'}
          />
        ) : currentView.type === 'daily' ? (
          <DailyTradeReport 
            transactions={state.transactions}
            customers={state.customers}
            projectName={currentUser.projectName}
            shopPhone={currentUser.phone || ''}
            hideCopper={currentUser.id === 'u_haroon'}
          />
        ) : currentView.type === 'summary' ? (
          <CustomerSummaryReport
            customers={state.customers}
            transactions={state.transactions}
            banks={state.banks}
            projectName={currentUser.projectName}
            shopPhone={currentUser.phone || ''}
            hideCopper={currentUser.id === 'u_haroon'}
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
            onUpdateTransaction={updateTransaction}
            onDeleteTransaction={deleteTransaction}
            projectName={currentUser.projectName}
            shopPhone={currentUser.phone || ''}
          />
        ) : currentView.type === 'trash' ? (
          <Trash onRestore={restoreTrashItem} />
        ) : (
          currentCustomer && (
            <CustomerLedger
              customer={currentCustomer}
              customers={state.customers}
              transactions={state.transactions.filter(t => t.customerId === currentCustomer.id)}
              allTransactions={state.transactions}
              banks={state.banks}
              onBack={() => setCurrentView({ type: 'dashboard' })}
              onAddTransaction={addTransaction}
              onUpdateTransaction={updateTransaction}
              onDeleteTransaction={deleteTransaction}
              projectName={currentUser.projectName}
              shopPhone={currentUser.phone || ''}
              metalFilter={currentView.metalFilter || 'ALL'}
              hideCopper={currentUser.id === 'u_haroon'}
            />
          )
        )}
      </Layout>

      {/* Data Backup Panel */}
      {showBackupPanel && (
        <BackupStatus
          onClose={() => setShowBackupPanel(false)}
          onRestoreSuccess={(data: AppState) => {
            setState(data);
            setShowBackupPanel(false);
          }}
        />
      )}
    </div>
  );
};

export default App;
