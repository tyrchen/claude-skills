# Bridge Operator Patterns

## Critical: Status Update Rules

> **⚠️ CRITICAL**: Violating these rules causes status flapping and reconciliation loops.

```text
┌─────────────────────────────────────────────────────────────────┐
│ RULE: Only update status in TWO cases:                         │
│   1. When RETURNING EARLY (waiting for something)              │
│   2. At the VERY END (final ready/error status)                │
│                                                                 │
│ NEVER update status then continue to next phase.               │
│ This causes reconciliation loops and status flapping.          │
└─────────────────────────────────────────────────────────────────┘
```

**Why?** Each status update triggers a new reconciliation via the watcher.
If you update status mid-reconciliation and continue, a new reconciliation
starts that races with the current one, causing status to flip-flop.

**Correct Pattern:**
```rust
if !resource_ready {
    update_status(creating);  // OK: followed by return
    return requeue;
}
// Resource is ready, continue to next phase WITHOUT status update
```

**Wrong Pattern:**
```rust
if !resource_ready {
    update_status(creating);
    return requeue;
}
update_status(resource_ready);  // BAD: triggers new reconcile
// continue to next phase       // while this one is still running
```

---

## Core Bridge Patterns

### Pattern 1: Multi-Phase Reconciliation

Use phases to handle complex workflows with proper status tracking.

```rust
/// Multi-phase reconciliation with conditions
async fn reconcile_apply(
    resource: Arc<MyResource>,
    ctx: &State,
    ns: &str,
) -> Result<Action, Error> {
    let api: Api<MyResource> = Api::namespaced(ctx.client.clone(), ns);
    let name = resource.name_any();
    let gen = resource.metadata.generation.unwrap_or(0);

    // Phase 1: Prerequisite Check
    let prereq = resolve_prerequisite(&resource, ctx).await?;
    if !prereq.ready {
        update_status(&api, &name, StatusUpdate::waiting_for_prereq(gen)).await?;
        return Ok(Action::requeue(REQUEUE_PREREQ));
    }

    // Phase 2: Create Primary Resource
    create_primary_resource(&resource, ctx, ns).await?;
    if !is_primary_ready(ctx, ns, &name).await? {
        update_status(&api, &name, StatusUpdate::primary_creating(gen)).await?;
        return Ok(Action::requeue(REQUEUE_CREATING));
    }

    // Phase 3: Create Secondary Resources
    for secondary in &resource.spec.secondaries {
        create_secondary(&resource, ctx, ns, secondary).await?;
    }
    if !all_secondaries_ready(ctx, ns, &resource).await? {
        update_status(&api, &name, StatusUpdate::secondaries_creating(gen)).await?;
        return Ok(Action::requeue(REQUEUE_CREATING));
    }

    // Phase 4: Direct AWS Operations
    perform_aws_operations(&resource, ctx).await?;

    // Final: Mark Ready
    update_status(&api, &name, StatusUpdate::ready(gen)).await?;
    Ok(Action::requeue(REQUEUE_SUCCESS))
}
```

### Pattern 2: Condition-Based Status

Report detailed status with multiple conditions.

```rust
/// Condition types for domain automation
pub mod condition_types {
    pub const CERTIFICATE_READY: &str = "CertificateReady";
    pub const DOMAIN_NAME_READY: &str = "DomainNameReady";
    pub const API_MAPPING_READY: &str = "APIMappingReady";
    pub const DNS_READY: &str = "DNSReady";
    pub const READY: &str = "Ready";
    pub const DEGRADED: &str = "Degraded";
}

/// Status update builder
struct StatusUpdate {
    ready: bool,
    conditions: Vec<Condition>,
    // Resource-specific fields...
}

impl StatusUpdate {
    fn waiting_for_certificate(gen: i64) -> Self {
        Self {
            ready: false,
            conditions: vec![
                Condition::new(CERTIFICATE_READY, "False", "WaitingForCertificate",
                    "Waiting for ACK Certificate to provide ARN", gen),
                Condition::new(READY, "False", "WaitingForCertificate",
                    "Waiting for certificate", gen),
            ],
            ..Default::default()
        }
    }

    fn certificate_pending_validation(cert_arn: &str, gen: i64) -> Self {
        Self {
            ready: false,
            conditions: vec![
                Condition::new(CERTIFICATE_READY, "False", "PendingValidation",
                    "Certificate is pending DNS validation", gen),
                Condition::new(READY, "False", "PendingValidation",
                    "Waiting for certificate validation", gen),
            ],
            certificate_arn: Some(cert_arn.to_string()),
            certificate_status: Some("PENDING_VALIDATION".to_string()),
            ..Default::default()
        }
    }

    fn ready(
        cert_arn: &str,
        endpoint: &str,
        gen: i64,
    ) -> Self {
        Self {
            ready: true,
            conditions: vec![
                Condition::new(CERTIFICATE_READY, "True", "Issued",
                    "Certificate is ISSUED", gen),
                Condition::new(DOMAIN_NAME_READY, "True", "Ready",
                    "DomainName is ready", gen),
                Condition::new(API_MAPPING_READY, "True", "Ready",
                    "APIMapping is ready", gen),
                Condition::new(DNS_READY, "True", "Ready",
                    "DNS CNAME record created", gen),
                Condition::new(READY, "True", "Ready",
                    "All resources ready", gen),
            ],
            certificate_arn: Some(cert_arn.to_string()),
            endpoint: Some(endpoint.to_string()),
            ..Default::default()
        }
    }
}
```

