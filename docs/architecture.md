# Architecture Summary (`vaem/asset-manager`)

## 1. Product, Principals, Authority, and Protected Resources
`vaem/asset-manager` is a video asset management and HLS encoding backend service and CLI (`src/index.ts`, `src/bin/console.ts`).
- **Principals & Normal Authority**:
  - **Unauthenticated HTTP Caller**: May access `GET /_alive` (`src/index.ts:44`), OAuth endpoints `/auth/google` (`src/routes/auth/google.ts:35-88`), and `GET /public/assets/:id` (`src/routes/public/assets/[id].ts:25-32`) for assets with `public: true`.
  - **Signed-URL Holder (`/signed/:timestamp/:n/:signature/*`)**: Holds an HMAC-SHA256 signed URL (`src/lib/security.ts:32-49`) granting temporary access to specific exact paths (`n = 0`, e.g., `/assets/:id/subtitles/:language`, `/assets/:id/share/:password`, `/assets/:id/keyinfo`) or path prefixes (`n > 0`, e.g., `n = 3` for `/assets/:id/stream` or `n = 4` for `/files/:id/preview/:uuid`).
  - **Authenticated User (Google OAuth JWT) & Static API Token Holder (`API_TOKENS`)**: Full administrative authority across all HTTP routes (no multi-tenancy, user ownership, or RBAC exists in `Asset`, `File`, or `Job` models).
  - **External Encoder Worker (Socket.IO Client)**: Connects to Socket.IO on the main HTTP server (`src/lib/encoders.socket.io.ts:189-205`) to claim encoding jobs (`ready`), report `progress`/`done`/`encodeError`, and write HLS segments to `var/output/<assetId>`.
  - **System Operator**: Runs CLI maintenance commands (`src/bin/console.ts`) and manages environment secrets.
- **Protected Resources**: Private video/subtitle files (`var/files`, `var/output`, Bunny Storage), AES-128 HLS encryption keys (`Asset.hls_enc_key`, `Asset.hls_enc_iv`), MongoDB documents (`Asset`, `File`, `Job`), host/container filesystem and `ffmpeg`/`ffprobe` execution, and external service credentials (`SECRET`, `API_TOKENS`, `AUTH_URL`, `STORAGE_URL`, `CDN_URL`, `SUBTITLEEDIT_API_URL`, `WEBHOOK_*`).

## 2. Comparable-Software Baseline
Comparable HLS packaging and media management backends (RFC 8216 HLS with AES-128 key delivery, OAuth2/OIDC relying parties, and FFmpeg worker coordinators) treat raw media streams, AES-128 decryption keys, and FFmpeg transcoding arguments/paths as privileged assets restricted to authorized callers or scoped playback tokens.

## 3. Tech Stack, Deployment Paths, and Offline Build/Test Limits
- **Stack**: TypeScript on Node.js 24 (`express@^5.3.0`, `mongoose@^9.12.0`, `socket.io@^4.8.4`, `google-auth-library@^11.3.3`, `jsonwebtoken@^9.0.3`, `send`, `m3u8parse`, `node-webvtt`, `chokidar`, `axios`, external `ffmpeg`/`ffprobe`).
- **Deployment Paths**:
  - Production container (`docker/prod/Dockerfile`): Compiles `src/` to `dist/`, runs `pm2-runtime dist/index.js` as UID 1000 (`node`).
  - Dev Compose (`docker-compose.yml`, `docker/dev/Dockerfile`): Runs `node --import tsx --watch src/index.ts` alongside `mongo:5.0` and `vaem/subtitleedit-api`.
- **Offline Build/Test Limits**: No automated test suite exists. Bounded local execution must run inside an isolated Linux Docker container (`test:latest` with Node.js, `--network none`, `--read-only`, scratch-only writes, empty allowlisted env, and strict CPU/memory/process/file-size/time limits). External services (Bunny Storage/CDN, Google OAuth, SubtitleEdit API, outbound webhooks) are off-limits.

## 4. Entry Surfaces and Source-to-Sink / Lifecycle Paths
- **HTTP Auth & Signed URLs (`src/index.ts:37-56`, `src/lib/security.ts:32-94`, `src/routes/auth/google.ts`, `src/routes/sign.ts`, `src/routes/assets/[id]/share.ts`)**: `security()` checks `SKIP_AUTH`, `/auth` and `/public` prefixes, `/signed/:timestamp/:n/:signature` HMACs, `API_TOKENS`, and JWTs, then calls `next()` at line 87 before checking `if (verified)` at line 88.
- **Generic Model CRUD (`src/routes/[model]/index.ts`, `[id].ts`, `count.ts`, `distinct/`, `info.ts`, `src/lib/crud.ts`)**: Exposes `assets`, `jobs`, and `files`. Parses `query.filter` via `JSON.parse` into Mongoose queries, builds `new RegExp(query.q, 'i')`, and passes `req.body` directly into `new model(body)` / `doc.set(body)`.
- **File Upload, Download, Probing, Preview & Encoding (`src/routes/files/[id]/*`, `src/lib/encode.ts`, `src/lib/ffmpeg.ts`, `src/model/File/post/deleteOne.ts`)**: Uses `file.path` (`${config.root}/var/files/${file.name}`) for `createWriteStream`, `unlink`, `send`, `ffprobe`, `convert`, and `ffmpeg` preview/encode argument construction (`audio`, `ss`, `customAudioFilter`).
- **Asset Streaming, Keys, Subtitles & Thumbnails (`src/routes/assets/[id]/*`, `src/routes/public/assets/[id].ts`, `src/routes/assets.json.ts`)**: Serves HLS playlists, raw AES-128 keys (`file.key`), subtitles (`PUT /assets/:id/subtitles/:language/:name` writing to `tmpdir()` and segmenting via `node-webvtt`), MP4 remux downloads, and thumbnails (`:ss.png`, `frame0.webp`).
- **Socket.IO Encoder Coordinator & UploadQueue (`src/lib/encoders.socket.io.ts`, `src/lib/UploadQueue.ts`)**: Unauthenticated Socket.IO events (`ready`, `progress`, `done`, `encodeError`) pop jobs, emit `ffmpegArguments` + signed `/assets/:id/keyinfo` URLs, mutate job state, and trigger `asset.finish()`.

