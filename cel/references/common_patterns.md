# Common CEL Patterns for Kubernetes

Production-ready CEL expression patterns organized by use case.

## Security Patterns

### Pod Security Standards - Baseline

```yaml
# Disallow privileged containers
- expression: |
    !has(object.spec.template.spec.containers) ||
    !object.spec.template.spec.containers.exists(c,
      has(c.securityContext) &&
      has(c.securityContext.privileged) &&
      c.securityContext.privileged == true
    )
  message: "Privileged containers are not allowed"

# Disallow privilege escalation
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.securityContext) ||
      !has(c.securityContext.allowPrivilegeEscalation) ||
      c.securityContext.allowPrivilegeEscalation == false
    )
  message: "Privilege escalation must be explicitly disabled"

# Disallow hostNetwork
- expression: |
    !has(object.spec.template.spec.hostNetwork) ||
    object.spec.template.spec.hostNetwork == false
  message: "hostNetwork is not allowed"

# Disallow hostPID
- expression: |
    !has(object.spec.template.spec.hostPID) ||
    object.spec.template.spec.hostPID == false
  message: "hostPID is not allowed"

# Disallow hostIPC
- expression: |
    !has(object.spec.template.spec.hostIPC) ||
    object.spec.template.spec.hostIPC == false
  message: "hostIPC is not allowed"

# Disallow hostPath volumes
- expression: |
    !has(object.spec.template.spec.volumes) ||
    object.spec.template.spec.volumes.all(v, !has(v.hostPath))
  message: "hostPath volumes are not allowed"

# Restrict host ports
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.ports) ||
      c.ports.all(p, !has(p.hostPort) || p.hostPort == 0)
    )
  message: "Host ports are not allowed"
```

### Pod Security Standards - Restricted

```yaml
# Require non-root containers
- expression: |
    has(object.spec.template.spec.securityContext) &&
    has(object.spec.template.spec.securityContext.runAsNonRoot) &&
    object.spec.template.spec.securityContext.runAsNonRoot == true
  message: "Pods must run as non-root user (runAsNonRoot: true required)"

# Require specific runAsUser (not root)
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.securityContext) ||
      !has(c.securityContext.runAsUser) ||
      c.securityContext.runAsUser >= 1000
    )
  message: "Container runAsUser must be >= 1000 (non-root)"

# Drop all capabilities
- expression: |
    object.spec.template.spec.containers.all(c,
      has(c.securityContext) &&
      has(c.securityContext.capabilities) &&
      has(c.securityContext.capabilities.drop) &&
      c.securityContext.capabilities.drop.exists(cap, cap == 'ALL')
    )
  message: "All containers must drop ALL capabilities"

# Restrict allowed capabilities
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.securityContext) ||
      !has(c.securityContext.capabilities) ||
      !has(c.securityContext.capabilities.add) ||
      c.securityContext.capabilities.add.all(cap,
        cap in ['NET_BIND_SERVICE']
      )
    )
  message: "Only NET_BIND_SERVICE capability is allowed"

# Require read-only root filesystem
- expression: |
    object.spec.template.spec.containers.all(c,
      has(c.securityContext) &&
      has(c.securityContext.readOnlyRootFilesystem) &&
      c.securityContext.readOnlyRootFilesystem == true
    )
  message: "Containers must use read-only root filesystem"

# Require seccomp profile
- expression: |
    has(object.spec.template.spec.securityContext) &&
    has(object.spec.template.spec.securityContext.seccompProfile) &&
    object.spec.template.spec.securityContext.seccompProfile.type in ['RuntimeDefault', 'Localhost']
  message: "Pods must use RuntimeDefault or Localhost seccomp profile"

# Restrict volume types
- expression: |
    !has(object.spec.template.spec.volumes) ||
    object.spec.template.spec.volumes.all(v,
      has(v.configMap) ||
      has(v.secret) ||
      has(v.emptyDir) ||
      has(v.persistentVolumeClaim) ||
      has(v.projected) ||
      has(v.downwardAPI)
    )
  message: "Only configMap, secret, emptyDir, PVC, projected, and downwardAPI volumes are allowed"
```

