---
name: k8s-ack-bridge
description: Build production-ready Kubernetes platforms using ACK, KRO, and custom bridge operators. Use when users need to orchestrate AWS resources with Kubernetes, build platform abstractions that span ACK and KRO, or implement custom controllers that fill gaps in the ACK/KRO ecosystem.
---

# Kubernetes ACK Bridge Pattern

A comprehensive guide for building production-ready Kubernetes platforms that orchestrate AWS resources using ACK (AWS Controllers for Kubernetes), KRO (Kube Resource Orchestrator), and custom bridge operators.

## When to Use This Skill

Use this skill when the user wants to:

- **Build platform abstractions** that combine multiple AWS resources with Kubernetes
- **Fill gaps between ACK and KRO** where neither provides complete functionality
- **Implement custom Kubernetes operators** that manage AWS resources
- **Design idempotent reconciliation** for AWS resource management
- **Handle complex workflows** like certificate validation, DNS automation, API Gateway setup
- **Create self-service platforms** with proper status reporting and error handling
- **Debug ACK/KRO integration issues** or resource conflicts

## The Problem: Gaps Between ACK and KRO

### What ACK Provides

ACK (AWS Controllers for Kubernetes) gives you:
- Declarative AWS resource management via CRDs
- Automatic reconciliation with AWS APIs
- Status synchronization from AWS to Kubernetes

### What KRO Provides

KRO (Kube Resource Orchestrator) gives you:
- Resource composition into higher-level abstractions
- DAG-based dependency management
- CEL expressions for dynamic configuration
- Automatic CRD generation

### The Gaps Neither Fills

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         THE ACK/KRO GAP                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. IDEMPOTENCY ISSUES                                                   │
│     - ACK uses CREATE semantics, not UPSERT                              │
│     - "Resource already exists" errors on redeploy                       │
│     - No recovery from orphaned AWS resources                            │
│                                                                          │
│  2. DELETION BLOCKING                                                    │
│     - ACK finalizers block when AWS is unreachable                       │
│     - VPN outages = stuck deletions                                      │
│     - Namespace deletion blocked indefinitely                            │
│                                                                          │
│  3. MISSING STATUS FIELDS                                                │
│     - ACK doesn't expose all AWS attributes                              │
│     - DomainName doesn't expose regional endpoint                        │
│     - No way to get data needed for dependent resources                  │
│                                                                          │
│  4. COMPLEX WORKFLOWS                                                    │
│     - Certificate validation + DNS record + wait loop                    │
│     - API Gateway domain + mapping + CNAME                               │
│     - KRO can't do imperative logic                                      │
│                                                                          │
│  5. CROSS-RESOURCE COORDINATION                                          │
│     - Lambda permissions need API Gateway ARN                            │
│     - DNS needs DomainName endpoint (not in ACK status)                  │
│     - Chicken-and-egg dependency problems                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## The Solution: ACK Bridge Pattern

The ACK Bridge pattern introduces a custom operator layer that:

1. **Provides higher-level abstractions** - `APIGatewayDomain` instead of DomainName + APIMapping + RecordSet
2. **Handles imperative operations** - Direct AWS API calls when ACK CRDs fall short
3. **Implements proper idempotency** - UPSERT semantics, graceful conflict handling
4. **Reports aggregated status** - Combines status from multiple underlying resources
5. **Manages complex workflows** - Multi-phase reconciliation with proper ordering

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER LAYER                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  TubiLambdaService (KRO Instance)                                 │  │
│  │  - Simple user-facing API                                         │  │
│  │  - Declares intent: "I want a Lambda with custom domains"         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        KRO COMPOSITION LAYER                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  ResourceGraphDefinition                                          │  │
│  │  - Composes K8s + ACK + Bridge resources                          │  │
│  │  - CEL expressions for dynamic configuration                      │  │
│  │  - DAG-based dependency ordering                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│   ACK RESOURCES      │ │   BRIDGE RESOURCES   │ │   K8S RESOURCES      │
│                      │ │                      │ │                      │
│ - Function (Lambda)  │ │ - APIGatewayDomain   │ │ - Deployment         │
│ - API (HTTP/WS)      │ │ - LambdaPermission   │ │ - Service            │
│ - Integration        │ │ - (Future CRDs)      │ │ - ConfigMap          │
│ - Route              │ │                      │ │ - Secret             │
│ - Stage              │ │                      │ │                      │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
         │                         │                        │
         ▼                         ▼                        │
