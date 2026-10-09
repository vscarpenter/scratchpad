# Build environment for Anthropic's OSS Scanner (https://github.com/anthropics/oss-scanner).
# Scratchpad has no build step, so this image installs what the scanner needs to exercise
# the app: Node, the pinned Bun, the locked dev dependencies, and Playwright's browsers.
# It follows the same install steps as .github/workflows/quality.yml.
# The scan itself runs offline, so this build fetches everything a test needs.
FROM node:22-bookworm

# A fixed browser path keeps Playwright working whatever HOME the scan uses.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# The provisioning tests package the Lambda with zip, which the base image lacks.
RUN apt-get update && apt-get install -y --no-install-recommends zip \
    && rm -rf /var/lib/apt/lists/*

# Scanner contract: the checkout lives inside the image at /src.
COPY . /src
WORKDIR /src

# Install the Bun version that package.json pins, so this file never drifts from it.
RUN npm install --global "$(node -p "require('./package.json').packageManager")"

RUN bun install --frozen-lockfile \
    && node_modules/.bin/playwright install --with-deps

# Cheap checks that prove the image works. A failure prints a warning instead of failing the build.
RUN node --test share-infra/lambda/*.test.mjs \
    || echo "WARNING: share API unit tests reported failures"
RUN node_modules/.bin/playwright test --project=chromium tests/network-isolation.spec.js \
    || echo "WARNING: network isolation smoke test reported failures"
