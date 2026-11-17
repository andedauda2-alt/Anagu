import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AuditEvent,
  Coordinate,
  LedgerEventRecord,
  Parcel,
  ParcelStatus,
  RevocationGround,
  UserRole,
} from '../types';
import { blockchainEngine } from './blockchainEngine';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { gisEngine } from './gisEngine';
import { mqttBrokerEngine, oracleEngine } from './oracleMqttEngine';
import { workflowEngine } from './workflowEngine';

function tsToMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

function clampStr(val: string | undefined, max: number, fallback = ''): string {
  const s = (val ?? fallback).trim();
  return s.slice(0, max);
}

export function maskIdentityNumber(nin: string): string {
  const clean = nin.trim();
  if (clean.length <= 4) return '••••';
  return `${clean.slice(0, 3)}••••${clean.slice(-3)}`;
}

interface FirestoreCoord {
  lng: number;
  lat: number;
}

function coordsToFirestore(coords: Coordinate[]): FirestoreCoord[] {
  return coords.slice(0, 200).map(([lng, lat]) => ({
    lng: Number(lng),
    lat: Number(lat),
  }));
}

function coordsFromFirestore(raw: unknown): Coordinate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (Array.isArray(item) && item.length >= 2) {
        return [Number(item[0]), Number(item[1])] as Coordinate;
      }
      if (item && typeof item === 'object' && 'lng' in item && 'lat' in item) {
        const pt = item as { lng: number; lat: number };
        return [Number(pt.lng), Number(pt.lat)] as Coordinate;
      }
      return null;
    })
    .filter((pt): pt is Coordinate => pt !== null);
}

function beaconsToFirestore(
  beacons?: Array<{ beaconNumber: string; coordinates: Coordinate; accuracyMeters?: number; recordedAt: number }>
) {
  if (!beacons || beacons.length === 0) return undefined;
  return beacons.slice(0, 100).map((b) => ({
    beaconNumber: clampStr(b.beaconNumber, 32, 'B-01'),
    lng: Number(b.coordinates[0]),
    lat: Number(b.coordinates[1]),
    accuracyMeters: typeof b.accuracyMeters === 'number' ? b.accuracyMeters : 5,
    recordedAt: b.recordedAt,
  }));
}

function beaconsFromFirestore(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((b: Record<string, unknown>, idx: number) => ({
    beaconNumber: String(b.beaconNumber || `B-${idx + 1}`),
    coordinates: [Number(b.lng || 0), Number(b.lat || 0)] as Coordinate,
    accuracyMeters: typeof b.accuracyMeters === 'number' ? b.accuracyMeters : undefined,
    recordedAt: Number(b.recordedAt || Date.now()),
  }));
}

function sanitizeTimeline(timeline: AuditEvent[]): AuditEvent[] {
  return timeline.slice(-20).map((ev) => {
    const clean: AuditEvent = {
      id: clampStr(ev.id, 64, 'AUD-001'),
      stage: clampStr(ev.stage, 120, 'Stage'),
      role: ev.role,
      actor: clampStr(ev.actor, 120, 'Official'),
      timestamp: ev.timestamp,
      status: clampStr(ev.status, 40, 'SUBMITTED'),
      details: clampStr(ev.details, 400, ''),
    };
    if (ev.txHash) clean.txHash = clampStr(ev.txHash, 128);
    if (typeof ev.blockchainBlockNumber === 'number') {
      clean.blockchainBlockNumber = ev.blockchainBlockNumber;
    }
    return clean;
  });
}

export function deserializeParcelFromFirestore(
  data: Record<string, unknown>,
  pii?: { applicantIdNumber: string; applicantAddress: string; applicantPhone: string }
): Parcel {
  const masked = String(data.applicantIdMasked || 'NIN-••••');
  return {
    id: String(data.id),
    titleNumber: String(data.titleNumber),
    applicantUid: String(data.applicantUid || ''),
    applicantName: String(data.applicantName || ''),
    applicantIdNumber: pii?.applicantIdNumber || masked,
    applicantIdMasked: masked,
    applicantAddress: pii?.applicantAddress || 'Protected Registry Record',
    applicantPhone: pii?.applicantPhone || 'Protected',
    applicantWalletAddress: String(data.applicantWalletAddress || ''),
    locationName: String(data.locationName || ''),
    lga: String(data.lga || ''),
    state: String(data.state || ''),
    coordinates: coordsFromFirestore(data.coordinates),
    areaSqm: Number(data.areaSqm || 0),
    perimeterMeters: Number(data.perimeterMeters || 0),
    spatialHash: String(data.spatialHash || ''),
    documentHash: String(data.documentHash || ''),
    landUse: (data.landUse as Parcel['landUse']) || 'Residential',
    deedReference: String(data.deedReference || ''),
    customaryClan: String(data.customaryClan || ''),
    communityElderAttestation: String(data.communityElderAttestation || ''),
    status: (data.status as ParcelStatus) || 'SUBMITTED',
    rejectionReason: data.rejectionReason ? String(data.rejectionReason) : undefined,
    nftTokenId: typeof data.nftTokenId === 'number' ? data.nftTokenId : undefined,
    blockchainTxHash: data.blockchainTxHash ? String(data.blockchainTxHash) : undefined,
    isRevoked: Boolean(data.isRevoked),
    revocationData: data.revocationData as Parcel['revocationData'] | undefined,
    documentAttachment: data.documentAttachment as Parcel['documentAttachment'] | undefined,
    surveyBeacons: beaconsFromFirestore(data.surveyBeacons),
    signatureProof: data.signatureProof as Parcel['signatureProof'] | undefined,
    timeline: Array.isArray(data.timeline) ? (data.timeline as AuditEvent[]) : [],
    createdAt: tsToMs(data.createdAt),
    updatedAt: tsToMs(data.updatedAt),
  };
}