┌──────────────────────┐ ┌──────────────────────┐          │
│   ACK CONTROLLERS    │ │   BRIDGE OPERATOR    │          │
│                      │ │                      │          │
│ - lambda-controller  │ │ - ack-bridge         │          │
│ - apigatewayv2-ctrl  │ │   (custom operator)  │          │
│ - acm-controller     │ │                      │          │
│ - route53-controller │ │ Provides:            │          │
│                      │ │ - Direct AWS calls   │          │
│                      │ │ - UPSERT semantics   │          │
│                      │ │ - Status aggregation │          │
└──────────────────────┘ └──────────────────────┘          │
         │                         │                        │
         └─────────────────────────┼────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              AWS                                         │
│  Lambda │ API Gateway │ ACM │ Route53 │ DynamoDB │ S3 │ ...             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Idempotent Operations

**Problem:** ACK uses CREATE semantics. Re-applying after deletion causes conflicts.

**Solution:** Use UPSERT semantics for all resource creation.

```rust
// BAD: CREATE-only semantics
api.create(&PostParams::default(), &resource).await?;
// Fails with "already exists" on redeploy

// GOOD: UPSERT semantics
ctx.route53
    .upsert_cname_record(hosted_zone_id, record_name, target, ttl)
    .await?;
// Creates if not exists, updates if exists
```

### 2. Graceful Deletion

**Problem:** ACK finalizers block when AWS is unreachable.

**Solution:** Use `deletion-policy: retain` + explicit cleanup with direct API calls.

```rust
// Add retain policy to ACK resources
fn ack_resource_annotations() -> BTreeMap<String, String> {
    [("services.k8s.aws/deletion-policy".to_string(), "retain".to_string())]
        .into_iter()
        .collect()
}

// Explicit cleanup in finalizer
async fn reconcile_cleanup(domain: Arc<APIGatewayDomain>, ctx: &State) -> Result<Action, Error> {
    // Delete directly via AWS API (idempotent)
    ctx.route53
        .delete_cname_record_by_name(hosted_zone_id, &domain.spec.domain)
        .await?;

    // Then delete ACK resources (won't block due to retain policy)
    delete_ack_resource(ctx, ns, "apigatewayv2.services.k8s.aws", "DomainName", &name).await;

    Ok(Action::await_change())
}
```

### 3. Owner References for Cascade Deletion

**Problem:** Orphaned ACK resources when parent is deleted.

**Solution:** Set owner references on all child resources.

```rust
fn ack_owner_reference(domain: &APIGatewayDomain) -> OwnerReference {
    OwnerReference {
        api_version: "bridge.ack.tubi.internal/v1alpha1".to_string(),
        kind: "APIGatewayDomain".to_string(),
        name: domain.name_any(),
        uid: domain.metadata.uid.clone().unwrap_or_default(),
        controller: Some(true),
        block_owner_deletion: Some(true),
    }
}
```

### 4. Multi-Phase Reconciliation

**Problem:** Complex workflows require ordered execution with status tracking.

**Solution:** Implement phases with conditions and proper requeue logic.

```rust
async fn reconcile_apply(domain: Arc<APIGatewayDomain>, ctx: &State) -> Result<Action, Error> {
    // Phase 1: Certificate
    let cert_arn = resolve_certificate(&domain, ctx).await?;
    if cert_status == "PENDING_VALIDATION" {
        update_status(&api, &name, StatusUpdate::pending_validation(...)).await?;
        return Ok(Action::requeue(Duration::from_secs(30)));
    }

    // Phase 2: DomainName
    create_ack_domain_name(&domain, ctx, ...).await?;
    if !is_domain_name_ready(ctx, ...).await? {
        update_status(&api, &name, StatusUpdate::domain_creating(...)).await?;
        return Ok(Action::requeue(Duration::from_secs(15)));
    }

    // Phase 3: APIMapping
    create_ack_api_mapping(&domain, ctx, ...).await?;
    if !is_api_mapping_ready(ctx, ...).await? {
        update_status(&api, &name, StatusUpdate::mapping_creating(...)).await?;
        return Ok(Action::requeue(Duration::from_secs(15)));
    }

    // Phase 4: DNS (direct AWS call for UPSERT)
    upsert_dns_cname_record(ctx, ...).await?;

    // Final status
    update_status(&api, &name, StatusUpdate::ready(...)).await?;
    Ok(Action::requeue(Duration::from_secs(300)))
}
```

