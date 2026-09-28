import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Plus, X, ArrowRight, ShieldCheck, ArrowLeftRight } from 'lucide-react';
import {
  type RememberedAccount,
  getRememberedAccounts,
  removeRememberedAccount
} from '../../lib/accountSwitcher';

interface AccountSwitcherModalProps {
  onSelectAccount: (email: string) => void;
  onUseAnotherAccount: () => void;
  onCancel?: () => void;
  error?: string | null;
}

export function AccountSwitcherModal({
  onSelectAccount,
  onUseAnotherAccount,
  onCancel,
  error
}: AccountSwitcherModalProps) {
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);

  useEffect(() => {
    setAccounts(getRememberedAccounts());
  }, []);

  const handleRemove = (e: React.MouseEvent, email: string) => {
    e.stopPropagation();
    removeRememberedAccount(email);
    setAccounts(getRememberedAccounts());
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-white rounded-3xl border border-gray-200/80 shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-gray-100 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#3f2a24] text-white flex items-center justify-center shadow-xs mb-3.5">
            <ArrowLeftRight className="w-6 h-6 stroke-[2]" />
          </div>
          <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">
            Switch account
          </h2>
          <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
            You're signed out of your previous account. Choose an account to continue or sign in with another.
          </p>

          {error && (
            <div className="mt-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium w-full text-center">
              {error}
            </div>
          )}
        </div>

        {/* Account List */}
        <div className="p-5 sm:p-6 space-y-2.5">
          {accounts.length > 0 && (
            <div className="space-y-1.5 mb-4">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Previously used accounts
              </span>
              <div className="space-y-2 mt-2">
                {accounts.map((acc) => (
                  <div
                    key={acc.email}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectAccount(acc.email)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectAccount(acc.email);
                      }
                    }}
                    className="w-full p-3.5 rounded-2xl border border-gray-200 hover:border-[#3f2a24]/40 hover:bg-[#faf6f4] transition-all flex items-center justify-between group cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#3f2a24]/20"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[#3f2a24] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden shadow-xs">
                        {acc.avatar ? (
                          <img
                            src={acc.avatar}
                            alt={acc.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          (acc.name || acc.email).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-gray-900 truncate group-hover:text-[#3f2a24] transition-colors">
                          {acc.name}
                        </div>
                        <div className="text-[12px] text-gray-500 truncate font-mono">
                          {acc.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={(e) => handleRemove(e, acc.email)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                        title="Remove from device list"
                        aria-label={`Remove ${acc.email} from this device`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#3f2a24] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Use Another Account Button */}
          <button
            type="button"
            id="use-another-account-btn"
            onClick={onUseAnotherAccount}
            className="w-full p-3.5 rounded-2xl border border-dashed border-gray-300 hover:border-[#3f2a24] hover:bg-gray-50 transition-all flex items-center gap-3.5 text-left cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-[#3f2a24] group-hover:text-white text-gray-600 flex items-center justify-center transition-colors shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-gray-900 group-hover:text-[#3f2a24] transition-colors">
                Use another account
              </div>
              <div className="text-[12px] text-gray-500">
                Sign in with email, Google, or GitHub
              </div>
            </div>
          </button>
        </div>

        {/* Footer Security Notice */}
        <div className="px-6 py-4 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Session terminated before new authentication</span>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-800 font-medium cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