function serializeParcelDoc(
  parcel: Parcel,
  applicantUid: string,
  includeTimestamps: { created?: boolean; updated?: boolean }
): Record<string, unknown> {
  const docData: Record<string, unknown> = {
    id: clampStr(parcel.id, 128),
    titleNumber: clampStr(parcel.titleNumber, 64),
    applicantUid: clampStr(applicantUid, 128),
    applicantName: clampStr(parcel.applicantName, 120),
    applicantIdMasked: clampStr(
      parcel.applicantIdMasked || maskIdentityNumber(parcel.applicantIdNumber),
      32
    ),
    applicantWalletAddress: clampStr(parcel.applicantWalletAddress, 64),
    locationName: clampStr(parcel.locationName, 160),
    lga: clampStr(parcel.lga, 80),
    state: clampStr(parcel.state, 40),
    coordinates: coordsToFirestore(parcel.coordinates),
    areaSqm: Number(parcel.areaSqm),
    perimeterMeters: Number(parcel.perimeterMeters),
    spatialHash: clampStr(parcel.spatialHash, 128),
    documentHash: clampStr(parcel.documentHash, 128),
    landUse: parcel.landUse,
    deedReference: clampStr(parcel.deedReference, 80),
    customaryClan: clampStr(parcel.customaryClan, 120),
    communityElderAttestation: clampStr(parcel.communityElderAttestation, 300),
    status: parcel.status,
    isRevoked: Boolean(parcel.isRevoked),
    timeline: sanitizeTimeline(parcel.timeline),
  };

  if (parcel.rejectionReason) {
    docData.rejectionReason = clampStr(parcel.rejectionReason, 500);
  }
  if (typeof parcel.nftTokenId === 'number' && parcel.nftTokenId > 0) {
    docData.nftTokenId = parcel.nftTokenId;
  }
  if (parcel.blockchainTxHash) {
    docData.blockchainTxHash = clampStr(parcel.blockchainTxHash, 128);
  }
  if (parcel.revocationData) {
    docData.revocationData = {
      ground: parcel.revocationData.ground,
      revokedBy: clampStr(parcel.revocationData.revokedBy, 120),
      timestamp: parcel.revocationData.timestamp,
      txHash: clampStr(parcel.revocationData.txHash, 128),
      reasonDetail: clampStr(parcel.revocationData.reasonDetail, 500),
      blockNumber: parcel.revocationData.blockNumber,
    };
  }
  if (parcel.documentAttachment) {
    docData.documentAttachment = {
      fileName: clampStr(parcel.documentAttachment.fileName, 200),
      fileSize: parcel.documentAttachment.fileSize,
      fileType: clampStr(parcel.documentAttachment.fileType, 80),
      sha256: clampStr(parcel.documentAttachment.sha256, 128),
      uploadedAt: parcel.documentAttachment.uploadedAt,
    };
  }
  const beacons = beaconsToFirestore(parcel.surveyBeacons);
  if (beacons && beacons.length > 0) {
    docData.surveyBeacons = beacons;
  }
  if (parcel.signatureProof) {
    docData.signatureProof = {
      signerAddress: clampStr(parcel.signatureProof.signerAddress, 64),
      signature: clampStr(parcel.signatureProof.signature, 512),
      messageHash: clampStr(parcel.signatureProof.messageHash, 128),
      timestamp: parcel.signatureProof.timestamp,
    };
  }

  if (includeTimestamps.created) {
    docData.createdAt = serverTimestamp();
  }
  if (includeTimestamps.updated) {
    docData.updatedAt = serverTimestamp();
  }

  return docData;
}

