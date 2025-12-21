# Architecture Deep Dive

## Layer Architecture

The ACK Bridge pattern uses a layered architecture to provide platform abstractions:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LAYER 4: USER API                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  TubiLambdaService / TubiService / TubiPostgres                         ││
│  │  - Simple, opinionated user-facing APIs                                 ││
│  │  - Declare intent, not implementation                                   ││
│  │  - Platform team controls underlying resources                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LAYER 3: KRO COMPOSITION                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ResourceGraphDefinition (RGD)                                          ││
│  │  - Composes resources as a DAG                                          ││
│  │  - CEL expressions for dynamic values                                   ││
│  │  - Generates CRD automatically                                          ││
│  │  - Manages lifecycle and drift detection                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│  LAYER 2A: ACK CRDS     │ │  LAYER 2B: BRIDGE CRDS  │ │  LAYER 2C: K8S NATIVE   │
│                         │ │                         │ │                         │
│  - Function             │ │  - APIGatewayDomain     │ │  - Deployment           │
│  - API                  │ │  - LambdaPermission     │ │  - Service              │
│  - Stage                │ │  - (extensible)         │ │  - ConfigMap            │
│  - Route                │ │                         │ │  - Secret               │
│  - Integration          │ │                         │ │  - Ingress              │
│  - Bucket               │ │                         │ │  - HPA                  │
│  - Table                │ │                         │ │  - PDB                  │
│  - Certificate          │ │                         │ │                         │
│  - DomainName           │ │                         │ │                         │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
          │                           │                           │
          ▼                           ▼                           │
┌─────────────────────────┐ ┌─────────────────────────┐          │
│  LAYER 1A: ACK CTRL     │ │  LAYER 1B: BRIDGE CTRL  │          │
│                         │ │                         │          │
│  - lambda-controller    │ │  - ack-bridge           │          │
│  - apigatewayv2-ctrl    │ │                         │          │
│  - acm-controller       │ │  Capabilities:          │          │
│  - route53-controller   │ │  - Direct AWS API       │          │
│  - s3-controller        │ │  - UPSERT semantics     │          │
│  - dynamodb-controller  │ │  - Status aggregation   │          │
│                         │ │  - Complex workflows    │          │
└─────────────────────────┘ └─────────────────────────┘          │
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER 0: INFRASTRUCTURE                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  AWS                                          Kubernetes                ││
│  │  - Lambda                                    - Control Plane            ││
│  │  - API Gateway                               - Nodes                    ││
│  │  - ACM                                       - etcd                     ││
│  │  - Route53                                   - CoreDNS                  ││
│  │  - S3, DynamoDB, RDS, etc.                   - CNI                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Resource Creation Flow

```
User applies TubiLambdaService
            │
            ▼
┌───────────────────────┐
│  KRO Controller       │
│  - Validates schema   │
│  - Resolves DAG       │
│  - Creates resources  │
└───────────────────────┘
            │
            ├──────────────────────────────────────┐
            │                                      │
            ▼                                      ▼
┌───────────────────────┐              ┌───────────────────────┐
│  ACK Resources        │              │  Bridge Resources     │
│  - Function           │              │  - APIGatewayDomain   │
│  - API                │              │  - LambdaPermission   │
│  - Stage, Route, etc. │              │                       │
└───────────────────────┘              └───────────────────────┘
            │                                      │
            ▼                                      ▼
┌───────────────────────┐              ┌───────────────────────┐
│  ACK Controllers      │              │  Bridge Controller    │
│  - Create AWS res.    │              │  - Create ACK res.    │
│  - Sync status        │              │  - Direct AWS calls   │
│                       │              │  - Aggregate status   │
└───────────────────────┘              └───────────────────────┘
            │                                      │
            └──────────────────┬───────────────────┘
                               ▼
                    ┌───────────────────────┐
                    │  AWS APIs             │
                    │  - CreateFunction     │
                    │  - CreateDomainName   │
                    │  - ChangeRecordSets   │
                    └───────────────────────┘
```

### Status Propagation Flow

```
AWS Resource State Changes
            │
            ▼
┌───────────────────────┐
│  ACK Controllers      │
│  - Poll AWS status    │
│  - Update CRD status  │
└───────────────────────┘
            │
            ├─────────────────┐
            ▼                 ▼
┌───────────────────┐ ┌───────────────────────┐
│  ACK CRD Status   │ │  Bridge Controller    │
│  {                │ │  - Watch ACK status   │
│    ackResource..  │ │  - Query AWS direct   │
│    arn: "..."     │ │  - Aggregate status   │
│    endpoint: ".." │ │                       │
│  }                │ │                       │
└───────────────────┘ └───────────────────────┘
                              │
                              ▼
                    ┌───────────────────────┐
                    │  Bridge CRD Status    │
                    │  {                    │
                    │    ready: true        │
                    │    conditions: [...]  │
                    │    endpoint: "..."    │
                    │  }                    │
                    └───────────────────────┘
                              │
                              ▼
                    ┌───────────────────────┐
                    │  KRO Controller       │
                    │  - Watch child status │
                    │  - Evaluate readyWhen │
                    │  - Update parent      │
                    └───────────────────────┘
                              │
                              ▼
                    ┌───────────────────────┐
                    │  KRO Instance Status  │
                    │  {                    │
                    │    state: ACTIVE      │
                    │    conditions: [...]  │
                    │    httpEndpoint: ".." │
                    │  }                    │
                    └───────────────────────┘
```

