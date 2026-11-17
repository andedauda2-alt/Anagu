import React, { useState } from 'react';
import { gisEngine } from '../core/gisEngine';
import { Sliders, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export const GisVerificationLab: React.FC = () => {
  const [bufferTolerance, setBufferTolerance] = useState<number>(0.5);
  const [activeDataset, setActiveDataset] = useState<'controlled' | 'messy'>('controlled');

  const controlledResult = gisEngine.runBatchSpatialTests('controlled', bufferTolerance);
  const messyResult = gisEngine.runBatchSpatialTests('messy', bufferTolerance);

  const activeResult = activeDataset === 'controlled' ? controlledResult : messyResult;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-[22px] text-[#0F172A]">
              GIS Spatial Verification Lab
            </h2>
            <p className="text-[13px] text-[#475569] mt-0.5">
              PostGIS <code className="font-mono text-[#2563EB]">ST_IsValid()</code> &amp;{' '}
              <code className="font-mono text-[#2563EB]">
                ST_Intersects(ST_Buffer(geom, {bufferTolerance.toFixed(1)}m), existing.geom)
              </code>
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#F8FAFC] px-4 py-2 rounded-lg border border-[#E2E8F0]">
            <Sliders className="w-4 h-4 text-[#2563EB]" />
            <label htmlFor="buffer-tolerance-slider" className="text-[12.5px] text-[#334155] font-medium">
              Buffer tolerance:{' '}
              <strong className="font-mono tabular-nums text-[#2563EB]">{bufferTolerance.toFixed(1)}m</strong>
            </label>
            <input
              id="buffer-tolerance-slider"
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={bufferTolerance}
              onChange={(e) => setBufferTolerance(parseFloat(e.target.value))}
              className="w-28 accent-[#2563EB] cursor-pointer"
            />
          </div>
        </div>

        <p className="text-[13px] text-[#475569] leading-relaxed">
          Reference coordinates: <strong className="text-[#0F172A] font-medium">WGS 84 (EPSG:4326)</strong>. Because
          cadastral survey boundaries rarely align to the millimeter, the spatial verification engine applies an
          adjustable tolerance buffer (<code className="font-mono text-[#0F172A]">0.5m default</code>) to catch slivers,
          encroachments, and boundary overlaps.
        </p>

        <div className="flex flex-wrap gap-2 pt-3 border-t border-[#F1F5F9] text-[13px]">
          <button
            type="button"
            onClick={() => setActiveDataset('controlled')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              activeDataset === 'controlled'
                ? 'bg-[#2563EB] text-white'
                : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Controlled Test Set (Standard Validation)
          </button>
          <button
            type="button"
            onClick={() => setActiveDataset('messy')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              activeDataset === 'messy'
                ? 'bg-[#2563EB] text-white'
                : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Messier Test Set (Slivers &amp; Rotated Overlaps)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2.5">
            <div>
              <h3 className="text-[14px] font-semibold text-[#0F172A]">
                Spatial Verification: Controlled Set
              </h3>
              <p className="text-[11px] text-[#64748B] font-mono">
                Tolerance Buffer = {bufferTolerance.toFixed(1)}m
              </p>
            </div>
            <span className="text-[12px] font-mono tabular-nums text-[#64748B]">
              N = {controlledResult.summary.total}
            </span>
          </div>

          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                <th className="py-2 px-2 font-medium">Validation Outcome</th>
                <th className="py-2 px-2 text-right font-medium">Frequency [n]</th>
                <th className="py-2 px-2 text-right font-medium">Percentage [%]</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#059669] flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Valid and non-overlapping</span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#059669] font-semibold">
                  {controlledResult.summary.validCount}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569]">
                  {controlledResult.summary.validPct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#DC2626] flex items-center gap-1.5 font-medium">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Invalid geometry (ST_IsValid)</span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#DC2626] font-semibold">
                  {controlledResult.summary.invalidGeomCount}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569]">
                  {controlledResult.summary.invalidGeomPct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#D97706] flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Overlapping existing parcel</span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#D97706] font-semibold">
                  {controlledResult.summary.overlapCount}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569]">
                  {controlledResult.summary.overlapPct.toFixed(1)}%
                </td>
              </tr>
              <tr className="border-t border-[#CBD5E1] font-semibold bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">Total [N]</td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#0F172A]">
                  {controlledResult.summary.total}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#059669]">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2.5">
            <div>
              <h3 className="text-[14px] font-semibold text-[#0F172A]">
                Spatial Verification: Messier Set
              </h3>
              <p className="text-[11px] text-[#64748B] font-mono">
                Tolerance Buffer = {bufferTolerance.toFixed(1)}m
              </p>
            </div>
            <span className="text-[12px] font-mono tabular-nums text-[#64748B]">
              N = {messyResult.summary.total}
            </span>
          </div>

          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                <th className="py-2 px-2 font-medium">Validation Outcome</th>
                <th className="py-2 px-2 text-right font-medium">Frequency [n]</th>
                <th className="py-2 px-2 text-right font-medium">Percentage [%]</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#059669] flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Valid and non-overlapping</span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#059669] font-semibold">
                  {messyResult.summary.validCount}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569]">
                  {messyResult.summary.validPct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#DC2626] flex items-center gap-1.5 font-medium">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Invalid geometry (ST_IsValid)</span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#DC2626] font-semibold">
                  {messyResult.summary.invalidGeomCount}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569]">
                  {messyResult.summary.invalidGeomPct.toFixed(1)}%
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#D97706] flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Overlapping existing parcel</span>
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#D97706] font-semibold">
                  {messyResult.summary.overlapCount}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#475569]">
                  {messyResult.summary.overlapPct.toFixed(1)}%
                </td>
              </tr>
              <tr className="border-t border-[#CBD5E1] font-semibold bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">Total [N]</td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#0F172A]">
                  {messyResult.summary.total}
                </td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#059669]">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
          <h3 className="text-[14px] font-semibold text-[#0F172A]">
            Classification Trace ({activeDataset === 'controlled' ? 'Controlled Set' : 'Messier Set'})
          </h3>
          <span className="text-[12px] text-[#64748B]">
            Diagnostic PostGIS topology output per test parcel
          </span>
        </div>

        <div className="space-y-2.5">
          {activeResult.results.map((tc) => (
            <div
              key={tc.id}
              className={`p-3.5 rounded-lg border text-[13px] flex flex-col md:flex-row md:items-center justify-between gap-2 ${
                tc.passed
                  ? 'bg-[#F8FAFC] border-[#E2E8F0]'
                  : 'bg-[#FEF2F2] border-[#FECACA]'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#2563EB] font-semibold text-[12px]">{tc.id}</span>
                  <span className="text-[#0F172A] font-medium">{tc.name}</span>
                </div>
                <p className="text-[12px] text-[#475569] mt-1">{tc.details}</p>
              </div>

              <div className="flex items-center gap-3 text-right">
                <div>
                  <span className="text-[11px] text-[#64748B] block">Classified Outcome</span>
                  <span
                    className={`font-semibold font-mono text-[12px] ${
                      tc.actual === 'Valid and non-overlapping'
                        ? 'text-[#059669]'
                        : tc.actual === 'Invalid geometry'
                        ? 'text-[#DC2626]'
                        : 'text-[#D97706]'
                    }`}
                  >
                    {tc.actual}
                  </span>
                </div>

                <span
                  className={`font-mono text-[11px] font-semibold ${
                    tc.passed ? 'text-[#059669]' : 'text-[#DC2626]'
                  }`}
                >
                  {tc.passed ? 'MATCH' : 'MISMATCH'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