export async function seedInitialCadastreIfEmpty(adminUid: string): Promise<boolean> {
  const existingCheck = query(collection(db, 'parcels'), limit(1));
  let snap;
  try {
    snap = await getDocs(existingCheck);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'parcels');
  }

  if (!snap.empty) {
    // Ensure pendingQueue exists
    try {
      const qSnap = await getDoc(doc(db, 'registry', 'pendingQueue'));
      if (!qSnap.exists()) {
        await setDoc(doc(db, 'registry', 'pendingQueue'), {
          parcelIds: [],
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // ignore if already exists or inaccessible
    }
    return false;
  }

  // Generate clean seed cadastre
  workflowEngine.resetToDefaults();
  const seeds = workflowEngine.getAllParcels();

  const batch = writeBatch(db);
  const pendingIds: string[] = [];

  for (const seed of seeds) {
    const pRef = doc(db, 'parcels', seed.id);
    const piiRef = doc(db, 'parcels', seed.id, 'private', 'applicant');

    batch.set(pRef, serializeParcelDoc(seed, adminUid, { created: true, updated: true }));
    batch.set(piiRef, {
      applicantUid: adminUid,
      applicantIdNumber: clampStr(seed.applicantIdNumber, 64),
      applicantAddress: clampStr(seed.applicantAddress, 240),
      applicantPhone: clampStr(seed.applicantPhone, 40),
      updatedAt: serverTimestamp(),
    });

    if (seed.status !== 'NFT_ISSUED' && seed.status !== 'REVOKED' && seed.status !== 'REJECTED') {
      pendingIds.push(seed.id);
    }

    if (seed.nftTokenId && seed.blockchainTxHash) {
      const evId = `EVT-SEED-${seed.nftTokenId}`;
      batch.set(doc(db, 'ledgerEvents', evId), {
        id: evId,
        parcelId: seed.id,
        titleNumber: clampStr(seed.titleNumber, 64),
        tokenId: seed.nftTokenId,
        method: 'MINT_TITLE_NFT',
        txHash: clampStr(seed.blockchainTxHash, 128),
        blockNumber: 1400 + seed.nftTokenId,
        actorUid: adminUid,
        isPublicLedger: true,
        createdAt: serverTimestamp(),
      });
    }
  }

  batch.set(doc(db, 'registry', 'pendingQueue'), {
    parcelIds: pendingIds,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'parcels');
  }
}

export function subscribeToCadastre(
  uid: string,
  role: UserRole,
  isAdmin: boolean,
  onUpdate: (parcels: Parcel[]) => void,
  onLedgerEvents?: (events: LedgerEventRecord[]) => void
): () => void {
  const publicMap = new Map<string, Parcel>();
  const ownMap = new Map<string, Parcel>();
  const queueMap = new Map<string, Parcel>();
  const piiCache = new Map<string, { applicantIdNumber: string; applicantAddress: string; applicantPhone: string }>();

  const isOfficialRole =
    isAdmin || role === 'SURVEYOR' || role === 'LAND_ADMIN' || role === 'REGISTRAR' || role === 'GOVERNOR';

  const emitMerged = () => {
    const merged = new Map<string, Parcel>();
    publicMap.forEach((p, id) => merged.set(id, p));
    queueMap.forEach((p, id) => merged.set(id, p));
    ownMap.forEach((p, id) => merged.set(id, p));

    const sorted = Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
    workflowEngine.hydrateFromFirestore(sorted);
    onUpdate(sorted);
  };

  // 1. Publicly verifiable titles (NFT_ISSUED & REVOKED)
  const publicQuery = query(
    collection(db, 'parcels'),
    where('status', 'in', ['NFT_ISSUED', 'REVOKED'])
  );
  const unsubPublic = onSnapshot(
    publicQuery,
    (snapshot) => {
      publicMap.clear();
      snapshot.docs.forEach((d) => {
        const p = deserializeParcelFromFirestore(d.data() as Record<string, unknown>, piiCache.get(d.id));
        publicMap.set(d.id, p);
      });
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'parcels(public)');
    }
  );

  // 2. Current user's own submitted parcels
  const ownQuery = query(
    collection(db, 'parcels'),
    where('applicantUid', '==', uid)
  );
  const unsubOwn = onSnapshot(
    ownQuery,
    async (snapshot) => {
      ownMap.clear();
      for (const d of snapshot.docs) {
        if (!piiCache.has(d.id)) {
          try {
            const piiSnap = await getDoc(doc(db, 'parcels', d.id, 'private', 'applicant'));
            if (piiSnap.exists()) {
              const pd = piiSnap.data();
              piiCache.set(d.id, {
                applicantIdNumber: String(pd.applicantIdNumber || ''),
                applicantAddress: String(pd.applicantAddress || ''),
                applicantPhone: String(pd.applicantPhone || ''),
              });
            }
          } catch {
            // fallback to masked
          }
        }
        const p = deserializeParcelFromFirestore(d.data() as Record<string, unknown>, piiCache.get(d.id));
        ownMap.set(d.id, p);
      }
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'parcels(own)');
    }
  );

  // 3. Official Queue / Admin full view
  let unsubQueue = () => {};
  if (isOfficialRole) {
    unsubQueue = onSnapshot(
      doc(db, 'registry', 'pendingQueue'),
      async (queueSnap) => {
        queueMap.clear();
        if (queueSnap.exists()) {
          const ids = Array.isArray(queueSnap.data().parcelIds)
            ? (queueSnap.data().parcelIds as string[])
            : [];
          await Promise.all(
            ids.map(async (parcelId) => {
              try {
                const pSnap = await getDoc(doc(db, 'parcels', parcelId));
                if (pSnap.exists()) {
                  if (!piiCache.has(parcelId)) {
                    try {
                      const piiSnap = await getDoc(doc(db, 'parcels', parcelId, 'private', 'applicant'));
                      if (piiSnap.exists()) {
                        const pd = piiSnap.data();
                        piiCache.set(parcelId, {
                          applicantIdNumber: String(pd.applicantIdNumber || ''),
                          applicantAddress: String(pd.applicantAddress || ''),
                          applicantPhone: String(pd.applicantPhone || ''),
                        });
                      }
                    } catch {
                      // ignore
                    }
                  }
                  const p = deserializeParcelFromFirestore(
                    pSnap.data() as Record<string, unknown>,
                    piiCache.get(parcelId)
                  );
                  if (
                    p.status !== 'NFT_ISSUED' &&
                    p.status !== 'REVOKED' &&
                    p.status !== 'REJECTED' &&
                    p.status !== 'CANCELLED'
                  ) {
                    queueMap.set(parcelId, p);
                  }
                }
              } catch (err) {
                handleFirestoreError(err, OperationType.GET, `parcels/${parcelId}`);
              }
            })
          );
        }
        emitMerged();
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'registry/pendingQueue');
      }
    );
  }

  // 4. Public Ledger Events
  let unsubLedger = () => {};
  if (onLedgerEvents) {
    const ledgerQuery = query(
      collection(db, 'ledgerEvents'),
      where('isPublicLedger', '==', true)
    );
    unsubLedger = onSnapshot(
      ledgerQuery,
      (snapshot) => {
        const events: LedgerEventRecord[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: String(data.id),
              parcelId: String(data.parcelId),
              titleNumber: String(data.titleNumber),
              tokenId: Number(data.tokenId),
              method: data.method as LedgerEventRecord['method'],
              txHash: String(data.txHash),
              blockNumber: Number(data.blockNumber),
              actorUid: String(data.actorUid),
              isPublicLedger: Boolean(data.isPublicLedger),
              createdAt: tsToMs(data.createdAt),
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt);
        onLedgerEvents(events);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'ledgerEvents');
      }
    );
  }

  return () => {
    unsubPublic();
    unsubOwn();
    unsubQueue();
    unsubLedger();
  };
}

