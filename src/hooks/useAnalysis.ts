import { useState, useCallback } from 'react';
import { analyzeCode, type AnalysisResult, type Category, type Finding } from '../analyzer';

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

    await new Promise(resolve => setTimeout(resolve, 1200));

    const result = analyzeCode(allCode);
    setAnalysisResult(result);
    setIsAnalyzing(false);

    const name = uploadedFiles.length > 0
      ? uploadedFiles.map(f => f.name).join(', ')
      : 'Pasted Code';
      
    setReviewedItems(prev => [{
      name: name.length > 40 ? name.slice(0, 37) + '...' : name,
      vibeScore: result.vibeScore,
      findings: result.findings.length,
      date: new Date(),
      result,
    }, ...prev]);
  }, [fileContents, pastedCode, uploadedFiles]);

  const filteredFindings = analysisResult?.findings.filter(
    f => activeCategory === 'all' || f.category === activeCategory
  ) || [];

  return {
    isAnalyzing,
    analysisResult,
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
