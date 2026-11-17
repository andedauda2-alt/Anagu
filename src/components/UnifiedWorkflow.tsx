import React, { useEffect, useState } from 'react';
import { Coordinate, Parcel, UserRole } from '../types';
import { workflowEngine } from '../core/workflowEngine';
import {
  approveByRegistrarFirestore,
  cancelApplicationFirestore,
  importParcelsFirestore,
  issueBlockchainTitleNFTFirestore,
  submitApplicationFirestore,
  syncQueuedOfflineRegistrationsFirestore,
  verifyLegalFirestore,
  verifyOracleFirestore,
  verifySpatialFirestore,
} from '../core/firestoreCadastre';
import { mqttBrokerEngine, OFFLINE_QUEUE_STORAGE_KEY, OfflineQueueItem } from '../core/oracleMqttEngine';
import { extractReadableError } from '../core/firebase';
import { useAuth } from '../core/authContext';
import { GpsSurveyModal } from './GpsSurveyModal';
import { Web3Service } from '../core/web3Service';
import { computeFileSHA256, formatBytes } from '../core/documentCrypto';
import { StorageEngine } from '../core/storageEngine';
import {
  FileText,
  ShieldCheck,
  Building,
  CheckCircle,
  FileBadge,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  Wallet,
  Upload,
  Navigation,
  Download,
  WifiOff,
  RefreshCw,
  XCircle,
} from 'lucide-react';

interface UnifiedWorkflowProps {
  parcels: Parcel[];
  activeRole: UserRole;
  selectedParcelId?: string | null;
  onRefresh: () => void;
  onSelectParcel: (id: string) => void;
  onOpenCertificate: (parcel: Parcel) => void;
}

