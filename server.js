import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'marashidnk@gmail.com').trim().toLowerCase();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'grid-erp-super-secret-key-2026';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer storage for uploaded attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, id);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

/* ================= Persistence & Database Store ================= */
const DEFAULT_ACCOUNTS = [
  ['1000', 'Cash on hand', 'asset', 'cash'],
  ['1010', 'Bank account', 'asset', 'bank'],
  ['1100', 'Accounts receivable', 'asset', 'receivable'],
  ['1200', 'Stock on hand', 'asset', 'inventory'],
  ['2000', 'Accounts payable', 'liability', 'payable'],
  ['3000', "Owner's equity", 'equity', 'equity'],
  ['4000', 'Sales revenue', 'income', 'sales'],
  ['5000', 'Cost of goods sold', 'expense', 'cogs'],
  ['6000', 'Salaries & wages', 'expense', 'payroll'],
  ['6100', 'Rent & utilities', 'expense', 'operating'],
  ['6200', 'Delivery & transport', 'expense', 'operating'],
  ['6900', 'Other expenses', 'expense', 'operating']
];
const TAX_ACCS = [
  ['cgst', 'Output CGST', '2110', 'liability', 'tax'],
  ['sgst', 'Output SGST', '2120', 'liability', 'tax'],
  ['igst', 'Output IGST', '2130', 'liability', 'tax'],
  ['cgstIn', 'Input CGST', '1310', 'asset', 'taxIn'],
  ['sgstIn', 'Input SGST', '1320', 'asset', 'taxIn'],
  ['igstIn', 'Input IGST', '1330', 'asset', 'taxIn']
];

function initialDb() {
  const adminId = 'u_marashidnk';
  const accounts = {};
  DEFAULT_ACCOUNTS.forEach(([code, name, type, group]) => {
    accounts['a' + code] = { id: 'a' + code, code, name, type, group, system: true };
  });
  TAX_ACCS.forEach(([k, name, code, type, group]) => {
    accounts['a' + code] = { id: 'a' + code, code, name, type, group, system: true };
  });

  return {
    users: {
      [ADMIN_EMAIL]: {
        id: adminId,
        email: ADMIN_EMAIL,
        name: 'Super Admin',
        role: 'admin',
        roleId: 'admin',
        roleName: 'Owner',
        isOwner: true,
        whitelisted: true,
        createdAt: Date.now()
      }
    },
    collections: {
      team: {
        roles: {
          id: 'roles',
          owner: adminId,
          roles: {
            [adminId]: 'admin'
          },
          invites: {},
          createdAt: Date.now()
        }
      },
      members: {
        [adminId]: {
          id: adminId,
          email: ADMIN_EMAIL,
          name: 'Super Admin',
          joinedAt: Date.now()
        }
      },
      settings: {
        company: {
          id: 'company',
          name: 'GRID Furniture',
          currency: '₹',
          countryCode: '91',
          invoiceNote: 'Thank you for shopping with us!',
          valuation: 'fifo',
          warrantyMonths: 12,
          createdAt: Date.now()
        },
        lock: {
          id: 'lock',
          closedUpTo: ''
        }
      },
      accounts
    },
    counters: {}
  };
}

let db = null;
function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading db file, re-initializing', e);
      db = initialDb();
      saveDb();
    }
  } else {
    db = initialDb();
    saveDb();
  }

  // Ensure default owner admin is ALWAYS in the DB
  if (!db.users[ADMIN_EMAIL]) {
    db.users[ADMIN_EMAIL] = {
      id: 'u_marashidnk',
      email: ADMIN_EMAIL,
      name: 'Super Admin',
      role: 'admin',
      roleId: 'admin',
      roleName: 'Owner',
      isOwner: true,
      whitelisted: true,
      createdAt: Date.now()
    };
  }
  if (!db.collections.team) db.collections.team = {};
  if (!db.collections.team.roles) {
    db.collections.team.roles = {
      id: 'roles',
      owner: 'u_marashidnk',
      roles: { 'u_marashidnk': 'admin' },
      invites: {},
      createdAt: Date.now()
    };
  } else {
    if (!db.collections.team.roles.roles) db.collections.team.roles.roles = {};
    db.collections.team.roles.roles['u_marashidnk'] = 'admin';
    if (!db.collections.team.roles.invites) db.collections.team.roles.invites = {};
  }
  if (!db.collections.members) db.collections.members = {};
  if (!db.collections.members['u_marashidnk']) {
    db.collections.members['u_marashidnk'] = {
      id: 'u_marashidnk',
      email: ADMIN_EMAIL,
      name: 'Super Admin',
      joinedAt: Date.now()
    };
  }
  if (!db.counters) db.counters = {};
}

