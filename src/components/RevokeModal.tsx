import React, { useState } from 'react';
import { Parcel, RevocationGround, UserRole } from '../types';
import { revokeTitleByGovernorFirestore } from '../core/firestoreCadastre';
import { extractReadableError } from '../core/firebase';
import { useAuth } from '../core/authContext';
import { ShieldAlert, X, AlertTriangle } from 'lucide-react';

interface RevokeModalProps {
  parcel: Parcel | null;
  activeRole: UserRole;
  onClose: () => void;
  onSuccess: () => void;
}

export const RevokeModal: React.FC<RevokeModalProps> = ({
  parcel,
  activeRole,
  onClose,
  onSuccess,
}) => {
  const { userProfile } = useAuth();
  const [ground, setGround] = useState<RevocationGround>('OverridingPublicInterest');
  const [reasonDetail, setReasonDetail] = useState(
    'FCT Executive Proclamation: Public Infrastructure Corridor Extension'
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!parcel) return null;

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await revokeTitleByGovernorFirestore(
        parcel,
        activeRole,
        userProfile?.displayName || 'His Excellency, Executive Governor',
        ground,
        reasonDetail
      );

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || 'Statutory revocation failed.');
      }
    } catch (err) {
      setError(extractReadableError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xl space-y-4 text-[#0F172A]">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
          <div className="flex items-center gap-2 text-[#DC2626]">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="font-serif text-[18px] text-[#0F172A]">
              Executive Statutory Revocation
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 rounded-xl text-[12.5px] space-y-1">
          <div className="flex items-center gap-1.5 text-[#0F172A] font-semibold">
            <AlertTriangle className="w-4 h-4 text-[#D97706]" />
            <span>Nigeria Land Use Act (1978), Section 28</span>
          </div>
          <p className="text-[#475569] leading-relaxed">
            Revocation is exercised exclusively by the Governor. This executive act immutably locks the title in Firestore and disables future transfers.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[12px]">
            {error}
          </div>
        )}

        <form onSubmit={handleRevoke} className="space-y-4 text-[13px]">
          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Target Land Parcel</label>
            <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] font-mono text-[12px] text-[#0F172A]">
              {parcel.titleNumber} — {parcel.applicantName} (NFT #{parcel.nftTokenId})
            </div>
          </div>

          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Statutory Revocation Ground</label>
            <select
              value={ground}
              onChange={(e) => setGround(e.target.value as RevocationGround)}
              className="w-full bg-white border border-[#E2E8F0] rounded-lg p-2.5 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            >
              <option value="OverridingPublicInterest">
                Ground 0: Overriding Public Interest (Sec. 28(2)(b))
              </option>
              <option value="BreachOfStatutoryCondition">
                Ground 1: Breach of Statutory Condition (Sec. 28(5))
              </option>
            </select>
          </div>

          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Executive Gazette Reference</label>
            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              required
              rows={3}
              className="w-full bg-white border border-[#E2E8F0] rounded-lg p-2.5 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="text-[12px] text-[#475569]">
            Current Role: <strong className="text-[#0F172A] font-mono">{activeRole}</strong>
            {activeRole !== 'GOVERNOR' && (
              <span className="text-[#DC2626] block mt-0.5">
                Only GOVERNOR role can execute statutory revocation.
              </span>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] rounded-lg text-[13px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium cursor-pointer"
            >
              {submitting ? 'Revoking...' : 'Confirm Revocation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
