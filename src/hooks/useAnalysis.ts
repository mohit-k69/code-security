import { useState, useCallback, useEffect } from 'react';
import { analyzeCode, type AnalysisResult, type Category, type Finding } from '../analyzer';
import { supabase } from '../lib/supabase';
import { type ReviewedItem, fetchUserReviews, saveUserReview } from '../lib/reviewsService';
import { type User } from './useAuth';

export type { ReviewedItem };

export function useAnalysis(user?: User | null) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);

  const [pastedCode, setPastedCode] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());

  const [reviewedItems, setReviewedItems] = useState<ReviewedItem[]>([]);

  // Fetch reviews from Supabase when user logs in or user changes
  useEffect(() => {
    if (!user?.id) {
      setReviewedItems([]);
      return;
    }

    let isMounted = true;
    fetchUserReviews(user.id).then(items => {
      if (isMounted) {
        setReviewedItems(items);
      }
    });

    return () => {
      isMounted = false;
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

    setIsAnalyzing(true);
    setAnalysisResult(null);

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
      
      finalResult = data.report;
      setAnalysisResult(finalResult);
    } catch (err: any) {
      console.error('Analysis failed:', err);
      // Fallback to legacy analyzer if the edge function fails or isn't deployed yet
      finalResult = analyzeCode(allCode);
      setAnalysisResult(finalResult as any);
    } finally {
      setIsAnalyzing(false);
    }

    const name = uploadedFiles.length > 0
      ? uploadedFiles.map(f => f.name).join(', ')
      : 'Pasted Code';
    const displayName = name.length > 40 ? name.slice(0, 37) + '...' : name;
    const verdict = finalResult?.verdict || 'NOT_VERIFIED';
    const reviewType = uploadedFiles.length > 0 ? 'upload' : 'paste';

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
  }, [fileContents, pastedCode, uploadedFiles, user?.id]);

  const filteredFindings = Array.isArray(analysisResult?.findings) 
    ? analysisResult.findings.filter((f: any) => activeCategory === 'all' || f.category === activeCategory)
    : [];

  return {
    isAnalyzing,
    setIsAnalyzing,
    analysisResult,
    setAnalysisResult,
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
    filteredFindings
  };
}
