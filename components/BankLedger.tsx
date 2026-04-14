import React, { useState, useMemo } from 'react';
import { Bank, Transaction, Customer, PaymentMethod, TransferType, TransactionType } from '../types';
import { PlusCircle, Search, Landmark, FileText, Wallet, Calendar, Filter, X, ArrowUpRight, ArrowDownLeft, ChevronRight, TrendingDown, TrendingUp, Edit2, Trash2, Download, FileSpreadsheet, ChevronDown, AlertTriangle, Hash, Banknote, RotateCcw } from 'lucide-react';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BankLedgerProps {
  banks: Bank[];
  transactions: Transaction[];
  customers: Customer[];
  onAddBank: (bank: Bank) => void;
  onUpdateBank: (bank: Bank) => void;
  onDeleteBank: (id: string) => void;
  onAddTransaction: (transaction: Transaction) => void;
}

const BankLedger: React.FC<BankLedgerProps> = ({ banks, transactions, customers, onAddBank, onUpdateBank, onDeleteBank, onAddTransaction }) => {
  // Navigation & Modal State
  const [selectedBankId, setSelectedBankId] = useState<string | 'ALL'>(banks[0]?.id || 'ALL');
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);
  
  // Consolidated Filter State
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState('');

  // Entry Form State
  const [bankEntry, setBankEntry] = useState({
    type: 'WITHDRAW' as 'WITHDRAW' | 'DEPOSIT',
    amount: 0,
    date: format(new Date(), 'yyyy-MM-dd'),
    remarks: '',
    transferType: TransferType.TF,
    targetBankId: '',
    referenceNo: ''
  });

  // Bank Form State
  const [bankFormData, setBankFormData] = useState({
    name: '',
    accountNumber: '',
    initialBalance: 0
  });

  const handleBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBank) {
      onUpdateBank({
        ...editingBank,
        ...bankFormData
      });
    } else {
      onAddBank({
        id: Date.now().toString(),
        ...bankFormData
      });
    }
    setBankFormData({ name: '', accountNumber: '', initialBalance: 0 });
    setEditingBank(null);
    setIsBankModalOpen(false);
  };

  const openAddBank = () => {
    setEditingBank(null);
    setBankFormData({ name: '', accountNumber: '', initialBalance: 0 });
    setIsBankModalOpen(true);
  };

  const openEditBank = (bank: Bank) => {
    setEditingBank(bank);
    setBankFormData({
      name: bank.name,
      accountNumber: bank.accountNumber,
      initialBalance: bank.initialBalance
    });
    setIsBankModalOpen(true);
  };

  const handleDeleteBank = () => {
    if (deletingBankId) {
      onDeleteBank(deletingBankId);
      if (selectedBankId === deletingBankId) {
        setSelectedBankId('ALL');
      }
      setDeletingBankId(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateRange({ start: '', end: '' });
  };

  // Derived Account Stats
  const bankStats = useMemo(() => {
    return banks.map(bank => {
      // Find transactions where this bank was used
      const bankTxs = transactions.filter(t => t.paymentMethod === PaymentMethod.BANK && t.bankId === bank.id);
      
      let balance = bank.initialBalance;
      bankTxs.forEach(t => {
        balance += (t.cashIn || 0);
        balance -= (t.cashOut || 0);
      });
      return { ...bank, currentBalance: balance, txCount: bankTxs.length };
    });
  }, [banks, transactions]);

  const totalLiquidCash = useMemo(() => bankStats.reduce((sum, b) => sum + b.currentBalance, 0), [bankStats]);
  const activeBank = selectedBankId === 'ALL' ? null : bankStats.find(b => b.id === selectedBankId);

  // Statement Calculation
  const statementData = useMemo(() => {
    const isAll = selectedBankId === 'ALL';
    
    // Sort all relevant transactions by date
    const sortedTxs = [...transactions]
      .filter(t => t.paymentMethod === PaymentMethod.BANK && (isAll || t.bankId === selectedBankId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalanceMap: Record<string, number> = {};
    banks.forEach(b => runningBalanceMap[b.id] = b.initialBalance);
    
    const enrichedTxs = sortedTxs.map(t => {
      const bank = banks.find(b => b.id === t.bankId);
      const customer = t.customerId ? customers.find(c => c.id === t.customerId) : null;
      
      if (t.bankId) {
        runningBalanceMap[t.bankId] += (t.cashIn || 0);
        runningBalanceMap[t.bankId] -= (t.cashOut || 0);
      }
      
      return {
        ...t,
        bankName: bank?.name || 'Unknown Bank',
        customerName: customer?.name || (t.type === TransactionType.BANK_ADJUSTMENT ? 'Bank Adjustment' : 'Self Transfer'),
        balanceAfter: t.bankId ? runningBalanceMap[t.bankId] : 0
      };
    });

    // Apply Filters
    return enrichedTxs.filter(t => {
      let matchesDate = true;
      if (dateRange.start || dateRange.end) {
        const txDate = parseISO(t.date);
        const start = dateRange.start ? startOfDay(parseISO(dateRange.start)) : new Date(0);
        const end = dateRange.end ? endOfDay(parseISO(dateRange.end)) : new Date(8640000000000000);
        matchesDate = isWithinInterval(txDate, { start, end });
      }

      let matchesSearch = true;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        matchesSearch = 
          t.customerName.toLowerCase().includes(term) ||
          (t.remarks?.toLowerCase().includes(term) || false) ||
          (t.referenceNo?.toLowerCase().includes(term) || false) ||
          t.bankName.toLowerCase().includes(term);
      }

      return matchesDate && matchesSearch;
    }).reverse();
  }, [selectedBankId, transactions, customers, banks, dateRange, searchTerm]);

  const exportToExcel = () => {
    const data = statementData.map(t => ({
      'Date': format(new Date(t.date), 'dd/MM/yyyy'),
      'Description': t.customerName,
      'Bank': t.bankName,
      'Credit (+)': t.cashIn || 0,
      'Debit (-)': t.cashOut || 0,
      'Reference': t.referenceNo || '-',
      'Particulars': t.remarks
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bank_Statement');
    XLSX.writeFile(wb, `Bank_Statement_${selectedBankId}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('New Jehlum Gold Smith', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(`Bank Statement: ${selectedBankId === 'ALL' ? 'All Accounts' : activeBank?.name}`, 14, 27);
    autoTable(doc, {
      startY: 35,
      head: [['Date', 'Description', 'Bank', 'IN (+)', 'OUT (-)', 'Balance']],
      body: statementData.map(t => [
        format(new Date(t.date), 'dd/MM/yy'),
        t.customerName,
        t.bankName,
        Math.round(t.cashIn || 0).toLocaleString() || '0',
        Math.round(t.cashOut || 0).toLocaleString() || '0',
        Math.round(t.balanceAfter || 0).toLocaleString() || '-'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [67, 56, 202] }
    });
    doc.save(`Bank_Statement_${selectedBankId}.pdf`);
    setIsExportMenuOpen(false);
  };

  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankEntry.targetBankId || bankEntry.amount <= 0) return;

    onAddTransaction({
      id: Date.now().toString(),
      date: bankEntry.date,
      type: TransactionType.BANK_ADJUSTMENT,
      remarks: bankEntry.remarks || (bankEntry.type === 'WITHDRAW' ? 'Cash Withdrawal' : 'Cash Deposit'),
      paymentMethod: PaymentMethod.BANK,
      bankId: bankEntry.targetBankId,
      transferType: bankEntry.transferType,
      referenceNo: bankEntry.referenceNo,
      cashIn: bankEntry.type === 'DEPOSIT' ? bankEntry.amount : 0,
      cashOut: bankEntry.type === 'WITHDRAW' ? bankEntry.amount : 0
    });

    setIsEntryModalOpen(false);
    setBankEntry({ ...bankEntry, amount: 0, remarks: '', referenceNo: '' });
  };

  const openActionModal = (type: 'WITHDRAW' | 'DEPOSIT', bankId?: string) => {
    setBankEntry(prev => ({ 
      ...prev, 
      type, 
      targetBankId: bankId || (selectedBankId === 'ALL' ? '' : selectedBankId) 
    }));
    setIsEntryModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="font-display text-4xl font-semibold text-indigo-900 dark:text-indigo-300 tracking-tight">Bank Management</h2>
           <p className="text-sm text-gray-500 dark:text-slate-400 font-medium tracking-wide">Monitor cash flow and bank settlements</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           <button 
            onClick={openAddBank}
            className="px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 rounded-xl hover:bg-white dark:hover:bg-slate-900 font-semibold text-sm flex items-center space-x-2 bg-gray-50 dark:bg-slate-800 shadow-sm transition-all active:scale-95"
          >
            <PlusCircle size={14} />
            <span>Add Account</span>
          </button>
          <div className="flex bg-indigo-900 p-1 rounded-xl shadow-lg border border-indigo-800">
             <button 
                onClick={() => openActionModal('DEPOSIT')}
               className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 font-semibold text-sm flex items-center space-x-2 rounded-lg transition-colors mr-1"
             >
                <TrendingUp size={14} />
                <span>Deposit</span>
             </button>
             <button 
                onClick={() => openActionModal('WITHDRAW')}
               className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 font-semibold text-sm flex items-center space-x-2 rounded-lg transition-colors"
             >
                <TrendingDown size={14} />
                <span>Withdraw</span>
             </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Accounts List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-indigo-900 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden group">
            <div className="absolute right-[-10%] top-[-10%] opacity-10 group-hover:scale-110 transition-transform">
               <Wallet size={100} />
            </div>
            <p className="text-xs font-semibold tracking-wide opacity-80 mb-1">Total Liquid Cash</p>
            <p className="text-3xl font-bold">Rs. {Math.round(totalLiquidCash).toLocaleString()}</p>
          </div>

          <button
            onClick={() => setSelectedBankId('ALL')}
            className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between group ${selectedBankId === 'ALL' ? 'bg-indigo-600 border-indigo-700 text-white shadow-xl' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 shadow-sm'}`}
          >
            <div className="flex items-center space-x-3">
               <FileText size={18} className={selectedBankId === 'ALL' ? 'text-indigo-200' : 'text-indigo-400'} />
               <span className="font-semibold text-sm tracking-wide">Show All Accounts</span>
            </div>
            <ChevronRight size={14} className={selectedBankId === 'ALL' ? 'opacity-100' : 'opacity-0'} />
          </button>

          <div className="space-y-2">
            {bankStats.map(b => (
              <div key={b.id} className="relative group">
                <button
                  onClick={() => setSelectedBankId(b.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col ${selectedBankId === b.id ? 'bg-indigo-600 border-indigo-700 text-white shadow-xl scale-[1.02]' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 shadow-sm'}`}
                >
                  <div className="flex items-center justify-between mb-2 w-full">
                    <Landmark size={18} className={selectedBankId === b.id ? 'text-indigo-200' : 'text-indigo-600'} />
                    <div className="flex space-x-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEditBank(b); }}
                        className={`p-1.5 rounded-lg transition-colors ${selectedBankId === b.id ? 'hover:bg-indigo-500 text-white' : 'hover:bg-gray-100 text-gray-400'}`}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDeletingBankId(b.id); }}
                        className={`p-1.5 rounded-lg transition-colors ${selectedBankId === b.id ? 'hover:bg-rose-500 text-white' : 'hover:bg-rose-50 text-rose-400'}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm truncate w-full pr-8 tracking-wide">{b.name}</h3>
                  <p className="text-2xl font-bold tracking-tight mt-0.5">Rs. {Math.round(b.currentBalance).toLocaleString()}</p>
                  <p className={`text-xs font-medium mt-1 ${selectedBankId === b.id ? 'text-indigo-200' : 'text-gray-500 dark:text-slate-400'}`}>A/C: {b.accountNumber}</p>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Section: Ledger Table */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/60 flex flex-col lg:flex-row justify-between items-center gap-4">
              <div className="flex items-center space-x-3">
                 <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl shadow-sm flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-gray-100 dark:border-slate-700">
                    <Landmark size={20} />
                 </div>
                 <div>
                    <h3 className="font-display font-semibold text-gray-800 dark:text-slate-100 tracking-tight text-xl">
                      {selectedBankId === 'ALL' ? 'Consolidated Activity' : `${activeBank?.name} Statement`}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-medium tracking-wide">
                      {selectedBankId === 'ALL' ? 'Activity from all bank accounts' : `Balance Sheet for ${activeBank?.accountNumber}`}
                    </p>
                 </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
                <div className="relative flex-grow lg:flex-grow-0 lg:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search remarks..."
                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm font-medium text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-inner"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex items-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-2 py-1.5 shadow-inner">
                  <Calendar size={12} className="text-gray-400 dark:text-slate-500 mr-2" />
                  <input 
                    type="date" 
                    className="bg-transparent text-xs font-medium text-gray-700 dark:text-slate-200 outline-none"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                  />
                  <span className="mx-1 text-xs font-semibold text-gray-300 dark:text-slate-600">TO</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs font-medium text-gray-700 dark:text-slate-200 outline-none"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                  />
                </div>

                {(searchTerm || dateRange.start || dateRange.end) && (
                  <button 
                    onClick={clearFilters}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                    title="Clear Filters"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}

                <div className="relative">
                  <button 
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="p-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900 shadow-sm"
                  >
                    <Download size={14} />
                  </button>
                  {isExportMenuOpen && (
                    <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 z-50 py-1 overflow-hidden">
                      <button onClick={exportToExcel} className="w-full flex items-center space-x-3 px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-slate-800"><FileSpreadsheet size={16} /><span>Excel</span></button>
                      <button onClick={exportToPDF} className="w-full flex items-center space-x-3 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-800"><FileText size={16} /><span>PDF</span></button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50 dark:bg-slate-800/70 text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide">
                  <tr>
                    <th className="px-6 py-4 text-left">Date</th>
                    <th className="px-6 py-4 text-left">Description / Particulars</th>
                    {selectedBankId === 'ALL' && <th className="px-6 py-4 text-left">Bank</th>}
                    <th className="px-6 py-4 text-right">Credit (+)</th>
                    <th className="px-6 py-4 text-right">Debit (-)</th>
                    <th className="px-6 py-4 text-right bg-indigo-50/30">Balance</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-800 text-sm">
                  {statementData.length === 0 ? (
                    <tr><td colSpan={selectedBankId === 'ALL' ? 6 : 5} className="px-6 py-20 text-center opacity-30">
                      <div className="flex flex-col items-center">
                        <Filter size={40} className="mb-2" />
                        <p className="font-semibold tracking-wide text-sm text-gray-500 dark:text-slate-400">No transactions found</p>
                      </div>
                    </td></tr>
                  ) : (
                    statementData.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-slate-400 font-medium">
                            {format(new Date(t.date), 'dd/MM/yy')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-indigo-900 dark:text-indigo-300">{t.customerName}</div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 italic font-medium truncate max-w-[220px]">{t.remarks}</div>
                          {t.referenceNo && (
                            <div className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 mt-0.5">Ref: {t.referenceNo}</div>
                          )}
                        </td>
                        {selectedBankId === 'ALL' && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1 rounded">{t.bankName}</span>
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-green-600 dark:text-green-400">
                          {t.cashIn ? `+${Math.round(t.cashIn).toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-rose-600 dark:text-rose-400">
                          {t.cashOut ? `-${Math.round(t.cashOut).toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-semibold bg-indigo-50/20 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-300">
                          {Math.round(t.balanceAfter || 0).toLocaleString() || '0'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Add/Edit Bank */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in duration-200 border border-gray-100 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-display text-2xl font-semibold text-gray-800 dark:text-slate-100 tracking-tight">{editingBank ? 'Edit Bank Account' : 'New Bank Account'}</h3>
               <button onClick={() => setIsBankModalOpen(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X size={20} /></button>
            </div>
            <form onSubmit={handleBankSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Bank Name</label>
                <div className="relative">
                   <input required className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none" type="text" value={bankFormData.name} onChange={e => setBankFormData({...bankFormData, name: e.target.value})} placeholder="e.g. Meezan Bank" />
                   <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600"><Landmark size={18} /></div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Account Number</label>
                <div className="relative">
                  <input required className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none" type="text" value={bankFormData.accountNumber} onChange={e => setBankFormData({...bankFormData, accountNumber: e.target.value})} placeholder="XXXX-XXXX-XXXX" />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600"><Hash size={18} /></div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Opening Balance (PKR)</label>
                <div className="relative">
                   <input required className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-slate-700 rounded-xl font-semibold text-lg bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none" type="number" value={bankFormData.initialBalance || ''} onChange={e => setBankFormData({...bankFormData, initialBalance: parseFloat(e.target.value) || 0})} placeholder="0.00" />
                   <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600 font-semibold text-xs">Rs.</div>
                </div>
              </div>
              <button type="submit" className="w-full py-3.5 bg-indigo-900 text-white rounded-xl font-semibold text-sm tracking-wide shadow-xl shadow-indigo-100 hover:bg-black transition-all active:scale-95">
                {editingBank ? 'Update Account' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Deposit/Withdrawal Entry */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
           <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in duration-200 border border-gray-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6">
              <h3 className="font-display text-2xl font-semibold text-gray-800 dark:text-slate-100 tracking-tight">{bankEntry.type} Cash</h3>
              <button onClick={() => setIsEntryModalOpen(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X size={20} /></button>
            </div>
            <form onSubmit={handleEntrySubmit} className="space-y-4">
               <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Bank Account</label>
                <select required className="w-full px-4 py-3 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none" value={bankEntry.targetBankId} onChange={e => setBankEntry({...bankEntry, targetBankId: e.target.value})}>
                     <option value="">-- Choose Account --</option>
                     {banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.accountNumber})</option>)}
                  </select>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Date</label>
                  <input required className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 outline-none" type="date" value={bankEntry.date} onChange={e => setBankEntry({...bankEntry, date: e.target.value})} />
                  </div>
                  <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Ref / Slip No</label>
                  <input className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 outline-none" type="text" value={bankEntry.referenceNo} onChange={e => setBankEntry({...bankEntry, referenceNo: e.target.value})} placeholder="Slip #" />
                  </div>
               </div>
               <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Amount (PKR)</label>
                 <div className="relative">
                  <input required className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-slate-700 rounded-xl font-semibold text-xl bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none" type="number" value={bankEntry.amount || ''} onChange={e => setBankEntry({...bankEntry, amount: parseFloat(e.target.value) || 0})} placeholder="0.00" />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600 font-semibold text-sm">Rs.</div>
                 </div>
               </div>
               <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Remarks</label>
                <textarea className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl font-medium text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 outline-none min-h-[60px]" value={bankEntry.remarks} onChange={e => setBankEntry({...bankEntry, remarks: e.target.value})} placeholder="Particulars..." />
               </div>
              <button type="submit" className={`w-full py-3.5 text-white rounded-xl font-semibold text-sm tracking-wide shadow-xl transition-all active:scale-95 ${bankEntry.type === 'DEPOSIT' ? 'bg-green-600 shadow-green-100 hover:bg-green-700' : 'bg-rose-600 shadow-rose-100 hover:bg-rose-700'}`}>
                 Confirm {bankEntry.type}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Bank Confirmation */}
      {deletingBankId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
           <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-[320px] w-full p-8 shadow-2xl text-center animate-in zoom-in duration-200 border border-gray-100 dark:border-slate-800">
             <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600"><AlertTriangle size={32} /></div>
             <h3 className="font-display text-xl font-semibold mb-1 tracking-tight text-gray-800 dark:text-slate-100">Delete Account?</h3>
             <p className="text-sm text-gray-500 dark:text-slate-400 mb-8 font-medium px-4">All transactions associated with this bank will also be removed. This cannot be undone.</p>
             <div className="grid grid-cols-2 gap-3">
               <button onClick={() => setDeletingBankId(null)} className="py-3 text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">Cancel</button>
               <button onClick={handleDeleteBank} className="py-3 bg-rose-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-rose-100 hover:bg-rose-700 active:scale-95 transition-all">Delete Account</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankLedger;