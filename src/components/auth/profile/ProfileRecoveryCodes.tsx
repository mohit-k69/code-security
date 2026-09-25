import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  Key,
  Copy,
  Check,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface RecoveryStatusData {
  hasCodes: boolean;
  activeCount: number;
  createdAt: string | null;
}

export function ProfileRecoveryCodes() {
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [status, setStatus] = useState<RecoveryStatusData>({
    hasCodes: false,
    activeCount: 0,
    createdAt: null,
  });

  // Flow views: 'status' | 'confirm_regenerate' | 'display_codes'
  const [view, setView] = useState<'status' | 'confirm_regenerate' | 'display_codes'>('status');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Plaintext codes are held strictly in React memory while on 'display_codes' view.
  // Never stored in localStorage, sessionStorage, cookies, or sent to telemetry.
  const [plaintextCodes, setPlaintextCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Fetch status from backend on mount
  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setStatusLoading(false);
        return;
      }

      const res = await fetch('/api/auth/recovery-codes/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load recovery codes status');
      }

      const data = await res.json();
      if (data.success) {
        setStatus({
          hasCodes: Boolean(data.hasCodes),
          activeCount: Number(data.activeCount || 0),
          createdAt: data.createdAt || null,
        });
      }
    } catch (err: any) {
      setStatusError('Unable to load recovery code status.');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Cleanup on unmount: guarantee memory drop of plaintext codes
  useEffect(() => {
    return () => {
      setPlaintextCodes(null);
      setAcknowledged(false);
    };
  }, []);

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  // Trigger secure generation via backend
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setGenerateError('You must be signed in to generate recovery codes.');
        setIsGenerating(false);
        return;
      }

      const res = await fetch('/api/auth/recovery-codes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate recovery codes');
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.codes) && data.codes.length > 0) {
        // Plaintext codes received: held ONLY in React state during display
        setPlaintextCodes(data.codes);
        setAcknowledged(false);
        setCopied(false);
        setView('display_codes');
      } else {
        throw new Error('Invalid response from generation service');
      }
    } catch (err: any) {
      setGenerateError(err.message || 'An error occurred while generating codes. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy all codes to system clipboard
  const handleCopy = async () => {
    if (!plaintextCodes || plaintextCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(plaintextCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
      setCopied(false);
    }
  };

  // Download codes file locally
  const handleDownload = () => {
    if (!plaintextCodes || plaintextCodes.length === 0) return;

    // Zero sensitive metadata: no email, username, user ID, tokens, or ticket.
    const content = [
      'CODY ACCOUNT RECOVERY CODES',
      '===========================',
      '',
      'Recovery codes are a backup way to recover your account if you forget your password',
      'or lose access to another authentication method.',
      '',
      'SECURITY GUIDELINES:',
      '- Each code can only be used once.',
      '- Keep these codes in a secure password manager or offline location.',
      '- Anyone who has these codes may be able to recover your account.',
      '',
      'RECOVERY CODES:',
      ...plaintextCodes.map((code, idx) => `${String(idx + 1).padStart(2, '0')}. ${code}`),
      '',
      '===========================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cody-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Complete and dismiss display view
  const handleCompleteDisplay = async () => {
    if (!acknowledged) return;
    // Wipe plaintext codes immediately from React memory
    setPlaintextCodes(null);
    setAcknowledged(false);
    setView('status');
    await fetchStatus();
  };

  return (
    <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-gray-700" />
          <h4 className="text-[14px] font-semibold text-gray-900">Recovery codes</h4>
        </div>
      </div>

      <p className="text-[12px] text-gray-500 leading-relaxed">
        Recovery codes are a backup way to recover your account if you forget your password or lose access to another authentication method.
      </p>

      {/* Loading state */}
      {statusLoading && (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl text-gray-500 text-[12px]">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          <span>Checking recovery codes status...</span>
        </div>
      )}

      {/* Error state */}
      {statusError && !statusLoading && (
        <div className="p-3 bg-red-50 text-red-600 rounded-xl text-[12px] flex items-center justify-between">
          <span>{statusError}</span>
          <button
            onClick={fetchStatus}
            className="text-[11px] underline font-medium hover:text-red-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* View 1: Status View */}
      {!statusLoading && view === 'status' && (
        <div className="flex flex-col gap-3">
          {status.hasCodes ? (
            <div className="flex flex-col gap-2.5 p-3.5 bg-emerald-50/60 border border-emerald-100/80 rounded-xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[13px] font-semibold text-emerald-900">
                      Recovery codes are configured
                    </div>
                    <div className="text-[12px] text-emerald-700 mt-0.5">
                      {status.activeCount} recovery {status.activeCount === 1 ? 'code' : 'codes'} active
                      {status.createdAt ? ` • Generated on ${formatDate(status.createdAt)}` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  id="regenerate-recovery-codes-btn"
                  onClick={() => setView('confirm_regenerate')}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                  <span>Regenerate recovery codes</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[13px] font-semibold text-gray-800">
                    Recovery codes haven't been generated yet
                  </div>
                  <div className="text-[12px] text-gray-500 mt-0.5">
                    Generate a set of 10 backup codes to ensure you never get locked out of your account.
                  </div>
                </div>
              </div>

              {generateError && (
                <div className="p-2.5 bg-red-50 text-red-600 text-[12px] rounded-lg">
                  {generateError}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  id="generate-initial-recovery-codes-btn"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white bg-[#3f2a24] hover:bg-[#2c1d19] transition-colors flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>Generate recovery codes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View 2: Confirmation Warning for Regeneration */}
      {view === 'confirm_regenerate' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-[13px] font-semibold text-amber-900">
                Regenerate recovery codes?
              </div>
              <div className="text-[12px] text-amber-800 mt-1 leading-relaxed">
                Generating new recovery codes will immediately invalidate all existing recovery codes. Any previously saved codes will no longer work.
              </div>
            </div>
          </div>

          {generateError && (
            <div className="p-2.5 bg-red-50 text-red-600 text-[12px] rounded-lg">
              {generateError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              id="cancel-regenerate-btn"
              onClick={() => {
                setGenerateError(null);
                setView('status');
              }}
              disabled={isGenerating}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="confirm-regenerate-btn"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-amber-700 hover:bg-amber-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Regenerating...</span>
                </>
              ) : (
                <span>Yes, regenerate codes</span>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* View 3: Display Newly Generated Plaintext Codes */}
      {view === 'display_codes' && plaintextCodes && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col gap-3.5 p-4 bg-gray-50 border border-gray-200 rounded-xl"
        >
          <div className="flex items-start gap-2 p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-lg text-[12px] text-amber-900 leading-snug">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Save these recovery codes in a safe place. You will <strong>not</strong> be able to view them again after leaving this screen.
            </span>
          </div>

          {/* 10 codes formatted in a clean 2-column monospace grid */}
          <div
            id="recovery-codes-grid"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-white border border-gray-200 rounded-xl select-all"
          >
            {plaintextCodes.map((code, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-md font-mono text-[12.5px] text-gray-800 font-medium tracking-wide"
              >
                <span className="text-[11px] text-gray-400 select-none w-4">
                  {String(idx + 1).padStart(2, '0')}.
                </span>
                <span className="select-all">{code}</span>
              </div>
            ))}
          </div>

          {/* Actions: Copy & Download */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              id="copy-all-recovery-codes-btn"
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer shadow-2xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gray-500" />
                  <span>Copy all codes</span>
                </>
              )}
            </button>

            <button
              type="button"
              id="download-recovery-codes-btn"
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-gray-500" />
              <span>Download codes</span>
            </button>
          </div>

          {/* Explicit acknowledgement */}
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
            <label className="flex items-start gap-2.5 text-[12px] text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                id="ack-recovery-codes-checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#3f2a24] focus:ring-[#3f2a24] cursor-pointer"
              />
              <span className="font-medium">
                I've saved my recovery codes.
              </span>
            </label>

            <p className="text-[11px] text-gray-500 pl-6 leading-relaxed">
              Each code can only be used once. Anyone who has these codes may be able to recover your account.
            </p>
          </div>

          {/* Done / Dismiss Button */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              id="finish-recovery-codes-setup-btn"
              onClick={handleCompleteDisplay}
              disabled={!acknowledged}
              className={`px-5 py-2 rounded-xl text-[12px] font-semibold transition-colors shadow-xs ${
                acknowledged
                  ? 'bg-[#3f2a24] text-white hover:bg-[#2c1d19] cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Done
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
