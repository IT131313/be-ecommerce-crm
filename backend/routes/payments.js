const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const {
  getSnapClient,
  getMidtransClientKey,
  verifyMidtransSignature,
  mapTransactionStatus,
  isSuccessStatus,
  isFailureStatus,
  isProduction
} = require('../config/midtrans');

const PAYMENT_PURPOSES = {
  ORDER: 'order_payment',
  CONSULTATION_FINAL: 'consultation_final',
  CONSULTATION_CANCELLATION: 'consultation_cancellation',
  CONSULTATION_DP: 'consultation_dp'
};

const SNAP_REUSABLE_STATUSES = new Set(['token', 'pending', 'challenge']);
const SNAP_REUSE_MAX_AGE_MINUTES = 15;
const MAX_ORDER_CODE_LENGTH = 50;

function buildOrderCode(prefix, referenceId) {
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  let code = `${prefix}-${referenceId}-${Date.now()}-${randomSuffix}`;
  if (code.length > MAX_ORDER_CODE_LENGTH) {
    code = code.substring(0, MAX_ORDER_CODE_LENGTH);
  }
  return code;
}

function toIntegerAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const error = new Error('Invalid amount for Midtrans transaction');
    error.status = 400;
    throw error;
  }
  return Math.round(numeric);
}