export async function loadParcelPrivatePii(
  parcelId: string
): Promise<{ applicantIdNumber: string; applicantAddress: string; applicantPhone: string } | null> {
  try {
    const snap = await getDoc(doc(db, 'parcels', parcelId, 'private', 'applicant'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      applicantIdNumber: String(d.applicantIdNumber || ''),
      applicantAddress: String(d.applicantAddress || ''),
      applicantPhone: String(d.applicantPhone || ''),
    };
  } catch {
    return null;
  }
}

export async function submitApplicationFirestore(
  data: Omit<Parcel, 'id' | 'titleNumber' | 'spatialHash' | 'status' | 'timeline' | 'createdAt' | 'updatedAt'>,
  role: UserRole,
  options?: { bypassOfflineCheck?: boolean }
): Promise<{ success: boolean; parcel?: Parcel; queuedOffline?: boolean; queueId?: string; error?: string }> {
  const user = auth.currentUser;
  if (!user) {
    return { success: false, error: 'You must be signed in to submit a land application.' };
  }

  const isCurrentlyOffline =
    !options?.bypassOfflineCheck &&
    ((typeof navigator !== 'undefined' && !navigator.onLine) || !mqttBrokerEngine.isOnline);

  if (isCurrentlyOffline) {
    if (role !== 'CITIZEN' && role !== 'LAND_ADMIN') {
      return { success: false, error: 'Only Citizen or Land Administrator role can submit new applications.' };
    }
    const queueId = mqttBrokerEngine.queueOfflineRegistration({
      applicantName: data.applicantName,
      applicantIdNumber: data.applicantIdNumber,
      applicantAddress: data.applicantAddress,
      applicantPhone: data.applicantPhone,
      applicantWalletAddress: data.applicantWalletAddress,
      locationName: data.locationName,
      lga: data.lga,
      state: data.state,
      coordinates: data.coordinates,
      areaSqm: data.areaSqm,
      perimeterMeters: data.perimeterMeters,
      documentHash: data.documentHash,
      documentAttachment: data.documentAttachment,
      surveyBeacons: data.surveyBeacons,
      signatureProof: data.signatureProof,
      landUse: data.landUse,
      deedReference: data.deedReference,
      customaryClan: data.customaryClan,
      communityElderAttestation: data.communityElderAttestation,
      role,
    });
    return { success: true, queuedOffline: true, queueId };
  }

  const localRes = workflowEngine.submitApplication(data, role);
  if (!localRes.success || !localRes.parcel) {
    return localRes;
  }

  const parcel = localRes.parcel;
  parcel.applicantUid = user.uid;
  parcel.applicantIdMasked = maskIdentityNumber(data.applicantIdNumber);

  const parcelDocPayload = serializeParcelDoc(parcel, user.uid, { created: true, updated: true });
  const piiPayload = {
    applicantUid: user.uid,
    applicantIdNumber: clampStr(data.applicantIdNumber, 64),
    applicantAddress: clampStr(data.applicantAddress, 240),
    applicantPhone: clampStr(data.applicantPhone, 40),
    updatedAt: serverTimestamp(),
  };

  // Write parcel + PII + update pendingQueue atomically
  const batch = writeBatch(db);
  batch.set(doc(db, 'parcels', parcel.id), parcelDocPayload);
  batch.set(doc(db, 'parcels', parcel.id, 'private', 'applicant'), piiPayload);
  batch.update(doc(db, 'registry', 'pendingQueue'), {
    parcelIds: arrayUnion(parcel.id),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return { success: true, parcel };
  } catch (err) {
    // If pendingQueue document didn't exist yet, create it atomically in batch
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('No document to update') || msg.includes('not-found')) {
      const retryBatch = writeBatch(db);
      retryBatch.set(doc(db, 'parcels', parcel.id), parcelDocPayload);
      retryBatch.set(doc(db, 'parcels', parcel.id, 'private', 'applicant'), piiPayload);
      retryBatch.set(doc(db, 'registry', 'pendingQueue'), {
        parcelIds: [parcel.id],
        updatedAt: serverTimestamp(),
      });
      try {
        await retryBatch.commit();
        return { success: true, parcel };
      } catch (retryErr) {
        handleFirestoreError(retryErr, OperationType.WRITE, `parcels/${parcel.id}`);
      }
    }
    handleFirestoreError(err, OperationType.WRITE, `parcels/${parcel.id}`);
  }
}

export async function syncQueuedOfflineRegistrationsFirestore(): Promise<{
  syncedCount: number;
  failedCount: number;
  elapsedSec: number;
}> {
  const start = performance.now();
  const queuedItems = mqttBrokerEngine
    .getOfflineQueueItems()
    .filter((item) => item.kind === 'registration' && item.registrationPayload);

  if (queuedItems.length === 0) {
    return { syncedCount: 0, failedCount: 0, elapsedSec: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queuedItems) {
    const payload = item.registrationPayload!;
    try {
      const res = await submitApplicationFirestore(
        {
          applicantName: payload.applicantName,
          applicantIdNumber: payload.applicantIdNumber,
          applicantAddress: payload.applicantAddress,
          applicantPhone: payload.applicantPhone,
          applicantWalletAddress: payload.applicantWalletAddress,
          locationName: payload.locationName,
          lga: payload.lga,
          state: payload.state,
          coordinates: payload.coordinates,
          areaSqm: payload.areaSqm,
          perimeterMeters: payload.perimeterMeters,
          documentHash: payload.documentHash,
          documentAttachment: payload.documentAttachment,
          surveyBeacons: payload.surveyBeacons,
          signatureProof: payload.signatureProof,
          landUse: payload.landUse,
          deedReference: payload.deedReference,
          customaryClan: payload.customaryClan,
          communityElderAttestation: payload.communityElderAttestation,
        },
        (payload.role as UserRole) || 'CITIZEN',
        { bypassOfflineCheck: true }
      );
      if (res.success && res.parcel) {
        mqttBrokerEngine.removeOfflineQueueItem(item.id);
        mqttBrokerEngine.publish('land/registration/status', {
          applicationId: res.parcel.id,
          titleNumber: res.parcel.titleNumber,
          status: 'SYNCED_FROM_OFFLINE_QUEUE',
          offlineQueueId: item.id,
          timestamp: Date.now(),
        });
        syncedCount++;
      } else {
        failedCount++;
      }
    } catch {
      failedCount++;
    }
  }

  const elapsedSec = Number(Math.max(0.05, (performance.now() - start) / 1000).toFixed(2));
  return { syncedCount, failedCount, elapsedSec };
}

export async function importParcelsFirestore(
  importedList: Partial<Parcel>[]
): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required to import parcels.');

  let count = 0;
  for (const item of importedList) {
    if (!item.coordinates || item.coordinates.length < 3) continue;
    const res = await submitApplicationFirestore(
      {
        applicantName: item.applicantName || 'Imported Cadastral Parcel',
        applicantIdNumber: item.applicantIdNumber || 'NIN-SURVEY-9900',
        applicantAddress: item.applicantAddress || 'Plot Survey Layout',
        applicantPhone: item.applicantPhone || '+234 800 000 0000',
        applicantWalletAddress:
          item.applicantWalletAddress ||
          '0x' +
            Array.from(crypto.getRandomValues(new Uint8Array(20)))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(''),
        locationName: item.locationName || 'Imported Cadastral Sector',
        lga: item.lga || 'Abuja Municipal',
        state: item.state || 'FCT',
        coordinates: item.coordinates,
        areaSqm: item.areaSqm || 250000,
        perimeterMeters: item.perimeterMeters || 2000,
        documentHash: '0xImportedCadastralSurveyDocument_' + Date.now(),
        landUse: item.landUse || 'Residential',
        deedReference: item.deedReference || `DEED-IMP-${Date.now().toString().slice(-4)}`,
        customaryClan: item.customaryClan || 'Gbagyi Indigenous Council',
        communityElderAttestation: 'Survey Beacon imported and validated',
      },
      'CITIZEN'
    );
    if (res.success) count++;
  }
  return count;
}

export async function verifySpatialFirestore(
  parcel: Parcel,
  allParcels: Parcel[],
  role: UserRole,
  surveyorName: string,
  bufferMeters = 0.5
): Promise<{ success: boolean; parcel?: Parcel; error?: string; outcome?: string }> {
  if (role !== 'SURVEYOR' && role !== 'LAND_ADMIN') {
    return {
      success: false,
      error: 'Access Denied: Only Licensed Surveyor or Land Admin can execute GIS validation.',
    };
  }
  if (parcel.status !== 'SUBMITTED') {
    return { success: false, error: 'Parcel must be in SUBMITTED stage for spatial verification.' };
  }

  const validation = gisEngine.validateParcel(parcel.coordinates, allParcels, parcel.id, bufferMeters);
  const now = Date.now();

  if (!validation.isValid) {
    const rejectionReason = clampStr(
      `Spatial Validation Failed: ${validation.outcome} - ${validation.details}`,
      500
    );
    const updatedTimeline = sanitizeTimeline([
      ...parcel.timeline,
      {
        id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        stage: 'Spatial GIS Verification',
        role,
        actor: surveyorName,
        timestamp: now,
        status: 'REJECTED',
        details: rejectionReason,
      },
    ]);

    const batch = writeBatch(db);
    batch.update(doc(db, 'parcels', parcel.id), {
      status: 'REJECTED',
      rejectionReason,
      timeline: updatedTimeline,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'registry', 'pendingQueue'), {
      parcelIds: arrayRemove(parcel.id),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `parcels/${parcel.id}`);
    }

    mqttBrokerEngine.publish('land/spatial/cadastre', {
      applicationId: parcel.id,
      status: 'REJECTED_SPATIAL',
      outcome: validation.outcome,
      details: validation.details,
    });

    return {
      success: false,
      parcel: { ...parcel, status: 'REJECTED', rejectionReason, timeline: updatedTimeline },
      error: validation.details,
      outcome: validation.outcome,
    };
  }

  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Spatial GIS Verification',
      role,
      actor: surveyorName,
      timestamp: now,
      status: 'SPATIAL_VERIFIED',
      details: `ST_IsValid() passed; ST_Intersects(ST_Buffer(${bufferMeters}m)) passed with 0 overlaps. Validated area: ${validation.geometryAnalysis.calculatedAreaSqm.toFixed(1)} m².`,
    },
  ]);

  try {
    await updateDoc(doc(db, 'parcels', parcel.id), {
      status: 'SPATIAL_VERIFIED',
      rejectionReason: deleteField(),
      timeline: updatedTimeline,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${parcel.id}`);
  }

  mqttBrokerEngine.publish('land/spatial/cadastre', {
    applicationId: parcel.id,
    status: 'SPATIAL_VERIFIED',
    spatialHash: parcel.spatialHash,
    areaSqm: validation.geometryAnalysis.calculatedAreaSqm,
  });

  return {
    success: true,
    parcel: { ...parcel, status: 'SPATIAL_VERIFIED', timeline: updatedTimeline },
    outcome: validation.outcome,
  };
}

export async function verifyOracleFirestore(
  parcel: Parcel,
  role: UserRole
): Promise<{ success: boolean; parcel?: Parcel; error?: string; outcome?: string }> {
  if (role !== 'LAND_ADMIN' && role !== 'SURVEYOR' && role !== 'REGISTRAR') {
    return { success: false, error: 'Access Denied: Official role required for Community Oracle check.' };
  }
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
  const now = Date.now();

  if (!verification.isApproved) {
    const nextStatus: ParcelStatus =
      verification.outcome === 'Legal verification pending' ? 'SUBMITTED' : 'REJECTED';
    const rejectionReason = clampStr(
      `Oracle Verification Failed: ${verification.outcome} - ${verification.details}`,
      500
    );
    const updatedTimeline = sanitizeTimeline([
      ...parcel.timeline,
      {
        id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        stage: 'Community Oracle Verification',
        role,
        actor: 'Cadastral Oracle Service',
        timestamp: now,
        status: nextStatus,
        details: rejectionReason,
      },
    ]);

    const batch = writeBatch(db);
    batch.update(doc(db, 'parcels', parcel.id), {
      status: nextStatus,
      rejectionReason,
      timeline: updatedTimeline,
      updatedAt: serverTimestamp(),
    });
    if (nextStatus === 'REJECTED') {
      batch.update(doc(db, 'registry', 'pendingQueue'), {
        parcelIds: arrayRemove(parcel.id),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `parcels/${parcel.id}`);
    }

    return {
      success: false,
      parcel: { ...parcel, status: nextStatus, rejectionReason, timeline: updatedTimeline },
      error: verification.details,
      outcome: verification.outcome,
    };
  }

  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Community Oracle Verification',
      role,
      actor: 'Cadastral Oracle Service',
      timestamp: now,
      status: 'ORACLE_VERIFIED',
      details: `${verification.details} (Integrity Score: ${verification.integrityScore}%)`,
    },
  ]);

  try {
    await updateDoc(doc(db, 'parcels', parcel.id), {
      status: 'ORACLE_VERIFIED',
      rejectionReason: deleteField(),
      timeline: updatedTimeline,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${parcel.id}`);
  }

  return {
    success: true,
    parcel: { ...parcel, status: 'ORACLE_VERIFIED', timeline: updatedTimeline },
    outcome: verification.outcome,
  };
}

