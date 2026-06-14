# server/Dockerfile.builder — OPTIONAL on-box rebuild path.
#
# The RECOMMENDED production flow signs OFF-BOX (laptop/CI) and only the signed
# artifact is published, so no signing key ever touches the public server. This
# image exists for the case where you want a scheduled on-box compile+sign; if
# you use it, pass the private key as a Docker secret (NOT baked into the image)
# and treat the box as key-bearing in your threat model.
#
# Build context = repo root (needs src/shared/blocklist/baselineBundle.ts):
#   docker build -f server/Dockerfile.builder -t cnd-blocklist-builder .
#   docker run --rm -e BUNDLE_VERSION=3 \
#     --mount type=bind,src="$PWD/server/.secrets/signing.key.pem",target=/run/secrets/blocklist_private_key,readonly \
#     -v "$PWD/server/out:/app/server/out" cnd-blocklist-builder

FROM node:22-alpine@sha256:9bef0ef1e268f60627da9ba7d7605e8831d5b56ad07487d24d1aa386336d1944

WORKDIR /app
# Only what the build needs — keep the image minimal.
COPY server/build-bundle.mjs server/build-bundle.mjs
COPY scripts/compile-blocklists.mjs scripts/compile-blocklists.mjs
COPY src/shared/blocklist/baselineBundle.ts src/shared/blocklist/baselineBundle.ts

# Compile from live feeds (HaGeZi GPL + Phishing.Database MIT) is optional and
# needs network; default path just signs the committed baseline seed.
# RUN npm i -D @adguard/hostlist-compiler && node scripts/compile-blocklists.mjs

USER node
ENTRYPOINT ["node", "server/build-bundle.mjs"]
