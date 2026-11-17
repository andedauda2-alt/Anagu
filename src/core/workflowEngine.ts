import { AuditEvent, Coordinate, Parcel, ParcelStatus, RevocationGround, UserRole } from '../types';
import { blockchainEngine } from './blockchainEngine';
import { gisEngine } from './gisEngine';
import { mqttBrokerEngine, oracleEngine } from './oracleMqttEngine';

/**
 * Unified Registration Workflow Manager
 * Orchestrates the full 8-stage sequence:
 * 1. Application Submission (Citizen)
 * 2. Spatial Verification (Surveyor / PostGIS ST_IsValid + ST_Buffer)
 * 3. Community Attestation / Ownership Oracle (Customary Clan + Deeds Archive)
 * 4. Legal Verification (Land Administrator)
 * 5. Registrar Approval (Registrar)
 * 6. Blockchain Registration (Besu QBFT)
 * 7. NFT Title Issuance (ERC-721 LandTitleNFT)
 * 8. MQTT Notification
 *
 * Enforces Role-Based Access Control and immutable audit logging.
 */

import { StorageEngine } from './storageEngine';

export class WorkflowEngine {
  private parcels: Map<string, Parcel> = new Map();
  private auditLog: AuditEvent[] = [];

  constructor() {
    const saved = StorageEngine.loadParcels();
    if (saved && saved.length > 0) {
      saved.forEach(p => {
        this.parcels.set(p.id, p);
        if (p.nftTokenId) {
          blockchainEngine.nftRegistry.set(p.nftTokenId, {
            tokenId: p.nftTokenId,
            parcelId: p.id,
            titleNumber: p.titleNumber,
            ownerAddress: p.applicantWalletAddress,
            spatialHash: p.spatialHash,
            documentHash: p.documentHash,
            issuedAt: p.createdAt,
            isRevoked: p.isRevoked || false,
            revocation: p.revocationData ? {
              ground: p.revocationData.ground,
              revokedBy: p.revocationData.revokedBy,
              timestamp: p.revocationData.timestamp,
              txHash: p.revocationData.txHash,
            } : undefined,
          });
        }
      });
    } else {
      this.seedInitialCadastre();
    }
  }