### 5. Condition-Based Status

**Problem:** Users can't see what's happening during reconciliation.

**Solution:** Report detailed conditions following K8s conventions.

```rust
pub struct Condition {
    pub type_: String,      // "CertificateReady", "DomainNameReady", etc.
    pub status: String,     // "True", "False", "Unknown"
    pub reason: String,     // "Issued", "Creating", "Error"
    pub message: String,    // Human-readable explanation
    pub last_transition_time: DateTime<Utc>,
    pub observed_generation: i64,
}

// Status update with multiple conditions
update_status(&api, &name, StatusUpdate {
    ready: false,
    conditions: vec![
        Condition::new("CertificateReady", "True", "Issued", "Certificate is ISSUED", gen),
        Condition::new("DomainNameReady", "False", "Creating", "DomainName is being created", gen),
        Condition::new("Ready", "False", "InProgress", "Waiting for DomainName", gen),
    ],
    ..
}).await?;
```

### 6. Handle Terminal States

**Problem:** ACK resources can get stuck in terminal error states.

**Solution:** Detect and handle "already exists" terminal conditions.

```rust
/// Checks if ACK resource has "already exists" terminal condition
fn has_already_exists_terminal(obj: &DynamicObject) -> bool {
    obj.data
        .get("status")
        .and_then(|s| s.get("conditions"))
        .and_then(|c| c.as_array())
        .map(|conditions| {
            conditions.iter().any(|c| {
                c.get("type").and_then(|t| t.as_str()) == Some("ACK.Terminal")
                    && c.get("message")
                        .and_then(|m| m.as_str())
                        .map(|m| m.contains("already exists"))
                        .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

// In readiness check
if is_ack_resource_synced(&resource) {
    return Ok(true);
}
// Handle "already exists" by querying AWS directly
if has_already_exists_terminal(&resource) {
    return ctx.aws_client.resource_exists_and_ready(&name).await;
}
```

## Implementation Guide

### Step 1: Define Your CRD

```rust
use kube::CustomResource;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(CustomResource, Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[kube(
    group = "bridge.ack.tubi.internal",
    version = "v1alpha1",
    kind = "APIGatewayDomain",
    namespaced,
    status = "APIGatewayDomainStatus",
    printcolumn = r#"{"name":"Domain","type":"string","jsonPath":".spec.domain"}"#,
    printcolumn = r#"{"name":"Ready","type":"string","jsonPath":".status.ready"}"#,
)]
pub struct APIGatewayDomainSpec {
    pub domain: String,
    pub certificate_strategy: CertificateStrategy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub certificate_arn: Option<String>,
    pub api_ref: APIReference,
    pub stage: String,
    pub dns_config: DNSConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
pub struct APIGatewayDomainStatus {
    pub ready: bool,
    pub conditions: Vec<Condition>,
    pub certificate_arn: Option<String>,
    pub domain_name_endpoint: Option<String>,
    pub observed_generation: i64,
}
```

### Step 2: Implement AWS Client Layer

