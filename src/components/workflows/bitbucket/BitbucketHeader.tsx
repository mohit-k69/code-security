import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Search, RefreshCw, LayoutGrid, List } from 'lucide-react';

interface BitbucketHeaderProps {
  onBack: () => void;
  isSearchExpanded: boolean;
  setIsSearchExpanded: (expanded: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
  title?: string;
  subtitle?: string;
  viewStyle: 'grid' | 'list';
  setViewStyle: (style: 'grid' | 'list') => void;
  showSearch?: boolean;
  disconnectBitbucket?: () => void;
  isDisconnecting?: boolean;
  isBitbucketConnected?: boolean;
  bitbucketUsername?: string | null;
}

export function BitbucketHeader({
  onBack,
  isSearchExpanded,
  setIsSearchExpanded,
  searchQuery,
  setSearchQuery,
  onRefresh,
  isFetching,
  title = 'Bitbucket Repositories',
  subtitle,
  viewStyle,
  setViewStyle,
  showSearch = true,
  disconnectBitbucket,
  isDisconnecting = false,
  isBitbucketConnected = false,
  bitbucketUsername,
}: BitbucketHeaderProps) {
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsSearchExpanded]);

  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    } else if (!isSearchExpanded) {
      setSearchQuery('');
    }
  }, [isSearchExpanded, setSearchQuery]);

  return (
    <div className="flex items-center justify-between mb-6 relative w-full h-10" ref={searchContainerRef}>
      <AnimatePresence>
        {!isSearchExpanded && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3"
          >
            <button
              id="bitbucket-back-btn"
              type="button"
              onClick={onBack}
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
              aria-label="Back"
              title="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 tracking-tight">{title}</h2>
              {bitbucketUsername ? (
                <p className="text-xs text-gray-500">Connected as <span className="font-medium">@{bitbucketUsername}</span></p>
              ) : (
                subtitle && <p className="text-xs text-gray-500">{subtitle}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1.5 ml-auto">
        {showSearch && (
          <div className="relative flex items-center">
            {isSearchExpanded ? (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '100%', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative flex items-center"
              >
                <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 sm:w-64 pl-9 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all placeholder:text-gray-400"
                />
              </motion.div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSearchExpanded(true)}
                className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                aria-label="Search"
                title="Search"
              >
                <Search className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        )}

        {isBitbucketConnected && disconnectBitbucket && (
          <button
            type="button"
            onClick={disconnectBitbucket}
            disabled={isDisconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 text-[13px] font-medium transition-colors shadow-xs h-9 disabled:opacity-50"
            title="Disconnect Bitbucket"
          >
            <span className="hidden sm:inline">{isDisconnecting ? 'Disconnecting...' : 'Disconnect'}</span>
            <span className="sm:hidden">{isDisconnecting ? '...' : 'Disconnect'}</span>
          </button>
        )}

        <div className="hidden sm:flex items-center bg-gray-100 p-0.5 rounded-xl">
          <button
            type="button"
            onClick={() => setViewStyle('grid')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              viewStyle === 'grid' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-400 hover:text-gray-700'
            }`}
            aria-label="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewStyle('list')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              viewStyle === 'list' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-400 hover:text-gray-700'
            }`}
            aria-label="List View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={`w-4.5 h-4.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
