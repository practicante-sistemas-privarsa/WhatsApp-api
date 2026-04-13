const crypto = require('crypto');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function generateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function toBase64(buffer) {
  return buffer.toString('base64'); // sin prefijos
}

function isAllowedMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

function validateBuffer(buffer, mimeType) {
  if (!buffer || buffer.length === 0) throw new Error('Buffer vacío o inválido');
  if (buffer.length > MAX_FILE_SIZE) throw new Error('Archivo supera 5 MB');
  if (!isAllowedMimeType(mimeType)) throw new Error(`Tipo no permitido: ${mimeType}`);
}

module.exports = { generateHash, toBase64, validateBuffer, isAllowedMimeType };
