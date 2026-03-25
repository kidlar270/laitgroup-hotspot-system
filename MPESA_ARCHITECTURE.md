# Complete M-Pesa to MikroTik Integration Architecture

## Overview

This document explains how M-Pesa STK Push payments integrate with MikroTik router hotspot to automatically bring users online after successful payment.

## Complete Payment & Access Flow

```
Step 1: Customer Connects to WiFi
   ↓
Step 2: Opens Hotspot Portal (login.html)
   ↓
Step 3: Sees Available Packages (synced from dashboard)
   ↓
Step 4: Clicks on Package to Select It
   ↓
Step 5: Enters M-Pesa Phone Number
   ↓
Step 6: Clicks "Send STK Push"
   ↓
┌─────────────────────────────────────────────┐
│ Firebase Function: initiateMpesaPayment()   │
│ - Validates owner & package                 │
│ - Calls Daraja API with STK Push request    │
│ - Stores payment record in Firestore        │
└─────────────────────────────────────────────┘
   ↓
Step 7: Customer Gets M-Pesa Prompt on Phone
   ↓
Step 8: Customer Enters M-Pesa PIN
   ↓
Step 9: Safaricom Processes Payment
   ↓
┌─────────────────────────────────────────────┐
│ Firebase Function: mpesaCallback()          │
│ - Receives payment confirmation from Daraja │
│ - Verifies transaction is successful (RC=0) │
│ - Creates new voucher code automatically    │
│ - Stores voucher in Firestore               │
│ - Updates payment record as "completed"     │
└─────────────────────────────────────────────┘
   ↓
Step 10: Portal Displays Generated Voucher Code
   ↓
Step 11: Customer Uses Voucher Code on Portal
   ↓
┌──────────────────────────────────────────────────┐
│ Portal Validation (login.html)                  │
│ - Looks up voucher code in Firestore            │
│ - Confirms voucher is active & not expired      │
│ - Sets voucher as "used"                        │
│ - Submits form to MikroTik with voucher details │
└──────────────────────────────────────────────────┘
   ↓
Step 12: MikroTik Authenticates User via Portal
   ↓
┌──────────────────────────────────────────────────┐
│ MikroTik Hotspot Server                         │
│ - Receives voucher code from portal             │
│ - Looks up in hotspot user list                 │
│ - Creates session for customer                  │
│ - Grants internet access for package duration   │
└──────────────────────────────────────────────────┘
   ↓
Step 13: ✅ CUSTOMER IS NOW ONLINE!
```

## Key Components

### 1. Frontend (login.html)
**Responsibilities:**
- Display available packages from Firestore
- Allow customer to select a package
- Collect M-Pesa phone number
- Call Firebase Function to initiate payment
- Display generated voucher code after payment
- Allow customer to authenticate on MikroTik hotspot

**Flow:**
```javascript
// Customer selects package
selectPackage(id, name, price, hours) 
  → selectedPackage = {id, name, price, hours}

// Customer enters phone and clicks button
initiateMpesaPayment(phoneNumber)
  → Calls Firebase Function initiateMpesaPayment
  → Display voucher code on success
```

### 2. Backend - Firebase Function: `initiateMpesaPayment`
**File:** `functions/index.js`

**Responsibilities:**
- Verify user is authenticated (via ID token)
- Get M-Pesa credentials from Firestore
- Validate package exists
- Call Daraja STK Push API
- Store payment request in Firestore

**Input:**
```json
{
  "phoneNumber": "0712345678",
  "amount": 100,
  "packageId": "pkg_123",
  "appId": "protech-d6a95",
  "userId": "user_uid_123"
}
```

**Output:**
```json
{
  "success": true,
  "checkoutRequestId": "ws_CO_DMZ_xxx",
  "message": "STK Push sent to your phone"
}
```

**Process:**
1. Verify Firebase ID token
2. Get M-Pesa config: `artifacts/{appId}/users/{userId}/config/mpesa`
3. Get Daraja access token using Consumer Key/Secret
4. Format phone number (ensure +254 format)
5. Generate timestamp and password for STK Push
6. Call Daraja `/mpesa/stkpush/v1/processrequest` endpoint
7. Store payment record with status "pending"
8. Return checkout request ID to frontend

### 3. Backend - Firebase Function: `mpesaCallback`
**File:** `functions/index.js`

