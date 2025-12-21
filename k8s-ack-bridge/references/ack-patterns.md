# ACK Patterns & Limitations

## ACK Resource Lifecycle

### Standard ACK Flow

```
User applies ACK CRD
        │
        ▼
┌───────────────────┐
│  ACK Controller   │
│  - Reads spec     │
│  - Adds finalizer │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  AWS API Call     │
│  - CreateXxx()    │
│  - DescribeXxx()  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Status Update    │
│  - ARN            │
│  - Endpoint       │
│  - Conditions     │
└───────────────────┘
```

### ACK Status Structure

```yaml
status:
  # Standard ACK metadata
  ackResourceMetadata:
    arn: "arn:aws:lambda:us-east-2:123456789012:function:my-func"
    ownerAccountID: "123456789012"
    region: "us-east-2"

  # ACK conditions
  conditions:
    - type: ACK.ResourceSynced
      status: "True"
      message: "Resource synced successfully"
    - type: ACK.Terminal
      status: "False"  # True means permanent error

  # Resource-specific fields
  functionArn: "arn:aws:lambda:..."
  endpoint:
    address: "my-db.xxx.us-east-2.rds.amazonaws.com"
    port: 5432
```

## ACK Limitations and Workarounds

### Limitation 1: CREATE-Only Semantics

**Problem:** Some ACK resources use CREATE semantics. If the AWS resource already exists, creation fails.

```yaml
# ACK RecordSet uses CREATE
# If record already exists: "Resource already exists" error
apiVersion: route53.services.k8s.aws/v1alpha1
kind: RecordSet
spec:
  hostedZoneID: Z1234567890
  name: api.example.com
  type: CNAME
```

**Workaround:** Use direct AWS API with UPSERT semantics.

```rust
// Direct AWS call with UPSERT
ctx.route53
    .change_resource_record_sets()
    .change_batch(
        ChangeBatch::builder()
            .changes(
                Change::builder()
                    .action(ChangeAction::Upsert)  // UPSERT not CREATE
                    .resource_record_set(...)
                    .build()
            )
            .build()
    )
    .send()
    .await?;
```

### Limitation 2: Finalizer Blocking

**Problem:** ACK finalizers require AWS API calls to verify deletion. If AWS is unreachable, deletion blocks indefinitely.

```yaml
# Stuck resource - finalizer can't be removed
metadata:
  deletionTimestamp: "2024-01-15T10:00:00Z"
  finalizers:
    - services.k8s.aws/acm.services.k8s.aws  # Blocking!
```

**Workaround:** Use `deletion-policy: retain` annotation.

```yaml
metadata:
  annotations:
    services.k8s.aws/deletion-policy: retain  # Don't wait for AWS
```

Then implement explicit cleanup in your controller:

```rust
async fn cleanup(domain: Arc<MyResource>, ctx: &State) -> Result<Action, Error> {
    // Direct AWS deletion (idempotent)
    ctx.aws_client.delete_resource(&domain.spec.name).await?;

    // Now delete ACK resource (won't block due to retain policy)
    let api: Api<DynamicObject> = Api::namespaced_with(...);
    api.delete(&name, &DeleteParams::default()).await.ok();

    Ok(Action::await_change())
}
```

### Limitation 3: Missing Status Fields

**Problem:** ACK doesn't expose all AWS resource attributes in status.

```yaml
# ACK DomainName status - missing regional endpoint!
apiVersion: apigatewayv2.services.k8s.aws/v1alpha1
kind: DomainName
status:
  ackResourceMetadata:
    arn: "..."
  # Missing: domainNameConfigurations[].apiGatewayDomainName
```

**Workaround:** Query AWS directly for missing data.

```rust
// Query AWS for data not in ACK status
let domain_info = ctx.api_gateway
    .get_domain_name()
    .domain_name(&domain_name)
    .send()
    .await?;

let regional_endpoint = domain_info
    .domain_name_configurations()
    .first()
    .and_then(|c| c.api_gateway_domain_name())
    .ok_or(Error::MissingField("regional endpoint"))?;
```

### Limitation 4: Terminal State Recovery

**Problem:** ACK resources can get stuck in terminal error states that won't auto-recover.

```yaml
status:
  conditions:
    - type: ACK.Terminal
      status: "True"
      message: "operation error: ConflictException: The domain name you provided already exists"
```

**Workaround:** Detect terminal conditions and verify with AWS directly.

```rust
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
async fn is_resource_ready(ctx: &State, resource: &DynamicObject) -> Result<bool, Error> {
    if is_ack_resource_synced(resource) {
        return Ok(true);
    }

    // Handle terminal "already exists" by checking AWS directly
    if has_already_exists_terminal(resource) {
        return ctx.aws_client.resource_exists(&name).await;
    }

    Ok(false)
}
```

### Limitation 5: Cross-Resource Dependencies

**Problem:** Some AWS operations require data from other resources that isn't available in ACK status.

```yaml
# Lambda permission needs API Gateway ARN
# But API Gateway ID comes from ACK API resource
# And source ARN format is complex
```

**Workaround:** Resolve references in your controller.

