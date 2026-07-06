
import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Transaction, TransactionType, Bank, PaymentMethod } from '../types';
import { UserPlus, Search, ArrowRight, User, Scale, Coins, Wallet, Landmark, Download, FileSpreadsheet, FileText, ChevronDown, Edit2, Trash2, AlertTriangle, X, Share2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DashboardProps {
  customers: Customer[];
  transactions: Transaction[];
  banks: Bank[];
  onSelectCustomer: (id: string, metalFilter: 'ALL' | 'GOLD' | 'SILVER' | 'COPPER') => void;
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  projectName: string;
  shopPhone: string;
  metalFilter: 'ALL' | 'GOLD' | 'SILVER' | 'COPPER';
  onMetalFilterChange: (filter: 'ALL' | 'GOLD' | 'SILVER' | 'COPPER') => void;
  hideCopper?: boolean;
}

const DRAFT_CUSTOMER_KEY = 'haroon_draft_customer';
const DESKTOP_SHARE_HINT_KEY = 'newjehlum_whatsapp_desktop_hint_seen';

const Dashboard: React.FC<DashboardProps> = ({ customers, transactions, banks, onSelectCustomer, onAddCustomer, onUpdateCustomer, onDeleteCustomer, projectName, shopPhone, metalFilter, onMetalFilterChange: setMetalFilter, hideCopper = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<'CREATED' | 'BALANCE_FIRST'>('CREATED');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  
  const [newCustomer, setNewCustomer] = useState(() => {
    const saved = localStorage.getItem(DRAFT_CUSTOMER_KEY);
    return saved ? JSON.parse(saved) : { name: '', address: '', phone: '' };
  });

  useEffect(() => {
    if (!editingCustomer) {
      localStorage.setItem(DRAFT_CUSTOMER_KEY, JSON.stringify(newCustomer));
    }
  }, [newCustomer, editingCustomer]);

  const customerStats = useMemo(() => {
    return customers.map(customer => {
      const customerTx = transactions.filter(t => t.customerId === customer.id);
      
      let cashBalance = 0; 
      let goldBalance = 0; 
      let silverBalance = 0;
      let copperBalance = 0;

      customerTx.forEach(t => {
        const weight = (t.goldWeight || t.silverWeight || t.copperWeight || 0);
        const rate = (t.rate || 0);
        const value = weight * rate;
        
        if (t.type === TransactionType.BUY_GOLD) {
          goldBalance += (t.goldWeight || 0); 
          cashBalance -= value; 
        } else if (t.type === TransactionType.SELL_GOLD) {
          goldBalance -= (t.goldWeight || 0); 
          cashBalance += value; 
        } else if (t.type === TransactionType.BUY_SILVER) {
          silverBalance += (t.silverWeight || 0); 
          cashBalance -= value; 
        } else if (t.type === TransactionType.SELL_SILVER) {
          silverBalance -= (t.silverWeight || 0); 
          cashBalance += value; 
        } else if (t.type === TransactionType.BUY_COPPER) {
          copperBalance += (t.copperWeight || 0);
          cashBalance -= value;
        } else if (t.type === TransactionType.SELL_COPPER) {
          copperBalance -= (t.copperWeight || 0);
          cashBalance += value;
        } else if (t.type === TransactionType.CASH_PAYMENT) {
          cashBalance -= (t.cashIn || 0); 
          cashBalance += (t.cashOut || 0); 
        } else if (t.type === TransactionType.GOLD_SETTLEMENT) {
          goldBalance -= (t.goldIn || 0); 
          goldBalance += (t.goldOut || 0); 
        } else if (t.type === TransactionType.SILVER_SETTLEMENT) {
          silverBalance -= (t.silverIn || 0);
          silverBalance += (t.silverOut || 0);
        } else if (t.type === TransactionType.COPPER_SETTLEMENT) {
          copperBalance -= (t.copperIn || 0);
          copperBalance += (t.copperOut || 0);
        }
      });
      
      return {
        ...customer,
        cashBalance,
        goldBalance,
        silverBalance,
        copperBalance
      };
    });
  }, [customers, transactions]);

  const totals = useMemo(() => {
    return customerStats.reduce((acc, c) => ({
      cash: acc.cash + c.cashBalance,
      gold: acc.gold + c.goldBalance,
      silver: acc.silver + c.silverBalance,
      copper: acc.copper + c.copperBalance
    }), { cash: 0, gold: 0, silver: 0, copper: 0 });
  }, [customerStats]);

  const bankCash = useMemo(() => {
    return banks.reduce((sum, bank) => {
      let balance = bank.initialBalance;
      transactions.forEach(t => {
        if (t.paymentMethod === PaymentMethod.BANK && t.bankId === bank.id) {
          balance += (t.cashIn || 0);
          balance -= (t.cashOut || 0);
        }
      });
      return sum + balance;
    }, 0);
  }, [banks, transactions]);

  const hasLedgerStatus = (c: typeof customerStats[number]) => {
    return (
      Math.round(Math.abs(c.cashBalance)) > 0 ||
      Math.abs(c.goldBalance) > 0.001 ||
      Math.abs(c.silverBalance) > 0.001 ||
      Math.abs(c.copperBalance) > 0.001
    );
  };

  const filteredCustomers = customerStats
    .filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm))
    )
    .filter(c => {
      if (searchTerm) return true;
      if (!hasLedgerStatus(c)) return false;
      if (metalFilter === 'GOLD') return Math.abs(c.goldBalance) > 0.001;
      if (metalFilter === 'SILVER') return Math.abs(c.silverBalance) > 0.001;
      if (metalFilter === 'COPPER') return Math.abs(c.copperBalance) > 0.001;
      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'CREATED') return 0;
      const aHasBalance = hasLedgerStatus(a);
      const bHasBalance = hasLedgerStatus(b);
      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;
      return 0;
    });

  const handleAddClick = () => {
    setEditingCustomer(null);
    setNewCustomer({ name: '', address: '', phone: '' });
    setIsModalOpen(true);
  };

  const handleEditClick = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    setEditingCustomer(customer);
    setNewCustomer({ 
      name: customer.name, 
      address: customer.address || '', 
      phone: customer.phone || '' 
    });
    setIsModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, customerId: string) => {
    e.stopPropagation();
    setDeletingCustomerId(customerId);
  };

  const normalizeWhatsAppNumber = (phone?: string) => {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;

    return digits;
  };

  const isMobileDevice = () => /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent);

  const copyMessageFallback = async (message: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const openWhatsAppShare = async (message: string, phone?: string) => {
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const params = new URLSearchParams({ text: message });
    if (normalizedPhone) params.set('phone', normalizedPhone);

    const isMobile = isMobileDevice();
    const popup = window.open(`https://api.whatsapp.com/send?${params.toString()}`, '_blank', 'noopener,noreferrer');

    if (isMobile) return;

    const copied = await copyMessageFallback(message);
    const hintAlreadyShown = sessionStorage.getItem(DESKTOP_SHARE_HINT_KEY) === '1';

    if (!popup) {
      if (copied) {
        window.alert('Popup blocked. Ledger message has been copied. Open WhatsApp and paste with Ctrl+V.');
      } else {
        window.prompt('Popup blocked. Copy this ledger message and paste it into WhatsApp:', message);
      }
      return;
    }

    if (!hintAlreadyShown) {
      sessionStorage.setItem(DESKTOP_SHARE_HINT_KEY, '1');
      if (copied) {
        window.alert('WhatsApp opened. If text is not prefilled on desktop app, paste with Ctrl+V (message copied).');
      } else {
        window.alert('WhatsApp opened. If text is not prefilled on desktop app, copy manually and paste with Ctrl+V.');
      }
    }
  };

  const handleShareWhatsApp = async (e: React.MouseEvent, c: typeof customerStats[0]) => {
    e.stopPropagation();
    const getStatus = (value: number) => value >= 0 ? 'Laine (Receivable)' : 'Daine (Payable)';
    const message = [
      `*${projectName}*`,
      `📋 *Ledger Summary: ${c.name}*`,
      ``,
      `💰 Cash Balance: Rs. ${Math.round(Math.abs(c.cashBalance)).toLocaleString()} (${getStatus(c.cashBalance)})`,
      `🥇 Gold Balance: ${Math.abs(c.goldBalance).toFixed(3)}g (${getStatus(c.goldBalance)})`,
      `🥈 Silver Balance: ${Math.abs(c.silverBalance).toFixed(2)}g (${getStatus(c.silverBalance)})`,
      `🟤 Copper Balance: ${Math.abs(c.copperBalance).toFixed(2)}g (${getStatus(c.copperBalance)})`,
      ``,
      `📅 Date: ${new Date().toLocaleDateString('en-PK')}`,
    ].join('\n');
    await openWhatsAppShare(message, c.phone);
  };

  const handleShareAllWhatsApp = async () => {
    const getStatus = (value: number) => value >= 0 ? 'Laine' : 'Daine';
    const lines = customerStats.map((c, index) => (
      `${index + 1}. ${c.name} | Cash: Rs. ${Math.round(Math.abs(c.cashBalance)).toLocaleString()} (${getStatus(c.cashBalance)}) | ` +
      `Gold: ${Math.abs(c.goldBalance).toFixed(3)}g (${getStatus(c.goldBalance)}) | ` +
      `Silver: ${Math.abs(c.silverBalance).toFixed(2)}g (${getStatus(c.silverBalance)}) | ` +
      `Copper: ${Math.abs(c.copperBalance).toFixed(2)}g (${getStatus(c.copperBalance)})`
    ));

    const message = [
      `*${projectName}*`,
      `📋 *Ledger Summary: All Customers*`,
      `👥 Profiles: ${customerStats.length}`,
      ``,
      `💰 Total Cash: Rs. ${Math.round(Math.abs(totals.cash)).toLocaleString()} (${getStatus(totals.cash)})`,
      `🥇 Total Gold: ${Math.abs(totals.gold).toFixed(3)}g (${getStatus(totals.gold)})`,
      `🥈 Total Silver: ${Math.abs(totals.silver).toFixed(2)}g (${getStatus(totals.silver)})`,
      `🟤 Total Copper: ${Math.abs(totals.copper).toFixed(2)}g (${getStatus(totals.copper)})`,
      ``,
      ...lines,
      ``,
      `📅 Date: ${new Date().toLocaleDateString('en-PK')}`,
    ].join('\n');

    await openWhatsAppShare(message);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      onUpdateCustomer({
        ...editingCustomer,
        name: newCustomer.name,
        address: newCustomer.address,
        phone: newCustomer.phone
      });
    } else {
      onAddCustomer({
        id: Date.now().toString(),
        name: newCustomer.name,
        address: newCustomer.address,
        phone: newCustomer.phone
      });
      localStorage.removeItem(DRAFT_CUSTOMER_KEY);
    }
    setNewCustomer({ name: '', address: '', phone: '' });
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const exportToExcel = () => {
    const data = customerStats.filter(c => c.cashBalance !== 0 || c.goldBalance !== 0 || c.silverBalance !== 0 || c.copperBalance !== 0).map(c => ({
      'Name': c.name,
      'Phone': c.phone || 'N/A',
      'Address': c.address || 'N/A',
      'Cash Balance': c.cashBalance,
      'Status': c.cashBalance >= 0 ? 'LAINE' : 'DAINE',
      'Gold Bal (g)': c.goldBalance.toFixed(3),
      'Silver Bal (g)': c.silverBalance.toFixed(2),
      'Copper Bal (g)': c.copperBalance.toFixed(2)
    }));
    data.push({
      'Name': 'TOTAL',
      'Phone': '-',
      'Address': '-',
      'Cash Balance': totals.cash,
      'Status': totals.cash >= 0 ? 'LAINE' : 'DAINE',
      'Gold Bal (g)': totals.gold.toFixed(3),
      'Silver Bal (g)': totals.silver.toFixed(2),
      'Copper Bal (g)': totals.copper.toFixed(2)
    });
    data.push({
      'Name': 'BANK CASH',
      'Phone': '-',
      'Address': '-',
      'Cash Balance': bankCash,
      'Status': '',
      'Gold Bal (g)': '',
      'Silver Bal (g)': '',
      'Copper Bal (g)': ''
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, 'Customer_Balances.xlsx');
    setIsExportMenuOpen(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(projectName, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(shopPhone ? `Ph: ${shopPhone} | Customer Summary` : 'Customer Summary', 14, 22);
    doc.setFontSize(9);
    doc.text(`Bank Cash: Rs. ${Math.round(bankCash).toLocaleString()}`, 14, 28);
    autoTable(doc, {
      startY: 34,
      head: [['Name', 'Phone', 'Cash Bal', 'Gold Bal', 'Silver Bal', 'Copper Bal']],
      body: customerStats.filter(c => c.cashBalance !== 0 || c.goldBalance !== 0 || c.silverBalance !== 0 || c.copperBalance !== 0).map(c => [
        c.name,
        c.phone || 'N/A',
        Math.round(c.cashBalance).toLocaleString(),
        c.goldBalance.toFixed(3),
        c.silverBalance.toFixed(2),
        c.copperBalance.toFixed(2)
      ]),
      foot: [[
        'TOTAL',
        '-',
        Math.round(totals.cash).toLocaleString(),
        totals.gold.toFixed(3),
        totals.silver.toFixed(2),
        totals.copper.toFixed(2)
      ]],
      footStyles: {
        fontStyle: 'bold'
      }
    });
    doc.save('Customer_Directory.pdf');
    setIsExportMenuOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-6 pb-3 border-b border-gray-100 dark:border-slate-800 transition-colors duration-300">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-slate-800 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 leading-none mb-1">Cash Book</p>
            <p className="text-base font-bold text-gray-900 dark:text-slate-100 leading-none">
              Rs. {Math.round(Math.abs(totals.cash)).toLocaleString()}
              <span className={`text-[11px] ml-1 font-semibold ${totals.cash >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                {totals.cash >= 0 ? 'Laine' : 'Daine'}
              </span>
            </p>
          </div>
        </div>

        <div className="w-px h-8 bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>

        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-slate-800 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Landmark size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 leading-none mb-1">Bank Cash</p>
            <p className="text-base font-bold text-gray-900 dark:text-slate-100 leading-none">
              Rs. {Math.round(bankCash).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="w-px h-8 bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>

        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-yellow-50 dark:bg-slate-800 rounded-xl text-yellow-600 dark:text-yellow-500">
            <Scale size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 leading-none mb-1">Gold Ledger</p>
            <p className="text-base font-bold text-gray-900 dark:text-slate-100 leading-none">
              {Math.abs(totals.gold).toFixed(3)}g
            </p>
          </div>
        </div>

        <div className="w-px h-8 bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>

        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400">
            <Coins size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 leading-none mb-1">Silver Ledger</p>
            <p className="text-base font-bold text-gray-900 dark:text-slate-100 leading-none">
              {Math.abs(totals.silver).toFixed(2)}g
            </p>
          </div>
        </div>

        {!hideCopper && (
          <>
            <div className="w-px h-8 bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>

            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-50 dark:bg-slate-800 rounded-xl text-amber-700 dark:text-amber-500">
                <Coins size={20} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 leading-none mb-1">Copper Ledger</p>
                <p className="text-base font-bold text-gray-900 dark:text-slate-100 leading-none">
                  {Math.abs(totals.copper).toFixed(2)}g
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-3 tracking-wide">Select Metal Type</p>
        <div className={`grid grid-cols-2 ${hideCopper ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-2`}>
          <button
            type="button"
            onClick={() => setMetalFilter('ALL')}
            className={`p-3 rounded-xl border text-left transition-all ${metalFilter === 'ALL' ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-slate-800 hover:border-indigo-200'}`}
          >
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">All</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">View all profiles</div>
          </button>
          <button
            type="button"
            onClick={() => setMetalFilter('GOLD')}
            className={`p-3 rounded-xl border text-left transition-all ${metalFilter === 'GOLD' ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : 'border-gray-200 dark:border-slate-800 hover:border-yellow-200'}`}
          >
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Gold</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Only gold profiles</div>
          </button>
          <button
            type="button"
            onClick={() => setMetalFilter('SILVER')}
            className={`p-3 rounded-xl border text-left transition-all ${metalFilter === 'SILVER' ? 'border-slate-400 bg-slate-50 dark:bg-slate-800/50' : 'border-gray-200 dark:border-slate-800 hover:border-slate-300'}`}
          >
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Silver</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Only silver profiles</div>
          </button>
          {!hideCopper && (
            <button
              type="button"
              onClick={() => setMetalFilter('COPPER')}
              className={`p-3 rounded-xl border text-left transition-all ${metalFilter === 'COPPER' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-slate-800 hover:border-amber-300'}`}
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Copper</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">Only copper profiles</div>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-2">
        <h2 className="font-display text-2xl font-bold text-gray-800 dark:text-slate-100 tracking-tight">Customer Directory</h2>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0 md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 dark:text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Search customers..."
              className="block w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center p-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm">
            <button
              type="button"
              onClick={() => setSortMode('CREATED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sortMode === 'CREATED'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              Created Order
            </button>
            <button
              type="button"
              onClick={() => setSortMode('BALANCE_FIRST')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sortMode === 'BALANCE_FIRST'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              Laine/Daine First
            </button>
          </div>

          <div className="relative">
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="p-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-400 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm"
            >
              <Download size={18} />
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 z-50 py-1 overflow-hidden transition-all duration-200">
                <button onClick={exportToExcel} className="w-full flex items-center space-x-3 px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-500 hover:bg-green-50 dark:hover:bg-slate-800 transition-colors"><FileSpreadsheet size={16} /><span>Excel</span></button>
                <button onClick={exportToPDF} className="w-full flex items-center space-x-3 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"><FileText size={16} /><span>PDF</span></button>
              </div>
            )}
          </div>

          <button
            onClick={handleShareAllWhatsApp}
            className="flex items-center space-x-2 bg-green-600 text-white px-3 py-2.5 rounded-xl hover:bg-green-700 transition-all shadow-md font-semibold text-sm"
            title="Share all customer summaries"
          >
            <Share2 size={14} />
            <span className="hidden sm:inline">Share All</span>
          </button>

          <button 
            onClick={handleAddClick}
            className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md font-semibold text-sm"
          >
            <UserPlus size={14} />
            <span className="hidden sm:inline">Add Profile</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map(c => (
          <div 
            key={c.id}
            onClick={() => onSelectCustomer(c.id, metalFilter)}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6 hover:shadow-lg dark:hover:shadow-indigo-900/10 transition-all cursor-pointer relative overflow-hidden group hover:border-indigo-200 dark:hover:border-indigo-800 duration-300"
          >
            <div className="absolute -top-6 -right-6 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
               <User size={120} className="text-indigo-900 dark:text-indigo-100" />
            </div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-xl font-semibold text-gray-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors tracking-tight">{c.name}</h3>
                </div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 tracking-wide">{c.address || 'No Address'}</p>
              </div>
              <div className="flex items-center space-x-1.5">
                 <button 
                  onClick={(e) => handleShareWhatsApp(e, c)}
                  className="p-2 bg-green-50 dark:bg-slate-800 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-600 dark:hover:bg-green-500 hover:text-white transition-all shadow-sm"
                  title="Share on WhatsApp"
                 >
                   <Share2 size={14} />
                 </button>
                 <button 
                  onClick={(e) => handleEditClick(e, c)}
                  className="p-2 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-all shadow-sm"
                  title="Edit Customer"
                 >
                   <Edit2 size={14} />
                 </button>
                 <button 
                  onClick={(e) => handleDeleteClick(e, c.id)}
                  className="p-2 bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-600 dark:hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                  title="Delete Customer"
                 >
                   <Trash2 size={14} />
                 </button>
              </div>
            </div>

            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-end border-b border-gray-50 dark:border-slate-800 pb-2">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 tracking-wide">Cash Balance</p>
                  <p className={`text-base font-bold ${c.cashBalance >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-rose-700 dark:text-rose-400'}`}>Rs. {Math.round(Math.abs(c.cashBalance)).toLocaleString()}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-md ${c.cashBalance >= 0 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'}`}>
                   {c.cashBalance >= 0 ? 'LAINE' : 'DAINE'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 tracking-wide">Gold Bal</p>
                  <p className={`text-sm font-semibold ${c.goldBalance >= 0 ? 'text-indigo-900 dark:text-slate-200' : 'text-rose-700 dark:text-rose-400'}`}>{Math.abs(c.goldBalance).toFixed(3)}g</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 tracking-wide">Silver Bal</p>
                  <p className={`text-sm font-semibold ${c.silverBalance >= 0 ? 'text-indigo-900 dark:text-slate-200' : 'text-rose-700 dark:text-rose-400'}`}>{Math.abs(c.silverBalance).toFixed(2)}g</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 tracking-wide">Copper Bal</p>
                  <p className={`text-sm font-semibold ${c.copperBalance >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>{Math.abs(c.copperBalance).toFixed(2)}g</p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                 <span className="text-xs font-medium text-gray-500 dark:text-slate-400">{c.phone || 'No Phone'}</span>
                 <div className="p-1 bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 rounded-lg group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white transition-colors duration-300">
                   <ArrowRight size={14} />
                 </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-indigo-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-8 shadow-2xl animate-in zoom-in duration-200 border dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display text-2xl font-semibold text-gray-800 dark:text-slate-100 tracking-tight">{editingCustomer ? 'Update Profile' : 'New Customer'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Full Name *</label>
                <input required className="w-full px-4 py-3 border border-gray-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100" type="text" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} placeholder="Customer Name" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Area / Location (Optional)</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100" type="text" value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})} placeholder="City or Area" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide mb-1">Phone Number (Optional)</label>
                <input className="w-full px-4 py-3 border border-gray-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100" type="text" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} placeholder="Mobile No." />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full py-3.5 bg-indigo-900 dark:bg-indigo-600 text-white rounded-xl font-semibold text-sm tracking-wide shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20 hover:bg-black dark:hover:bg-indigo-700 transition-all active:scale-95">
                  {editingCustomer ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingCustomerId && (
        <div className="fixed inset-0 bg-indigo-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-8 shadow-2xl text-center animate-in zoom-in duration-200 border border-gray-100 dark:border-slate-800">
             <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-rose-600 dark:text-rose-400">
                <AlertTriangle size={32} />
             </div>
             <h3 className="font-display text-xl font-semibold mb-2 tracking-tight text-gray-800 dark:text-slate-100">Confirm Deletion</h3>
             <p className="text-sm text-gray-500 dark:text-slate-400 mb-8 font-medium px-4 leading-relaxed">
               All transactions for this customer will be permanently removed. This cannot be undone.
             </p>
             <div className="grid grid-cols-2 gap-4">
               <button onClick={() => setDeletingCustomerId(null)} className="py-3 text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">Cancel</button>
               <button onClick={() => { onDeleteCustomer(deletingCustomerId); setDeletingCustomerId(null); }} className="py-3 bg-rose-600 text-white rounded-2xl font-semibold text-sm shadow-lg shadow-rose-100 dark:shadow-rose-900/20 hover:bg-rose-700 active:scale-95 transition-all">Delete All</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;