import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ChevronDown, Bug, Shield, Gauge, Sparkles, AlertTriangle, Info, XCircle } from 'lucide-react';
import { AnalysisResult, Category, Finding } from '../../analyzer';

interface AnalysisDashboardProps {
  isAnalyzing: boolean;
  analysisResult: AnalysisResult | null;
  activeCategory: Category | 'all';
  setActiveCategory: (category: Category | 'all') => void;
  expandedFinding: number | null;
  setExpandedFinding: (id: number | null) => void;
  filteredFindings: Finding[];
}

// Helper: severity badge color
const severityColor = (severity: Finding['severity']) => {
  if (severity === 'critical') return 'bg-red-50 text-red-700 border-red-200';
  if (severity === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

// Helper: severity icon
const SeverityIcon = ({ severity }: { severity: Finding['severity'] }) => {
  if (severity === 'critical') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (severity === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
};

// Helper: category icon
const CategoryIcon = ({ category }: { category: Category }) => {
  const cls = "w-3.5 h-3.5";
  if (category === 'security') return <Shield className={cls} />;
  if (category === 'performance') return <Gauge className={cls} />;
  if (category === 'bestPractices') return <Sparkles className={cls} />;
  return <Bug className={cls} />;
};

export function AnalysisDashboard({
  isAnalyzing,
  analysisResult,
  activeCategory,
  setActiveCategory,
  expandedFinding,
  setExpandedFinding,
  filteredFindings
}: AnalysisDashboardProps) {
  return (
    <div className="w-[350px] lg:w-[400px] xl:w-[450px] bg-white flex flex-col h-full shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
      <div className="h-[60px] flex items-center px-6 border-b border-gray-100">
        <h2 className="text-[15px] font-semibold text-gray-900">Analysis Results</h2>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {!isAnalyzing && !analysisResult ? (
          <div className="flex flex-col items-start text-left w-full max-w-[280px] h-full justify-center mx-auto">
            <p className="text-[14px] text-gray-500 mb-8">Your review will appear here.</p>
            
            <p className="text-[13px] font-semibold text-gray-900 mb-4">We'll check:</p>
            <ul className="flex flex-col gap-3.5">
              <li className="flex items-center gap-3 text-[13px] text-gray-600"><CheckCircle2 className="w-4 h-4 text-[#3f2a24]" /> Bugs & Logic</li>
              <li className="flex items-center gap-3 text-[13px] text-gray-600"><CheckCircle2 className="w-4 h-4 text-[#3f2a24]" /> Security</li>
              <li className="flex items-center gap-3 text-[13px] text-gray-600"><CheckCircle2 className="w-4 h-4 text-[#3f2a24]" /> Production Readiness</li>
              <li className="flex items-center gap-3 text-[13px] text-gray-600"><CheckCircle2 className="w-4 h-4 text-[#3f2a24]" /> Missing Implementation</li>
              <li className="flex items-center gap-3 text-[13px] text-gray-600"><CheckCircle2 className="w-4 h-4 text-[#3f2a24]" /> Dependencies</li>
            </ul>
          </div>
        ) : isAnalyzing ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 mb-2">
              <div className="w-8 h-8 border-[3px] border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <h3 className="text-[14px] font-medium text-gray-900">Processing...</h3>
            <p className="text-[13px] text-gray-500 max-w-[200px] text-center">Running security checks and analyzing patterns.</p>
          </div>
        ) : analysisResult ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
            {/* Score Card */}
            <div className="bg-[#faf6f4] rounded-2xl p-6 mb-8 border border-[#d4c4bc]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[14px] font-semibold text-[#3f2a24]">{analysisResult.verdict ? `Verdict: ${analysisResult.verdict}` : 'Vibe Score'}</h3>
                <span className="text-[24px] font-bold text-[#3f2a24] tracking-tight">{analysisResult.vibeScore}/100</span>
              </div>
              <div className="w-full bg-white/50 h-2 rounded-full overflow-hidden mb-3 border border-[#e8dfdb]">
                <motion.div 
                  initial={{ width: 0 }} animate={{ width: `${analysisResult.vibeScore}%` }} transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
              <p className="text-[12px] text-[#7a5a4f] leading-relaxed">
                {analysisResult.vibeScore >= 90 ? 'Excellent code quality. Ready for production.' :
                 analysisResult.vibeScore >= 70 ? 'Good overall, but has some areas for improvement.' :
                 'Needs significant refactoring before deployment.'}
              </p>
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6 hide-scrollbar">
              {['all', 'security', 'quality', 'performance', 'bestPractices', 'style'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat as Category | 'all')}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat 
                      ? 'bg-gray-900 text-white shadow-sm' 
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {cat === 'all' ? 'All Findings' : cat.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </button>
              ))}
            </div>

            {/* Findings List */}
            <div className="flex flex-col gap-3 pb-8">
              {filteredFindings.map((finding, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors shadow-sm">
                  <button
                    onClick={() => setExpandedFinding(expandedFinding === idx ? null : idx)}
                    className="w-full px-4 py-3.5 flex items-start gap-3 text-left focus:outline-none"
                  >
                    <SeverityIcon severity={finding.severity} />
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 border ${severityColor(finding.severity)}`}>
                          {finding.severity}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          <CategoryIcon category={finding.category} />
                          {finding.category.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </span>
                      </div>
                      <h4 className="text-[13px] font-medium text-gray-900 leading-snug pr-4">{finding.message}</h4>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 mt-1 ${expandedFinding === idx ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {expandedFinding === idx && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-gray-100 bg-gray-50/50"
                      >
                        <div className="p-4 space-y-4">
                          <div className="bg-white p-3 rounded-lg border border-gray-100 text-[13px] text-gray-600 leading-relaxed shadow-sm">
                            Rule: {finding.rule}
                          </div>
                          
                          {finding.line !== undefined && (
                            <div className="text-[12px] text-gray-500 flex items-center gap-2">
                              <span className="font-semibold text-gray-700">Line:</span>
                              <div className="flex gap-1.5 flex-wrap">
                                <span className="px-1.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-mono text-[11px]">{finding.line}</span>
                              </div>
                            </div>
                          )}

                          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-gray-800 shadow-inner">
                            <div className="bg-[#2d2d2d] px-3 py-1.5 border-b border-gray-700 text-[11px] font-medium text-gray-400 flex items-center gap-2">
                              <Sparkles className="w-3 h-3 text-emerald-400" /> Suggested Fix
                            </div>
                            <pre className="p-3 text-[12px] font-mono text-gray-300 overflow-x-auto custom-scrollbar">
                              <code>{finding.suggestion}</code>
                            </pre>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
              
              {filteredFindings.length === 0 && (
                <div className="text-center py-8 px-4 text-[13px] text-gray-500 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                  No {activeCategory !== 'all' ? activeCategory.replace(/([A-Z])/g, ' $1').toLowerCase() : ''} findings detected.
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
