import React, { useState } from 'react';
import { Lock, ShieldCheck, ArrowRight, Landmark } from 'lucide-react';

interface AuthPortalProps {
  onLogin: (username: string, password: string) => Promise<void>;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ onLogin }) => {
  const [stage, setStage] = useState<'landing' | 'login'>('landing');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[450px] h-[450px] bg-indigo-800 rounded-full blur-[120px] opacity-35" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[420px] h-[420px] bg-amber-500 rounded-full blur-[130px] opacity-10" />

      <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-white/20 dark:border-slate-800 overflow-hidden relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="px-8 py-10 bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white">
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-5 border border-white/20">
            <Landmark size={28} />
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Goldsmith Ledger</h1>
          <p className="text-indigo-100/90 text-sm mt-2 font-medium">Secure, user-isolated records and reporting.</p>
        </div>

        {stage === 'landing' ? (
          <div className="p-8 md:p-10">
            <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/70 dark:bg-indigo-950/25 px-4 py-3 inline-flex items-center gap-2 text-indigo-700 dark:text-indigo-300 text-sm font-semibold">
              <ShieldCheck size={16} />
              Enterprise Authentication Enabled
            </div>

            <p className="text-slate-600 dark:text-slate-300 mt-6 text-base leading-relaxed">
              Continue to sign in and access your own workspace. Each account has separate customers, transactions, and bank data.
            </p>

            <button
              onClick={() => setStage('login')}
              className="mt-8 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-200/60 transition-all"
            >
              Continue To Login
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-8 md:p-10 space-y-5">
            <h2 className="font-display text-3xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight">Sign In</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2">Use your database-provisioned account.</p>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 tracking-wide">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 tracking-wide">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter password"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStage('landing')}
                className="sm:w-auto w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="sm:flex-1 w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all disabled:opacity-70"
              >
                {isLoading ? 'Signing In...' : 'Login'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