  private seedInitialCadastre() {
    const seedParcels: Parcel[] = [
      {
        id: 'PARCEL-NG-001',
        titleNumber: 'NG-ABJ-2025-0104',
        applicantName: 'Alhaji Musa Ibrahim',
        applicantIdNumber: 'NIN-11223344551',
        applicantAddress: 'Plot 42 Shehu Shagari Way, Maitama, Abuja',
        applicantPhone: '+234 803 555 0101',
        applicantWalletAddress: '0x104b92c488319f359c29b2050615b06000f5ac93',
        locationName: 'Maitama District Cadastral Sector A05',
        lga: 'Abuja Municipal',
        state: 'FCT',
        coordinates: [
          [7.4950, 9.0820],
          [7.5010, 9.0820],
          [7.5010, 9.0870],
          [7.4950, 9.0870],
          [7.4950, 9.0820],
        ],
        areaSqm: 308640,
        perimeterMeters: 2220,
        spatialHash: '0x8f7a932b1c4e6d8a2b5f7e9c1d3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e',
        documentHash: '0x4c2e6a8b1d3f5e7c9a1b3d5f7e9c1a3b5d7f9e1c3a5b7d9f1e3c5a7b9d1f3e5',
        landUse: 'Residential',
        deedReference: 'DEED-FCT-2024-001',
        customaryClan: 'Gbagyi Indigenous Council',
        communityElderAttestation: 'Confirmed ancestral boundary allocation without conflict',
        status: 'NFT_ISSUED',
        nftTokenId: 1001,
        blockchainTxHash: '0x992b1a8f3c7e5d2b1a4f6e8c0d2e4f6a8b0c2e4f6a8b0c2e4f6a8b0c2e4f6a8b',
        isRevoked: false,
        timeline: [
          {
            id: 'AUD-001',
            stage: 'Submission',
            role: 'CITIZEN',
            actor: 'Alhaji Musa Ibrahim',
            timestamp: Date.now() - 86400000 * 7,
            status: 'SUBMITTED',
            details: 'Initial application submitted with survey coordinates and customary deed reference.',
          },
          {
            id: 'AUD-002',
            stage: 'Spatial GIS Verification',
            role: 'SURVEYOR',
            actor: 'Chief Surveyor Adeyemi',
            timestamp: Date.now() - 86400000 * 6,
            status: 'SPATIAL_VERIFIED',
            details: 'PostGIS ST_IsValid() and ST_Intersects() buffer check cleared. Zero overlap with existing cadastre.',
          },
          {
            id: 'AUD-003',
            stage: 'Community Oracle Attestation',
            role: 'LAND_ADMIN',
            actor: 'Oracle Automated Dispatcher',
            timestamp: Date.now() - 86400000 * 5,
            status: 'ORACLE_VERIFIED',
            details: 'Dual statutory deeds registry & Gbagyi Elders Council reconciled successfully.',
          },
          {
            id: 'AUD-004',
            stage: 'Legal Deeds Review',
            role: 'REGISTRAR',
            actor: 'Barrister N. Nwosu, Legal Deeds Counsel',
            timestamp: Date.now() - 86400000 * 4,
            status: 'LEGAL_VERIFIED',
            details: 'Title documents and tax clearance certified under Land Use Act statutory provisions.',
          },
          {
            id: 'AUD-005',
            stage: 'Registrar Final Approval',
            role: 'REGISTRAR',
            actor: 'Registrar of Titles (FCT)',
            timestamp: Date.now() - 86400000 * 3,
            status: 'APPROVED',
            details: 'Formal statutory approval granted. Transaction forwarded to Hyperledger Besu smart contract.',
          },
          {
            id: 'AUD-006',
            stage: 'NFT Title Issuance',
            role: 'REGISTRAR',
            actor: 'LandTitleNFT Contract',
            timestamp: Date.now() - 86400000 * 2,
            txHash: '0x992b1a8f3c7e5d2b1a4f6e8c0d2e4f6a8b0c2e4f6a8b0c2e4f6a8b0c2e4f6a8b',
            status: 'NFT_ISSUED',
            details: 'ERC-721 Token #1001 minted on QBFT chain. Owner: 0x104b...ac93. Spatial hash anchored.',
          },
        ],
        createdAt: Date.now() - 86400000 * 7,
        updatedAt: Date.now() - 86400000 * 2,
      },
      {
        id: 'PARCEL-NG-002',
        titleNumber: 'NG-LAG-2025-0819',
        applicantName: 'Dr. Folake Adeyemi',
        applicantIdNumber: 'NIN-55667788992',
        applicantAddress: 'Plot 18 Admiralty Way, Lekki Phase 1, Lagos',
        applicantPhone: '+234 802 999 4433',
        applicantWalletAddress: '0x444b92c488319f359c29b2050615b06000f5ac44',
        locationName: 'Lekki Peninsula Coastal Corridor',
        lga: 'Eti-Osa',
        state: 'Lagos',
        coordinates: [
          [7.5050, 9.0700],
          [7.5110, 9.0700],
          [7.5110, 9.0760],
          [7.5050, 9.0760],
          [7.5050, 9.0700],
        ],
        areaSqm: 370200,
        perimeterMeters: 2430,
        spatialHash: '0x3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b',
        documentHash: '0x1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a',
        landUse: 'Commercial',
        deedReference: 'DEED-LAG-2023-882',
        customaryClan: 'Elegushi Royal Family',
        communityElderAttestation: 'Royal clan assent confirmed',
        status: 'NFT_ISSUED',
        nftTokenId: 1002,
        blockchainTxHash: '0x777b1a8f3c7e5d2b1a4f6e8c0d2e4f6a8b0c2e4f6a8b0c2e4f6a8b0c2e4f6a77',
        isRevoked: false,
        timeline: [
          {
            id: 'AUD-010',
            stage: 'Submission',
            role: 'CITIZEN',
            actor: 'Dr. Folake Adeyemi',
            timestamp: Date.now() - 86400000 * 5,
            status: 'SUBMITTED',
            details: 'Application submitted for commercial hospital development.',
          },
          {
            id: 'AUD-011',
            stage: 'NFT Title Issuance',
            role: 'REGISTRAR',
            actor: 'LandTitleNFT Contract',
            timestamp: Date.now() - 86400000 * 1,
            status: 'NFT_ISSUED',
            details: 'ERC-721 Token #1002 minted with commercial title certification.',
          },
        ],
        createdAt: Date.now() - 86400000 * 5,
        updatedAt: Date.now() - 86400000 * 1,
      },
      {
        id: 'PARCEL-NG-003',
        titleNumber: 'NG-ABJ-2026-0043',
        applicantName: 'Greenfield Agro Holdings Ltd',
        applicantIdNumber: 'RC-99884411',
        applicantAddress: 'Kilometre 14 Airport Expressway, Abuja',
        applicantPhone: '+234 814 333 8811',
        applicantWalletAddress: '0x777b92c488319f359c29b2050615b06000f5ac77',
        locationName: 'Idu Industrial Layout Phase 2',
        lga: 'Abuja Municipal',
        state: 'FCT',
        coordinates: [
          [7.4720, 9.0550],
          [7.4780, 9.0550],
          [7.4780, 9.0600],
          [7.4720, 9.0600],
          [7.4720, 9.0550],
        ],
        areaSqm: 308000,
        perimeterMeters: 2200,
        spatialHash: '0x6e8c0d2e4f6a8b0c2e4f6a8b0c2e4f6a8b0c2e4f6a8b0c2e4f6a8b0c2e4f6a8b',
        documentHash: '0x9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f3a5b7c9e1f',
        landUse: 'Industrial',
        deedReference: 'DEED-IDU-2025-099',
        customaryClan: 'Gbagyi Indigenous Council',
        communityElderAttestation: 'Verified industrial reservation',
        status: 'SPATIAL_VERIFIED',
        isRevoked: false,
        timeline: [
          {
            id: 'AUD-020',
            stage: 'Submission',
            role: 'CITIZEN',
            actor: 'Greenfield Agro Representative',
            timestamp: Date.now() - 86400000 * 2,
            status: 'SUBMITTED',
            details: 'Industrial agro-processing facility title application.',
          },
          {
            id: 'AUD-021',
            stage: 'Spatial GIS Verification',
            role: 'SURVEYOR',
            actor: 'Cadastral Surveyor Bello',
            timestamp: Date.now() - 86400000 * 1,
            status: 'SPATIAL_VERIFIED',
            details: 'GIS boundary coordinates verified. Non-overlapping polygon approved for oracle stage.',
          },
        ],
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 86400000 * 1,
      },
    ];

    seedParcels.forEach(p => {
      this.parcels.set(p.id, p);
      if (p.nftTokenId) {
        blockchainEngine.nftRegistry.set(p.nftTokenId, {
          tokenId: p.nftTokenId,
          parcelId: p.id,
          titleNumber: p.titleNumber,
          ownerAddress: p.applicantWalletAddress,
          spatialHash: p.spatialHash,
          documentHash: p.documentHash,
          issuedAt: p.createdAt,
          isRevoked: false,
        });
      }
    });
  }

