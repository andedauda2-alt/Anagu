import React, { useState } from 'react';
import { Parcel, UserRole } from '../types';
import { MapPin, ShieldAlert, Award, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface CadastreMapProps {
  parcels: Parcel[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string) => void;
  onOpenCertificate: (parcel: Parcel) => void;
  onOpenRevokeModal: (parcel: Parcel) => void;
  activeRole: UserRole;
  toleranceBufferMeters: number;
}

export const CadastreMap: React.FC<CadastreMapProps> = ({
  parcels,
  selectedParcelId,
  onSelectParcel,
  onOpenCertificate,
  onOpenRevokeModal,
  activeRole,
  toleranceBufferMeters,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showBuffer, setShowBuffer] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const selectedParcel = parcels.find((p) => p.id === selectedParcelId) || parcels[0];

  const minLng = 7.465;
  const maxLng = 7.525;
  const minLat = 9.050;
  const maxLat = 9.092;

  const mapWidth = 800;
  const mapHeight = 520;

  const projectCoord = (lng: number, lat: number) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * (mapWidth - 100) + 50;
    const y = mapHeight - (((lat - minLat) / (maxLat - minLat)) * (mapHeight - 100) + 50);
    return [x, y] as [number, number];
  };

  const filteredParcels = parcels.filter((p) => {
    if (filterStatus === 'ALL') return true;
    if (filterStatus === 'NFT_ISSUED') return p.status === 'NFT_ISSUED' && !p.isRevoked;
    if (filterStatus === 'REVOKED') return p.isRevoked || p.status === 'REVOKED';
    if (filterStatus === 'IN_PROGRESS')
      return (
        p.status !== 'NFT_ISSUED' &&
        p.status !== 'REVOKED' &&
        p.status !== 'REJECTED' &&
        p.status !== 'CANCELLED'
      );
    if (filterStatus === 'REJECTED') return p.status === 'REJECTED';
    return true;
  });

  const getStatusStyle = (parcel: Parcel) => {
    if (parcel.isRevoked || parcel.status === 'REVOKED') {
      return {
        fill: 'fill-[#DC2626]/15',
        stroke: 'stroke-[#DC2626]',
        bufferStroke: 'stroke-[#DC2626]/35',
        textClass: 'text-[#DC2626]',
        label: 'Statutorily Revoked (Sec. 28)',
      };
    }
    if (parcel.status === 'NFT_ISSUED') {
      return {
        fill: 'fill-[#059669]/18',
        stroke: 'stroke-[#059669]',
        bufferStroke: 'stroke-[#059669]/30',
        textClass: 'text-[#059669]',
        label: 'Title NFT Active',
      };
    }
    if (parcel.status === 'REJECTED') {
      return {
        fill: 'fill-[#DC2626]/12',
        stroke: 'stroke-[#DC2626]',
        bufferStroke: 'stroke-[#DC2626]/25',
        textClass: 'text-[#DC2626]',
        label: 'Rejected during Review',
      };
    }
    if (parcel.status === 'CANCELLED') {
      return {
        fill: 'fill-[#64748B]/12',
        stroke: 'stroke-[#64748B]',
        bufferStroke: 'stroke-[#64748B]/25',
        textClass: 'text-[#64748B]',
        label: 'Cancelled by Applicant',
      };
    }
    return {
      fill: 'fill-[#D97706]/15',
      stroke: 'stroke-[#D97706]',
      bufferStroke: 'stroke-[#D97706]/30',
      textClass: 'text-[#D97706]',
      label: parcel.status.replace('_', ' '),
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] sm:text-[32px] leading-tight text-[#0F172A] font-normal">
            Cadastral Parcel Map
          </h1>
          <p className="mt-1 text-[14px] text-[#475569]">
            EPSG:4326 (WGS 84) spatial boundaries, survey buffer margins, and verified parcel records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] text-[12px]">
          {[
            { id: 'ALL', label: `All (${parcels.length})` },
            { id: 'NFT_ISSUED', label: 'Active NFTs' },
            { id: 'IN_PROGRESS', label: 'Awaiting Verification' },
            { id: 'REVOKED', label: 'Revoked' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                filterStatus === tab.id
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Modern Cartographic Survey Map */}
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC]">
            <div className="flex items-center gap-2 text-[13px] text-[#0F172A] font-medium">
              <MapPin className="w-4 h-4 text-[#2563EB]" />
              <span>FCT &amp; Lagos Cadastral Grids</span>
            </div>

            <div className="flex items-center gap-4 text-[12px] text-[#475569]">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showBuffer}
                  onChange={(e) => setShowBuffer(e.target.checked)}
                  className="rounded border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>Buffer ({toleranceBufferMeters}m)</span>
              </label>

              <div className="flex items-center border border-[#E2E8F0] rounded-lg bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(z + 0.2, 2.4))}
                  title="Zoom In"
                  className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(z - 0.2, 0.8))}
                  title="Zoom Out"
                  className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] border-l border-[#E2E8F0] transition-colors cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Reset View"
                  className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] border-l border-[#E2E8F0] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="relative bg-[#F1F5F9] h-[480px] overflow-hidden">
            <svg
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              className="w-full h-full cursor-crosshair select-none"
              style={{
                transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
            >
              <defs>
                <pattern id="cadastreGridModern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
                </pattern>
                <pattern id="subGridModern" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#E2E8F0" strokeWidth="0.5" />
                </pattern>
                <pattern
                  id="revokedHatchModern"
                  width="8"
                  height="8"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#DC2626" strokeWidth="1.5" opacity="0.35" />
                </pattern>
              </defs>

              <rect width={mapWidth} height={mapHeight} fill="#F1F5F9" />
              <rect width={mapWidth} height={mapHeight} fill="url(#subGridModern)" />
              <rect width={mapWidth} height={mapHeight} fill="url(#cadastreGridModern)" />

              <path
                d="M 50 260 Q 250 280 450 240 T 750 260"
                fill="none"
                stroke="#0EA5E9"
                strokeWidth="2.2"
                strokeOpacity="0.45"
                strokeDasharray="5,4"
              />
              <text x="68" y="252" fill="#0284C7" fillOpacity="0.85" fontSize="10" fontFamily="monospace">
                Usuma River Cadastral Corridor
              </text>

              <text x="56" y="492" fill="#64748B" fontSize="10" fontFamily="monospace">
                WGS 84 (EPSG:4326) · 9.050°N–9.092°N / 7.465°E–7.525°E
              </text>

              {filteredParcels.map((parcel) => {
                const isSelected = parcel.id === selectedParcel?.id;
                const style = getStatusStyle(parcel);
                const points = parcel.coordinates.map((c) => projectCoord(c[0], c[1]));
                const pointsStr = points.map((p) => `${p[0]},${p[1]}`).join(' ');

                const avgX = points.reduce((acc, p) => acc + p[0], 0) / points.length;
                const avgY = points.reduce((acc, p) => acc + p[1], 0) / points.length;

                return (
                  <g key={parcel.id} onClick={() => onSelectParcel(parcel.id)} className="cursor-pointer">
                    {showBuffer && (
                      <polygon
                        points={pointsStr}
                        fill="none"
                        className={style.bufferStroke}
                        strokeWidth={isSelected ? '11' : '7'}
                        strokeLinejoin="round"
                      />
                    )}

                    <polygon
                      points={pointsStr}
                      className={`${style.fill} ${isSelected ? 'stroke-[#2563EB]' : style.stroke} transition-all duration-150`}
                      strokeWidth={isSelected ? '2.5' : '1.6'}
                      strokeDasharray={parcel.status === 'REJECTED' ? '6,4' : undefined}
                    />

                    {(parcel.isRevoked || parcel.status === 'REVOKED') && (
                      <polygon points={pointsStr} fill="url(#revokedHatchModern)" />
                    )}

                    {points.map((pt, idx) => (
                      <circle
                        key={idx}
                        cx={pt[0]}
                        cy={pt[1]}
                        r={isSelected ? '3.5' : '2'}
                        fill={isSelected ? '#2563EB' : '#64748B'}
                        stroke="#FFFFFF"
                        strokeWidth="1"
                      />
                    ))}

                    <g transform={`translate(${avgX}, ${avgY})`}>
                      <rect
                        x="-56"
                        y="-12"
                        width="112"
                        height="24"
                        rx="6"
                        fill="#FFFFFF"
                        fillOpacity="0.96"
                        stroke={isSelected ? '#2563EB' : '#CBD5E1'}
                        strokeWidth={isSelected ? '1.5' : '1'}
                      />
                      <text
                        textAnchor="middle"
                        y="3.5"
                        fill={isSelected ? '#2563EB' : '#0F172A'}
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        {parcel.titleNumber}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            <div className="absolute bottom-3 right-3 bg-white/95 border border-[#E2E8F0] px-3 py-2 rounded-lg text-[11px] text-[#334155] space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#059669]/25 border border-[#059669] inline-block" />
                <span>Title NFT Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#D97706]/25 border border-[#D97706] inline-block" />
                <span>Awaiting Verification</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]/25 border border-[#DC2626] inline-block" />
                <span>Revoked (Sec. 28)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Parcel Dossier */}
        <div className="lg:col-span-5">
          {selectedParcel ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
              <div className="border-b border-[#F1F5F9] pb-4">
                <div className="flex items-center justify-between text-[12px] text-[#64748B]">
                  <span>Cadastral Dossier</span>
                  <span className={`font-semibold ${getStatusStyle(selectedParcel).textClass}`}>
                    {getStatusStyle(selectedParcel).label}
                  </span>
                </div>
                <h2 className="font-serif text-[22px] text-[#0F172A] mt-1">
                  {selectedParcel.titleNumber}
                </h2>
                <p className="text-[13px] text-[#475569] mt-0.5">
                  {selectedParcel.locationName} · {selectedParcel.lga}, {selectedParcel.state}
                </p>
              </div>

              {selectedParcel.isRevoked && selectedParcel.revocationData && (
                <div className="bg-[#FEF2F2] border border-[#FECACA] p-3.5 rounded-lg space-y-1 text-[12px]">
                  <div className="flex items-center gap-1.5 text-[#DC2626] font-semibold">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Revoked under Land Use Act Section 28</span>
                  </div>
                  <p className="text-[#991B1B]">
                    {selectedParcel.revocationData.ground === 'OverridingPublicInterest'
                      ? 'Ground 0: Overriding Public Interest'
                      : 'Ground 1: Breach of Statutory Condition'}
                    {' · '}
                    {selectedParcel.revocationData.reasonDetail}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[13px]">
                <div>
                  <span className="text-[12px] text-[#64748B] block">Titleholder</span>
                  <span className="font-medium text-[#0F172A] block mt-0.5">{selectedParcel.applicantName}</span>
                  <span className="text-[11px] text-[#64748B] font-mono tabular-nums">
                    {selectedParcel.applicantIdNumber}
                  </span>
                </div>

                <div>
                  <span className="text-[12px] text-[#64748B] block">Surveyed Area</span>
                  <span className="font-medium text-[#0F172A] font-mono tabular-nums block mt-0.5">
                    {selectedParcel.areaSqm.toLocaleString()} m²
                  </span>
                  <span className="text-[11px] text-[#64748B] font-mono tabular-nums">
                    Perimeter {selectedParcel.perimeterMeters} m
                  </span>
                </div>

                <div>
                  <span className="text-[12px] text-[#64748B] block">Land Use</span>
                  <span className="font-medium text-[#0F172A] block mt-0.5">{selectedParcel.landUse}</span>
                </div>

                <div>
                  <span className="text-[12px] text-[#64748B] block">Customary Clan</span>
                  <span className="font-medium text-[#0F172A] block mt-0.5">{selectedParcel.customaryClan}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#F1F5F9] space-y-2.5 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">ERC-721 Token ID</span>
                  <span className="font-mono font-medium text-[#0F172A] tabular-nums">
                    {selectedParcel.nftTokenId ? `#${selectedParcel.nftTokenId}` : 'Pending Issuance'}
                  </span>
                </div>

                <div>
                  <span className="text-[#64748B] block mb-1">Spatial Hash (Keccak-256)</span>
                  <div className="font-mono text-[11px] text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 break-all select-all">
                    {selectedParcel.spatialHash}
                  </div>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                {selectedParcel.status === 'NFT_ISSUED' && (
                  <button
                    type="button"
                    onClick={() => onOpenCertificate(selectedParcel)}
                    className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Award className="w-4 h-4" />
                    <span>View Certificate of Occupancy</span>
                  </button>
                )}

                {selectedParcel.nftTokenId && !selectedParcel.isRevoked && (
                  <button
                    type="button"
                    onClick={() => onOpenRevokeModal(selectedParcel)}
                    className="w-full py-2.5 px-4 bg-white hover:bg-[#FEF2F2] text-[#DC2626] border border-[#E2E8F0] hover:border-[#FECACA] rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>
                      {activeRole === 'GOVERNOR'
                        ? 'Revoke Title (Section 28)'
                        : 'Revoke Title (Governor Role)'}
                    </span>
                  </button>
                )}
              </div>

              <div className="pt-4 border-t border-[#F1F5F9] space-y-2.5">
                <span className="text-[13px] font-semibold text-[#0F172A] block">Audit Trail</span>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {selectedParcel.timeline.map((event, idx) => (
                    <div key={idx} className="py-2 border-b border-[#F1F5F9] last:border-0 text-[12px]">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#0F172A]">{event.stage}</span>
                        <span className="text-[11px] font-mono text-[#64748B]">
                          {new Date(event.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[#475569] text-[11px] mt-0.5">{event.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-[#475569] text-[13px]">
              Select a parcel on the map to inspect its record.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
