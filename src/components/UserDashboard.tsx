import React, { useEffect, useState } from 'react';
import { Parcel, UserRole } from '../types';
import { useAuth } from '../core/authContext';
import { extractReadableError } from '../core/firebase';
import { mqttBrokerEngine, OFFLINE_QUEUE_STORAGE_KEY } from '../core/oracleMqttEngine';
import {
  ArrowRight,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Award,
  FileText,
  WifiOff,
  Search,
} from 'lucide-react';

interface UserDashboardProps {
  parcels: Parcel[];
  activeRole: UserRole;
  onNavigate: (tab: string) => void;
  onSelectParcelAndViewMap: (parcelId: string) => void;
  onSelectParcelAndOpenPipeline: (parcelId: string) => void;
  onOpenCertificate: (parcel: Parcel) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  parcels,
  activeRole,
  onNavigate,
  onSelectParcelAndViewMap,
  onSelectParcelAndOpenPipeline,
  onOpenCertificate,
}) => {
  const {
    firebaseUser,
    userProfile,
    userPii,
    updateOwnContactPii,
  } = useAuth();

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const [showProfileForm, setShowProfileForm] = useState(false);
  const [ninInput, setNinInput] = useState(userPii?.nin || '');
  const [phoneInput, setPhoneInput] = useState(userPii?.phone || '');
  const [addressInput, setAddressInput] = useState(userPii?.address || '');
  const [walletInput, setWalletInput] = useState(userProfile?.walletAddress || '');

  const [offlineRegCount, setOfflineRegCount] = useState<number>(
    () => mqttBrokerEngine.getOfflineQueueItems().filter((i) => i.kind === 'registration').length
  );

  useEffect(() => {
    return mqttBrokerEngine.subscribeQueueChanges(() => {
      setOfflineRegCount(
        mqttBrokerEngine.getOfflineQueueItems().filter((i) => i.kind === 'registration').length
      );
    });
  }, []);

  const roleDisplayName: Record<UserRole, string> = {
    REGISTRAR: 'Registrar',
    CITIZEN: 'Citizen',
    SURVEYOR: 'Surveyor',
    LAND_ADMIN: 'Administrator',
    GOVERNOR: 'Governor',
  };

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const myParcels = firebaseUser
    ? parcels.filter((p) => p.applicantUid === firebaseUser.uid)
    : [];

  const myAwaitingCount = myParcels.filter(
    (p) =>
      p.status !== 'NFT_ISSUED' &&
      p.status !== 'REVOKED' &&
      p.status !== 'REJECTED' &&
      p.status !== 'CANCELLED'
  ).length;
  const myIssuedCount = myParcels.filter((p) => p.status === 'NFT_ISSUED' && !p.isRevoked).length;
  const myClosedCount = myParcels.filter(
    (p) => p.isRevoked || p.status === 'REJECTED' || p.status === 'CANCELLED'
  ).length;

  const myRecentEvents = myParcels
    .flatMap((p) =>
      p.timeline.map((ev) => ({
        id: `${p.id}-${ev.id}`,
        parcelId: p.id,
        titleNumber: p.titleNumber,
        stage: ev.stage,
        status: ev.status,
        timestamp: ev.timestamp,
      }))
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  const handleSavePrivateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setFeedback(null);
    try {
      await updateOwnContactPii({
        nin: ninInput,
        phone: phoneInput,
        address: addressInput,
        walletAddress: walletInput,
      });
      setFeedback({ type: 'success', text: 'Private identity & contact vault updated.' });
      setShowProfileForm(false);
    } catch (err) {
      setFeedback({ type: 'error', text: extractReadableError(err) });
    } finally {
      setBusyAction(false);
    }
  };

  const getStatusBadgeClass = (parcel: Parcel) => {
    if (parcel.isRevoked || parcel.status === 'REVOKED' || parcel.status === 'REJECTED') {
      return 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]';
    }
    if (parcel.status === 'CANCELLED') {
      return 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]';
    }
    if (parcel.status === 'NFT_ISSUED') {
      return 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]';
    }
    return 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]';
  };

  return (
    <div className="space-y-8">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-wider text-[#2563EB] mb-1">
            User Dashboard · Applicant &amp; Titleholder Portal
          </div>
          <h1 className="font-serif text-[32px] sm:text-[36px] leading-tight tracking-tight text-[#0F172A] font-normal">
            {timeGreeting}, {userProfile?.displayName || roleDisplayName[activeRole]}
          </h1>
          <p className="mt-1.5 text-[14px] text-[#475569]">
            Track your land title applications, download issued Certificates of Occupancy, and manage your identity vault.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
          <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] px-3.5 py-2 rounded-lg">
            <UserCheck className="w-4 h-4 text-[#2563EB]" />
            <span className="text-[#475569]">Account Role:</span>
            <span className="font-semibold text-[#0F172A]">{roleDisplayName[activeRole]}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setNinInput(userPii?.nin || '');
              setPhoneInput(userPii?.phone || '');
              setAddressInput(userPii?.address || '');
              setWalletInput(userProfile?.walletAddress || '');
              setShowProfileForm(!showProfileForm);
            }}
            className="px-3.5 py-2 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer"
          >
            {showProfileForm ? 'Close identity vault' : 'Identity & contact vault'}
          </button>
        </div>
      </div>

      {offlineRegCount > 0 && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] px-4 py-3 rounded-xl text-[13px] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0 text-[#D97706]" />
            <span>
              You have <strong>{offlineRegCount}</strong> offline application(s) saved in{' '}
              <code className="font-mono text-[11.5px] bg-white/80 px-1.5 py-0.5 rounded border border-[#FDE68A]">
                {OFFLINE_QUEUE_STORAGE_KEY}
              </code>
              .
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('register')}
            className="text-[12.5px] font-semibold text-[#B45309] hover:underline cursor-pointer"
          >
            Open Register to sync
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl text-[13px] flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[12px] font-medium ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {showProfileForm && (
        <form
          onSubmit={handleSavePrivateProfile}
          className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4"
        >
          <div className="border-b border-[#F1F5F9] pb-3">
            <h2 className="text-[15px] font-semibold text-[#0F172A]">
              Private Identity &amp; Contact Vault
            </h2>
            <p className="text-[12.5px] text-[#475569]">
              Isolated to your account ({userPii?.email || firebaseUser?.email}). Auto-fills new land title filings.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
            <div>
              <label className="text-[#475569] text-[12px] block mb-1">NIN / Corporate RC No.</label>
              <input
                type="text"
                value={ninInput}
                onChange={(e) => setNinInput(e.target.value)}
                placeholder="NIN-12345678901"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Phone Number</label>
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+234 800 000 0000"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Contact Address</label>
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Plot 10 Maitama, Abuja"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
            <div>
              <label className="text-[#475569] text-[12px] block mb-1">Web3 Wallet Address</label>
              <input
                type="text"
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder="0x..."
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 font-mono text-[12px] text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowProfileForm(false)}
              className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#475569] rounded-lg text-[13px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyAction}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-[13px] font-medium cursor-pointer"
            >
              {busyAction ? 'Saving...' : 'Save Private Vault'}
            </button>
          </div>
        </form>
      )}

      {/* 4-Card Personal KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('register')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#0F172A] group-hover:text-[#2563EB] transition-colors tabular-nums">
            {myParcels.length.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">My land filings</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('register')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#D97706] tabular-nums">
            {myAwaitingCount.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">In verification</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('public_verify')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#059669] tabular-nums">
            {myIssuedCount.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">My issued Title NFTs</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('parcel_map')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#64748B] tabular-nums">
            {myClosedCount.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">Withdrawn / rejected</div>
        </button>
      </div>

      {/* 2-Column Workspace: My Filings + My Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0F172A]">My Applications &amp; Title Holdings</h2>
              <p className="text-[12.5px] text-[#475569]">
                Filings submitted under your account ({myParcels.length} total)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>New application</span>
            </button>
          </div>

          {myParcels.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-[13.5px] text-[#475569]">
                You have not submitted any land registration filings yet.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Start a land title application</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {myParcels.map((parcel) => (
                <div key={parcel.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[13px] font-semibold text-[#0F172A]">
                        {parcel.titleNumber}
                      </span>
                      <span
                        className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${getStatusBadgeClass(
                          parcel
                        )}`}
                      >
                        {parcel.status}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-[#475569] mt-1">
                      {parcel.locationName} · {parcel.lga}, {parcel.state} ·{' '}
                      <span className="font-mono tabular-nums">{parcel.areaSqm.toLocaleString()} m²</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectParcelAndViewMap(parcel.id)}
                      className="px-2.5 py-1.5 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] rounded-lg text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3 h-3 text-[#2563EB]" />
                      <span>Map</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectParcelAndOpenPipeline(parcel.id)}
                      className="px-2.5 py-1.5 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] rounded-lg text-[12px] font-medium cursor-pointer"
                    >
                      Track stage
                    </button>
                    {parcel.status === 'NFT_ISSUED' && (
                      <button
                        type="button"
                        onClick={() => onOpenCertificate(parcel)}
                        className="px-2.5 py-1.5 bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] text-[#065F46] rounded-lg text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Award className="w-3 h-3" />
                        <span>C of O</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <h2 className="text-[15px] font-semibold text-[#0F172A]">My Recent Activity</h2>
            {myRecentEvents.length > 0 ? (
              <ul className="space-y-3 text-[13px] text-[#334155]">
                {myRecentEvents.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-2.5">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => onSelectParcelAndOpenPipeline(ev.parcelId)}
                      className="text-left hover:text-[#2563EB] hover:underline underline-offset-4 transition-colors cursor-pointer"
                    >
                      <span className="font-mono text-[12px] text-[#0F172A]">{ev.titleNumber}</span> — {ev.stage}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[#64748B]">
                No filing events on your account yet. Public verified titles remain searchable below.
              </p>
            )}

            <div className="pt-3 border-t border-[#F1F5F9] flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('public_verify')}
                className="px-3.5 py-2 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#0F172A] text-[12.5px] font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Verify any public title</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('parcel_map')}
                className="px-3.5 py-2 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#0F172A] text-[12.5px] font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#059669]" />
                <span>Browse cadastre map</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