```rust
pub struct Route53Client {
    client: aws_sdk_route53::Client,
}

impl Route53Client {
    /// UPSERT semantics - idempotent create/update
    pub async fn upsert_cname_record(
        &self,
        hosted_zone_id: &str,
        record_name: &str,
        target: &str,
        ttl: i64,
    ) -> Result<(), Error> {
        let change = Change::builder()
            .action(ChangeAction::Upsert)  // Key: UPSERT not CREATE
            .resource_record_set(
                ResourceRecordSet::builder()
                    .name(record_name)
                    .r#type(RrType::Cname)
                    .ttl(ttl)
                    .resource_records(
                        ResourceRecord::builder().value(target).build()?
                    )
                    .build()?
            )
            .build()?;

        self.client
            .change_resource_record_sets()
            .hosted_zone_id(hosted_zone_id)
            .change_batch(ChangeBatch::builder().changes(change).build()?)
            .send()
            .await?;

        Ok(())
    }

    /// Idempotent delete - succeeds whether record exists or not
    pub async fn delete_cname_record_by_name(
        &self,
        hosted_zone_id: &str,
        record_name: &str,
    ) -> Result<(), Error> {
        // First lookup current value
        if let Some((target, ttl)) = self.get_cname_record(hosted_zone_id, record_name).await? {
            self.delete_cname_record(hosted_zone_id, record_name, &target, ttl).await
        } else {
            Ok(())  // Already gone, success
        }
    }
}
```

### Step 3: Implement Controller

```rust
pub async fn run(state: Arc<State>) -> anyhow::Result<()> {
    let api = Api::<APIGatewayDomain>::all(state.client.clone());

    Controller::new(api, Config::default().any_semantic())
        .shutdown_on_signal()
        .run(reconcile, error_policy, state)
        .for_each(|result| async {
            match result {
                Ok((obj, _)) => info!(name = %obj.name, "reconciled"),
                Err(e) => error!(error = %e, "reconciliation failed"),
            }
        })
        .await;

    Ok(())
}

async fn reconcile(
    domain: Arc<APIGatewayDomain>,
    ctx: Arc<State>,
) -> Result<Action, Error> {
    let ns = domain.namespace().ok_or(Error::MissingField("namespace"))?;
    let api: Api<APIGatewayDomain> = Api::namespaced(ctx.client.clone(), &ns);

    // Use finalizer for proper cleanup
    finalizer(&api, FINALIZER_NAME, domain, |event| async {
        match event {
            Event::Apply(d) => reconcile_apply(d, &ctx, &ns).await,
            Event::Cleanup(d) => reconcile_cleanup(d, &ctx, &ns).await,
        }
    })
    .await
    .map_err(|e| Error::Finalizer(e.to_string()))
}
```

### Step 4: Integrate with KRO

```typescript
// In your KRO ResourceGraphDefinition
const rgd = new k8s.apiextensions.CustomResource("tubilambdaservice", {
    apiVersion: "kro.run/v1alpha1",
    kind: "ResourceGraphDefinition",
    spec: {
        schema: { /* ... */ },
        resources: [
            // ACK Function
            {
                id: "lambda",
                template: {
                    apiVersion: "lambda.services.k8s.aws/v1alpha1",
                    kind: "Function",
                    // ...
                },
            },
            // ACK API
            {
                id: "httpApi",
                template: {
                    apiVersion: "apigatewayv2.services.k8s.aws/v1alpha1",
                    kind: "API",
                    // ...
                },
            },
            // Bridge resource (fills the gap!)
            {
                id: "httpDomain",
                template: {
                    apiVersion: "bridge.ack.tubi.internal/v1alpha1",
                    kind: "APIGatewayDomain",
                    spec: {
                        domain: "${schema.spec.domain}",
                        certificateStrategy: "discover",
                        apiRef: {
                            name: "${httpApi.metadata.name}",
                            apiType: "HTTP",
                        },
                        stage: "$default",
                        dnsConfig: {
                            ttl: 300,
                        },
                    },
                },
                readyWhen: ["${httpDomain.status.ready}"],
            },
        ],
    },
});
```

## Common Patterns

### Pattern 1: Certificate + Domain + DNS Automation

```yaml
apiVersion: bridge.ack.tubi.internal/v1alpha1
kind: APIGatewayDomain
spec:
  domain: api.example.com
  certificateStrategy: discover  # or 'create' or 'use-arn'
  apiRef:
    name: my-api
    apiType: HTTP
  stage: "$default"
  dnsConfig:
    ttl: 300
```

