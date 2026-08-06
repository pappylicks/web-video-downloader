const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Point to binary installed during build
const YTDLP_BIN = path.join(__dirname, 'bin', 'yt-dlp');

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

    const command = `${YTDLP_BIN} ${formatArgs} --print filename "${videoUrl}"`;

    exec(command, (err, stdout, stderr) => {
        if (err && mode !== 'picture') {
            console.error('Extraction error:', stderr || err.message);
            return res.status(500).send('Failed to analyze URL. ERROR: ' + (stderr || err.message));
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
            downloadCommand = `${YTDLP_BIN} --write-thumbnail --skip-download --print thumbnail "${videoUrl}"`;
        } else {
            downloadCommand = `${YTDLP_BIN} ${formatArgs} -o - "${videoUrl}"`;
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Download History</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
    <main class="max-w-md w-full bg-slate-900 rounded-2xl p-6 border border-slate-800 space-y-4">
        <div class="flex justify-between items-center">
            <a href="/" class="text-indigo-400 text-sm">&larr; Back</a>
            <h1 class="font-bold">History</h1>
        </div>
        <div id="logs" class="text-xs space-y-2"></div>
    </main>
    <script>
        const history = JSON.parse(localStorage.getItem('downloader_history') || '[]');
        document.getElementById('logs').innerHTML = history.length ? history.map(h => \`<div class="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between"><span>\${h.url}</span><span class="text-slate-500">\${h.mode}</span></div>\`).join('') : '<p class="text-center text-slate-500 py-6">No downloads recorded.</p>';
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
                extend: { colors: { brand: { 500: '#6366f1', 600: '#4f46e5' } } }
            }
        }
    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-[100dvh] flex items-center justify-center p-3 sm:p-4 antialiased selection:bg-brand-500 selection:text-white">

    <main class="max-w-md w-full bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col relative">

        <div class="bg-gradient-to-br from-brand-600 to-indigo-700 p-6 text-center relative">
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
                    <label for="video-url" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Video Link (TikTok, X, YouTube, Insta)
                    </label>
                    <div class="relative flex items-center">
                        <span class="absolute left-3 text-slate-400"><i class="ph ph-link text-lg"></i></span>
                        <input id="video-url" type="text" required placeholder="Paste media link here..." class="w-full pl-10 pr-20 py-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-[16px] placeholder-slate-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all" />
                        <button type="button" onclick="pasteClipboard()" class="absolute right-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">Paste</button>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Format</label>
                    <div class="grid grid-cols-3 gap-2">
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="video" checked class="peer sr-only">
                            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-brand-500 peer-checked:bg-brand-500/10 text-center">
                                <i class="ph ph-file-video text-lg text-brand-400 mb-1 block"></i>
                                <span class="text-[11px] font-medium text-slate-200">Video</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="audio" class="peer sr-only">
                            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-brand-500 peer-checked:bg-brand-500/10 text-center">
                                <i class="ph ph-music-notes text-lg text-emerald-400 mb-1 block"></i>
                                <span class="text-[11px] font-medium text-slate-200">MP3</span>
                            </div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="picture" class="peer sr-only">
                            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-brand-500 peer-checked:bg-brand-500/10 text-center">
                                <i class="ph ph-image text-lg text-amber-400 mb-1 block"></i>
                                <span class="text-[11px] font-medium text-slate-200">Cover</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div id="error-box" class="hidden bg-red-500/10 text-red-400 p-3.5 rounded-xl text-xs border border-red-500/20 flex items-start space-x-2">
                    <i class="ph ph-warning-circle text-base flex-shrink-0 mt-0.5"></i>
                    <span id="error-text" class="flex-1">An error occurred.</span>
                </div>

                <button id="submit-btn" type="submit" class="w-full py-4 px-4 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-500 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-brand-600/25">
                    <i class="ph ph-cloud-arrow-down text-xl"></i>
                    <span>Download Media</span>
                </button>
            </form>
        </div>
    </main>

    <script>
        const BACKEND_URL = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '');

        async function checkServerHeartbeat() {
            const dot = document.getElementById('server-status-dot');
            const text = document.getElementById('server-status-text');
            try {
                const res = await fetch(BACKEND_URL + '/ping').catch(() => null);
                if (res && res.ok) {
                    dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
                    text.textContent = "Online";
                } else throw new Error();
            } catch (e) {
                dot.className = "w-2.5 h-2.5 rounded-full bg-red-500 animate-ping";
                text.textContent = "Offline";
            }
        }
        setInterval(checkServerHeartbeat, 5000);
        checkServerHeartbeat();

        async function pasteClipboard() {
            try {
                const text = await navigator.clipboard.readText();
                if (text) document.getElementById('video-url').value = text;
            } catch (err) {
                alert('Clipboard access restricted. Long-press to paste manually.');
            }
        }

        async function handleDownload(e) {
            e.preventDefault();
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
                if (!checkRes) throw new Error("Backend server is starting up or unreachable. Please retry in 20 seconds.");

                window.location.href = BACKEND_URL + '/download?url=' + encodeURIComponent(url) + '&mode=' + selectedMode;

                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="ph ph-cloud-arrow-down text-xl"></i><span>Download Media</span>';
                }, 3000);

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
    console.log('Downloader server running on port ' + PORT);
});