### Pattern 3: Idempotent Resource Creation

Always check if resource exists before creating.

```rust
/// Idempotent ACK resource creation
async fn create_ack_resource_idempotent(
    parent: &MyResource,
    ctx: &State,
    ns: &str,
    resource_name: &str,
    spec: serde_json::Value,
) -> Result<(), Error> {
    let api_resource = ack_api_resource("service.services.k8s.aws", "ResourceKind");
    let api: Api<DynamicObject> = Api::namespaced_with(ctx.client.clone(), ns, &api_resource);

    // Idempotency check: already exists?
    if api.get_opt(resource_name).await?.is_some() {
        debug!(name = %resource_name, "ACK resource already exists");
        return Ok(());
    }

    let resource = DynamicObject {
        metadata: kube::core::ObjectMeta {
            name: Some(resource_name.to_string()),
            namespace: Some(ns.to_string()),
            annotations: Some(ack_resource_annotations()),
            labels: Some(ack_resource_labels()),
            owner_references: Some(vec![owner_reference(parent)]),
            ..Default::default()
        },
        types: Some(kube::core::TypeMeta {
            api_version: "service.services.k8s.aws/v1alpha1".to_string(),
            kind: "ResourceKind".to_string(),
        }),
        data: json!({ "spec": spec }),
    };

    api.create(&PostParams::default(), &resource).await?;
    info!(name = %resource_name, "created ACK resource");
    Ok(())
}
```

### Pattern 4: UPSERT AWS Operations

Use UPSERT semantics for direct AWS API calls.

```rust
/// UPSERT pattern for Route53 records
pub async fn upsert_cname_record(
    &self,
    hosted_zone_id: &str,
    record_name: &str,
    target: &str,
    ttl: i64,
) -> Result<(), Error> {
    // Normalize name (Route53 requires trailing dot)
    let normalized_name = if record_name.ends_with('.') {
        record_name.to_string()
    } else {
        format!("{record_name}.")
    };

    let record_set = ResourceRecordSet::builder()
        .name(&normalized_name)
        .r#type(RrType::Cname)
        .ttl(ttl)
        .resource_records(
            ResourceRecord::builder().value(target).build()?
        )
        .build()?;

    let change = Change::builder()
        .action(ChangeAction::Upsert)  // Key: UPSERT
        .resource_record_set(record_set)
        .build()?;

    self.client
        .change_resource_record_sets()
        .hosted_zone_id(hosted_zone_id)
        .change_batch(ChangeBatch::builder().changes(change).build()?)
        .send()
        .await?;

    info!(record = %record_name, target = %target, "upserted CNAME record");
    Ok(())
}
```

### Pattern 5: Idempotent Deletion

Delete operations should succeed whether resource exists or not.

