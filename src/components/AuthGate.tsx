import React from 'react';
import { ShieldCheck, AlertCircle, LogIn, ExternalLink } from 'lucide-react';
import { useAuth } from '../core/authContext';

interface AuthGateProps {
  isAdminRoute?: boolean;
}

export const AuthGate: React.FC<AuthGateProps> = ({ isAdminRoute = false }) => {
  const { signInWithGoogle, authBusy, authError, clearAuthError } = useAuth();
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '#';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-center items-center px-6 py-12 font-sans">
      <div className="w-full max-w-[440px] bg-white border border-[#E2E8F0] rounded-2xl p-8 shadow-xs space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-[#2563EB] text-[12px] font-semibold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>{isAdminRoute ? 'Admin Portal · Separate Account Required' : 'Statutory Cadastre Access'}</span>
          </div>
          <h1 className="font-serif text-[28px] leading-tight text-[#0F172A] font-normal">
            {isAdminRoute ? 'Anagu Admin Portal' : 'Anagu Land Registry'}
          </h1>
          <p className="text-[13.5px] text-[#475569] leading-relaxed">
            {isAdminRoute
              ? 'Sign in with a separate authorized Admin or Official Google account. Standard citizen/user accounts do not have access to this portal.'
              : 'Sign in with your verified Google account to file land applications, verify title certificates, and track your cadastral filings.'}
          </p>
        </div>

        {authError && (
          <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[12.5px] flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
            <button
              type="button"
              onClick={clearAuthError}
              className="text-[11.5px] font-medium text-[#991B1B] hover:underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-2 text-[12.5px] text-[#475569]">
          <div className="font-semibold text-[#0F172A]">
            {isAdminRoute ? 'Isolated Admin Authentication' : 'Citizen & Applicant Portal'}
          </div>
          <ul className="space-y-1.5 leading-relaxed">
            {isAdminRoute ? (
              <>
                <li>• Uses an isolated Admin session separate from standard user logins.</li>
                <li>• Restricted strictly to authorized Administrators and appointed Registry Officials.</li>
                <li>• Unauthorized user accounts are blocked immediately upon verification.</li>
              </>
            ) : (
              <>
                <li>• New accounts register as <strong>Citizen / Applicant</strong>.</li>
                <li>• Submit land filings, inspect public titles, and download issued Certificates.</li>
                <li>• All land records and audit trails sync in real time via Cloud Firestore.</li>
              </>
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={authBusy}
            className="w-full py-3 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white rounded-xl text-[14px] font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{authBusy ? 'Signing in...' : isAdminRoute ? 'Sign in with Admin Google Account' : 'Sign in with Google'}</span>
          </button>

          {(isInIframe || authError) && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Open App in New Tab (if popup is blocked)</span>
            </a>
          )}

          {isAdminRoute && (
            <a
              href="/"
              className="block text-center text-[12.5px] font-medium text-[#2563EB] hover:underline pt-1"
            >
              Return to User Portal (/)
            </a>
          )}
        </div>

        <p className="text-center text-[11.5px] text-[#64748B]">
          Governed under the Land Use Act (1978) Section 28 Statutory Authority
        </p>
      </div>
    </div>
  );
};
