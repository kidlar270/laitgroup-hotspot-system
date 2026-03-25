# M-Pesa STK Push Integration Guide

This guide will help you set up M-Pesa Daraja API integration for automatic STK Push payments and voucher generation.

## Prerequisites

- Active M-Pesa merchant account (Safaricom)
- Business Shortcode (from Safaricom)
- M-Pesa Passkey (from Safaricom)
- Daraja API credentials (Consumer Key & Consumer Secret)

---

## Step 1: Get M-Pesa Daraja Credentials

### 1.1 Register at Daraja Portal
1. Visit [https://developer.safaricom.co.ke/](https://developer.safaricom.co.ke/)
2. Sign up for a Daraja account
3. Log in to your dashboard

### 1.2 Create an App
1. Go to **My Apps** → **Create New App**
2. Give it a name (e.g., "HotspotPro Payment")
3. Select **Customer to Business Payments (C2B)** as the product
4. Create the app

### 1.3 Get Your Credentials
Once created, copy:
- **Consumer Key**
- **Consumer Secret**
- **BaseURL** (use Sandbox for testing)

### 1.4 Get Business Credentials from Safaricom
Contact your Safaricom M-Pesa business manager to provide:
- **Business Shortcode** (e.g., 174379)
- **M-Pesa Passkey** (for STK Push authentication)

---

## Step 2: Configure M-Pesa in HotspotPro Dashboard

### 2.1 Navigate to Settings
1. Open your HotspotPro Dashboard
2. Go to the **MikroTik Setup** tab
3. Scroll down and find the **M-Pesa Configuration** section

### 2.2 Enter Credentials
Fill in the following fields:

| Field | Value | Example |
|-------|-------|---------|
| **Consumer Key** | From Daraja Dashboard | `xxxxxxxxxxxxxx` |
| **Consumer Secret** | From Daraja Dashboard | `xxxxxxxxxxxxxx` |
| **Business Shortcode** | From Safaricom | `174379` |
| **M-Pesa Passkey** | From Safaricom | `bfb279f9aa9bdbcf158e97dd71a467cd` |
| **Callback URL** | Your webhook endpoint | `https://us-central1-protech-d6a95.cloudfunctions.net/mpesaCallback` |

### 2.3 Save Configuration
Click **Save M-Pesa Settings** and ensure you get a success message.

---

## Step 3: Deploy Firebase Functions

### 3.1 Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 3.2 Deploy Functions
```bash
cd functions
npm install
firebase deploy --only functions
```

After deployment, note the function URLs:
- `initiateMpesaPayment` - For initiating STK Push
- `mpesaCallback` - For receiving payment callbacks

### 3.3 Update Callback URL
Get the actual callback URL from Firebase Console → Functions → mpesaCallback → Trigger URL
Update the **Callback URL** in your M-Pesa configuration with this URL.

---

## Step 4: Test M-Pesa Integration

### 4.1 Create a Test Package
1. Go to **Packages** tab
2. Create a test package (e.g., "Test 1GB" - KES 100)
3. Save it

### 4.2 Test Payment Flow
1. Open the **Login Portal** URL
2. Select the test package
3. Enter your personal M-Pesa number (must be Safaricom)
4. Click **Send STK Push**
5. Check your phone for the M-Pesa prompt
6. Enter your M-Pesa PIN to complete payment

### 4.3 Verify Voucher Creation
1. After successful payment, go to **Vouchers** tab
2. You should see a new voucher created with:
   - Transaction ID
   - Package details
   - Expiry date (90 days)

---

## Step 5: Customer Usage Flow

### How Customers Access Internet:

1. **Customer connects to WiFi** named after your router
2. **Opens login portal** (redirect to `login.html`)
3. **Selects a package** (short-term or long-term)
4. **Enters M-Pesa number** (0712345678 format)
5. **Clicks "Send STK Push"**
6. **Receives M-Pesa prompt** on their phone
7. **Enters M-Pesa PIN** to complete payment
8. **System automatically creates voucher** and displays it
9. **Customer uses voucher code** to authenticate on hotspot portal
10. **Gets internet access** for the package duration

---

## Pricing Configuration

### Setting Package Prices

In the **Packages** tab:
- **Name**: Package description (e.g., "1GB Daily")
- **Price**: KES amount (e.g., 100)
- **Duration**: Hours of access (24 = 1 day)

Example packages:
```
1GB Daily       → 100 KES, 24 hours
5GB Weekly      → 300 KES, 168 hours (7 days)
10GB Monthly    → 500 KES, 720 hours (30 days)
```

---

## Troubleshooting

### Issue: "M-Pesa credentials not configured"
**Solution:** Ensure all M-Pesa settings are saved in the Dashboard → MikroTik Setup → M-Pesa Configuration

### Issue: "STK Push failed"
**Solution:** 
- Verify Consumer Key and Consumer Secret are correct
- Check that Business Shortcode is active with Safaricom
- Ensure you're using Sandbox URL for testing
- Verify M-Pesa Passkey format (should be from Safaricom)

### Issue: "Payment callback not received"
**Solution:**
- Check Firebase Functions logs in [Google Cloud Console](https://console.cloud.google.com/functions)
- Verify Callback URL is publicly accessible
- Ensure mpesaCallback function is deployed

### Issue: "Voucher not created after payment"
**Solution:**
- Check Firebase Firestore in Console → Firestore Database
- Verify payment record exists in `payments` collection
- Check Cloud Functions logs for errors

### Issue: "Customer used voucher but no internet access"
**Solution:**
- Verify MikroTik router is configured and online
- Check that sync script is running on the router
- Verify HotspotPro portal correctly validates vouchers

---

## Production Considerations

### Switch from Sandbox to Live

1. **Get Live Credentials**
   - Contact Safaricom for production credentials
   - Get live Business Shortcode and Passkey

2. **Update Configuration**
   - Change Daraja API endpoint from `sandbox.safaricom.co.ke` to `api.safaricom.co.ke`
   - Update Consumer Key and Consumer Secret
   - Update Business Shortcode

3. **Test with Real M-Pesa**
   - Test with small amount (e.g., 10 KES)
   - Verify payment appears in your business account

### Security Best Practices

- Store credentials in **Firebase Firestore** (already implemented)
- Never hardcode API keys in frontend code (already using Firebase Functions as proxy)
- Use HTTPS for all callbacks (Firebase Functions automatically use HTTPS)
- Verify callback signatures from Safaricom (implement if needed)
- Set up payment timeout handling (partially implemented)

---

## Support

For issues contact:
- **Safaricom M-Pesa Support**: +254 700 600 600
- **Daraja Developer Forum**: [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
- **HotspotPro Documentation**: Review `README.md`

---

## Architecture Summary

```
┌─────────────────┐
│  User Phone     │
│  (M-Pesa STK)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  login.html                 │
│  (Package Selection + Form) │
└────────┬────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  Firebase Cloud Function                 │
│  initiateMpesaPayment()                  │
│  - Validates user & package              │
│  - Calls Daraja STK Push API             │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Safaricom Daraja API                │
│  - Sends STK Push to phone           │
│  - Waits for M-Pesa PIN entry        │
└────────┬─────────────────────────────┘
         │ (Customer enters PIN)
         ▼
┌──────────────────────────────────────┐
│  Safaricom M-Pesa                    │
│  - Processes payment                 │
│  - Sends callback to webhook         │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│  Firebase Cloud Function                     │
│  mpesaCallback()                             │
│  - Verifies payment                          │
│  - Creates voucher in Firestore              │
│  - Stores transaction record                 │
└────────┬─────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Firestore Database                  │
│  - Payment record (completed)        │
│  - Generated voucher code            │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  login.html                              │
│  - Display voucher code to customer      │
│  - Enable voucher redemption             │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  MikroTik Hotspot Portal                 │
│  - Validate voucher code                 │
│  - Create user session                   │
│  - Grant internet access                 │
└──────────────────────────────────────────┘
```

---

## Next Steps

1. ✅ Deploy Firebase Functions
2. ✅ Configure M-Pesa credentials in Dashboard
3. ✅ Create test packages with prices
4. ✅ Test payment flow with your phone
5. ✅ Configure MikroTik router for hotspot auto-login
6. ✅ Go live with production credentials

Enjoy! 🚀
