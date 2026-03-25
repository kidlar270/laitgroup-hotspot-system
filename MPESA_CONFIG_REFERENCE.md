# M-Pesa Configuration Template

This file shows you the exact structure to store in your Firestore under:
`artifacts/{appId}/users/{userId}/config/mpesa`

## Firestore Document Structure

```json
{
  "consumerKey": "YOUR_CONSUMER_KEY_FROM_DARAJA",
  "consumerSecret": "YOUR_CONSUMER_SECRET_FROM_DARAJA",
  "businessShortcode": "174379",
  "passkey": "bfb279f9aa9bdbcf158e97dd71a467cd",
  "callbackUrl": "https://us-central1-protech-d6a95.cloudfunctions.net/mpesaCallback",
  "enabled": true,
  "sandboxMode": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

## Sandbox vs Production

### Sandbox (Testing)
```json
{
  "consumerKey": "test_consumer_key",
  "consumerSecret": "test_consumer_secret",
  "businessShortcode": "174379",
  "passkey": "bfb279f9aa9bdbcf158e97dd71a467cd",
  "callbackUrl": "https://us-central1-protech-d6a95.cloudfunctions.net/mpesaCallback",
  "enabled": true,
  "sandboxMode": true
}
```

### Production (Live)
```json
{
  "consumerKey": "live_consumer_key",
  "consumerSecret": "live_consumer_secret",
  "businessShortcode": "YOUR_REAL_SHORTCODE",
  "passkey": "YOUR_REAL_M_PESA_PASSKEY_FROM_SAFARICOM",
  "callbackUrl": "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/mpesaCallback",
  "enabled": true,
  "sandboxMode": false
}
```

## How to Add Configuration

### Method 1: Firebase Console (Recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Go to Firestore Database
4. Navigate to: `artifacts` → `protech-d6a95` → `users` → `YOUR_USER_ID` → `config`
5. Create new document named `mpesa`
6. Add the configuration fields above
7. Save

### Method 2: Firebase CLI
```bash
firebase firestore:set artifacts/protech-d6a95/users/{YOUR_USER_ID}/config/mpesa \
  --data '{
    "consumerKey": "YOUR_KEY",
    "consumerSecret": "YOUR_SECRET",
    "businessShortcode": "174379",
    "passkey": "YOUR_PASSKEY",
    "callbackUrl": "https://us-central1-protech-d6a95.cloudfunctions.net/mpesaCallback",
    "enabled": true,
    "sandboxMode": true
  }'
```

### Method 3: Add via Dashboard Frontend
1. Create a form in `index.html` under "MikroTik Setup" tab
2. Add M-Pesa configuration form
3. Save to Firestore when submitted

## Test Payment Flow

### Step 1: Add Test Vouchers (Optional)
Before testing, you can add sample vouchers:

```json
{
  "code": "TEST1234",
  "status": "active",
  "price": 100,
  "durationHours": 24,
  "name": "1GB Daily",
  "expiresAt": "2025-03-25T23:59:59.000Z",
  "used": false
}
```

### Step 2: Test STK Push
1. Open login portal: `http://your-domain/login.html?owner=YOUR_USER_ID`
2. Select a package
3. Enter M-Pesa number (e.g., 0712345678)
4. Click "Send STK Push"
5. Check your phone for M-Pesa prompt
6. Enter M-Pesa PIN

### Step 3: Verify Voucher Creation
Check Firestore under: `artifacts/protech-d6a95/users/YOUR_USER_ID/vouchers`

You should see a new document with:
- Auto-generated `code` (e.g., "ABC1234")
- Status: "active"
- Payment details
- Transaction ID

### Step 4: Test Voucher Redemption
1. Go to login portal again
2. Scroll to "Redeem Voucher"
3. Enter the generated voucher code
4. Click "Connect Now"
5. Should get internet access

## Common Issues & Solutions

### Issue: "FirebaseError: Missing or insufficient permissions"
**Solution:** 
- Enable anonymous auth in Firebase Console
- Add Firestore rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == get(/databases/$(database)/documents/artifacts/$(appId)/users/$(request.auth.uid)).data.uid;
    }
  }
}
```

### Issue: "access_token generation failed"
**Solution:**
- Verify Consumer Key and Consumer Secret are correct
- Check that Daraja credentials are for the correct Safaricom account
- Ensure credentials haven't expired (regenerate if needed)

### Issue: "Invalid BusinessShortcode"
**Solution:**
- Confirm Business Shortcode from Safaricom is correct
- Ensure the shortcode is active and enabled for STK Push
- Check if it's a till number or universal code

### Issue: "Invalid Passkey"
**Solution:**
- Verify M-Pesa Passkey from Safaricom (should be 32 characters)
- Ensure it's not expired (regenerate if needed)
- Check for extra spaces or formatting issues

## Payment Callback Data Structure

When payment is completed, the callback payload contains:

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "...",
      "CheckoutRequestID": "...",
      "ResultCode": 0,
      "ResultDesc": "The transaction has been received successfully.",
      "CallbackMetadata": {
        "Item": [
          {
            "Name": "Amount",
            "Value": 100
          },
          {
            "Name": "MpesaReceiptNumber",
            "Value": "LKS...MKJ"
          },
          {
            "Name": "TransactionDate",
            "Value": 20240325102530
          },
          {
            "Name": "PhoneNumber",
            "Value": 254712345678
          }
        ]
      }
    }
  }
}
```

## Daraja API Endpoints

### Sandbox Environment
```
Base URL: https://sandbox.safaricom.co.ke
OAuth Token: https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
STK Push: https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest
```

### Production Environment
```
Base URL: https://api.safaricom.co.ke
OAuth Token: https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
STK Push: https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest
```

## Firebase Functions Deployment

To deploy the M-Pesa functions:

```bash
cd functions
npm install  # Install dependencies including axios
firebase deploy --only functions:initiateMpesaPayment,functions:mpesaCallback
```

Check deployment status:
```bash
firebase functions:list
```

View logs:
```bash
firebase functions:log
```

## Phone Number Formatting

The system automatically formats phone numbers:

| Input | Output |
|-------|--------|
| `0712345678` | `254712345678` |
| `712345678` | `254712345678` |
| `254712345678` | `254712345678` |
| `+254712345678` | `254712345678` |

Ensure the number is a valid Safaricom number for STK Push to work.

## Support Resources

- **Daraja API Docs**: https://developer.safaricom.co.ke/docs
- **M-Pesa STK Push**: https://developer.safaricom.co.ke/docs#stk-push
- **Firebase Console**: https://console.firebase.google.com
- **Google Cloud Functions**: https://console.cloud.google.com/functions
