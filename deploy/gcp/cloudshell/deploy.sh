#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SPOT — Deploy to Google Cloud Run via Cloud Shell
#
# This is the simplest deployment method. No local installation required.
#
# Prerequisites:
#   - A GCP project with billing enabled
#   - Your account must be a project Owner
#
# Usage (in Cloud Shell):
#   1. Open https://shell.cloud.google.com
#   2. Clone your fork:  git clone https://github.com/YOUR_TEAM/SPOT.git
#   3. Run:  cd SPOT/deploy/gcp/cloudshell && chmod +x deploy.sh && ./deploy.sh
#
# Cloud Shell provides gcloud pre-installed and pre-authenticated.
# After deploy, visit the Cloud Run URL → /setup to configure the app.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# ---------- Pre-flight checks ----------
command -v gcloud &>/dev/null || { echo "ERROR: gcloud not found. Are you running this in Cloud Shell?"; exit 1; }

GCLOUD_VERSION=$(gcloud version 2>/dev/null | head -1 | awk '{print $NF}')
if [ "$(printf '%s\n' "410.0.0" "${GCLOUD_VERSION}" | sort -V | head -n1)" != "410.0.0" ]; then
  echo "ERROR: gcloud CLI v410.0.0+ required (you have ${GCLOUD_VERSION}). Run: gcloud components update"
  exit 1
fi

# ---------- Authentication (auto-detect, prompt if needed) ----------
CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)
if [ -z "${CURRENT_ACCOUNT}" ] || [ "${CURRENT_ACCOUNT}" = "(unset)" ]; then
  echo ">>> Not logged in. Opening browser to authenticate..."
  gcloud auth login --brief
  CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
fi
echo "    Authenticated as: ${CURRENT_ACCOUNT}"

# ---------- Project selection (auto-detect, prompt if needed) ----------
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
if [ -z "${PROJECT_ID}" ] || [ "${PROJECT_ID}" = "(unset)" ]; then
  echo ""
  echo "No GCP project set. Your available projects:"
  gcloud projects list --format="table(projectId, name)" 2>/dev/null || true
  echo ""
  read -rp "Enter your GCP Project ID: " PROJECT_ID
  if [ -z "${PROJECT_ID}" ]; then
    echo "ERROR: Project ID is required."
    exit 1
  fi
  gcloud config set project "${PROJECT_ID}"
fi

REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-spot}"
CONFIG_BUCKET="${CONFIG_BUCKET:-${PROJECT_ID}-spot-config}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo ""
echo "=== SPOT Cloud Shell Deployment ==="
echo "Project: ${PROJECT_ID} | Region: ${REGION} | Service: ${SERVICE_NAME}"
echo ""

# Clean up build files on exit (even if script fails)
trap 'rm -f "${PROJECT_ROOT}/Dockerfile" "${PROJECT_ROOT}/.dockerignore"' EXIT

# ---------- Step 1: Enable required APIs ----------
echo ">>> Step 1: Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com \
  storage.googleapis.com artifactregistry.googleapis.com \
  --quiet

# ---------- Step 2: Wait for service accounts ----------
echo ">>> Step 2: Waiting for service accounts to be provisioned..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for i in $(seq 1 12); do
  gcloud iam service-accounts describe "${COMPUTE_SA}" --project="${PROJECT_ID}" &>/dev/null && break
  [ "$i" -eq 12 ] && { echo "ERROR: Timed out. Is billing linked? https://console.cloud.google.com/billing"; exit 1; }
  echo "    Waiting... (attempt ${i}/12)"
  sleep 10
done
echo "    Service accounts ready."

# ---------- Step 3: Grant permissions ----------
echo ">>> Step 3: Granting IAM permissions..."

# Current user: Cloud Build, Storage, Cloud Run, and Service Account usage
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="user:${CURRENT_ACCOUNT}" --role="roles/cloudbuild.builds.editor" --quiet >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="user:${CURRENT_ACCOUNT}" --role="roles/storage.admin" --quiet >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="user:${CURRENT_ACCOUNT}" --role="roles/run.admin" --quiet >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="user:${CURRENT_ACCOUNT}" --role="roles/iam.serviceAccountUser" --quiet >/dev/null

# Compute Engine SA: Storage, Artifact Registry, Logging
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${COMPUTE_SA}" --role="roles/storage.admin" --quiet >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${COMPUTE_SA}" --role="roles/artifactregistry.admin" --quiet >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${COMPUTE_SA}" --role="roles/logging.logWriter" --quiet >/dev/null

# Cloud Build SA: Storage, Artifact Registry
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/storage.admin" --quiet >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/artifactregistry.writer" --quiet >/dev/null

echo "    All permissions granted. Waiting 60s for IAM propagation..."
sleep 60

# ---------- Step 4: Create Artifact Registry repository ----------
echo ">>> Step 4: Creating Artifact Registry repository..."
if ! gcloud artifacts repositories describe gcr.io --location=us --project="${PROJECT_ID}" &>/dev/null; then
  gcloud artifacts repositories create gcr.io \
    --repository-format=docker --location=us --project="${PROJECT_ID}" --quiet
fi

# ---------- Step 5: Create GCS config bucket ----------
echo ">>> Step 5: Creating config bucket..."
if ! gsutil ls -b "gs://${CONFIG_BUCKET}" &>/dev/null; then
  gsutil mb -l "${REGION}" "gs://${CONFIG_BUCKET}"
  [ -d "${PROJECT_ROOT}/config" ] && {
    gsutil -m cp "${PROJECT_ROOT}"/config/*.json "gs://${CONFIG_BUCKET}/"
    gsutil rm "gs://${CONFIG_BUCKET}/config.json" 2>/dev/null || true
  }
fi

# ---------- Step 6: Build container image ----------
echo ">>> Step 6: Building container image..."
cp "${SCRIPT_DIR}/Dockerfile" "${PROJECT_ROOT}/Dockerfile"
cp "${SCRIPT_DIR}/.dockerignore" "${PROJECT_ROOT}/.dockerignore"
cd "${PROJECT_ROOT}"
gcloud builds submit --tag "${IMAGE}" --quiet

# ---------- Step 7: Deploy to Cloud Run ----------
echo ">>> Step 7: Deploying to Cloud Run..."
gsutil iam ch "serviceAccount:${COMPUTE_SA}:objectAdmin" "gs://${CONFIG_BUCKET}"

gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --session-affinity \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --execution-environment gen2 \
  --service-account "${COMPUTE_SA}" \
  --add-volume name=config-vol,type=cloud-storage,bucket="${CONFIG_BUCKET}" \
  --add-volume-mount volume=config-vol,mount-path=/app/config \
  --quiet

# ---------- Done ----------
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" --format="value(status.url)")

echo ""
echo "=== Deployment complete! ==="
echo "Your app is live at: ${SERVICE_URL}"
echo ""
echo "Next steps:"
echo "  1. Visit ${SERVICE_URL} to open the /setup wizard"
echo "  2. Enter your MongoDB connection string, API keys, and access code"
echo "  3. Config will persist automatically in gs://${CONFIG_BUCKET}"
