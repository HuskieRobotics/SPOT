# SPOT — Cloud Shell Deployment (Simplest Method)

Deploy SPOT to Google Cloud Run using only a browser. No local software installation required.

## Prerequisites

1. A Google account
2. A GCP project with billing enabled

## Deploy in 4 Steps

### Step 1: Create a GCP project and enable billing

- Go to [console.cloud.google.com](https://console.cloud.google.com)
- Create a new project (e.g., `frc3061-spot`)
- Link a billing account under **Billing → Link a billing account**

### Step 2: Open Cloud Shell

Click the button below or go to [shell.cloud.google.com](https://shell.cloud.google.com):

[![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://shell.cloud.google.com)

### Step 3: Clone and deploy

In the Cloud Shell terminal, run:

```bash
git clone https://github.com/YOUR_TEAM/SPOT.git
cd SPOT/deploy/gcp/cloudshell
chmod +x deploy.sh
./deploy.sh
```

The script will:
- Auto-detect your Google account (already authenticated in Cloud Shell)
- Prompt you to select a project if not already set
- Enable APIs, grant permissions, build the container, and deploy

### Step 4: Configure your app

Open the URL printed by the script and complete the `/setup` wizard with your MongoDB URL, API keys, and access code.

**That's it — you're scouting!**

## Redeploying after code changes

```bash
cd SPOT/deploy/gcp/cloudshell
./deploy.sh
```

## Customization

```bash
# Change region (default: us-central1)
GCP_REGION=us-east1 ./deploy.sh

# Change service name (default: spot)
CLOUD_RUN_SERVICE=my-team-spot ./deploy.sh
```

## How is this different from deploy/gcp/deploy.sh?

The `deploy/gcp/deploy.sh` script is designed for local deployment from your own machine (requires installing gcloud CLI and running auth commands manually). This Cloud Shell variant has gcloud pre-installed and pre-authenticated, so auth and project selection are handled inline by the script.
