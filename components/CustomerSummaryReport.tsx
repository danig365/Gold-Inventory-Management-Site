import React, { useMemo, useState } from 'react';
import { Transaction, Customer, TransactionType } from '../types';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { FileSpreadsheet, FileText, Printer, Search, Download, ChevronDown, Scale, Layers, Wallet, Calendar, X, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CustomerSummaryReportProps {
  customers: Customer[];
  transactions: Transaction[];
}

const CustomerSummaryReport: React.FC<CustomerSummaryReportProps> = ({ customers, transactions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

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
      let cashBal = 0;

      filteredTxs.forEach(t => {
        const weight = (t.goldWeight || t.silverWeight || 0);
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
        } else if (t.type === TransactionType.CASH_PAYMENT) {
          cashBal -= (t.cashIn || 0);
          cashBal += (t.cashOut || 0);
        } else if (t.type === TransactionType.GOLD_SETTLEMENT) {
          goldBal -= (t.goldIn || 0);
          goldBal += (t.goldOut || 0);
        } else if (t.type === TransactionType.SILVER_SETTLEMENT) {
          silverBal -= (t.silverIn || 0);
          silverBal += (t.silverOut || 0);
        }
      });

      return {
        ...customer,
        goldBal,
        silverBal,
        cashBal
      };
    }).filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.phone.includes(searchTerm)
    );
  }, [customers, transactions, searchTerm, startDate, endDate]);

  const totals = useMemo(() => {
    return reportData.reduce((acc, c) => ({
      gold: acc.gold + c.goldBal,
      silver: acc.silver + c.silverBal,
      cash: acc.cash + c.cashBal
    }), { gold: 0, silver: 0, cash: 0 });
  }, [reportData]);

  const clearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
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
      'Silver Status': c.silverBal >= 0 ? 'Silver laina hai' : 'Silver daina hai'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    XLSX.writeFile(wb, `Customer_Summary_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('New Jehlum  Gold Smith', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Ph: +92 321 6090043 | Customer Summary Balances', 14, 27);
    
    if (startDate || endDate) {
      doc.setFontSize(9);
      doc.text(`Period: ${startDate || 'Start'} to ${endDate || 'End'}`, 14, 33);
    }

    autoTable(doc, {
      startY: 40,
      head: [['Customer', 'Phone', 'Gold Bal (g)', 'Silver Bal (g)', 'Cash Bal (PKR)', 'Status']],
      body: reportData.map(c => [
        c.name.toUpperCase(),
        c.phone,
        c.goldBal.toFixed(3),
        c.silverBal.toFixed(2),
        Math.round(Math.abs(c.cashBal)).toLocaleString(),
        c.cashBal >= 0 ? 'LAINE' : 'DAINE'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [67, 56, 202] },
      styles: { fontSize: 8 }
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

          {/* Reset Filters */}
          {(searchTerm || startDate || endDate) && (
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`rounded-3xl p-6 text-white shadow-xl transition-all ${totals.cash >= 0 ? 'bg-indigo-900 shadow-indigo-100' : 'bg-rose-900 shadow-rose-100'}`}>
          <div className="flex items-center space-x-3 mb-4 opacity-60">
             <Wallet size={18} />
             <p className="text-xs font-semibold tracking-wide leading-none">Net Cash Balance</p>
          </div>
           <p className="text-4xl font-bold">Rs. {Math.round(Math.abs(totals.cash)).toLocaleString()}</p>
           <p className="text-xs font-semibold mt-2 bg-white/10 inline-block px-2 py-1 rounded">
             {totals.cash >= 0 ? 'Payment Laine hai' : 'Payment daine hai'}
          </p>
        </div>

        <div className={`rounded-3xl p-6 text-white shadow-xl transition-all ${totals.gold >= 0 ? 'bg-yellow-600 shadow-yellow-100' : 'bg-rose-600 shadow-rose-100'}`}>
          <div className="flex items-center space-x-3 mb-4 opacity-60">
             <Scale size={18} />
             <p className="text-xs font-semibold tracking-wide leading-none">Net Gold Balance</p>
          </div>
           <p className="text-4xl font-bold">{Math.abs(totals.gold).toFixed(3)}g</p>
           <p className="text-xs font-semibold mt-2 bg-white/10 inline-block px-2 py-1 rounded">
             {totals.gold >= 0 ? 'Gold laina hai' : 'Gold daina hai'}
          </p>
        </div>

        <div className={`rounded-3xl p-6 text-white shadow-xl transition-all ${totals.silver >= 0 ? 'bg-slate-600 shadow-slate-100' : 'bg-rose-600 shadow-rose-100'}`}>
          <div className="flex items-center space-x-3 mb-4 opacity-60">
             <Layers size={18} />
             <p className="text-xs font-semibold tracking-wide leading-none">Net Silver Balance</p>
          </div>
          <p className="text-4xl font-bold">{Math.abs(totals.silver).toFixed(2)}g</p>
          <p className="text-xs font-semibold mt-2 bg-white/10 inline-block px-2 py-1 rounded">
             {totals.silver >= 0 ? 'Silver laina hai' : 'Silver daina hai'}
          </p>
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
                <th className="px-6 py-4 text-right">Cash Balance</th>
                <th className="px-6 py-4 text-center">Net Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-800 text-sm">
              {reportData.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-6 py-20 text-center text-gray-400 dark:text-slate-500 font-medium tracking-wide italic opacity-70">
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