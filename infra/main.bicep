// ─────────────────────────────────────────────────────────────────────────────
// KYC — Azure Container Apps deployment
//   • Frontend Container App  : external ingress (public), nginx SPA + /api proxy
//   • Backend  Container App  : INTERNAL ingress only, Node/Express orchestrator
//   • Cosmos DB (SQL API)     : case persistence (connection string as secret)
//   • Storage Account + Blob  : uploaded document images
//   • Log Analytics + App Insights : tracing/observability
//   • ACR                     : image registry
// Backend authenticates to Foundry / Storage / Cosmos-RBAC via system-assigned
// Managed Identity (no keys in code). Image pull uses ACR admin creds (secret).
// ─────────────────────────────────────────────────────────────────────────────

@description('Deployment location.')
param location string = resourceGroup().location

@description('Short prefix for resource names (lowercase letters/numbers).')
@minLength(3)
@maxLength(12)
param namePrefix string = 'kyc'

@description('Backend container image (e.g. myacr.azurecr.io/kyc-backend:latest).')
param backendImage string

@description('Frontend container image (e.g. myacr.azurecr.io/kyc-frontend:latest).')
param frontendImage string

@description('Existing Azure Container Registry name (login server host is <name>.azurecr.io).')
param acrName string

@description('Foundry project endpoint. Leave empty to run the built-in mock pipeline.')
param foundryProjectEndpoint string = ''

@description('Foundry chat model deployment name.')
param foundryModelName string = 'gpt-5.4'

@description('openapi.it registry API key (sandbox/prod).')
@secure()
param registryApiKey string = ''

@description('openapi.it account email.')
param registryEmail string = ''

@description('Operator access code for protected Registry Studio and deployment APIs.')
@secure()
param platformAdminKey string = ''

@description('Enable the allowlisted self-service ARM deployment API.')
param enableSelfServiceDeployment bool = false

@description('Friendly environment label shown in Deployment Center.')
param deploymentEnvironmentName string = 'production'

@description('Create application data-plane role assignments. Runtime redeployments set this false because Contributor cannot write RBAC.')
param includeRoleAssignments bool = true

var suffix = uniqueString(resourceGroup().id)
var cosmosDbName = 'KycCaseManagement'
var cosmosContainerName = 'Cases'
var platformContainerName = 'PlatformConfig'
var storageContainerName = 'kyc-documents'

// ── Log Analytics + Application Insights ─────────────────────────────────────
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-ai-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ── Existing ACR (created by deploy.ps1 before this template) ────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

// ── Storage account + blob container ─────────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: toLower('${namePrefix}st${take(suffix, 8)}')
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource docsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: storageContainerName
  properties: { publicAccess: 'None' }
}

// ── Cosmos DB (SQL API) ──────────────────────────────────────────────────────
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: '${namePrefix}-cosmos-${suffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [
      { locationName: location, failoverPriority: 0, isZoneRedundant: false }
    ]
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: cosmosDbName
  properties: {
    resource: { id: cosmosDbName }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: cosmosContainerName
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

resource platformContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: platformContainerName
  properties: {
    resource: {
      id: platformContainerName
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

// ── Container Apps environment ───────────────────────────────────────────────
resource caeEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env-${suffix}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

// ── Backend Container App (INTERNAL ingress only) ────────────────────────────
resource backend 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-backend'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: caeEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false          // internal-only: not reachable from the public internet
        targetPort: 5000
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'registry-api-key', value: registryApiKey }
        { name: 'platform-admin-key', value: platformAdminKey }
        { name: 'appinsights-connection-string', value: appInsights.properties.ConnectionString }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'PORT', value: '5000' }
            { name: 'FOUNDRY_PROJECT_ENDPOINT', value: foundryProjectEndpoint }
            { name: 'FOUNDRY_MODEL_NAME', value: foundryModelName }
            { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
            { name: 'COSMOS_DATABASE_NAME', value: cosmosDbName }
            { name: 'COSMOS_CONTAINER_NAME', value: cosmosContainerName }
            { name: 'COSMOS_PLATFORM_CONTAINER_NAME', value: platformContainerName }
            { name: 'STORAGE_ACCOUNT_NAME', value: storage.name }
            { name: 'STORAGE_CONTAINER_NAME', value: storageContainerName }
            { name: 'REGISTRY_API_KEY', secretRef: 'registry-api-key' }
            { name: 'REGISTRY_EMAIL', value: registryEmail }
            { name: 'REGISTRY_BASE_URL', value: 'https://test.company.openapi.com' }
            { name: 'REGISTRY_ALLOWED_HOSTS', value: 'test.company.openapi.com,company.openapi.com' }
            { name: 'PLATFORM_ADMIN_KEY', secretRef: 'platform-admin-key' }
            { name: 'DEPLOYMENT_ENABLED', value: string(enableSelfServiceDeployment) }
            { name: 'DEPLOYMENT_ENVIRONMENT_NAME', value: deploymentEnvironmentName }
            { name: 'DEPLOYMENT_LOCATION', value: location }
            { name: 'DEPLOYMENT_NAME_PREFIX', value: namePrefix }
            { name: 'DEPLOYMENT_BACKEND_IMAGE', value: backendImage }
            { name: 'DEPLOYMENT_FRONTEND_IMAGE', value: frontendImage }
            { name: 'AZURE_SUBSCRIPTION_ID', value: subscription().subscriptionId }
            { name: 'AZURE_RESOURCE_GROUP', value: resourceGroup().name }
            { name: 'AZURE_ACR_NAME', value: acrName }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection-string' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// ── Frontend Container App (external ingress) ────────────────────────────────
resource frontend 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-frontend'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: caeEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            // nginx reverse-proxies /api/* to the internal backend over HTTPS.
            { name: 'BACKEND_URL', value: 'https://${backend.properties.configuration.ingress.fqdn}' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// ── RBAC: backend MI → Storage Blob Data Contributor on the storage account ──
var blobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
resource backendBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (includeRoleAssignments) {
  name: guid(storage.id, backend.id, blobContributorRoleId)
  scope: storage
  properties: {
    principalId: backend.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobContributorRoleId)
    principalType: 'ServicePrincipal'
  }
}

// ── RBAC: backend MI → Cosmos DB Built-in Data Contributor (data plane) ──────
// Required because the account enforces AAD-only (local/key auth disabled).
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'
resource backendCosmosDataRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = if (includeRoleAssignments) {
  parent: cosmos
  name: guid(cosmos.id, backend.id, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: backend.identity.principalId
    scope: cosmos.id
  }
}

output frontendUrl string = 'https://${frontend.properties.configuration.ingress.fqdn}'
output backendInternalFqdn string = backend.properties.configuration.ingress.fqdn
output backendPrincipalId string = backend.identity.principalId
output storageAccountName string = storage.name
