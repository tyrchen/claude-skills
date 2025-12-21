# Troubleshooting Guide

## Quick Diagnosis Commands

```bash
# Check resource status
kubectl get apigatewaydomains -A -o wide
kubectl describe apigatewaydomains <name> -n <namespace>

# Check conditions
kubectl get apigatewaydomains <name> -n <namespace> -o jsonpath='{.status.conditions}' | jq

# Check ACK resources
kubectl get domainnames.apigatewayv2.services.k8s.aws -n <namespace>
kubectl get apimappings.apigatewayv2.services.k8s.aws -n <namespace>

# Check bridge controller logs
kubectl logs deployment/ack-bridge -n kro-system --tail=100 | grep -i error

# Check ACK controller logs
kubectl logs deployment/ack-apigatewayv2-controller -n ack-system --tail=100
```

## Common Issues

### Issue 1: "Resource already exists" on Redeploy

**Symptoms:**
```
status:
  conditions:
    - type: ACK.Terminal
      status: "True"
      message: "operation error ApiGatewayV2: CreateDomainName: ConflictException: The domain name you provided already exists"
```

**Cause:** ACK uses CREATE semantics. The AWS resource exists (created before or orphaned) but ACK thinks it needs to create it.

**Solutions:**

1. **For DNS Records:** Bridge operator should use UPSERT via direct Route53 API
   ```rust
   ctx.route53.upsert_cname_record(zone_id, name, target, ttl).await?;
   ```

2. **For DomainName/APIMapping:** Bridge operator should handle terminal condition
   ```rust
   if has_already_exists_terminal(&resource) {
       // Verify AWS resource exists and is ready
       return ctx.aws_client.resource_exists(&name).await;
   }
   ```

3. **Manual cleanup:** Delete orphaned AWS resources
   ```bash
   aws apigatewayv2 delete-domain-name --domain-name api.example.com
   aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://delete.json
   ```

---

### Issue 2: Deletion Stuck (Finalizer Blocking)

**Symptoms:**
```yaml
metadata:
  deletionTimestamp: "2024-01-15T10:00:00Z"
  finalizers:
    - services.k8s.aws/acm.services.k8s.aws
```

**Cause:** ACK finalizer can't reach AWS to verify deletion (VPN down, permissions revoked, etc.)

**Solutions:**

1. **Preventive:** Always use `deletion-policy: retain`
   ```yaml
   metadata:
     annotations:
       services.k8s.aws/deletion-policy: retain
   ```

2. **Immediate fix:** Remove finalizer manually
   ```bash
   kubectl patch <kind> <name> -n <namespace> --type=json \
     -p='[{"op": "remove", "path": "/metadata/finalizers"}]'
   ```

3. **Clean up AWS resource manually:**
   ```bash
   aws acm delete-certificate --certificate-arn arn:aws:acm:...
   ```

---

### Issue 3: Status Not Updating

**Symptoms:**
- `kubectl get` shows stale status
- Conditions not changing
- Ready stuck at False

**Cause:** Status subresource patch failing or controller not reconciling

**Solutions:**

1. **Check controller logs:**
   ```bash
   kubectl logs deployment/ack-bridge -n kro-system --tail=100 | grep -i "status\|patch"
   ```

2. **Verify CRD has status subresource:**
   ```bash
   kubectl get crd apigatewaydomains.bridge.ack.tubi.internal -o yaml | grep subresources -A5
   ```

3. **Force reconciliation:**
   ```bash
   kubectl annotate apigatewaydomains <name> -n <namespace> reconcile=$(date +%s)
   ```

4. **Check RBAC:**
   ```bash
   kubectl auth can-i patch apigatewaydomains/status --as=system:serviceaccount:kro-system:ack-bridge
   ```

---

### Issue 4: Certificate Pending Validation Forever

**Symptoms:**
```yaml
status:
  certificateStatus: PENDING_VALIDATION
  conditions:
    - type: CertificateReady
      status: "False"
      reason: "PendingValidation"
```

**Cause:** DNS validation records not created or DNS propagation not complete

**Solutions:**

1. **Check validation records created:**
   ```bash
   kubectl get apigatewaydomains <name> -n <namespace> -o jsonpath='{.status.validationRecords}' | jq
   ```

2. **Verify DNS records in Route53:**
   ```bash
   aws route53 list-resource-record-sets --hosted-zone-id Z123 | grep -A5 "_acm-validation"
   ```

3. **Check DNS propagation:**
   ```bash
   dig +short _acm-validation.example.com CNAME
   ```

4. **Check ACM certificate status:**
   ```bash
   aws acm describe-certificate --certificate-arn arn:aws:acm:... | jq '.Certificate.DomainValidationOptions'
   ```

