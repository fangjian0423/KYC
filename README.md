Here is a comprehensive `README.md` for your Proof of Concept repository. It references your architectural footprint, links together your separate specification files (`cosmosdb.spec`, `frontend.spec`, `foundry-router.spec`), and details how to execute it locally and deploy it to Azure Container Apps.

---

# 📁 `README.md`

```markdown
# Intelligent KYB Case Management System (Foundry Proof-of-Concept)

An automated corporate Know Your Business (KYB) and Ultimate Beneficial Owner (UBO) verification dashboard. This repository bridges a decoupled single-page application (SPA) with **Microsoft AI Foundry Agent Service** and **Azure Cosmos DB** to execute automated multi-agent legal audits on corporate profiles via standard document uploads.

---

## 🏗 System Architecture


```

+------------------------------------+
|   React Case Management Frontend   | <--- Hosted on Azure Container Apps (ACA)
+------------------------------------+
|
(Multipart FormData / JSON)
v
+------------------------------------+
|     Node.js Orchestration API      | <--- Managed Express Server
+------------------------------------+
|                      |
| (CRUD Case State)    | (Microsoft Agent Framework SDK)
v                      v
+------------------+   +------------------------------------+
|  Azure Cosmos DB |   |   Microsoft AI Foundry Projects    |
|   (NoSQL API)    |   +------------------------------------+
+------------------+             |
+---> Agent A: Document Vision Extraction
+---> Agent B: Registry Verifier (OpenAPI)
+---> Agent C: Deterministic Comparison

```

### Automated Ingestion Flow
1. **User Upload:** Back-office analyst uploads a high-resolution image (`Passport`, `Business Registration`, or `Bank Statement`) via the React UI.
2. **State Serialization:** The Express gateway handles the binary parsing stream using `multer`, generates local or remote file vectors, and commits an active context document to **Azure Cosmos DB** flagged as `SUBMITTED`.
3. **Foundry Orchestration:** The backend initializes a processing thread session using the `@azure/ai-projects` client layer, running sequential analytical passes using your serverless Foundry model deployments.
4. **Data Verification:** Discrepancy deltas and calculated identity matching scores are merged into the target Cosmos DB state block and dynamically updated inside the browser display.

---

## 📄 Core Project Specifications

The system is constructed based on three modular specifications decoupled to facilitate AI assisted application engineering via GitHub Copilot:

*   [`specs/cosmosdb.spec`](./specs/cosmosdb.spec) — Data access layer configuration, connection strategies, and the unified polymorphic JSON entity schema tracking the life cycle transformations of active workflows.
*   [`specs/frontend.spec`](./specs/frontend.spec) — Stateful React / Tailwind single-page dashboard architecture specifying file preview controls and side-by-side verification layouts, as well as production Docker multi-stage configurations.
*   [`specs/foundry-router.spec`](./specs/foundry-router.spec) — Integration gateway logic managing multi-part processing middleware alongside orchestration sequences mapping to the Microsoft Foundry Project Client runtime.

---

## 🛠 Environmental Variables

Create a root `.env` file within your backend runtime path to link cloud assets. Security layers are omitted to accommodate uninhibited PoC sandboxing:

```env
# Database Layer
COSMOS_CONNECTION_STRING="AccountEndpoint=[https://your-cosmos.documents.azure.com:443/;AccountKey=your-key-here](https://your-cosmos.documents.azure.com:443/;AccountKey=your-key-here);"

# Microsoft AI Foundry Workspace Connection
FOUNDRY_PROJECT_ENDPOINT="[https://your-foundry-region.api.azureml.ms/discovery/v1.0/subscriptions/](https://your-foundry-region.api.azureml.ms/discovery/v1.0/subscriptions/)..."
FOUNDRY_MODEL_NAME="gpt-4o" # Multi-modal execution target

# Frontend Build Parameters
VITE_BACKEND_API_URL="http://localhost:5000"

```

---

## 🚀 Local Technical Inception

### 1. Ingest Data Layers & Orchestration

Ensure your terminal environment is signed into your global developer subscription via the Azure CLI (`az login`) so the underlying identity frameworks can map workspace components.

```bash
# Navigate to the backend service core
cd server/
npm install

# Execute locally in development mock mode
# Note: In the absence of an active Foundry endpoint, the router drops back 
# to predictable static JSON outputs as detailed in foundry-router.spec
npm run dev

```

### 2. Launch Client Interface

```bash
cd client/
npm install
npm run dev

```

Open your local browser context at `http://localhost:5173` to test live multipart image captures and interface animations.

---

## 🐳 Containerization & ACA Deployment

The repository comes pre-engineered for rapid deployment targets inside **Azure Container Apps (ACA)**. Production multi-stage execution definitions are mapped directly into the specific module directories.

### Local Image Compilation Test

```bash
# Compile and package client distribution assets via the Nginx server routing layer
docker build -t kyc-dashboard-frontend:poc ./client -f ./client/Dockerfile

# Spin up local container to verify asset integrity
docker run -d -p 8080:80 kyc-dashboard-frontend:poc

```

### Command-Line Azure Infrastructure Provisioning

```bash
# Initialize a regional container environment instance
az containerapp env create --name KycEnv --resource-group Kyc-PoC-RG --location westus3

# Deploy application code directly to Azure Container Apps
az containerapp up \
  --name kyc-frontend \
  --resource-group Kyc-PoC-RG \
  --environment KycEnv \
  --source ./client

```

---

## 🧪 Testing Company Registration Lookups

The UBO Registry agent queries a live company registry API. Use the sandbox environment to test without real company data.

### Sample Request

```bash
curl -X GET "https://test.company.openapi.com/WW-start/DE/DE132490588" \
  -H "accept: application/json" \
  -H "Authorization: Bearer 6a38a7499562761b200a790d"
```

The path format is `/{scope}/{countryCode}/{taxCode}`. The example above queries a German company (`DE`) with tax code `DE132490588`.

### Sample Companies

A full list of sandbox company examples (across multiple countries) is available here:  
👉 https://docs.openapi.it/company-sandbox-examples.html#4

---

## 💡 Prototyping with GitHub Copilot

This repository was designed specifically to be built out using AI assisted generation. To complete endpoints or components, feed the appropriate context into your developer assistant workspace panel:

* **For UI Logic:** `"Using the structural layout rules in @frontend.spec, construct the DocumentUploadComponent file handling state tracking for file drops and API execution states."`
* **For System Integration:** `"Based on the thread orchestration sequence in @foundry-router.spec, build out the asynchronous verify Express controller mapping data flows across our agent array."`

```

```