### Image Security

```yaml
# Restrict to approved registries
- expression: |
    object.spec.template.spec.containers.all(c,
      c.image.startsWith('myregistry.io/') ||
      c.image.startsWith('gcr.io/myproject/') ||
      c.image.startsWith('docker.io/library/')
    )
  message: "Container images must come from approved registries: myregistry.io, gcr.io/myproject, docker.io/library"
  messageExpression: |
    'Container ' + object.spec.template.spec.containers.filter(c,
      !c.image.startsWith('myregistry.io/') &&
      !c.image.startsWith('gcr.io/myproject/') &&
      !c.image.startsWith('docker.io/library/')
    )[0].name + ' uses unapproved image: ' + object.spec.template.spec.containers.filter(c,
      !c.image.startsWith('myregistry.io/') &&
      !c.image.startsWith('gcr.io/myproject/') &&
      !c.image.startsWith('docker.io/library/')
    )[0].image

# Disallow latest tag
- expression: |
    object.spec.template.spec.containers.all(c,
      c.image.contains(':') && !c.image.endsWith(':latest')
    )
  message: "Container images must use specific version tags, not 'latest'"

# Require semantic versioning tag
- expression: |
    object.spec.template.spec.containers.all(c,
      c.image.contains(':') &&
      c.image.split(':')[1].matches('^v?[0-9]+\\.[0-9]+\\.[0-9]+(-[a-zA-Z0-9]+)?$')
    )
  message: "Container images must use semantic versioning (e.g., v1.2.3 or 1.2.3)"

# Require image digest
- expression: |
    object.spec.template.spec.containers.all(c,
      c.image.contains('@sha256:')
    )
  message: "Container images must use digest (sha256) for immutability"

# Include init containers in image checks
- expression: |
    (!has(object.spec.template.spec.initContainers) ||
     object.spec.template.spec.initContainers.all(c, c.image.startsWith('myregistry.io/'))) &&
    object.spec.template.spec.containers.all(c, c.image.startsWith('myregistry.io/'))
  message: "All containers (including init containers) must use images from myregistry.io"
```

## Resource Management Patterns

### Resource Limits and Requests

```yaml
# Require resource limits and requests
- expression: |
    object.spec.template.spec.containers.all(c,
      has(c.resources) &&
      has(c.resources.limits) &&
      has(c.resources.limits.memory) &&
      has(c.resources.limits.cpu) &&
      has(c.resources.requests) &&
      has(c.resources.requests.memory) &&
      has(c.resources.requests.cpu)
    )
  message: "All containers must define CPU and memory limits and requests"

# Enforce maximum CPU limit
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.resources) ||
      !has(c.resources.limits) ||
      !has(c.resources.limits.cpu) ||
      quantity(c.resources.limits.cpu) <= quantity('4')
    )
  message: "Container CPU limit cannot exceed 4 cores"

# Enforce maximum memory limit
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.resources) ||
      !has(c.resources.limits) ||
      !has(c.resources.limits.memory) ||
      quantity(c.resources.limits.memory) <= quantity('8Gi')
    )
  message: "Container memory limit cannot exceed 8Gi"

# Ensure limits >= requests
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.resources) ||
      !has(c.resources.limits) ||
      !has(c.resources.requests) ||
      (
        (!has(c.resources.limits.cpu) || !has(c.resources.requests.cpu) ||
         quantity(c.resources.limits.cpu) >= quantity(c.resources.requests.cpu)) &&
        (!has(c.resources.limits.memory) || !has(c.resources.requests.memory) ||
         quantity(c.resources.limits.memory) >= quantity(c.resources.requests.memory))
      )
    )
  message: "Resource limits must be greater than or equal to requests"

# Enforce CPU request/limit ratio
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.resources) ||
      !has(c.resources.limits) ||
      !has(c.resources.requests) ||
      !has(c.resources.limits.cpu) ||
      !has(c.resources.requests.cpu) ||
      double(quantity(c.resources.limits.cpu)) / double(quantity(c.resources.requests.cpu)) <= 2.0
    )
  message: "CPU limit cannot be more than 2x the request (burstable limit)"
```

