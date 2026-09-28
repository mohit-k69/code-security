import { useState } from 'react';

export type WorkflowState = 'none' | 'upload' | 'paste' | 'github';

export function useWorkflow() {
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowState>('none');
  const [activeTab, setActiveTab] = useState('new');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterOption, setFilterOption] = useState('Alphabetically');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return {
    activeWorkflow,
    setActiveWorkflow,
    activeTab,
    setActiveTab,
    isSearchExpanded,
    setIsSearchExpanded,
    isFilterOpen,
    setIsFilterOpen,
    filterOption,
    setFilterOption,
    isProfileOpen,
    setIsProfileOpen
  };
}
