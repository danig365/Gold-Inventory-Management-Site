
import React, { useMemo, useState } from 'react';
import { Transaction, Customer, TransactionType } from '../types';
import { format, subDays, isAfter, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';
import { TrendingUp, TrendingDown, Scale, Wallet, Layers, Filter, Search, X, Download, FileSpreadsheet, FileText, Printer, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const TOLA_WEIGHT = 11.664;

interface MonthlyReportProps {
  transactions: Transaction[];
  customers: Customer[];
}

const MonthlyReport: React.FC<MonthlyReportProps> = ({ transactions, customers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const getCustomerName = (id?: string) => customers.find(c => c.id === id)?.name || 'Direct Entry';

  const reportData = useMemo(() => {
    return transactions.filter(t => {
      const isTrade = [
        TransactionType.BUY_GOLD, TransactionType.SELL_GOLD,
        TransactionType.BUY_SILVER, TransactionType.SELL_SILVER
      ].includes(t.type);
      if (!isTrade) return false;

      if (filterType !== 'ALL' && t.type !== filterType) return false;

      const txDate = parseISO(t.date);
      const start = dateRange.start ? startOfDay(parseISO(dateRange.start)) : new Date(0);
      const end = dateRange.end ? endOfDay(parseISO(dateRange.end)) : new Date(8640000000000000);
      if (!isWithinInterval(txDate, { start, end })) return false;

      if (searchTerm) {
        const name = getCustomerName(t.customerId).toLowerCase();
        const term = searchTerm.toLowerCase();
        if (!name.includes(term)) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterType, dateRange, searchTerm, customers]);

  const totals = useMemo(() => {
    return reportData.reduce((acc, t) => {
      const value = (t.goldWeight || t.silverWeight || 0) * (t.rate || 0);
      if (t.type === TransactionType.BUY_GOLD) {
        acc.buyGold += (t.goldWeight || 0);
        acc.buyAmount += value;
      } else if (t.type === TransactionType.SELL_GOLD) {
        acc.sellGold += (t.goldWeight || 0);
        acc.sellAmount += value;
      } else if (t.type === TransactionType.BUY_SILVER) {
        acc.buySilver += (t.silverWeight || 0);
        acc.buyAmount += value;
      } else if (t.type === TransactionType.SELL_SILVER) {
        acc.sellSilver += (t.silverWeight || 0);
        acc.sellAmount += value;
      }
      return acc;
    }, { buyGold: 0, sellGold: 0, buySilver: 0, sellSilver: 0, buyAmount: 0, sellAmount: 0 });
  }, [reportData]);

  const exportToExcel = () => {
    const data = reportData.map(t => ({
      'Date': format(new Date(t.date), 'dd/MM/yyyy'),
      'Customer': getCustomerName(t.customerId),
      'Type': t.type.split('_').join(' '),
      'Metal': t.type.includes('GOLD') ? 'Gold' : 'Silver',
      'Weight (g)': (t.goldWeight || t.silverWeight || 0).toFixed(3),
      'Rate (Tola)': t.rate ? (t.rate * TOLA_WEIGHT).toFixed(2) : 0,
      'PKR Value': Math.round((t.goldWeight || t.silverWeight || 0) * (t.rate || 0)),
      'Remarks': t.remarks || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activity Report');
    XLSX.writeFile(wb, `Activity_Report_${dateRange.start}_to_${dateRange.end}.xlsx`);
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
    doc.text('Ph: +92 321 6090043 | Activity Statement', 14, 27);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 32, 196, 32);
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('Activity Report', 14, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${format(parseISO(dateRange.start), 'dd/MM/yyyy')} to ${format(parseISO(dateRange.end), 'dd/MM/yyyy')}`, 14, 48);
    autoTable(doc, {
      startY: 55,
      head: [['Date', 'Customer', 'Type', 'Weight', 'Rate (T)', 'Value (PKR)']],
      body: reportData.map(t => [
        format(new Date(t.date), 'dd/MM/yy'),
        getCustomerName(t.customerId),
        t.type.split('_')[0],
        `${(t.goldWeight || t.silverWeight || 0).toFixed(3)}g`,
        ((t.rate || 0) * TOLA_WEIGHT).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        Math.round((t.goldWeight || t.silverWeight || 0) * (t.rate || 0)).toLocaleString()
      ]),
      theme: 'grid',
      headStyles: { fillColor: [67, 56, 202] }
    });
    doc.save(`Activity_Statement_${dateRange.start}.pdf`);
    setIsExportMenuOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-display text-4xl font-semibold text-gray-800 dark:text-slate-100 tracking-tight">Activity Report</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 font-medium tracking-wide">Historical trading records & analytics</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl hover:bg-indigo-700 font-semibold shadow-md text-sm transition-all"
            >
              <Download size={14} />
              <span>Export Options</span>
              <ChevronDown size={12} className={isExportMenuOpen ? 'rotate-180' : ''} />
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-800 z-[70] py-2 overflow-hidden animate-in fade-in slide-in-from-top-2">
                <button onClick={exportToExcel} className="w-full flex items-center space-x-3 px-4 py-2.5 text-xs font-semibold text-green-700 dark:text-green-500 hover:bg-green-50 dark:hover:bg-slate-800 transition-colors"><FileSpreadsheet size={16} /><span>Export Excel</span></button>
                <button onClick={exportToPDF} className="w-full flex items-center space-x-3 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"><FileText size={16} /><span>Export PDF</span></button>
                <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                <button onClick={() => { window.print(); setIsExportMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"><Printer size={16} /><span>Print List</span></button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center gap-4 no-print transition-colors duration-300">
        <div className="flex items-center space-x-2 mr-2 text-indigo-500">
          <Filter size={18} />
          <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide">Filters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-4 flex-grow">
          <div className="relative flex-grow max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search customers..."
              className="block w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-slate-800 rounded-xl bg-gray-50/50 dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-medium shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-col min-w-[140px]">
            <select 
              value={filterType} 
              onChange={e => setFilterType(e.target.value)}
              className="text-sm font-medium border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2.5 bg-gray-50/50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
            >
              <option value="ALL">All Categories</option>
              <option value={TransactionType.BUY_GOLD}>Gold Purchases</option>
              <option value={TransactionType.SELL_GOLD}>Gold Sales</option>
              <option value={TransactionType.BUY_SILVER}>Silver Purchases</option>
              <option value={TransactionType.SELL_SILVER}>Silver Sales</option>
            </select>
          </div>

          <div className="flex items-center bg-gray-50/50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-sm">
            <input 
              type="date" 
              className="bg-transparent text-xs font-medium outline-none dark:text-slate-300"
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
            />
            <span className="mx-2 text-xs font-semibold text-gray-300 dark:text-slate-600">TO</span>
            <input 
              type="date" 
              className="bg-transparent text-xs font-medium outline-none dark:text-slate-300"
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
            />
          </div>

          {(searchTerm || filterType !== 'ALL') && (
            <button 
              onClick={() => { setSearchTerm(''); setFilterType('ALL'); }}
              className="px-3 py-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all flex items-center space-x-1"
            >
              <X size={14} />
              <span className="text-xs font-semibold">Clear</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-yellow-100 dark:border-yellow-900/30 flex items-center justify-between transition-colors duration-300">
          <div>
            <div className="flex items-center space-x-3 text-yellow-600 dark:text-yellow-500 mb-2">
              <Scale size={20} />
              <span className="text-xs font-semibold tracking-wide">Gold Stats</span>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">IN: <span className="text-gray-900 dark:text-slate-200 font-semibold">{totals.buyGold.toFixed(3)}g</span></p>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">OUT: <span className="text-gray-900 dark:text-slate-200 font-semibold">{totals.sellGold.toFixed(3)}g</span></p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-400 dark:text-slate-500">Volume</p>
            <p className="text-2xl font-bold text-yellow-800 dark:text-yellow-500">{(totals.buyGold + totals.sellGold).toFixed(2)}g</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors duration-300">
          <div>
            <div className="flex items-center space-x-3 text-slate-500 dark:text-slate-400 mb-2">
              <Layers size={20} />
              <span className="text-xs font-semibold tracking-wide">Silver Stats</span>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">IN: <span className="text-gray-900 dark:text-slate-200 font-semibold">{totals.buySilver.toFixed(2)}g</span></p>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">OUT: <span className="text-gray-900 dark:text-slate-200 font-semibold">{totals.sellSilver.toFixed(2)}g</span></p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-400 dark:text-slate-500">Volume</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-300">{(totals.buySilver + totals.sellSilver).toFixed(2)}g</p>
          </div>
        </div>

        <div className="bg-indigo-900 dark:bg-indigo-800 p-5 rounded-2xl shadow-xl text-white flex items-center justify-between transition-colors duration-300">
          <div>
            <div className="flex items-center space-x-3 text-indigo-300 dark:text-indigo-400 mb-2">
              <Wallet size={20} />
              <span className="text-xs font-semibold tracking-wide">Trade Turnover</span>
            </div>
            <p className="text-xs opacity-80 font-medium tracking-wide">Financial Volume (PKR)</p>
            <p className="text-3xl font-bold">Rs. {Math.round(totals.buyAmount + totals.sellAmount).toLocaleString()}</p>
          </div>
          <TrendingUp className="text-green-400 opacity-20" size={48} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-gray-200 dark:border-slate-800 overflow-hidden min-h-[400px] transition-colors duration-300">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
            <thead className="bg-gray-50 dark:bg-slate-800 text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide">
              <tr>
                <th className="px-6 py-4 text-left">Date</th>
                <th className="px-6 py-4 text-left">Customer</th>
                <th className="px-6 py-4 text-left">Category</th>
                <th className="px-6 py-4 text-right">Weight</th>
                <th className="px-6 py-4 text-right">Rate (Tola)</th>
                <th className="px-6 py-4 text-right">Value (PKR)</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-100 dark:divide-slate-800">
              {reportData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center opacity-30 text-gray-400 dark:text-slate-600">
                      <Filter size={48} className="mb-4" />
                      <p className="text-sm font-semibold tracking-wide">No records found for filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                reportData.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-500 dark:text-slate-400">
                      {format(new Date(t.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <p className="font-semibold text-indigo-900 dark:text-indigo-400 text-sm">{getCustomerName(t.customerId)}</p>
                       <p className="text-xs text-gray-500 dark:text-slate-400 font-medium italic">{t.remarks || 'No remarks provided'}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${t.type.includes('GOLD') ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400'}`}>
                          {t.type.includes('GOLD') ? 'Gold' : 'Silver'}
                        </span>
                        <span className={`text-xs font-semibold ${t.type.includes('BUY') ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {t.type.includes('BUY') ? 'Purchase' : 'Sale'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-gray-800 dark:text-slate-200">
                      {(t.goldWeight || t.silverWeight)?.toFixed(3)}g
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-500 dark:text-slate-400">
                      {t.rate ? (t.rate * TOLA_WEIGHT).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-indigo-900 dark:text-indigo-400">
                      Rs. {Math.round((t.goldWeight || t.silverWeight || 0) * (t.rate || 0)).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {reportData.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-slate-800 font-semibold text-gray-900 dark:text-slate-100 transition-colors duration-300">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right text-xs tracking-wide">Total Page Activity:</td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-xs text-yellow-600 dark:text-yellow-500">G: {(totals.buyGold + totals.sellGold).toFixed(3)}g</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">S: {(totals.buySilver + totals.sellSilver).toFixed(2)}g</div>
                  </td>
                  <td></td>
                  <td className="px-6 py-4 text-right text-indigo-700 dark:text-indigo-400 font-semibold">
                    Rs. {Math.round(totals.buyAmount + totals.sellAmount).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-center text-xs font-medium text-gray-500 dark:text-slate-500 tracking-wide pb-4 no-print">
        Total {reportData.length} records processed for the selected period
      </p>
    </div>
  );
};

export default MonthlyReport;
