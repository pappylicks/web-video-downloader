#!/usr/bin/env bash
# Exit on error
set -o errexit

# Install Node dependencies
npm install

# Download the official Linux binary of yt-dlp and make it executable
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