```rust
/// Idempotent delete pattern
pub async fn delete_cname_record_by_name(
    &self,
    hosted_zone_id: &str,
    record_name: &str,
) -> Result<(), Error> {
    // First, lookup current value
    match self.get_cname_record(hosted_zone_id, record_name).await? {
        Some((target, ttl)) => {
            // Record exists, delete it
            self.delete_cname_record(hosted_zone_id, record_name, &target, ttl).await
        }
        None => {
            // Record doesn't exist, success!
            debug!(record = %record_name, "CNAME record doesn't exist, nothing to delete");
            Ok(())
        }
    }
}

/// Cleanup pattern in finalizer
async fn reconcile_cleanup(
    resource: Arc<MyResource>,
    ctx: &State,
    ns: &str,
) -> Result<Action, Error> {
    let name = resource.name_any();
    info!(name = %name, "cleaning up resource");

    // 1. Delete direct AWS resources first (idempotent)
    if let Some(hosted_zone_id) = &resource.status.as_ref().and_then(|s| s.hosted_zone_id.as_ref()) {
        if let Err(e) = ctx.route53.delete_cname_record_by_name(hosted_zone_id, &resource.spec.domain).await {
            warn!(error = %e, "failed to delete DNS record (continuing)");
        }
    }

    // 2. Delete ACK resources (best effort, uses retain policy)
    delete_ack_resource(ctx, ns, "apigatewayv2.services.k8s.aws", "APIMapping", &mapping_name).await;
    delete_ack_resource(ctx, ns, "apigatewayv2.services.k8s.aws", "DomainName", &domain_name).await;

    // 3. Finalizer will be removed automatically
    info!(name = %name, "cleanup complete");
    Ok(Action::await_change())
}
```

### Pattern 6: Reference Resolution

Resolve references to other Kubernetes resources.

```rust
/// Resolve API ID from reference
async fn resolve_api_id(
    resource: &MyResource,
    ctx: &State,
    ns: &str,
) -> Result<String, Error> {
    let api_ref = &resource.spec.api_ref;
    let api_ns = api_ref.namespace.as_deref().unwrap_or(ns);

    let api_resource = ack_api_resource("apigatewayv2.services.k8s.aws", "API");
    let api: Api<DynamicObject> = Api::namespaced_with(ctx.client.clone(), api_ns, &api_resource);

    let api_obj = api.get(&api_ref.name).await
        .map_err(|e| Error::NotReady(format!("API {} not found: {}", api_ref.name, e)))?;

    // Check if synced
    if !is_ack_resource_synced(&api_obj) {
        return Err(Error::NotReady(format!("API {} not synced", api_ref.name)));
    }

    // Extract ID from status
    api_obj.data
        .get("status")
        .and_then(|s| s.get("apiID"))
        .and_then(|id| id.as_str())
        .map(String::from)
        .ok_or(Error::MissingField("status.apiID"))
}
```

### Pattern 7: Terminal State Handling

Handle ACK resources stuck in terminal error states.

```rust
/// Check for terminal "already exists" condition
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

/// Check for recoverable conflict condition
fn has_conflict_recoverable(obj: &DynamicObject) -> bool {
    obj.data
        .get("status")
        .and_then(|s| s.get("conditions"))
        .and_then(|c| c.as_array())
        .map(|conditions| {
            conditions.iter().any(|c| {
                c.get("type").and_then(|t| t.as_str()) == Some("ACK.Recoverable")
                    && c.get("message")
                        .and_then(|m| m.as_str())
                        .map(|m| m.contains("Conflict"))
                        .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Enhanced readiness check
async fn is_resource_ready_with_fallback(
    ctx: &State,
    ns: &str,
    resource_name: &str,
    aws_name: &str,
) -> Result<bool, Error> {
    let api_resource = ack_api_resource("service.services.k8s.aws", "ResourceKind");
    let api: Api<DynamicObject> = Api::namespaced_with(ctx.client.clone(), ns, &api_resource);

    let Some(obj) = api.get_opt(resource_name).await? else {
        return Ok(false);
    };

    // Normal case: ACK synced
    if is_ack_resource_synced(&obj) {
        return Ok(true);
    }

    // Fallback: Terminal "already exists" - check AWS directly
    if has_already_exists_terminal(&obj) {
        debug!(name = %resource_name, "terminal condition, checking AWS");
        return ctx.aws_client.resource_exists_and_ready(aws_name).await;
    }

    // Fallback: Recoverable conflict - might be OK
    if has_conflict_recoverable(&obj) {
        info!(name = %resource_name, "conflict condition, proceeding");
        return Ok(true);
    }

    Ok(false)
}
```

### Pattern 8: Owner Reference Cascade

Use owner references for automatic cleanup.

```rust
/// Create owner reference for cascade deletion
fn owner_reference(parent: &MyResource) -> OwnerReference {
    OwnerReference {
        api_version: "bridge.ack.tubi.internal/v1alpha1".to_string(),
        kind: "MyResource".to_string(),
        name: parent.name_any(),
        uid: parent.metadata.uid.clone().unwrap_or_default(),
        controller: Some(true),
        block_owner_deletion: Some(true),
    }
}

/// Standard annotations including deletion policy
fn ack_resource_annotations() -> BTreeMap<String, String> {
    [
        // Prevent ACK finalizer blocking
        ("services.k8s.aws/deletion-policy".to_string(), "retain".to_string()),
    ]
    .into_iter()
    .collect()
}

/// Standard labels for tracking
fn ack_resource_labels() -> BTreeMap<String, String> {
    [
        ("app.kubernetes.io/created-by".to_string(), "ack-bridge".to_string()),
    ]
    .into_iter()
    .collect()
}
```

