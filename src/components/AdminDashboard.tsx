import React, { useState } from 'react';
import { LedgerEventRecord, Parcel, UserRole } from '../types';
import { useAuth } from '../core/authContext';
import { extractReadableError } from '../core/firebase';
import { StorageEngine } from '../core/storageEngine';
import {
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Download,
  Users,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface AdminDashboardProps {
  parcels: Parcel[];
  ledgerEvents: LedgerEventRecord[];
  activeRole: UserRole;
  onNavigate: (tab: string) => void;
  onSelectParcelAndViewMap: (parcelId: string) => void;
  onSelectParcelAndOpenPipeline: (parcelId: string) => void;
  onSeedCadastre?: () => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  parcels,
  ledgerEvents,
  activeRole,
  onNavigate,
  onSelectParcelAndViewMap,
  onSelectParcelAndOpenPipeline,
  onSeedCadastre,
}) => {
  const { firebaseUser, userProfile, allUsers, adminUids, isAdmin, assignUserRole, setAdminAccess } = useAuth();
  const [roleFeedback, setRoleFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const roleDisplayName: Record<UserRole, string> = {
    REGISTRAR: 'Registrar',
    CITIZEN: 'Citizen',
    SURVEYOR: 'Surveyor',
    LAND_ADMIN: 'Administrator',
    GOVERNOR: 'Governor',
  };

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const awaitingParcels = parcels.filter(
    (p) =>
      p.status !== 'NFT_ISSUED' &&
      p.status !== 'REVOKED' &&
      p.status !== 'REJECTED' &&
      p.status !== 'CANCELLED'
  );
  const issuedCount = parcels.filter((p) => p.status === 'NFT_ISSUED' && !p.isRevoked).length;
  const disputeOrRevokedCount = parcels.filter((p) => p.isRevoked || p.status === 'REJECTED').length;

  const pendingRoleRequests = allUsers.filter((u) => u.requestedRole && u.requestedRole !== 'NONE');

  const recentAuditEvents = parcels
    .flatMap((p) =>
      p.timeline.map((ev) => ({
        id: `${p.id}-${ev.id}`,
        parcelId: p.id,
        titleNumber: p.titleNumber,
        applicantName: p.applicantName,
        stage: ev.stage,
        timestamp: ev.timestamp,
      }))
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  const getNextRequiredRole = (status: Parcel['status']): string => {
    if (status === 'SUBMITTED') return 'SURVEYOR / LAND_ADMIN';
    if (status === 'SPATIAL_VERIFIED') return 'LAND_ADMIN / SURVEYOR';
    if (status === 'ORACLE_VERIFIED') return 'REGISTRAR / LAND_ADMIN';
    if (status === 'LEGAL_VERIFIED') return 'REGISTRAR';
    if (status === 'APPROVED') return 'REGISTRAR / LAND_ADMIN';
    return 'OFFICIAL';
  };

  const handleAssignRole = async (uid: string, role: UserRole) => {
    setBusyAction(true);
    setRoleFeedback(null);
    try {
      await assignUserRole(uid, role);
      setRoleFeedback({
        type: 'success',
        text: `Updated user role to ${role} in Firestore.`,
      });
    } catch (err) {
      setRoleFeedback({ type: 'error', text: extractReadableError(err) });
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleAdminAccess = async (uid: string, grant: boolean) => {
    setBusyAction(true);
    setRoleFeedback(null);
    try {
      await setAdminAccess(uid, grant);
      setRoleFeedback({
        type: 'success',
        text: grant
          ? 'Granted separate Admin Portal access (/admins) to account.'
          : 'Revoked Admin Portal access from account.',
      });
    } catch (err) {
      setRoleFeedback({ type: 'error', text: extractReadableError(err) });
    } finally {
      setBusyAction(false);
    }
  };

  const handleExportCadastre = () => {
    const geojson = StorageEngine.exportToGeoJSON(parcels);
    StorageEngine.triggerDownload(geojson, 'anagu_national_cadastre.geojson', 'application/geo+json');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-wider text-[#2563EB] mb-1">
            {isAdmin ? 'Admin Dashboard · Registry Governance' : `Official Operations · ${roleDisplayName[activeRole]}`}
          </div>
          <h1 className="font-serif text-[32px] sm:text-[36px] leading-tight tracking-tight text-[#0F172A] font-normal">
            {timeGreeting}, {userProfile?.displayName || roleDisplayName[activeRole]}
          </h1>
          <p className="mt-1.5 text-[14px] text-[#475569]">
            System-wide cadastre queue, ledger oversight, statutory approvals, and RBAC account governance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
          {isAdmin && firebaseUser ? (
            <div className="flex items-center gap-2 text-[#475569]">
              <label htmlFor="admin-role-select" className="whitespace-nowrap flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Active authority:</span>
              </label>
              <select
                id="admin-role-select"
                value={activeRole}
                disabled={busyAction}
                onChange={(e) => handleAssignRole(firebaseUser.uid, e.target.value as UserRole)}
                className="bg-white border border-[#E2E8F0] text-[#0F172A] text-[13px] font-medium rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer"
              >
                <option value="REGISTRAR">Registrar of Titles</option>
                <option value="SURVEYOR">Licensed Surveyor</option>
                <option value="LAND_ADMIN">Land Administrator</option>
                <option value="GOVERNOR">Executive Governor</option>
                <option value="CITIZEN">Citizen / Applicant</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] px-3.5 py-2 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
              <span className="text-[#475569]">Authority:</span>
              <span className="font-semibold text-[#0F172A]">{activeRole}</span>
            </div>
          )}

          <button
            type="button"
            disabled={parcels.length === 0}
            onClick={handleExportCadastre}
            className="px-3.5 py-2 bg-white hover:bg-[#F8FAFC] disabled:opacity-50 border border-[#E2E8F0] text-[#0F172A] rounded-lg text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#059669]" />
            <span>Export GeoJSON</span>
          </button>
        </div>
      </div>

      {roleFeedback && (
        <div
          className={`px-4 py-3 rounded-xl text-[13px] flex items-center justify-between border ${
            roleFeedback.type === 'success'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
          }`}
        >
          <div className="flex items-center gap-2">
            {roleFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{roleFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setRoleFeedback(null)}
            className="text-[12px] font-medium ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4-Card Registry KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('parcel_map')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#0F172A] group-hover:text-[#2563EB] transition-colors tabular-nums">
            {parcels.length.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">Parcels on record</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('register')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#D97706] tabular-nums">
            {awaitingParcels.length.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">Awaiting verification</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('title_nft')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#059669] tabular-nums">
            {issuedCount.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">Title NFTs issued</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('title_nft')}
          className="text-left bg-white border border-[#E2E8F0] hover:border-[#2563EB]/60 rounded-xl px-5 py-5 transition-colors cursor-pointer group"
        >
          <div className="font-serif text-[30px] leading-none text-[#DC2626] tabular-nums">
            {disputeOrRevokedCount.toLocaleString()}
          </div>
          <div className="mt-2.5 text-[13px] text-[#475569]">Revoked / rejected</div>
        </button>
      </div>

      {/* 2-Column Operational Queue + Recent Registry Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[#0F172A]">Official Verification Queue</h2>
                <p className="text-[12.5px] text-[#475569]">
                  {awaitingParcels.length > 0
                    ? `${awaitingParcels.length} filing(s) awaiting statutory gate sign-off`
                    : 'All active filings have reached final issuance or closure.'}
                </p>
              </div>
              <Clock className="w-4 h-4 text-[#D97706]" />
            </div>

            {awaitingParcels.length > 0 ? (
              <div className="divide-y divide-[#F1F5F9]">
                {awaitingParcels.slice(0, 5).map((p) => (
                  <div key={p.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-[#0F172A]">
                          {p.titleNumber}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
                          {p.status}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#475569] mt-0.5">
                        {p.applicantName} · Next gate: <span className="font-mono text-[#0F172A]">{getNextRequiredRole(p.status)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectParcelAndOpenPipeline(p.id)}
                      className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-medium rounded-lg cursor-pointer"
                    >
                      Open gate
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#64748B] py-2">
                Verification queue is clear.
              </p>
            )}
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span>Open registration pipeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {isAdmin && parcels.length === 0 && onSeedCadastre && (
              <button
                type="button"
                onClick={onSeedCadastre}
                className="px-4 py-2 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] text-[13px] font-medium rounded-lg transition-colors cursor-pointer"
              >
                Seed sample cadastre
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <h2 className="text-[15px] font-semibold text-[#0F172A]">Recent Registry &amp; Ledger Activity</h2>
              <span className="text-[11.5px] font-mono text-[#64748B]">{ledgerEvents.length} on-chain events</span>
            </div>

            {recentAuditEvents.length > 0 ? (
              <ul className="space-y-3 text-[13px] text-[#334155]">
                {recentAuditEvents.map((item) => (
                  <li key={item.id} className="flex items-start gap-2.5">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => onSelectParcelAndViewMap(item.parcelId)}
                      className="text-left hover:text-[#2563EB] hover:underline underline-offset-4 transition-colors cursor-pointer"
                    >
                      {item.titleNumber} — {item.stage} ({item.applicantName})
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[#64748B]">No cadastre events recorded yet.</p>
            )}
          </div>

          <div className="pt-3 border-t border-[#F1F5F9] flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('title_nft')}
              className="px-3.5 py-2 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#0F172A] text-[12.5px] font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626]" />
              <span>Transfers &amp; Sec. 28 Revocation</span>
            </button>
          </div>
        </div>
      </div>

      {/* Admin User Role Governance (Strict Admin Only) */}
      {isAdmin && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2563EB]" />
                <h2 className="text-[15px] font-semibold text-[#0F172A]">
                  Admin User &amp; Role Governance ({allUsers.length} accounts)
                </h2>
              </div>
              <p className="text-[12.5px] text-[#475569] mt-0.5">
                Review role upgrade requests and enforce statutory RBAC permissions in Cloud Firestore.
              </p>
            </div>
            {pendingRoleRequests.length > 0 && (
              <span className="text-[12px] font-mono font-semibold px-2.5 py-1 rounded bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
                {pendingRoleRequests.length} pending request(s)
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                  <th className="py-2 px-3 font-medium">Account</th>
                  <th className="py-2 px-3 font-medium">Current Role</th>
                  <th className="py-2 px-3 font-medium">Admin Portal Access</th>
                  <th className="py-2 px-3 text-right font-medium">Assign Statutory Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {allUsers.map((u) => {
                  const isAppointedAdmin = adminUids.includes(u.uid);
                  const isSelf = firebaseUser?.uid === u.uid;
                  return (
                    <tr key={u.uid} className="hover:bg-[#F8FAFC]">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#0F172A]">{u.displayName}</div>
                        <div className="text-[11px] font-mono text-[#64748B]">{u.uid.slice(0, 14)}...</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[12px] text-[#0F172A]">{u.role}</td>
                      <td className="py-2.5 px-3">
                        {isSelf ? (
                          <span className="text-[11.5px] font-mono text-[#2563EB] font-semibold">
                            Root Admin
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => handleToggleAdminAccess(u.uid, !isAppointedAdmin)}
                            className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-colors cursor-pointer ${
                              isAppointedAdmin
                                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46] hover:bg-[#D1FAE5]'
                                : 'bg-white border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            {isAppointedAdmin ? 'Admin Enabled' : 'Grant Admin'}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <select
                          value={u.role}
                          disabled={busyAction}
                          onChange={(e) => handleAssignRole(u.uid, e.target.value as UserRole)}
                          className="bg-white border border-[#E2E8F0] text-[#0F172A] text-[12px] rounded-lg px-2.5 py-1.5 cursor-pointer"
                        >
                          <option value="CITIZEN">CITIZEN</option>
                          <option value="SURVEYOR">SURVEYOR</option>
                          <option value="LAND_ADMIN">LAND_ADMIN</option>
                          <option value="REGISTRAR">REGISTRAR</option>
                          <option value="GOVERNOR">GOVERNOR</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Directory Links to Verification Modules */}
      <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4 text-[13px] text-[#64748B]">
        <span>Framework Modules &amp; Evaluation Suites</span>
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => onNavigate('public_verify')}
            className="hover:text-[#2563EB] underline-offset-4 hover:underline transition-colors cursor-pointer"
          >
            Public Title Search
          </button>
          <button
            type="button"
            onClick={() => onNavigate('comp1_gis')}
            className="hover:text-[#2563EB] underline-offset-4 hover:underline transition-colors cursor-pointer"
          >
            GIS Spatial Lab
          </button>
          <button
            type="button"
            onClick={() => onNavigate('comp3_oracle')}
            className="hover:text-[#2563EB] underline-offset-4 hover:underline transition-colors cursor-pointer"
          >
            Oracle &amp; MQTT Monitor
          </button>
          <button
            type="button"
            onClick={() => onNavigate('comp4_eval')}
            className="hover:text-[#2563EB] underline-offset-4 hover:underline transition-colors cursor-pointer"
          >
            Cross-Cutting Evaluation
          </button>
        </div>
      </div>
    </div>
  );
};
