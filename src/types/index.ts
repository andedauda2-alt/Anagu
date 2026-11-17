export type UserRole = 'CITIZEN' | 'SURVEYOR' | 'REGISTRAR' | 'LAND_ADMIN' | 'GOVERNOR';

export type Coordinate = [number, number]; // [lng, lat] EPSG:4326

export type ParcelStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SPATIAL_VERIFIED'
  | 'ORACLE_VERIFIED'
  | 'LEGAL_VERIFIED'
  | 'APPROVED'
  | 'BLOCKCHAIN_CONFIRMED'
  | 'NFT_ISSUED'
  | 'REVOKED'
  | 'REJECTED'
  | 'CANCELLED';

export type RevocationGround = 'OverridingPublicInterest' | 'BreachOfStatutoryCondition';

export interface AuditEvent {
  id: string;
  stage: string;
  role: UserRole;
  actor: string;
  timestamp: number;
  txHash?: string;
  status: string;
  details: string;
  blockchainBlockNumber?: number;
}

export interface UserProfileRecord {
  uid: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  requestedRole: 'NONE' | UserRole;
  walletAddress?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserPrivateContact {
  uid: string;
  email: string;
  phone?: string;
  address?: string;
  nin?: string;
  updatedAt: number;
}

export interface LedgerEventRecord {
  id: string;
  parcelId: string;
  titleNumber: string;
  tokenId: number;
  method: 'MINT_TITLE_NFT' | 'REVOKE_TITLE_SEC28' | 'TRANSFER_TITLE_NFT';
  txHash: string;
  blockNumber: number;
  actorUid: string;
  isPublicLedger: boolean;
  createdAt: number;
}

export interface Parcel {
  id: string;
  titleNumber: string;
  applicantUid?: string;
  applicantName: string;
  applicantIdNumber: string; // NIN / Identity (private subdoc or masked fallback)
  applicantIdMasked?: string;
  applicantAddress: string;
  applicantPhone: string;
  applicantWalletAddress: string;
  locationName: string;
  lga: string; // Local Government Area
  state: string; // e.g. Lagos / Abuja
  coordinates: Coordinate[]; // GeoJSON polygon exterior ring
  areaSqm: number;
  perimeterMeters: number;
  spatialHash: string; // Keccak-256 equivalent
  documentHash: string; // SHA-256 hash of title document
  landUse: 'Residential' | 'Commercial' | 'Agricultural' | 'Industrial' | 'Public Reserve';
  deedReference: string;
  customaryClan: string;
  communityElderAttestation: string;
  status: ParcelStatus;
  rejectionReason?: string;
  nftTokenId?: number;
  blockchainTxHash?: string;
  isRevoked?: boolean;
  revocationData?: {
    ground: RevocationGround;
    revokedBy: string;
    timestamp: number;
    txHash: string;
    reasonDetail: string;
    blockNumber: number;
  };
  documentAttachment?: {
    fileName: string;
    fileSize: number;
    fileType: string;
    sha256: string;
    uploadedAt: number;
  };
  surveyBeacons?: Array<{
    beaconNumber: string;
    coordinates: Coordinate;
    accuracyMeters?: number;
    recordedAt: number;
  }>;
  signatureProof?: {
    signerAddress: string;
    signature: string;
    messageHash: string;
    timestamp: number;
  };
  timeline: AuditEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface GisValidationResult {
  isValid: boolean;
  outcome: 'Valid and non-overlapping' | 'Invalid geometry' | 'Overlapping existing parcel';
  details: string;
  toleranceBufferMeters: number;
  overlappingParcelIds?: string[];
  hasKinks?: boolean;
  overlapAreaSqm?: number;
  geometryAnalysis: {
    isClosed: boolean;
    hasSelfIntersection: boolean;
    vertexCount: number;
    calculatedAreaSqm: number;
  };
}

export interface OracleVerificationResult {
  outcome:
    | 'Successfully verified'
    | 'Incomplete supporting documents'
    | 'Ownership information conflict'
    | 'Legal verification pending';
  isApproved: boolean;
  institutionalMatch: boolean;
  customaryMatch: boolean;
  documentIntegrityValid: boolean;
  integrityScore: number;
  details: string;
  conflictSources?: string[];
}

export interface MQTTMessage {
  id: string;
  topic: string;
  qos: 0 | 1;
  timestamp: number;
  payload: Record<string, unknown>;
  payloadSizeBytes: number;
  delivered: boolean;
  networkLatencyMs?: number;
}

export interface BlockchainBlock {
  blockNumber: number;
  timestamp: number;
  prevHash: string;
  hash: string;
  transactions: BlockchainTx[];
  validator: string;
  round: number; // QBFT round
}

export interface BlockchainTx {
  txHash: string;
  blockNumber: number;
  from: string;
  to: string;
  method: string;
  args: Record<string, unknown>;
  timestamp: number;
  gasUsed: number;
  status: 'SUCCESS' | 'REVERTED';
  revertReason?: string;
  events: Array<{
    eventName: string;
    data: Record<string, unknown>;
  }>;
}

export interface LatencySample {
  t_gis: number;
  t_oracle: number;
  t_contract: number;
  t_nft: number;
  t_sync: number;
  T_total: number;
}

export interface FraudTestResult {
  scenarioNumber: number;
  scenarioName: string;
  targetLayer: string;
  trials: number;
  proposedDetected: number;
  proposedRejectionRate: number;
  baselineDetected: number;
  baselineRejectionRate: number;
  description: string;
}

export interface StorageFieldSize {
  name: string;
  symbol: string;
  bitLength: number;
  description: string;
}