The Bridge operator:
1. Discovers/creates/validates certificate
2. Creates ACK DomainName resource
3. Creates ACK APIMapping resource
4. Creates DNS CNAME via direct Route53 UPSERT
5. Reports aggregated status

### Pattern 2: Lambda Permission Management

```yaml
apiVersion: bridge.ack.tubi.internal/v1alpha1
kind: LambdaPermission
spec:
  functionRef:
    functionName: my-function
  permissions:
    - statementId: apigateway-invoke
      action: lambda:InvokeFunction
      principal: apigateway.amazonaws.com
      sourceArn: arn:aws:execute-api:*:*:*/*/POST/*
```

The Bridge operator:
1. Resolves function ARN
2. Checks existing permissions (idempotent)
3. Adds/removes permissions as needed
4. Reports individual permission status

### Pattern 3: Cross-Account Resource Management

```yaml
apiVersion: bridge.ack.tubi.internal/v1alpha1
kind: CrossAccountBucket
spec:
  bucketName: shared-data
  targetAccount: "123456789012"
  policy:
    allowedPrincipals:
      - arn:aws:iam::987654321098:role/consumer
```

## Testing Strategy

### 1. Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_domain_for_name() {
        assert_eq!(sanitize_domain_for_name("api.example.com"), "api-example-com");
        assert_eq!(sanitize_domain_for_name("*.example.com"), "wildcard-example-com");
    }

    #[test]
    fn test_condition_creation() {
        let cond = Condition::new("Ready", "True", "AllReady", "All resources ready", 1);
        assert_eq!(cond.status, "True");
    }
}
```

### 2. Integration Tests

```rust
#[tokio::test]
#[ignore] // Requires real cluster
async fn test_reconcile_creates_domain() {
    let client = Client::try_default().await.unwrap();
    let state = Arc::new(State::new(client).await.unwrap());

    // Create test domain
    let domain = create_test_domain("test-domain", "test.example.com");

    // Reconcile
    let action = reconcile(Arc::new(domain), state.clone()).await.unwrap();

    // Verify
    assert!(matches!(action, Action::Requeue { .. }));
}
```

### 3. Clean Delete/Re-apply Test

```bash
# The gold standard test for idempotency
kubectl apply -f my-service.yaml
kubectl wait --for=condition=Ready myservice/test --timeout=300s

kubectl delete -f my-service.yaml
kubectl wait --for=delete myservice/test --timeout=60s

kubectl apply -f my-service.yaml
kubectl wait --for=condition=Ready myservice/test --timeout=300s
# Should succeed without "Resource already exists" errors
```

## Troubleshooting

### "Resource already exists" on Redeploy

**Cause:** ACK uses CREATE semantics, orphaned AWS resources remain after deletion.

**Solution:** Use direct AWS API with UPSERT semantics for resources that conflict.

### ACK Finalizer Blocking Deletion

**Cause:** ACK can't reach AWS to verify deletion.

**Solution:** Add `services.k8s.aws/deletion-policy: retain` annotation + explicit cleanup.

### Status Not Updating

**Cause:** Missing status subresource in CRD or incorrect patch.

**Solution:** Ensure CRD has `status` subresource, use `patch_status` not `patch`.

### KRO readyWhen Not Triggering

**Cause:** CEL expression not matching actual status structure.

**Solution:** Check exact status path with `kubectl get -o yaml`, verify CEL syntax.

## Reference Files

- **[Architecture Deep Dive](./references/architecture.md)** - Detailed architecture explanation
- **[ACK Patterns & Limitations](./references/ack-patterns.md)** - ACK behavior and workarounds
- **[Bridge Patterns](./references/bridge-patterns.md)** - Common bridge operator patterns
- **[Troubleshooting Guide](./references/troubleshooting.md)** - Detailed troubleshooting steps
- **[Templates](./templates/)** - Production-ready code templates

## Output Format

When implementing ACK Bridge solutions, always provide:

1. **CRD specification** with proper schema and status
2. **Controller implementation** with idempotent reconciliation
3. **AWS client layer** with UPSERT semantics
4. **KRO integration** showing how to use the bridge resource
5. **Test cases** for clean delete/re-apply cycle
6. **Status conditions** for observability
