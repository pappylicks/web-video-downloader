const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Auto-update yt-dlp on server startup
const updateYtDlp = () => {
    console.log('Checking for yt-dlp updates...');
    exec('yt-dlp -U', (err, stdout, stderr) => {
        if (err) {
            console.log('Auto-update notice:', stderr || err.message);
        } else {
            console.log('yt-dlp status:', stdout.trim());
        }
    });
};
updateYtDlp();

app.get('/ping', (req, res) => {
    res.json({ status: 'alive', message: 'Backend is running smoothly' });
});

app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    const mode = req.query.mode || 'video';

    if (!videoUrl) {
        return res.status(400).send('Missing video URL parameter.');
    }

    console.log('[DOWNLOAD REQUEST] Target: ' + videoUrl + ' | Mode: ' + mode);

    // Universal format args optimized to bypass bot blocks and re-encode to standard MP4
    let formatArgs = '-f "bestvideo+bestaudio/best" --recode-video mp4 --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"';
    let expectedExt = 'mp4';
    let contentType = 'video/mp4';

    if (mode === 'audio') {
        formatArgs = '-x --audio-format mp3 --audio-quality 0 --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"';
        expectedExt = 'mp3';
        contentType = 'audio/mpeg';
    } else if (mode === 'picture') {
        formatArgs = '--write-thumbnail --skip-download';
        expectedExt = 'jpg';
        contentType = 'image/jpeg';
    }

    const command = 'yt-dlp ' + formatArgs + ' --print filename "' + videoUrl + '"';

    exec(command, (err, stdout, stderr) => {
        if (err && mode !== 'picture') {
            console.error('Extraction error:', stderr || err.message);
            return res.status(500).send('Failed to analyze URL. Ensure the link is public. ERROR: ' + (stderr || err.message));
        }

        const rawFilename = stdout ? (stdout.trim().split('\n').pop() || ('media.' + expectedExt)) : ('media.' + expectedExt);
        let finalFilename = rawFilename.replace(/\.[^/.]+$/, '.' + expectedExt);
        if (!finalFilename.endsWith('.' + expectedExt)) {
            finalFilename += '.' + expectedExt;
        }

        res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(finalFilename) + '"');
        res.setHeader('Content-Type', contentType);

        let downloadCommand = '';
        if (mode === 'picture') {
            downloadCommand = 'yt-dlp --write-thumbnail --skip-download --print thumbnail "' + videoUrl + '"';
        } else {
            downloadCommand = 'yt-dlp ' + formatArgs + ' -o - "' + videoUrl + '"';
        }

        const child = exec(downloadCommand, { maxBuffer: 1024 * 1024 * 100 });

        if (mode === 'picture') {
            let dataOutput = '';
            child.stdout.on('data', (chunk) => {
                dataOutput += chunk;
            });
            child.on('close', () => {
                const imageUrl = dataOutput.trim().split('\n').pop();
                if (imageUrl && imageUrl.startsWith('http')) {
                    https.get(imageUrl, (imgRes) => {
                        imgRes.pipe(res);
                    }).on('error', (imgErr) => {
                        if (!res.headersSent) res.status(500).send('Failed to fetch cover picture.');
                    });
                } else {
                    if (!res.headersSent) res.status(500).send('Could not extract thumbnail image URL.');
                }
            });
        } else {
            child.stdout.pipe(res);
        }

        child.on('error', (streamErr) => {
            console.error('Stream transmission error:', streamErr);
            if (!res.headersSent) {
                res.status(500).send('Error streaming media payload.');
            }
        });
    });
});

