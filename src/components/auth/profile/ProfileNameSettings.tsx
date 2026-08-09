import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Edit2 } from 'lucide-react';
import { User } from '../../../hooks/useAuth';

interface ProfileNameSettingsProps {
  user: User;
  profileName: string;
  setProfileName: (name: string) => void;
  isNameEditable: boolean;
  setIsNameEditable: (editable: boolean) => void;
  isNameRestricted: boolean;
  nextNameUpdate: Date | null;
  formatDate: (date: Date) => string;
  isPasswordPromptOpen: boolean;
  setIsPasswordPromptOpen: (open: boolean) => void;
  promptPassword: string;
  setPromptPassword: (password: string) => void;
  promptError: string;
  setPromptError: (error: string) => void;
  handleUnlockName: () => void;
  isUnlocking: boolean;
}

export function ProfileNameSettings({
  user,
  profileName,
  setProfileName,
  isNameEditable,
  isNameRestricted,
  nextNameUpdate,
  formatDate,
  isPasswordPromptOpen,
  setIsPasswordPromptOpen,
  promptPassword,
  setPromptPassword,
  promptError,
  setPromptError,
  handleUnlockName,
  isUnlocking
}: ProfileNameSettingsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-gray-700">Email Address (Read Only)</label>
        <input
          type="email"
          value={user.email}
          disabled
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] text-gray-500 cursor-not-allowed outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[12px] font-semibold text-gray-700">Full Name</label>
          {isNameRestricted ? (
            <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Available {nextNameUpdate ? formatDate(nextNameUpdate) : ''}
            </span>
          ) : !isNameEditable && (
            <button
              onClick={() => setIsPasswordPromptOpen(true)}
              className="text-[12px] font-medium text-[#3f2a24] hover:text-[#2c1d19] transition-colors flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
        <input
          type="text"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Your Name"
          disabled={!isNameEditable}
          className={`w-full border rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors ${!isNameEditable ? 'bg-gray-50 border-gray-100 cursor-not-allowed opacity-80' : 'bg-white border-gray-200 focus:border-[#3f2a24]'}`}
        />
      </div>

      <AnimatePresence>
        {isPasswordPromptOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-white/95 backdrop-blur-sm rounded-2xl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
              className="w-full bg-white rounded-xl shadow-xl border border-gray-100 p-5 flex flex-col gap-3"
            >
              <h4 className="text-[14px] font-semibold text-gray-900">Unlock Editing</h4>
              <p className="text-[12px] text-gray-500">Please enter your current password to edit your profile details.</p>
              
              <div className="flex flex-col gap-1 mt-1">
                <input
                  type="password"
                  value={promptPassword}
                  onChange={(e) => { setPromptPassword(e.target.value); setPromptError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlockName()}
                  placeholder="Current password"
                  className="w-full bg-white border border-gray-200 focus:border-[#3f2a24] rounded-lg px-3 py-2 text-[13px] text-gray-900 outline-none"
                />
                {promptError && <span className="text-[11px] text-red-500 font-medium ml-1">{promptError}</span>}
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  onClick={() => { setIsPasswordPromptOpen(false); setPromptPassword(''); setPromptError(''); }}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnlockName}
                  disabled={isUnlocking || !promptPassword}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-[#3f2a24] hover:bg-[#2c1d19] transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {isUnlocking ? 'Unlocking...' : 'Unlock'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
