/* Checks for what shoppers type in. Same rules as the checkout form. */
'use strict';
const { badRequest } = require('./errors');

const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/**
 * needs: { address: bool, email: bool }
 * Returns a clean customer object or throws a 400 with per-field messages.
 */
function customer(raw, needs) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const c = {
    name: str(r.name, 80),
    phone: str(r.phone, 20).replace(/\D/g, ''),
    email: str(r.email, 120).toLowerCase()
  };
  const errs = {};
  if (c.name.length < 2) errs.name = 'Enter your full name.';
  if (!/^[6-9]\d{9}$/.test(c.phone)) errs.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (needs.email ? !EMAIL_RE.test(c.email) : c.email && !EMAIL_RE.test(c.email)) {
    errs.email = needs.email ? 'Enter your email so we can help with your map download.' : 'Enter a valid email or leave it blank.';
  }
  if (needs.address) {
    Object.assign(c, {
      line1: str(r.line1, 160), line2: str(r.line2, 160), city: str(r.city, 60), state: str(r.state, 60), pincode: str(r.pincode, 6)
    });
    if (c.line1.length < 5) errs.line1 = 'Enter your house number and street.';
    if (c.city.length < 2) errs.city = 'Enter your city.';
    if (!STATES.includes(c.state)) errs.state = 'Choose your state.';
    if (!/^[1-9]\d{5}$/.test(c.pincode)) errs.pincode = 'Enter a valid 6-digit PIN code.';
  }
  if (Object.keys(errs).length) throw badRequest('Please check your details.', errs);
  return c;
}

/** UPI reference (UTR) is 12 digits; bank references are 10 to 22 letters/digits. */
function paymentReference(method, raw) {
  const ref = str(raw, 40).replace(/\s/g, '').toUpperCase();
  if (method === 'bank') {
    if (!/^[A-Z0-9]{10,22}$/.test(ref)) throw badRequest('Enter the 10 to 22 character reference from your bank.', { reference: 'Invalid reference' });
  } else if (!/^\d{12}$/.test(ref)) {
    throw badRequest('The UPI reference is 12 digits. Find it in your payment history.', { reference: 'Invalid reference' });
  }
  return ref;
}

const METHODS = ['phonepe', 'gpay', 'paytm', 'card', 'bank'];
function method(raw) {
  if (!METHODS.includes(raw)) throw badRequest('Choose a payment method.');
  return raw;
}

module.exports = { customer, paymentReference, method, METHODS, STATES, EMAIL_RE };