### Replica Constraints

```yaml
# Minimum replicas
- expression: |
    !has(object.spec.replicas) || object.spec.replicas >= 2
  message: "Deployment must have at least 2 replicas for high availability"

# Maximum replicas
- expression: |
    !has(object.spec.replicas) || object.spec.replicas <= 100
  message: "Deployment cannot exceed 100 replicas"

# Replica range
- expression: |
    object.spec.replicas >= 1 && object.spec.replicas <= 50
  message: "Replicas must be between 1 and 50"

# Production minimum replicas (with namespace check)
- expression: |
    !('environment' in object.metadata.labels) ||
    object.metadata.labels['environment'] != 'production' ||
    (has(object.spec.replicas) && object.spec.replicas >= 3)
  message: "Production deployments must have at least 3 replicas"
```

## Label and Annotation Patterns

### Required Labels

```yaml
# Require standard labels
- expression: |
    has(object.metadata.labels) &&
    'app.kubernetes.io/name' in object.metadata.labels &&
    'app.kubernetes.io/version' in object.metadata.labels &&
    'app.kubernetes.io/component' in object.metadata.labels
  message: "Resources must have standard Kubernetes labels: app.kubernetes.io/name, version, component"

# Require organizational labels
- expression: |
    has(object.metadata.labels) &&
    'team' in object.metadata.labels &&
    'cost-center' in object.metadata.labels
  message: "Resources must have 'team' and 'cost-center' labels for billing"

# Validate environment label values
- expression: |
    !has(object.metadata.labels) ||
    !('environment' in object.metadata.labels) ||
    object.metadata.labels['environment'] in ['dev', 'staging', 'production']
  message: "environment label must be one of: dev, staging, production"

# Validate label naming convention
- expression: |
    !has(object.metadata.labels) ||
    object.metadata.labels.all(k, v,
      k.matches('^[a-z][a-z0-9-./]*[a-z0-9]$') &&
      k.size() <= 63
    )
  message: "Label keys must be lowercase alphanumeric with hyphens, dots, or slashes"

# Validate label value format
- expression: |
    !has(object.metadata.labels) ||
    object.metadata.labels.all(k, v,
      v.size() <= 63 &&
      (v.size() == 0 || v.matches('^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$'))
    )
  message: "Label values must be <= 63 characters and follow Kubernetes naming conventions"
```

### Required Annotations

```yaml
# Require owner annotation
- expression: |
    has(object.metadata.annotations) &&
    'owner' in object.metadata.annotations &&
    object.metadata.annotations['owner'].matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
  message: "Resources must have 'owner' annotation with valid email address"

# Require description annotation
- expression: |
    has(object.metadata.annotations) &&
    'description' in object.metadata.annotations &&
    object.metadata.annotations['description'].size() >= 10 &&
    object.metadata.annotations['description'].size() <= 500
  message: "Resources must have 'description' annotation (10-500 characters)"

# Require on-call contact
- expression: |
    has(object.metadata.annotations) &&
    'on-call' in object.metadata.annotations
  message: "Resources must have 'on-call' annotation for incident response"
```

## Naming Convention Patterns

### Resource Names

