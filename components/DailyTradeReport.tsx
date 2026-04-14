import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType, Customer } from '../types';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Calendar, Scale, Coins, TrendingUp, TrendingDown, Download, FileText, User, ArrowRight, Wallet, PieChart, Info, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const TOLA_WEIGHT = 11.664;

const getDisplayRate = (t: Transaction) => {
  const mode = t.rateMode || 'TOLA';
  return mode === 'GRAM' ? (t.rate || 0) : (t.rate || 0) * TOLA_WEIGHT;
};

interface DailyTradeReportProps {
  transactions: Transaction[];
  customers: Customer[];
}

const DailyTradeReport: React.FC<DailyTradeReportProps> = ({ transactions, customers }) => {
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [metalType, setMetalType] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');

  const getCustomerName = (id?: string) => customers.find(c => c.id === id)?.name || '-';

  const dailyData = useMemo(() => {
    const start = startOfDay(parseISO(dateRange.start));
    const end = endOfDay(parseISO(dateRange.end));
    
    // Filter transactions by date and customer once
    const baseFiltered = transactions.filter(t => {
      const txDate = parseISO(t.date);
      const matchesDate = isWithinInterval(txDate, { start, end });
      const matchesCustomer = selectedCustomerId === 'ALL' || t.customerId === selectedCustomerId;
      return matchesDate && matchesCustomer;
    });

    const mapTrade = (t: Transaction, type: 'GOLD' | 'SILVER') => {
      const weight = type === 'GOLD' ? (t.goldWeight || 0) : (t.silverWeight || 0);
      const ratePerGram = t.rate || 0;
      const amount = weight * ratePerGram;
      return { 
        ...t, 
        weight, 
        tolaWeight: weight / TOLA_WEIGHT, 
        displayRate: getDisplayRate(t), 
        amount 
      };
    };

    // Calculate Gold Stats
    const goldTxs = baseFiltered.filter(t => [TransactionType.BUY_GOLD, TransactionType.SELL_GOLD].includes(t.type));
    const goldSells = goldTxs.filter(t => t.type === TransactionType.SELL_GOLD).map(t => mapTrade(t, 'GOLD'));
    const goldBuys = goldTxs.filter(t => t.type === TransactionType.BUY_GOLD).map(t => mapTrade(t, 'GOLD'));
    
    const goldSellAmt = goldSells.reduce((sum, s) => sum + s.amount, 0);
    const goldBuyAmt = goldBuys.reduce((sum, b) => sum + b.amount, 0);
    const goldProfit = goldSellAmt - goldBuyAmt;

    // Calculate Silver Stats
    const silverTxs = baseFiltered.filter(t => [TransactionType.BUY_SILVER, TransactionType.SELL_SILVER].includes(t.type));
    const silverSells = silverTxs.filter(t => t.type === TransactionType.SELL_SILVER).map(t => mapTrade(t, 'SILVER'));
    const silverBuys = silverTxs.filter(t => t.type === TransactionType.BUY_SILVER).map(t => mapTrade(t, 'SILVER'));
    
    const silverSellAmt = silverSells.reduce((sum, s) => sum + s.amount, 0);
    const silverBuyAmt = silverBuys.reduce((sum, b) => sum + b.amount, 0);
    const silverProfit = silverSellAmt - silverBuyAmt;

    // Data for the current active view (tables)
    const activeIsGold = metalType === 'GOLD';
    const activeSells = activeIsGold ? goldSells : silverSells;
    const activeBuys = activeIsGold ? goldBuys : silverBuys;

    return {
      activeSells,
      activeBuys,
      activeTotals: {
        sellAmount: activeIsGold ? goldSellAmt : silverSellAmt,
        buyAmount: activeIsGold ? goldBuyAmt : silverBuyAmt,
        sellWeight: activeSells.reduce((sum, s) => sum + s.weight, 0),
        buyWeight: activeBuys.reduce((sum, b) => sum + b.weight, 0),
        profit: activeIsGold ? goldProfit : silverProfit
      },
      summary: {
        gold: { sell: goldSellAmt, buy: goldBuyAmt, profit: goldProfit },
        silver: { sell: silverSellAmt, buy: silverBuyAmt, profit: silverProfit },
        grandTotal: goldProfit + silverProfit
      }
    };
  }, [transactions, dateRange, metalType, selectedCustomerId]);

  const exportToExcel = () => {
    const sellData = dailyData.activeSells.map(s => ({
      Type: 'SALE', Date: s.date, Customer: getCustomerName(s.customerId), Qty: s.weight, Rate: s.displayRate, Amount: s.amount
    }));
    const buyData = dailyData.activeBuys.map(b => ({
      Type: 'PURCHASE', Date: b.date, Customer: getCustomerName(b.customerId), Qty: b.weight, Rate: b.displayRate, Amount: b.amount
    }));
    const summary = [{
      Type: 'SUMMARY', Date: '-', Customer: '-', Qty: dailyData.activeTotals.sellWeight - dailyData.activeTotals.buyWeight, Rate: '-', Amount: dailyData.activeTotals.profit
    }];
    const ws = XLSX.utils.json_to_sheet([...sellData, ...buyData, ...summary]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trade_Report');
    XLSX.writeFile(wb, `Trade_Sheet_${dateRange.start}.xlsx`);
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
    doc.text('Ph: +92 321 6090043 | Daily Trade Analysis', 14, 27);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 32, 196, 32);

    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text(`Daily Trade Sheet (${metalType})`, 14, 42);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 14, 48);
    
    autoTable(doc, {
      startY: 55,
      head: [['Date', 'Customer', 'Qty (g)', 'Rate/T', 'Amount']],
      body: dailyData.activeSells.map(s => [
        format(parseISO(s.date), 'dd/MM'),
        getCustomerName(s.customerId),
        s.weight.toFixed(3),
        Math.round(s.displayRate).toLocaleString(),
        Math.round(s.amount).toLocaleString()
      ]),
      theme: 'grid',
      headStyles: { fillColor: [190, 18, 60] },
      styles: { fontSize: 8 },
      foot: [['', 'TOTAL SALES', dailyData.activeTotals.sellWeight.toFixed(3), '', Math.round(dailyData.activeTotals.sellAmount).toLocaleString()]],
      footStyles: { fillColor: [255, 241, 242], textColor: [159, 18, 57], fontStyle: 'bold' }
    });

    const buyY = (doc as any).lastAutoTable.finalY + 15;
    autoTable(doc, {
      startY: buyY,
      head: [['Date', 'Customer', 'Qty (g)', 'Rate/T', 'Amount']],
      body: dailyData.activeBuys.map(b => [
        format(parseISO(b.date), 'dd/MM'),
        getCustomerName(b.customerId),
        b.weight.toFixed(3),
        Math.round(b.displayRate).toLocaleString(),
        Math.round(b.amount).toLocaleString()
      ]),
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105] },
      styles: { fontSize: 8 },
      foot: [['', 'TOTAL PURCHASES', dailyData.activeTotals.buyWeight.toFixed(3), '', Math.round(dailyData.activeTotals.buyAmount).toLocaleString()]],
      footStyles: { fillColor: [236, 253, 245], textColor: [5, 150, 105], fontStyle: 'bold' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Performance Summary', 14, finalY);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gold Profit/Loss: Rs. ${Math.round(dailyData.summary.gold.profit).toLocaleString()}`, 14, finalY + 8);
    doc.text(`Silver Profit/Loss: Rs. ${Math.round(dailyData.summary.silver.profit).toLocaleString()}`, 14, finalY + 16);
    doc.text(`Net Grand Total: Rs. ${Math.abs(Math.round(dailyData.summary.grandTotal)).toLocaleString()}`, 14, finalY + 24);
    doc.setFont('helvetica', 'bold');
    doc.text(`(${dailyData.summary.grandTotal >= 0 ? 'TOTAL PROFIT' : 'TOTAL LOSS'})`, 140, finalY + 24);

    doc.save(`Daily_Trade_Sheet_${dateRange.start}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-full overflow-hidden">
      {/* Header Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800">
        <div className="flex items-center space-x-4">
          <div className="bg-indigo-700 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40">
            <Calendar size={22} />
          </div>
          <div>
            <h2 className="font-display text-3xl font-semibold text-gray-800 dark:text-slate-100 tracking-tight leading-none mb-1">Trade Sheet</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 font-medium tracking-wide">
              {dateRange.start === dateRange.end 
                ? format(parseISO(dateRange.start), 'dd MMMM yyyy')
                : `${format(parseISO(dateRange.start), 'dd MMM')} - ${format(parseISO(dateRange.end), 'dd MMM yyyy')}`
              }
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="flex items-center bg-gray-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-inner min-w-[180px]">
            <div className="flex items-center px-2">
              <User size={14} className="text-gray-400 dark:text-slate-500 mr-2" />
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 leading-none mb-0.5">Customer</label>
                <select 
                  className="bg-transparent border-none text-xs font-semibold p-0 focus:ring-0 cursor-pointer text-indigo-700 dark:text-indigo-400 outline-none"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="ALL">All Customers</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex bg-gray-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-inner">
            <button onClick={() => setMetalType('GOLD')} className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${metalType === 'GOLD' ? 'bg-yellow-500 text-white shadow-md' : 'text-gray-500 dark:text-slate-400'}`}><Scale size={12} /><span>Gold</span></button>
            <button onClick={() => setMetalType('SILVER')} className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${metalType === 'SILVER' ? 'bg-slate-500 text-white shadow-md' : 'text-gray-500 dark:text-slate-400'}`}><Coins size={12} /><span>Silver</span></button>
          </div>

          <div className="flex items-center bg-gray-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-gray-200 dark:border-slate-700">
            <div className="flex flex-col px-2">
              <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 leading-none mb-0.5">From</label>
              <input type="date" className="bg-transparent border-none text-xs font-semibold p-0 focus:ring-0 cursor-pointer text-indigo-700 dark:text-indigo-400" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
            </div>
            <ArrowRight size={12} className="text-gray-300 dark:text-slate-600 mx-1" />
            <div className="flex flex-col px-2">
              <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 leading-none mb-0.5">To</label>
              <input type="date" className="bg-transparent border-none text-xs font-semibold p-0 focus:ring-0 cursor-pointer text-indigo-700 dark:text-indigo-400" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      {/* Primary Detail Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 p-4 rounded-3xl flex items-center space-x-4">
           <div className="p-3 bg-rose-600 text-white rounded-2xl shadow-lg shadow-rose-100"><TrendingDown size={20} /></div>
           <div>
              <p className="text-xs font-semibold text-rose-500 dark:text-rose-300 tracking-wide leading-none mb-1">Active Sales</p>
              <h4 className="text-2xl font-bold text-rose-900 dark:text-rose-100 leading-none">Rs. {Math.round(dailyData.activeTotals.sellAmount).toLocaleString()}</h4>
              <p className="text-xs font-medium text-rose-500 dark:text-rose-300 mt-1">{dailyData.activeTotals.sellWeight.toFixed(3)}g Out</p>
           </div>
        </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 p-4 rounded-3xl flex items-center space-x-4">
           <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-100"><TrendingUp size={20} /></div>
           <div>
              <p className="text-xs font-semibold text-emerald-500 dark:text-emerald-300 tracking-wide leading-none mb-1">Active Purchases</p>
              <h4 className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 leading-none">Rs. {Math.round(dailyData.activeTotals.buyAmount).toLocaleString()}</h4>
              <p className="text-xs font-medium text-emerald-500 dark:text-emerald-300 mt-1">{dailyData.activeTotals.buyWeight.toFixed(3)}g In</p>
           </div>
        </div>
        <div className={`col-span-1 md:col-span-2 p-4 rounded-3xl flex items-center justify-between border-2 transition-all ${dailyData.activeTotals.profit >= 0 ? 'bg-indigo-900 border-indigo-700 text-white shadow-xl shadow-indigo-100' : 'bg-rose-900 border-rose-700 text-white shadow-xl shadow-rose-100'}`}>
           <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-2xl ${dailyData.activeTotals.profit >= 0 ? 'bg-indigo-700' : 'bg-rose-700'}`}><PieChart size={24} /></div>
              <div>
                  <p className="text-xs font-semibold tracking-wide opacity-80 mb-1">Current Metal Position ({metalType})</p>
                  <h4 className="text-2xl font-bold leading-none">Rs. {Math.abs(Math.round(dailyData.activeTotals.profit)).toLocaleString()}</h4>
              </div>
           </div>
           <div className="text-right">
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${dailyData.activeTotals.profit >= 0 ? 'bg-green-500' : 'bg-rose-500'}`}>
                {dailyData.activeTotals.profit >= 0 ? 'Profit' : 'Loss'}
              </span>
           </div>
        </div>
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SELL SECTION */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col h-full">
          <div className="bg-rose-600 text-white px-5 py-3 flex justify-between items-center">
            <h3 className="font-semibold text-sm tracking-wide">Sales (Dain) - {metalType}</h3>
            <span className="text-xs font-medium opacity-90">Ref: Sheet</span>
          </div>
          <div className="flex-grow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-rose-50 dark:bg-rose-950/20 text-[11px] font-semibold text-rose-700 dark:text-rose-300 tracking-wide">
                <tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Customer</th><th className="px-4 py-2 text-right">Qty (g)</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-800 text-xs">
                {dailyData.activeSells.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-slate-500 font-medium tracking-wide opacity-70 italic">No sales found</td></tr>
                ) : dailyData.activeSells.map(s => (
                  <tr key={s.id} className="hover:bg-rose-50/20 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 font-medium">{format(parseISO(s.date), 'dd/MM')}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-700 dark:text-slate-200 truncate max-w-[110px]">{getCustomerName(s.customerId)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-slate-300">{s.weight.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-rose-700 dark:text-rose-300">{Math.round(s.displayRate).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-slate-100">{Math.round(s.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {dailyData.activeSells.length > 0 && (
                <tfoot className="bg-rose-50/50 dark:bg-rose-950/20 border-t border-rose-100 dark:border-rose-900/40">
                  <tr className="font-semibold text-rose-900 dark:text-rose-200 text-xs">
                    <td colSpan={2} className="px-4 py-3 tracking-wide">Total Sales</td>
                    <td className="px-4 py-3 text-right">{dailyData.activeTotals.sellWeight.toFixed(3)}g</td>
                    <td></td>
                    <td className="px-4 py-3 text-right">Rs. {Math.round(dailyData.activeTotals.sellAmount).toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* BUY SECTION */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col h-full">
          <div className="bg-emerald-600 text-white px-5 py-3 flex justify-between items-center">
            <h3 className="font-semibold text-sm tracking-wide">Purchases (Lain) - {metalType}</h3>
            <span className="text-xs font-medium opacity-90">Ref: Sheet</span>
          </div>
          <div className="flex-grow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-emerald-50 dark:bg-emerald-950/20 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 tracking-wide">
                <tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Customer</th><th className="px-4 py-2 text-right">Qty (g)</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-800 text-xs">
                {dailyData.activeBuys.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-slate-500 font-medium tracking-wide opacity-70 italic">No purchases found</td></tr>
                ) : dailyData.activeBuys.map(b => (
                  <tr key={b.id} className="hover:bg-emerald-50/20 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 font-medium">{format(parseISO(b.date), 'dd/MM')}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-700 dark:text-slate-200 truncate max-w-[110px]">{getCustomerName(b.customerId)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-slate-300">{b.weight.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 dark:text-emerald-300">{Math.round(b.displayRate).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-slate-100">{Math.round(b.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {dailyData.activeBuys.length > 0 && (
                <tfoot className="bg-emerald-50/50 dark:bg-emerald-950/20 border-t border-emerald-100 dark:border-emerald-900/40">
                  <tr className="font-semibold text-emerald-900 dark:text-emerald-200 text-xs">
                    <td colSpan={2} className="px-4 py-3 tracking-wide">Total Purchases</td>
                    <td className="px-4 py-3 text-right">{dailyData.activeTotals.buyWeight.toFixed(3)}g</td>
                    <td></td>
                    <td className="px-4 py-3 text-right">Rs. {Math.round(dailyData.activeTotals.buyAmount).toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* CONSOLIDATED SUMMARY SECTION */}
      <div className="bg-gray-900 dark:bg-slate-950 rounded-[2.5rem] p-8 text-white shadow-2xl border border-gray-800 dark:border-slate-800 relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-10 opacity-[0.05] group-hover:scale-110 transition-transform duration-700">
            <BarChart3 size={180} />
         </div>
         <div className="relative z-10 space-y-8">
            <div className="flex items-center space-x-3">
               <div className="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400">
                  <PieChart size={20} />
               </div>
               <div>
                  <h3 className="font-display text-2xl font-semibold tracking-tight leading-none mb-1">Combined Trade Summary</h3>
                  <p className="text-xs text-gray-400 font-medium tracking-wide">Global financial performance for selected period</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {/* Gold Profit/Loss Box */}
               <div className="bg-white/5 rounded-3xl p-6 border border-white/10 hover:border-yellow-500/50 transition-all group/box">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold tracking-wide text-yellow-500">Gold Performance</p>
                     <Scale size={16} className="text-yellow-500/50" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-gray-400">
                        <span>Sales</span>
                        <span>Rs. {Math.round(dailyData.summary.gold.sell).toLocaleString()}</span>
                     </div>
                    <div className="flex justify-between text-xs font-medium text-gray-400">
                        <span>Purchases</span>
                        <span>Rs. {Math.round(dailyData.summary.gold.buy).toLocaleString()}</span>
                     </div>
                     <div className="h-px bg-white/10 my-3"></div>
                     <div className="flex justify-between items-end">
                      <span className="text-xs font-semibold text-gray-400 tracking-wide">Net Result</span>
                        <div className="text-right">
                        <p className={`text-2xl font-bold ${dailyData.summary.gold.profit >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                              {dailyData.summary.gold.profit >= 0 ? '+' : '-'} Rs. {Math.abs(Math.round(dailyData.summary.gold.profit)).toLocaleString()}
                           </p>
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded ${dailyData.summary.gold.profit >= 0 ? 'bg-green-400/10 text-green-400' : 'bg-rose-400/10 text-rose-400'}`}>
                              {dailyData.summary.gold.profit >= 0 ? 'Profit' : 'Loss'}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Silver Profit/Loss Box */}
               <div className="bg-white/5 rounded-3xl p-6 border border-white/10 hover:border-slate-400/50 transition-all group/box">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold tracking-wide text-slate-400">Silver Performance</p>
                     <Coins size={16} className="text-slate-400/50" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-gray-400">
                        <span>Sales</span>
                        <span>Rs. {Math.round(dailyData.summary.silver.sell).toLocaleString()}</span>
                     </div>
                    <div className="flex justify-between text-xs font-medium text-gray-400">
                        <span>Purchases</span>
                        <span>Rs. {Math.round(dailyData.summary.silver.buy).toLocaleString()}</span>
                     </div>
                     <div className="h-px bg-white/10 my-3"></div>
                     <div className="flex justify-between items-end">
                      <span className="text-xs font-semibold text-gray-400 tracking-wide">Net Result</span>
                        <div className="text-right">
                        <p className={`text-2xl font-bold ${dailyData.summary.silver.profit >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                              {dailyData.summary.silver.profit >= 0 ? '+' : '-'} Rs. {Math.abs(Math.round(dailyData.summary.silver.profit)).toLocaleString()}
                           </p>
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded ${dailyData.summary.silver.profit >= 0 ? 'bg-green-400/10 text-green-400' : 'bg-rose-400/10 text-rose-400'}`}>
                              {dailyData.summary.silver.profit >= 0 ? 'Profit' : 'Loss'}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Grand Total Performance */}
               <div className="bg-indigo-600/10 rounded-3xl p-6 border border-indigo-500/30 shadow-lg shadow-black/20 group/box relative overflow-hidden">
                  <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover/box:opacity-10 transition-opacity"></div>
                  <div className="relative z-10 h-full flex flex-col justify-between">
                     <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-semibold tracking-wide text-indigo-400 underline decoration-indigo-500/50 underline-offset-4">Grand Total Result</p>
                        <Wallet size={16} className="text-indigo-400/50" />
                     </div>
                     <div className="mt-auto">
                        <p className="text-xs font-medium text-indigo-200/70 tracking-wide mb-1">Total Net Worth Change</p>
                        <p className={`text-4xl font-bold tracking-tight ${dailyData.summary.grandTotal >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                           Rs. {Math.abs(Math.round(dailyData.summary.grandTotal)).toLocaleString()}
                        </p>
                        <div className="mt-3 flex items-center space-x-2">
                          <span className={`px-4 py-1.5 rounded-xl text-xs font-semibold tracking-wide ${dailyData.summary.grandTotal >= 0 ? 'bg-green-400 text-gray-900 shadow-lg shadow-green-500/20' : 'bg-rose-400 text-gray-900 shadow-lg shadow-rose-500/20'}`}>
                              {dailyData.summary.grandTotal >= 0 ? 'Total Profit' : 'Total Loss'}
                           </span>
                           {dailyData.summary.grandTotal >= 0 ? (
                              <TrendingUp size={18} className="text-green-400 animate-bounce" />
                           ) : (
                              <TrendingDown size={18} className="text-rose-400 animate-bounce" />
                           )}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>

      <div className="flex justify-center space-x-4 pt-4 no-print">
         <button onClick={exportToExcel} className="flex items-center space-x-2 px-6 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-200 rounded-2xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm active:scale-95">
           <Download size={14} className="text-indigo-600" />
           <span>Excel Report</span>
         </button>
         <button onClick={exportToPDF} className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-900 text-white rounded-2xl font-semibold text-sm hover:bg-black transition-all shadow-lg active:scale-95">
           <FileText size={14} className="text-yellow-400" />
           <span>PDF Report</span>
         </button>
      </div>
    </div>
  );
};

export default DailyTradeReport;