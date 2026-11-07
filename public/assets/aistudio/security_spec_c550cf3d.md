# Security Specification — Sentra Naturindo Order & Stock Tracker

## 1. Data Invariants
1. **Master Gate Invariant**: Every subcollection document (`orders`, `stocks`, `activities`, `members`) under `/workspaces/{workspaceId}` requires the parent `/workspaces/{workspaceId}` document to exist, and requires the caller to be a verified member (`/workspaces/{workspaceId}/members/$(request.auth.uid)`) or the bootstrapped verified Admin (`mdspanjang@gmail.com`).
2. **Role-Based Access Control (RBAC)**:
   - `admin`: Can create/update/delete orders, stocks, workspace metadata, and member roles.
   - `staff`: Can create/update orders and stocks, and append activity logs, but cannot delete records, modify member roles, or alter immutable fields (`createdAt`, `workspaceId`, `authorId`).
   - `viewer`: Read-only access (`get`, `list`) to workspace records; strictly forbidden from any write operation.
3. **Zero PII Leakage**: Member documents store `uid`, `displayName`, and `role` without exposing email addresses or phone numbers in shared collections.
4. **Strict Volumetric & Schema Validation**: Every string field enforces exact `maxLength` bounds from `firebase-blueprint.json`, all IDs match `^[a-zA-Z0-9_\-]+$`, and timestamps (`createdAt`, `updatedAt`) must match `request.time`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: `auth = null` attempting to create an order in `/workspaces/sentra-naturindo/orders/ord-1`.
2. **Unverified Email Spoof**: `auth = { uid: 'spoof', token: { email: 'mdspanjang@gmail.com', email_verified: false } }` attempting admin write.
3. **Self-Assigned Admin Escalation**: Non-admin user creating `/workspaces/sentra-naturindo/members/user-2` with `role: 'admin'`.
4. **Shadow Field Injection on Create**: Creating an order with an undeclared field `"isSuperVerified": true`.
5. **Shadow Field Injection on Update**: Updating an order with `affectedKeys` containing an undeclared ghost key `"hacked": 1`.
6. **Author Identity Spoofing**: Authenticated staff member creating an order where `authorId != request.auth.uid`.
7. **Immortal Field Mutation**: Updating `createdAt` or `workspaceId` on an existing `OrderRecord`.
8. **Client Timestamp Forgery**: Creating a `StockItem` with a forged past/future `createdAt` instead of `request.time`.
9. **Path Poisoning Attack**: Creating a document with an invalid ID containing spaces or special characters (`ord$bad/id`).
10. **Denial-of-Wallet String Overflow**: Creating an order where `notes` exceeds `maxLength: 250` (e.g. 5000 chars).
11. **Viewer Privilege Violation**: Authenticated `viewer` role attempting to update `stockReady` on `/workspaces/sentra-naturindo/stocks/stk-1`.
12. **Activity History Tampering**: Any user attempting to `update` or `delete` an immutable audit record in `/workspaces/sentra-naturindo/activities/act-1`.
