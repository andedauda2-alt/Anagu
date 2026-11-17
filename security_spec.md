# Anagu Land Registry — Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Self-Assigned Role Prevention**: A user creating `/users/{uid}` MUST NOT assign themselves `SURVEYOR`, `LAND_ADMIN`, `REGISTRAR`, or `GOVERNOR` (only `CITIZEN`, unless already verified as bootstrapped Admin). Only an Admin can modify `role` on `/users/{uid}`.
2. **PII Isolation**: User email/phone/address/NIN live exclusively in `/users/{uid}/private/contact` and parcel applicant NIN/phone/address live in `/parcels/{parcelId}/private/applicant`. Neither collection allows blanket reads or public listing.
3. **Immutable Ownership & Timestamps**: `applicantUid`, `uid`, and `createdAt` cannot be modified after creation. All `createdAt` and `updatedAt` timestamps must equal `request.time`.
4. **Stage-by-Stage State Machine & Role Gates**:
   - `SUBMITTED` creation: verified user with `applicantUid == request.auth.uid`, status must be `SUBMITTED`, `isRevoked == false`.
   - `SPATIAL_VERIFIED` (or spatial `REJECTED`): strictly `SURVEYOR`, `LAND_ADMIN`, or `ADMIN` from `SUBMITTED`.
   - `ORACLE_VERIFIED` (or oracle `REJECTED`/`SUBMITTED` hold): strictly `LAND_ADMIN`, `SURVEYOR`, `REGISTRAR`, or `ADMIN` from `SPATIAL_VERIFIED`.
   - `LEGAL_VERIFIED`: strictly `REGISTRAR`, `LAND_ADMIN`, or `ADMIN` from `ORACLE_VERIFIED`.
   - `APPROVED`: strictly `REGISTRAR` or `ADMIN` from `LEGAL_VERIFIED`.
   - `NFT_ISSUED`: strictly `REGISTRAR`, `LAND_ADMIN`, or `ADMIN` from `APPROVED`.
   - `TRANSFER_TITLE_NFT` (ownership update on `NFT_ISSUED`): strictly `REGISTRAR`, `LAND_ADMIN`, or `ADMIN` when `isRevoked == false`. Owner-initiated P2P transfers are blocked.
   - `CANCELLED` (applicant withdrawal before issuance): strictly the original `applicantUid` (or `ADMIN`) from `SUBMITTED`..`APPROVED`.
   - `REVOKED` (Land Use Act Section 28): strictly `GOVERNOR` (or `ADMIN`) from `NFT_ISSUED` with `isRevoked == false`.
5. **Terminal State Locking**: Once a parcel reaches `REVOKED`, `REJECTED`, or `CANCELLED`, non-admin updates are permanently blocked.
6. **Zero `get()`/`exists()` in `allow list`**: Every `allow list` rule evaluates only `resource.data` and `request.auth`. Officials read pending applications via `/registry/pendingQueue` (`allow get`) + `getDoc` on `/parcels/{parcelId}`.
7. **Append-Only Ledger Events**: `/ledgerEvents/{eventId}` allows creation only by verified officials/admins when referencing an existing parcel, and forbids updates or deletes.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation on Signup**: Creating `/users/{uid}` with `{ role: "GOVERNOR" }` as a non-admin user -> **DENIED**.
2. **Self-Promotion via Profile Update**: Updating `/users/{uid}` with `{ role: "REGISTRAR" }` as the owner -> **DENIED**.
3. **Ghost Field Injection (Shadow Update)**: Updating `/parcels/{id}` with `{ isVerified: true, status: "NFT_ISSUED" }` -> **DENIED** by `hasOnly()` and `isValidParcel()`.
4. **Unverified Email Write**: Attempting parcel creation with `request.auth.token.email_verified == false` -> **DENIED**.
5. **Email Spoofing Admin Check**: Token with admin email string but `email_verified: false` -> **DENIED**.
6. **Spoofed Applicant UID**: Creating `/parcels/{id}` with `applicantUid` set to another user's UID -> **DENIED**.
7. **Pipeline Stage Shortcutting**: Citizen or Surveyor trying to jump a parcel directly from `SUBMITTED` to `NFT_ISSUED` -> **DENIED**.
8. **Unauthorized Section 28 Revocation**: `REGISTRAR`, `CITIZEN`, or `SURVEYOR` attempting to set `status: "REVOKED"` or `isRevoked: true` -> **DENIED**.
9. **Post-Revocation Tampering**: Attempting to update `isRevoked: false` or `applicantName` on an already `REVOKED` parcel -> **DENIED**.
10. **PII Blanket Read**: Non-owner, non-official authenticated user attempting `get` on `/users/{otherUid}/private/contact` or `/parcels/{otherId}/private/applicant` -> **DENIED**.
11. **ID Poisoning / Oversized Payload**: Writing a 1.5KB document ID or 5,000-vertex coordinate list -> **DENIED** by `isValidId()` and `.size()` bounds.
12. **Timestamp Backdating & Queue Deletion**: Submitting `createdAt` in the past instead of `request.time`, or citizen trying to remove another user's parcel ID from `/registry/pendingQueue` -> **DENIED**.
