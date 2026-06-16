# Local Development Environment

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Git | 2.54+ | Pre-installed or https://git-scm.com |
| GitHub CLI (`gh`) | 2.94+ | `winget install --id GitHub.cli` |
| Node.js | 24+ | `winget install --id OpenJS.NodeJS.LTS` |
| Google Cloud SDK (`gcloud`) | 573+ | `winget install --id Google.CloudSDK` |

After installing each tool, restart your terminal for PATH changes to take effect.

## First-Time Setup

### 1. Clone the repo
```powershell
gh repo clone Cassillon-AI/TalentGEO
cd TalentGEO
```

### 2. Install backend dependencies
```powershell
cd backend
npm install
```

### 3. Authenticate with GitHub
```powershell
gh auth login
# Choose: GitHub.com → HTTPS → Login with a web browser
```

### 4. Authenticate with GCP
```powershell
gcloud auth login
gcloud config set project basic-advantage-483301-b4
```

## Running Locally

### Start the backend
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
node backend/server.js
# Runs on http://localhost:8080
```

### Open the frontend
Open `frontend/index.html` directly in your browser. The `BACKEND_URL` constant
auto-detects the environment — no manual changes needed:
- `localhost` or `127.0.0.1` → hits `http://localhost:8080`
- Any other hostname → hits the production Cloud Run backend

## Development Loop

1. Make changes to files locally (backend or frontend)
2. Test in the browser against `http://localhost:8080`
3. Commit and push to `main`:
```powershell
git add .
git commit -m "your message"
git push
```
4. Cloud Build automatically deploys both frontend and backend to Cloud Run

## Architecture

```
Your Machine
├── frontend/index.html     → open in browser
└── backend/server.js       → node backend/server.js (port 8080)
                                      │
                                      ▼
                              Anthropic API (Claude Sonnet)

GitHub (Cassillon-AI/TalentGEO)
└── push to main → Cloud Build → Cloud Run (production)
```

## GCP Resources

| Resource | Value |
|----------|-------|
| Project ID | `basic-advantage-483301-b4` |
| Backend Cloud Run service | `talentgeo-backend` (us-central1) |
| Frontend Cloud Run service | `talentgeo-frontend` (us-central1) |
| Container registry | `gcr.io/basic-advantage-483301-b4/` |
| Cloud Build service account | `360027703478-compute@developer.gserviceaccount.com` |
| Anthropic API key | Stored in GCP Secret Manager as `ANTHROPIC_API_KEY` |

## Notes

- The backend process stops when your terminal closes. Restart it at the beginning of each dev session.
- Never commit the Anthropic API key to the repo — always pass it as an environment variable.
- Do not change the Claude model (`claude-sonnet-4-6`) without confirming cost impact with Jonathon.
- Do not modify the five-dimension audit prompt structure without Jonathon review.
