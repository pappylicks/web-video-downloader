const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

app.get('/ping', (req, res) => {
    res.json({ status: 'alive', message: 'Backend running smoothly' });
});

// Helper function to clean clean query parameters for better parsing
function cleanUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        // Retain standard youtube v parameter, drop tracking parameters like ?si=
        if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
            return rawUrl.split('&si=')[0].split('?si=')[0];
        }
        return rawUrl;
    } catch (e) {
        return rawUrl;
    }
}

app.get('/download', async (req, res) => {
    let videoUrl = req.query.url;
    const mode = req.query.mode || 'video';

    if (!videoUrl) {
        return res.status(400).send('Missing video URL parameter.');
    }

    videoUrl = cleanUrl(videoUrl.trim());
    console.log('[DOWNLOAD REQUEST] Target: ' + videoUrl + ' | Mode: ' + mode);

    let directMediaUrl = null;

    try {
        // --- ENGINE 1: Primary Multi-Service API ---
        try {
            const rapidRes = await fetch(`https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink`, {
                method: 'POST',
                headers: {
                    'x-rapidapi-key': '2b9347d4e3msh802bf1c9441fb42p19a16fjsn1869e5d4a13e',
                    'x-rapidapi-host': 'social-download-all-in-one.p.rapidapi.com',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: videoUrl })
            });

            if (rapidRes.ok) {
                const data = await rapidRes.json();
                if (data && data.medias && data.medias.length > 0) {
                    const match = mode === 'audio'
                        ? data.medias.find(m => m.extension === 'mp3' || (m.quality && m.quality.includes('audio'))) || data.medias[0]
                        : data.medias.find(m => m.extension === 'mp4' || (m.quality && m.quality.includes('HD'))) || data.medias[0];
                    directMediaUrl = match ? match.url : null;
                }
            }
        } catch (e) {
            console.log('Engine 1 skipped:', e.message);
        }

        // --- ENGINE 2: Cobalt Public Engine Fallback ---
        if (!directMediaUrl) {
            try {
                const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    body: JSON.stringify({
                        url: videoUrl,
                        downloadMode: mode === 'audio' ? 'audio' : 'auto',
                        videoQuality: '720'
                    })
                });

                if (cobaltRes.ok) {
                    const cData = await cobaltRes.json();
                    directMediaUrl = cData.url || (cData.picker && cData.picker[0] ? cData.picker[0].url : null);
                }
            } catch (e) {
                console.log('Engine 2 skipped:', e.message);
            }
        }

        // --- ENGINE 3: TikTok / Social Dedicated Resolver ---
        if (!directMediaUrl) {
            try {
                const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}`);
                if (tikRes.ok) {
                    const tData = await tikRes.json();
                    if (tData && tData.data) {
                        directMediaUrl = mode === 'audio' ? tData.data.music : (tData.data.play || tData.data.wmplay);
                    }
                }
            } catch (e) {
                console.log('Engine 3 skipped:', e.message);
            }
        }

        if (!directMediaUrl) {
            return res.status(500).send('Unable to extract direct media link. Please verify the link is public and accessible.');
        }

        const ext = mode === 'audio' ? 'mp3' : 'mp4';
        const contentType = mode === 'audio' ? 'audio/mpeg' : 'video/mp4';

        res.setHeader('Content-Disposition', `attachment; filename="downloader_media.${ext}"`);
        res.setHeader('Content-Type', contentType);

        // Pipe direct stream buffer back to user
        const client = directMediaUrl.startsWith('https') ? https : http;
        const streamReq = client.get(directMediaUrl, {
            rejectUnauthorized: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        }, (streamRes) => {
            if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
                const redirClient = streamRes.headers.location.startsWith('https') ? https : http;
                redirClient.get(streamRes.headers.location, { rejectUnauthorized: false }, (redRes) => redRes.pipe(res));
            } else {
                streamRes.pipe(res);
            }
        });

        streamReq.on('error', (err) => {
            if (!res.headersSent) res.status(500).send('Stream error: ' + err.message);
        });

    } catch (err) {
        console.error('Download error:', err);
        if (!res.headersSent) res.status(500).send('Server error: ' + err.message);
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
            <p class="text-indigo-100 text-xs mt-1">Multi-Engine High-Speed Extractor</p>
        </div>

        <div class="p-6 space-y-5">
            <form onsubmit="handleDownload(event)" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Video Link (YouTube, TikTok, X)</label>
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