## Reconciliation Model

### ACK Reconciliation (Level-Triggered)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        ACK RECONCILIATION MODEL                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Watch: CRD instance created/modified/deleted                           │
│  2. Desired State: Read spec from CRD                                      │
│  3. Current State: Query AWS API                                           │
│  4. Diff: Compare desired vs current                                       │
│  5. Action: CREATE / UPDATE / DELETE AWS resource                          │
│  6. Status: Update CRD status from AWS response                            │
│  7. Requeue: Based on sync period or error                                 │
│                                                                             │
│  Problems:                                                                  │
│  - CREATE-only semantics for some resources                                │
│  - Finalizers block when AWS unreachable                                   │
│  - Some AWS attributes not exposed in status                               │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Bridge Reconciliation (Multi-Phase)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       BRIDGE RECONCILIATION MODEL                           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1: CERTIFICATE                                                      │
│  ├─ Discover/Create/Validate certificate                                   │
│  ├─ If PENDING_VALIDATION → create DNS records → requeue(30s)              │
│  └─ If ISSUED → proceed to Phase 2                                         │
│                                                                             │
│  Phase 2: DOMAIN_NAME                                                      │
│  ├─ Create ACK DomainName resource                                         │
│  ├─ If not ready → requeue(15s)                                            │
│  ├─ If "already exists" terminal → query AWS directly                      │
│  └─ If ready → proceed to Phase 3                                          │
│                                                                             │
│  Phase 3: API_MAPPING                                                      │
│  ├─ Create ACK APIMapping resource                                         │
│  ├─ If not ready → requeue(15s)                                            │
│  └─ If ready → proceed to Phase 4                                          │
│                                                                             │
│  Phase 4: DNS                                                              │
│  ├─ Query AWS for regional endpoint (not in ACK status)                    │
│  ├─ UPSERT CNAME record via direct Route53 API                             │
│  └─ If success → proceed to Final                                          │
│                                                                             │
│  Final: UPDATE STATUS                                                      │
│  ├─ Set ready=true                                                         │
│  ├─ Set all conditions to True                                             │
│  └─ Requeue(300s) for drift detection                                      │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

## State Machine

```
                                    ┌──────────────┐
                                    │   CREATED    │
                                    └──────┬───────┘
                                           │
                                           ▼
                          ┌────────────────────────────────┐
                          │     CERTIFICATE_RESOLVING     │
                          └────────────────┬───────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
          ┌──────────────────────┐               ┌──────────────────────┐
          │ CERTIFICATE_PENDING  │               │  CERTIFICATE_READY   │
          │   (DNS validation)   │               │                      │
          └──────────┬───────────┘               └──────────┬───────────┘
                     │                                      │
                     └──────────────┬───────────────────────┘
                                    ▼
                          ┌────────────────────────────────┐
                          │       DOMAIN_CREATING         │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────┐
                          │        DOMAIN_READY           │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────┐
                          │       MAPPING_CREATING        │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────┐
                          │        MAPPING_READY          │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────┐
                          │        DNS_CREATING           │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────┐
                          │           READY               │
                          └────────────────────────────────┘
```

## Error Handling Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          ERROR HANDLING STRATEGY                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TRANSIENT ERRORS (Retry with backoff)                                     │
│  ├─ AWS API throttling                                                     │
│  ├─ Network timeouts                                                       │
│  ├─ Resource not yet ready                                                 │
│  └─ Action: Requeue with exponential backoff (15s → 30s → 60s → ...)       │
│                                                                             │
│  RECOVERABLE ERRORS (Fix and retry)                                        │
│  ├─ "Resource already exists" → Use existing resource                      │
│  ├─ "Conflict" in APIMapping → Proceed if AWS resource exists              │
│  ├─ Missing dependent resource → Wait for it                               │
│  └─ Action: Update status with condition, requeue                          │
│                                                                             │
│  TERMINAL ERRORS (User intervention required)                              │
│  ├─ Invalid certificate ARN                                                │
│  ├─ Hosted zone not found                                                  │
│  ├─ Permission denied                                                      │
│  └─ Action: Set Degraded condition, don't requeue frequently               │
│                                                                             │
│  CLEANUP ERRORS (Best effort)                                              │
│  ├─ AWS resource already deleted                                           │
│  ├─ Permission revoked                                                     │
│  └─ Action: Log warning, continue cleanup, remove finalizer                │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

## Security Model

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           SECURITY ARCHITECTURE                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  KUBERNETES RBAC                                                           │
│  ├─ Bridge operator ServiceAccount                                         │
│  ├─ ClusterRole for watching/managing CRDs                                 │
│  ├─ Role per namespace for resource creation                               │
│  └─ Users: read-only access to status                                      │
│                                                                             │
│  AWS IAM (via IRSA)                                                        │
│  ├─ Route53: ChangeResourceRecordSets, ListHostedZones                     │
│  ├─ ACM: DescribeCertificate, ListCertificates                             │
│  ├─ API Gateway: GetDomainName, GetApiMapping                              │
│  ├─ Lambda: GetFunction, AddPermission, RemovePermission                   │
│  └─ Scoped to specific resources where possible                            │
│                                                                             │
│  NETWORK POLICIES                                                          │
│  ├─ Bridge operator → kube-apiserver                                       │
│  ├─ Bridge operator → AWS endpoints (via NAT/VPN)                          │
│  └─ Deny all other egress                                                  │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```
