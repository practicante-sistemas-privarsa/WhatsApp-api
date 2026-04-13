function log({ message_id, phone, timestamp, result, error }) {
  const entry = {
    message_id: message_id || 'N/A',
    phone: phone || 'N/A',
    timestamp: timestamp || new Date().toISOString(),
    result: result || null,
    error: error || null,
  };
  console.log('[LOG]', JSON.stringify(entry));
}

module.exports = { log };