**Responsibilities:**
- Receive webhook from Safaricom after payment
- Verify payment was successful
- Create voucher automatically
- Update payment record
- Store transaction details

**Input (from Daraja):**
```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "...",
      "CheckoutRequestID": "ws_CO_DMZ_xxx",
      "ResultCode": 0,
      "ResultDesc": "The transaction has been received successfully.",
      "CallbackMetadata": {
        "Item": [
          {"Name": "Amount", "Value": 100},
          {"Name": "MpesaReceiptNumber", "Value": "LKS123456789"},
          {"Name": "PhoneNumber", "Value": 254712345678}
        ]
      }
    }
  }
}
```

**Process:**
1. Verify payment successful (ResultCode === 0)
2. Find payment record using CheckoutRequestID
3. Extract package details
4. Generate unique voucher code (e.g., "ABC1234")
5. Create voucher in Firestore with:
   - code: "ABC1234"
   - status: "active"
   - price: 100
   - durationHours: 24
   - expiresAt: 90 days from now
   - transactionId: "LKS123456789"
6. Update payment record:
   - status: "completed"
   - voucherCode: "ABC1234"
   - completedAt: timestamp
7. Log success

### 4. MikroTik Portal Integration (login.html)
**Responsibilities:**
- Validate voucher against Firestore
- Submit to MikroTik hotspot authentication
- Handle session creation

**Current Implementation:**
```javascript
// When customer submits voucher form
voucherForm.addEventListener("submit", async (event) => {
  // Look up voucher in Firestore
  const voucherQuery = query(
    collection(db, "artifacts", appId, "users", ownerId, "vouchers"),
    where("code", "==", voucherCode)
  );
  
  // Verify voucher is active and not used
  if (voucher.status === "active" && !voucher.used) {
    // Set as used
    // Submit to MikroTik with voucher code as password
    voucherPasswordInput.value = voucherCode;
    voucherForm.submit();
  }
});
```

### 5. MikroTik Hotspot Configuration
**How MikroTik validates voucher codes:**

The portal form submits to MikroTik with:
```html
<form action="$(link-login-only)" method="post">
  <input name="username" value="voucher_code">
  <input name="password" value="voucher_code">
  <input type="submit">
</form>
```

MikroTik's hotspot server needs to be configured to:
1. Look up voucher_code in hotspot user list
2. Accept it as valid username/password
3. Create session for the user
4. Apply package duration and bandwidth limits

**MikroTik Setup (via sync script):**
The `app.js` generates a RouterOS script that:
1. Creates hotspot user with voucher code as username
2. Sets account to "voucher" type
3. Sets bandwidth limits per package
4. Sets session duration
5. Enables user when redeemed

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      FIRESTORE DATABASE                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Packages    │  │  Payments    │  │  Vouchers    │          │
│  │ (Master)     │  │ (Txn Log)    │  │ (Active)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
         ▲                  ▲                  ▲
         │                  │                  │
    reads              creates           updates
         │              writes            after
         │                  │              callback
         │                  │                  │
    ┌────┴────────┐  ┌──────┴──────┐  ┌───────┴───────┐
    │  login.html │  │ initiate    │  │  mpesa        │
    │  (portal)   │  │ MpesaPayment│  │  Callback     │
    └─────▲───────┘  └──────┬──────┘  └───────┬───────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                    Firebase Functions
                    (Deployed to GCP)
                          ▲
                          │
                    ┌─────┴─────┐
                    │  Daraja   │
                    │  API      │
                    │ (Safaricom)
                    └─────┬─────┘
                          │
                      M-Pesa Network
```

---

## Voucher Lifecycle

### Creation
1. Payment captured successfully
2. Firebase Function generates random code: "ABC1234"
3. Voucher stored in Firestore with:
   - Status: "active"
   - Used: false
   - ExpiresAt: 90 days

### Redemption
1. Customer enters code in portal: "ABC1234"
2. Portal validates against Firestore:
   - Status must be "active"
   - Used must be false
   - ExpiresAt must be in future
   - Owner matches ownerId
3. Portal marks voucher as used: used = true
4. Portal adds user to MikroTik hotspot

### Expiration
1. After 90 days, voucher can still exist in database
2. Portal rejects it (ExpiresAt < now)
3. Can be archived/deleted manually or via scheduled function

---

## Error Handling

### What if Daraja API fails?
```
initiateMpesaPayment() → ❌
  → Catch Daraja error
  → Return error to portal
  → Portal shows: "STK Push failed, try again"
  → Payment record stored as "failed"