---

### Issue 5: KRO readyWhen Not Triggering

**Symptoms:**
- KRO instance stuck in PENDING
- Bridge resource shows Ready=True
- KRO doesn't see it

**Cause:** CEL expression doesn't match actual status structure

**Solutions:**

1. **Check actual status structure:**
   ```bash
   kubectl get apigatewaydomains <name> -n <namespace> -o yaml
   ```

2. **Verify CEL expression:**
   ```yaml
   # Wrong: assumes status.ready is string
   readyWhen:
     - "${domain.status.ready == 'true'}"

   # Correct: status.ready is boolean
   readyWhen:
     - "${domain.status.ready}"
   ```

3. **Check KRO instance status:**
   ```bash
   kubectl get tubilambdaservice <name> -n <namespace> -o yaml | grep -A20 status
   ```

4. **Check KRO controller logs:**
   ```bash
   kubectl logs deployment/kro-controller-manager -n kro-system --tail=100
   ```

---

### Issue 6: AWS API Rate Limiting

**Symptoms:**
```
status:
  conditions:
    - type: ACK.Recoverable
      status: "True"
      message: "operation error ApiGatewayV2: CreateDomainName, failed to get rate limit token"
```

**Cause:** Too many AWS API calls, hitting rate limits

**Solutions:**

1. **Wait for automatic retry:** ACK.Recoverable will auto-retry

2. **Increase requeue intervals:**
   ```rust
   const REQUEUE_AFTER_ACK_READY: Duration = Duration::from_secs(30); // was 15
   ```

3. **Implement exponential backoff:**
   ```rust
   fn error_policy(resource: Arc<MyResource>, error: &Error, _ctx: Arc<State>) -> Action {
       let attempts = get_retry_count(&resource);
       let delay = Duration::from_secs(15 * 2_u64.pow(attempts.min(6)));
       Action::requeue(delay)
   }
   ```

---

### Issue 7: Missing AWS Permissions

**Symptoms:**
```
status:
  conditions:
    - type: ACK.Terminal
      status: "True"
      message: "AccessDeniedException: User is not authorized to perform: route53:ChangeResourceRecordSets"
```

**Cause:** IRSA role missing required permissions

**Solutions:**

1. **Check ServiceAccount:**
   ```bash
   kubectl get serviceaccount ack-bridge -n kro-system -o yaml | grep eks.amazonaws.com/role-arn
   ```

2. **Verify IAM role policy:**
   ```bash
   aws iam get-role-policy --role-name <role-name> --policy-name <policy-name>
   ```

3. **Required permissions for bridge operator:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "route53:ChangeResourceRecordSets",
           "route53:ListResourceRecordSets",
           "route53:ListHostedZones",
           "route53:GetHostedZone"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "acm:DescribeCertificate",
           "acm:ListCertificates"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "apigateway:GET"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "lambda:GetFunction",
           "lambda:AddPermission",
           "lambda:RemovePermission",
           "lambda:GetPolicy"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

---

### Issue 8: Orphaned AWS Resources

**Symptoms:**
- AWS resources exist but no K8s resource references them
- Billing charges for unused resources
- "Already exists" errors on new deployments

**Cause:** Resources created but K8s resources deleted without proper cleanup

**Solutions:**

1. **List potential orphans:**
   ```bash
   # Find DomainNames without K8s match
   aws apigatewayv2 get-domain-names | jq '.Items[].DomainName'
   kubectl get domainnames.apigatewayv2.services.k8s.aws -A -o jsonpath='{.items[*].spec.domainName}'

   # Compare lists to find orphans
   ```

2. **Clean up orphaned resources:**
   ```bash
   aws apigatewayv2 delete-domain-name --domain-name orphaned.example.com
   aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://delete.json
   ```

3. **Prevent future orphans:** Use owner references
   ```rust
   owner_references: Some(vec![owner_reference(parent)]),
   ```

---

### Issue 9: DNS Not Resolving

**Symptoms:**
- Resource shows Ready=True
- DNS lookup returns NXDOMAIN or wrong value

**Cause:** DNS record not created or propagation delay

**Solutions:**

1. **Check Route53 directly:**
   ```bash
   aws route53 list-resource-record-sets --hosted-zone-id Z123 | jq '.ResourceRecordSets[] | select(.Name == "api.example.com.")'
   ```

2. **Check DNS propagation:**
   ```bash
   dig +short api.example.com
   dig @8.8.8.8 +short api.example.com  # Google DNS
   dig @1.1.1.1 +short api.example.com  # Cloudflare DNS
   ```

