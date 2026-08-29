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


  const handleGithubAnalysisComplete = useCallback((repoName: string, prNumber: number, payload: any) => {
    const rawReport = payload?.report || payload?.metadata || payload;
    const severityCount = { critical: 0, warning: 0, info: 0 };
    
    // Extract raw findings list from various possible structures
    let rawFindings: any[] = [];
    if (Array.isArray(rawReport?.findings)) {
      rawFindings = rawReport.findings;
    } else if (rawReport?.findings && typeof rawReport.findings === 'object') {
      // Format { critical: [...], warning: [...], info: [...] }
      const { critical = [], warning = [], info = [] } = rawReport.findings;
      rawFindings = [
        ...critical.map((f: any) => ({ ...f, severity: 'critical' })),
        ...warning.map((f: any) => ({ ...f, severity: 'warning' })),
        ...info.map((f: any) => ({ ...f, severity: 'info' }))
      ];
    } else if (Array.isArray(rawReport?.checkpoints)) {
      for (const cp of rawReport.checkpoints) {
        if (Array.isArray(cp.findings)) {
          rawFindings.push(...cp.findings);
        }
      }
    }

    const findings = rawFindings.map((f: any) => {
      const severity: 'critical' | 'warning' | 'info' = (f.severity === 'critical' || f.severity === 'warning' || f.severity === 'info')
        ? f.severity
        : 'info';
      
      severityCount[severity] = (severityCount[severity] || 0) + 1;
      
      const snippet = f.evidence?.[0]?.snippet || f.snippet || '';
      const line = f.evidence?.[0]?.line || f.line || 1;
      const file = f.evidence?.[0]?.file || f.file;
      const explanation = f.evidence?.[0]?.explanation || f.description || '';
      
      let suggestionText = f.suggestion || f.title || 'Review code implementation.';
      if (file) {
        suggestionText = `[${file}:${line}] ${suggestionText}`;
      }
      if (explanation && !suggestionText.includes(explanation)) {
        suggestionText += `\n\n${explanation}`;
      }

      return {
        severity,
        category: (f.category as any) || 'security',
        message: f.title || f.message || 'Security Finding',
        line: line,
        rule: f.criterionId || f.rule || 'SEC-CHECK',
        suggestion: suggestionText,
        snippet: snippet
      };
    });

    let vibeScore = 100;
    vibeScore -= severityCount.critical * 20;
    vibeScore -= severityCount.warning * 8;
    vibeScore -= severityCount.info * 3;
    vibeScore = Math.max(0, Math.min(100, vibeScore));

    const verdict = rawReport?.verdict || (findings.length === 0 ? 'PASS' : severityCount.critical > 0 ? 'FAIL' : 'PASS');

    const result = {
      vibeScore,
      findings,
      summary: severityCount,
      categoryCounts: {
        security: findings.filter(f => f.category === 'security').length || findings.length,
        quality: findings.filter(f => f.category === 'quality').length,
        bestPractices: findings.filter(f => f.category === 'bestPractices').length,
        performance: findings.filter(f => f.category === 'performance').length,
        style: 0
      },
      totalLines: rawReport?.metadata?.totalChars ? Math.round(rawReport.metadata.totalChars / 40) : 0,
      analyzedAt: new Date(),
      verdict
    };

    setAnalysisResult(result);
    setReviewedItems(prev => [{
      name: prNumber > 0 ? `${repoName} (#${prNumber})` : `${repoName} (main)`,
      vibeScore,
      findings: findings.length,
      date: new Date(),
      result
    }, ...prev]);
  }, []);

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
    handleGithubAnalysisComplete,
    filteredFindings
  };
}
