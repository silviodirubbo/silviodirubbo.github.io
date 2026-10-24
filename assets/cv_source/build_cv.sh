#!/bin/sh
# Rebuilds assets/Resume.pdf from cv.html. Needs Node with Playwright and Python 3 with pypdf.
set -e
cd "$(dirname "$0")"
node build_cv.js
python3 set_pdf_metadata.py ../Resume.pdf
