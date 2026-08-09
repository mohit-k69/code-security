import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, CheckCircle2 } from 'lucide-react';

interface ProfileSecuritySettingsProps {
  isPasswordRestricted: boolean;
  nextPasswordUpdate: Date | null;
  formatDate: (date: Date) => string;
  isCurrentPasswordValid: boolean;
  profileCurrentPassword: string;
  setProfileCurrentPassword: (password: string) => void;
  setProfileError: (error: string) => void;
  handleVerifyPassword: () => void;
  isVerifyingPassword: boolean;
  profileNewPassword: string;
  setProfileNewPassword: (password: string) => void;
  profileConfirmPassword: string;
  setProfileConfirmPassword: (password: string) => void;
}

export function ProfileSecuritySettings({
  isPasswordRestricted,
  nextPasswordUpdate,
  formatDate,
  isCurrentPasswordValid,
  profileCurrentPassword,
  setProfileCurrentPassword,
  setProfileError,
  handleVerifyPassword,
  isVerifyingPassword,
  profileNewPassword,
  setProfileNewPassword,
  profileConfirmPassword,
  setProfileConfirmPassword
}: ProfileSecuritySettingsProps) {
  return (
    <>
      <div className="h-px w-full bg-gray-100 my-2" />
      <div className="text-[14px] font-semibold text-gray-900 mb-1">Change Password</div>

      {isPasswordRestricted ? (
        <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl">
          <Lock className="w-4 h-4 text-gray-400" />
          <span className="text-[12px] font-medium text-gray-500">
            Password can be changed again on {nextPasswordUpdate ? formatDate(nextPasswordUpdate) : ''}
          </span>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {!isCurrentPasswordValid ? (
            <motion.div
              key="verify"
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}
              className="flex flex-col gap-1.5"
            >
              <label className="text-[12px] font-semibold text-gray-700">Current Password</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={profileCurrentPassword}
                  onChange={(e) => {
                    setProfileCurrentPassword(e.target.value);
                    setProfileError('');
                  }}
                  placeholder="Enter current password to change"
                  className="flex-1 bg-white border border-gray-200 focus:border-[#3f2a24] rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                />
                <button
                  onClick={handleVerifyPassword}
                  disabled={isVerifyingPassword || !profileCurrentPassword}
                  className="px-4 py-1 h-[36px] self-center rounded-full text-[12px] font-semibold text-white bg-[#3f2a24] hover:bg-[#2c1d19] transition-colors disabled:opacity-50 shrink-0"
                >
                  {isVerifyingPassword ? '...' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="new-password"
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}
              className="flex flex-col gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Current password verified
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-gray-700">New Password</label>
                <input
                  type="password"
                  value={profileNewPassword}
                  onChange={(e) => setProfileNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full bg-white border border-gray-200 focus:border-[#3f2a24] rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-gray-700">Confirm New Password</label>
                <input
                  type="password"
                  value={profileConfirmPassword}
                  onChange={(e) => setProfileConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-white border border-gray-200 focus:border-[#3f2a24] rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
