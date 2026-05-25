const express = require('express');
const app = express();
const PORT = process.env.PORT || 8081;

// Middleware to parse incoming JSON payloads from Pega Connect-REST
app.use(express.json());

// Bypasses the ngrok/Railway browser warning screens if you test through proxies
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Mock In-Memory Databases
const otpStore = {};       // Format: { phoneNumber: "123456" }
const userProfiles = {};   // Format: { userId: { name, email, ... } }
const dematAccounts = {};  // Format: { userId: { dematId, status, ... } }
const payments = {};       // Format: { paymentId: { amount, status, ... } }

// Helper to generate IDs
const generateId = (prefix) => `${prefix}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

// ==========================================
// STAGE 1: ONBOARDING & OTP AUTHENTICATION
// ==========================================

// 1. Send OTP
app.post('/api/auth/send-otp', (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "Missing phoneNumber" });

  const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[phoneNumber] = mockOtp; // Store it for verification step

  console.log(`[OTP Sent] Phone: ${phoneNumber} | OTP: ${mockOtp}`);
  res.json({ success: true, message: "OTP sent successfully to your device.", phone: phoneNumber });
});

// 2. Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { phoneNumber, otp } = req.body;
  
  if (otpStore[phoneNumber] && otpStore[phoneNumber] === otp) {
    delete otpStore[phoneNumber]; // Consume OTP after successful verification
    const temporaryUserId = generateId('USR');
    return res.json({ authenticated: true, message: "OTP verified.", userId: temporaryUserId });
  }

  res.status(400).json({ authenticated: false, error: "Invalid OTP or phone number match failed." });
});

// ==========================================
// STAGE 2: USER PROFILE MANAGEMENT
// ==========================================

// 3. Create User Profile
app.post('/api/user/profile', (req, res) => {
  const { userId, name, email, phone } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  userProfiles[userId] = {
    userId,
    name,
    email,
    phone,
    panCard: null,
    kycStatus: "PENDING",
    bankDetails: null
  };

  res.status(201).json({ success: true, profile: userProfiles[userId] });
});

// 4. Get User Profile (Great for Pega Savvy/Saveless Data Pages)
app.get('/api/user/profile/:userId', (req, res) => {
  const profile = userProfiles[req.params.userId];
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

// ==========================================
// STAGE 3: KYC & VERIFICATION
// ==========================================

// 5. Verify PAN Card
app.post('/api/kyc/verify-pan', (req, res) => {
  const { userId, panNumber } = req.body;
  if (!userProfiles[userId]) return res.status(404).json({ error: "User profile not found" });

  // Simple mock validation logic
  const isValidPan = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.toUpperCase());
  
  if (!isValidPan) {
    return res.status(400).json({ isValid: false, error: "Invalid PAN structure formatting." });
  }

  userProfiles[userId].panCard = panNumber.toUpperCase();
  res.json({ isValid: true, panNumber: panNumber.toUpperCase(), holderName: userProfiles[userId].name });
});

// 6. Update KYC Status
app.patch('/api/kyc/status', (req, res) => {
  const { userId, kycStatus } = req.body; // Expected: APPROVED, REJECTED, PENDING
  if (!userProfiles[userId]) return res.status(404).json({ error: "User profile not found" });

  userProfiles[userId].kycStatus = kycStatus;
  res.json({ success: true, userId, updatedKycStatus: userProfiles[userId].kycStatus });
});

// 7. Penny Drop (Bank Account Validation)
app.post('/api/bank/penny-drop', (req, res) => {
  const { userId, accountNumber, ifscCode } = req.body;
  if (!userProfiles[userId]) return res.status(404).json({ error: "User profile not found" });

  // Simulate banking server response verifying the holder name matching
  userProfiles[userId].bankDetails = { accountNumber, ifscCode, verified: true };
  
  res.json({
    status: "VERIFIED",
    amountDeposited: "1.00",
    currency: "INR",
    bankRegisteredName: userProfiles[userId].name
  });
});

// ==========================================
// STAGE 4: DEMAT ACCOUNT CREATION
// ==========================================

// 8. Create Demat Account
app.post('/api/demat/create', (req, res) => {
  const { userId } = req.body;
  if (!userProfiles[userId]) return res.status(404).json({ error: "Cannot create Demat without a profile." });

  const dematId = generateId('BOID'); // Beneficiary Owner ID
  dematAccounts[userId] = {
    dematId,
    userId,
    status: "CREATED",
    activationDate: null
  };

  res.status(201).json({ message: "Demat generation scheduled.", dematDetails: dematAccounts[userId] });
});

// 9. Activate Account
app.post('/api/demat/activate', (req, res) => {
  const { userId } = req.body;
  if (!dematAccounts[userId]) return res.status(404).json({ error: "No Demat account found for this user." });

  dematAccounts[userId].status = "ACTIVE";
  dematAccounts[userId].activationDate = new Date().toISOString();

  res.json({ success: true, status: "ACTIVE", accountDetails: dematAccounts[userId] });
});

// 10. Get Account Details
app.get('/api/demat/details/:userId', (req, res) => {
  const demat = dematAccounts[req.params.userId];
  if (!demat) return res.status(404).json({ error: "Demat account records missing." });
  res.json(demat);
});

// ==========================================
// STAGE 5: PAYMENT ENGINE (BUY / FUNDING)
// ==========================================

// 11. Initiate Payment
app.post('/api/payment/initiate', (req, res) => {
  const { userId, amount, paymentMethod } = req.body;
  if (!userProfiles[userId]) return res.status(404).json({ error: "User session missing." });

  const paymentId = generateId('TXN');
  payments[paymentId] = {
    paymentId,
    userId,
    amount,
    paymentMethod,
    status: "PENDING" // Starts pending for Pega Wait Shape workflows
  };

  res.status(202).json({ paymentId, status: "PENDING", message: "Payment checkout initialized." });
});

// 12. Get Payment Status (Ideal for Pega poll loops or Queue Processors)
app.get('/api/payment/status/:paymentId', (req, res) => {
  const payment = payments[req.params.paymentId];
  if (!payment) return res.status(404).json({ error: "Transaction record empty." });

  // Simulation: Automatically shift a pending payment to SUCCESS when Pega checks it 
  if (payment.status === "PENDING") {
    payment.status = "SUCCESS";
  }

  res.json(payment);
});

// Start listening for traffic
app.listen(PORT, () => {
  console.log(`Server running successfully on port ${PORT}`);
});