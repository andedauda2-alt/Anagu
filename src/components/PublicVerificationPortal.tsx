import React, { useState } from 'react';
import { Parcel } from '../types';
import { Search, ShieldCheck, ShieldAlert, Award } from 'lucide-react';

interface PublicVerificationPortalProps {
  parcels: Parcel[];
  onOpenCertificate: (parcel: Parcel) => void;
}

export const PublicVerificationPortal: React.FC<PublicVerificationPortalProps> = ({
  parcels,
  onOpenCertificate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState<Parcel | null>(parcels[0] || null);

  const filteredParcels = parcels.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      p.titleNumber.toLowerCase().includes(query) ||
      p.applicantName.toLowerCase().includes(query) ||
      p.applicantIdNumber.toLowerCase().includes(query) ||
      p.spatialHash.toLowerCase().includes(query) ||
      p.deedReference.toLowerCase().includes(query) ||
      (p.nftTokenId && p.nftTokenId.toString() === query)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-[28px] sm:text-[32px] leading-tight text-[#0F172A] font-normal">
          Public Title Search
        </h1>
        <p className="mt-1 text-[14px] text-[#475569]">
          Verify title authenticity, encumbrance status, and Section 28 statutory revocations.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#64748B]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by Title Number (e.g. NG-ABJ-2025-0104), NIN/RC, Spatial Hash, or Owner Name..."
          className="w-full bg-white border border-[#E2E8F0] rounded-xl pl-10 pr-16 py-2.5 text-[13px] text-[#0F172A] placeholder-[#64748B] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 font-mono"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-2.5 text-[12px] text-[#475569] hover:text-[#0F172A] cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-2.5">
          <div className="text-[12px] text-[#64748B] px-1">
            {filteredParcels.length} {filteredParcels.length === 1 ? 'record' : 'records'} found
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredParcels.map((parcel) => {
              const isSelected = selectedResult?.id === parcel.id;
              const isRevoked = parcel.isRevoked || parcel.status === 'REVOKED';

              return (
                <button
                  type="button"
                  key={parcel.id}
                  onClick={() => setSelectedResult(parcel)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EFF6FF]/60 border-[#2563EB]'
                      : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold text-[#0F172A]">
                      {parcel.titleNumber}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        isRevoked
                          ? 'text-[#DC2626]'
                          : parcel.status === 'NFT_ISSUED'
                          ? 'text-[#059669]'
                          : 'text-[#D97706]'
                      }`}
                    >
                      {isRevoked ? 'Revoked (Sec. 28)' : parcel.status === 'NFT_ISSUED' ? 'Valid Title' : parcel.status}
                    </span>
                  </div>

                  <div className="text-[13px] text-[#334155] mt-1">{parcel.applicantName}</div>
                  <div className="text-[12px] text-[#64748B] mt-0.5">
                    {parcel.locationName} · {parcel.state} · {parcel.areaSqm.toLocaleString()} m²
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7">
          {selectedResult ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
              <div className="border-b border-[#F1F5F9] pb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[12px] text-[#64748B] block">Statutory Registry Record</span>
                  <h2 className="font-serif text-[22px] text-[#0F172A] mt-0.5">
                    {selectedResult.titleNumber}
                  </h2>
                </div>

                {selectedResult.isRevoked || selectedResult.status === 'REVOKED' ? (
                  <div className="flex items-center gap-1.5 text-[#DC2626] font-semibold text-[13px]">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Revoked Statutorily (Sec. 28)</span>
                  </div>
                ) : selectedResult.status === 'NFT_ISSUED' ? (
                  <div className="flex items-center gap-1.5 text-[#059669] font-semibold text-[13px]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Unencumbered Title Active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[#D97706] font-semibold text-[13px]">
                    <span>Status: {selectedResult.status}</span>
                  </div>
                )}
              </div>

              {selectedResult.isRevoked && selectedResult.revocationData && (
                <div className="bg-[#FEF2F2] border border-[#FECACA] p-4 rounded-xl space-y-1.5 text-[13px]">
                  <div className="font-semibold text-[#DC2626]">
                    Notice to Prospective Buyers &amp; Lenders
                  </div>
                  <p className="text-[#991B1B] text-[12.5px] leading-relaxed">
                    This title was lawfully revoked by executive proclamation under{' '}
                    <strong>Section 28 of the Land Use Act (1978)</strong> (
                    {selectedResult.revocationData.ground === 'OverridingPublicInterest'
                      ? 'Overriding Public Interest'
                      : 'Breach of Statutory Condition'}
                    ). Ref: {selectedResult.revocationData.reasonDetail}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <span className="text-[12px] text-[#64748B] block">Certified Titleholder</span>
                  <span className="font-medium text-[#0F172A] block mt-0.5">{selectedResult.applicantName}</span>
                  <span className="text-[11px] font-mono text-[#64748B]">NIN: {selectedResult.applicantIdNumber}</span>
                </div>

                <div>
                  <span className="text-[12px] text-[#64748B] block">Surveyed Area</span>
                  <span className="font-medium text-[#0F172A] font-mono tabular-nums block mt-0.5">
                    {selectedResult.areaSqm.toLocaleString()} m²
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    {(selectedResult.areaSqm / 10000).toFixed(3)} Hectares
                  </span>
                </div>

                <div>
                  <span className="text-[12px] text-[#64748B] block">Location</span>
                  <span className="font-medium text-[#0F172A] block mt-0.5">{selectedResult.locationName}</span>
                  <span className="text-[11px] text-[#64748B]">
                    {selectedResult.lga}, {selectedResult.state}
                  </span>
                </div>

                <div>
                  <span className="text-[12px] text-[#64748B] block">Customary Assent</span>
                  <span className="font-medium text-[#0F172A] block mt-0.5">{selectedResult.customaryClan}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#F1F5F9] space-y-2.5 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">ERC-721 Token ID</span>
                  <span className="font-mono font-semibold text-[#0F172A]">
                    #{selectedResult.nftTokenId || 'Pending Issuance'}
                  </span>
                </div>

                <div>
                  <span className="text-[#64748B] block mb-1">Spatial Hash (Keccak-256)</span>
                  <div className="font-mono text-[11px] text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 break-all select-all">
                    {selectedResult.spatialHash}
                  </div>
                </div>

                <div>
                  <span className="text-[#64748B] block mb-1">Document Integrity (SHA-256)</span>
                  <div className="font-mono text-[11px] text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 break-all select-all">
                    {selectedResult.documentHash}
                  </div>
                </div>
              </div>

              {selectedResult.status === 'NFT_ISSUED' && (
                <button
                  type="button"
                  onClick={() => onOpenCertificate(selectedResult)}
                  className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  <span>Inspect Official Certificate of Occupancy</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center text-[#64748B] text-[13px]">
              Select a title record to verify.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