function truncateText(value, maxLength = 50) {
  if (!value) {
    return value;
  }
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength - 3)}...`;
}

async function findReusableSnap(referenceType, referenceId, purpose) {
  const reusableStatuses = Array.from(SNAP_REUSABLE_STATUSES);
  return db.get(
    `SELECT order_code, snap_token, redirect_url
     FROM payment_transactions
     WHERE reference_type = ? AND reference_id = ? AND purpose = ?
       AND transaction_status IN (${reusableStatuses.map(() => '?').join(', ')})
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
     ORDER BY created_at DESC
     LIMIT 1`,
    [referenceType, referenceId, purpose, ...reusableStatuses, SNAP_REUSE_MAX_AGE_MINUTES]
  );
}

async function persistPaymentToken({
  referenceType,
  referenceId,
  purpose,
  orderCode,
  userId,
  grossAmount,
  snapResponse,
  requestPayload
}) {
  const serializedPayload = JSON.stringify({
    request: requestPayload,
    response: snapResponse
  });

  await db.run(
    `INSERT INTO payment_transactions
       (reference_type, reference_id, purpose, order_code, user_id, gross_amount, currency, snap_token, redirect_url, transaction_status, payment_response)
     VALUES (?, ?, ?, ?, ?, ?, 'IDR', ?, ?, 'token', ?)
     ON DUPLICATE KEY UPDATE
       snap_token = VALUES(snap_token),
       redirect_url = VALUES(redirect_url),
       gross_amount = VALUES(gross_amount),
       payment_response = VALUES(payment_response),
       updated_at = CURRENT_TIMESTAMP`,
    [
      referenceType,
      referenceId,
      purpose,
      orderCode,
      userId || null,
      grossAmount,
      snapResponse.token,
      snapResponse.redirect_url,
      serializedPayload
    ]
  );
}

async function getTotalDpPaid(consultationId) {
  if (!consultationId) {
    return 0;
  }
  const row = await db.get(
    `SELECT COALESCE(SUM(gross_amount), 0) AS total_dp
     FROM payment_transactions
     WHERE reference_type = 'consultation'
       AND reference_id = ?
       AND purpose = ?
       AND transaction_status = 'settlement'`,
    [consultationId, PAYMENT_PURPOSES.CONSULTATION_DP]
  );
  return Number(row?.total_dp) || 0;
}

function ensureClientKey() {
  const clientKey = getMidtransClientKey();
  if (!clientKey) {
    const error = new Error('Midtrans client key is not configured');
    error.status = 500;
    throw error;
  }
  return clientKey;
}

router.get('/config', authMiddleware, (req, res) => {
  try {
    const clientKey = ensureClientKey();
    res.json({
      clientKey,
      isProduction
    });
  } catch (error) {
    console.error('Failed to load Midtrans config:', error);
    res.status(error.status || 500).json({ error: error.message || 'Midtrans configuration error' });
  }
});

router.post('/orders/:orderId/snap', authMiddleware, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const forceNew = req.query.forceNew === 'true' || req.body?.forceNew === true;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  try {
    const order = await db.get(
      `SELECT 
        o.id,
        o.user_id,
        o.total_amount,
        o.shipping_cost,
        o.shipping_address,
        o.contact_phone,
        o.shipping_method,
        o.status,
        u.username,
        u.email,
        u.phone AS user_phone,
        u.address AS user_address
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.id = ?`,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!req.user?.isAdmin && order.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (['cancelled', 'completed'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot create payment for order with status ${order.status}` });
    }

    if (Number(order.total_amount) <= 0) {
      return res.status(400).json({ error: 'Order amount is invalid' });
    }

    const reusable = forceNew ? null : await findReusableSnap('order', orderId, PAYMENT_PURPOSES.ORDER);
    if (reusable) {
      return res.json({
        reused: true,
        orderCode: reusable.order_code,
        snapToken: reusable.snap_token,
        redirectUrl: reusable.redirect_url,
        clientKey: ensureClientKey(),
        isProduction
      });
    }

    const orderItems = await db.all(
      `SELECT 
        oi.product_id,
        oi.quantity,
        oi.price_at_time,
        p.name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?`,
      [orderId]
    );

    if (orderItems.length === 0) {
      return res.status(400).json({ error: 'Order has no items to charge' });
    }

    const transactionDetails = {
      order_id: buildOrderCode('ORD', order.id),
      gross_amount: toIntegerAmount(order.total_amount)
    };

    const itemDetails = orderItems.map((item) => ({
      id: `ORD-${item.product_id}`,
      name: truncateText(item.name || `Produk ${item.product_id}`),
      price: toIntegerAmount(item.price_at_time),
      quantity: Number(item.quantity) || 1,
      category: 'Product'
    }));

    if (Number(order.shipping_cost) > 0) {
      itemDetails.push({
        id: 'SHIPPING',
        name: truncateText(`Ongkir ${order.shipping_method || ''}`.trim() || 'Ongkir'),
        price: toIntegerAmount(order.shipping_cost),
        quantity: 1,
        category: 'Shipping'
      });
    }

    const customerDetails = {
      first_name: order.username || 'Customer',
      email: order.email,
      phone: order.contact_phone || order.user_phone || undefined,
      shipping_address: {
        first_name: order.username || 'Customer',
        phone: order.contact_phone || order.user_phone || undefined,
        address: order.shipping_address || order.user_address || undefined
      }
    };

    const payload = {
      transaction_details: transactionDetails,
      item_details: itemDetails,
      customer_details: customerDetails,
      credit_card: { secure: true }
    };

    const snapClient = getSnapClient();
    const snapResponse = await snapClient.createTransaction(payload);

    await persistPaymentToken({
      referenceType: 'order',
      referenceId: order.id,
      purpose: PAYMENT_PURPOSES.ORDER,
      orderCode: transactionDetails.order_id,
      userId: order.user_id,
      grossAmount: transactionDetails.gross_amount,
      snapResponse,
      requestPayload: payload
    });

    res.json({
      orderCode: transactionDetails.order_id,
      snapToken: snapResponse.token,
      redirectUrl: snapResponse.redirect_url,
      clientKey: ensureClientKey(),
      isProduction
    });
  } catch (error) {
    console.error('Failed to create Snap token for order:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to create Snap token' });
  }
});

