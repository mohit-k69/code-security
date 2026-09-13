import React from 'react';
import { User, Menu } from 'lucide-react';
import { User as UserType } from '../../hooks/useAuth';

interface HeaderProps {
  user: UserType;
  isProfileOpen: boolean;
  setIsProfileOpen: (isOpen: boolean) => void;
  openProfileModal: () => void;
  onSignOut: () => void;
  onToggleMobileSidebar?: () => void;
}

export function Header({ 
  user, 
  isProfileOpen, 
  setIsProfileOpen, 
  openProfileModal, 
  onSignOut,
  onToggleMobileSidebar
}: HeaderProps) {
  return (
    <header className="h-[60px] flex items-center justify-between md:justify-end px-4 sm:px-6 md:px-8 border-b border-gray-200 bg-white shrink-0 z-10">
      {/* Mobile Hamburger Button (Top-Left on mobile, hidden on desktop) */}
      <button 
        id="mobile-sidebar-toggle-btn"
        type="button"
        onClick={onToggleMobileSidebar}
        className="md:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
        aria-label="Open sidebar navigation menu"
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      {/* Top-Right Account / Avatar Button */}
      <div className="relative">
        <button 
          id="profile-dropdown-btn"
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="flex items-center gap-3 cursor-pointer group focus:outline-none"
          aria-label="User profile menu"
        >
          <span className="hidden md:inline text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{user.name}</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 border border-gray-200 group-hover:bg-gray-200 transition-colors text-gray-600 overflow-hidden shrink-0">
            {user.avatar ? (
              <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="h-4 w-4" />
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
