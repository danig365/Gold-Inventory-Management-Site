
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Customer, Transaction, TransactionType, Bank, PaymentMethod, TransferType } from '../types';
import { ArrowLeft, PlusCircle, MinusCircle, Wallet, Scale, Printer, Edit2, Trash2, ChevronDown, AlertTriangle, Layers, Landmark, Banknote, Download, FileSpreadsheet, FileText, X, CalendarDays, ArrowDownLeft, ArrowUpRight, CheckCircle2, Filter, RotateCcw, Weight, Info, Calculator, Palette, List, Coins, Settings2, Search, Calendar } from 'lucide-react';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const TOLA_WEIGHT = 11.664;

// Helper function to parse date strings in YYYY-MM-DD format without timezone issues
const parseDateString = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface CustomerLedgerProps {
  customer: Customer;
  transactions: Transaction[];
  allTransactions: Transaction[];
  banks: Bank[];
  onBack: () => void;
  onAddTransaction: (transaction: Transaction) => void;
  onUpdateTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

type TransactionFormData = {
  weight: number;
  rate: number;
  amount: number;
  remarks: string;
  date: string;
  ratePerTola: number;
  paymentMethod: PaymentMethod;
  bankId: string;
  transferType: TransferType;
  referenceNo: string;
  direction: 'IN' | 'OUT';
  impureWeight: number;
  point: number;
  karat: number;
};

const CustomerLedger: React.FC<CustomerLedgerProps> = ({ 
  customer, 
  transactions, 
  allTransactions,
  banks,
  onBack, 
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction
}) => {
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const [usePlainTable, setUsePlainTable] = useState(() => {
    const saved = localStorage.getItem('NewJehlum_use_plain_table');
    return saved === 'true';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  
  const [rateMode, setRateMode] = useState<'GRAM' | 'TOLA'>('TOLA');
  const [weightMode, setWeightMode] = useState<'GRAM' | 'TOLA' | 'KG'>('GRAM');
  const [settleMode, setSettleMode] = useState<'POINT' | 'KARAT'>('POINT');
  const [isCalcMode, setIsCalcMode] = useState(false);

  const draftKey = `NewJehlum_draft_tx_${customer.id}`;

  const createDefaultFormData = (date: string = getTodayDateString()): TransactionFormData => ({
    weight: 0,
    rate: 0,
    amount: 0,
    remarks: '',
    date,
    ratePerTola: 0,
    paymentMethod: PaymentMethod.CASH,
    bankId: '',
    transferType: TransferType.TF,
    referenceNo: '',
    direction: 'IN',
    impureWeight: 0,
    point: 0,
    karat: 24,
  });

  const [activeForm, setActiveForm] = useState<TransactionType>(() => {
    const saved = localStorage.getItem(`${draftKey}_type`);
    return saved ? (saved as TransactionType) : TransactionType.BUY_GOLD;
  });

  const [formData, setFormData] = useState<TransactionFormData>(() => createDefaultFormData());

  const [weightInput, setWeightInput] = useState('');
  const [kgInput, setKgInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [impureInput, setImpureInput] = useState('');
  const [pointInput, setPointInput] = useState('');
  const [karatInput, setKaratInput] = useState('24');

  const isMetalTrade = useMemo(() => {
    return [TransactionType.BUY_GOLD, TransactionType.SELL_GOLD, TransactionType.BUY_SILVER, TransactionType.SELL_SILVER].includes(activeForm);
  }, [activeForm]);

  const isMetalSettle = useMemo(() => {
    return [TransactionType.GOLD_SETTLEMENT, TransactionType.SILVER_SETTLEMENT].includes(activeForm);
  }, [activeForm]);

  const isSilverTrade = useMemo(() => {
    return [TransactionType.BUY_SILVER, TransactionType.SELL_SILVER].includes(activeForm);
  }, [activeForm]);

  const isDuplicateRef = useMemo(() => {
    if (formData.paymentMethod !== PaymentMethod.BANK || !formData.referenceNo || !formData.bankId) return false;
    return allTransactions.some(t => 
      t.id !== editingTransaction?.id &&
      t.paymentMethod === PaymentMethod.BANK && 
      t.bankId === formData.bankId && 
      t.referenceNo?.trim().toLowerCase() === formData.referenceNo?.trim().toLowerCase()
    );
  }, [formData.paymentMethod, formData.referenceNo, formData.bankId, allTransactions, editingTransaction]);

  useEffect(() => {
    localStorage.setItem('NewJehlum_use_plain_table', String(usePlainTable));
  }, [usePlainTable]);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      setFormData(JSON.parse(saved) as TransactionFormData);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!editingTransaction) {
      localStorage.setItem(draftKey, JSON.stringify(formData));
      localStorage.setItem(`${draftKey}_type`, activeForm);
    }
  }, [formData, activeForm, editingTransaction, draftKey]);

  // Handle Backspace key to go back to customer directory
  useEffect(() => {
    const handleBackspace = (e: KeyboardEvent) => {
      // Only trigger if not in a text input or textarea
      const target = e.target as HTMLElement;
      const isTypingInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      
      if (e.key === 'Backspace' && !isTypingInput) {
        e.preventDefault();
        onBack();
      }
    };

    window.addEventListener('keydown', handleBackspace);
    return () => {
      window.removeEventListener('keydown', handleBackspace);
    };
  }, [onBack]);

  const syncInputs = (fd: typeof formData) => {
    setWeightInput(fd.weight > 0 ? fd.weight.toString() : '');
    setKgInput(fd.weight > 0 ? (fd.weight / 1000).toString() : '');
    setImpureInput(fd.impureWeight > 0 ? fd.impureWeight.toString() : '');
    setPointInput(fd.point > 0 ? fd.point.toString() : '');
    setKaratInput(fd.karat ? fd.karat.toString() : '24');
  };

  const syncRateInput = (fd: TransactionFormData, mode: 'GRAM' | 'TOLA') => {
    const value = mode === 'TOLA' ? fd.ratePerTola : fd.rate;
    setRateInput(value > 0 ? value.toString() : '');
  };

  useEffect(() => {
    if (editingTransaction) {
      const w = editingTransaction.goldWeight || editingTransaction.silverWeight || editingTransaction.goldIn || editingTransaction.goldOut || editingTransaction.silverIn || editingTransaction.silverOut || 0;
      const loadedRateMode = editingTransaction.rateMode || 'TOLA';
      
      const newFd: TransactionFormData = {
        weight: w,
        rate: editingTransaction.rate || 0,
        amount: editingTransaction.cashIn || editingTransaction.cashOut || 0,
        remarks: editingTransaction.remarks,
        date: editingTransaction.date,
        ratePerTola: (editingTransaction.rate || 0) * TOLA_WEIGHT,
        paymentMethod: editingTransaction.paymentMethod || PaymentMethod.CASH,
        bankId: editingTransaction.bankId || '',
        transferType: editingTransaction.transferType || TransferType.TF,
        referenceNo: editingTransaction.referenceNo || '',
        direction: (editingTransaction.cashIn || editingTransaction.goldIn || editingTransaction.silverIn) ? 'IN' : 'OUT',
        impureWeight: editingTransaction.impureWeight || 0,
        point: editingTransaction.point || 0,
        karat: editingTransaction.karat || 24
      };
      setFormData(newFd);
      setActiveForm(editingTransaction.type);
      setSettleMode(editingTransaction.karat ? 'KARAT' : 'POINT');
      setIsCalcMode(!!editingTransaction.impureWeight);
      setRateMode(loadedRateMode);
      syncRateInput(newFd, loadedRateMode);
      setIsTxModalOpen(true);
      setWeightMode('GRAM');
      syncInputs(newFd);
    }
  }, [editingTransaction]);

  const handleTabChange = (type: TransactionType, dateOverride?: string) => {
    setActiveForm(type);
    setRefError(null);
    const clearedFd = createDefaultFormData(dateOverride ?? formData.date);
    setFormData(clearedFd);
    setWeightMode('GRAM');
    setRateMode('TOLA');
    setRateInput('');
    setSettleMode('POINT');
    setIsCalcMode(type === TransactionType.GOLD_SETTLEMENT || type === TransactionType.SILVER_SETTLEMENT);
    syncInputs(clearedFd);
  };

  const handleRateModeChange = (mode: 'GRAM' | 'TOLA') => {
    setRateMode(mode);
    syncRateInput(formData, mode);
  };

  const openQuickEntry = (type: TransactionType) => {
    setEditingTransaction(null);
    handleTabChange(type, getTodayDateString());
    setIsTxModalOpen(true);
  };

  const evaluateMath = (str: string): number => {
    try {
      const cleanStr = str.replace(/[^-+*/().0-9]/g, '');
      return Function(`'use strict'; return (${cleanStr})`)();
    } catch (e) {
      return parseFloat(str) || 0;
    }
  };

  const handleWeightInputChange = (str: string) => {
    setWeightInput(str);
    const val = evaluateMath(str);
    let gramWeight = val;
    if (weightMode === 'KG' && !isSilverTrade) gramWeight = val * 1000;
    else if (weightMode === 'TOLA') gramWeight = val * TOLA_WEIGHT;
    
    setFormData({ ...formData, weight: gramWeight, impureWeight: 0, point: 0, karat: 24 });
    if (isSilverTrade) setKgInput(gramWeight > 0 ? (gramWeight / 1000).toString() : '');
  };

  const handleKgInputChange = (str: string) => {
    setKgInput(str);
    const val = evaluateMath(str);
    const gramWeight = val * 1000;
    setFormData({ ...formData, weight: gramWeight, impureWeight: 0, point: 0, karat: 24 });
    setWeightInput(gramWeight > 0 ? gramWeight.toString() : '');
  };

  const calculatePure = (impure: number, mode: 'POINT' | 'KARAT', p: number, k: number) => {
    if (mode === 'POINT') {
      return (impure * (96 - p)) / 96;
    } else {
      return (impure * k) / 24;
    }
  };

  const handleImpureInputChange = (str: string) => {
    setImpureInput(str);
    const val = evaluateMath(str);
    let baseWeight = val;
    if (weightMode === 'KG') baseWeight = val * 1000;
    else if (weightMode === 'TOLA') baseWeight = val * TOLA_WEIGHT;
    
    const pure = calculatePure(baseWeight, settleMode, formData.point, formData.karat);
    setFormData({ ...formData, impureWeight: baseWeight, weight: pure });
    setWeightInput(pure > 0 ? pure.toFixed(3) : '');
  };

  const handlePointInputChange = (str: string) => {
    setPointInput(str);
    const val = evaluateMath(str);
    const pure = calculatePure(formData.impureWeight, 'POINT', val, formData.karat);
    setFormData({ ...formData, point: val, weight: pure });
    setWeightInput(pure > 0 ? pure.toFixed(3) : '');
  };

  const handleKaratInputChange = (str: string) => {
    setKaratInput(str);
    const val = evaluateMath(str);
    const pure = calculatePure(formData.impureWeight, 'KARAT', formData.point, val);
    setFormData({ ...formData, karat: val, weight: pure });
    setWeightInput(pure > 0 ? pure.toFixed(3) : '');
  };

  const handleSettleModeToggle = (mode: 'POINT' | 'KARAT') => {
    setSettleMode(mode);
    const pure = calculatePure(formData.impureWeight, mode, formData.point, formData.karat);
    setFormData({ ...formData, weight: pure });
    setWeightInput(pure > 0 ? pure.toFixed(3) : '');
  };

  const handleRateChange = (val: number) => {
    setFormData({
      ...formData,
      rate: val,
      ratePerTola: val * TOLA_WEIGHT
    });
  };

  const handleRatePerTolaChange = (val: number) => {
    setFormData({
      ...formData,
      ratePerTola: val,
      rate: val / TOLA_WEIGHT
    });
  };

  const fullLedgerData = useMemo(() => {
    let runningCash = 0; 
    let runningGold = 0;
    let runningSilver = 0;
    
    return [...transactions].sort((a, b) => parseDateString(a.date).getTime() - parseDateString(b.date).getTime()).map((t, index) => {
      const weight = (t.goldWeight || t.silverWeight || 0);
      const rate = (t.rate || 0);
      const tradeValue = weight * rate;
      
      if (t.type === TransactionType.BUY_GOLD) {
        runningGold += (t.goldWeight || 0); 
        runningCash -= tradeValue; 
      } else if (t.type === TransactionType.SELL_GOLD) {
        runningGold -= (t.goldWeight || 0); 
        runningCash += tradeValue; 
      } else if (t.type === TransactionType.BUY_SILVER) {
        runningSilver += (t.silverWeight || 0);
        runningCash -= tradeValue;
      } else if (t.type === TransactionType.SELL_SILVER) {
        runningSilver -= (t.silverWeight || 0);
        runningCash += tradeValue;
      } else if (t.type === TransactionType.CASH_PAYMENT) {
        runningCash -= (t.cashIn || 0);
        runningCash += (t.cashOut || 0);
      } else if (t.type === TransactionType.GOLD_SETTLEMENT) {
        runningGold -= (t.goldIn || 0);
        runningGold += (t.goldOut || 0);
      } else if (t.type === TransactionType.SILVER_SETTLEMENT) {
        runningSilver -= (t.silverIn || 0);
        runningSilver += (t.silverOut || 0);
      }

      return {
        ...t,
        srNo: index + 1,
        remainingCash: runningCash,
        remainingGold: runningGold,
        remainingSilver: runningSilver,
        tradeValue
      };
    });
  }, [transactions]);

  const ledgerData = useMemo(() => {
    return fullLedgerData.filter(t => {
      const matchesType = filterType === 'ALL' || t.type === filterType;
      
      let matchesDate = true;
      if (filterStartDate || filterEndDate) {
        const txDate = parseDateString(t.date);
        const start = filterStartDate ? startOfDay(parseISO(filterStartDate)) : new Date(0);
        const end = filterEndDate ? endOfDay(parseISO(filterEndDate)) : new Date(8640000000000000);
        matchesDate = isWithinInterval(txDate, { start, end });
      }

      let matchesSearch = true;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        matchesSearch = 
          t.remarks.toLowerCase().includes(term) || 
          t.type.toLowerCase().includes(term) ||
          (t.referenceNo?.toLowerCase().includes(term) || false);
      }

      return matchesType && matchesDate && matchesSearch;
    });
  }, [fullLedgerData, filterType, filterStartDate, filterEndDate, searchTerm]);

  const totals = useMemo(() => {
    const finalTx = fullLedgerData[fullLedgerData.length - 1];
    return {
      cash: finalTx?.remainingCash || 0,
      gold: finalTx?.remainingGold || 0,
      silver: finalTx?.remainingSilver || 0
    };
  }, [fullLedgerData]);

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRefError(null);

    if (isMetalTrade) {
      if (formData.weight <= 0) { setRefError("Weight must be a positive number."); return; }
      if (formData.rate <= 0) { setRefError("Rate must be a positive number."); return; }
    } else if (isMetalSettle) {
      if (formData.weight <= 0) { setRefError("Pure weight results in zero. Please check inputs."); return; }
    } else if (activeForm === TransactionType.CASH_PAYMENT) {
      if (formData.amount <= 0) { setRefError("Amount must be a positive number."); return; }
    }

    if (formData.paymentMethod === PaymentMethod.BANK) {
      if (!formData.bankId) { setRefError("Please select a bank account."); return; }
      if (!formData.referenceNo) { setRefError("Reference/Slip number is mandatory."); return; }
      if (isDuplicateRef) { setRefError("Double entry detected for this reference."); return; }
    }

    let tx: Transaction = {
      id: editingTransaction ? editingTransaction.id : Date.now().toString(),
      customerId: customer.id,
      date: formData.date,
      type: activeForm,
      remarks: formData.remarks,
      rateMode: isMetalTrade ? rateMode : undefined,
    };
    tx.goldWeight = undefined; tx.silverWeight = undefined; tx.rate = undefined;
    tx.goldIn = 0; tx.goldOut = 0; tx.silverIn = 0; tx.silverOut = 0; tx.cashIn = 0; tx.cashOut = 0;
    tx.impureWeight = undefined; tx.point = undefined; tx.karat = undefined;
    
    if (isCalcMode) {
      tx.impureWeight = formData.impureWeight;
      if (settleMode === 'POINT') tx.point = formData.point;
      else tx.karat = formData.karat;
    }

    switch (activeForm) {
      case TransactionType.BUY_GOLD:
      case TransactionType.SELL_GOLD:
        tx.goldWeight = formData.weight; tx.rate = formData.rate;
        break;
      case TransactionType.BUY_SILVER:
      case TransactionType.SELL_SILVER:
        tx.silverWeight = formData.weight; tx.rate = formData.rate;
        break;
      case TransactionType.CASH_PAYMENT:
        if (formData.direction === 'IN') tx.cashIn = formData.amount;
        else tx.cashOut = formData.amount;
        tx.paymentMethod = formData.paymentMethod;
        if (formData.paymentMethod === PaymentMethod.BANK) {
          tx.bankId = formData.bankId;
          tx.transferType = formData.transferType;
          tx.referenceNo = formData.referenceNo;
        }
        break;
      case TransactionType.GOLD_SETTLEMENT:
        if (formData.direction === 'IN') tx.goldIn = formData.weight;
        else tx.goldOut = formData.weight;
        break;
      case TransactionType.SILVER_SETTLEMENT:
        if (formData.direction === 'IN') tx.silverIn = formData.weight;
        else tx.silverOut = formData.weight;
        break;
    }
    if (editingTransaction) onUpdateTransaction(tx);
    else onAddTransaction(tx);
    localStorage.removeItem(draftKey);
    localStorage.removeItem(`${draftKey}_type`);
    setFormData(createDefaultFormData(formData.date));
    setRateInput('');
    syncInputs(createDefaultFormData(formData.date));
    setIsTxModalOpen(false);
    setEditingTransaction(null);
  };

  const formatType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterType('ALL');
  };

  const exportToExcel = () => {
    const getDisplayRate = (t: Transaction) => {
      const mode = t.rateMode || 'TOLA';
      return mode === 'GRAM' ? (t.rate || 0) : (t.rate || 0) * TOLA_WEIGHT;
    };

    const data = ledgerData.map(t => ({
      'Sr No': t.srNo,
      'Date': format(parseDateString(t.date), 'dd/MM/yyyy'),
      'Description': formatType(t.type),
      'Impure (g)': t.impureWeight || '-',
      'Point/Karat': t.point || t.karat || '-',
      'Pure (g)': (t.goldWeight || t.goldIn || t.goldOut || t.silverWeight || t.silverIn || t.silverOut || 0).toFixed(3),
      'Rate': getDisplayRate(t).toFixed(2),
      'Receivable (Rs)': t.cashIn || (t.type.includes('SELL') ? t.tradeValue : 0),
      'Payable (Rs)': t.cashOut || (t.type.includes('BUY') ? t.tradeValue : 0),
      'Cash Balance (Rs)': t.remainingCash
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `${customer.name}_Ledger.xlsx`);
    setIsExportMenuOpen(false);
  };

  const exportToPDF = () => {
    const getDisplayRate = (t: Transaction) => {
      const mode = t.rateMode || 'TOLA';
      return mode === 'GRAM' ? (t.rate || 0) : (t.rate || 0) * TOLA_WEIGHT;
    };

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('New Jehlum  Gold Smith', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Ph: +92 321 6090043 | Customer Ledger Statement', 14, 27);
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Ledger For: ${customer.name}`, 14, 40);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Address: ${customer.address} | Phone: ${customer.phone}`, 14, 46);

    const tableRows = ledgerData.map(t => [
        t.srNo,
        format(parseDateString(t.date), 'dd/MM/yy'),
        formatType(t.type),
        t.impureWeight?.toFixed(2) || '-',
        t.point ? `${t.point} (P)` : (t.karat ? `${t.karat} (K)` : '-'),
        (t.goldWeight || t.goldIn || t.goldOut || t.silverWeight || t.silverIn || t.silverOut || 0).toFixed(3),
      getDisplayRate(t).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        (t.cashIn || (t.type.includes('SELL') ? t.tradeValue : 0))?.toLocaleString() || '0',
        (t.cashOut || (t.type.includes('BUY') ? t.tradeValue : 0))?.toLocaleString() || '0',
        t.remainingCash.toLocaleString()
    ]);

    const footerPure = ledgerData.reduce((sum, t) => sum + (t.goldWeight || t.goldIn || t.goldOut || t.silverWeight || t.silverIn || t.silverOut || 0), 0);
    const footerIn = ledgerData.reduce((sum, t) => sum + (t.cashIn || (t.type.includes('SELL') ? (t.tradeValue || 0) : 0)), 0);
    const footerOut = ledgerData.reduce((sum, t) => sum + (t.cashOut || (t.type.includes('BUY') ? (t.tradeValue || 0) : 0)), 0);

    tableRows.push([
        '', '', 'GRAND TOTAL', '', '',
        footerPure.toFixed(3),
        '',
        footerIn.toLocaleString(),
        footerOut.toLocaleString(),
        ledgerData[ledgerData.length - 1]?.remainingCash.toLocaleString() || '0'
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Sr', 'Date', 'Description', 'Impure (g)', 'Point/Karat', 'Pure', 'Rate', 'Receivable', 'Payable', 'Cash Balance']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [67, 56, 202] },
      styles: { fontSize: 7 },
      didParseCell: (data) => {
          if (data.row.index === tableRows.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [241, 245, 249];
          }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Final Balance Summary', 14, finalY);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const summaryX = 14;
    const summaryLineHeight = 8;
    
    doc.text(`Cash Balance: Rs. ${Math.round(Math.abs(totals.cash)).toLocaleString()}`, summaryX, finalY + summaryLineHeight);
    doc.setFont('helvetica', 'bold');
    doc.text(`(${totals.cash >= 0 ? 'PAYABLE/LAINE HAI' : 'RECEIVABLE/DAINE HAI'})`, summaryX + 100, finalY + summaryLineHeight);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Gold Balance: ${Math.abs(totals.gold).toFixed(3)}g`, summaryX, finalY + summaryLineHeight * 2);
    doc.setFont('helvetica', 'bold');
    doc.text(`(${totals.gold >= 0 ? 'PAYABLE/LAINA HAI' : 'RECEIVABLE/DAINA HAI'})`, summaryX + 100, finalY + summaryLineHeight * 2);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Silver Balance: ${Math.abs(totals.silver).toFixed(3)}g`, summaryX, finalY + summaryLineHeight * 3);
    doc.setFont('helvetica', 'bold');
    doc.text(`(${totals.silver >= 0 ? 'PAYABLE/LAINA HAI' : 'RECEIVABLE/DAINA HAI'})`, summaryX + 100, finalY + summaryLineHeight * 3);

    doc.save(`${customer.name}_Ledger.pdf`);
    setIsExportMenuOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft size={24} className="text-gray-600 dark:text-slate-400" />
          </button>
          <div>
            <h2 className="font-display text-4xl font-semibold text-indigo-900 dark:text-slate-100 leading-tight tracking-tight">{customer.name}</h2>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 tracking-wide">{customer.address} • {customer.phone}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openQuickEntry(TransactionType.BUY_GOLD)} className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 font-semibold shadow-md text-sm transition-all active:scale-95 flex items-center space-x-1.5"><PlusCircle size={14} /><span>Buy Gold</span></button>
          <button onClick={() => openQuickEntry(TransactionType.SELL_GOLD)} className="bg-rose-600 text-white px-3 py-2 rounded-lg hover:bg-rose-700 font-semibold shadow-md text-sm transition-all active:scale-95 flex items-center space-x-1.5"><MinusCircle size={14} /><span>Sell Gold</span></button>
          <button onClick={() => openQuickEntry(TransactionType.BUY_SILVER)} className="bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 font-semibold shadow-md text-sm transition-all active:scale-95 flex items-center space-x-1.5"><PlusCircle size={14} /><span>Buy Silver</span></button>
          <button onClick={() => openQuickEntry(TransactionType.SELL_SILVER)} className="bg-orange-600 text-white px-3 py-2 rounded-lg hover:bg-orange-700 font-semibold shadow-md text-sm transition-all active:scale-95 flex items-center space-x-1.5"><MinusCircle size={14} /><span>Sell Silver</span></button>
          <button onClick={() => openQuickEntry(TransactionType.CASH_PAYMENT)} className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 font-semibold shadow-md text-sm transition-all active:scale-95 flex items-center space-x-1.5"><Banknote size={14} /><span>Cash Entry</span></button>
          <button onClick={() => openQuickEntry(TransactionType.GOLD_SETTLEMENT)} className="bg-yellow-500 text-white px-3 py-2 rounded-lg hover:bg-yellow-600 font-semibold shadow-md text-sm transition-all active:scale-95 flex items-center space-x-1.5"><Layers size={14} /><span>Gold Settle</span></button>
          <button onClick={() => openQuickEntry(TransactionType.SILVER_SETTLEMENT)} className="bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600 font-semibold shadow-md text-sm transition-all active:scale-95 flex items-center space-x-1.5"><Layers size={14} /><span>Silver Settle</span></button>

          <div className="relative ml-auto lg:ml-2">
            <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="flex items-center space-x-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-800 text-gray-700 dark:text-slate-400 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 shadow-sm font-semibold text-sm transition-all"><Download size={14} /><span>Export</span><ChevronDown size={12} className={isExportMenuOpen ? 'rotate-180' : ''} /></button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 z-[70] py-1 overflow-hidden">
                <button onClick={exportToExcel} className="w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-semibold text-green-700 dark:text-green-500 hover:bg-green-50 dark:hover:bg-slate-800 transition-colors"><FileSpreadsheet size={14} /><span>Excel</span></button>
                <button onClick={exportToPDF} className="w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-semibold text-red-700 dark:text-rose-500 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors"><FileText size={14} /><span>PDF</span></button>
                <button onClick={() => { window.print(); setIsExportMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"><Printer size={14} /><span>Print</span></button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-3xl p-5 shadow-sm border-2 flex items-center space-x-4 transition-all duration-300 ${totals.cash >= 0 ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50 shadow-blue-50' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/50 shadow-rose-50'}`}>
          <div className={`p-3 rounded-2xl ${totals.cash >= 0 ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white'}`}>
            <Banknote size={24} />
          </div>
          <div className="flex-grow">
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide leading-none mb-1">Cash Balance</p>
            <div className="flex justify-between items-end">
              <h4 className={`text-3xl font-bold leading-none ${totals.cash >= 0 ? 'text-blue-900 dark:text-blue-400' : 'text-rose-900 dark:text-rose-400'}`}>Rs. {Math.round(Math.abs(totals.cash)).toLocaleString()}</h4>
              <span className={`text-xs font-semibold px-2 py-1 rounded-md ${totals.cash >= 0 ? 'bg-blue-200 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300' : 'bg-rose-200 dark:bg-rose-900/50 text-rose-800 dark:text-rose-300'}`}>
                {totals.cash >= 0 ? 'Laine hai' : 'Daine hai'}
              </span>
            </div>
          </div>
        </div>

        <div className={`rounded-3xl p-5 shadow-sm border-2 flex items-center space-x-4 transition-all duration-300 ${totals.gold >= 0 ? 'bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/50 shadow-yellow-50' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/50 shadow-rose-50'}`}>
          <div className={`p-3 rounded-2xl ${totals.gold >= 0 ? 'bg-yellow-600 text-white' : 'bg-rose-600 text-white'}`}>
            <Scale size={24} />
          </div>
          <div className="flex-grow">
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide leading-none mb-1">Gold Balance (24K)</p>
            <div className="flex justify-between items-end">
              <h4 className={`text-3xl font-bold leading-none ${totals.gold >= 0 ? 'text-yellow-900 dark:text-yellow-500' : 'text-rose-900 dark:text-rose-400'}`}>{Math.abs(totals.gold).toFixed(3)}g</h4>
              <span className={`text-xs font-semibold px-2 py-1 rounded-md ${totals.gold >= 0 ? 'bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300' : 'bg-rose-200 dark:bg-rose-900/50 text-rose-800 dark:text-rose-300'}`}>
                {totals.gold >= 0 ? 'Laina hai' : 'Daina hai'}
              </span>
            </div>
          </div>
        </div>

        <div className={`rounded-3xl p-5 shadow-sm border-2 flex items-center space-x-4 transition-all duration-300 ${totals.silver >= 0 ? 'bg-slate-50/50 dark:bg-slate-900/10 border-slate-300 dark:border-slate-800 shadow-slate-50' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/50 shadow-rose-50'}`}>
          <div className={`p-3 rounded-2xl ${totals.silver >= 0 ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'bg-rose-600 text-white'}`}>
            <Coins size={24} />
          </div>
          <div className="flex-grow">
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 tracking-wide leading-none mb-1">Silver Balance</p>
            <div className="flex justify-between items-end">
              <h4 className={`text-3xl font-bold leading-none ${totals.silver >= 0 ? 'text-slate-900 dark:text-slate-300' : 'text-rose-900 dark:text-rose-400'}`}>{Math.abs(totals.silver).toFixed(2)}g</h4>
              <span className={`text-xs font-semibold px-2 py-1 rounded-md ${totals.silver >= 0 ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-400' : 'bg-rose-200 dark:bg-rose-900/50 text-rose-800 dark:text-rose-300'}`}>
                {totals.silver >= 0 ? 'Laina hai' : 'Daina hai'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
        <div className="bg-gray-50/50 dark:bg-slate-800/50 p-4 border-b border-gray-100 dark:border-slate-800 space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex items-center space-x-2 text-gray-400 dark:text-slate-500">
              <List size={14} />
              <span className="text-xs font-semibold tracking-wide">Transaction Ledger</span>
            </div>
            
            <div className="flex items-center space-x-3 w-full lg:w-auto">
              <div className="relative flex-grow lg:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search remarks, types..." 
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm font-medium focus:ring-1 focus:ring-indigo-500 outline-none shadow-inner bg-white dark:bg-slate-900 dark:text-slate-100"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-2 py-1 shadow-inner">
                <Calendar size={12} className="text-gray-400 dark:text-slate-500 mr-2" />
                <input 
                  type="date" 
                  className="bg-transparent text-xs font-medium outline-none dark:text-slate-300"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
                <span className="mx-1 text-xs font-semibold text-gray-300 dark:text-slate-600">TO</span>
                <input 
                  type="date" 
                  className="bg-transparent text-xs font-medium outline-none dark:text-slate-300"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>

              {(searchTerm || filterStartDate || filterEndDate || filterType !== 'ALL') && (
                <button 
                  onClick={clearFilters}
                  className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                  title="Clear Filters"
                >
                  <RotateCcw size={16} />
                </button>
              )}

              <button 
                onClick={() => setUsePlainTable(!usePlainTable)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${usePlainTable ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900' : 'bg-indigo-600 text-white border-indigo-700 shadow-sm'}`}
              >
                <Palette size={14} />
                <span>{usePlainTable ? 'Colored' : 'Plain'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-500">
            <span className="mr-4">LAINE = Receivable</span>
            <span>DAINE = Payable</span>
          </div>
          <table className="min-w-full border-collapse border border-gray-300 dark:border-slate-800 text-sm">
            <thead className="bg-gray-100 dark:bg-slate-800 font-semibold text-gray-600 dark:text-slate-400 tracking-wide transition-colors duration-300">
              <tr>
                <th className="px-3 py-4 text-left border border-gray-300 dark:border-slate-700">Sr No</th>
                <th className="px-3 py-4 text-left border border-gray-300 dark:border-slate-700">Date</th>
                <th className="px-3 py-4 text-left border border-gray-300 dark:border-slate-700">Description</th>
                <th className="px-3 py-4 text-right border border-gray-300 dark:border-slate-700">Impure (g)</th>
                <th className="px-3 py-4 text-right border border-gray-300 dark:border-slate-700">Point/Karat</th>
                <th className="px-3 py-4 text-right border border-gray-300 dark:border-slate-700">Pure (g)</th>
                <th className="px-3 py-4 text-right border border-gray-300 dark:border-slate-700">Rate</th>
                <th className="px-3 py-4 text-right border border-gray-300 dark:border-slate-700">Receivable (Rs)</th>
                <th className="px-3 py-4 text-right border border-gray-300 dark:border-slate-700">Payable (Rs)</th>
                <th className="px-3 py-4 text-right border border-gray-300 dark:border-slate-700">Cash Balance (Rs)</th>
                <th className="px-3 py-4 text-center border border-gray-300 dark:border-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300 dark:divide-slate-800">
              {ledgerData.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400 dark:text-slate-600 font-medium border border-gray-300 dark:border-slate-800 transition-colors">No transactions recorded</td></tr>
              ) : (
                ledgerData.map((t, index) => (
                  <tr key={t.id} className={`transition-colors group border-b border-gray-300 dark:border-slate-800 ${usePlainTable ? 'bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800' : (index % 2 === 0 ? 'bg-[#CAF0F8] dark:bg-indigo-950/40' : 'bg-[#90E0EF] dark:bg-indigo-900/20')}`}>
                    <td className="px-3 py-2 font-semibold text-gray-700 dark:text-slate-400 border-r border-gray-300 dark:border-slate-800">{t.srNo}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-slate-300 border-r border-gray-300 dark:border-slate-800">{format(parseDateString(t.date), 'dd/MM/yy')}</td>
                    <td className="px-3 py-2 border-r border-gray-300 dark:border-slate-800">
                      <div className="font-semibold text-indigo-900 dark:text-indigo-400 leading-none">{formatType(t.type)}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-500 italic mt-0.5">{t.remarks}</div>
                      {t.referenceNo && <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-500 mt-0.5">Ref: {t.referenceNo}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-700 dark:text-slate-400 border-r border-gray-300 dark:border-slate-800">{t.impureWeight?.toFixed(2) || '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-700 dark:text-slate-400 border-r border-gray-300 dark:border-slate-800">
                      {t.point ? `${t.point} (P)` : (t.karat ? `${t.karat} (K)` : '-')}
                    </td>
                    <td className="px-3 py-2 text-right font-bold border-r border-gray-300 dark:border-slate-800">
                      <span className={(t.type.includes('BUY') || t.goldIn || t.silverIn) ? 'text-green-700 dark:text-green-400' : 'text-rose-700 dark:text-rose-400'}>
                        {(t.goldWeight || t.goldIn || t.goldOut || t.silverWeight || t.silverIn || t.silverOut || 0).toFixed(3)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-700 dark:text-slate-400 border-r border-gray-300 dark:border-slate-800">{((t.rateMode || 'TOLA') === 'GRAM' ? (t.rate || 0) : (t.rate || 0) * TOLA_WEIGHT).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400 border-r border-gray-300 dark:border-slate-800">{t.cashIn ? t.cashIn.toLocaleString() : (t.type.includes('SELL') ? t.tradeValue?.toLocaleString() : '-')}</td>
                    <td className="px-3 py-2 text-right font-bold text-rose-700 dark:text-rose-400 border-r border-gray-300 dark:border-slate-800">{t.cashOut ? t.cashOut.toLocaleString() : (t.type.includes('BUY') ? t.tradeValue?.toLocaleString() : '-')}</td>
                    <td className="px-3 py-2 text-right font-semibold text-indigo-900 dark:text-indigo-400 border-r border-gray-300 dark:border-slate-800">
                      {Math.abs(t.remainingCash).toLocaleString()}
                      <span className={`text-[8px] ml-1 font-bold ${t.remainingCash >= 0 ? 'text-green-700 dark:text-green-400' : 'text-rose-700 dark:text-rose-400'}`}>
                        {t.remainingCash >= 0 ? 'LAINE' : 'DAINE'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center transition-colors">
                      <div className="flex justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button onClick={() => setEditingTransaction(t)} className="p-1 text-blue-700 dark:text-blue-400 hover:bg-white/50 dark:hover:bg-slate-700 rounded transition-colors"><Edit2 size={12} /></button>
                        <button onClick={() => setDeletingId(t.id)} className="p-1 text-red-700 dark:text-rose-400 hover:bg-white/50 dark:hover:bg-slate-700 rounded transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isTxModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh] border border-gray-100 dark:border-slate-800 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-2xl font-semibold text-gray-800 dark:text-slate-100 tracking-tight">{editingTransaction ? 'Update Entry' : 'Create New Entry'}</h3>
              <button onClick={() => { setIsTxModalOpen(false); setEditingTransaction(null); }} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 p-1.5"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-6">
              {[
                { id: TransactionType.BUY_GOLD, label: 'Buy Gold', c: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
                { id: TransactionType.SELL_GOLD, label: 'Sell Gold', c: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' },
                { id: TransactionType.BUY_SILVER, label: 'Buy Silver', c: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
                { id: TransactionType.SELL_SILVER, label: 'Sell Silver', c: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
                { id: TransactionType.CASH_PAYMENT, label: 'Cash Entry', c: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' },
                { id: TransactionType.GOLD_SETTLEMENT, label: 'Gold Settle', c: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
                { id: TransactionType.SILVER_SETTLEMENT, label: 'Silver Settle', c: 'bg-slate-100 dark:bg-slate-700/30 text-slate-700 dark:text-slate-400' }
              ].map(tab => (
                <button key={tab.id} onClick={() => handleTabChange(tab.id)} className={`min-h-11 px-2.5 py-2.5 rounded-xl border transition-all font-semibold text-[10px] leading-tight flex flex-col items-center justify-center gap-1 ${activeForm === tab.id ? `${tab.c} border-indigo-500 shadow-sm` : 'border-gray-100 dark:border-slate-800 text-gray-500 dark:text-slate-500 hover:border-gray-300 dark:hover:border-slate-600'}`}>{tab.label}</button>
              ))}
            </div>

            <form onSubmit={handleTxSubmit} className="space-y-5">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Transaction Date</label>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <input required className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg font-bold text-[10px] bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                      </div>
                      <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-2 rounded-lg whitespace-nowrap">
                        {format(parseDateString(formData.date), 'dd/MMM/yy')}
                      </div>
                    </div>
                  </div>
                  
                  {(activeForm === TransactionType.CASH_PAYMENT || isMetalSettle) && (
                    <div>
                      <label className="block text-[8px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Flow Direction</label>
                      <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-lg border border-gray-200 dark:border-slate-700">
                        <button type="button" onClick={() => setFormData({...formData, direction: 'IN'})} className={`flex-1 flex items-center justify-center py-1.5 rounded-md font-black uppercase text-[8px] transition-all ${formData.direction === 'IN' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-500 dark:hover:text-slate-300'}`}>
                          {isMetalSettle ? 'Credit (In)' : 'IN (Lain)'}
                        </button>
                        <button type="button" onClick={() => setFormData({...formData, direction: 'OUT'})} className={`flex-1 flex items-center justify-center py-1.5 rounded-md font-black uppercase text-[8px] transition-all ${formData.direction === 'OUT' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-500 dark:hover:text-slate-300'}`}>
                          {isMetalSettle ? 'Debit (Out)' : 'OUT (Dain)'}
                        </button>
                      </div>
                    </div>
                  )}

                  {(isMetalTrade || isMetalSettle) && (
                    <div className="col-span-1 sm:col-span-2">
                       <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 space-y-4 shadow-sm">
                          {isMetalTrade && (
                             <div className="flex justify-between items-center mb-2">
                                <span className="text-[8px] font-black uppercase text-gray-400 dark:text-slate-500">Entry Mode</span>
                                <div className="flex bg-white dark:bg-slate-900 rounded-lg p-1 border border-gray-200 dark:border-slate-700 shadow-inner">
                                  <button type="button" onClick={() => setIsCalcMode(false)} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${!isCalcMode ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Manual Wt</button>
                                  <button type="button" onClick={() => setIsCalcMode(true)} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${isCalcMode ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Use Calc</button>
                                </div>
                             </div>
                          )}

                          {isCalcMode ? (
                             <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-slate-700">
                                <div className="flex justify-between items-center">
                                  <label className="block text-xs font-semibold text-indigo-400 tracking-wide">Trade Calculator (96/24K)</label>
                                  <div className="flex gap-2">
                                    <div className="flex bg-white dark:bg-slate-900 rounded-lg p-1 border border-gray-200 dark:border-slate-700 shadow-inner">
                                      <button type="button" onClick={() => setWeightMode('GRAM')} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${weightMode === 'GRAM' ? 'bg-indigo-600 text-white' : 'text-gray-400 dark:text-slate-500'}`}>Gram</button>
                                      <button type="button" onClick={() => setWeightMode('TOLA')} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${weightMode === 'TOLA' ? 'bg-indigo-600 text-white' : 'text-gray-400 dark:text-slate-500'}`}>Tola</button>
                                    </div>
                                    <div className="flex bg-white dark:bg-slate-900 rounded-lg p-1 border border-indigo-200 dark:border-indigo-900 shadow-inner">
                                      <button type="button" onClick={() => handleSettleModeToggle('POINT')} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${settleMode === 'POINT' ? 'bg-indigo-900 text-white' : 'text-indigo-400 dark:text-indigo-500'}`}>Points</button>
                                      <button type="button" onClick={() => handleSettleModeToggle('KARAT')} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${settleMode === 'KARAT' ? 'bg-indigo-900 text-white' : 'text-indigo-400 dark:text-indigo-500'}`}>Karat</button>
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                   <div>
                                     <label className="block text-[8px] font-black uppercase text-indigo-700 dark:text-indigo-400 mb-1">1. Impure ({weightMode})</label>
                                     <input type="text" className="w-full p-2.5 border border-indigo-200 dark:border-indigo-900/50 rounded-xl font-black text-[10px] focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-100" value={impureInput} onChange={e => handleImpureInputChange(e.target.value)} placeholder="Weight..." />
                                   </div>
                                   <div>
                                     <label className="block text-[8px] font-black uppercase text-indigo-700 dark:text-indigo-400 mb-1">{settleMode === 'POINT' ? '2. Points (96)' : '2. Karat (24)'}</label>
                                     <input type="text" className="w-full p-2.5 border border-indigo-200 dark:border-indigo-900/50 rounded-xl font-black text-[10px] focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-100" value={settleMode === 'POINT' ? pointInput : karatInput} onChange={e => settleMode === 'POINT' ? handlePointInputChange(e.target.value) : handleKaratInputChange(e.target.value)} placeholder={settleMode === 'POINT' ? "0" : "24"} />
                                   </div>
                                   <div>
                                      <label className="block text-[8px] font-black uppercase text-green-700 dark:text-green-400 mb-1">3. Pure (Grams)</label>
                                      <div className="relative">
                                         <input readOnly className="w-full p-2.5 border border-green-500 dark:border-green-700 bg-green-50 dark:bg-green-900/10 rounded-xl font-black text-[10px] text-green-900 dark:text-green-300 outline-none" value={weightInput} placeholder="Result..." />
                                      </div>
                                   </div>
                                </div>
                             </div>
                          ) : isSilverTrade ? (
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                   <label className="block text-[8px] font-black uppercase text-indigo-900 dark:text-indigo-400 mb-1 tracking-wider">Weight (Kilograms)</label>
                                   <input type="text" className="w-full p-3 border border-indigo-200 dark:border-indigo-900/50 rounded-lg text-base bg-white dark:bg-slate-900 font-black text-indigo-900 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none shadow-sm" placeholder="0.0000" onChange={e => handleKgInputChange(e.target.value)} value={kgInput} />
                                </div>
                                <div>
                                   <label className="block text-[8px] font-black uppercase text-indigo-900 dark:text-indigo-400 mb-1 tracking-wider">Weight (Grams)</label>
                                   <input type="text" className="w-full p-3 border border-indigo-200 dark:border-indigo-900/50 rounded-lg text-base bg-white dark:bg-slate-900 font-black text-indigo-900 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none shadow-sm" placeholder="0.000" onChange={e => handleWeightInputChange(e.target.value)} value={weightInput} />
                                </div>
                             </div>
                          ) : (
                             <div className="flex flex-col gap-3">
                               <div className="flex justify-between items-center">
                                  <label className="block text-[7px] font-black uppercase text-gray-400 dark:text-slate-500">Weight Unit</label>
                                  <div className="flex bg-white dark:bg-slate-900 rounded-lg p-1 border border-gray-200 dark:border-slate-700 shadow-inner">
                                    <button type="button" onClick={() => setWeightMode('GRAM')} className={`px-3 py-1 rounded-md text-[8px] font-black uppercase transition-all ${weightMode === 'GRAM' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Gram</button>
                                    <button type="button" onClick={() => setWeightMode('TOLA')} className={`px-3 py-1 rounded-md text-[8px] font-black uppercase transition-all ${weightMode === 'TOLA' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Tola</button>
                                  </div>
                               </div>
                               <div className="relative">
                                  <label className="block text-[8px] font-black uppercase text-indigo-900 dark:text-indigo-400 tracking-wider mb-1">Manual Pure Weight ({weightMode})</label>
                                  <div className="flex items-center gap-2">
                                    <div className="relative flex-grow">
                                      <input type="text" className="w-full p-3 border border-indigo-600 dark:border-indigo-500 rounded-xl text-base bg-white dark:bg-slate-900 font-black text-indigo-900 dark:text-indigo-100 focus:ring-1 focus:ring-indigo-500 outline-none shadow-sm" placeholder={`Type weight...`} onChange={e => handleWeightInputChange(e.target.value)} value={weightInput} />
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 dark:text-indigo-800"><Scale size={18} /></div>
                                    </div>
                                    <div className="p-2.5 bg-indigo-900 dark:bg-indigo-600 text-yellow-400 rounded-xl shadow-md"><Calculator size={18} /></div>
                                  </div>
                               </div>
                             </div>
                          )}
                       </div>
                    </div>
                  )}
               </div>

               {isMetalTrade && (
                 <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 space-y-4 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-indigo-400 tracking-wide">Execution Pricing</span>
                      <div className="flex bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-gray-200 dark:border-slate-700 shadow-inner">
                         <button type="button" onClick={() => handleRateModeChange('GRAM')} className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all ${rateMode === 'GRAM' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Per Gram</button>
                         <button type="button" onClick={() => handleRateModeChange('TOLA')} className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all ${rateMode === 'TOLA' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Per Tola</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 items-center">
                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-indigo-400 tracking-wide mb-1">Execution Rate ({rateMode})</label>
                        <input 
                          type="text" 
                          className="w-full p-3 border border-gray-200 dark:border-slate-800 rounded-xl font-black text-sm outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-900 dark:text-slate-100 shadow-sm" 
                          value={rateInput}
                          onChange={e => {
                            const raw = e.target.value;
                            setRateInput(raw);
                            const val = evaluateMath(raw);
                            if (rateMode === 'TOLA') handleRatePerTolaChange(val);
                            else handleRateChange(val);
                          }} 
                          placeholder={rateMode === 'TOLA' ? "Rate per tola" : "Rate per gram"} 
                        />
                        {rateMode === 'TOLA' && (
                          <div className="flex justify-between mt-1.5 text-xs text-indigo-300 dark:text-indigo-600 font-medium tracking-wide">
                            <span>≈ Rs. {formData.rate.toFixed(2)} / gram</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900 shadow-inner">
                         <span className="text-xs font-semibold text-indigo-400 block mb-0.5">Total Value</span>
                         <span className="text-2xl font-bold text-indigo-900 dark:text-indigo-400 leading-none">Rs. {Math.round(formData.weight * (formData.rate || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                 </div>
               )}

               {activeForm === TransactionType.CASH_PAYMENT && (
                 <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setFormData({...formData, paymentMethod: PaymentMethod.CASH})} className={`py-2 px-3 border border-gray-200 dark:border-slate-800 rounded-xl font-semibold text-xs transition-all ${formData.paymentMethod === PaymentMethod.CASH ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Physical Cash</button>
                        <button type="button" onClick={() => setFormData({...formData, paymentMethod: PaymentMethod.BANK})} className={`py-2 px-3 border border-gray-200 dark:border-slate-800 rounded-xl font-semibold text-xs transition-all ${formData.paymentMethod === PaymentMethod.BANK ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>Bank Settlement</button>
                    </div>
                    {formData.paymentMethod === PaymentMethod.BANK && (
                       <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-300">
                          <select required className="p-2.5 border border-gray-200 dark:border-slate-800 rounded-lg text-sm font-medium bg-gray-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500" value={formData.bankId} onChange={e => setFormData({...formData, bankId: e.target.value})}><option value="">Select Bank Account</option>{banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.accountNumber})</option>)}</select>
                          <input required className="p-2.5 border border-gray-200 dark:border-slate-800 rounded-lg text-sm font-medium bg-gray-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Slip Reference No" value={formData.referenceNo} onChange={e => setFormData({...formData, referenceNo: e.target.value})} />
                       </div>
                    )}
                    <div className="relative">
                        <input required className="w-full p-5 border-2 border-indigo-100 dark:border-indigo-900 bg-indigo-50/20 dark:bg-indigo-950/20 rounded-2xl font-bold text-3xl text-indigo-900 dark:text-indigo-300 shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-indigo-200 dark:placeholder:text-indigo-900" type="text" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: evaluateMath(e.target.value)})} placeholder="0.00" />
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 text-indigo-200 dark:text-indigo-900 font-semibold text-sm">PKR</div>
                    </div>
                 </div>
               )}

               <div className="relative">
                    <textarea className="w-full p-3 border border-gray-200 dark:border-slate-800 rounded-xl h-20 text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium placeholder:italic dark:placeholder:text-slate-600" value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} placeholder="Trade notes or item description..." />
                  <div className="absolute right-2.5 bottom-2.5 text-gray-300 dark:text-slate-700"><FileText size={16} /></div>
               </div>

                  {refError && (<div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-sm font-medium rounded-xl border border-rose-100 dark:border-rose-900 animate-pulse flex items-center gap-2"><AlertTriangle size={16} /><span>{refError}</span></div>)}

                  <button type="submit" className="w-full py-4 bg-indigo-900 dark:bg-indigo-600 text-white rounded-xl font-semibold text-sm tracking-wide hover:bg-black dark:hover:bg-indigo-700 transition-all shadow-lg active:scale-[0.99]">Post Final Transaction</button>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[90] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-[340px] w-full p-8 shadow-2xl text-center animate-in zoom-in duration-200 border border-gray-100 dark:border-slate-800">
             <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-rose-600 dark:text-rose-400"><AlertTriangle size={40} /></div>
             <h3 className="font-display text-2xl font-semibold mb-2 tracking-tight text-gray-800 dark:text-slate-100">Delete Permanently?</h3>
             <p className="text-sm text-gray-500 dark:text-slate-400 mb-10 font-medium px-4 leading-relaxed">Warning: This transaction will be wiped from records and all balances will be recalculated.</p>
             <div className="grid grid-cols-2 gap-4">
               <button onClick={() => setDeletingId(null)} className="py-4 text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase bg-gray-50 dark:bg-slate-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">Go Back</button>
               <button onClick={() => { onDeleteTransaction(deletingId); setDeletingId(null); }} className="py-4 bg-rose-600 text-white rounded-2xl font-semibold text-sm uppercase shadow-lg shadow-rose-100 dark:shadow-rose-900/20 hover:bg-rose-700 active:scale-95 transition-all">Yes, Delete</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerLedger;