router.post('/consultations/:consultationId/snap', authMiddleware, async (req, res) => {
  const consultationId = Number(req.params.consultationId);
  const requestedType = typeof req.body?.paymentType === 'string'
    ? req.body.paymentType.toLowerCase()
    : 'final';
  const forceNew = req.query.forceNew === 'true' || req.body?.forceNew === true;

  if (!Number.isInteger(consultationId) || consultationId <= 0) {
    return res.status(400).json({ error: 'Invalid consultation ID' });
  }

  if (!['final', 'cancellation', 'dp'].includes(requestedType)) {
    return res.status(400).json({ error: 'paymentType must be either "dp", "final" or "cancellation"' });
  }

  try {
    const consultation = await db.get(
      `SELECT 
        c.id,
        c.user_id,
        c.status,
        c.payment_status,
        c.cancellation_fee_amount,
        c.cancellation_fee_percent,
        u.username,
        u.email,
        u.phone,
        u.address
      FROM consultations c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ?`,
      [consultationId]
    );

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    if (!req.user?.isAdmin && consultation.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const contract = await db.get(
      `SELECT id, project_cost
       FROM consultation_contracts
       WHERE consultation_id = ?
       ORDER BY uploaded_at DESC, id DESC
       LIMIT 1`,
      [consultationId]
    );

    let grossAmount;
    let purpose;
    let itemLabel;

    if (requestedType === 'cancellation') {
      if (consultation.payment_status !== 'awaiting_cancellation_fee') {
        return res.status(400).json({ error: 'Consultation is not awaiting cancellation fee' });
      }
      const cancellationFeePercent = Number(consultation.cancellation_fee_percent) || 0;
      const contractCost = Number(contract?.project_cost) || 0;
      const fallbackAmount = cancellationFeePercent > 0 && contractCost > 0
        ? (contractCost * cancellationFeePercent) / 100
        : 0;
      const feeAmount = Number(consultation.cancellation_fee_amount) || fallbackAmount;
      if (feeAmount <= 0) {
        return res.status(400).json({ error: 'Cancellation fee amount is not available' });
      }

      grossAmount = toIntegerAmount(feeAmount);
      purpose = PAYMENT_PURPOSES.CONSULTATION_CANCELLATION;
      itemLabel = `Penalti Konsultasi #${consultation.id}`;
    } else if (requestedType === 'dp') {
      if (!contract || Number(contract.project_cost) <= 0) {
        return res.status(400).json({ error: 'Consultation contract cost is not set' });
      }
      if (consultation.payment_status === 'paid') {
        return res.status(400).json({ error: 'Consultation is already fully paid' });
      }
      if (consultation.payment_status === 'dp_paid') {
        return res.status(400).json({ error: 'DP has already been paid' });
      }
      const dpPercent = Number(consultation.cancellation_fee_percent) || 10; // gunakan default 10% sebagai DP
      const dpAmount = Number(((Number(contract.project_cost) || 0) * dpPercent / 100).toFixed(2));
      if (dpAmount <= 0) {
        return res.status(400).json({ error: 'DP amount is not available' });
      }
      grossAmount = toIntegerAmount(dpAmount);
      purpose = PAYMENT_PURPOSES.CONSULTATION_DP;
      itemLabel = `DP Konsultasi #${consultation.id}`;
    } else {
      if (!contract || Number(contract.project_cost) <= 0) {
        return res.status(400).json({ error: 'Consultation contract cost is not set' });
      }
      if (consultation.payment_status === 'paid') {
        return res.status(400).json({ error: 'Consultation is already paid' });
      }
      const allowedStatuses = new Set(['awaiting_final_payment', 'awaiting_payment', 'overdue']);
      if (!allowedStatuses.has(consultation.payment_status)) {
        return res.status(400).json({ error: 'Consultation is not ready for final payment' });
      }
      const dpPaidTotal = await getTotalDpPaid(consultation.id);
      const remaining = Math.max(0, Number(contract.project_cost) - dpPaidTotal);
      if (remaining <= 0) {
        return res.status(400).json({ error: 'No remaining balance to pay' });
      }
      grossAmount = toIntegerAmount(remaining);
      purpose = PAYMENT_PURPOSES.CONSULTATION_FINAL;
      itemLabel = `Pelunasan Konsultasi #${consultation.id}`;
    }

    const reusable = forceNew ? null : await findReusableSnap('consultation', consultationId, purpose);
    if (reusable) {
      return res.json({
        reused: true,
        orderCode: reusable.order_code,
        snapToken: reusable.snap_token,
        redirectUrl: reusable.redirect_url,
        clientKey: ensureClientKey(),
        isProduction
      });
    }

    const transactionDetails = {
      order_id: buildOrderCode('CONS', consultation.id),
      gross_amount: grossAmount
    };

    const payload = {
      transaction_details: transactionDetails,
      item_details: [
        {
          id: `${purpose}-${consultation.id}`,
          name: truncateText(itemLabel, 50),
          price: grossAmount,
          quantity: 1,
          category: requestedType === 'cancellation'
            ? 'Cancellation Fee'
            : (requestedType === 'dp' ? 'Down Payment' : 'Consultation')
        }
      ],
      customer_details: {
        first_name: consultation.username || 'Customer',
        email: consultation.email,
        phone: consultation.phone || undefined,
        billing_address: {
          first_name: consultation.username || 'Customer',
          phone: consultation.phone || undefined,
          address: consultation.address || undefined
        }
      }
    };

    const snapClient = getSnapClient();
    const snapResponse = await snapClient.createTransaction(payload);

    await persistPaymentToken({
      referenceType: 'consultation',
      referenceId: consultation.id,
      purpose,
      orderCode: transactionDetails.order_id,
      userId: consultation.user_id,
      grossAmount,
      snapResponse,
      requestPayload: payload
    });

    res.json({
      orderCode: transactionDetails.order_id,
      snapToken: snapResponse.token,
      redirectUrl: snapResponse.redirect_url,
      clientKey: ensureClientKey(),
      isProduction
    });
  } catch (error) {
    console.error('Failed to create Snap token for consultation:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to create Snap token' });
  }
});

