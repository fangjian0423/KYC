# ─────────────────────────────────────────────────────────────────────────────
# KYC — one-shot deployment to Azure Container Apps
#   1. Create resource group + ACR
#   2. Build & push backend/frontend images (ACR build — no local Docker needed)
#   3. Deploy infra (main.bicep): ACA env, backend (internal), frontend (public),
#      Cosmos, Storage, App Insights, Managed Identity + Storage RBAC
#   4. Grant the backend Managed Identity access to the Foundry project (RBAC)
#
# Prereqs: az CLI logged in (az login) with rights to create resources + assign roles.
# Usage (PowerShell) — defaults are pre-filled for the 'jimmy' / 'jimmy-test' setup:
#   ./deploy.ps1
# Or override any value, e.g.:
#   ./deploy.ps1 -ResourceGroup kyc-rg -Location eastus `
#       -RegistryApiKey "<sandbox-key>" -RegistryEmail "you@example.com"
# ─────────────────────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
    [string]$ResourceGroup = 'jimmy',
    [string]$Location = 'westus3',
    [string]$NamePrefix = 'kyc',
    # Azure subscription (name or ID) to deploy into.
    [string]$Subscription = 'edd0c578-a7c3-4a61-9536-63273eb9bc9b',
    [string]$FoundryProjectEndpoint = 'https://jimmy-test.services.ai.azure.com/api/projects/proj-default',
    [string]$FoundryModelName = 'gpt-5.4',
    # Full resource ID of the Foundry (Azure AI/Cognitive Services) account, so the
    # backend Managed Identity can be granted the "Azure AI Developer" role. Optional
    # (skip to run the mock pipeline).
    [string]$FoundryResourceId = '/subscriptions/edd0c578-a7c3-4a61-9536-63273eb9bc9b/resourceGroups/jimmy/providers/Microsoft.CognitiveServices/accounts/jimmy-test',
    [string]$RegistryApiKey = '',
    [string]$RegistryEmail = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$acrName = ($NamePrefix + 'acr' + ((Get-Random -Maximum 99999).ToString())).ToLower()

# az failures are non-terminating in PowerShell; check $LASTEXITCODE and abort.
function Assert-LastExit([string]$What) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "xx Failed: $What (exit $LASTEXITCODE). Aborting." -ForegroundColor Red
        if ($What -like '*subscription*' -or $What -like '*resource group*') {
            Write-Host "   If this is an auth error, run: az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47" -ForegroundColor Yellow
        }
        exit 1
    }
}

Write-Host "==> Selecting subscription $Subscription" -ForegroundColor Cyan
az account set --subscription $Subscription
Assert-LastExit 'set subscription'

Write-Host "==> Resource group $ResourceGroup ($Location)" -ForegroundColor Cyan
az group create -n $ResourceGroup -l $Location | Out-Null
Assert-LastExit 'create resource group'

Write-Host "==> Azure Container Registry $acrName" -ForegroundColor Cyan
az acr create -g $ResourceGroup -n $acrName --sku Basic --admin-enabled true | Out-Null
Assert-LastExit 'create ACR'
$loginServer = az acr show -g $ResourceGroup -n $acrName --query loginServer -o tsv
Assert-LastExit 'read ACR login server'

$backendImage = "$loginServer/kyc-backend:latest"
$frontendImage = "$loginServer/kyc-frontend:latest"

Write-Host "==> Building backend image (ACR build)" -ForegroundColor Cyan
az acr build -r $acrName -t $backendImage "$root/server"
Assert-LastExit 'build backend image'

Write-Host "==> Building frontend image (ACR build)" -ForegroundColor Cyan
az acr build -r $acrName -t $frontendImage "$root/client"
Assert-LastExit 'build frontend image'

Write-Host "==> Deploying infrastructure (main.bicep)" -ForegroundColor Cyan
$deployment = az deployment group create `
    -g $ResourceGroup `
    -f "$PSScriptRoot/main.bicep" `
    -p namePrefix=$NamePrefix `
    -p acrName=$acrName `
    -p backendImage=$backendImage `
    -p frontendImage=$frontendImage `
    -p foundryProjectEndpoint=$FoundryProjectEndpoint `
    -p foundryModelName=$FoundryModelName `
    -p registryApiKey=$RegistryApiKey `
    -p registryEmail=$RegistryEmail `
    -o json | ConvertFrom-Json
Assert-LastExit 'deploy infrastructure'

$backendPrincipalId = $deployment.properties.outputs.backendPrincipalId.value
$frontendUrl = $deployment.properties.outputs.frontendUrl.value

# ── Grant the backend Managed Identity access to the Foundry project ─────────
if ($FoundryResourceId -and $backendPrincipalId) {
    Write-Host "==> Assigning 'Azure AI Developer' to backend identity on Foundry" -ForegroundColor Cyan
    az role assignment create `
        --assignee-object-id $backendPrincipalId `
        --assignee-principal-type ServicePrincipal `
        --role "Azure AI Developer" `
        --scope $FoundryResourceId | Out-Null
}
else {
    Write-Host "!! FoundryResourceId not provided — skipping Foundry RBAC." -ForegroundColor Yellow
    Write-Host "   Backend will run the mock pipeline until you assign a role and set the endpoint." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Frontend URL: $frontendUrl" -ForegroundColor Green
Write-Host "Backend is internal-only; the frontend nginx proxies /api to it." -ForegroundColor Green
