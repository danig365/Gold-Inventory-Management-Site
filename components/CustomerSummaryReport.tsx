import React, { useMemo, useState } from 'react';
import { Transaction, Customer, TransactionType, Bank, PaymentMethod } from '../types';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { FileSpreadsheet, FileText, Printer, Search, Download, ChevronDown, Scale, Layers, Wallet, Calendar, X, RotateCcw, Landmark } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CustomerSummaryReportProps {
  customers: Customer[];
  transactions: Transaction[];
  banks: Bank[];
  projectName: string;
  shopPhone: string;
}

const CustomerSummaryReport: React.FC<CustomerSummaryReportProps> = ({ customers, transactions, banks, projectName, shopPhone }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [balanceFilter, setBalanceFilter] = useState<'ALL' | 'LAINE' | 'DAINE' | 'ZERO' | 'GOLD_GT' | 'GOLD_LT'>('ALL');

  const reportData = useMemo(() => {
    return customers.map(customer => {
      const customerTxs = transactions.filter(t => t.customerId === customer.id);
      
      const filteredTxs = customerTxs.filter(t => {
        if (!startDate && !endDate) return true;
        const txDate = parseISO(t.date);
        const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
        const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
        return isWithinInterval(txDate, { start, end });
      });
      
      let goldBal = 0;
      let silverBal = 0;
      let copperBal = 0;
      let cashBal = 0;

      filteredTxs.forEach(t => {
        const weight = (t.goldWeight || t.silverWeight || t.copperWeight || 0);
        const rate = (t.rate || 0);
        const value = weight * rate;

        if (t.type === TransactionType.BUY_GOLD) {
          goldBal += (t.goldWeight || 0);
          cashBal -= value;
        } else if (t.type === TransactionType.SELL_GOLD) {
          goldBal -= (t.goldWeight || 0);
          cashBal += value;
        } else if (t.type === TransactionType.BUY_SILVER) {
          silverBal += (t.silverWeight || 0);
          cashBal -= value;
        } else if (t.type === TransactionType.SELL_SILVER) {
          silverBal -= (t.silverWeight || 0);
          cashBal += value;
        } else if (t.type === TransactionType.BUY_COPPER) {
          copperBal += (t.copperWeight || 0);
          cashBal -= value;
        } else if (t.type === TransactionType.SELL_COPPER) {
          copperBal -= (t.copperWeight || 0);
          cashBal += value;
        } else if (t.type === TransactionType.CASH_PAYMENT) {
          cashBal -= (t.cashIn || 0);
          cashBal += (t.cashOut || 0);
        } else if (t.type === TransactionType.GOLD_SETTLEMENT) {
          goldBal -= (t.goldIn || 0);
          goldBal += (t.goldOut || 0);
        } else if (t.type === TransactionType.SILVER_SETTLEMENT) {
          silverBal -= (t.silverIn || 0);
          silverBal += (t.silverOut || 0);
        } else if (t.type === TransactionType.COPPER_SETTLEMENT) {
          copperBal -= (t.copperIn || 0);
          copperBal += (t.copperOut || 0);
        }
      });

      return {
        ...customer,
        goldBal,
        silverBal,
        copperBal,
        cashBal
      };
    }).filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.phone.includes(searchTerm)
    ).filter(c => {
      if (balanceFilter === 'LAINE') return c.cashBal > 0;
      if (balanceFilter === 'DAINE') return c.cashBal < 0;
      if (balanceFilter === 'ZERO') return Math.round(c.cashBal) === 0;
      if (balanceFilter === 'GOLD_GT') return c.cashBal > 0;
      if (balanceFilter === 'GOLD_LT') return c.cashBal < 0;
      return true;
    });
  }, [customers, transactions, searchTerm, startDate, endDate, balanceFilter]);

  const totals = useMemo(() => {
    return reportData.reduce((acc, c) => ({
      gold: acc.gold + c.goldBal,
      silver: acc.silver + c.silverBal,
      copper: acc.copper + c.copperBal,
      cash: acc.cash + c.cashBal
    }), { gold: 0, silver: 0, copper: 0, cash: 0 });
  }, [reportData]);

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

  const summaryBreakdown = useMemo(() => {
    return reportData.reduce((acc, c) => {
      if (c.cashBal >= 0) acc.cashBuy += c.cashBal;
      else acc.cashSell += Math.abs(c.cashBal);

      if (c.goldBal >= 0) acc.goldBuy += c.goldBal;
      else acc.goldSell += Math.abs(c.goldBal);

      if (c.silverBal >= 0) acc.silverBuy += c.silverBal;
      else acc.silverSell += Math.abs(c.silverBal);

      if (c.copperBal >= 0) acc.copperBuy += c.copperBal;
      else acc.copperSell += Math.abs(c.copperBal);

      return acc;
    }, {
      cashBuy: 0,
      cashSell: 0,
      goldBuy: 0,
      goldSell: 0,
      silverBuy: 0,
      silverSell: 0,
      copperBuy: 0,
      copperSell: 0,
    });
  }, [reportData]);

  const clearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setBalanceFilter('ALL');
  };

  const exportToExcel = () => {
    const data = reportData.map(c => ({
      'Customer': c.name,
      'Phone': c.phone,
      'Cash Balance': Math.abs(c.cashBal),
      'Status': c.cashBal >= 0 ? 'Payment Laine hai' : 'Payment daine hai',
      'Gold Balance (g)': Math.abs(c.goldBal).toFixed(3),
      'Gold Status': c.goldBal >= 0 ? 'Gold laina hai' : 'Gold daina hai',
      'Silver Balance (g)': Math.abs(c.silverBal).toFixed(2),
      'Silver Status': c.silverBal >= 0 ? 'Silver laina hai' : 'Silver daina hai',
      'Copper Balance (g)': Math.abs(c.copperBal).toFixed(2),
      'Copper Status': c.copperBal >= 0 ? 'Copper laina hai' : 'Copper daina hai',
      'Net Gold': c.goldBal.toFixed(3),
      'Net Silver': c.silverBal.toFixed(2),
      'Net Copper': c.copperBal.toFixed(2),
      'Net Cash Balance': Math.round(c.cashBal)
    }));
    data.push({
      'Customer': 'TOTAL',
      'Phone': '',
      'Cash Balance': Math.abs(totals.cash),
      'Status': totals.cash >= 0 ? 'Payment Laine hai' : 'Payment daine hai',
      'Gold Balance (g)': Math.abs(totals.gold).toFixed(3),
      'Gold Status': totals.gold >= 0 ? 'Gold laina hai' : 'Gold daina hai',
      'Silver Balance (g)': Math.abs(totals.silver).toFixed(2),
      'Silver Status': totals.silver >= 0 ? 'Silver laina hai' : 'Silver daina hai',
      'Copper Balance (g)': Math.abs(totals.copper).toFixed(2),
      'Copper Status': totals.copper >= 0 ? 'Copper laina hai' : 'Copper daina hai',
      'Net Gold': totals.gold.toFixed(3),
      'Net Silver': totals.silver.toFixed(2),
      'Net Copper': totals.copper.toFixed(2),
      'Net Cash Balance': Math.round(totals.cash)
    });
    data.push({
      'Customer': 'BANK CASH',
      'Phone': '',
      'Cash Balance': Math.abs(bankCash),
      'Status': '',
      'Gold Balance (g)': '',
      'Gold Status': '',
      'Silver Balance (g)': '',
      'Silver Status': '',
      'Copper Balance (g)': '',
      'Copper Status': '',
      'Net Gold': '',
      'Net Silver': '',
      'Net Copper': '',
      'Net Cash Balance': Math.round(bankCash)
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    XLSX.writeFile(wb, `Customer_Summary_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text(projectName, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(shopPhone ? `Ph: ${shopPhone} | Customer Summary Balances` : 'Customer Summary Balances', 14, 27);

    doc.setFontSize(9);
    doc.text(`Bank Cash: Rs. ${Math.round(bankCash).toLocaleString()}`, 14, 33);
    if (startDate || endDate) {
      doc.text(`Period: ${startDate || 'Start'} to ${endDate || 'End'}`, 14, 38);
    }

    autoTable(doc, {
      startY: 44,
      head: [[
        'Customer',
        'Phone',
        'Cash Balance',
        'Status',
        'Gold Balance (g)',
        'Gold Status',
        'Silver Balance (g)',
        'Silver Status',
        'Copper Balance (g)',
        'Copper Status',
        'Net Gold',
        'Net Silver',
        'Net Copper',
        'Net Cash Balance'
      ]],
      body: reportData.map(c => [
        c.name.toUpperCase(),
        c.phone,
        Math.round(Math.abs(c.cashBal)).toLocaleString(),
        c.cashBal >= 0 ? 'LAINE' : 'DAINE',
        Math.abs(c.goldBal).toFixed(3),
        c.goldBal >= 0 ? 'LAINA' : 'DAINA',
        Math.abs(c.silverBal).toFixed(2),
        c.silverBal >= 0 ? 'LAINA' : 'DAINA',
        Math.abs(c.copperBal).toFixed(2),
        c.copperBal >= 0 ? 'LAINA' : 'DAINA',
        c.goldBal.toFixed(3),
        c.silverBal.toFixed(2),
        c.copperBal.toFixed(2),
        Math.round(c.cashBal).toLocaleString()
      ]),
      foot: [[
        'TOTAL',
        '',
        Math.round(Math.abs(totals.cash)).toLocaleString(),
        totals.cash >= 0 ? 'LAINE' : 'DAINE',
        Math.abs(totals.gold).toFixed(3),
        totals.gold >= 0 ? 'LAINA' : 'DAINA',
        Math.abs(totals.silver).toFixed(2),
        totals.silver >= 0 ? 'LAINA' : 'DAINA',
        Math.abs(totals.copper).toFixed(2),
        totals.copper >= 0 ? 'LAINA' : 'DAINA',
        totals.gold.toFixed(3),
        totals.silver.toFixed(2),
        totals.copper.toFixed(2),
        Math.round(totals.cash).toLocaleString()
      ]],
      theme: 'grid',
      headStyles: { fillColor: [67, 56, 202] },
      footStyles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [30, 41, 59] },
      styles: { fontSize: 6, cellPadding: 1.2 },
      margin: { top: 40, left: 6, right: 6 }
    });
    doc.save(`Summary_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
    setIsExportMenuOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800">
        <div>
          <h2 className="font-display text-4xl font-semibold text-gray-800 dark:text-slate-100 tracking-tight leading-none mb-1">Summary Report</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 font-medium tracking-wide">Global balance overview & statement</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Search Box */}
          <div className="relative flex-grow lg:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search customers..."
              className="block w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-800 text-sm font-medium text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-inner"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Date Picker Range */}
          <div className="flex items-center bg-gray-50/50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-2 py-1.5 shadow-inner">
            <Calendar size={12} className="text-gray-400 dark:text-slate-500 mr-2" />
            <input 
              type="date" 
              className="bg-transparent text-xs font-medium text-gray-700 dark:text-slate-200 outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="mx-1 text-xs font-semibold text-gray-300 dark:text-slate-600">TO</span>
            <input 
              type="date" 
              className="bg-transparent text-xs font-medium text-gray-700 dark:text-slate-200 outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* Balance Filter Buttons */}
          <div className="flex items-center gap-1 bg-gray-50/50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-inner">
            {([['ALL', 'All'], ['LAINE', 'Laine ↑'], ['DAINE', 'Daine ↓'], ['ZERO', 'Zero ='], ['GOLD_GT', 'Cash > 0'], ['GOLD_LT', 'Cash < 0']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setBalanceFilter(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  balanceFilter === val
                    ? val === 'LAINE' ? 'bg-blue-600 text-white shadow'
                    : val === 'DAINE' ? 'bg-rose-600 text-white shadow'
                    : val === 'ZERO' ? 'bg-slate-500 text-white shadow'
                    : val === 'GOLD_GT' ? 'bg-yellow-600 text-white shadow'
                    : val === 'GOLD_LT' ? 'bg-orange-600 text-white shadow'
                    : 'bg-indigo-600 text-white shadow'
                    : 'text-gray-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Reset Filters */}
          {(searchTerm || startDate || endDate || balanceFilter !== 'ALL') && (
            <button 
              onClick={clearFilters}
              className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all border border-rose-100 bg-white shadow-sm"
              title="Clear Filters"
            >
              <RotateCcw size={16} />
            </button>
          )}
          
          <div className="relative">
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl hover:bg-indigo-700 shadow-md text-sm font-semibold transition-all active:scale-95"
            >
              <Download size={14} />
              <span>Export</span>
              <ChevronDown size={12} className={isExportMenuOpen ? 'rotate-180' : ''} />
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className={`rounded-3xl p-6 text-white shadow-xl transition-all ${totals.cash >= 0 ? 'bg-indigo-900 shadow-indigo-100' : 'bg-rose-900 shadow-rose-100'}`}>
          <div className="flex items-center space-x-3 mb-4 opacity-70">
            <Wallet size={18} />
            <p className="text-xs font-semibold tracking-wide leading-none">Cash Summary</p>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span>Total Buy (Lainaw)</span><span className="font-bold">Rs. {Math.round(summaryBreakdown.cashBuy).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Total Sell (Danaw)</span><span className="font-bold">Rs. {Math.round(summaryBreakdown.cashSell).toLocaleString()}</span></div>
            <div className="flex justify-between pt-1 border-t border-white/20"><span>Balance</span><span className="font-extrabold">Rs. {Math.round(Math.abs(totals.cash)).toLocaleString()}</span></div>
          </div>
        </div>

        <div className="rounded-3xl p-6 text-white shadow-xl transition-all bg-blue-900 shadow-blue-100">
          <div className="flex items-center space-x-3 mb-4 opacity-70">
            <Landmark size={18} />
            <p className="text-xs font-semibold tracking-wide leading-none">Bank Cash</p>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between pt-1"><span>Total Liquid Cash</span><span className="font-extrabold">Rs. {Math.round(bankCash).toLocaleString()}</span></div>
          </div>
        </div>

        <div className={`rounded-3xl p-6 text-white shadow-xl transition-all ${totals.gold >= 0 ? 'bg-yellow-600 shadow-yellow-100' : 'bg-rose-600 shadow-rose-100'}`}>
          <div className="flex items-center space-x-3 mb-4 opacity-70">
            <Scale size={18} />
            <p className="text-xs font-semibold tracking-wide leading-none">Gold Summary</p>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span>Total Buy (Lainaw)</span><span className="font-bold">{summaryBreakdown.goldBuy.toFixed(3)}g</span></div>
            <div className="flex justify-between"><span>Total Sell (Danaw)</span><span className="font-bold">{summaryBreakdown.goldSell.toFixed(3)}g</span></div>
            <div className="flex justify-between pt-1 border-t border-white/20"><span>Balance</span><span className="font-extrabold">{Math.abs(totals.gold).toFixed(3)}g</span></div>
          </div>
        </div>

        <div className={`rounded-3xl p-6 text-white shadow-xl transition-all ${totals.silver >= 0 ? 'bg-slate-600 shadow-slate-100' : 'bg-rose-600 shadow-rose-100'}`}>
          <div className="flex items-center space-x-3 mb-4 opacity-70">
            <Layers size={18} />
            <p className="text-xs font-semibold tracking-wide leading-none">Silver Summary</p>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span>Total Buy (Lainaw)</span><span className="font-bold">{summaryBreakdown.silverBuy.toFixed(2)}g</span></div>
            <div className="flex justify-between"><span>Total Sell (Danaw)</span><span className="font-bold">{summaryBreakdown.silverSell.toFixed(2)}g</span></div>
            <div className="flex justify-between pt-1 border-t border-white/20"><span>Balance</span><span className="font-extrabold">{Math.abs(totals.silver).toFixed(2)}g</span></div>
          </div>
        </div>

        <div className={`rounded-3xl p-6 text-white shadow-xl transition-all ${totals.copper >= 0 ? 'bg-amber-700 shadow-amber-100' : 'bg-rose-600 shadow-rose-100'}`}>
          <div className="flex items-center space-x-3 mb-4 opacity-70">
            <Layers size={18} />
            <p className="text-xs font-semibold tracking-wide leading-none">Copper Summary</p>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span>Total Buy (Lainaw)</span><span className="font-bold">{summaryBreakdown.copperBuy.toFixed(2)}g</span></div>
            <div className="flex justify-between"><span>Total Sell (Danaw)</span><span className="font-bold">{summaryBreakdown.copperSell.toFixed(2)}g</span></div>
            <div className="flex justify-between pt-1 border-t border-white/20"><span>Balance</span><span className="font-extrabold">{Math.abs(totals.copper).toFixed(2)}g</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50 dark:bg-slate-800/70 text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide">
              <tr>
                <th className="px-6 py-4 text-left">Customer Information</th>
                <th className="px-6 py-4 text-right">Gold Bal (g)</th>
                <th className="px-6 py-4 text-right">Silver Bal (g)</th>
                <th className="px-6 py-4 text-right">Copper Bal (g)</th>
                <th className="px-6 py-4 text-right">Cash Balance</th>
                <th className="px-6 py-4 text-center">Net Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-800 text-sm">
              {reportData.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-20 text-center text-gray-400 dark:text-slate-500 font-medium tracking-wide italic opacity-70">
                      No matching records found for the given filters
                   </td>
                </tr>
              ) : (
                reportData.map(c => (
                  <tr key={c.id} className="hover:bg-indigo-50/20 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-indigo-900 dark:text-indigo-300 group-hover:text-indigo-600 transition-colors">{c.name}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">{c.phone} • {c.address}</div>
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${c.goldBal >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-600 dark:text-rose-400'}`}>
                      {Math.abs(c.goldBal).toFixed(3)}
                      <span className="text-[10px] ml-1 opacity-70">{c.goldBal >= 0 ? 'LAINA' : 'DAINA'}</span>
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${c.silverBal >= 0 ? 'text-slate-600 dark:text-slate-300' : 'text-rose-600 dark:text-rose-400'}`}>
                      {Math.abs(c.silverBal).toFixed(2)}
                      <span className="text-[10px] ml-1 opacity-70">{c.silverBal >= 0 ? 'LAINA' : 'DAINA'}</span>
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${c.copperBal >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {Math.abs(c.copperBal).toFixed(2)}
                      <span className="text-[10px] ml-1 opacity-70">{c.copperBal >= 0 ? 'LAINA' : 'DAINA'}</span>
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${c.cashBal >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-800 dark:text-rose-400'}`}>
                      Rs. {Math.round(Math.abs(c.cashBal)).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                       <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm ${c.cashBal >= 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                        {c.cashBal >= 0 ? 'Payment Laine' : 'Payment Daine'}
                       </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {reportData.length > 0 && (
              <tfoot className="bg-gray-50/80 dark:bg-slate-800/60 border-t border-gray-100 dark:border-slate-800">
                <tr className="font-semibold text-gray-900 dark:text-slate-100 text-sm">
                  <td className="px-6 py-4 tracking-wide text-gray-500 dark:text-slate-400">Page Totals:</td>
                  <td className={`px-6 py-4 text-right ${totals.gold >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-700 dark:text-rose-400'}`}>{Math.abs(totals.gold).toFixed(3)}g</td>
                  <td className={`px-6 py-4 text-right ${totals.silver >= 0 ? 'text-slate-700 dark:text-slate-300' : 'text-rose-700 dark:text-rose-400'}`}>{Math.abs(totals.silver).toFixed(2)}g</td>
                  <td className={`px-6 py-4 text-right ${totals.copper >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>{Math.abs(totals.copper).toFixed(2)}g</td>
                  <td className={`px-6 py-4 text-right ${totals.cash >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-rose-800 dark:text-rose-400'}`}>Rs. {Math.round(Math.abs(totals.cash)).toLocaleString()}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${totals.cash >= 0 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                      Consolidated {totals.cash >= 0 ? 'Receivable' : 'Payable'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default CustomerSummaryReport;