import React from 'react';
import { User, Menu, ArrowLeft, Key, X } from 'lucide-react';
import { User as UserType } from '../../hooks/useAuth';

interface HeaderProps {
  user: UserType;
  isProfileOpen: boolean;
  setIsProfileOpen: (isOpen: boolean) => void;
  openProfileModal: () => void;
  onSignOut: () => void;
  showRecoveryPrompt?: boolean;
  onDismissRecoveryPrompt?: () => void;
  onToggleMobileSidebar?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
}

export function Header({ 
  user, 
  isProfileOpen, 
  setIsProfileOpen, 
  openProfileModal, 
  onSignOut,
  showRecoveryPrompt = false,
  onDismissRecoveryPrompt,
  onToggleMobileSidebar,
  showBackButton = false,
  onBack
}: HeaderProps) {
  return (
    <header className="h-[60px] flex items-center justify-between md:justify-end px-4 sm:px-6 md:px-8 border-b border-gray-200 bg-white shrink-0 z-10">
      {/* Mobile Navigation Slot: Back Button when in sub-workflow (Paste / GitHub), Hamburger on root */}
      {showBackButton ? (
        <button 
          id="mobile-header-back-btn"
          type="button"
          onClick={onBack}
          className="md:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
          aria-label="Back to home"
          title="Back to home"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
      ) : (
        <button 
          id="mobile-sidebar-toggle-btn"
          type="button"
          onClick={onToggleMobileSidebar}
          className="md:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
          aria-label="Open sidebar navigation menu"
        >
          <Menu className="w-5 h-5 text-gray-700" />
        </button>
      )}

      {/* Top-Right Account / Avatar Button */}
      <div className="relative">
        {showRecoveryPrompt && !isProfileOpen && (
          <div
            role="status"
            aria-live="polite"
            className="absolute right-0 top-[46px] w-[280px] bg-white border border-gray-200 rounded-2xl shadow-xl z-40 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Key className="w-4 h-4 text-amber-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">
                  Protect your account
                </div>
                <p className="text-[12px] text-gray-500 leading-relaxed mt-1">
                  Set up recovery codes so you can regain access if you forget your password.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    onDismissRecoveryPrompt?.();
                    openProfileModal();
                  }}
                  className="mt-3 text-[12px] font-semibold text-[#3f2a24] hover:text-[#2c1d19] transition-colors cursor-pointer"
                >
                  Set up recovery codes →
                </button>
              </div>

              <button
                type="button"
                onClick={() => onDismissRecoveryPrompt?.()}
                aria-label="Dismiss recovery code reminder"
                className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <button 
          id="profile-dropdown-btn"
          onClick={() => {
            if (showRecoveryPrompt) {
              onDismissRecoveryPrompt?.();
            }
            setIsProfileOpen(!isProfileOpen);
          }}
          className="flex items-center gap-3 cursor-pointer group focus:outline-none"
          aria-label="User profile menu"
        >
          <span className="hidden md:inline text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{user.name}</span>
          <div className="flex w-[35px] h-[35px] md:w-8 md:h-8 items-center justify-center rounded-full bg-gray-100 border border-gray-200 group-hover:bg-gray-200 transition-colors text-gray-600 overflow-hidden shrink-0">
            {user.avatar ? (
              <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-[18px] h-[18px] md:w-4 md:h-4" />
            )}
          </div>
        </button>
        {isProfileOpen && (
          <div className="absolute top-full right-0 mt-3 w-40 bg-white border border-gray-200 rounded-xl overflow-hidden z-30 shadow-lg flex flex-col">
            <button 
              id="profile-modal-btn"
              onClick={openProfileModal}
              className="w-full text-left px-4 py-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors border-b border-gray-100"
            >
              My Profile
            </button>
            <button 
              id="sign-out-btn"
              onClick={onSignOut}
              className="w-full text-left px-4 py-3 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