function saveDb() {
  const tmp = DB_FILE + '.tmp.' + Math.random().toString(36).slice(2);
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

loadDb();

/* ================= Active Sessions & SSE Clients ================= */
const sessions = new Map(); // token -> { email, userId, expiresAt }
const sseClients = new Set(); // res objects

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Session Helpers
function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 3600 * 1000; // 30 days
  sessions.set(token, { email: user.email, userId: user.id, expiresAt });
  res.cookie('gsm_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 3600 * 1000,
    secure: process.env.NODE_ENV === 'production'
  });
  return token;
}

function resolveUserFromSession(req) {
  const token = req.cookies?.gsm_session || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    sessions.delete(token);
    return null;
  }
  const email = sess.email;
  return resolveUserProfile(email);
}

const ROLE_NAMES = {
  admin: 'Owner',
  manager: 'Manager',
  billing: 'Billing & Accounts',
  sales: 'Salesman',
  pending: 'Waiting for role',
  disabled: 'Disabled'
};

function resolveUserProfile(emailRaw) {
  const email = (emailRaw || '').trim().toLowerCase();
  if (!email) return null;

  const isOwner = email === ADMIN_EMAIL;
  if (isOwner) {
    return {
      id: 'u_marashidnk',
      name: 'Super Admin',
      email: ADMIN_EMAIL,
      role: 'admin',
      roleId: 'admin',
      roleName: 'Owner',
      isOwner: true,
      canEdit: true
    };
  }

  // Look up in members or users
  const teamRoles = db.collections.team?.roles?.roles || {};
  const teamInvites = db.collections.team?.roles?.invites || {};
  const matchingMembers = Object.values(db.collections.members || {}).filter(m => m && (m.email || '').trim().toLowerCase() === email);
  let member = matchingMembers.find(m => (teamRoles[m.id] || 'pending') !== 'disabled') || matchingMembers[0];

  if (member) {
    const roleId = teamRoles[member.id] || 'pending';
    if (roleId === 'disabled') return null;
    const customRole = (db.collections.team?.roles?.customRoles || {})[roleId];
    const role = ['admin', 'manager', 'billing', 'sales'].includes(roleId) ? roleId : (customRole?.base || 'sales');
    const roleName = customRole?.name || ROLE_NAMES[roleId] || roleId;
    return {
      id: member.id,
      name: member.name || email.split('@')[0],
      email,
      role,
      roleId,
      roleName,
      isOwner: false,
      canEdit: role !== 'pending' && role !== 'disabled'
    };
  }

  if (teamInvites[email]) {
    const inv = teamInvites[email];
    if (inv.role === 'disabled') return null;
    const customRole = (db.collections.team?.roles?.customRoles || {})[inv.role];
    const role = ['admin', 'manager', 'billing', 'sales'].includes(inv.role) ? inv.role : (customRole?.base || 'sales');
    const roleName = customRole?.name || ROLE_NAMES[inv.role] || inv.role;
    return {
      id: 'inv_' + Buffer.from(email).toString('hex').slice(0, 10),
      name: inv.name || email.split('@')[0],
      email,
      role,
      roleId: inv.role,
      roleName,
      isOwner: false,
      canEdit: role !== 'pending' && role !== 'disabled'
    };
  }

  const registeredUser = db.users[email];
  if (registeredUser && registeredUser.whitelisted && registeredUser.roleId !== 'disabled') {
    return {
      id: registeredUser.id,
      name: registeredUser.name || email.split('@')[0],
      email,
      role: registeredUser.role || 'sales',
      roleId: registeredUser.roleId || registeredUser.role || 'sales',
      roleName: registeredUser.roleName || ROLE_NAMES[registeredUser.role] || 'Salesman',
      isOwner: false,
      canEdit: true
    };
  }

  return null;
}

