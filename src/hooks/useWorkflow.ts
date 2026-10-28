import { useState } from 'react';

export type WorkflowState = 'none' | 'upload' | 'paste' | 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'sync';

function getInitialWorkflow(): WorkflowState {
  if (typeof window === 'undefined') return 'none';
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const wf = (urlParams.get('workflow') || hashParams.get('workflow'))?.toLowerCase();
    if (wf === 'github' || wf === 'gitlab' || wf === 'bitbucket' || wf === 'sync') {
      return wf;
    }
  } catch {}
  return 'none';
}

export function useWorkflow() {
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowState>(getInitialWorkflow);
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
