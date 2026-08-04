import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Lock, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { User } from '../../hooks/useAuth';

interface ProfileModalProps {
  user: User;
  setUser: (user: User | null) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const getNextAvailableDate = (lastUpdateDate: string | undefined, creationDate: string | undefined, daysLimit: number) => {
  if (!lastUpdateDate) return null;
  const date = new Date(lastUpdateDate);
  date.setDate(date.getDate() + daysLimit);
  return date;
};

const isRestricted = (nextAvailableDate: Date | null) => {
  if (!nextAvailableDate) return false;
  return new Date() < nextAvailableDate;
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

export function ProfileModal({ user, setUser, isOpen, setIsOpen }: ProfileModalProps) {
  const [profileName, setProfileName] = useState(user.name || '');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  
  const [isCurrentPasswordValid, setIsCurrentPasswordValid] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [isNameEditable, setIsNameEditable] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  
  const [promptPassword, setPromptPassword] = useState('');
  const [promptError, setPromptError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const nextNameUpdate = getNextAvailableDate(user.last_name_updated_at, user.created_at, 6);
  const isNameRestricted = isRestricted(nextNameUpdate);

  const nextPasswordUpdate = user.last_password_updated_at ? getNextAvailableDate(user.last_password_updated_at, undefined, 1) : null;
  const isPasswordRestricted = isRestricted(nextPasswordUpdate);

  const handleUnlockName = async () => {
    setPromptError('');
    if (!promptPassword) return;
    setIsUnlocking(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: promptPassword,
      });
      if (error) throw error;
      setIsNameEditable(true);
      setIsPasswordPromptOpen(false);
      setPromptPassword('');
    } catch (err: any) {
      setPromptError('Incorrect password.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleVerifyPassword = async () => {
    setProfileError('');
    if (!profileCurrentPassword) return;
    setIsVerifyingPassword(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: profileCurrentPassword,
      });
      if (error) {
        setProfileError('Incorrect current password.');
        setIsCurrentPasswordValid(false);
      } else {
        setIsCurrentPasswordValid(true);
      }
    } catch (err: any) {
      setProfileError('Failed to verify password.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleUpdateProfile = async () => {
    setProfileError('');
    setProfileSuccess('');
    
    if (isCurrentPasswordValid && profileNewPassword && profileCurrentPassword) {
      if (profileNewPassword === profileCurrentPassword) {
        setProfileError('Password already used, Use different');
        return;
      }
    }

    if (profileNewPassword && profileNewPassword !== profileConfirmPassword) {
      setProfileError('Passwords do not match');
      return;
    }

    if (profileNewPassword && profileNewPassword.length < 6) {
      setProfileError('Password must be at least 6 characters');
      return;
    }

    setIsSavingProfile(true);

    try {
      const updates: any = { data: {} };
      const now = new Date().toISOString();
      if (profileName.trim() && profileName.trim() !== user.name) {
        updates.data.full_name = profileName.trim();
        updates.data.last_name_updated_at = now;
      }
      if (profileNewPassword) {
        updates.password = profileNewPassword;
        updates.data.last_password_updated_at = now;
      }

      const { data, error } = await supabase.auth.updateUser(updates);

      if (error) throw error;

      try {
        const changesMade = [];
        if (profileName.trim() && profileName.trim() !== user.name) {
          changesMade.push(`Name changed to: ${profileName.trim()}`);
        }
        if (profileNewPassword) {
          changesMade.push('Password was changed');
        }

        if (changesMade.length > 0) {
          await supabase.functions.invoke('send-profile-update-email', {
            body: { 
              email: user.email, 
              name: profileName.trim() || user.name,
              changes: changesMade,
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (emailErr) {
        console.error('Failed to send email notification:', emailErr);
      }

      setProfileName('');
      setProfileNewPassword('');
      setProfileConfirmPassword('');
      setProfileCurrentPassword('');
      setIsCurrentPasswordValid(false);
      setIsNameEditable(false);

      if (profileNewPassword) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
        setIsOpen(false);
        return;
      }

      setProfileSuccess('Profile updated successfully!');
      
      if (data.user) {
        const meta = data.user.user_metadata;
        setUser({
          name: meta?.full_name || meta?.first_name || data.user.email?.split('@')[0] || 'User',
          email: data.user.email || '',
          avatar: meta?.avatar_url,
          created_at: data.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
        });
      }

      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE exactly to confirm.');
      return;
    }

    setIsDeletingAccount(true);
    setDeleteError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setDeleteError('No active session. Please sign in again.');
        return;
      }

      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw new Error(error.message || 'Failed to securely delete account.');

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      
      setUser(null);
      setIsDeleteModalOpen(false);
      setIsOpen(false);

    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred while deleting your account.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-[440px] bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h3 className="text-[16px] font-semibold text-gray-900">My Profile</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              {profileSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 text-[13px] font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {profileSuccess}
                </div>
              )}

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

              <AnimatePresence>
                {profileError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: 'auto', marginTop: 4 }} exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-medium">
                      {profileError}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 relative z-10 flex flex-col gap-3">
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-5 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleUpdateProfile}
                  disabled={isSavingProfile}
                  className="px-6 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#3f2a24] hover:bg-[#5b443c] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSavingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              <div className="h-px w-full bg-gray-200" />
              <button
                onClick={() => {
                  setIsDeleteModalOpen(true);
                  setDeleteConfirmText('');
                  setDeleteError('');
                }}
                className="self-start text-[12px] font-medium text-red-400 hover:text-red-600 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3 h-3" /> Delete Account
              </button>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

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
    </>
  );
}