export async function verifyLegalFirestore(
  parcel: Parcel,
  role: UserRole,
  examinerName: string
): Promise<{ success: boolean; parcel?: Parcel; error?: string }> {
  if (role !== 'REGISTRAR' && role !== 'LAND_ADMIN') {
    return {
      success: false,
      error: 'Access Denied: Only Legal Deeds Examiner / Registrar can perform legal clearance.',
    };
  }
  if (parcel.status !== 'ORACLE_VERIFIED') {
    return { success: false, error: 'Parcel must pass Community Oracle attestation before legal review.' };
  }

  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Legal Verification',
      role,
      actor: examinerName,
      timestamp: Date.now(),
      status: 'LEGAL_VERIFIED',
      details: 'Statutory compliance checked under Nigeria Land Use Act (1978). Unencumbered tenure confirmed.',
    },
  ]);

  try {
    await updateDoc(doc(db, 'parcels', parcel.id), {
      status: 'LEGAL_VERIFIED',
      timeline: updatedTimeline,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${parcel.id}`);
  }

  return { success: true, parcel: { ...parcel, status: 'LEGAL_VERIFIED', timeline: updatedTimeline } };
}

export async function approveByRegistrarFirestore(
  parcel: Parcel,
  role: UserRole,
  registrarName: string
): Promise<{ success: boolean; parcel?: Parcel; error?: string }> {
  if (role !== 'REGISTRAR') {
    return {
      success: false,
      error: 'Access Denied: Only designated Registrar of Titles can grant statutory approval.',
    };
  }
  if (parcel.status !== 'LEGAL_VERIFIED') {
    return { success: false, error: 'Parcel must have legal verification cleared before registrar approval.' };
  }

  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Registrar Approval',
      role,
      actor: registrarName,
      timestamp: Date.now(),
      status: 'APPROVED',
      details: 'Formal statutory approval sanctioned. Commencing blockchain smart contract execution.',
    },
  ]);

  try {
    await updateDoc(doc(db, 'parcels', parcel.id), {
      status: 'APPROVED',
      timeline: updatedTimeline,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${parcel.id}`);
  }

  return { success: true, parcel: { ...parcel, status: 'APPROVED', timeline: updatedTimeline } };
}

