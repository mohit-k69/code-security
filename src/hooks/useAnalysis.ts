import { useState, useCallback, useEffect } from 'react';
import { analyzeCode, type AnalysisResult, type Category, type Finding } from '../analyzer';
import { supabase } from '../lib/supabase';
import { type ReviewedItem, fetchUserReviews, saveUserReview, FREE_REVIEW_LIMIT, isFreeLimitReached } from '../lib/reviewsService';
import { type User } from './useAuth';
import { trackEvent } from '../lib/posthog';

export type { ReviewedItem };
export { FREE_REVIEW_LIMIT };

export function useAnalysis(user?: User | null) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);

  const [pastedCode, setPastedCode] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());

  const [reviewedItems, setReviewedItems] = useState<ReviewedItem[]>([]);

  // Fetch reviews from Supabase when user logs in, session initializes, or user changes
  useEffect(() => {
    if (!user?.id) {
      setReviewedItems([]);
      return;
    }

    let isMounted = true;
    const currentUserId = user.id;

    const loadReviews = async (targetUserId: string) => {
      try {
        const items = await fetchUserReviews(targetUserId);
        if (isMounted) {
          setReviewedItems(items);
        }
      } catch (err) {
        console.error('Error fetching user reviews:', err);
      }
    };

    loadReviews(currentUserId);

    // Subscribe to auth state changes to reload reviews on sign-in / session restore
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        setReviewedItems([]);
      } else if (session?.user?.id === currentUserId) {
        loadReviews(session.user.id);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const handleFileUpload = useCallback((files: File[]) => {
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    const validFiles = files.filter(file => {
      if (file.size > MAX_SIZE) {
        alert(`File ${file.name} is too large (>${MAX_SIZE / 1024 / 1024}MB).`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setUploadedFiles(prev => [...prev, ...validFiles]);
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFileContents(prev => {
          const next = new Map(prev);
          next.set(file.name, content);
          return next;
        });
      };
      reader.readAsText(file);
    });
  }, []);

  const handleCheckVibe = useCallback(async () => {
    let allCode = '';

    fileContents.forEach((content, name) => {
      allCode += `// ─── File: ${name} ───\n${content}\n\n`;
    });

    if (pastedCode.trim()) {
      allCode += `// ─── Pasted Code ───\n${pastedCode}\n\n`;
    }

    if (!allCode.trim()) return;

    if (reviewedItems.length >= FREE_REVIEW_LIMIT) {
      console.warn(`[LIMIT] Free review limit reached (${reviewedItems.length}/${FREE_REVIEW_LIMIT}). Scan cannot start.`);
      trackEvent('free_limit_reached', { review_type: 'paste', total_reviews: reviewedItems.length });
      return;
    }

    const reviewType: 'upload' | 'paste' = uploadedFiles.length > 0 ? 'upload' : 'paste';
    trackEvent('analysis_started', { review_type: reviewType });

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisError(null);

    const getFindingCount = (res: any): number => {
      if (!res) return 0;
      if (Array.isArray(res.findings)) return res.findings.length;
      if (res.findings && typeof res.findings === 'object') {
        return (
          (res.findings.critical?.length || 0) +
          (res.findings.warning?.length || 0) +
          (res.findings.info?.length || 0)
        );
      }
      return typeof res.totalFindings === 'number' ? res.totalFindings : 0;
    };

    let finalResult: any;

    try {
      const { data, error } = await supabase.functions.invoke('analyze-snippet', {
        body: {
          files: [
            ...Array.from(fileContents.entries()).map(([name, content]) => ({ name, content })),
            ...(pastedCode.trim() ? [{ name: 'snippet.js', content: pastedCode }] : [])
          ]
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      finalResult = data.report;
      if (finalResult && reviewType === 'paste') {
        const count = getFindingCount(finalResult);
        finalResult = {
          ...finalResult,
          reviewType: 'paste',
          verdict: count === 0 ? 'PASS' : 'FAIL',
        };
      }
      setAnalysisResult(finalResult);
    } catch (err: any) {
      console.error('Analysis failed:', err);
      try {
        // Fallback to legacy analyzer if the edge function fails or isn't deployed yet
        finalResult = analyzeCode(allCode);
        if (finalResult && reviewType === 'paste') {
          const count = getFindingCount(finalResult);
          finalResult = {
            ...finalResult,
            reviewType: 'paste',
            verdict: count === 0 ? 'PASS' : 'FAIL',
          };
        }
        setAnalysisResult(finalResult as any);
      } catch (fallbackErr: any) {
        trackEvent('analysis_failed', { review_type: reviewType });
        setAnalysisError(err?.message || fallbackErr?.message || 'Security analysis encountered an error. Please try again.');
        setAnalysisResult(null);
      }
    } finally {
      setIsAnalyzing(false);
    }

    if (!finalResult) {
      return;
    }

    if (finalResult) {
      const findingCount = Array.isArray(finalResult.findings) ? finalResult.findings.length : 0;
      trackEvent('analysis_completed', {
        review_type: reviewType,
        verdict: finalResult.verdict || 'NOT_VERIFIED',
        finding_count: findingCount,
      });
    }

    const name = uploadedFiles.length > 0
      ? uploadedFiles.map(f => f.name).join(', ')
      : 'Pasted Code';
    const displayName = name.length > 40 ? name.slice(0, 37) + '...' : name;
    const verdict = finalResult?.verdict || 'NOT_VERIFIED';

    const localItem: ReviewedItem = {
      name: displayName,
      verdict,
      pr: null,
      date: new Date(),
      result: finalResult,
      reviewType
    };

    // Optimistically update local state
    setReviewedItems(prev => [localItem, ...prev]);

    // Persist to Supabase if authenticated
    if (user?.id) {
      saveUserReview({
        userId: user.id,
        name: displayName,
        reviewType,
        verdict,
        report: finalResult
      }).then(savedItem => {
        if (savedItem?.id) {
          setReviewedItems(prev => [
            savedItem,
            ...prev.filter(item => item !== localItem)
          ]);
        }
      }).catch(err => {
        console.error('Failed to persist review:', err);
      });
    }
  }, [fileContents, pastedCode, uploadedFiles, user?.id, reviewedItems.length]);

  const filteredFindings = Array.isArray(analysisResult?.findings) 
    ? analysisResult.findings.filter((f: any) => activeCategory === 'all' || f.category === activeCategory)
    : [];

  const isLimitReached = isFreeLimitReached(reviewedItems.length);
  const remainingFreeReviews = Math.max(0, FREE_REVIEW_LIMIT - reviewedItems.length);

  return {
    isAnalyzing,
    setIsAnalyzing,
    analysisResult,
    setAnalysisResult,
    analysisError,
    setAnalysisError,
    activeCategory,
    setActiveCategory,
    expandedFinding,
    setExpandedFinding,
    pastedCode,
    setPastedCode,
    uploadedFiles,
    setUploadedFiles,
    fileContents,
    setFileContents,
    reviewedItems,
    setReviewedItems,
    handleFileUpload,
    handleCheckVibe,
    filteredFindings,
    isLimitReached,
    freeReviewsLimit: FREE_REVIEW_LIMIT,
    remainingFreeReviews
  };
}
