/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { LedgerEventRecord, Parcel } from './types';
import { useAuth } from './core/authContext';
import {
  loadParcelPrivatePii,
  seedInitialCadastreIfEmpty,
  subscribeToCadastre,
  syncQueuedOfflineRegistrationsFirestore,
} from './core/firestoreCadastre';
import { IS_ADMIN_PORTAL } from './core/firebase';
import { blockchainEngine } from './core/blockchainEngine';
import { mqttBrokerEngine } from './core/oracleMqttEngine';
import { AuthGate } from './components/AuthGate';
import { Navbar } from './components/Navbar';
import { UserDashboard } from './components/UserDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { CadastreMap } from './components/CadastreMap';
import { UnifiedWorkflow } from './components/UnifiedWorkflow';
import { GisVerificationLab } from './components/GisVerificationLab';
import { BlockchainRevocationSuite } from './components/BlockchainRevocationSuite';
import { OracleMqttLab } from './components/OracleMqttLab';
import { CrossCuttingEvaluation } from './components/CrossCuttingEvaluation';
import { PublicVerificationPortal } from './components/PublicVerificationPortal';
import { CertificateModal } from './components/CertificateModal';
import { RevokeModal } from './components/RevokeModal';
import { LogOut, ShieldAlert } from 'lucide-react';