app.get('/history', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Download History & Analytics - Downloader Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: { 500: '#6366f1', 600: '#4f46e5' }
                    }
                }
            }
        }
    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-[100dvh] flex items-center justify-center p-3 sm:p-4 antialiased selection:bg-brand-500 selection:text-white">
    <main class="max-w-md w-full bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col relative transition-all">
        <div class="bg-gradient-to-br from-brand-600 to-indigo-700 p-6 flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <a href="/" class="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all shadow-md">
                    <i class="ph ph-arrow-left text-xl"></i>
                </a>
                <div>
                    <h1 class="text-xl font-bold text-white tracking-tight">History & Stats</h1>
                    <p class="text-indigo-100 text-xs">Analytics and download logs</p>
                </div>
            </div>
            <button onclick="clearFullHistory()" class="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition-colors border border-red-500/30">
                Clear All
            </button>
        </div>

        <div class="p-6 space-y-5 flex-1 overflow-y-auto">
            <div class="grid grid-cols-3 gap-2 text-center">
                <div class="bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                    <i class="ph ph-cloud-arrow-down text-lg text-brand-400 mb-1 block"></i>
                    <span id="stat-total" class="text-base font-bold text-white">0</span>
                    <p class="text-[10px] text-slate-400 uppercase tracking-wider">Total</p>
                </div>
                <div class="bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                    <i class="ph ph-file-video text-lg text-emerald-400 mb-1 block"></i>
                    <span id="stat-videos" class="text-base font-bold text-white">0</span>
                    <p class="text-[10px] text-slate-400 uppercase tracking-wider">Videos</p>
                </div>
                <div class="bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                    <i class="ph ph-music-notes text-lg text-amber-400 mb-1 block"></i>
                    <span id="stat-audio" class="text-base font-bold text-white">0</span>
                    <p class="text-[10px] text-slate-400 uppercase tracking-wider">Audio</p>
                </div>
            </div>

            <div class="relative flex items-center">
                <span class="absolute left-3 text-slate-500">
                    <i class="ph ph-magnifying-glass text-sm"></i>
                </span>
                <input
                    id="history-search"
                    type="text"
                    oninput="filterHistory()"
                    placeholder="Search past download links..."
                    class="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs placeholder-slate-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                />
            </div>

            <div id="full-history-list" class="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1"></div>
        </div>
    </main>

    <script>
        let downloadHistory = JSON.parse(localStorage.getItem('downloader_history') || '[]');

        function updateStats() {
            document.getElementById('stat-total').textContent = downloadHistory.length;
            document.getElementById('stat-videos').textContent = downloadHistory.filter(h => h.mode === 'video' || !h.mode).length;
            document.getElementById('stat-audio').textContent = downloadHistory.filter(h => h.mode === 'audio').length;
        }

        function renderFullHistory(itemsToRender = downloadHistory) {
            updateStats();
            const list = document.getElementById('full-history-list');
            if (itemsToRender.length === 0) {
                list.innerHTML = '<div class="text-center py-10 text-slate-500 text-xs">No download records matched.</div>';
                return;
            }

            list.innerHTML = itemsToRender.map((item, index) => \`
                <div class="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
                    <div class="space-y-1 overflow-hidden pr-2 flex-1">
                        <p class="font-medium text-slate-200 truncate">\${item.url}</p>
                        <div class="flex items-center space-x-2 text-[10px] text-slate-400">
                            <span class="px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 uppercase font-semibold">\${item.mode || 'video'}</span>
                            <span>\${item.date}</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-1.5 flex-shrink-0">
                        <a href="/?url=\${encodeURIComponent(item.url)}" class="px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors">Use</a>
                        <button onclick="deleteEntry('\${item.url}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
                            <i class="ph ph-trash text-sm"></i>
                        </button>
                    </div>
                </div>
            \`).join('');
        }

        function filterHistory() {
            const query = document.getElementById('history-search').value.toLowerCase();
            const filtered = downloadHistory.filter(item => item.url.toLowerCase().includes(query));
            renderFullHistory(filtered);
        }

        function deleteEntry(targetUrl) {
            downloadHistory = downloadHistory.filter(h => h.url !== targetUrl);
            localStorage.setItem('downloader_history', JSON.stringify(downloadHistory));
            filterHistory();
        }

        function clearFullHistory() {
            downloadHistory = [];
            localStorage.removeItem('downloader_history');
            renderFullHistory();
        }

        renderFullHistory();
    </script>
</body>
</html>`);
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Downloader Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: { 500: '#6366f1', 600: '#4f46e5' }
                    }
                }
            }
        }
    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-[100dvh] flex items-center justify-center p-3 sm:p-4 antialiased selection:bg-brand-500 selection:text-white">

    <div id="sidebar-backdrop" onclick="toggleSidebar()" class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 opacity-0 pointer-events-none transition-opacity duration-300"></div>

    <aside id="sidebar-drawer" class="fixed top-0 left-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 z-50 p-6 flex flex-col transform -translate-x-full transition-transform duration-300 ease-in-out shadow-2xl">
        <div class="flex items-center justify-between pb-6 border-b border-slate-800">
            <div class="flex items-center space-x-2">
                <i class="ph ph-sliders text-2xl text-brand-500"></i>
                <h2 class="text-lg font-bold text-white tracking-wide">Settings & Tools</h2>
            </div>
            <button onclick="toggleSidebar()" class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <i class="ph ph-x text-xl"></i>
            </button>
        </div>

        <div class="py-6 space-y-4 flex-1 overflow-y-auto">
            <a href="/history" class="w-full flex items-center space-x-3 p-3 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 text-left transition-colors text-brand-300">
                <i class="ph ph-clock-counter-clockwise text-xl"></i>
                <div>
                    <p class="text-sm font-medium">Download History & Stats</p>
                    <p class="text-xs text-brand-400/70">View records & search analytics</p>
                </div>
            </a>

            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
                <div class="flex items-center space-x-3">
                    <i class="ph ph-broom text-xl text-indigo-400"></i>
                    <div>
                        <p class="text-sm font-medium text-white">Auto-Clear Input</p>
                        <p class="text-xs text-slate-400">Clear field after downloading</p>
                    </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="autoclear-toggle" checked onchange="toggleAutoClear(this)" class="sr-only peer">
                    <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </label>
            </div>

            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
                <div class="flex items-center space-x-3">
                    <i class="ph ph-speaker-high text-xl text-emerald-400"></i>
                    <div>
                        <p class="text-sm font-medium text-white">Action Sound FX</p>
                        <p class="text-xs text-slate-400">Audio feedback click tones</p>
                    </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="sound-toggle" checked onchange="toggleSound(this)" class="sr-only peer">
                    <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </label>
            </div>

            <button onclick="exportHistory()" class="w-full flex items-center space-x-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-800 text-left transition-colors">
                <i class="ph ph-download-simple text-xl text-emerald-400"></i>
                <div>
                    <p class="text-sm font-medium text-white">Export History</p>
                    <p class="text-xs text-slate-400">Download recent records (.json)</p>
                </div>
            </button>

            <button onclick="clearHistory()" class="w-full flex items-center space-x-3 p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-left transition-colors text-red-400">
                <i class="ph ph-trash text-xl"></i>
                <div>
                    <p class="text-sm font-medium">Clear History Logs</p>
                    <p class="text-xs text-red-400/70">Wipe local recent download history</p>
                </div>
            </button>
        </div>

        <div class="pt-4 border-t border-slate-800 text-center">
            <p class="text-xs text-slate-500">Downloader Pro Engine v4.8</p>
        </div>
    </aside>

    <main class="max-w-md w-full bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col relative transition-all">

        <div class="bg-gradient-to-br from-brand-600 to-indigo-700 p-6 text-center relative">
            <div class="absolute top-4 left-4">
                <button onclick="toggleSidebar(); playClick();" aria-label="Open Menu" class="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all shadow-md">
                    <i class="ph ph-list text-2xl"></i>
                </button>
            </div>

            <div class="absolute top-4 right-4 flex items-center space-x-1.5 bg-slate-950/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <span id="server-status-dot" class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span id="server-status-text" class="text-[10px] font-medium text-white tracking-wide">Checking...</span>
            </div>

            <div class="w-16 h-16 mx-auto bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 shadow-inner mt-2">
                 <i class="ph ph-download-simple text-3xl text-white"></i>
            </div>
            <h1 class="text-2xl font-bold text-white mb-1 tracking-tight">Downloader Pro</h1>
            <p class="text-indigo-100 text-xs sm:text-sm font-medium">Save videos locally, without watermarks.</p>
        </div>

        <div class="p-6 space-y-5 flex-1">
            <form onsubmit="handleDownload(event)" class="space-y-4">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label for="video-url" class="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Video Link (TikTok, X, YouTube, Insta)
                        </label>
                        <button type="button" onclick="clearInput(); playClick();" class="text-xs text-slate-500 hover:text-slate-300 transition-colors">Clear Field</button>
                    </div>
                    <div class="relative flex items-center">
                        <span class="absolute left-3 text-slate-400">
                            <i class="ph ph-link text-lg"></i>
                        </span>
                        <input
                            id="video-url"
                            type="text"
                            required
                            placeholder="Long-press and paste link here..."
                            class="w-full pl-10 pr-20 py-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-[16px] placeholder-slate-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                        />
                        <button type="button" onclick="pasteClipboard(); playClick();" class="absolute right-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
                            Paste
                        </button>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Download Format / Type
                    </label>
                    <div class="grid grid-cols-3 gap-2">
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="video" checked class="peer sr-only">
                            <div onclick="playClick()" class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-brand-500 peer-checked:bg-brand-500/10 text-center transition-all">
                                <i class="ph ph-file-video text-lg text-brand-400 mb-1 block"></i>
                                <span class="text-[11px] font-medium text-slate-200">Video</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="audio" class="peer sr-only">
                            <div onclick="playClick()" class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-brand-500 peer-checked:bg-brand-500/10 text-center transition-all">
                                <i class="ph ph-music-notes text-lg text-emerald-400 mb-1 block"></i>
                                <span class="text-[11px] font-medium text-slate-200">MP3 Audio</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="picture" class="peer sr-only">
                            <div onclick="playClick()" class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-brand-500 peer-checked:bg-brand-500/10 text-center transition-all">
                                <i class="ph ph-image text-lg text-amber-400 mb-1 block"></i>
                                <span class="text-[11px] font-medium text-slate-200">Cover Pic</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div id="error-box" class="hidden bg-red-500/10 text-red-400 p-3.5 rounded-xl text-xs border border-red-500/20 flex items-start space-x-2 animate-fadeIn">
                    <i class="ph ph-warning-circle text-base flex-shrink-0 mt-0.5"></i>
                    <span id="error-text" class="flex-1">An error occurred.</span>
                </div>

                <button
                    id="submit-btn"
                    type="submit"
                    class="w-full py-4 px-4 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-500 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 shadow-lg shadow-brand-600/25"
                >
                    <i class="ph ph-cloud-arrow-down text-xl"></i>
                    <span>Download Media</span>
                </button>
            </form>

            <div class="pt-2 border-t border-slate-800/80">
                <h3 class="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-2.5">Supported Platforms</h3>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60 flex flex-col items-center">
                        <i class="ph ph-video text-lg text-rose-400 mb-1"></i>
                        <span class="text-[11px] font-medium text-slate-300">TikTok</span>
                    </div>
                    <div class="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60 flex flex-col items-center">
                        <i class="ph ph-instagram-logo text-lg text-amber-400 mb-1"></i>
                        <span class="text-[11px] font-medium text-slate-300">Instagram</span>
                    </div>
                    <div class="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60 flex flex-col items-center">
                        <i class="ph ph-youtube-logo text-lg text-red-400 mb-1"></i>
                        <span class="text-[11px] font-medium text-slate-300">YouTube / X</span>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <script>
        let autoClearInput = true;
        let soundEnabled = true;
        let downloadHistory = JSON.parse(localStorage.getItem('downloader_history') || '[]');

        const BACKEND_URL = window.location.protocol + '//' + window.location.hostname + ':4000';

        async function checkServerHeartbeat() {
            const dot = document.getElementById('server-status-dot');
            const text = document.getElementById('server-status-text');
            try {
                const res = await fetch(BACKEND_URL + '/ping').catch(() => null);
                if (res && res.ok) {
                    dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
                    text.textContent = "Online";
                } else {
                    throw new Error();
                }
            } catch (e) {
                dot.className = "w-2.5 h-2.5 rounded-full bg-red-500 animate-ping";
                text.textContent = "Offline";
            }
        }
        setInterval(checkServerHeartbeat, 5000);
        checkServerHeartbeat();

        function playClick() {
            if (!soundEnabled) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                gain.gain.setValueAtTime(0.03, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.08);
            } catch (e) {}
        }

        window.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const refUrl = urlParams.get('url');
            if (refUrl) {
                document.getElementById('video-url').value = refUrl;
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        });

        function toggleSidebar() {
            const drawer = document.getElementById('sidebar-drawer');
            const backdrop = document.getElementById('sidebar-backdrop');
            const isOpen = drawer.classList.contains('translate-x-0');

            if (isOpen) {
                drawer.classList.remove('translate-x-0');
                drawer.classList.add('-translate-x-full');
                backdrop.classList.add('opacity-0', 'pointer-events-none');
            } else {
                drawer.classList.remove('-translate-x-full');
                drawer.classList.add('translate-x-0');
                backdrop.classList.remove('opacity-0', 'pointer-events-none');
            }
        }

        function toggleAutoClear(checkbox) {
            autoClearInput = checkbox.checked;
            playClick();
        }

        function toggleSound(checkbox) {
            soundEnabled = checkbox.checked;
            playClick();
        }

        function clearInput() {
            document.getElementById('video-url').value = '';
        }

        async function pasteClipboard() {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    document.getElementById('video-url').value = text;
                } else {
                    alert('Clipboard is empty. Long-press the box to paste manually.');
                }
            } catch (err) {
                alert('Clipboard access restricted by app. Please long-press the text box to paste manually.');
            }
        }

        function saveHistory(url, mode) {
            const entry = { url, mode, date: new Date().toLocaleTimeString() };
            downloadHistory = [entry, ...downloadHistory.filter(h => h.url !== url)].slice(0, 50);
            localStorage.setItem('downloader_history', JSON.stringify(downloadHistory));
        }

        function clearHistory() {
            downloadHistory = [];
            localStorage.removeItem('downloader_history');
            toggleSidebar();
            playClick();
        }

        function exportHistory() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(downloadHistory, null, 2));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", "download_history.json");
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();
            toggleSidebar();
            playClick();
        }

        async function handleDownload(e) {
            e.preventDefault();
            playClick();
            const urlInput = document.getElementById('video-url');
            const submitBtn = document.getElementById('submit-btn');
            const errorBox = document.getElementById('error-box');
            const errorText = document.getElementById('error-text');

            const url = urlInput.value.trim();
            const selectedMode = document.querySelector('input[name="download-mode"]:checked').value;

            if (!url) return;

            errorBox.classList.add('hidden');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i><span>Processing Stream...</span>';

            try {
                const checkRes = await fetch(BACKEND_URL + '/ping').catch(() => null);
                if (!checkRes) {
                    throw new Error("Cannot connect to local backend server. Ensure server.js is running.");
                }

                saveHistory(url, selectedMode);
                window.location.href = BACKEND_URL + '/download?url=' + encodeURIComponent(url) + '&mode=' + selectedMode;

                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="ph ph-cloud-arrow-down text-xl"></i><span>Download Media</span>';
                    if (autoClearInput) urlInput.value = '';
                }, 2500);

            } catch (err) {
                errorBox.classList.remove('hidden');
                errorText.textContent = err.message || "An unexpected error occurred.";
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="ph ph-cloud-arrow-down text-xl"></i><span>Download Media</span>';
            }
        }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log('Downloader server running at http://localhost:' + PORT);
});