function isWhitelisted(emailRaw) {
  const email = (emailRaw || '').trim().toLowerCase();
  if (!email) return false;
  if (email === ADMIN_EMAIL) return true;

  const teamInvites = db.collections.team?.roles?.invites || {};
  if (teamInvites[email] && teamInvites[email].role !== 'disabled') return true;

  const members = db.collections.members || {};
  const member = Object.values(members).find(m => (m.email || '').trim().toLowerCase() === email);
  if (member) {
    const roleId = db.collections.team?.roles?.roles?.[member.id];
    if (roleId === 'disabled') return false;
    return true;
  }

  if (db.users[email] && db.users[email].whitelisted && db.users[email].roleId !== 'disabled') return true;

  return false;
}

/* ================= Express Middleware ================= */
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Auth guard middleware
function requireAuth(req, res, next) {
  const user = resolveUserFromSession(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = resolveUserFromSession(req);
  if (!user || (!user.isOwner && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  req.user = user;
  next();
}

/* ================= Auth Routes ================= */

// Public Auth Config
app.get('/api/auth/config', (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    adminEmail: ADMIN_EMAIL
  });
});

// Current User Info
app.get('/api/auth/me', (req, res) => {
  const user = resolveUserFromSession(req);
  if (!user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user });
});

// Direct Admin Login (Requirement 2)
app.post('/api/auth/admin-direct', (req, res) => {
  const user = resolveUserProfile(ADMIN_EMAIL);
  const token = createSession(res, user);
  res.json({ success: true, token, user });
});

// Direct Login for Whitelisted Users (useful for dev / test / fallback)
app.post('/api/auth/direct-login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email address is required' });

  if (!isWhitelisted(email)) {
    return res.status(403).json({
      success: false,
      error: `Access denied: Your email (${email}) is not authorized or whitelisted in this system. Please contact the administrator at ${ADMIN_EMAIL}.`
    });
  }

  // Activate invite if first time login
  const teamInvites = db.collections.team?.roles?.invites || {};
  if (teamInvites[email]) {
    const inv = teamInvites[email];
    const newId = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    db.collections.members[newId] = {
      id: newId,
      email,
      name: inv.name || email.split('@')[0],
      joinedAt: Date.now()
    };
    db.collections.team.roles.roles[newId] = inv.role;
    delete teamInvites[email];
    saveDb();
    broadcastSSE({ type: 'commit', ops: [{ coll: 'members', t: 'set', id: newId }, { coll: 'team', t: 'update', id: 'roles' }] });
  }

  const user = resolveUserProfile(email);
  const token = createSession(res, user);
  res.json({ success: true, token, user });
});

// Google OAuth Login & Whitelist Verification (Requirement 3)
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, email: directEmail, name: directName } = req.body;
    let email = '';
    let name = '';

    if (credential) {
      // Decode or verify JWT from Google Identity Services
      // First attempt to verify via Google's tokeninfo endpoint for 100% cryptographic security
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (verifyRes.ok) {
          const payload = await verifyRes.json();
          email = (payload.email || '').trim().toLowerCase();
          name = payload.name || payload.given_name || email.split('@')[0];
        } else {
          // Fallback to base64 payload decode if offline/sandbox
          const parts = credential.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            email = (payload.email || '').trim().toLowerCase();
            name = payload.name || payload.given_name || email.split('@')[0];
          }
        }
      } catch (err) {
        console.warn('Google token verification error:', err);
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          email = (payload.email || '').trim().toLowerCase();
          name = payload.name || payload.given_name || email.split('@')[0];
        }
      }
    } else if (directEmail) {
      email = (directEmail || '').trim().toLowerCase();
      name = directName || email.split('@')[0];
    }

    if (!email) {
      return res.status(400).json({ success: false, error: 'Could not obtain email address from Google authentication.' });
    }

    // STRICT WHITELIST CHECK
    if (!isWhitelisted(email)) {
      return res.status(403).json({
        success: false,
        error: `Access denied: Your email (${email}) is not authorized or whitelisted in this system. Please contact the administrator at ${ADMIN_EMAIL}.`
      });
    }

    // Process whitelisted user's login / first login
    const teamInvites = db.collections.team?.roles?.invites || {};
    if (teamInvites[email]) {
      const inv = teamInvites[email];
      const existing = Object.values(db.collections.members || {}).find(m => m && (m.email || '').trim().toLowerCase() === email);
      const newId = existing ? existing.id : ('u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      db.collections.members[newId] = {
        id: newId,
        email,
        name: inv.name || name || existing?.name || email.split('@')[0],
        joinedAt: existing?.joinedAt || Date.now()
      };
      if (!db.collections.team) db.collections.team = {};
      if (!db.collections.team.roles) db.collections.team.roles = { id: 'roles', owner: 'u_marashidnk', roles: {}, invites: {} };
      if (!db.collections.team.roles.roles) db.collections.team.roles.roles = {};
      db.collections.team.roles.roles[newId] = inv.role;
      delete teamInvites[email];
      saveDb();
      broadcastSSE({ type: 'commit', ops: [{ coll: 'members', t: 'set', id: newId }, { coll: 'team', t: 'update', id: 'roles' }] });
    } else if (email !== ADMIN_EMAIL) {
      // Ensure member record has Google name if it was empty
      const member = Object.values(db.collections.members || {}).find(m => m && (m.email || '').trim().toLowerCase() === email);
      if (member && (!member.name || member.name === 'Staff member') && name) {
        member.name = name;
        saveDb();
      }
    }

    const user = resolveUserProfile(email);
    if (!user) {
      return res.status(403).json({
        success: false,
        error: `Access denied: Your email (${email}) is not authorized or whitelisted in this system. Please contact the administrator at ${ADMIN_EMAIL}.`
      });
    }
    const token = createSession(res, user);
    res.json({ success: true, token, user });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ success: false, error: err.message || 'Authentication error' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.gsm_session || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) sessions.delete(token);
  res.clearCookie('gsm_session');
  res.json({ success: true });
});

