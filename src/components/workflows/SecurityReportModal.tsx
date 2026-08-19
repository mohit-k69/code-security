import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, AlertTriangle, X, Info } from 'lucide-react';

interface SecurityReportModalProps {
  report: any;
  onClose: () => void;
}

export function SecurityReportModal({ report, onClose }: SecurityReportModalProps) {
  if (!report) return null;

  const allFindings = [
    ...(report.findings?.critical || []).map((f: any) => ({ ...f, _severityLabel: 'Critical' })),
    ...(report.findings?.warning || []).map((f: any) => ({ ...f, _severityLabel: 'Warning' })),
    ...(report.findings?.info || []).map((f: any) => ({ ...f, _severityLabel: 'Info' }))
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col max-w-2xl w-full max-h-[85vh] overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div className="flex items-center gap-3">
              {report.verdict === 'PASS' ? (
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
              ) : report.verdict === 'NOT_VERIFIED' ? (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-gray-500" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
              )}
              <div>
                <h3 className="text-gray-900 font-semibold text-lg">
                  Security Analysis {report.verdict}
                </h3>
                <p className="text-gray-500 text-sm">
                  {report.repository?.owner}/{report.repository?.name}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar">
            {report.verdict === 'PASS' && (
              <p className="text-gray-600">No security vulnerabilities were identified.</p>
            )}
            
            {report.verdict === 'NOT_VERIFIED' && (
              <div className="space-y-4">
                <p className="text-gray-600">Security could not be confidently verified because there was insufficient analyzable context.</p>
              </div>
            )}

            {report.verdict === 'FAIL' && (
              <div className="space-y-6">
                <p className="text-red-600 font-medium">Security vulnerabilities were detected in this snippet.</p>
                
                {allFindings.map((finding: any, i: number) => {
                  const isCritical = finding._severityLabel === 'Critical';
                  const isWarning = finding._severityLabel === 'Warning';
                  
                  return (
                    <div key={i} className={`border rounded-xl p-4 ${isCritical ? 'border-red-100 bg-red-50/30' : isWarning ? 'border-orange-100 bg-orange-50/30' : 'border-blue-100 bg-blue-50/30'}`}>
                      <div className="flex items-start gap-3">
                        {isCritical ? (
                          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                        ) : isWarning ? (
                          <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
                        ) : (
                          <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0 w-full">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-sm ${isCritical ? 'bg-red-100 text-red-700' : isWarning ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                              {finding._severityLabel}
                            </span>
                            <h4 className={`font-medium ${isCritical ? 'text-red-900' : isWarning ? 'text-orange-900' : 'text-blue-900'}`}>
                              {finding.title}
                            </h4>
                          </div>
                          
                          {finding.primaryLocation?.file && (
                            <p className={`text-xs font-mono mb-3 ${isCritical ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-blue-600'}`}>
                              {finding.primaryLocation.file} — Line {finding.primaryLocation.line || 'unknown'}
                            </p>
                          )}
                          
                          <p className={`text-sm mb-3 ${isCritical ? 'text-red-700' : isWarning ? 'text-orange-700' : 'text-blue-700'}`}>
                            {finding.description}
                          </p>
                          
                          {finding.evidence && finding.evidence.length > 0 && finding.evidence[0]?.snippet && (
                            <div className={`rounded-md border p-3 mb-3 overflow-x-auto ${isCritical ? 'bg-white border-red-100' : isWarning ? 'bg-white border-orange-100' : 'bg-white border-blue-100'}`}>
                              <code className={`text-xs font-mono whitespace-pre ${isCritical ? 'text-red-800' : isWarning ? 'text-orange-800' : 'text-blue-800'}`}>
                                {finding.evidence[0].snippet}
                              </code>
                            </div>
                          )}
                          
                          {finding.suggestion && (
                            <div className="mt-3 text-sm">
                              <span className="font-semibold text-gray-700">Remediation: </span>
                              <span className="text-gray-600">{finding.suggestion}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