  public getAllParcels(): Parcel[] {
    return Array.from(this.parcels.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getParcelById(id: string): Parcel | undefined {
    return this.parcels.get(id);
  }

  public persist(): void {
    StorageEngine.saveParcels(this.getAllParcels());
  }

  public resetToDefaults(): void {
    StorageEngine.resetStorage();
    this.parcels.clear();
    this.seedInitialCadastre();
    this.persist();
  }

  public hydrateFromFirestore(parcels: Parcel[]): void {
    this.parcels.clear();
    blockchainEngine.nftRegistry.clear();
    for (const p of parcels) {
      this.parcels.set(p.id, p);
      if (p.nftTokenId) {
        blockchainEngine.nftRegistry.set(p.nftTokenId, {
          tokenId: p.nftTokenId,
          parcelId: p.id,
          titleNumber: p.titleNumber,
          ownerAddress: p.applicantWalletAddress,
          spatialHash: p.spatialHash,
          documentHash: p.documentHash,
          issuedAt: p.createdAt,
          isRevoked: p.isRevoked || false,
          revocation: p.revocationData
            ? {
                ground: p.revocationData.ground,
                revokedBy: p.revocationData.revokedBy,
                timestamp: p.revocationData.timestamp,
                txHash: p.revocationData.txHash,
              }
            : undefined,
        });
      }
    }
  }

  public importParcels(importedList: Partial<Parcel>[]): number {
    let count = 0;
    for (const item of importedList) {
      if (!item.coordinates || item.coordinates.length < 3) continue;
      const id = 'PARCEL-IMP-' + Math.floor(1000 + Math.random() * 9000);
      const titleNumber = `NG-IMP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const spatialHash = gisEngine.generateSpatialHash(item.coordinates);

      const p: Parcel = {
        id,
        titleNumber,
        applicantName: item.applicantName || 'Imported Cadastral Parcel',
        applicantIdNumber: item.applicantIdNumber || 'NIN-SURVEY-9900',
        applicantAddress: item.applicantAddress || 'Plot Survey Layout',
        applicantPhone: item.applicantPhone || '+234 800 000 0000',
        applicantWalletAddress: item.applicantWalletAddress || '0x' + Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b => b.toString(16).padStart(2, '0')).join(''),
        locationName: item.locationName || 'Imported Cadastral Sector',
        lga: item.lga || 'Abuja Municipal',
        state: item.state || 'FCT',
        coordinates: item.coordinates,
        areaSqm: item.areaSqm || 250000,
        perimeterMeters: item.perimeterMeters || 2000,
        spatialHash,
        documentHash: '0xImportedCadastralSurveyDocument_' + Date.now(),
        landUse: (item.landUse as any) || 'Residential',
        deedReference: item.deedReference || `DEED-IMP-${Date.now().toString().slice(-4)}`,
        customaryClan: item.customaryClan || 'Gbagyi Indigenous Council',
        communityElderAttestation: 'Survey Beacon imported and validated',
        status: 'SUBMITTED',
        timeline: [
          {
            id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            stage: 'GeoJSON Cadastre Import',
            role: 'SURVEYOR',
            actor: 'Field Survey Ingestion Engine',
            timestamp: Date.now(),
            status: 'SUBMITTED',
            details: 'Polygon boundary imported from survey GeoJSON file.',
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.parcels.set(id, p);
      count++;
    }
    this.persist();
    return count;
  }

  /**
   * Stage 1: Application Submission (Citizen role)
   */
  public submitApplication(
    data: Omit<Parcel, 'id' | 'titleNumber' | 'spatialHash' | 'status' | 'timeline' | 'createdAt' | 'updatedAt'>,
    role: UserRole
  ): { success: boolean; parcel?: Parcel; error?: string } {
    if (role !== 'CITIZEN' && role !== 'LAND_ADMIN') {
      return { success: false, error: 'Only Citizen or Land Administrator role can submit new applications.' };
    }

    const id = 'PARCEL-NG-' + Math.floor(100 + Math.random() * 900);
    const titleNumber = `NG-${data.state.substring(0, 3).toUpperCase()}-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const spatialHash = gisEngine.generateSpatialHash(data.coordinates);

    const newParcel: Parcel = {
      ...data,
      id,
      titleNumber,
      spatialHash,
      status: 'SUBMITTED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timeline: [
        {
          id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          stage: 'Application Submission',
          role,
          actor: data.applicantName,
          timestamp: Date.now(),
          status: 'SUBMITTED',
          details: `Application submitted for ${data.landUse} land parcel in ${data.locationName}.`,
        },
      ],
    };

    this.parcels.set(id, newParcel);
    this.persist();

    // Publish MQTT status notification
    mqttBrokerEngine.publish('land/registration/status', {
      applicationId: id,
      titleNumber,
      status: 'SUBMITTED',
      timestamp: Date.now(),
    });

    return { success: true, parcel: newParcel };
  }

  /**
   * Stage 2: Spatial Verification (Surveyor role)
   */
  public verifySpatial(
    parcelId: string,
    role: UserRole,
    surveyorName: string,
    bufferMeters: number = 0.5
  ): { success: boolean; parcel?: Parcel; error?: string; outcome?: string } {
    if (role !== 'SURVEYOR' && role !== 'LAND_ADMIN') {
      return { success: false, error: 'Access Denied: Only Registered Surveyor or Land Admin can execute GIS validation.' };
    }

    const parcel = this.parcels.get(parcelId);
    if (!parcel) return { success: false, error: 'Parcel not found' };

    const validation = gisEngine.validateParcel(
      parcel.coordinates,
      this.getAllParcels(),
      parcel.id,
      bufferMeters
    );

    if (!validation.isValid) {
      parcel.status = 'REJECTED';
      parcel.rejectionReason = `Spatial Validation Failed: ${validation.outcome} - ${validation.details}`;
      parcel.updatedAt = Date.now();
      parcel.timeline.push({
        id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        stage: 'Spatial GIS Verification',
        role,
        actor: surveyorName,
        timestamp: Date.now(),
        status: 'REJECTED',
        details: parcel.rejectionReason,
      });

      mqttBrokerEngine.publish('land/spatial/cadastre', {
        applicationId: parcel.id,
        status: 'REJECTED_SPATIAL',
        outcome: validation.outcome,
        details: validation.details,
      });

      return { success: false, parcel, error: validation.details, outcome: validation.outcome };
    }

    parcel.status = 'SPATIAL_VERIFIED';
    parcel.updatedAt = Date.now();
    parcel.timeline.push({
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Spatial GIS Verification',
      role,
      actor: surveyorName,
      timestamp: Date.now(),
      status: 'SPATIAL_VERIFIED',
      details: `ST_IsValid() passed; ST_Intersects(ST_Buffer(${bufferMeters}m)) passed with 0 overlaps. Validated area: ${validation.geometryAnalysis.calculatedAreaSqm.toFixed(1)} m².`,
    });

    mqttBrokerEngine.publish('land/spatial/cadastre', {
      applicationId: parcel.id,
      status: 'SPATIAL_VERIFIED',
      spatialHash: parcel.spatialHash,
      areaSqm: validation.geometryAnalysis.calculatedAreaSqm,
    });

    this.persist();
    return { success: true, parcel, outcome: validation.outcome };
  }

  /**
   * Stage 3: Community Attestation / Ownership Verification Oracle (Land Admin or Oracle role)
   */
  public verifyOracle(
    parcelId: string,
    role: UserRole
  ): { success: boolean; parcel?: Parcel; error?: string; outcome?: string } {
    const parcel = this.parcels.get(parcelId);
    if (!parcel) return { success: false, error: 'Parcel not found' };
    if (parcel.status !== 'SPATIAL_VERIFIED') {
      return { success: false, error: 'Parcel must pass GIS spatial verification first.' };
    }

    const verification = oracleEngine.verifyOwnership(
      parcel.applicantName,
      parcel.applicantIdNumber,
      parcel.deedReference,
      parcel.customaryClan,
      parcel.documentHash
    );

    if (!verification.isApproved) {
      if (verification.outcome === 'Legal verification pending') {
        parcel.status = 'SUBMITTED';
      } else {
        parcel.status = 'REJECTED';
      }
      parcel.rejectionReason = `Oracle Verification Failed: ${verification.outcome} - ${verification.details}`;
      parcel.updatedAt = Date.now();
      parcel.timeline.push({
        id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        stage: 'Community Oracle Verification',
        role,
        actor: 'Cadastral Oracle Service',
        timestamp: Date.now(),
        status: parcel.status,
        details: parcel.rejectionReason,
      });

      mqttBrokerEngine.publish('land/registration/status', {
        applicationId: parcel.id,
        status: parcel.status,
        outcome: verification.outcome,
        details: verification.details,
      });

      return { success: false, parcel, error: verification.details, outcome: verification.outcome };
    }

    parcel.status = 'ORACLE_VERIFIED';
    parcel.updatedAt = Date.now();
    parcel.timeline.push({
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Community Oracle Verification',
      role,
      actor: 'Cadastral Oracle Service',
      timestamp: Date.now(),
      status: 'ORACLE_VERIFIED',
      details: `${verification.details} (Integrity Score: ${verification.integrityScore}%)`,
    });

    mqttBrokerEngine.publish('land/registration/status', {
      applicationId: parcel.id,
      status: 'ORACLE_VERIFIED',
      integrityScore: verification.integrityScore,
    });

    this.persist();
    return { success: true, parcel, outcome: verification.outcome };
  }

  /**
   * Stage 4: Legal Deeds Verification
   */
  public verifyLegal(
    parcelId: string,
    role: UserRole,
    examinerName: string
  ): { success: boolean; parcel?: Parcel; error?: string } {
    if (role !== 'REGISTRAR' && role !== 'LAND_ADMIN') {
      return { success: false, error: 'Access Denied: Only Legal Deeds Examiner / Registrar can perform legal clearance.' };
    }

    const parcel = this.parcels.get(parcelId);
    if (!parcel) return { success: false, error: 'Parcel not found' };
    if (parcel.status !== 'ORACLE_VERIFIED') {
      return { success: false, error: 'Parcel must pass Community Oracle attestation before legal review.' };
    }

    parcel.status = 'LEGAL_VERIFIED';
    parcel.updatedAt = Date.now();
    parcel.timeline.push({
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Legal Verification',
      role,
      actor: examinerName,
      timestamp: Date.now(),
      status: 'LEGAL_VERIFIED',
      details: 'Statutory compliance checked under Nigeria Land Use Act (1978). Unencumbered tenure confirmed.',
    });

    mqttBrokerEngine.publish('land/registration/status', {
      applicationId: parcel.id,
      status: 'LEGAL_VERIFIED',
    });

    this.persist();
    return { success: true, parcel };
  }

  /**
   * Stage 5: Registrar Approval
   */
  public approveByRegistrar(
    parcelId: string,
    role: UserRole,
    registrarName: string
  ): { success: boolean; parcel?: Parcel; error?: string } {
    if (role !== 'REGISTRAR') {
      return { success: false, error: 'Access Denied: Only designated Registrar of Titles can grant statutory approval.' };
    }

    const parcel = this.parcels.get(parcelId);
    if (!parcel) return { success: false, error: 'Parcel not found' };
    if (parcel.status !== 'LEGAL_VERIFIED') {
      return { success: false, error: 'Parcel must have legal verification cleared before registrar approval.' };
    }

    parcel.status = 'APPROVED';
    parcel.updatedAt = Date.now();
    parcel.timeline.push({
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Registrar Approval',
      role,
      actor: registrarName,
      timestamp: Date.now(),
      status: 'APPROVED',
      details: 'Formal statutory approval sanctioned. Commencing blockchain smart contract execution.',
    });

    mqttBrokerEngine.publish('land/registration/status', {
      applicationId: parcel.id,
      status: 'APPROVED',
    });

    this.persist();
    return { success: true, parcel };
  }

  /**
   * Stage 6 & 7: Blockchain Registration and NFT Title Issuance
   */
  public issueBlockchainTitleNFT(
    parcelId: string,
    role: UserRole
  ): { success: boolean; parcel?: Parcel; tx?: unknown; nft?: unknown; error?: string } {
    if (role !== 'REGISTRAR' && role !== 'LAND_ADMIN') {
      return { success: false, error: 'Only Registrar or Land Admin can trigger NFT title minting.' };
    }

    const parcel = this.parcels.get(parcelId);
    if (!parcel) return { success: false, error: 'Parcel not found' };
    if (parcel.status !== 'APPROVED') {
      return { success: false, error: 'Parcel must have registrar statutory approval prior to NFT minting.' };
    }

    // Call Component 2 smart contract execution
    const { tx, nft } = blockchainEngine.issueLandTitleNFT(parcel, blockchainEngine.registrarAddress);

    parcel.status = 'NFT_ISSUED';
    parcel.nftTokenId = nft.tokenId;
    parcel.blockchainTxHash = tx.txHash;
    parcel.updatedAt = Date.now();

    parcel.timeline.push({
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Blockchain NFT Title Issuance',
      role: 'REGISTRAR',
      actor: 'LandTitleNFT ERC-721 Contract',
      timestamp: Date.now(),
      txHash: tx.txHash,
      blockchainBlockNumber: tx.blockNumber,
      status: 'NFT_ISSUED',
      details: `ERC-721 Title NFT #${nft.tokenId} generated and registered on QBFT chain. Owner wallet: ${parcel.applicantWalletAddress}.`,
    });

    // Stage 8: MQTT notification
    mqttBrokerEngine.publish('land/nft/issued', {
      tokenId: nft.tokenId,
      titleNumber: parcel.titleNumber,
      owner: parcel.applicantWalletAddress,
      txHash: tx.txHash,
      spatialHash: parcel.spatialHash,
      timestamp: Date.now(),
    });

    this.persist();
    return { success: true, parcel, tx, nft };
  }

  /**
   * Statutory Revocation under Nigeria's Land Use Act (1978), Section 28
   * Strictly callable by GOVERNOR role
   */
  public revokeTitleByGovernor(
    parcelId: string,
    role: UserRole,
    governorName: string,
    ground: RevocationGround,
    reasonDetail: string
  ): { success: boolean; parcel?: Parcel; error?: string } {
    if (role !== 'GOVERNOR') {
      return {
        success: false,
        error: `AccessControl: Execution reverted. Under Section 28 Land Use Act (1978), statutory revocation is exclusively vested in the Governor. Current role '${role}' is unauthorised.`,
      };
    }

    const parcel = this.parcels.get(parcelId);
    if (!parcel) return { success: false, error: 'Parcel not found' };
    if (!parcel.nftTokenId) return { success: false, error: 'Parcel does not have an issued NFT title token.' };

    const result = blockchainEngine.revokeTitle(
      parcel.nftTokenId,
      ground,
      blockchainEngine.governorAddress,
      reasonDetail
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    parcel.status = 'REVOKED';
    parcel.isRevoked = true;
    parcel.revocationData = {
      ground,
      revokedBy: governorName,
      timestamp: Date.now(),
      txHash: result.tx.txHash,
      reasonDetail,
      blockNumber: result.tx.blockNumber,
    };
    parcel.updatedAt = Date.now();

    parcel.timeline.push({
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Statutory Revocation (Land Use Act Sec. 28)',
      role: 'GOVERNOR',
      actor: `${governorName} (Executive Governor)`,
      timestamp: Date.now(),
      txHash: result.tx.txHash,
      blockchainBlockNumber: result.tx.blockNumber,
      status: 'REVOKED',
      details: `Statutory revocation exercised under Section 28 (${ground === 'OverridingPublicInterest' ? 'Ground 0: Overriding Public Interest' : 'Ground 1: Breach of Statutory Condition'}). Gazette Ref: ${reasonDetail}.`,
    });

    // Publish alert to MQTT broker
    mqttBrokerEngine.publish('land/revocation/alert', {
      tokenId: parcel.nftTokenId,
      parcelId: parcel.id,
      titleNumber: parcel.titleNumber,
      ground,
      revokedBy: governorName,
      txHash: result.tx.txHash,
      timestamp: Date.now(),
    });

    this.persist();
    return { success: true, parcel };
  }

  /**
   * PDF Integration Test Outcome Table
   * "Table — End-to-End Registration Workflow Outcomes"
   */
  public getWorkflowOutcomesTable(): {
    outcomes: Array<{ status: string; count: number; percentage: number }>;
    total: number;
  } {
    const parcels = this.getAllParcels();
    const total = parcels.length;

    let nftIssuedCount = 0;
    let rejectedCount = 0;
    let cancelledCount = 0;
    let inProgressCount = 0;

    for (const p of parcels) {
      if (p.status === 'NFT_ISSUED' || p.status === 'REVOKED') {
        nftIssuedCount++;
      } else if (p.status === 'REJECTED') {
        rejectedCount++;
      } else if (p.status === 'CANCELLED' || p.status === 'DRAFT') {
        cancelledCount++;
      } else {
        inProgressCount++;
      }
    }

    const outcomes = [
      {
        status: 'Successfully completed (NFT issued)',
        count: nftIssuedCount,
        percentage: total ? Number(((nftIssuedCount / total) * 100).toFixed(1)) : 0,
      },
      {
        status: 'Rejected during review',
        count: rejectedCount,
        percentage: total ? Number(((rejectedCount / total) * 100).toFixed(1)) : 0,
      },
      {
        status: 'Cancelled by applicant',
        count: cancelledCount,
        percentage: total ? Number(((cancelledCount / total) * 100).toFixed(1)) : 0,
      },
      {
        status: 'Still under processing',
        count: inProgressCount,
        percentage: total ? Number(((inProgressCount / total) * 100).toFixed(1)) : 0,
      },
    ];

    return { outcomes, total };
  }
}

export const workflowEngine = new WorkflowEngine();