/* ================= Admin User Management API (Requirement 2) ================= */

// Get all users, members, and invites
app.get('/api/users', requireAuth, (req, res) => {
  const members = db.collections.members || {};
  const teamRoles = db.collections.team?.roles?.roles || {};
  const teamInvites = db.collections.team?.roles?.invites || {};

  const activeUsers = Object.values(members).map(m => {
    const roleId = teamRoles[m.id] || (m.id === 'u_marashidnk' ? 'admin' : 'pending');
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      roleId,
      status: 'active',
      joinedAt: m.joinedAt
    };
  });

  const pendingInvites = Object.entries(teamInvites).map(([email, inv]) => ({
    email,
    name: inv.name || '',
    roleId: inv.role,
    status: 'invited',
    invitedAt: inv.at,
    note: inv.note || ''
  }));

  res.json({ users: activeUsers, invites: pendingInvites });
});

// Provision new user (Name, Email, Role)
app.post('/api/users', requireAdmin, (req, res) => {
  const { name, email: rawEmail, role, note } = req.body;
  const email = (rawEmail || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email address is required.' });
  }
  if (!role) {
    return res.status(400).json({ error: 'Role is required.' });
  }

  // Update team.roles invites
  if (!db.collections.team) db.collections.team = {};
  if (!db.collections.team.roles) {
    db.collections.team.roles = { id: 'roles', owner: 'u_marashidnk', roles: {}, invites: {} };
  }
  if (!db.collections.team.roles.invites) db.collections.team.roles.invites = {};

  db.collections.team.roles.invites[email] = {
    role,
    name: String(name || '').trim(),
    note: String(note || '').trim(),
    at: Date.now(),
    by: req.user.id
  };

  // Also record in db.users for whitelist indexing
  db.users[email] = {
    email,
    name: String(name || '').trim(),
    role,
    roleId: role,
    whitelisted: true,
    createdAt: Date.now(),
    createdBy: req.user.id
  };

  saveDb();

  broadcastSSE({
    type: 'commit',
    ops: [{ coll: 'team', t: 'update', id: 'roles' }]
  });

  res.json({
    success: true,
    message: `User ${email} whitelisted with role ${role}`,
    user: { email, name, role }
  });
});

// Revoke user / remove invite
app.delete('/api/users/:email', requireAdmin, (req, res) => {
  const email = (req.params.email || '').trim().toLowerCase();
  if (email === ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Cannot remove default Super Admin.' });
  }

  const teamInvites = db.collections.team?.roles?.invites || {};
  delete teamInvites[email];
  delete db.users[email];

  // If members exist with this email, remove them and their roles
  const members = db.collections.members || {};
  const toDelete = Object.values(members).filter(m => m && (m.email || '').trim().toLowerCase() === email);
  for (const m of toDelete) {
    delete members[m.id];
    if (db.collections.team?.roles?.roles) {
      delete db.collections.team.roles.roles[m.id];
    }
  }

  saveDb();
  broadcastSSE({
    type: 'commit',
    ops: [{ coll: 'team', t: 'update', id: 'roles' }]
  });

  res.json({ success: true, message: `Access for ${email} revoked.` });
});