export const UnifiedWorkflow: React.FC<UnifiedWorkflowProps> = ({
  parcels,
  activeRole,
  selectedParcelId,
  onRefresh,
  onSelectParcel,
  onOpenCertificate,
}) => {
  const { firebaseUser, userProfile, userPii, isAdmin } = useAuth();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>(
    selectedParcelId || parcels[0]?.id || ''
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [offlineQueuedApps, setOfflineQueuedApps] = useState<OfflineQueueItem[]>(() =>
    mqttBrokerEngine.getOfflineQueueItems().filter((i) => i.kind === 'registration')
  );

  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const [applicantName, setApplicantName] = useState(userProfile?.displayName || 'Chief Emmanuel Adeleke');
  const [applicantIdNumber, setApplicantIdNumber] = useState(userPii?.nin || 'NIN-88223344112');
  const [applicantAddress, setApplicantAddress] = useState(userPii?.address || 'Plot 22 Garki 2, Abuja');
  const [applicantPhone, setApplicantPhone] = useState(userPii?.phone || '+234 802 111 8899');
  const [applicantWallet, setApplicantWallet] = useState(
    userProfile?.walletAddress || '0x627306090abaB3A6e1400e9345bC60c78a8BEf57'
  );
  const [locationName, setLocationName] = useState('Garki Central Cadastral Zone B03');
  const [lga, setLga] = useState('Abuja Municipal');
  const [state, setState] = useState('FCT');
  const [landUse, setLandUse] = useState<'Residential' | 'Commercial' | 'Agricultural' | 'Industrial' | 'Public Reserve'>('Residential');
  const [deedReference, setDeedReference] = useState('DEED-FCT-2024-001');
  const [customaryClan, setCustomaryClan] = useState('Gbagyi Indigenous Council');
  const [documentHash, setDocumentHash] = useState('0xValidDigitalDeedStamp_778899');

  const [isGpsModalOpen, setIsGpsModalOpen] = useState(false);
  const [customGpsCoords, setCustomGpsCoords] = useState<Coordinate[] | null>(null);
  const [surveyBeacons, setSurveyBeacons] = useState<
    Array<{ beaconNumber: string; coordinates: Coordinate; accuracyMeters?: number; recordedAt: number }>
  >([]);
  const [uploadedFileDoc, setUploadedFileDoc] = useState<{
    fileName: string;
    fileSize: number;
    fileType: string;
    sha256: string;
  } | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);

  const [coordType, setCoordType] = useState<'clean' | 'overlapping' | 'self_intersecting' | 'field_gps'>('clean');

  useEffect(() => {
    const syncQueueState = () => {
      setOfflineQueuedApps(mqttBrokerEngine.getOfflineQueueItems().filter((i) => i.kind === 'registration'));
    };
    const unsub = mqttBrokerEngine.subscribeQueueChanges(syncQueueState);
    return unsub;
  }, []);

  useEffect(() => {
    if (selectedParcelId && parcels.some((p) => p.id === selectedParcelId)) {
      setSelectedApplicationId(selectedParcelId);
      setIsSubmittingNew(false);
    }
  }, [selectedParcelId, parcels]);

  useEffect(() => {
    if (!selectedApplicationId && parcels.length > 0) {
      setSelectedApplicationId(parcels[0].id);
    }
  }, [parcels, selectedApplicationId]);

  useEffect(() => {
    setConfirmCancelId(null);
  }, [selectedApplicationId]);

  useEffect(() => {
    if (userProfile?.displayName) setApplicantName(userProfile.displayName);
    if (userProfile?.walletAddress) setApplicantWallet(userProfile.walletAddress);
    if (userPii?.nin) setApplicantIdNumber(userPii.nin);
    if (userPii?.address) setApplicantAddress(userPii.address);
    if (userPii?.phone) setApplicantPhone(userPii.phone);
  }, [userProfile, userPii]);

  const selectedParcel = parcels.find((p) => p.id === selectedApplicationId) || parcels[0];
  const outcomesTable = workflowEngine.getWorkflowOutcomesTable();

  const getCoordinatesPreset = (type: 'clean' | 'overlapping' | 'self_intersecting' | 'field_gps'): Coordinate[] => {
    if (type === 'field_gps' && customGpsCoords && customGpsCoords.length >= 3) {
      return customGpsCoords;
    }
    if (type === 'clean') {
      return [
        [7.5120, 9.0770],
        [7.5180, 9.0770],
        [7.5180, 9.0820],
        [7.5120, 9.0820],
        [7.5120, 9.0770],
      ];
    }
    if (type === 'overlapping') {
      return [
        [7.4980, 9.0840],
        [7.5040, 9.0840],
        [7.5040, 9.0890],
        [7.4980, 9.0890],
        [7.4980, 9.0840],
      ];
    }
    return [
      [7.5100, 9.0700],
      [7.5180, 9.0780],
      [7.5100, 9.0780],
      [7.5180, 9.0700],
      [7.5100, 9.0700],
    ];
  };

  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    const res = await Web3Service.connectWallet();
    setIsConnectingWallet(false);
    if (res.success && res.address) {
      setApplicantWallet(res.address);
      setFeedback({
        type: 'success',
        message: `Web3 wallet connected: ${res.address.slice(0, 8)}...${res.address.slice(-6)}`,
      });
    } else {
      const fallback = Web3Service.generateDemoWallet();
      setApplicantWallet(fallback.address);
      setFeedback({
        type: 'info',
        message: `${res.error || 'No wallet detected'}. Assigned secure keypair: ${fallback.address.slice(0, 10)}...`,
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const sha256 = await computeFileSHA256(file);
      setDocumentHash(sha256);
      setUploadedFileDoc({
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/pdf',
        sha256,
      });
      setFeedback({
        type: 'success',
        message: `Document "${file.name}" (${formatBytes(file.size)}) SHA-256 computed: ${sha256.slice(0, 18)}...`,
      });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to compute SHA-256 hash of document.' });
    }
  };

  const handleExportGeoJSON = () => {
    const geojson = StorageEngine.exportToGeoJSON(parcels);
    StorageEngine.triggerDownload(geojson, 'anagu_national_cadastre.geojson', 'application/geo+json');
    setFeedback({
      type: 'success',
      message: 'Downloaded anagu_national_cadastre.geojson (RFC 7946 Standard format for QGIS/ArcGIS).',
    });
  };

  const handleImportGeoJSONFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsProcessing(true);
        const text = event.target?.result as string;
        const imported = StorageEngine.parseGeoJSONImport(text);
        if (imported.length === 0) {
          setFeedback({ type: 'error', message: 'No valid Polygon features found in GeoJSON file.' });
          return;
        }
        const count = await importParcelsFirestore(imported);
        onRefresh();
        setFeedback({
          type: 'success',
          message: `Successfully imported ${count} cadastral parcel(s) into Cloud Firestore.`,
        });
      } catch (err) {
        setFeedback({ type: 'error', message: extractReadableError(err) });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setFeedback(null);

    try {
      const coords = getCoordinatesPreset(coordType);

      const sigRes = await Web3Service.signLandTitle(applicantWallet, {
        titleNumber: 'NG-PENDING-' + Date.now().toString().slice(-4),
        spatialHash: '0x' + applicantName.length,
        applicantName,
        timestamp: Date.now(),
      });

      const res = await submitApplicationFirestore(
        {
          applicantName,
          applicantIdNumber,
          applicantAddress,
          applicantPhone,
          applicantWalletAddress: applicantWallet,
          locationName,
          lga,
          state,
          coordinates: coords,
          areaSqm: 308000,
          perimeterMeters: 2200,
          documentHash,
          documentAttachment: uploadedFileDoc
            ? { ...uploadedFileDoc, uploadedAt: Date.now() }
            : undefined,
          surveyBeacons: surveyBeacons.length > 0 ? surveyBeacons : undefined,
          signatureProof:
            sigRes.success && sigRes.signature
              ? {
                  signerAddress: applicantWallet,
                  signature: sigRes.signature,
                  messageHash: documentHash,
                  timestamp: Date.now(),
                }
              : undefined,
          landUse,
          deedReference,
          customaryClan,
          communityElderAttestation: 'Attested in customary council ledger',
        },
        activeRole
      );

      if (res.queuedOffline) {
        setFeedback({
          type: 'info',
          message: `Offline mode active: Application queued in localStorage (${OFFLINE_QUEUE_STORAGE_KEY}, ID: ${res.queueId}). It will sync automatically upon reconnect.`,
        });
        setIsSubmittingNew(false);
      } else if (res.success && res.parcel) {
        setFeedback({
          type: 'success',
          message: `Application ${res.parcel.titleNumber} saved to Firestore with cryptographic proofs.`,
        });
        setSelectedApplicationId(res.parcel.id);
        setIsSubmittingNew(false);
        onRefresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to submit application.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncOfflineQueue = async () => {
    setIsProcessing(true);
    setFeedback(null);
    try {
      const res = await syncQueuedOfflineRegistrationsFirestore();
      if (res.syncedCount > 0) {
        setFeedback({
          type: 'success',
          message: `Synced ${res.syncedCount} offline application(s) from localStorage to Firestore in ${res.elapsedSec}s.`,
        });
        onRefresh();
      } else if (res.failedCount > 0) {
        setFeedback({
          type: 'error',
          message: `${res.failedCount} queued application(s) could not sync. Verify network connectivity.`,
        });
      } else {
        setFeedback({ type: 'info', message: 'No offline registration applications waiting in localStorage.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelApplication = async () => {
    if (!selectedParcel) return;
    setIsProcessing(true);
    setFeedback(null);
    try {
      const res = await cancelApplicationFirestore(
        selectedParcel,
        activeRole,
        userProfile?.displayName || selectedParcel.applicantName,
        isAdmin
      );
      if (res.success) {
        setFeedback({
          type: 'info',
          message: `Application ${selectedParcel.titleNumber} withdrawn and marked CANCELLED.`,
        });
        setConfirmCancelId(null);
        onRefresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to cancel application.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunSpatial = async () => {
    if (!selectedParcel) return;
    setIsProcessing(true);
    try {
      const res = await verifySpatialFirestore(
        selectedParcel,
        parcels,
        activeRole,
        userProfile?.displayName || 'Registered Surveyor',
        0.5
      );
      if (res.success) {
        setFeedback({ type: 'success', message: `Spatial verification passed. ${res.outcome}` });
      } else {
        setFeedback({ type: 'error', message: `Spatial verification failed: ${res.error}` });
      }
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunOracle = async () => {
    if (!selectedParcel) return;
    setIsProcessing(true);
    try {
      const res = await verifyOracleFirestore(selectedParcel, activeRole);
      if (res.success) {
        setFeedback({ type: 'success', message: `Oracle verification passed. ${res.outcome}` });
      } else {
        setFeedback({ type: 'error', message: `Oracle verification rejected: ${res.error}` });
      }
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunLegal = async () => {
    if (!selectedParcel) return;
    setIsProcessing(true);
    try {
      const res = await verifyLegalFirestore(
        selectedParcel,
        activeRole,
        userProfile?.displayName || 'Deeds Legal Counsel'
      );
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Legal deeds verification sanctioned under Land Use Act (1978).',
        });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Legal verification failed.' });
      }
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunApproval = async () => {
    if (!selectedParcel) return;
    setIsProcessing(true);
    try {
      const res = await approveByRegistrarFirestore(
        selectedParcel,
        activeRole,
        userProfile?.displayName || 'Registrar of Titles'
      );
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Statutory approval granted by Registrar of Titles.',
        });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Registrar approval failed.' });
      }
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunMintNFT = async () => {
    if (!selectedParcel) return;
    setIsProcessing(true);
    try {
      const res = await issueBlockchainTitleNFTFirestore(selectedParcel, activeRole);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `NFT Title #${res.parcel?.nftTokenId || ''} issued and persisted to Firestore ledger.`,
        });
      } else {
        setFeedback({ type: 'error', message: res.error || 'NFT issuance failed.' });
      }
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const stages = [
    { key: 'SUBMITTED', name: '1. Application Submission', role: 'CITIZEN', icon: FileText },
    { key: 'SPATIAL_VERIFIED', name: '2. Spatial GIS Verification', role: 'SURVEYOR', icon: ShieldCheck },
    { key: 'ORACLE_VERIFIED', name: '3. Community Oracle', role: 'LAND_ADMIN', icon: Building },
    { key: 'LEGAL_VERIFIED', name: '4. Legal Verification', role: 'REGISTRAR', icon: CheckCircle },
    { key: 'APPROVED', name: '5. Registrar Approval', role: 'REGISTRAR', icon: CheckCircle2 },
    { key: 'NFT_ISSUED', name: '6. NFT Title Issuance', role: 'REGISTRAR', icon: FileBadge },
  ];

  const getStageIndex = (status: string) => {
    if (status === 'SUBMITTED') return 0;
    if (status === 'SPATIAL_VERIFIED') return 1;
    if (status === 'ORACLE_VERIFIED') return 2;
    if (status === 'LEGAL_VERIFIED') return 3;
    if (status === 'APPROVED') return 4;
    if (status === 'NFT_ISSUED' || status === 'REVOKED') return 5;
    return -1;
  };

  const currentStageIndex = selectedParcel ? getStageIndex(selectedParcel.status) : -1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] sm:text-[32px] leading-tight text-[#0F172A] font-normal">
            Land Registration &amp; Verification Pipeline
          </h1>
          <p className="mt-1 text-[14px] text-[#475569]">
            Submit statutory applications, capture GPS boundary beacons, verify deeds, and issue Title NFTs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsSubmittingNew(!isSubmittingNew)}
          className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSubmittingNew ? 'Close application form' : 'Submit new application'}</span>
        </button>
      </div>

      {offlineQueuedApps.length > 0 && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] px-4 py-3 rounded-xl text-[13px] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0 text-[#D97706]" />
            <span>
              <strong>{offlineQueuedApps.length}</strong> offline registration
              {offlineQueuedApps.length === 1 ? ' is' : 's are'} persisted in{' '}
              <code className="font-mono text-[11.5px] bg-white/80 px-1.5 py-0.5 rounded border border-[#FDE68A]">
                {OFFLINE_QUEUE_STORAGE_KEY}
              </code>
              .
            </span>
          </div>
          <button
            type="button"
            disabled={isProcessing || !mqttBrokerEngine.isOnline}
            onClick={handleSyncOfflineQueue}
            className="px-3 py-1.5 bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{mqttBrokerEngine.isOnline ? 'Sync Queued Apps Now' : 'Offline — Waiting to Sync'}</span>
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl text-[13px] flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
              : feedback.type === 'error'
              ? 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
              : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[#475569] hover:text-[#0F172A] font-medium ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Application Selector & GeoJSON Toolbar */}
      <div className="bg-white border border-[#E2E8F0] p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="select-land-app" className="text-[13px] font-medium text-[#475569]">
            Active filing:
          </label>
          <select
            id="select-land-app"
            value={selectedParcel?.id || ''}
            onChange={(e) => {
              setSelectedApplicationId(e.target.value);
              onSelectParcel(e.target.value);
            }}
            className="bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0] text-[13px] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer"
          >
            {parcels.length === 0 ? (
              <option value="">No filings available</option>
            ) : (
              parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titleNumber} — {p.applicantName} ({p.status})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportGeoJSON}
            disabled={parcels.length === 0}
            className="px-3 py-1.5 bg-white hover:bg-[#F8FAFC] disabled:opacity-50 text-[#0F172A] rounded-lg text-[12px] font-medium flex items-center gap-1.5 border border-[#E2E8F0] transition-colors cursor-pointer"
            title="Download GeoJSON (RFC 7946) for QGIS/ArcGIS"
          >
            <Download className="w-3.5 h-3.5 text-[#059669]" />
            <span>Export GeoJSON</span>
          </button>

          <label className="px-3 py-1.5 bg-white hover:bg-[#F8FAFC] text-[#0F172A] rounded-lg text-[12px] font-medium flex items-center gap-1.5 border border-[#E2E8F0] transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Import Survey File</span>
            <input
              type="file"
              accept=".geojson,.json"
              disabled={isProcessing}
              onChange={handleImportGeoJSONFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {isSubmittingNew && (
        <form
          onSubmit={handleCreateApplication}
          className="bg-white border border-[#2563EB]/40 p-6 rounded-xl space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-4">
            <div>
              <h2 className="font-serif text-[20px] text-[#0F172A]">
                Statutory Land Title Application
              </h2>
              <p className="text-[13px] text-[#475569]">
                Filing under the Nigeria Land Use Act (1978) · Required role: CITIZEN or LAND_ADMIN
              </p>
            </div>
            <span className="text-[12px] font-mono text-[#475569]">
              Active role: <strong className="text-[#0F172A]">{activeRole}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px]">
            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Applicant Legal Name</label>
              <input
                type="text"
                maxLength={120}
                minLength={2}
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                required
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <label className="text-[#475569] text-[12px] block mb-1">National Identity No (NIN / RC)</label>
              <input
                type="text"
                maxLength={64}
                minLength={2}
                value={applicantIdNumber}
                onChange={(e) => setApplicantIdNumber(e.target.value)}
                required
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#475569] text-[12px] block">Signer Wallet Address</label>
                <button
                  type="button"
                  onClick={handleConnectWallet}
                  disabled={isConnectingWallet}
                  className="text-[11px] text-[#2563EB] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Wallet className="w-3 h-3" />
                  <span>{isConnectingWallet ? 'Connecting...' : 'Connect Web3'}</span>
                </button>
              </div>
              <input
                type="text"
                maxLength={64}
                minLength={10}
                value={applicantWallet}
                onChange={(e) => setApplicantWallet(e.target.value)}
                required
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] font-mono text-[12px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Contact Address</label>
              <input
                type="text"
                maxLength={240}
                minLength={2}
                value={applicantAddress}
                onChange={(e) => setApplicantAddress(e.target.value)}
                required
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Telephone</label>
              <input
                type="text"
                maxLength={40}
                minLength={3}
                value={applicantPhone}
                onChange={(e) => setApplicantPhone(e.target.value)}
                required
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Local Gov. Area / State</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  maxLength={80}
                  minLength={2}
                  value={lga}
                  onChange={(e) => setLga(e.target.value)}
                  required
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
                <input
                  type="text"
                  maxLength={40}
                  minLength={2}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>

            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Parcel Location / Cadastral Sector</label>
              <input
                type="text"
                maxLength={160}
                minLength={2}
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                required
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Land Use Classification</label>
              <select
                value={landUse}
                onChange={(e) => setLandUse(e.target.value as Parcel['landUse'])}
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Agricultural">Agricultural</option>
                <option value="Industrial">Industrial</option>
                <option value="Public Reserve">Public Reserve</option>
              </select>
            </div>

            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Customary Clan Authority</label>
              <select
                value={customaryClan}
                onChange={(e) => setCustomaryClan(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value="Gbagyi Indigenous Council">Gbagyi Indigenous Council (FCT)</option>
                <option value="Elegushi Royal Family">Elegushi Royal Family (Lagos)</option>
                <option value="Umueze Heritage Clan">Umueze Heritage Clan (Enugu - Disputed)</option>
              </select>
            </div>

            {/* Survey Plan Upload */}
            <div className="md:col-span-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[#0F172A] font-medium text-[13px] flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Supporting Survey Plan / Title Deed (Web Crypto SHA-256)</span>
                </label>
                <span className="text-[11px] text-[#64748B] font-mono">Client-side SHA-256 Digest</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  onChange={handleFileUpload}
                  className="text-[12px] text-[#475569] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#E2E8F0] file:text-[12px] file:font-medium file:bg-white file:text-[#0F172A] hover:file:bg-[#F1F5F9] cursor-pointer"
                />
                {uploadedFileDoc && (
                  <span className="text-[12px] text-[#059669] font-mono">
                    {uploadedFileDoc.fileName} ({formatBytes(uploadedFileDoc.fileSize)})
                  </span>
                )}
              </div>

              <div className="text-[11px] font-mono text-[#475569] truncate bg-white px-3 py-1.5 rounded-lg border border-[#E2E8F0]">
                SHA-256 Digest: <span className="text-[#0F172A] select-all">{documentHash}</span>
              </div>
            </div>

            {/* Boundary Geometry Source */}
            <div className="md:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="text-[#475569] text-[12px] font-medium">Boundary Geometry Source</label>
                <button
                  type="button"
                  onClick={() => setIsGpsModalOpen(true)}
                  className="text-[12px] text-[#2563EB] hover:underline flex items-center gap-1.5 font-medium cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Open Live Device GPS Beacon Recorder</span>
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCoordType('clean')}
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    coordType === 'clean'
                      ? 'bg-[#ECFDF5] border-[#059669] text-[#0F172A]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] hover:border-[#94A3B8]'
                  }`}
                >
                  <span className="block font-semibold text-[12.5px]">1. Clean Polygon</span>
                  <span className="text-[11px] text-[#64748B]">Valid non-overlapping</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCoordType('overlapping')}
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    coordType === 'overlapping'
                      ? 'bg-[#FFFBEB] border-[#D97706] text-[#0F172A]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] hover:border-[#94A3B8]'
                  }`}
                >
                  <span className="block font-semibold text-[12.5px]">2. Encroaching Plot</span>
                  <span className="text-[11px] text-[#64748B]">Triggers ST_Intersects</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCoordType('self_intersecting')}
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    coordType === 'self_intersecting'
                      ? 'bg-[#FEF2F2] border-[#DC2626] text-[#0F172A]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] hover:border-[#94A3B8]'
                  }`}
                >
                  <span className="block font-semibold text-[12.5px]">3. Bow-Tie Knot</span>
                  <span className="text-[11px] text-[#64748B]">Triggers ST_IsValid kink</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (customGpsCoords && customGpsCoords.length >= 3) {
                      setCoordType('field_gps');
                    } else {
                      setIsGpsModalOpen(true);
                    }
                  }}
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    coordType === 'field_gps'
                      ? 'bg-[#EFF6FF] border-[#2563EB] text-[#0F172A]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] hover:border-[#94A3B8]'
                  }`}
                >
                  <span className="block font-semibold text-[12.5px]">4. Live GPS Survey</span>
                  <span className="text-[11px] text-[#64748B]">
                    {surveyBeacons.length > 0 ? `${surveyBeacons.length} pins captured` : 'Click to record pins'}
                  </span>
                </button>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="text-[#475569] text-[12px] block mb-1">Deed Reference Code</label>
              <input
                type="text"
                maxLength={80}
                minLength={3}
                value={deedReference}
                onChange={(e) => setDeedReference(e.target.value)}
                required
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] font-mono text-[12px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={() => setIsSubmittingNew(false)}
              className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] rounded-lg text-[13px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium cursor-pointer"
            >
              {isProcessing ? 'Submitting to Firestore...' : 'Submit Application to Pipeline'}
            </button>
          </div>
        </form>
      )}

      {selectedParcel && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] font-mono text-[#64748B]">Active filing</span>
                <span className="font-serif text-[20px] text-[#0F172A]">{selectedParcel.titleNumber}</span>
              </div>
              <p className="text-[13px] text-[#475569] mt-0.5">
                Applicant: <strong className="font-medium text-[#0F172A]">{selectedParcel.applicantName}</strong> ·{' '}
                {selectedParcel.locationName}
              </p>
            </div>

            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="text-[#64748B]">Status:</span>
              <span
                className={`font-semibold ${
                  selectedParcel.status === 'NFT_ISSUED'
                    ? 'text-[#059669]'
                    : selectedParcel.status === 'REVOKED' || selectedParcel.status === 'REJECTED'
                    ? 'text-[#DC2626]'
                    : 'text-[#D97706]'
                }`}
              >
                {selectedParcel.status}
              </span>
            </div>
          </div>

          {/* 6-Stage Stepper Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
            {stages.map((stage, idx) => {
              const isPast = currentStageIndex > idx || selectedParcel.status === 'NFT_ISSUED';
              const isCurrent = currentStageIndex === idx && selectedParcel.status !== 'NFT_ISSUED';
              const Icon = stage.icon;

              return (
                <div
                  key={stage.key}
                  className={`p-3 rounded-lg border flex flex-col justify-between transition-colors ${
                    isPast
                      ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                      : isCurrent
                      ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1E40AF]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-4 h-4" />
                    {isPast ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
                    ) : isCurrent ? (
                      <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                    ) : (
                      <span className="text-[11px] font-mono">0{idx + 1}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[12px] font-medium block leading-snug">{stage.name}</span>
                    <span className="text-[10px] font-mono block mt-1 opacity-80">Role: {stage.role}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Next Pipeline Gate */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-5 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[#0F172A]">Next Pipeline Gate</span>
              <span className="text-[12px] font-mono text-[#475569]">
                Signed in as: <strong className="text-[#0F172A]">{activeRole}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {selectedParcel.status === 'SUBMITTED' && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRunSpatial}
                  className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Execute Stage 2: Spatial GIS Verification (ST_IsValid &amp; ST_Buffer)</span>
                </button>
              )}

              {selectedParcel.status === 'SPATIAL_VERIFIED' && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRunOracle}
                  className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Building className="w-4 h-4" />
                  <span>Execute Stage 3: Community Oracle Verification (Customary + Deeds)</span>
                </button>
              )}

              {selectedParcel.status === 'ORACLE_VERIFIED' && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRunLegal}
                  className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Execute Stage 4: Legal Deeds Verification</span>
                </button>
              )}

              {selectedParcel.status === 'LEGAL_VERIFIED' && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRunApproval}
                  className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Execute Stage 5: Registrar Statutory Approval</span>
                </button>
              )}

              {selectedParcel.status === 'APPROVED' && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRunMintNFT}
                  className="px-4 py-2.5 bg-[#059669] hover:bg-[#047857] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileBadge className="w-4 h-4" />
                  <span>Execute Stage 6: Issue Title NFT &amp; Record Ledger Event</span>
                </button>
              )}

              {selectedParcel.status === 'NFT_ISSUED' && (
                <button
                  type="button"
                  onClick={() => onOpenCertificate(selectedParcel)}
                  className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileBadge className="w-4 h-4" />
                  <span>View Verified Certificate of Occupancy (C of O)</span>
                </button>
              )}

              {(selectedParcel.status === 'REJECTED' ||
                selectedParcel.status === 'REVOKED' ||
                selectedParcel.status === 'CANCELLED') && (
                <span className="text-[13px] text-[#DC2626] font-medium">
                  This filing is closed ({selectedParcel.status}). Select an active filing above or submit a new application.
                </span>
              )}

              {(selectedParcel.applicantUid === firebaseUser?.uid || isAdmin) &&
                ['SUBMITTED', 'SPATIAL_VERIFIED', 'ORACLE_VERIFIED', 'LEGAL_VERIFIED', 'APPROVED'].includes(
                  selectedParcel.status
                ) && (
                  <div className="ml-auto flex items-center gap-2">
                    {confirmCancelId === selectedParcel.id ? (
                      <>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={handleCancelApplication}
                          className="px-3.5 py-2 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white rounded-lg text-[12.5px] font-medium cursor-pointer"
                        >
                          Confirm Withdrawal
                        </button>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => setConfirmCancelId(null)}
                          className="px-3 py-2 bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] rounded-lg text-[12.5px] cursor-pointer"
                        >
                          Keep Filing
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => setConfirmCancelId(selectedParcel.id)}
                        className="px-3.5 py-2 bg-white hover:bg-[#FEF2F2] text-[#DC2626] border border-[#E2E8F0] hover:border-[#FECACA] rounded-lg text-[12.5px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel Application</span>
                      </button>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Workflow Outcomes Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0F172A]">
            End-to-End Registration Workflow Outcomes
          </h2>
          <p className="text-[13px] text-[#475569]">
            Live outcomes across registered cadastre filings in Firestore (N = {outcomesTable.total})
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                <th className="py-2.5 px-3 font-medium">Application Status</th>
                <th className="py-2.5 px-3 text-right font-medium">Frequency [n]</th>
                <th className="py-2.5 px-3 text-right font-medium">Percentage [%]</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {outcomesTable.outcomes.map((row: { status: string; count: number; percentage: number }, i: number) => (
                <tr key={i} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3 text-[#0F172A]">{row.status}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#059669] font-medium">
                    {row.count}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#475569]">
                    {row.percentage.toFixed(1)}%
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[#CBD5E1] font-semibold bg-[#F8FAFC]">
                <td className="py-2.5 px-3 text-[#0F172A]">Total [N]</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#0F172A]">
                  {outcomesTable.total}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#059669]">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <GpsSurveyModal
        isOpen={isGpsModalOpen}
        onClose={() => setIsGpsModalOpen(false)}
        onApplyCoordinates={(coords, beacons) => {
          setCustomGpsCoords(coords);
          setSurveyBeacons(beacons);
          setCoordType('field_gps');
          setFeedback({
            type: 'success',
            message: `Recorded ${beacons.length} GPS survey beacons from live field coordinates.`,
          });
        }}
      />
    </div>
  );
};
