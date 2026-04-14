
import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

const DEFAULT_PASSWORD = 'admin'; // Standard password for shop owner access

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Slight delay to provide a professional, secure feedback loop
    setTimeout(() => {
      if (password === DEFAULT_PASSWORD) {
        onLogin();
      } else {
        setError(true);
        setIsLoading(false);
        setPassword('');
        inputRef.current?.focus();
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans text-slate-100">
      {/* Premium background decorations */}
      <div className="absolute top-[-15%] right-[-15%] w-[500px] h-[500px] bg-indigo-800 rounded-full blur-[120px] opacity-30 animate-pulse"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-yellow-600 rounded-full blur-[100px] opacity-10"></div>
      
      <div className="max-w-md w-full relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 dark:border-slate-800">
          <div className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 p-10 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)] pointer-events-none"></div>
            <div className="w-24 h-24 bg-yellow-400 rounded-[2rem] flex items-center justify-center text-indigo-900 font-bold text-5xl mx-auto shadow-2xl rotate-3 mb-6 relative z-10 border-4 border-white/90">
              H
            </div>
            <h1 className="font-display text-4xl font-semibold text-white tracking-tight relative z-10">New Jehlum Gold Smith</h1>
            <div className="mt-3 inline-block px-3 py-1.5 bg-white/10 rounded-full border border-white/15 relative z-10 backdrop-blur">
              <p className="text-indigo-100 text-xs font-medium tracking-wide">Enterprise Ledger v2.0</p>
            </div>
          </div>

          <div className="p-10 pt-12">
            <div className="mb-10 text-center">
              <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold tracking-wide mb-4">
                <ShieldCheck size={14} className="text-indigo-500" />
                <span>Encrypted Entry Point</span>
              </div>
              <h2 className="font-display text-3xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight">System Access</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">Please enter your master password to continue.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="relative group">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide mb-2 ml-1">Administrator Pin</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-300 group-focus-within:text-indigo-600 transition-colors">
                      <Lock size={20} />
                    </div>
                    <input
                      ref={inputRef}
                      type="password"
                      required
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className={`block w-full pl-14 pr-4 py-5 bg-slate-50 dark:bg-slate-800 border-2 rounded-2xl text-xl font-semibold tracking-[0.25em] focus:outline-none transition-all placeholder:tracking-normal placeholder:font-medium text-slate-900 dark:text-slate-100 ${
                        error 
                          ? 'border-rose-100 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100 focus:border-rose-300' 
                          : 'border-slate-200 dark:border-slate-700 focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-950/30'
                      }`}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(false);
                      }}
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center space-x-3 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 rounded-2xl border border-rose-100 dark:border-rose-900 animate-in slide-in-from-top-2">
                  <AlertCircle size={20} className="shrink-0" />
                  <span className="text-sm font-medium leading-tight">Access denied: the password you entered is incorrect.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full bg-indigo-900 hover:bg-black dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white py-5 rounded-2xl font-semibold text-sm tracking-wide shadow-2xl shadow-indigo-200 flex items-center justify-center space-x-4 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Unlock Dashboard</span>
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-gray-50 dark:bg-slate-950/60 p-8 text-center border-t border-gray-100 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-400 tracking-wide">
              New Jehlum Gold Smith &copy; {new Date().getFullYear()} Official Shop Utility
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