### Pattern 9: Error Classification

Classify errors for appropriate handling.

```rust
#[derive(Error, Debug)]
pub enum Error {
    // Transient - retry with backoff
    #[error("resource not ready: {0}")]
    NotReady(String),

    #[error("AWS API error: {0}")]
    AwsApi(String),

    // Recoverable - fix and retry
    #[error("missing field: {0}")]
    MissingField(&'static str),

    #[error("reference not found: {0}")]
    ReferenceNotFound(String),

    // Terminal - user intervention needed
    #[error("certificate not found: {0}")]
    CertificateNotFound(String),

    #[error("certificate not issued: {0}")]
    CertificateNotIssued(String),

    #[error("configuration error: {0}")]
    Configuration(String),
}

fn error_policy(resource: Arc<MyResource>, error: &Error, _ctx: Arc<State>) -> Action {
    let ns = resource.namespace().unwrap_or_default();

    match error {
        // Transient: quick retry
        Error::NotReady(_) | Error::AwsApi(_) => {
            Action::requeue(Duration::from_secs(15))
        }

        // Recoverable: normal retry
        Error::MissingField(_) | Error::ReferenceNotFound(_) => {
            Action::requeue(Duration::from_secs(30))
        }

        // Terminal: slow retry (wait for user fix)
        Error::CertificateNotFound(_) |
        Error::CertificateNotIssued(_) |
        Error::Configuration(_) => {
            Action::requeue(Duration::from_secs(300))
        }
    }
}
```

### Pattern 10: Metrics and Observability

Add metrics for monitoring.

```rust
use prometheus::{Counter, Histogram, register_counter, register_histogram};

lazy_static! {
    static ref RECONCILE_COUNT: Counter = register_counter!(
        "bridge_reconcile_total",
        "Total reconciliations"
    ).unwrap();

    static ref RECONCILE_DURATION: Histogram = register_histogram!(
        "bridge_reconcile_duration_seconds",
        "Reconciliation duration"
    ).unwrap();

    static ref AWS_CALL_COUNT: Counter = register_counter!(
        "bridge_aws_calls_total",
        "Total AWS API calls"
    ).unwrap();
}

/// Timer for reconciliation metrics
pub struct ReconcileTimer {
    start: Instant,
    resource_type: &'static str,
}

impl ReconcileTimer {
    pub fn new(resource_type: &'static str) -> Self {
        RECONCILE_COUNT.inc();
        Self {
            start: Instant::now(),
            resource_type,
        }
    }
}

impl Drop for ReconcileTimer {
    fn drop(&mut self) {
        let duration = self.start.elapsed().as_secs_f64();
        RECONCILE_DURATION.observe(duration);
    }
}
```

## KRO Integration Patterns

### Pattern: Bridge Resource in RGD

```typescript
// In KRO ResourceGraphDefinition
{
    id: "customDomain",
    template: {
        apiVersion: "bridge.ack.tubi.internal/v1alpha1",
        kind: "APIGatewayDomain",
        metadata: {
            name: "${schema.spec.name}-domain",
            namespace: "${schema.metadata.namespace}",
        },
        spec: {
            domain: "${schema.spec.customDomain.name}",
            certificateStrategy: "${schema.spec.customDomain.certificateStrategy}",
            certificateArn: "${schema.spec.customDomain.?certificateArn}",
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
    // Wait for bridge resource to be ready
    readyWhen: [
        "${customDomain.status.ready}",
    ],
    // Only create if custom domain is enabled
    includeWhen: [
        "${schema.spec.customDomain.enabled}",
    ],
}
```

### Pattern: Status Propagation to KRO

```typescript
// In RGD schema.status
status: {
    // Propagate bridge resource status
    domainEndpoint: "${customDomain.status.?domainNameEndpoint ?? 'pending'}",
    certificateArn: "${customDomain.status.?certificateArn ?? 'pending'}",
    dnsRecordName: "${customDomain.status.?dnsRecordName ?? 'pending'}",

    // Aggregate readiness
    ready: "${lambda.status.conditions.exists(c, c.type == 'ACK.ResourceSynced' && c.status == 'True') && customDomain.status.ready}",
}
```