export async function issueBlockchainTitleNFTFirestore(
  parcel: Parcel,
  role: UserRole
): Promise<{ success: boolean; parcel?: Parcel; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { success: false, error: 'Authentication required.' };

  if (role !== 'REGISTRAR' && role !== 'LAND_ADMIN') {
    return { success: false, error: 'Only Registrar or Land Admin can trigger NFT title minting.' };
  }
  if (parcel.status !== 'APPROVED') {
    return { success: false, error: 'Parcel must have registrar statutory approval prior to NFT minting.' };
  }

  const { tx, nft } = blockchainEngine.issueLandTitleNFT(parcel, blockchainEngine.registrarAddress);
  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Blockchain NFT Title Issuance',
      role: 'REGISTRAR',
      actor: 'LandTitleNFT ERC-721 Contract',
      timestamp: Date.now(),
      txHash: tx.txHash,
      blockchainBlockNumber: tx.blockNumber,
      status: 'NFT_ISSUED',
      details: `ERC-721 Token #${nft.tokenId} generated and registered. Owner wallet: ${parcel.applicantWalletAddress}.`,
    },
  ]);

  const evId = `EVT-MINT-${nft.tokenId}-${Date.now()}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'parcels', parcel.id), {
    status: 'NFT_ISSUED',
    nftTokenId: nft.tokenId,
    blockchainTxHash: clampStr(tx.txHash, 128),
    timeline: updatedTimeline,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'ledgerEvents', evId), {
    id: evId,
    parcelId: parcel.id,
    titleNumber: clampStr(parcel.titleNumber, 64),
    tokenId: nft.tokenId,
    method: 'MINT_TITLE_NFT',
    txHash: clampStr(tx.txHash, 128),
    blockNumber: tx.blockNumber,
    actorUid: user.uid,
    isPublicLedger: true,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'registry', 'pendingQueue'), {
    parcelIds: arrayRemove(parcel.id),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `parcels/${parcel.id}`);
  }

  mqttBrokerEngine.publish('land/nft/issued', {
    tokenId: nft.tokenId,
    titleNumber: parcel.titleNumber,
    owner: parcel.applicantWalletAddress,
    txHash: tx.txHash,
    spatialHash: parcel.spatialHash,
    timestamp: Date.now(),
  });

  return {
    success: true,
    parcel: {
      ...parcel,
      status: 'NFT_ISSUED',
      nftTokenId: nft.tokenId,
      blockchainTxHash: tx.txHash,
      timeline: updatedTimeline,
    },
  };
}

export async function revokeTitleByGovernorFirestore(
  parcel: Parcel,
  role: UserRole,
  governorName: string,
  ground: RevocationGround,
  reasonDetail: string
): Promise<{ success: boolean; parcel?: Parcel; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { success: false, error: 'Authentication required.' };

  if (role !== 'GOVERNOR') {
    return {
      success: false,
      error: `AccessControl: Execution reverted. Under Section 28 Land Use Act (1978), statutory revocation is exclusively vested in the Governor. Current role '${role}' is unauthorised.`,
    };
  }
  if (!parcel.nftTokenId) {
    return { success: false, error: 'Parcel does not have an issued NFT title token.' };
  }

  const result = blockchainEngine.revokeTitle(
    parcel.nftTokenId,
    ground,
    blockchainEngine.governorAddress,
    reasonDetail
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const revocationData = {
    ground,
    revokedBy: clampStr(governorName, 120),
    timestamp: Date.now(),
    txHash: clampStr(result.tx.txHash, 128),
    reasonDetail: clampStr(reasonDetail, 500),
    blockNumber: result.tx.blockNumber,
  };

  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Statutory Revocation (Land Use Act Sec. 28)',
      role: 'GOVERNOR',
      actor: `${governorName} (Executive Governor)`,
      timestamp: Date.now(),
      txHash: result.tx.txHash,
      blockchainBlockNumber: result.tx.blockNumber,
      status: 'REVOKED',
      details: `Statutory revocation exercised under Section 28 (${ground === 'OverridingPublicInterest' ? 'Ground 0: Overriding Public Interest' : 'Ground 1: Breach of Statutory Condition'}). Gazette Ref: ${reasonDetail}.`,
    },
  ]);

  const evId = `EVT-REV-${parcel.nftTokenId}-${Date.now()}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'parcels', parcel.id), {
    status: 'REVOKED',
    isRevoked: true,
    revocationData,
    timeline: updatedTimeline,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'ledgerEvents', evId), {
    id: evId,
    parcelId: parcel.id,
    titleNumber: clampStr(parcel.titleNumber, 64),
    tokenId: parcel.nftTokenId,
    method: 'REVOKE_TITLE_SEC28',
    txHash: clampStr(result.tx.txHash, 128),
    blockNumber: result.tx.blockNumber,
    actorUid: user.uid,
    isPublicLedger: true,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `parcels/${parcel.id}`);
  }

  mqttBrokerEngine.publish('land/revocation/alert', {
    tokenId: parcel.nftTokenId,
    parcelId: parcel.id,
    titleNumber: parcel.titleNumber,
    ground,
    revokedBy: governorName,
    txHash: result.tx.txHash,
    timestamp: Date.now(),
  });

  return {
    success: true,
    parcel: {
      ...parcel,
      status: 'REVOKED',
      isRevoked: true,
      revocationData,
      timeline: updatedTimeline,
    },
  };
}

