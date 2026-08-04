import React from 'react';
import { User } from 'lucide-react';
import { User as UserType } from '../../hooks/useAuth';

interface HeaderProps {
  user: UserType;
  isProfileOpen: boolean;
  setIsProfileOpen: (isOpen: boolean) => void;
  openProfileModal: () => void;
  onSignOut: () => void;
}

export function Header({ user, isProfileOpen, setIsProfileOpen, openProfileModal, onSignOut }: HeaderProps) {
  return (
    <div className="h-[60px] flex items-center justify-end px-8 border-b border-gray-200 bg-white">
      <div className="relative">
        <button 
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="flex items-center gap-3 cursor-pointer group focus:outline-none"
        >
          <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{user.name}</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 border border-gray-200 group-hover:bg-gray-200 transition-colors text-gray-600 overflow-hidden">
            {user.avatar ? (
              <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="h-4 w-4" />
            )}
          </div>
        </button>
        {isProfileOpen && (
          <div className="absolute top-full right-0 mt-3 w-40 bg-white border border-gray-200 rounded-xl overflow-hidden z-20 shadow-lg flex flex-col">
            <button 
              onClick={openProfileModal}
              className="w-full text-left px-4 py-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors border-b border-gray-100"
            >
              My Profile
            </button>
            <button 
              onClick={onSignOut}
              className="w-full text-left px-4 py-3 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