```yaml
# Kubernetes DNS name format
- expression: |
    object.metadata.name.matches('^[a-z][a-z0-9-]*[a-z0-9]$') &&
    object.metadata.name.size() <= 63
  message: "Name must be lowercase alphanumeric with hyphens, max 63 characters"

# Require environment prefix
- expression: |
    object.metadata.name.startsWith('dev-') ||
    object.metadata.name.startsWith('staging-') ||
    object.metadata.name.startsWith('prod-')
  message: "Resource name must start with environment prefix: dev-, staging-, or prod-"

# Require team prefix
- expression: |
    has(object.metadata.labels) &&
    'team' in object.metadata.labels &&
    object.metadata.name.startsWith(object.metadata.labels['team'] + '-')
  message: "Resource name must start with team name prefix"

# Disallow certain name patterns
- expression: |
    !object.metadata.name.contains('test') &&
    !object.metadata.name.contains('tmp') &&
    !object.metadata.name.contains('temp')
  message: "Resource names cannot contain 'test', 'tmp', or 'temp'"
```

### Container Names

```yaml
# Validate container names
- expression: |
    object.spec.template.spec.containers.all(c,
      c.name.matches('^[a-z][a-z0-9-]*[a-z0-9]$') &&
      c.name.size() <= 63
    )
  message: "Container names must be lowercase alphanumeric with hyphens"

# Unique container names
- expression: |
    object.spec.template.spec.containers.map(c, c.name).size() ==
    size(object.spec.template.spec.containers)
  message: "Container names must be unique within a pod"
```

## Service and Networking Patterns

### Service Configuration

```yaml
# Disallow LoadBalancer in non-production
- expression: |
    object.spec.type != 'LoadBalancer' ||
    (has(object.metadata.labels) &&
     'environment' in object.metadata.labels &&
     object.metadata.labels['environment'] == 'production')
  message: "LoadBalancer services are only allowed in production"

# Require ClusterIP or NodePort only
- expression: |
    !has(object.spec.type) ||
    object.spec.type in ['ClusterIP', 'NodePort']
  message: "Only ClusterIP and NodePort service types are allowed"

# Restrict NodePort range
- expression: |
    !has(object.spec.ports) ||
    object.spec.ports.all(p,
      !has(p.nodePort) ||
      (p.nodePort >= 30000 && p.nodePort <= 32767)
    )
  message: "NodePort must be in range 30000-32767"
```

### Ingress Configuration

```yaml
# Require TLS
- expression: |
    has(object.spec.tls) && size(object.spec.tls) > 0
  message: "Ingress must have TLS configuration"

# Validate host patterns
- expression: |
    !has(object.spec.rules) ||
    object.spec.rules.all(r,
      has(r.host) &&
      (r.host.endsWith('.example.com') || r.host.endsWith('.internal'))
    )
  message: "Ingress hosts must be under example.com or internal domains"

# Require ingress class
- expression: |
    has(object.spec.ingressClassName) &&
    object.spec.ingressClassName in ['nginx', 'traefik', 'internal']
  message: "Ingress must specify ingressClassName: nginx, traefik, or internal"
```

## Deployment Strategy Patterns

```yaml
# Require rolling update strategy
- expression: |
    !has(object.spec.strategy) ||
    !has(object.spec.strategy.type) ||
    object.spec.strategy.type == 'RollingUpdate'
  message: "Deployments must use RollingUpdate strategy"

# Limit max surge
- expression: |
    !has(object.spec.strategy) ||
    !has(object.spec.strategy.rollingUpdate) ||
    !has(object.spec.strategy.rollingUpdate.maxSurge) ||
    (
      // Handle percentage
      (string(object.spec.strategy.rollingUpdate.maxSurge).endsWith('%') &&
       int(string(object.spec.strategy.rollingUpdate.maxSurge).replace('%', '')) <= 50) ||
      // Handle integer
      (!string(object.spec.strategy.rollingUpdate.maxSurge).endsWith('%') &&
       int(object.spec.strategy.rollingUpdate.maxSurge) <= 5)
    )
  message: "maxSurge must be <= 50% or <= 5 pods"

# Require PodDisruptionBudget-compatible settings
- expression: |
    !has(object.spec.strategy) ||
    !has(object.spec.strategy.rollingUpdate) ||
    !has(object.spec.strategy.rollingUpdate.maxUnavailable) ||
    string(object.spec.strategy.rollingUpdate.maxUnavailable) != '0'
  message: "maxUnavailable cannot be 0 (incompatible with PDB)"
```

