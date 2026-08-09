import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, X } from 'lucide-react';

interface ProfileDeleteAccountProps {
  isDeleteModalOpen: boolean;
  setIsDeleteModalOpen: (open: boolean) => void;
  isDeletingAccount: boolean;
  deleteConfirmText: string;
  setDeleteConfirmText: (text: string) => void;
  deleteError: string;
  setDeleteError: (error: string) => void;
  handleDeleteAccount: () => void;
}

export function ProfileDeleteAccount({
  isDeleteModalOpen,
  setIsDeleteModalOpen,
  isDeletingAccount,
  deleteConfirmText,
  setDeleteConfirmText,
  deleteError,
  setDeleteError,
  handleDeleteAccount
}: ProfileDeleteAccountProps) {
  return (
    <AnimatePresence>
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !isDeletingAccount && setIsDeleteModalOpen(false)}
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-red-100">
              <h3 className="text-[16px] font-semibold text-red-700 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete Account
              </h3>
              <button
                onClick={() => !isDeletingAccount && setIsDeleteModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-[13px] font-semibold text-red-700 mb-1">⚠️ This action is permanent and cannot be undone.</p>
                <p className="text-[12px] text-red-600 leading-relaxed">
                  All your data will be permanently deleted, including your profile, saved reviews, repositories, pull request history, and settings.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-gray-700">
                  Type <span className="font-bold text-red-600">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError(''); }}
                  placeholder="Type DELETE here"
                  disabled={isDeletingAccount}
                  className="w-full bg-white border border-gray-200 focus:border-red-400 rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                />
              </div>

              <AnimatePresence>
                {deleteError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-medium">
                      {deleteError}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeletingAccount}
                className="px-5 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount || deleteConfirmText !== 'DELETE'}
                className="px-6 py-2 rounded-xl text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingAccount ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