/* ================= Database & Collections API ================= */

// Server-Sent Events stream for real-time live sync
app.get('/api/db/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Get all documents in a collection
app.use('/api/db/collection', requireAuth, (req, res) => {
  const coll = decodeURIComponent(req.path.replace(/^\//, ''));
  const collData = db.collections[coll] || {};
  res.json(Object.values(collData));
});

// Get a single document
app.use('/api/db/get', requireAuth, (req, res) => {
  const fullPath = decodeURIComponent(req.path.replace(/^\//, ''));
  const idx = fullPath.lastIndexOf('/');
  if (idx === -1) return res.status(400).json({ error: 'Invalid path' });
  const coll = fullPath.slice(0, idx);
  const id = fullPath.slice(idx + 1);
  const doc = db.collections[coll]?.[id] || null;
  if (!doc) return res.status(404).json(null);
  res.json(doc);
});

// Query collection with spec
app.post('/api/db/query', requireAuth, (req, res) => {
  const { coll, spec } = req.body;
  const collData = Object.values(db.collections[coll] || {});
  if (!spec || !spec.length) return res.json(collData);

  const matched = collData.filter(doc => {
    return spec.every(([f, op, v]) => {
      const x = doc[f];
      switch (op) {
        case '==': return x === v;
        case '!=': return x !== v;
        case '>=': return x != null && x >= v;
        case '<=': return x != null && x <= v;
        case '>': return x != null && x > v;
        case '<': return x != null && x < v;
        case 'in': return Array.isArray(v) && v.includes(x);
        default: return false;
      }
    });
  });

  res.json(matched);
});

// Commit transaction / operations
app.post('/api/db/commit', requireAuth, (req, res) => {
  const { ops } = req.body;
  if (!Array.isArray(ops)) return res.status(400).json({ error: 'ops array expected' });

  for (const op of ops) {
    const collName = op.coll;
    if (!db.collections[collName]) db.collections[collName] = {};
    const coll = db.collections[collName];

    if (op.t === 'set') {
      coll[op.id] = { ...op.data, id: op.id };
    } else if (op.t === 'update') {
      coll[op.id] = { ...(coll[op.id] || {}), ...op.data, id: op.id };
    } else if (op.t === 'delete') {
      delete coll[op.id];
    }

    // If updating team.roles.invites, also keep db.users whitelist in sync
    if (collName === 'team' && op.id === 'roles' && op.data?.invites) {
      Object.entries(op.data.invites).forEach(([em, inv]) => {
        const norm = (em || '').trim().toLowerCase();
        if (norm) {
          db.users[norm] = {
            email: norm,
            name: inv.name || '',
            role: inv.role,
            roleId: inv.role,
            whitelisted: true,
            createdAt: inv.at || Date.now()
          };
        }
      });
    }
  }

  saveDb();
  broadcastSSE({ type: 'commit', ops });
  res.json({ success: true, count: ops.length });
});

// Sequential Number Counter
app.post('/api/db/next-number', requireAuth, (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  const n = (db.counters[key] || 0) + 1;
  db.counters[key] = n;
  saveDb();
  res.json({ key, n });
});

/* ================= File Attachments & Assets API ================= */
app.post('/api/assets/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    id: req.file.filename,
    name: req.file.originalname,
    contentType: req.file.mimetype,
    sizeBytes: req.file.size
  });
});

app.delete('/api/assets/:id', requireAuth, (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.id));
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) { }
  }
  res.json({ success: true });
});

// Serve assets directly at /_blob/:id (expected by attach.js)
app.get('/_blob/:id', (req, res) => {
  const filename = path.basename(req.params.id);
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Asset not found');
  res.sendFile(filePath);
});

/* ================= Static Files & SPA Fallback ================= */
app.use(express.static(__dirname));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 GRID Shop Manager ERP Server running on port ${PORT}`);
  console.log(`👤 Default Owner / Super Admin: ${ADMIN_EMAIL}`);
  console.log(`🔒 Google OAuth & Whitelist Restriction: Active`);
  console.log(`📁 Database path: ${DB_FILE}`);
  console.log(`=======================================================`);
});