export async function cancelApplicationFirestore(
  parcel: Parcel,
  role: UserRole,
  actorName: string,
  isAdmin: boolean = false
): Promise<{ success: boolean; parcel?: Parcel; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { success: false, error: 'Authentication required.' };

  const cancellableStages: ParcelStatus[] = [
    'SUBMITTED',
    'SPATIAL_VERIFIED',
    'ORACLE_VERIFIED',
    'LEGAL_VERIFIED',
    'APPROVED',
  ];
  if (!cancellableStages.includes(parcel.status)) {
    return {
      success: false,
      error: `Applications in '${parcel.status}' status cannot be cancelled.`,
    };
  }

  if (parcel.applicantUid !== user.uid && !isAdmin) {
    return {
      success: false,
      error: 'Only the original applicant or a Registry Admin can withdraw this application.',
    };
  }

  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Application Withdrawn / Cancelled',
      role,
      actor: actorName,
      timestamp: Date.now(),
      status: 'CANCELLED',
      details: 'Application withdrawn by applicant prior to Title NFT issuance.',
    },
  ]);

  const isOfficialRole =
    isAdmin || role === 'SURVEYOR' || role === 'LAND_ADMIN' || role === 'REGISTRAR' || role === 'GOVERNOR';

  try {
    if (isOfficialRole) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'parcels', parcel.id), {
        status: 'CANCELLED',
        timeline: updatedTimeline,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'registry', 'pendingQueue'), {
        parcelIds: arrayRemove(parcel.id),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(doc(db, 'parcels', parcel.id), {
        status: 'CANCELLED',
        timeline: updatedTimeline,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `parcels/${parcel.id}`);
  }

  mqttBrokerEngine.publish('land/registration/status', {
    applicationId: parcel.id,
    titleNumber: parcel.titleNumber,
    status: 'CANCELLED_BY_APPLICANT',
    timestamp: Date.now(),
  });

  return {
    success: true,
    parcel: {
      ...parcel,
      status: 'CANCELLED',
      timeline: updatedTimeline,
    },
  };
}

