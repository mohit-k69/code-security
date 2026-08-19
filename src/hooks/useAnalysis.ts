import { useState, useCallback } from 'react';
import { analyzeCode, type AnalysisResult, type Category, type Finding } from '../analyzer';
import { supabase } from '../lib/supabase';

export interface ReviewedItem {
  name: string;
  vibeScore: number;
  findings: number;
  date: Date;
  result: AnalysisResult;
}

export function useAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);

  const [pastedCode, setPastedCode] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());

  const [reviewedItems, setReviewedItems] = useState<ReviewedItem[]>([]);

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
      
    setReviewedItems(prev => [{
      name: name.length > 40 ? name.slice(0, 37) + '...' : name,
      vibeScore: finalResult.verdict ? (finalResult.verdict === 'PASS' ? 100 : (finalResult.verdict === 'NOT_VERIFIED' ? 50 : 0)) : (finalResult.vibeScore || 0),
      findings: finalResult.verdict ? (finalResult.totalFindings || 0) : (finalResult.findings?.length || 0),
      date: new Date(),
      result: finalResult,
    }, ...prev]);
  }, [fileContents, pastedCode, uploadedFiles]);

  const filteredFindings = Array.isArray(analysisResult?.findings) 
    ? analysisResult.findings.filter((f: any) => activeCategory === 'all' || f.category === activeCategory)
    : [];

  return {
    isAnalyzing,
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
