const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

// Create temp directory if it doesn't exist
const TEMP_DIR = '/tmp/yt-dlp-downloads';
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Cleanup function for temporary files
const cleanupTempFile = (filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`Failed to delete temp file ${filePath}:`, err);
            } else {
                console.log(`Cleaned up temp file: ${filePath}`);
            }
        });
    }
};

app.get('/ping', (req, res) => {
    res.json({ status: 'alive', message: 'Docker backend running smoothly' });
});

app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    const mode = req.query.mode || 'video';

    if (!videoUrl) {
        return res.status(400).send('Missing video URL parameter.');
    }

    // Clean URL tracking parameters
    const cleanedUrl = videoUrl.trim().split('&si=')[0].split('?si=')[0];
    console.log('[DOCKER YT-DLP] Target: ' + cleanedUrl + ' | Mode: ' + mode);

    // Generate unique filename
    const fileId = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    let formatArgs = '';
    let filename = '';
    let contentType = '';
    let outputExt = '';

    if (mode === 'audio') {
        // Extract best audio and pipe through ffmpeg to output a standard MP3
        outputExt = 'mp3';
        filename = `audio_${timestamp}_${fileId}.mp3`;
        contentType = 'audio/mpeg';
        
        // Download to temp file with yt-dlp
        const tempOutputPath = path.join(TEMP_DIR, filename);
        formatArgs = `-f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 0 -o "${tempOutputPath}"`;
        
        // Execute download to temp file
        const command = `yt-dlp ${formatArgs} --no-playlist "${cleanedUrl}"`;
        console.log(`Executing: ${command}`);

        const child = exec(command, { maxBuffer: 1024 * 1024 * 500 });

        let stderrData = '';

        child.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log('[yt-dlp log]:', data.toString());
        });

        child.on('close', (code) => {
            if (code === 0 && fs.existsSync(tempOutputPath)) {
                // File downloaded successfully, send it
                res.download(tempOutputPath, 'download.mp3', (err) => {
                    if (err) {
                        console.error('Error sending file:', err);
                        if (!res.headersSent) {
                            res.status(500).send('Error sending file');
                        }
                    }
                    // Cleanup after sending
                    cleanupTempFile(tempOutputPath);
                });
            } else {
                console.error(`yt-dlp process exited with code ${code}`);
                if (!res.headersSent) {
                    res.status(500).send('Failed to download media file.');
                }
                // Cleanup on error
                cleanupTempFile(tempOutputPath);
            }
        });

        child.on('error', (err) => {
            console.error('Process execution error:', err);
            if (!res.headersSent) {
                res.status(500).send('Failed to process media file.');
            }
            cleanupTempFile(tempOutputPath);
        });

        req.on('close', () => {
            if (child && !child.killed) {
                child.kill();
            }
            cleanupTempFile(tempOutputPath);
        });

    } else {
        // Video mode - download to temp file first
        outputExt = 'mp4';
        filename = `video_${timestamp}_${fileId}.mp4`;
        contentType = 'video/mp4';
        
        // Enforce progressive MP4 (h264 + aac) compatible with all phones & browsers
        const tempOutputPath = path.join(TEMP_DIR, filename);
        formatArgs = `-f "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${tempOutputPath}"`;
        
        const command = `yt-dlp ${formatArgs} --no-playlist "${cleanedUrl}"`;
        console.log(`Executing: ${command}`);

        const child = exec(command, { maxBuffer: 1024 * 1024 * 500 });

        let stderrData = '';

        child.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log('[yt-dlp log]:', data.toString());
        });

        child.on('close', (code) => {
            if (code === 0 && fs.existsSync(tempOutputPath)) {
                // File downloaded successfully, send it
                res.download(tempOutputPath, 'download.mp4', (err) => {
                    if (err) {
                        console.error('Error sending file:', err);
                        if (!res.headersSent) {
                            res.status(500).send('Error sending file');
                        }
                    }
                    // Cleanup after sending
                    cleanupTempFile(tempOutputPath);
                });
            } else {
                console.error(`yt-dlp process exited with code ${code}`);
                if (!res.headersSent) {
                    res.status(500).send('Failed to download media file.');
                }
                // Cleanup on error
                cleanupTempFile(tempOutputPath);
            }
        });

        child.on('error', (err) => {
            console.error('Process execution error:', err);
            if (!res.headersSent) {
                res.status(500).send('Failed to process media file.');
            }
            cleanupTempFile(tempOutputPath);
        });

        req.on('close', () => {
            if (child && !child.killed) {
                child.kill();
            }
            cleanupTempFile(tempOutputPath);
        });
    }
});

app.get('/', (req, res) => {
    // ... (HTML content remains the same)
});

app.listen(PORT, () => console.log('Docker server running on port ' + PORT));
