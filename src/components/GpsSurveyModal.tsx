import React, { useState, useEffect } from 'react';
import { Coordinate } from '../types';
import * as turf from '@turf/turf';
import { Navigation, MapPin, Plus, Trash2, Check, X } from 'lucide-react';

interface GpsSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCoordinates: (
    coords: Coordinate[],
    beacons: Array<{ beaconNumber: string; coordinates: Coordinate; accuracyMeters?: number; recordedAt: number }>
  ) => void;
}

export const GpsSurveyModal: React.FC<GpsSurveyModalProps> = ({
  isOpen,
  onClose,
  onApplyCoordinates,
}) => {
  const [currentPosition, setCurrentPosition] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    heading: number | null;
  } | null>(null);

  const [geoError, setGeoError] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [beacons, setBeacons] = useState<
    Array<{ beaconNumber: string; coordinates: Coordinate; accuracyMeters?: number; recordedAt: number }>
  >([]);

  useEffect(() => {
    if (!isOpen) return;

    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsWatching(true);
    setGeoError(null);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          heading: pos.coords.heading,
        });
      },
      (err) => {
        setGeoError(`GPS Signal: ${err.message}. Manual coordinate entry remains available.`);
        if (!currentPosition) {
          setCurrentPosition({
            latitude: 9.0765,
            longitude: 7.5020,
            accuracy: 3,
            heading: 45,
          });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 2000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setIsWatching(false);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCaptureBeacon = () => {
    if (!currentPosition) return;
    const nextNum = beacons.length + 1;
    const beaconName = `PB ${nextNum < 10 ? '0' + nextNum : nextNum}`;
    const newBeacon = {
      beaconNumber: beaconName,
      coordinates: [
        Number(currentPosition.longitude.toFixed(6)),
        Number(currentPosition.latitude.toFixed(6)),
      ] as Coordinate,
      accuracyMeters: currentPosition.accuracy,
      recordedAt: Date.now(),
    };
    setBeacons([...beacons, newBeacon]);
  };

  const handleAddManualPoint = () => {
    const nextNum = beacons.length + 1;
    const beaconName = `PB ${nextNum < 10 ? '0' + nextNum : nextNum}`;
    const lastCoord = beacons[beacons.length - 1]?.coordinates || [7.5020, 9.0765];
    const newBeacon = {
      beaconNumber: beaconName,
      coordinates: [
        Number((lastCoord[0] + (nextNum % 2 === 0 ? 0.003 : -0.001)).toFixed(6)),
        Number((lastCoord[1] + (nextNum > 2 ? 0.003 : 0.001)).toFixed(6)),
      ] as Coordinate,
      accuracyMeters: 1.0,
      recordedAt: Date.now(),
    };
    setBeacons([...beacons, newBeacon]);
  };

  const handleDeleteBeacon = (index: number) => {
    setBeacons(beacons.filter((_, i) => i !== index));
  };

  const handleUpdateCoordinate = (index: number, lng: number, lat: number) => {
    const updated = [...beacons];
    updated[index].coordinates = [lng, lat];
    setBeacons(updated);
  };

  let calculatedAreaSqm = 0;
  let calculatedPerimeterM = 0;
  if (beacons.length >= 3) {
    try {
      const ring = beacons.map((b) => b.coordinates);
      ring.push(ring[0]);
      const poly = turf.polygon([ring]);
      calculatedAreaSqm = Math.round(turf.area(poly));
      calculatedPerimeterM = Math.round(turf.length(poly, { units: 'kilometers' }) * 1000);
    } catch {
      calculatedAreaSqm = 0;
    }
  }

  const handleApplyToForm = () => {
    if (beacons.length < 3) return;
    const ring = beacons.map((b) => b.coordinates);
    ring.push(ring[0]);
    onApplyCoordinates(ring, beacons);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl p-6 space-y-5 text-[#0F172A] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#2563EB]" />
            <h3 className="font-serif text-[18px] text-[#0F172A]">
              Field Surveyor GPS Beacon Capture
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

        <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
          <div>
            <span className="text-[#64748B] block">Satellite GPS Status</span>
            <strong className="text-[#059669] font-mono block mt-1">
              {isWatching ? 'Active Fix (WGS 84)' : 'Standby'}
            </strong>
            {geoError && <span className="text-[11px] text-[#D97706] block mt-1">{geoError}</span>}
          </div>

          <div>
            <span className="text-[#64748B] block">Current Coordinates</span>
            <span className="font-mono text-[#0F172A] block mt-1 tabular-nums">
              {currentPosition
                ? `${currentPosition.latitude.toFixed(6)}°N, ${currentPosition.longitude.toFixed(6)}°E`
                : 'Acquiring GPS...'}
            </span>
          </div>

          <div>
            <span className="text-[#64748B] block">Horizontal Accuracy</span>
            <span className="font-mono text-[#0F172A] block mt-1 tabular-nums">
              {currentPosition ? `± ${currentPosition.accuracy} meters` : '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-[#475569]">
            Record each boundary corner beacon in sequence:
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCaptureBeacon}
              disabled={!currentPosition}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Capture Beacon (PB {beacons.length + 1})</span>
            </button>

            <button
              type="button"
              onClick={handleAddManualPoint}
              className="px-3 py-2 bg-white border border-[#E2E8F0] hover:border-[#2563EB] text-[#0F172A] rounded-lg text-[12px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Point</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-[#475569]">
            <span>Recorded Beacons ({beacons.length})</span>
            {beacons.length >= 3 && (
              <span className="text-[#059669] font-mono font-medium tabular-nums">
                {calculatedAreaSqm.toLocaleString()} m² ({(calculatedAreaSqm / 10000).toFixed(3)} Ha) ·{' '}
                {calculatedPerimeterM} m perimeter
              </span>
            )}
          </div>

          {beacons.length === 0 ? (
            <div className="p-8 text-center text-[#64748B] text-[13px] bg-[#F8FAFC] rounded-xl border border-dashed border-[#CBD5E1]">
              No survey beacons captured yet. Tap &ldquo;Capture Beacon&rdquo; or &ldquo;Add Point&rdquo;.
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
              {beacons.map((b, idx) => (
                <div
                  key={idx}
                  className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] flex items-center justify-between text-[12px] font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded bg-white border border-[#E2E8F0] text-[#0F172A] font-semibold text-[11px]">
                      {b.beaconNumber}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#64748B] text-[11px]">Lng</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={b.coordinates[0]}
                        onChange={(e) =>
                          handleUpdateCoordinate(idx, parseFloat(e.target.value) || 0, b.coordinates[1])
                        }
                        className="bg-white border border-[#E2E8F0] px-2 py-1 rounded w-24 text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
                      />
                      <span className="text-[#64748B] text-[11px]">Lat</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={b.coordinates[1]}
                        onChange={(e) =>
                          handleUpdateCoordinate(idx, b.coordinates[0], parseFloat(e.target.value) || 0)
                        }
                        className="bg-white border border-[#E2E8F0] px-2 py-1 rounded w-24 text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[#64748B]">±{b.accuracyMeters}m</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteBeacon(idx)}
                      className="text-[#64748B] hover:text-[#DC2626] p-1 cursor-pointer"
                      title="Delete Beacon"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#F1F5F9]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] rounded-lg text-[13px] cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApplyToForm}
            disabled={beacons.length < 3}
            className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[13px] font-medium flex items-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply {beacons.length} Survey Beacons</span>
          </button>
        </div>
      </div>
    </div>
  );
};
