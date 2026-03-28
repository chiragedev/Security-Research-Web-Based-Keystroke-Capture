# 🔬 Security-Research: Web-Based Keystroke Capture

> ⚠️ **LEGAL & ETHICAL DISCLAIMER**
>
> This project is for **educational and authorized security research purposes only**. It demonstrates a common web security vulnerability to help developers and security professionals understand and defend against such attacks.
>
> **Unauthorized use of this tool on systems or individuals without explicit written permission is illegal and unethical.** The author assumes no liability for misuse.

---

## 📖 Overview

This project demonstrates a **full-stack web-based keystroke capture** attack and its defenses. It simulates how a malicious script (injected via XSS, compromised dependencies, or social engineering) can silently capture user input from a web page.

### What Makes This Project Different

Unlike basic keyloggers, this project provides:

- 🔴 **Real-time monitoring dashboard** with WebSocket (Socket.IO) streaming
- 🧠 **5 capture vectors**: keystrokes, clipboard, form submissions, click tracking, and session fingerprinting
- 🛡️ **Defense Lab**: Demonstrates how to prevent these attacks using CSP, virtual keyboards, and noise injection
- 🌐 **Network Traffic Analyzer**: Real-time packet-level visualization of exfiltration traffic with decoded payloads
- 📊 **Session management**: Tracks multiple victims simultaneously with device fingerprinting
- 🔄 **Input reconstruction**: Reassembles typed passwords and emails from raw keystrokes

---

## 🏗️ Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│   Target Page    │ ────────────────►  │   Node.js Server │
│  (Victim's View) │   Keystrokes,      │  Express+Socket.IO│
│                  │   Clipboard,       │                  │
│  keylogger.js    │   Form Data,       │  POST /api/log   │
│  (hidden payload)│   Click Events     │                  │
└─────────────────┘                    └────────┬─────────┘
                                                │
                              ┌─────────────────┼──────────────┐
                              │                 │              │
                              ▼                 ▼              ▼
                        ┌──────────┐   ┌──────────────┐  ┌──────────┐
                        │ Dashboard│   │ Log Files    │  │ Defense  │
                        │ (Live    │   │ (keystrokes  │  │ Lab      │
                        │  Monitor)│   │  .log)       │  │          │
                        └──────────┘   └──────────────┘  └──────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v14+)

### Installation

```bash
git clone https://github.com/chiragedev/Security-Research-Web-Based-Keystroke-Capture.git
cd Security-Research-Web-Based-Keystroke-Capture
npm install
```

### Run

```bash
npm start
```

Then open:

| Page | URL | Description |
|------|-----|-------------|
| 🎯 Target Page | `http://localhost:3000/target` | Simulated login page (victim's view) |
| 📊 Dashboard | `http://localhost:3000/dashboard` | Real-time keystroke monitor |
| 🛡️ Defense Lab | `http://localhost:3000/defense` | CSP & anti-keylogger demos |
| 🌐 Traffic Analyzer | `http://localhost:3000/defense/network-analyzer.html` | Live network exfiltration viewer |

---

## 📁 Project Structure

```
├── server.js                    # Express + Socket.IO server
├── package.json
├── .gitignore
│
├── public/
│   ├── target/                  # "Attack" demonstration
│   │   ├── index.html           # Realistic phishing login page
│   │   └── styles.css
│   │
│   ├── payload/
│   │   └── keylogger.js         # Advanced capture payload
│   │
│   ├── dashboard/               # Real-time monitoring UI
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── dashboard.js
│   │
│   └── defense/                 # Defense demonstrations
│       ├── index.html           # Defense lab landing
│       ├── csp-demo.html        # CSP blocking demo
│       ├── anti-keylogger.html  # Client-side defenses
│       └── network-analyzer.html # Network traffic analyzer
│
└── logs/                        # (gitignored) Captured data
```

---

## ⚔️ Capture Vectors

| Vector | Description | Real-World Risk |
|--------|-------------|-----------------|
| ⌨️ Keystrokes | Captures every keypress with field context | Credential theft |
| 📋 Clipboard | Intercepts paste events | Token/API key theft |
| 📝 Form Submit | Grabs all form field values on submission | Mass data exfiltration |
| 🖱️ Clicks | Tracks which elements are interacted with | User behavior profiling |
| 🔍 Fingerprinting | Browser, OS, screen, timezone, language | Victim identification |

---

## 🛡️ Defenses Demonstrated

### Content Security Policy (CSP)
The most effective server-side defense. By setting `connect-src 'none'`, the browser **blocks all outbound connections** from the keylogger, even if the script runs.

```http
Content-Security-Policy: default-src 'self'; connect-src 'none'; script-src 'self';
```

### Virtual Keyboard
Replaces physical keyboard input with on-screen clicks. Keyloggers listening for `keydown` events capture nothing.

### Keystroke Noise Injection
Injects fake keystrokes between real ones, making captured data unreliable and difficult to analyze.

### Network Traffic Analysis
The **Network Traffic Analyzer** visualizes every WebSocket message the keylogger emits — showing packet payloads, data volumes, timing graphs, and a side-by-side comparison of what the user typed vs. what was exfiltrated. It teaches defenders what suspicious traffic patterns look like in DevTools.

### Additional Mitigations
- **Subresource Integrity (SRI)** — Verify third-party scripts haven't been tampered with
- **Input Sanitization** — Prevent XSS injection points
- **Network Monitoring** — Detect suspicious outbound connections
- **Same-Origin Policy** — Restrict cross-origin requests

---

## 📚 Learning Resources

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP: Cross-Site Scripting](https://owasp.org/www-community/attacks/xss/)
- [OWASP: Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

---

## 📄 License

MIT — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <em>Built for educational purposes by <a href="https://github.com/chiragedev">@chiragedev</a></em>
</p>