3. **Verify correct endpoint:**
   ```bash
   # Get endpoint from status
   kubectl get apigatewaydomains <name> -n <namespace> -o jsonpath='{.status.domainNameEndpoint}'

   # Should point to regional endpoint like d-xxx.execute-api.region.amazonaws.com
   ```

4. **Force DNS update:**
   ```bash
   aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch '{
     "Changes": [{
       "Action": "UPSERT",
       "ResourceRecordSet": {
         "Name": "api.example.com",
         "Type": "CNAME",
         "TTL": 300,
         "ResourceRecords": [{"Value": "d-xxx.execute-api.us-east-2.amazonaws.com"}]
       }
     }]
   }'
   ```

---

### Issue 10: Controller Not Starting

**Symptoms:**
- Pod in CrashLoopBackOff
- Controller logs show startup errors

**Cause:** Missing configuration, RBAC issues, or code bugs

**Solutions:**

1. **Check pod status:**
   ```bash
   kubectl describe pod -n kro-system -l app=ack-bridge
   ```

2. **Check logs:**
   ```bash
   kubectl logs deployment/ack-bridge -n kro-system --previous
   ```

3. **Verify RBAC:**
   ```bash
   kubectl get clusterrole ack-bridge -o yaml
   kubectl get clusterrolebinding ack-bridge -o yaml
   ```

4. **Check NetworkPolicy:**
   ```bash
   kubectl get networkpolicy -n kro-system -o yaml
   # Ensure egress to kube-apiserver and AWS endpoints is allowed
   ```

---

### Issue 11: Status Flapping Between Ready/NotReady

**Symptoms:**
- Resource status alternates between `Ready=True` and `Ready=False`
- KRO instance shows `IN_PROGRESS` despite resources being functionally ready
- Controller logs show rapid successive reconciliations
- Status conditions change timestamps frequently

**Cause:** Intermediate status updates during reconciliation trigger new reconciliations that race with the current one.

**Root Pattern (WRONG):**
```rust
// After checking DomainName is ready...
update_status(domain_name_ready);  // This triggers new reconcile!
// Continue to APIMapping...        // But new reconcile starts here
```

**Correct Pattern:**
```rust
// After checking DomainName is ready...
// Do NOT update status, just continue
// Only update status when returning early OR at the very end
```

**Solutions:**

1. **Verify controller follows status update rules:**
   - Status updates only when returning early (waiting for something)
   - Status updates only at the very end (final ready/error)
   - NO status updates mid-reconciliation that then continue

2. **Check for intermediate status methods:**
   ```bash
   grep -n "update_status" controller.rs | grep -v "return"
   # Should NOT find update_status calls that aren't followed by return
   ```

3. **Force reconciliation to reset:**
   ```bash
   kubectl annotate apigatewaydomains <name> -n <namespace> force-reconcile=$(date +%s) --overwrite
   ```

---

## Debugging Techniques

### Enable Debug Logging

```yaml
# In deployment
env:
  - name: RUST_LOG
    value: "ack_bridge=debug,kube=info"
```

### Watch Reconciliation in Real-Time

```bash
kubectl logs deployment/ack-bridge -n kro-system -f | grep "reconcil"
```

### Trace Specific Resource

```bash
kubectl logs deployment/ack-bridge -n kro-system -f | grep "my-domain"
```

### Check Event History

```bash
kubectl get events -n <namespace> --field-selector involvedObject.name=<resource-name>
```

### Manual Reconciliation Test

```bash
# Add annotation to trigger reconciliation
kubectl annotate apigatewaydomains <name> -n <namespace> test=$(date +%s)

# Watch logs
kubectl logs deployment/ack-bridge -n kro-system -f
```

## Recovery Procedures

### Full Resource Reset

```bash
# 1. Delete K8s resource (may get stuck)
kubectl delete apigatewaydomains <name> -n <namespace> --timeout=30s

# 2. If stuck, remove finalizers
kubectl patch apigatewaydomains <name> -n <namespace> --type=json \
  -p='[{"op": "remove", "path": "/metadata/finalizers"}]'

# 3. Clean up AWS resources manually
aws apigatewayv2 delete-api-mapping --domain-name api.example.com --api-mapping-id xxx
aws apigatewayv2 delete-domain-name --domain-name api.example.com
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://delete.json

# 4. Wait for cleanup
sleep 10

# 5. Recreate
kubectl apply -f my-resource.yaml
```

### Clean Delete/Re-apply Test

```bash
# The gold standard idempotency test
kubectl apply -f my-service.yaml
kubectl wait --for=condition=Ready myservice/test --timeout=300s

kubectl delete -f my-service.yaml
kubectl wait --for=delete myservice/test --timeout=60s

kubectl apply -f my-service.yaml
kubectl wait --for=condition=Ready myservice/test --timeout=300s

# Should succeed without errors
```