async function applyOrderStatusFromPayment(orderId, transactionStatus, fraudStatus) {
  if (isSuccessStatus(transactionStatus, fraudStatus)) {
    await db.run(
      `UPDATE orders
       SET status = CASE
         WHEN status IN ('pending', 'processing') THEN 'confirmed'
         ELSE status
       END
       WHERE id = ?`,
      [orderId]
    );
  } else if (isFailureStatus(transactionStatus)) {
    await db.run(
      `UPDATE orders
       SET status = CASE
         WHEN status NOT IN ('shipped', 'completed') THEN 'cancelled'
         ELSE status
       END
       WHERE id = ?`,
      [orderId]
    );
  }
}

async function applyConsultationStatusFromPayment(consultationId, purpose, transactionStatus, fraudStatus) {
  if (!isSuccessStatus(transactionStatus, fraudStatus)) {
    return;
  }

  if (purpose === PAYMENT_PURPOSES.CONSULTATION_FINAL) {
    await db.run(
      `UPDATE consultations
       SET 
         payment_status = 'paid',
         final_delivery_status = CASE
           WHEN final_delivery_status = 'withheld' THEN 'delivered'
           ELSE final_delivery_status
         END,
         status = CASE
           WHEN status IN ('cancelled', 'finalized') THEN status
           ELSE 'finalized'
         END
       WHERE id = ?`,
      [consultationId]
    );
  } else if (purpose === PAYMENT_PURPOSES.CONSULTATION_DP) {
    await db.run(
      `UPDATE consultations
       SET payment_status = 'not_ready_final'
       WHERE id = ?`,
      [consultationId]
    );
  } else if (purpose === PAYMENT_PURPOSES.CONSULTATION_CANCELLATION) {
    await db.run(
      `UPDATE consultations
       SET payment_status = 'cancellation_fee_recorded'
       WHERE id = ?`,
      [consultationId]
    );
  }
}

router.post('/webhook', async (req, res) => {
  const payload = req.body || {};
  if (!verifyMidtransSignature(payload)) {
    console.error('Invalid Midtrans signature for payload:', payload.order_id);
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    const payment = await db.get(
      `SELECT 
        id,
        reference_type,
        reference_id,
        purpose
      FROM payment_transactions
      WHERE order_code = ?`,
      [payload.order_id]
    );

    if (!payment) {
      console.warn('Received Midtrans notification for unknown order code:', payload.order_id);
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const normalizedStatus = mapTransactionStatus(payload.transaction_status, payload.fraud_status);

    await db.run(
      `UPDATE payment_transactions
       SET 
         transaction_status = ?,
         payment_type = ?,
         fraud_status = ?,
         settlement_time = ?,
         midtrans_transaction_id = ?,
         payment_response = ?
       WHERE order_code = ?`,
      [
        normalizedStatus,
        payload.payment_type || null,
        payload.fraud_status || null,
        payload.settlement_time || null,
        payload.transaction_id || null,
        JSON.stringify(payload),
        payload.order_id
      ]
    );

    if (payment.reference_type === 'order') {
      await applyOrderStatusFromPayment(payment.reference_id, payload.transaction_status, payload.fraud_status);
    } else if (payment.reference_type === 'consultation') {
      await applyConsultationStatusFromPayment(
        payment.reference_id,
        payment.purpose,
        payload.transaction_status,
        payload.fraud_status
      );
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Failed to process Midtrans webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;
