const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/ping', (req, res) => {
    res.json({ status: 'alive', message: 'Backend running smoothly' });
});

app.get('/download', async (req, res) => {
    const videoUrl = req.query.url;
    const mode = req.query.mode || 'video';

    if (!videoUrl) {
        return res.status(400).send('Missing video URL parameter.');
    }

    console.log('[DOWNLOAD REQUEST] Target: ' + videoUrl + ' | Mode: ' + mode);

    try {
        // Use Cobalt Public API Instance for robust serverless extraction
        const apiResponse = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            body: JSON.stringify({
                url: videoUrl,
                downloadMode: mode === 'audio' ? 'audio' : 'auto',
                videoQuality: '720',
                audioFormat: 'mp3'
            })
        });

        const data = await apiResponse.json();

        if (data && (data.url || data.picker)) {
            const targetStreamUrl = data.url || (data.picker && data.picker[0] ? data.picker[0].url : null);

            if (!targetStreamUrl) {
                return res.status(500).send('Could not extract direct stream URL.');
            }

            const ext = mode === 'audio' ? 'mp3' : 'mp4';
            const contentType = mode === 'audio' ? 'audio/mpeg' : 'video/mp4';

            res.setHeader('Content-Disposition', `attachment; filename="media_download.${ext}"`);
            res.setHeader('Content-Type', contentType);

            const client = targetStreamUrl.startsWith('https') ? https : http;
            client.get(targetStreamUrl, (streamRes) => {
                if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
                    client.get(streamRes.headers.location, (redirectRes) => {
                        redirectRes.pipe(res);
                    });
                } else {
                    streamRes.pipe(res);
                }
            }).on('error', (err) => {
                res.status(500).send('Error piping stream: ' + err.message);
            });

        } else {
            res.status(500).send('Extraction failed. Check if link is valid or public: ' + (data.text || 'Unknown API response'));
        }
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).send('Server processing error: ' + err.message);
    }
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Downloader Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">

    <main class="max-w-md w-full bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col relative">
        <div class="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-center relative">
            <div class="absolute top-4 right-4 flex items-center space-x-1.5 bg-slate-950/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <span id="server-status-dot" class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span id="server-status-text" class="text-[10px] font-medium text-white">Checking...</span>
            </div>
            <div class="w-14 h-14 mx-auto bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-3">
                 <i class="ph ph-download-simple text-3xl text-white"></i>
            </div>
            <h1 class="text-xl font-bold text-white">Downloader Pro</h1>
            <p class="text-indigo-100 text-xs mt-1">Fast, watermark-free media downloader</p>
        </div>

        <div class="p-6 space-y-5">
            <form onsubmit="handleDownload(event)" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Video Link (X, TikTok, YouTube)</label>
                    <div class="relative flex items-center">
                        <input id="video-url" type="text" required placeholder="Paste media link here..." class="w-full pl-4 pr-20 py-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <button type="button" onclick="pasteClipboard()" class="absolute right-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium">Paste</button>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Format</label>
                    <div class="grid grid-cols-2 gap-2">
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="video" checked class="peer sr-only">
                            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-indigo-500 peer-checked:bg-indigo-500/10 text-center text-xs">Video (MP4)</div>
                        </label>
                        <label class="cursor-pointer">
                            <input type="radio" name="download-mode" value="audio" class="peer sr-only">
                            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 peer-checked:border-indigo-500 peer-checked:bg-indigo-500/10 text-center text-xs">Audio (MP3)</div>
                        </label>
                    </div>
                </div>

                <button id="submit-btn" type="submit" class="w-full py-3.5 px-4 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all text-sm">Download</button>
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
                    dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
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
            } catch (err) { alert('Long-press input box to paste manually.'); }
        }

        function handleDownload(e) {
            e.preventDefault();
            const url = document.getElementById('video-url').value.trim();
            const mode = document.querySelector('input[name="download-mode"]:checked').value;
            if (url) window.location.href = BACKEND_URL + '/download?url=' + encodeURIComponent(url) + '&mode=' + mode;
        }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('Server running on port ' + PORT));