```rust
async fn resolve_source_arn(
    ctx: &State,
    source_ref: &SourceArnRef,
    ns: &str,
) -> Result<String, Error> {
    let api_resource = ack_api_resource("apigatewayv2.services.k8s.aws", "API");
    let api: Api<DynamicObject> = Api::namespaced_with(ctx.client.clone(), ns, &api_resource);

    let api_obj = api.get(&source_ref.api_name).await?;
    let api_id = api_obj.data
        .get("status")
        .and_then(|s| s.get("apiID"))
        .and_then(|id| id.as_str())
        .ok_or(Error::MissingField("apiID"))?;

    // Construct ARN from resolved API ID
    Ok(format!(
        "arn:aws:execute-api:{}:{}:{}/*/*/*",
        ctx.region, ctx.account_id, api_id
    ))
}
```

## ACK Resource Patterns

### Pattern 1: Checking Sync Status

```rust
/// Check if an ACK resource is synced (ready)
pub fn is_ack_resource_synced(obj: &DynamicObject) -> bool {
    obj.data
        .get("status")
        .and_then(|s| s.get("conditions"))
        .and_then(|c| c.as_array())
        .map(|conditions| {
            conditions.iter().any(|c| {
                c.get("type").and_then(|t| t.as_str()) == Some("ACK.ResourceSynced")
                    && c.get("status").and_then(|s| s.as_str()) == Some("True")
            })
        })
        .unwrap_or(false)
}
```

### Pattern 2: Getting ARN from Status

```rust
/// Extract ARN from ACK resource status
fn get_ack_resource_arn(obj: &DynamicObject) -> Option<String> {
    obj.data
        .get("status")
        .and_then(|s| s.get("ackResourceMetadata"))
        .and_then(|m| m.get("arn"))
        .and_then(|a| a.as_str())
        .map(String::from)
}
```

### Pattern 3: Creating ACK Resources with Owner References

```rust
async fn create_ack_resource(
    parent: &MyResource,
    ctx: &State,
    ns: &str,
) -> Result<String, Error> {
    let api_resource = ack_api_resource("service.services.k8s.aws", "ResourceKind");
    let api: Api<DynamicObject> = Api::namespaced_with(ctx.client.clone(), ns, &api_resource);

    // Check if already exists (idempotent)
    if let Some(existing) = api.get_opt(&resource_name).await? {
        return Ok(resource_name);
    }

    let resource = DynamicObject {
        metadata: kube::core::ObjectMeta {
            name: Some(resource_name.clone()),
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
        data: json!({
            "spec": {
                // ... resource spec
            }
        }),
    };

    api.create(&PostParams::default(), &resource).await?;
    Ok(resource_name)
}
```

### Pattern 4: Standard ACK Annotations

```rust
/// Annotations for ACK resources managed by bridge
fn ack_resource_annotations() -> BTreeMap<String, String> {
    [
        // Prevent finalizer blocking
        ("services.k8s.aws/deletion-policy".to_string(), "retain".to_string()),
    ]
    .into_iter()
    .collect()
}

/// Labels for tracking
fn ack_resource_labels() -> BTreeMap<String, String> {
    [
        ("app.kubernetes.io/created-by".to_string(), "ack-bridge".to_string()),
    ]
    .into_iter()
    .collect()
}
```

### Pattern 5: Deleting ACK Resources (Best Effort)

```rust
/// Delete ACK resource (best effort, won't fail if already gone)
async fn delete_ack_resource(
    ctx: &State,
    ns: &str,
    group: &str,
    kind: &str,
    name: &str,
) {
    let api_resource = ack_api_resource(group, kind);
    let api: Api<DynamicObject> = Api::namespaced_with(ctx.client.clone(), ns, &api_resource);

    match api.delete(name, &DeleteParams::default()).await {
        Ok(_) => {
            info!(kind = %kind, name = %name, "deleted ACK resource");
        }
        Err(kube::Error::Api(e)) if e.code == 404 => {
            debug!(kind = %kind, name = %name, "ACK resource already gone");
        }
        Err(e) => {
            warn!(kind = %kind, name = %name, error = %e, "failed to delete ACK resource");
        }
    }
}
```

## ACK Controller Reference

| Controller | CRDs | Notes |
|------------|------|-------|
| lambda-controller | Function, Alias, EventSourceMapping | Function status has functionArn |
| apigatewayv2-controller | API, Stage, Route, Integration, DomainName, APIMapping | DomainName missing endpoint in status |
| acm-controller | Certificate | domainValidationOptions in status |
| route53-controller | RecordSet, HostedZone | RecordSet uses CREATE not UPSERT |
| s3-controller | Bucket | Good status reporting |
| dynamodb-controller | Table, GlobalTable | tableArn in status |
| rds-controller | DBInstance, DBCluster | endpoint.address/port in status |
| elasticache-controller | CacheCluster, ReplicationGroup | configurationEndpoint in status |
| sqs-controller | Queue | queueURL in status |
| sns-controller | Topic, Subscription | topicArn in status |

## Common ACK Issues

### Issue: "field is immutable"

**Cause:** Trying to update an immutable field.

**Solution:** Delete and recreate the resource, or use a different field.

### Issue: "AccessDenied"

**Cause:** IRSA role doesn't have required permissions.

**Solution:** Check IAM policy attached to the ServiceAccount's role.

### Issue: "ResourceNotFoundException"

**Cause:** AWS resource was deleted outside of ACK.

**Solution:** Delete the ACK resource and recreate it.

### Issue: "ConflictException: already exists"

**Cause:** AWS resource exists but ACK doesn't know about it.

**Solution:** Import existing resource or use bridge with UPSERT semantics.
