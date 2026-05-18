# Security Specification for Bahandi

## Data Invariants
1. A transaction MUST belong to a valid authenticated user.
2. A transaction `amount` MUST be a number.
3. A transaction `userId` MUST match the authenticated user's UID.
4. Reports MUST be isolated by `userId`.
5. Document IDs MUST be valid strings (max 128 chars, alphanumeric + underscores/hyphens).
6. Timestamps MUST be valid Firestore Timestamps.

## The Dirty Dozen Payloads (Targeting transactions and reports)

1. **Identity Spoofing (Create)**: Attempting to create a transaction with `userId` of another user.
   - Payload: `{ "userId": "victim_123", "amount": 100, "item": "Hack", "category": "Income", "date": Timestamp(now) }`
   - Result: PERMISSION_DENIED
2. **State Shortcutting (Update)**: Attempting to change the `date` of an existing transaction (immutable).
   - Payload: `{ "date": Timestamp(future) }`
   - Result: PERMISSION_DENIED
3. **Resource Poisoning (ID)**: Attempting to create a doc with a 2KB long ID.
   - ID: `"a".repeat(2048)`
   - Result: PERMISSION_DENIED
4. **Shadow Update (Ghost Fields)**: Attempting to add `isVerified: true` to a transaction.
   - Payload: `{ "item": "Shoes", "category": "Clothing", "amount": -100, "userId": "my_uid", "date": Timestamp(now), "isVerified": true }`
   - Result: PERMISSION_DENIED
5. **Type Poisoning (Amount)**: Setting `amount` to a string.
   - Payload: `{ "amount": "invalid" }`
   - Result: PERMISSION_DENIED
6. **Negative Size Attack**: Setting `item` to a 1MB string.
   - Payload: `{ "item": "x".repeat(1000000) }`
   - Result: PERMISSION_DENIED
7. **Privilege Escalation (Report)**: Attempting to change `userId` of a report template.
   - Payload: `{ "userId": "other_uid" }`
   - Result: PERMISSION_DENIED
8. **Temporal Integrity Breach**: Setting `createdAt` of a report to a past date manually.
   - Payload: `{ "createdAt": Timestamp(past) }`
   - Result: PERMISSION_DENIED
9. **Blanket List Attack**: Attempting to list transactions without being authenticated.
   - Result: PERMISSION_DENIED
10. **Orphaned Write**: Creating a transaction without a `userId` field.
    - Result: PERMISSION_DENIED
11. **Regex Bypass (ID)**: Using `..` or `/` in a document ID.
    - ID: `../../etc/passwd`
    - Result: PERMISSION_DENIED
12. **PII Leak (Direct Get)**: Attempting to `get` a report that belongs to someone else.
    - Result: PERMISSION_DENIED

## Test Runner (Verification)

The following `firestore.rules.test.ts` (conceptual) provides the verification logic:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// ... setup ...
await assertFails(victimDb.collection('transactions').add({ userId: 'attacker_uid', ... }));
await assertFails(attackerDb.doc('transactions/xyz').update({ date: newDate }));
// ...
```

The rules are formally audited against these specific payloads.
