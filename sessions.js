// sessions.js
const sessions = new Map();
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutos en ms

function getSession(phone) {
  const session = sessions.get(phone);
  if (!session) return null;

  // Verificar si la sesión expiró
  const now = Date.now();
  if (now - session.lastActivity > SESSION_TIMEOUT) {
    sessions.delete(phone);
    return null;
  }

  return session;
}

function createSession(phone) {
  const session = {
    phone,
    state: 'WAITING_FOLIO',
    folio: null,
    lastActivity: Date.now(),
    imageCount: 0,
  };
  sessions.set(phone, session);
  return session;
}

function updateSession(phone, data) {
  const session = sessions.get(phone);
  if (!session) return null;
  const updated = { ...session, ...data, lastActivity: Date.now() };
  sessions.set(phone, updated);
  return updated;
}

function deleteSession(phone) {
  sessions.delete(phone);
}

module.exports = { getSession, createSession, updateSession, deleteSession };
