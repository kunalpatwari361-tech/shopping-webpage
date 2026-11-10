'use strict';

/** An error that is safe to show to the shopper (4xx). */
class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.expose = true;
    if (fields) this.fields = fields;
  }
}

const badRequest = (msg, fields) => new HttpError(400, msg, fields);
const notFound = (msg = 'Not found') => new HttpError(404, msg);

module.exports = { HttpError, badRequest, notFound };
