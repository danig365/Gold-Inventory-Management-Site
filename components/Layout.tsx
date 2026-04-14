
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  ClipboardList, 
  Landmark, 
  CalendarRange, 
  Sun, 
  Moon, 
  ChevronLeft, 
  Menu,
  User,
  Settings,
  LogOut,
  ChevronRight,
  Database
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  onLogoClick: () => void;
  onViewReport: () => void;
  onViewSummary: () => void;
  onViewDashboard: () => void;
  onViewBanks: () => void;
  onViewDaily: () => void;
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
  activeView: 'dashboard' | 'ledger' | 'report' | 'summary' | 'banks' | 'daily';
  onBackup?: () => void;
  onRestore?: () => void;
  useDatabase?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  title, 
  onLogoClick, 
  onViewReport, 
  onViewSummary, 
  onViewDashboard, 
  onViewBanks, 
  onViewDaily, 
  onToggleDarkMode, 
  isDarkMode, 
  activeView,
  onBackup,
  onRestore,
  useDatabase
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('haroon_sidebar_collapsed');
    return saved === 'true';
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('haroon_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const navItems = [
    { id: 'dashboard', label: 'Customers', icon: LayoutDashboard, onClick: onViewDashboard },
    { id: 'daily', label: 'Daily Trade', icon: CalendarRange, onClick: onViewDaily },
    { id: 'banks', label: 'Bank Ledger', icon: Landmark, onClick: onViewBanks },
    { id: 'summary', label: 'Summary Report', icon: ClipboardList, onClick: onViewSummary },
    { id: 'report', label: 'Activity Logs', icon: FileText, onClick: onViewReport },
  ];

  const SidebarItem = ({ item }: { item: typeof navItems[0] }) => {
    const isActive = activeView === item.id || (activeView === 'ledger' && item.id === 'dashboard');
    return (
      <button
        onClick={() => {
          item.onClick();
          setIsMobileMenuOpen(false);
        }}
        className={`w-full flex items-center transition-all duration-200 group px-3 py-3 rounded-xl mb-1 ${
          isActive 
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400'
        }`}
      >
        <item.icon size={20} className={`shrink-0 ${isActive ? 'text-white' : 'group-hover:scale-110 transition-transform'}`} />
        <span className={`ml-4 text-[13px] font-semibold tracking-wide overflow-hidden whitespace-nowrap transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
          {item.label}
        </span>
        {isActive && !isSidebarCollapsed && (
          <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full"></div>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex transition-colors duration-300 font-sans text-slate-700 dark:text-slate-200">
      {/* Sidebar - Desktop */}
      <aside 
        className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 transition-all duration-300 ease-in-out fixed h-screen z-50 ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="p-6 flex items-center justify-between">
          <button 
            onClick={onLogoClick}
            className="flex items-center space-x-3 overflow-hidden"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-[11px] tracking-tight shrink-0 shadow-lg shadow-indigo-200 dark:shadow-none bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 border border-white/20">
              ZA
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col text-left animate-in fade-in duration-500">
                <span className="text-sm font-semibold text-slate-800 dark:text-white leading-none">Zain Abbas</span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tracking-wide mt-1">Ledger</span>
              </div>
            )}
          </button>
        </div>

        <nav className="flex-grow px-4 mt-4 space-y-1">
          {navItems.map(item => (
            <SidebarItem key={item.id} item={item} />
          ))}
        </nav>
        <div className="p-4 mt-auto border-t border-gray-100 dark:border-slate-800">
          {/* Database Status */}
          <div className={`mb-3 ${isSidebarCollapsed ? 'px-0' : 'px-2'}`}>
            <div className={`flex items-center mb-2 ${isSidebarCollapsed ? 'justify-center' : 'space-x-2'}`}>
              <Database size={14} className={useDatabase ? 'text-green-500' : 'text-yellow-500'} />
              {!isSidebarCollapsed && (
                <span className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                  {useDatabase ? 'Server Active' : 'Local Storage'}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full flex items-center justify-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center space-x-3"><ChevronLeft size={20} /><span className="text-[11px] font-semibold tracking-wide">Minimize</span></div>}
          </button>
        </div>
      </aside>

      {/* Mobile Top Navigation */}
      <header className="md:hidden fixed top-0 w-full bg-indigo-700 dark:bg-slate-900 text-white z-[60] px-4 py-3 flex items-center justify-between shadow-lg">
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          {isMobileMenuOpen ? <ChevronLeft size={24} /> : <Menu size={24} />}
        </button>
        <div className="font-semibold text-sm tracking-wide">Zain Abbas</div>
        <button onClick={onToggleDarkMode} className="p-2 hover:bg-white/10 rounded-lg">
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[55] animate-in fade-in duration-300">
          <div className="flex flex-col h-full p-8 pt-24 space-y-4">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  item.onClick();
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center space-x-4 p-5 rounded-2xl text-lg font-black uppercase tracking-widest transition-all ${
                  activeView === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400'
                }`}
              >
                <item.icon size={24} />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="pt-8 mt-auto border-t border-slate-800 flex justify-between">
              <button onClick={onToggleDarkMode} className="flex items-center space-x-3 text-slate-400">
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                <span className="text-xs font-semibold">Toggle Theme</span>
              </button>
              <button className="text-slate-400 flex items-center space-x-3">
                <LogOut size={20} />
                <span className="text-xs font-semibold">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div 
        className={`flex-grow flex flex-col transition-all duration-300 min-h-screen ${
          isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
        }`}
      >
        {/* Desktop Top Header Bar */}
        <header className="hidden md:flex bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 h-20 items-center px-8 sticky top-0 z-40 transition-colors duration-300">
          <div className="flex-grow">
            <h1 className="font-display text-2xl font-bold text-slate-800 dark:text-white tracking-tight">{title}</h1>
            <div className="flex items-center space-x-2 mt-0.5">
               <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[11px] font-semibold text-emerald-600/90 dark:text-emerald-400/90 tracking-wide">System Online</span>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <button 
              onClick={onToggleDarkMode}
              className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl transition-all border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>

            <div className="flex items-center space-x-4">
               <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white leading-none">Zain Abbas</p>
                  <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 tracking-wide mt-1">Super Admin</p>
               </div>
               <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 border border-gray-200 dark:border-slate-700">
                  <User size={20} />
               </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 md:p-8 pt-24 md:pt-8 flex-grow animate-in fade-in slide-in-from-bottom-2 duration-700">
          {children}
        </main>

        <footer className="bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 py-8 px-8 flex flex-col md:flex-row justify-between items-center text-slate-500 text-[11px] font-medium tracking-wide transition-colors duration-300">
          <span>&copy; {new Date().getFullYear()} New Jehlum Gold Smith Management</span>
          <div className="flex space-x-6 mt-4 md:mt-0">
             <span className="hover:text-indigo-600 cursor-pointer">Security Policy</span>
             <span className="hover:text-indigo-600 cursor-pointer">System Updates</span>
             <span className="text-slate-300 dark:text-slate-700">v2.4.0-PRM</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
