const crypto = require('crypto');
const midtransClient = require('midtrans-client');

let snapInstance = null;

const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || '')
  .trim()
  .toLowerCase() === 'true';

function assertMidtransConfig() {
  if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
    const error = new Error('Midtrans server key or client key is not configured');
    error.code = 'MIDTRANS_CONFIG_MISSING';
    throw error;
  }
}

function getSnapClient() {
  if (!snapInstance) {
    assertMidtransConfig();
    snapInstance = new midtransClient.Snap({
      isProduction,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY
    });
  }
  return snapInstance;
}

function getMidtransClientKey() {
  return process.env.MIDTRANS_CLIENT_KEY || null;
}

function verifyMidtransSignature(payload = {}) {
  assertMidtransConfig();
  const { order_id, status_code, gross_amount, signature_key } = payload;
  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return false;
  }
  const expectedSignature = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${process.env.MIDTRANS_SERVER_KEY}`)
    .digest('hex');
  return expectedSignature === signature_key;
}

function mapTransactionStatus(transactionStatus, fraudStatus) {
  const status = (transactionStatus || '').toLowerCase();
  const fraud = (fraudStatus || '').toLowerCase();

  if (status === 'capture') {
    return fraud === 'challenge' ? 'challenge' : 'settlement';
  }
  if (status === 'settlement') {
    return 'settlement';
  }
  if (status === 'pending') {
    return 'pending';
  }
  if (status === 'deny' || status === 'cancel') {
    return 'failure';
  }
  if (status === 'expire') {
    return 'expired';
  }
  if (status === 'refund' || status === 'partial_refund') {
    return 'refunded';
  }
  return status || 'unknown';
}

function isSuccessStatus(transactionStatus, fraudStatus) {
  return mapTransactionStatus(transactionStatus, fraudStatus) === 'settlement';
}

function isFailureStatus(transactionStatus) {
  const normalized = (transactionStatus || '').toLowerCase();
  return normalized === 'cancel' || normalized === 'deny' || normalized === 'expire' || normalized === 'failure';
}

module.exports = {
  getSnapClient,
  getMidtransClientKey,
  verifyMidtransSignature,
  mapTransactionStatus,
  isSuccessStatus,
  isFailureStatus,
  isProduction
};
