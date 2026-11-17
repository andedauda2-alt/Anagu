import React, { useEffect, useState } from 'react';
import { LedgerEventRecord, Parcel, RevocationGround, UserRole } from '../types';
import { blockchainEngine } from '../core/blockchainEngine';
import { revokeTitleByGovernorFirestore, transferTitleByRegistrarFirestore } from '../core/firestoreCadastre';
import { extractReadableError } from '../core/firebase';
import { useAuth } from '../core/authContext';
import { ShieldAlert, Code, ArrowRightLeft } from 'lucide-react';

interface BlockchainRevocationSuiteProps {
  parcels: Parcel[];
  ledgerEvents: LedgerEventRecord[];
  activeRole: UserRole;
  onRefresh: () => void;
}

export const BlockchainRevocationSuite: React.FC<BlockchainRevocationSuiteProps> = ({
  parcels,
  ledgerEvents,
  activeRole,
  onRefresh,
}) => {
  const { userProfile } = useAuth();
  const issuedParcels = parcels.filter((p) => typeof p.nftTokenId === 'number');
  const activeIssuedParcels = issuedParcels.filter((p) => !p.isRevoked && p.status === 'NFT_ISSUED');
  const [selectedTokenId, setSelectedTokenId] = useState<number>(issuedParcels[0]?.nftTokenId || 1001);
  const [revocationGround, setRevocationGround] = useState<RevocationGround>('OverridingPublicInterest');
  const [proclamationReason, setProclamationReason] = useState<string>(
    'FCT Gazette Notice No. 44/2026: Expansion of Federal Transit Corridor'
  );
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [transferTokenId, setTransferTokenId] = useState<number>(activeIssuedParcels[0]?.nftTokenId || 1001);
  const [newOwnerName, setNewOwnerName] = useState<string>('Zenith Urban Estates Ltd');
  const [newOwnerNin, setNewOwnerNin] = useState<string>('RC-44118822');
  const [newOwnerWallet, setNewOwnerWallet] = useState<string>('0x5555555555555555555555555555555555555555');
  const [transferFeedback, setTransferFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (issuedParcels.length > 0 && !issuedParcels.some((p) => p.nftTokenId === selectedTokenId)) {
      setSelectedTokenId(issuedParcels[0].nftTokenId!);
    }
  }, [issuedParcels, selectedTokenId]);

  useEffect(() => {
    if (activeIssuedParcels.length > 0 && !activeIssuedParcels.some((p) => p.nftTokenId === transferTokenId)) {
      setTransferTokenId(activeIssuedParcels[0].nftTokenId!);
    }
  }, [activeIssuedParcels, transferTokenId]);

  const testResults = blockchainEngine.runIsolatedContractTests();
  const liveMintCount = Math.max(
    ledgerEvents.filter((e) => e.method === 'MINT_TITLE_NFT').length,
    issuedParcels.length
  );
  const liveTransferCount = ledgerEvents.filter((e) => e.method === 'TRANSFER_TITLE_NFT').length;
  const rejectedP2pCount = blockchainEngine.metrics.ownerTransfersRejected;

  const handleExecuteRevoke = async () => {
    const targetParcel = issuedParcels.find((p) => p.nftTokenId === selectedTokenId);
    if (!targetParcel) {
      setActionFeedback({ type: 'error', message: 'Selected Title NFT parcel not found in Firestore.' });
      return;
    }

    setSubmitting(true);
    setActionFeedback(null);
    try {
      const res = await revokeTitleByGovernorFirestore(
        targetParcel,
        activeRole,
        userProfile?.displayName || 'Executive Governor',
        revocationGround,
        proclamationReason
      );

      if (res.success && res.parcel?.revocationData) {
        setActionFeedback({
          type: 'success',
          message: `Statutory Revocation Executed by Governor and saved to Firestore. Block #${res.parcel.revocationData.blockNumber}.`,
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: `Execution Reverted: ${res.error}`,
        });
      }
      onRefresh();
    } catch (err) {
      setActionFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransfer = async () => {
    const targetParcel = issuedParcels.find((p) => p.nftTokenId === transferTokenId);
    if (!targetParcel) {
      setTransferFeedback({ type: 'error', message: 'Selected Title NFT parcel not found in Firestore.' });
      return;
    }

    setTransferring(true);
    setTransferFeedback(null);
    try {
      const res = await transferTitleByRegistrarFirestore(
        targetParcel,
        activeRole,
        userProfile?.displayName || 'Registrar of Titles',
        newOwnerName,
        newOwnerNin,
        newOwnerWallet
      );
      if (res.success && res.parcel) {
        setTransferFeedback({
          type: 'success',
          message: `Title NFT #${targetParcel.nftTokenId} transferred to ${res.parcel.applicantName} and recorded in Firestore ledger.`,
        });
        onRefresh();
      } else {
        setTransferFeedback({
          type: 'error',
          message: `Transfer Reverted: ${res.error}`,
        });
      }
    } catch (err) {
      setTransferFeedback({ type: 'error', message: extractReadableError(err) });
    } finally {
      setTransferring(false);
    }
  };

  const solidityContractCode = `// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title LandTitleNFT
 * @notice Extends ERC-721 with statutory revocation under Nigeria Land Use Act (1978) Section 28
 */
contract LandTitleNFT is ERC721, AccessControl {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    enum RevocationGround { OverridingPublicInterest, BreachOfStatutoryCondition }

    mapping(uint256 => bool) public isRevoked;
    mapping(uint256 => bytes32) public spatialHashes;

    event TitleMinted(uint256 indexed tokenId, address indexed to, bytes32 spatialHash);
    event TitleRevoked(
        uint256 indexed tokenId,
        RevocationGround ground,
        address indexed revokedBy,
        uint256 timestamp
    );

    constructor(address governorAddress, address registrarAddress) ERC721("Federal Land Title NFT", "FLT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNOR_ROLE, governorAddress);
        _grantRole(REGISTRAR_ROLE, registrarAddress);
    }

    function revoke(uint256 tokenId, RevocationGround ground)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        require(_ownerOf(tokenId) != address(0), "LandTitleNFT: token does not exist");
        require(!isRevoked[tokenId], "LandTitleNFT: already revoked");
        isRevoked[tokenId] = true;
        emit TitleRevoked(tokenId, ground, msg.sender, block.timestamp);
    }

    // Block any transfer of a revoked token
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        require(!isRevoked[tokenId], "LandTitleNFT: token is revoked");
        return super._update(to, tokenId, auth);
    }
}`;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-[22px] text-[#0F172A]">
              Title NFT Ledger &amp; Section 28 Revocation
            </h2>
            <p className="text-[13px] text-[#475569] mt-0.5">
              PoA-QBFT-DPoS Consensus · 1-Second Block Period · Land Use Act (1978) Section 28
            </p>
          </div>

          <div className="bg-[#F8FAFC] px-3.5 py-2 rounded-lg border border-[#E2E8F0] text-[12px] font-mono tabular-nums">
            <span className="text-[#64748B]">QBFT Block Height: </span>
            <span className="text-[#2563EB] font-semibold">#{blockchainEngine.blockNumber}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] pt-2">
          <div className="bg-[#F8FAFC] p-3.5 rounded-lg border border-[#E2E8F0]">
            <strong className="text-[#DC2626] block mb-1">Proof-of-Work Rejected</strong>
            <span className="text-[#475569]">
              Computational overhead and probabilistic finality do not suit permissioned, statutory land governance.
            </span>
          </div>
          <div className="bg-[#F8FAFC] p-3.5 rounded-lg border border-[#E2E8F0]">
            <strong className="text-[#D97706] block mb-1">Unweighted PoA Rejected</strong>
            <span className="text-[#475569]">
              Cannot enforce statutory reputation and institutional role differentiation (Governor-only revocation).
            </span>
          </div>
          <div className="bg-[#ECFDF5] p-3.5 rounded-lg border border-[#A7F3D0]">
            <strong className="text-[#059669] block mb-1">Selected: PoA-QBFT-DPoS</strong>
            <span className="text-[#065F46]">
              1s deterministic finality for statutory transactions with role-weighted institutional validators.
            </span>
          </div>
        </div>
      </div>

      {/* Governor Statutory Revocation Console */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
          <div className="flex items-center gap-2 text-[#0F172A]">
            <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
            <h3 className="text-[15px] font-semibold">
              Statutory Revocation Console (Land Use Act Section 28)
            </h3>
          </div>
          <span className="text-[12px] font-mono text-[#DC2626] font-medium">
            Exclusive Role: GOVERNOR_ROLE
          </span>
        </div>

        {actionFeedback && (
          <div
            className={`p-3.5 rounded-lg text-[13px] flex items-center justify-between border ${
              actionFeedback.type === 'success'
                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
            }`}
          >
            <span>{actionFeedback.message}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-[12px] font-medium ml-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px]">
          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Select Title NFT</label>
            <select
              value={selectedTokenId}
              onChange={(e) => setSelectedTokenId(parseInt(e.target.value))}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 font-mono text-[12px]"
            >
              {issuedParcels.length === 0 ? (
                <option value={0}>No issued Title NFTs yet</option>
              ) : (
                issuedParcels.map((p) => (
                  <option key={p.id} value={p.nftTokenId}>
                    Token #{p.nftTokenId} — {p.titleNumber} {p.isRevoked ? '(REVOKED)' : '(ACTIVE)'}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Statutory Ground (Section 28)</label>
            <select
              value={revocationGround}
              onChange={(e) => setRevocationGround(e.target.value as RevocationGround)}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
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
            <input
              type="text"
              maxLength={500}
              value={proclamationReason}
              onChange={(e) => setProclamationReason(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-[12px] text-[#475569]">
            Active Role: <strong className="text-[#0F172A] font-mono">{activeRole}</strong>
            {activeRole !== 'GOVERNOR' && (
              <span className="text-[#D97706] ml-1.5">(Non-Governor calls are rejected by Firestore &amp; contract rules)</span>
            )}
          </div>

          <button
            type="button"
            disabled={submitting || issuedParcels.length === 0}
            onClick={handleExecuteRevoke}
            className="px-4 py-2.5 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>{submitting ? 'Executing...' : 'Execute revoke(tokenId, ground)'}</span>
          </button>
        </div>
      </div>

      {/* Registry-Controlled Title Transfer Console */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
          <div className="flex items-center gap-2 text-[#0F172A]">
            <ArrowRightLeft className="w-4 h-4 text-[#2563EB]" />
            <h3 className="text-[15px] font-semibold">
              Registry-Controlled Title Transfer (P2P Transfers Disabled)
            </h3>
          </div>
          <span className="text-[12px] font-mono text-[#2563EB] font-medium">
            Authorized Roles: REGISTRAR / LAND_ADMIN
          </span>
        </div>

        {transferFeedback && (
          <div
            className={`p-3.5 rounded-lg text-[13px] flex items-center justify-between border ${
              transferFeedback.type === 'success'
                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
            }`}
          >
            <span>{transferFeedback.message}</span>
            <button
              type="button"
              onClick={() => setTransferFeedback(null)}
              className="text-[12px] font-medium ml-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-[13px]">
          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Select Active Title NFT</label>
            <select
              value={transferTokenId}
              onChange={(e) => setTransferTokenId(parseInt(e.target.value))}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono text-[12px]"
            >
              {issuedParcels.length === 0 ? (
                <option value={0}>No Title NFTs available</option>
              ) : (
                issuedParcels.map((p) => (
                  <option key={p.id} value={p.nftTokenId}>
                    #{p.nftTokenId} — {p.applicantName} {p.isRevoked ? '(REVOKED)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Transferee Legal Name</label>
            <input
              type="text"
              maxLength={120}
              value={newOwnerName}
              onChange={(e) => setNewOwnerName(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Transferee NIN / RC</label>
            <input
              type="text"
              maxLength={64}
              value={newOwnerNin}
              onChange={(e) => setNewOwnerNin(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] font-mono text-[12px] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="text-[#475569] text-[12px] block mb-1">Transferee Wallet Address</label>
            <input
              type="text"
              maxLength={64}
              value={newOwnerWallet}
              onChange={(e) => setNewOwnerWallet(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#0F172A] font-mono text-[12px] focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-[12px] text-[#475569]">
            Active Role: <strong className="text-[#0F172A] font-mono">{activeRole}</strong>
            {activeRole !== 'REGISTRAR' && activeRole !== 'LAND_ADMIN' && (
              <span className="text-[#D97706] ml-1.5">
                (Owner P2P transfer attempts are blocked by contract &amp; Firestore rules)
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={transferring || issuedParcels.length === 0}
            onClick={handleExecuteTransfer}
            className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>{transferring ? 'Processing Transfer...' : 'Execute registryTransfer(tokenId, to)'}</span>
          </button>
        </div>
      </div>

      {/* Persisted Firestore Ledger Events */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2.5">
          <h3 className="text-[14px] font-semibold text-[#0F172A]">
            Persisted Title Ledger Events (Firestore)
          </h3>
          <span className="text-[12px] font-mono text-[#64748B]">{ledgerEvents.length} events</span>
        </div>

        {ledgerEvents.length === 0 ? (
          <p className="text-[13px] text-[#64748B]">No ledger events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px] border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                  <th className="py-2 px-2 font-medium">Method</th>
                  <th className="py-2 px-2 font-medium">Title No.</th>
                  <th className="py-2 px-2 font-medium">Token ID</th>
                  <th className="py-2 px-2 font-medium">Tx Hash</th>
                  <th className="py-2 px-2 text-right font-medium">Block</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] font-mono">
                {ledgerEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-[#F8FAFC]">
                    <td
                      className={`py-2 px-2 font-semibold ${
                        ev.method === 'REVOKE_TITLE_SEC28'
                          ? 'text-[#DC2626]'
                          : ev.method === 'TRANSFER_TITLE_NFT'
                          ? 'text-[#2563EB]'
                          : 'text-[#059669]'
                      }`}
                    >
                      {ev.method}
                    </td>
                    <td className="py-2 px-2 text-[#0F172A]">{ev.titleNumber}</td>
                    <td className="py-2 px-2 text-[#475569]">#{ev.tokenId}</td>
                    <td className="py-2 px-2 text-[#64748B] truncate max-w-[200px]">{ev.txHash}</td>
                    <td className="py-2 px-2 text-right text-[#2563EB]">#{ev.blockNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tables A & B */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2.5">
            <h3 className="text-[14px] font-semibold text-[#0F172A]">
              Smart Contract &amp; NFT Lifecycle Events
            </h3>
            <span className="text-[11px] font-mono text-[#64748B]">Live Ledger</span>
          </div>

          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                <th className="py-2 px-2 font-medium">Blockchain Event</th>
                <th className="py-2 px-2 text-right font-medium">Frequency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">NFT land titles issued</td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-[#059669]">
                  {liveMintCount}
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">Registry-controlled transfers completed</td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-[#2563EB]">
                  {liveTransferCount}
                </td>
              </tr>
              <tr className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-2 text-[#0F172A]">Owner-initiated transfer attempts rejected</td>
                <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-[#DC2626]">
                  {rejectedP2pCount}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="md:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
          <h3 className="text-[14px] font-semibold text-[#0F172A] border-b border-[#F1F5F9] pb-2.5">
            Statutory Revocation Contract Test Suite
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-[12px]">
                  <th className="py-2 px-2 font-medium">Test Scenario</th>
                  <th className="py-2 px-2 text-center font-medium">Result</th>
                  <th className="py-2 px-2 font-medium">Verification Metrics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {testResults.tableB.map((t, i) => (
                  <tr key={i} className="hover:bg-[#F8FAFC]">
                    <td className="py-2.5 px-2 text-[#0F172A] font-medium">{t.testName}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-[11px] font-semibold text-[#059669]">
                      {t.result}
                    </td>
                    <td className="py-2.5 px-2 text-[#475569] text-[12px]">
                      {t.notes}
                      {t.gasCost && (
                        <span className="font-mono tabular-nums text-[#059669] font-medium ml-1">
                          [{t.gasCost.toLocaleString()} gas]
                        </span>
                      )}
                      {t.confirmationTimeMs && (
                        <span className="font-mono tabular-nums text-[#2563EB] font-medium ml-1">
                          [{t.confirmationTimeMs} ms]
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Solidity Contract */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
          <div className="flex items-center gap-2 text-[#0F172A]">
            <Code className="w-4 h-4 text-[#2563EB]" />
            <h3 className="text-[14px] font-semibold">LandTitleNFT.sol Smart Contract</h3>
          </div>
          <span className="text-[12px] font-mono text-[#64748B]">OpenZeppelin ERC-721 + AccessControl</span>
        </div>

        <pre className="bg-[#F8FAFC] p-4 rounded-lg text-[11.5px] font-mono text-[#334155] overflow-x-auto max-h-64 border border-[#E2E8F0] leading-relaxed">
          {solidityContractCode}
        </pre>
      </div>
    </div>
  );
};