## Health Check Patterns

```yaml
# Require liveness probe
- expression: |
    object.spec.template.spec.containers.all(c, has(c.livenessProbe))
  message: "All containers must have liveness probes"

# Require readiness probe
- expression: |
    object.spec.template.spec.containers.all(c, has(c.readinessProbe))
  message: "All containers must have readiness probes"

# Require startup probe for slow-starting apps
- expression: |
    object.spec.template.spec.containers.all(c,
      !has(c.livenessProbe) ||
      !has(c.livenessProbe.initialDelaySeconds) ||
      c.livenessProbe.initialDelaySeconds <= 30 ||
      has(c.startupProbe)
    )
  message: "Containers with initialDelaySeconds > 30 should use startupProbe instead"

# Validate probe timeouts
- expression: |
    object.spec.template.spec.containers.all(c,
      (!has(c.livenessProbe) || !has(c.livenessProbe.timeoutSeconds) || c.livenessProbe.timeoutSeconds <= 10) &&
      (!has(c.readinessProbe) || !has(c.readinessProbe.timeoutSeconds) || c.readinessProbe.timeoutSeconds <= 10)
    )
  message: "Probe timeouts should not exceed 10 seconds"
```

## Update/Mutation Patterns (for CRD validation)

```yaml
# Immutable field
x-kubernetes-validations:
- rule: "oldSelf == self"
  message: "This field is immutable and cannot be changed"

# Only allow specific field changes
x-kubernetes-validations:
- rule: "oldSelf.name == self.name"
  message: "Name cannot be changed after creation"

# Monotonic increase only
x-kubernetes-validations:
- rule: "self >= oldSelf"
  message: "Value can only be increased, not decreased"

# Prevent deletion of map keys
x-kubernetes-validations:
- rule: "oldSelf.all(k, k in self)"
  message: "Existing keys cannot be removed"

# Limit rate of change
x-kubernetes-validations:
- rule: "self <= oldSelf + 10"
  message: "Value can only increase by at most 10 per update"
```

## Parameterized Policy Patterns

```yaml
# Policy with ConfigMap parameters
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: configurable-replica-limit
spec:
  paramKind:
    apiVersion: v1
    kind: ConfigMap
  matchConstraints:
    resourceRules:
    - apiGroups: ["apps"]
      apiVersions: ["v1"]
      operations: ["CREATE", "UPDATE"]
      resources: ["deployments"]
  validations:
  - expression: "object.spec.replicas <= int(params.data.maxReplicas)"
    messageExpression: "'Replicas ' + string(object.spec.replicas) + ' exceeds limit ' + params.data.maxReplicas"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: replica-limits
data:
  maxReplicas: "10"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: replica-limit-binding
spec:
  policyName: configurable-replica-limit
  validationActions: [Deny]
  paramRef:
    name: replica-limits
    namespace: default
```

## Cross-Field Validation Patterns

```yaml
# Mutual exclusivity
- expression: |
    (has(object.spec.configMapRef) && !has(object.spec.secretRef)) ||
    (!has(object.spec.configMapRef) && has(object.spec.secretRef))
  message: "Must specify exactly one of configMapRef or secretRef"

# Conditional requirement
- expression: |
    object.spec.type != 'external' ||
    has(object.spec.externalURL)
  message: "externalURL is required when type is 'external'"

# Array uniqueness
- expression: |
    object.spec.ports.map(p, string(p.containerPort)).size() ==
    size(object.spec.ports)
  message: "Container ports must be unique"

# Dependent fields
- expression: |
    !has(object.spec.tlsSecret) ||
    (has(object.spec.protocol) && object.spec.protocol == 'HTTPS')
  message: "tlsSecret can only be specified when protocol is HTTPS"
```
