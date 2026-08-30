import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Search, LayoutGrid, List, RefreshCw } from 'lucide-react';

interface GithubHeaderProps {
  setActiveWorkflow: (workflow: 'none') => void;
  isSearchExpanded: boolean;
  setIsSearchExpanded: (expanded: boolean) => void;
  githubSearchQuery: string;
  setGithubSearchQuery: (query: string) => void;
  viewStyle: 'grid' | 'list';
  setViewStyle: (style: 'grid' | 'list') => void;
  onRefresh: () => void;
}

export function GithubHeader({
  setActiveWorkflow,
  isSearchExpanded,
  setIsSearchExpanded,
  githubSearchQuery,
  setGithubSearchQuery,
  viewStyle,
  setViewStyle,
  onRefresh
}: GithubHeaderProps) {
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
      setGithubSearchQuery('');
    }
  }, [isSearchExpanded, setGithubSearchQuery]);

  return (
    <div className="flex items-center justify-between mb-8 relative w-full h-10" ref={searchContainerRef}>
      <AnimatePresence>
        {!isSearchExpanded && (
          <motion.div
            key="title"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 absolute left-0 top-1/2 -translate-y-1/2"
          >
            <button onClick={() => setActiveWorkflow('none')} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-[18px] font-semibold text-gray-900">GitHub Repository</h2>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute right-0 flex items-center justify-end h-10 top-1/2 -translate-y-1/2 gap-2">
        <AnimatePresence>
          {isSearchExpanded ? (
            <motion.div
              key="search-input"
              initial={{ width: 40, opacity: 0 }}
              animate={{ width: 624, maxWidth: 'calc(100vw - 32px)', opacity: 1 }}
              exit={{ width: 40, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="relative h-full overflow-hidden rounded-full"
            >
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 z-10" />
              <input
                ref={searchInputRef}
                type="text"
                value={githubSearchQuery}
                onChange={(e) => setGithubSearchQuery(e.target.value)}
                placeholder="Search repositories..."
                className="w-full h-full bg-white border border-gray-200 rounded-full pl-11 pr-4 text-[14px] outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm"
              />
            </motion.div>
          ) : (
            <div key="actions" className="flex items-center gap-1">
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setViewStyle(viewStyle === 'grid' ? 'list' : 'grid')}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors h-10 w-10 flex items-center justify-center"
                title={`Switch to ${viewStyle === 'grid' ? 'list' : 'grid'} view`}
              >
                {viewStyle === 'grid' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
              </motion.button>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onRefresh}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors h-10 w-10 flex items-center justify-center"
                title="Refresh repositories"
              >
                <RefreshCw className="w-5 h-5" />
              </motion.button>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsSearchExpanded(true)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors h-10 w-10 flex items-center justify-center"
            >
              <Search className="w-5 h-5" />
              </motion.button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
