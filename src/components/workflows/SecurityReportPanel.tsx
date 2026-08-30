import React from 'react';
import { Check, AlertTriangle, Info, Loader2, ShieldCheck } from 'lucide-react';

interface SecurityReportPanelProps {
  report: any;
  isAnalyzing: boolean;
}

export function SecurityReportPanel({ report, isAnalyzing }: SecurityReportPanelProps) {
  if (isAnalyzing) {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <h3 className="text-gray-900 font-medium text-lg">Running Security Analysis...</h3>
        <p className="text-gray-500 text-sm mt-2">Checking your code against our security checkpoints.</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <div className="mb-32 flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
            <ShieldCheck className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-gray-900 font-medium text-lg">No Analysis Results</h3>
          <p className="text-gray-500 text-sm mt-2">Your security analysis will appear here.</p>
        </div>
      </div>
    );
  }

  const allFindings = [
    ...(report.findings?.critical || []).map((f: any) => ({ ...f, _severityLabel: 'Critical' })),
    ...(report.findings?.warning || []).map((f: any) => ({ ...f, _severityLabel: 'Warning' })),
    ...(report.findings?.info || []).map((f: any) => ({ ...f, _severityLabel: 'Info' }))
  ];

  const totalFindings = allFindings.length;
  const criticalCount = report.findings?.critical?.length || 0;
  const warningCount = report.findings?.warning?.length || 0;
  const infoCount = report.findings?.info?.length || 0;

  return (
    <div className="w-full bg-white border-l border-gray-200 flex flex-col h-full shrink-0">
      {/* 1. Verdict - Highest visual priority */}
      <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
        {report.verdict === 'PASS' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">PASS</h2>
            </div>
            <p className="text-gray-600">No security vulnerabilities were identified in the provided code.</p>
          </div>
        )}

        {report.verdict === 'NOT_VERIFIED' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-gray-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">NOT VERIFIED</h2>
            </div>
            <p className="text-gray-600">Security could not be confidently verified because additional context is required.</p>
            <p className="text-gray-500 text-sm mt-2 italic">Add the related implementation or supporting files and run the analysis again.</p>
          </div>
        )}

        {report.verdict === 'FAIL' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">FAIL</h2>
            </div>
            <p className="text-red-700 font-medium">Security vulnerabilities were detected in the provided code.</p>
            
            {/* 2. Findings summary */}
            <div className="mt-4 flex flex-col gap-2">
              <span className="font-semibold text-gray-800">{totalFindings} security {totalFindings === 1 ? 'vulnerability' : 'vulnerabilities'}</span>
              <div className="flex gap-3 text-sm">
                {criticalCount > 0 && <span className="text-red-700 font-medium">{criticalCount} Critical</span>}
                {warningCount > 0 && <span className="text-orange-700 font-medium">{warningCount} Warning</span>}
                {infoCount > 0 && <span className="text-blue-700 font-medium">{infoCount} Info</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
        {/* 3. Individual findings */}
        {report.verdict === 'FAIL' && totalFindings > 0 && (
          <div className="space-y-6">
            {allFindings.map((finding: any, i: number) => {
              const isCritical = finding._severityLabel === 'Critical';
              const isWarning = finding._severityLabel === 'Warning';
              
              return (
                <div key={i} className={`border rounded-xl p-5 ${isCritical ? 'border-red-100 bg-red-50/10' : isWarning ? 'border-orange-100 bg-orange-50/10' : 'border-blue-100 bg-blue-50/10'}`}>
                  {/* Severity Tag */}
                  <div className="mb-2">
                    <span className={`text-xs font-bold uppercase px-2 py-1 rounded-md ${isCritical ? 'bg-red-100 text-red-800' : isWarning ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                      {finding._severityLabel}
                    </span>
                  </div>

                  {/* Vulnerability Title */}
                  <h4 className={`text-lg font-semibold mb-1 ${isCritical ? 'text-red-900' : isWarning ? 'text-orange-900' : 'text-blue-900'}`}>
                    {finding.title}
                  </h4>
                  
                  {/* filename — Line X */}
                  {finding.primaryLocation?.file && (
                    <p className="text-sm font-medium text-gray-500 mb-4">
                      {finding.primaryLocation.file} — Line {finding.primaryLocation.line || 'unknown'}
                    </p>
                  )}

                  {/* Evidence / Code */}
                  {finding.evidence && finding.evidence.length > 0 && finding.evidence[0]?.snippet && (
                    <div className="rounded-lg bg-gray-900 p-3 mb-4 overflow-x-auto">
                      <code className="text-xs font-mono text-gray-100 whitespace-pre">
                        {finding.evidence[0].snippet}
                      </code>
                    </div>
                  )}
                  
                  {/* Explanation (Why this is a problem) */}
                  <div className="mb-4">
                    <p className="text-gray-800 leading-relaxed text-sm">
                      {finding.description}
                    </p>
                  </div>
                  
                  {/* Recommended fix */}
                  {finding.suggestion && (
                    <div className="pt-3 border-t border-gray-200/60 text-sm">
                      <span className="font-semibold text-gray-900 block mb-1">Recommended Fix</span>
                      <span className="text-gray-700">{finding.suggestion}</span>
                    </div>
                  )}

                  {/* CWE metadata */}
                  {finding.cwes && finding.cwes.length > 0 && (
                    <div className="mt-4 flex gap-2">
                      {finding.cwes.map((cwe: string, idx: number) => (
                        <span key={idx} className="text-[10px] uppercase font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {cwe}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