```

### What if callback is late/lost?
```
Customer paid → No callback received
  → Payment record stays in "pending" status
  → Customer can still use voucher if somehow created
  → Admin can check Daraja dashboard for transaction proof
  → Manual voucher creation if needed
```

### What if customer closes browser mid-payment?
```
Payment processing → Customer closes browser
  → Callback still processed by Firebase Function
  → Voucher created regardless
  → Customer can reopen portal and see voucher
  → Or check their phone for M-Pesa confirmation
```

### What if MikroTik is offline when voucher is validated?
```
Voucher validation → MikroTik unreachable
  → Portal shows: "Router offline, try later"
  → Voucher stays active in Firestore
  → Customer can retry when MikroTik online
  → Voucher expires after 90 days regardless
```

---

## Security Considerations

1. **API Keys** - Stored in Firestore config, never exposed to frontend
2. **ID Token Verification** - All functions verify Firebase token
3. **Phone Number Validation** - Formatted consistently
4. **Voucher Codes** - Random alphanumeric, 7 characters
5. **Callback Verification** - Only ResultCode 0 accepted
6. **CORS** - Firebase Functions handle CORS properly
7. **HTTPs** - All Daraja API calls use HTTPS
8. **Timeout** - Firebase Functions have 60s timeout for payments

---

## Monitoring & Debugging

### Check Payment Records
```
Firestore → artifacts → protech-d6a95 → users → {userId} → payments
```
Each payment should have:
- phoneNumber
- amount
- packageId
- checkoutRequestId
- status (pending/completed)
- createdAt / completedAt

### Check Voucher Records
```
Firestore → artifacts → protech-d6a95 → users → {userId} → vouchers
```
Each voucher should have:
- code (unique)
- status (active)
- used (false = unused)
- expiresAt
- transactionId
- price, durationHours

### View Function Logs
```bash
firebase functions:log
# or in Google Cloud Console → Functions → Select function → Logs
```

### Test Payment Manually
1. Use Postman/curl to call initiateMpesaPayment
2. Manually trigger mpesaCallback with test data
3. Verify voucher created in Firestore

---

## What Happens Next (Auto-Login to MikroTik)

### Automatic Process
1. Voucher code generated
2. Portal displays: "XXX-1234 - Use this code to connect"
3. Customer enters code in portal form
4. Portal submits to MikroTik with username/password = voucher code
5. MikroTik authenticates the user
6. Session created with package duration
7. Customer gets online

### Manual Process (if auto-auth fails)
1. Customer gets voucher code from payment confirmation
2. Customer can manually enter code in portal "Redeem Voucher" section
3. Same process continues

---

## Future Enhancements

1. **Direct MikroTik User Creation** - Create user directly on router after payment (instead of voucher)
2. **Real-time Balance Check** - Show customer remaining data/time in real-time
3. **Auto-Renewal** - Save card and auto-renew subscription
4. **SMS Notification** - Send voucher code via SMS
5. **Email Receipt** - Send payment receipt and voucher via email
6. **Analytics Dashboard** - Track revenue, popular packages, peak hours
7. **Refund Processing** - Handle payment reversals from M-Pesa
8. **Multiple Payment Methods** - Add AirtelMoney, Equitel, etc.

---

## Deployment Checklist

- [ ] M-Pesa credentials obtained from Safaricom
- [ ] Daraja API account created
- [ ] Consumer Key & Secret copied
- [ ] Business Shortcode & Passkey obtained
- [ ] Callback URL planned (use Firebase Function)
- [ ] M-Pesa config stored in Firestore
- [ ] Firebase Functions deployed
- [ ] login.html updated with payment integration
- [ ] Packages created in dashboard
- [ ] Payment tested with real M-Pesa
- [ ] Voucher generation verified
- [ ] MikroTik router credentials configured
- [ ] Hotspot portal tested with voucher
- [ ] Customer can get online after payment ✅

---

## Support

For technical issues:
1. Check Firebase Cloud Functions logs
2. Verify all Firestore documents exist and have correct structure
3. Confirm M-Pesa credentials are valid and active
4. Test with small payment amount first
5. Contact Safaricom if Daraja API responses show errors