## 5. Trust Boundaries and Strongest Source-Visible Controls
1. **Unauthenticated HTTP -> Protected Routes**: Controlled by `security()` (`src/lib/security.ts:58-94`); exemptions on `/_alive`, `/auth*`, `/public*`.
2. **Signed-URL Viewer -> Full API / Other Assets**: Controlled by HMAC-SHA256 over `url.split('/').slice(0, n === 0 ? undefined : n + 1).join('/') + timestamp` (`src/lib/security.ts:32-37, 67-71`) and `doc.public` check (`src/routes/public/assets/[id].ts:27`).
3. **Cross-Origin Browser -> Credentialed API**: Configured with `cors({ origin: true, credentials: true })` (`src/index.ts:37-40`).
4. **Network Peer -> Socket.IO Encoder Control Plane**: Attached via `new Server(httpServer)` (`src/lib/encoders.socket.io.ts:190`) with no authentication middleware in source.
5. **API / Signed-URL Caller -> Host Filesystem & Child Processes (`ffmpeg`/`ffprobe`)**: `Local.resolve` checks `path.includes('..')` (`src/lib/Storage/Local.ts:34`); `File.path` (`src/model/File/index.ts:68-70`), thumbnail `:ss`, and subtitle paths rely on route parameter structure or `getDocument` ObjectId validation (`src/lib/express-helpers.ts:82`).

## 6. Repository-Relative Starting Paths
- `src/index.ts`, `src/config.ts`, `src/lib/security.ts`, `src/lib/express-helpers.ts`, `src/lib/crud.ts`
- `src/routes/auth/google.ts`, `src/routes/sign.ts`, `src/routes/me.ts`, `src/routes/assets.json.ts`, `src/routes/public/assets/[id].ts`
- `src/routes/[model]/index.ts`, `src/routes/[model]/[id].ts`, `src/routes/[model]/count.ts`, `src/routes/[model]/distinct/index.ts`, `src/routes/[model]/distinct/[path].ts`
- `src/routes/files/[id]/upload.ts`, `src/routes/files/[id]/download.ts`, `src/routes/files/[id]/encode.ts`, `src/routes/files/[id]/preview.ts`, `src/routes/files/[id]/convert.vtt.ts`, `src/routes/files/[id]/assign.ts`, `src/routes/files/[id]/ffprobe.ts`
- `src/routes/assets/[id]/stream.ts`, `src/routes/assets/[id]/keyinfo.ts`, `src/routes/assets/[id]/share.ts`, `src/routes/assets/[id]/download.ts`, `src/routes/assets/[id]/subtitles/[language].ts`, `src/routes/assets/[id]/thumbnail/[ss].png.ts`, `src/routes/assets/[id]/thumbnail/frame0.webp.ts`
- `src/lib/encoders.socket.io.ts`, `src/lib/encode.ts`, `src/lib/ffmpeg.ts`, `src/lib/subtitles.ts`, `src/lib/UploadQueue.ts`, `src/lib/Storage/Local.ts`, `src/lib/Storage/Bunny.ts`, `src/lib/CDN/Bunny.ts`
- `src/model/Asset/index.ts`, `src/model/File/index.ts`, `src/model/Job/index.ts`, `docker/prod/Dockerfile`, `docker-compose.yml`

## 7. Prior Coverage Gaps and Exclusions
No prior audit runs exist for this repository (`prior_status: "none"` for all seeded units).

## 8. Companion Selection Summary
- `WEB-PROTOCOL-AND-AUTH.md`: Selected for HTTP `security()` middleware, HMAC signed URLs, JWT/OAuth2 login, CORS, and `trust proxy`.
- `PROTOCOLS-RPC-AND-MESSAGING.md`: Selected for the Socket.IO encoder server and outbound webhooks.
- `DATA-ISOLATION-AND-LIFECYCLE.md`: Selected for public/private asset isolation, HLS encryption key exposure, signed URLs, and asset/file deletion lifecycle.
- `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`: Selected for regex/query amplification, in-memory preview buffering, temp file leaks, and uncaught error/hang paths.
- `CLOUD-AND-DEPLOYMENT.md`: Selected for Docker/Compose configurations, environment/secret precedence, and Bunny Storage/CDN integration.
