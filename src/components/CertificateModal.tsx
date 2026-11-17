import React from 'react';
import { Parcel } from '../types';
import { Award, Printer, X, QrCode } from 'lucide-react';
import QRCode from 'qrcode';

interface CertificateModalProps {
  parcel: Parcel | null;
  onClose: () => void;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({ parcel, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = React.useState<string>('');

  React.useEffect(() => {
    if (!parcel) return;
    const verificationPayload = JSON.stringify({
      framework: 'Anagu Land Cadastre',
      titleNumber: parcel.titleNumber,
      owner: parcel.applicantName,
      wallet: parcel.applicantWalletAddress,
      tokenId: parcel.nftTokenId,
      spatialHash: parcel.spatialHash,
      isRevoked: parcel.isRevoked || false,
      issuedAt: new Date(parcel.createdAt).toISOString(),
    });

    QRCode.toDataURL(verificationPayload, {
      width: 140,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn('QR Code generation error:', err));
  }, [parcel]);

  if (!parcel) return null;

  const isRevoked = parcel.isRevoked || parcel.status === 'REVOKED';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-[2px]">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white border border-[#E2E8F0] rounded-2xl shadow-xl">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-[#F1F5F9] px-5 py-3.5 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#2563EB]" />
            <h3 className="text-[14px] font-semibold text-[#0F172A]">
              Digital Certificate of Occupancy (C of O)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] border border-[#E2E8F0] rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Certificate</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close certificate"
              className="p-1.5 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-8 sm:p-12 relative bg-[#FFFFFF] text-[#0F172A] font-serif border-[10px] border-double border-[#1E3A8A]/80 m-4 rounded-xl overflow-hidden select-text">
          {isRevoked && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="transform -rotate-12 border-8 border-[#DC2626]/85 px-8 py-4 rounded-xl text-center bg-[#FEF2F2]/90 backdrop-blur-[1px]">
                <span className="text-3xl sm:text-5xl font-black text-[#DC2626] tracking-wider font-sans block uppercase">
                  REVOKED
                </span>
                <span className="text-xs sm:text-sm font-bold text-[#991B1B] font-sans block mt-1 uppercase tracking-widest">
                  Under Land Use Act (1978) Section 28
                </span>
                <span className="text-[11px] text-[#991B1B] font-mono block mt-0.5">
                  Proclamation: {parcel.revocationData?.reasonDetail || 'Statutory Executive Proclamation'}
                </span>
              </div>
            </div>
          )}

          <div className="text-center space-y-1 mb-8 border-b-2 border-[#E2E8F0] pb-6">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#0F172A] text-white flex items-center justify-center font-sans font-bold text-sm border-2 border-[#2563EB]">
              FGN
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-[#0F172A] uppercase mt-2">
              Federal Republic of Nigeria
            </h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
              Ministry of Lands, Housing &amp; Urban Development · Cadastral Deeds Registry
            </p>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#0F172A] uppercase pt-2">
              Certificate of Occupancy
            </h2>
            <p className="text-[11px] italic text-[#475569] font-sans">
              Issued in accordance with Section 9 of the Land Use Act No. 6 of 1978
            </p>
          </div>

          <div className="space-y-4 text-xs sm:text-sm leading-relaxed text-[#334155]">
            <p>
              This is to certify that <strong className="text-[#0F172A]">{parcel.applicantName}</strong> (Identity NIN/RC:{' '}
              <span className="font-mono">{parcel.applicantIdNumber}</span>) of {parcel.applicantAddress} is hereby
              granted a Statutory Right of Occupancy for a term of <strong>99 Years</strong> in respect of the land
              parcel designated as:
            </p>

            <div className="bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0] my-4 font-sans text-xs grid grid-cols-2 gap-3">
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block">Title Number</span>
                <strong className="text-[#0F172A] font-mono text-sm">{parcel.titleNumber}</strong>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block">Cadastral Location</span>
                <strong className="text-[#0F172A]">{parcel.locationName}, {parcel.lga}, {parcel.state}</strong>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block">Survey Area &amp; Use</span>
                <strong className="text-[#0F172A]">{parcel.areaSqm.toLocaleString()} m² · {parcel.landUse}</strong>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block">Customary Assent</span>
                <strong className="text-[#0F172A]">{parcel.customaryClan}</strong>
              </div>
            </div>

            <p>
              Subject to the statutory covenants and conditions implied under the Land Use Act (1978), and to the
              express conditions that the holder shall not alienate or transfer this Right of Occupancy without the
              prior written consent of the Governor.
            </p>
          </div>

          <div className="mt-8 pt-4 border-t-2 border-[#E2E8F0] font-sans text-[11px] grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-3 flex flex-col items-center justify-center p-2.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code for ${parcel.titleNumber}`}
                  className="w-24 h-24 object-contain rounded"
                />
              ) : (
                <div className="w-24 h-24 bg-[#F1F5F9] p-2 rounded flex flex-col items-center justify-center text-[#0F172A]">
                  <QrCode className="w-12 h-12 text-[#2563EB]" />
                </div>
              )}
              <span className="text-[9px] text-[#475569] font-mono mt-1 text-center font-semibold">
                Scan to Verify Title
              </span>
            </div>

            <div className="sm:col-span-9 space-y-1.5 font-mono text-[10px]">
              <div>
                <span className="text-[#64748B] font-sans block">ERC-721 Digital Title NFT:</span>
                <strong className="text-[#059669] text-xs">
                  Token ID #{parcel.nftTokenId || 1001} (LandTitleNFT.sol)
                </strong>
              </div>
              <div className="truncate">
                <span className="text-[#64748B] font-sans block">Keccak-256 Spatial Hash (S_geom):</span>
                <span className="text-[#334155] bg-[#F8FAFC] p-1.5 rounded border border-[#E2E8F0] block truncate">
                  {parcel.spatialHash}
                </span>
              </div>
              <div className="truncate">
                <span className="text-[#64748B] font-sans block">Besu QBFT Consensus Tx Hash:</span>
                <span className="text-[#334155] bg-[#F8FAFC] p-1.5 rounded border border-[#E2E8F0] block truncate">
                  {parcel.blockchainTxHash || '0x992b1a8f3c7e5d2b1a4f6e8c0d2e4f6a8b0c2e4f6a8b'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[#E2E8F0] flex items-center justify-between font-sans text-xs">
            <div className="text-center">
              <div className="w-32 border-b border-[#0F172A] pb-1 mb-1 font-serif italic text-sm text-[#334155]">
                A. M. Bello
              </div>
              <span className="text-[10px] text-[#64748B] uppercase tracking-wider block">
                Surveyor-General of the Federation
              </span>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#2563EB]/60 flex items-center justify-center text-[10px] text-[#2563EB] font-bold mx-auto">
                SEAL
              </div>
            </div>

            <div className="text-center">
              <div className="w-32 border-b border-[#0F172A] pb-1 mb-1 font-serif italic text-sm text-[#334155]">
                Chief Registrar
              </div>
              <span className="text-[10px] text-[#64748B] uppercase tracking-wider block">
                Registrar of Deeds &amp; Titles
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
