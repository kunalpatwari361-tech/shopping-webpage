/* ============================================================
   Razorpay webhook: POST /api/webhooks/razorpay
   Razorpay calls this when a payment succeeds or fails, so orders
   are confirmed even if the shopper closes the page mid-payment.
   Every call is checked against RAZORPAY_WEBHOOK_SECRET.
   ============================================================ */
'use strict';

function razorpayWebhook({ db, orders, razorpay }) {
  const seen = db.prepare('INSERT OR IGNORE INTO webhook_events (event_id, type, received_at) VALUES (?, ?, ?)');

  return (req, res) => {
    if (!razorpay || !razorpay.webhookEnabled) return res.status(404).json({ error: 'Not found' });
    const raw = req.body;
    if (!Buffer.isBuffer(raw) || !razorpay.webhookSignatureValid(raw, req.get('x-razorpay-signature'))) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    // Razorpay may send the same event more than once.
    const eventId = req.get('x-razorpay-event-id');
    if (eventId && seen.run(String(eventId).slice(0, 100), String(event.event || '').slice(0, 60), new Date().toISOString()).changes === 0) {
      return res.json({ ok: true, duplicate: true });
    }

    const payment = event && event.payload && event.payload.payment && event.payload.payment.entity;
    if (payment && payment.order_id) {
      const row = orders.byGatewayOrder(String(payment.order_id));
      if (row && (event.event === 'payment.captured' || event.event === 'order.paid')) {
        if (payment.status === 'captured' && payment.amount === row.total * 100 && payment.currency === 'INR') {
          orders.markPaid(row.id, { actor: 'razorpay-webhook', paymentId: String(payment.id), detail: `${payment.method || 'payment'} ${payment.id}` });
        } else {
          orders.log(row.id, 'razorpay-webhook', 'amount_mismatch', `${payment.id}: ${payment.amount} ${payment.currency} ${payment.status}`);
        }
      } else if (row && event.event === 'payment.failed') {
        orders.log(row.id, 'razorpay-webhook', 'payment_failed', payment.error_description || payment.error_code || 'failed');
      }
    }
    res.json({ ok: true });
  };
}

module.exports = { razorpayWebhook };