export async function transferTitleByRegistrarFirestore(
  parcel: Parcel,
  role: UserRole,
  registrarName: string,
  newOwnerName: string,
  newOwnerIdNumber: string,
  newOwnerWalletAddress: string
): Promise<{ success: boolean; parcel?: Parcel; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { success: false, error: 'Authentication required.' };

  if (!parcel.nftTokenId) {
    return { success: false, error: 'Parcel does not have an issued Title NFT.' };
  }

  const cleanName = clampStr(newOwnerName, 120);
  const cleanId = clampStr(newOwnerIdNumber, 64);
  const cleanWallet = clampStr(newOwnerWalletAddress, 64);

  if (cleanName.length < 2 || cleanId.length < 2 || cleanWallet.length < 10) {
    return {
      success: false,
      error: 'Valid transferee legal name, NIN/RC number, and wallet address are required.',
    };
  }

  const callerAddress =
    role === 'REGISTRAR' || role === 'LAND_ADMIN'
      ? blockchainEngine.registrarAddress
      : parcel.applicantWalletAddress || '0xUNAUTHORIZED_OWNER_CALLER';

  const result = blockchainEngine.transferTitle(
    parcel.nftTokenId,
    parcel.applicantWalletAddress,
    cleanWallet,
    callerAddress
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const newMaskedId = clampStr(maskIdentityNumber(cleanId), 32);
  const updatedTimeline = sanitizeTimeline([
    ...parcel.timeline,
    {
      id: 'AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      stage: 'Registry-Controlled Title Transfer',
      role,
      actor: registrarName,
      timestamp: Date.now(),
      txHash: result.tx.txHash,
      blockchainBlockNumber: result.tx.blockNumber,
      status: 'NFT_ISSUED',
      details: `Title NFT #${parcel.nftTokenId} transferred via statutory registry from ${parcel.applicantName} to ${cleanName} (${cleanWallet.slice(0, 10)}...).`,
    },
  ]);

  const evId = `EVT-XFER-${parcel.nftTokenId}-${Date.now()}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'parcels', parcel.id), {
    applicantName: cleanName,
    applicantIdMasked: newMaskedId,
    applicantWalletAddress: cleanWallet,
    blockchainTxHash: clampStr(result.tx.txHash, 128),
    timeline: updatedTimeline,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'ledgerEvents', evId), {
    id: evId,
    parcelId: parcel.id,
    titleNumber: clampStr(parcel.titleNumber, 64),
    tokenId: parcel.nftTokenId,
    method: 'TRANSFER_TITLE_NFT',
    txHash: clampStr(result.tx.txHash, 128),
    blockNumber: result.tx.blockNumber,
    actorUid: user.uid,
    isPublicLedger: true,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `parcels/${parcel.id}`);
  }

  mqttBrokerEngine.publish('land/nft/issued', {
    tokenId: parcel.nftTokenId,
    titleNumber: parcel.titleNumber,
    owner: cleanWallet,
    previousOwner: parcel.applicantWalletAddress,
    transferType: 'REGISTRY_CONTROLLED_TRANSFER',
    txHash: result.tx.txHash,
    spatialHash: parcel.spatialHash,
    timestamp: Date.now(),
  });

  return {
    success: true,
    parcel: {
      ...parcel,
      applicantName: cleanName,
      applicantIdMasked: newMaskedId,
      applicantWalletAddress: cleanWallet,
      blockchainTxHash: result.tx.txHash,
      timeline: updatedTimeline,
    },
  };
}
