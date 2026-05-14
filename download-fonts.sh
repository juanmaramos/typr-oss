#!/bin/bash

# Create the directory if it doesn't exist
mkdir -p public/fonts/geist

# Download Geist Sans
echo "Downloading Geist Sans font files..."
curl -L -o public/fonts/geist/Geist-Thin.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Thin.woff2
curl -L -o public/fonts/geist/Geist-UltraLight.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-UltraLight.woff2
curl -L -o public/fonts/geist/Geist-Light.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Light.woff2
curl -L -o public/fonts/geist/Geist-Regular.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Regular.woff2
curl -L -o public/fonts/geist/Geist-Medium.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Medium.woff2
curl -L -o public/fonts/geist/Geist-SemiBold.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-SemiBold.woff2
curl -L -o public/fonts/geist/Geist-Bold.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Bold.woff2
curl -L -o public/fonts/geist/Geist-Black.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Black.woff2

# Download Geist Sans Italic (new in v1.5.0)
curl -L -o public/fonts/geist/Geist-Regular-Italic.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Regular-Italic.woff2
curl -L -o public/fonts/geist/Geist-Medium-Italic.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-Medium-Italic.woff2
curl -L -o public/fonts/geist/Geist-SemiBold-Italic.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-sans/Geist-SemiBold-Italic.woff2

# Download Geist Mono
echo "Downloading Geist Mono font files..."
curl -L -o public/fonts/geist/GeistMono-Regular.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-mono/GeistMono-Regular.woff2
curl -L -o public/fonts/geist/GeistMono-Medium.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-mono/GeistMono-Medium.woff2
curl -L -o public/fonts/geist/GeistMono-SemiBold.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-mono/GeistMono-SemiBold.woff2
curl -L -o public/fonts/geist/GeistMono-Bold.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-mono/GeistMono-Bold.woff2

# Download Geist Mono Italic (new in v1.5.0)
curl -L -o public/fonts/geist/GeistMono-Regular-Italic.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-mono/GeistMono-Regular-Italic.woff2
curl -L -o public/fonts/geist/GeistMono-Medium-Italic.woff2 https://github.com/vercel/geist-font/raw/main/packages/next/public/fonts/geist-mono/GeistMono-Medium-Italic.woff2

echo "Download completed!"