export default function App() {
  const { authReady, firebaseUser, userProfile, activeRole, isAdmin, authError, clearAuthError, signOutUser } = useAuth();
  const portalMode: 'user' | 'admin' = IS_ADMIN_PORTAL ? 'admin' : 'user';
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEventRecord[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [certificateParcel, setCertificateParcel] = useState<Parcel | null>(null);
  const [revokeParcel, setRevokeParcel] = useState<Parcel | null>(null);
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      blockchainEngine.blockNumber++;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep mqttBrokerEngine online flag in sync with browser connectivity & auto-flush localStorage queue on reconnect
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const handleOnline = () => {
      mqttBrokerEngine.isOnline = true;
      mqttBrokerEngine.flushOfflineQueue();
      void syncQueuedOfflineRegistrationsFirestore().catch((err) => {
        console.warn('Auto-sync of offline registrations failed:', err);
      });
    };

    const handleOffline = () => {
      mqttBrokerEngine.isOnline = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine && mqttBrokerEngine.isOnline && mqttBrokerEngine.getOfflineQueueCount() > 0) {
      void syncQueuedOfflineRegistrationsFirestore().catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [authReady, firebaseUser]);

  // Attach Firestore real-time listeners ONLY when authenticated and authorized for the active portal
  useEffect(() => {
    const adminAuthorized = isAdmin || activeRole !== 'CITIZEN';
    const profileReady = isAdmin || userProfile !== null;
    if (
      !authReady ||
      !firebaseUser ||
      (portalMode === 'admin' && (!profileReady || !adminAuthorized))
    ) {
      setParcels([]);
      setLedgerEvents([]);
      setSyncReady(false);
      return;
    }

    let cancelled = false;
    if (isAdmin) {
      void seedInitialCadastreIfEmpty(firebaseUser.uid).catch((err) => {
        console.error('Seed check error:', err);
      });
    }

    const unsub = subscribeToCadastre(
      firebaseUser.uid,
      activeRole,
      isAdmin,
      (liveParcels) => {
        if (cancelled) return;
        setParcels(liveParcels);
        setSyncReady(true);
        setSelectedParcelId((prev) =>
          prev && liveParcels.some((p) => p.id === prev) ? prev : liveParcels[0]?.id || null
        );
      },
      (events) => {
        if (!cancelled) setLedgerEvents(events);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, firebaseUser, activeRole, isAdmin, userProfile, portalMode]);

  const handleOpenCertificate = useCallback(async (parcel: Parcel) => {
    const pii = await loadParcelPrivatePii(parcel.id);
    if (pii) {
      setCertificateParcel({
        ...parcel,
        applicantIdNumber: pii.applicantIdNumber,
        applicantAddress: pii.applicantAddress,
        applicantPhone: pii.applicantPhone,
      });
    } else {
      setCertificateParcel(parcel);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    // Firestore onSnapshot keeps state live automatically
  }, []);

  const handleSelectParcel = (id: string) => {
    setSelectedParcelId(id);
  };

  const handleSelectParcelAndViewMap = (id: string) => {
    setSelectedParcelId(id);
    setCurrentTab('parcel_map');
  };

  const handleSelectParcelAndOpenPipeline = (id: string) => {
    setSelectedParcelId(id);
    setCurrentTab('register');
  };

  const handleSeedCadastre = async () => {
    if (!firebaseUser || !isAdmin) return;
    await seedInitialCadastreIfEmpty(firebaseUser.uid);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-[#475569] text-[14px]">
        Connecting to Anagu Land Registry...
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthGate isAdminRoute={portalMode === 'admin'} />;
  }

  const canAccessAdminDashboard = isAdmin || activeRole !== 'CITIZEN';
  const profileResolved = isAdmin || userProfile !== null;

  if (portalMode === 'admin' && !profileResolved) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-[#475569] text-[14px]">
        Verifying Admin account credentials...
      </div>
    );
  }

  if (portalMode === 'admin' && !canAccessAdminDashboard) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-center items-center px-6 py-12 font-sans">
        <div className="w-full max-w-[460px] bg-white border border-[#FECACA] rounded-2xl p-8 text-center space-y-5 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <div className="text-[11.5px] font-mono uppercase tracking-wider text-[#DC2626] font-semibold">
              Access Denied · Admin Portal (/admin)
            </div>
            <h1 className="font-serif text-[26px] leading-tight text-[#0F172A] font-normal">
              Separate Admin Account Required
            </h1>
            <p className="text-[13.5px] text-[#475569] leading-relaxed">
              Standard user accounts (<strong className="font-mono text-[#0F172A]">{activeRole}</strong>) do not have access to the Admin Portal.
              Signed in as <span className="font-medium text-[#0F172A]">{firebaseUser.email}</span>.
            </p>
          </div>
          <div className="pt-1 space-y-2.5">
            <button
              type="button"
              onClick={signOutUser}
              className="w-full py-2.5 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white text-[13.5px] font-medium rounded-xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out &amp; sign in with Admin account</span>
            </button>
            <a
              href="/"
              className="block w-full py-2.5 px-4 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] text-[13px] font-medium rounded-xl transition-colors"
            >
              Return to User Portal (/)
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isMapGroup = currentTab === 'parcel_map' || currentTab === 'comp1_gis';
  const isTitleGroup =
    currentTab === 'title_nft' ||
    currentTab === 'public_verify' ||
    currentTab === 'comp3_oracle' ||
    currentTab === 'comp4_eval';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans selection:bg-[#2563EB]/15 selection:text-[#0F172A]">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        activeRole={activeRole}
        userName={userProfile?.displayName || firebaseUser.displayName || 'Registry User'}
        onSignOut={signOutUser}
        portalMode={portalMode}
      />

      <main className="flex-1 max-w-[1080px] w-full mx-auto px-6 sm:px-8 py-8 sm:py-10 space-y-6">
        {authError && (
          <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] rounded-xl px-4 py-3 text-[13px] flex items-center justify-between gap-3">
            <span>{authError}</span>
            <button
              type="button"
              onClick={clearAuthError}
              className="text-[12px] font-medium text-[#991B1B] hover:underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {!syncReady && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 text-[13px] text-[#475569]">
            Synchronizing cadastre records from Cloud Firestore...
          </div>
        )}

        {isMapGroup && (
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg text-[13px]">
            <button
              type="button"
              onClick={() => setCurrentTab('parcel_map')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                currentTab === 'parcel_map'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Parcel Map
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab('comp1_gis')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                currentTab === 'comp1_gis'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              GIS Spatial Lab
            </button>
          </div>
        )}

        {isTitleGroup && (
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg text-[13px]">
            <button
              type="button"
              onClick={() => setCurrentTab('title_nft')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                currentTab === 'title_nft'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Title NFT &amp; Revocation
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab('public_verify')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                currentTab === 'public_verify'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Public Title Search
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab('comp3_oracle')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                currentTab === 'comp3_oracle'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Oracle &amp; MQTT
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab('comp4_eval')}
              className={`px-3.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                currentTab === 'comp4_eval'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Cross-Cutting Evaluation
            </button>
          </div>
        )}

        {currentTab === 'dashboard' && portalMode === 'admin' && (
          <AdminDashboard
            parcels={parcels}
            ledgerEvents={ledgerEvents}
            activeRole={activeRole}
            onNavigate={setCurrentTab}
            onSelectParcelAndViewMap={handleSelectParcelAndViewMap}
            onSelectParcelAndOpenPipeline={handleSelectParcelAndOpenPipeline}
            onSeedCadastre={handleSeedCadastre}
          />
        )}

        {currentTab === 'dashboard' && portalMode === 'user' && (
          <UserDashboard
            parcels={parcels}
            activeRole={activeRole}
            onNavigate={setCurrentTab}
            onSelectParcelAndViewMap={handleSelectParcelAndViewMap}
            onSelectParcelAndOpenPipeline={handleSelectParcelAndOpenPipeline}
            onOpenCertificate={handleOpenCertificate}
          />
        )}

        {currentTab === 'register' && (
          <UnifiedWorkflow
            parcels={parcels}
            activeRole={activeRole}
            selectedParcelId={selectedParcelId}
            onRefresh={handleRefresh}
            onSelectParcel={handleSelectParcel}
            onOpenCertificate={handleOpenCertificate}
          />
        )}

        {currentTab === 'parcel_map' && (
          <CadastreMap
            parcels={parcels}
            selectedParcelId={selectedParcelId}
            onSelectParcel={handleSelectParcel}
            onOpenCertificate={handleOpenCertificate}
            onOpenRevokeModal={(p) => setRevokeParcel(p)}
            activeRole={activeRole}
            toleranceBufferMeters={0.5}
          />
        )}

        {currentTab === 'title_nft' && (
          <BlockchainRevocationSuite
            parcels={parcels}
            ledgerEvents={ledgerEvents}
            activeRole={activeRole}
            onRefresh={handleRefresh}
          />
        )}

        {currentTab === 'public_verify' && (
          <PublicVerificationPortal
            parcels={parcels}
            onOpenCertificate={handleOpenCertificate}
          />
        )}

        {currentTab === 'comp1_gis' && <GisVerificationLab />}

        {currentTab === 'comp3_oracle' && <OracleMqttLab onRefresh={handleRefresh} />}

        {currentTab === 'comp4_eval' && (
          <CrossCuttingEvaluation parcels={parcels} ledgerEvents={ledgerEvents} />
        )}
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white py-6 px-6 text-center text-[12px] text-[#64748B]">
        <p>
          Anagu Land Registry · Governed under the Land Use Act (1978) Section 28 Statutory Authority
        </p>
      </footer>

      <CertificateModal
        parcel={certificateParcel}
        onClose={() => setCertificateParcel(null)}
      />

      <RevokeModal
        parcel={revokeParcel}
        activeRole={activeRole}
        onClose={() => setRevokeParcel(null)}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
