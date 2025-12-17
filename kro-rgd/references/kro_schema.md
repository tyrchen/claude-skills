# KRO ResourceGraphDefinition Schema Reference

Complete reference for KRO ResourceGraphDefinition structure and fields.

## RGD Structure

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: <rgd-name>
  namespace: <namespace>  # Optional
  labels: {}
  annotations: {}
spec:
  schema:
    apiVersion: <version>      # e.g., "v1alpha1"
    kind: <CustomKind>         # e.g., "Application"
    spec: {}                   # User-configurable fields
    status: {}                 # Auto-populated fields
    validation: []             # CEL validation rules
  resources: []                # Kubernetes resources to create
status:
  conditions: []               # RGD status conditions
  state: ""                    # Active, Inactive, Error
  topologicalOrder: []         # Computed resource order
```

## Schema Section

### API Definition

```yaml
schema:
  apiVersion: v1alpha1         # Version of your custom API
  kind: Application            # Custom resource kind
```

### Spec Fields

Define user-configurable fields with types and defaults:

```yaml
spec:
  # String field
  name: string

  # String with default
  image: string | default="nginx:latest"

  # Integer field
  replicas: integer | default=3

  # Boolean field
  enabled: boolean | default=false

  # Nested object
  resources:
    cpu: string | default="100m"
    memory: string | default="256Mi"

  # Optional nested object
  ingress:
    enabled: boolean | default=false
    host: string | default=""
    tlsEnabled: boolean | default=false
```

### Supported Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | `"nginx:latest"` |
| `integer` | Whole number | `3` |
| `boolean` | True/false | `true` |
| `object` | Nested structure | `{key: value}` |
| `array` | List of values | `["a", "b"]` |

### Status Fields

Define auto-populated status fields using CEL expressions:

```yaml
status:
  # Boolean status
  ready: ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}

  # Integer status
  availableReplicas: ${deployment.status.availableReplicas}

  # String status with null safety
  endpoint: ${service.spec.?clusterIP ?? 'pending'}

  # Nested status
  conditions: ${deployment.status.conditions}
```

### Validation Rules

CEL-based validation for user input:

```yaml
validation:
  # Range validation
  - expression: "self.replicas >= 1 && self.replicas <= 100"
    message: "Replicas must be between 1 and 100"

  # Enum validation
  - expression: "self.environment in ['dev', 'staging', 'prod']"
    message: "Environment must be one of: dev, staging, prod"

  # Conditional validation
  - expression: "self.ingress.enabled ? self.ingress.host != '' : true"
    message: "Ingress host required when ingress is enabled"

  # Cross-field validation
  - expression: "self.environment == 'prod' ? self.replicas >= 3 : true"
    message: "Production environment requires at least 3 replicas"

  # Format validation
  - expression: "self.email.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$')"
    message: "Must be a valid email address"
```

## Resources Section

### Resource Definition

```yaml
resources:
  - id: <resourceId>           # Unique identifier (lowerCamelCase)
    template: {}               # Kubernetes resource YAML
    readyWhen: []              # Readiness conditions
    includeWhen: []            # Conditional inclusion
    externalRef: {}            # Reference to external resource
```

### Resource ID

- Must be unique within the RGD
- Use lowerCamelCase naming
- Referenced by other resources using `${resourceId.field}`

```yaml
resources:
  - id: deployment             # Referenced as ${deployment.xxx}
  - id: configMap              # Referenced as ${configMap.xxx}
  - id: databaseSecret         # Referenced as ${databaseSecret.xxx}
```

### Template

Standard Kubernetes resource YAML with CEL expressions:

```yaml
resources:
  - id: deployment
    template:
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: ${schema.spec.name}
        namespace: ${schema.metadata.namespace}
        labels:
          app: ${schema.spec.name}
          env: ${schema.spec.environment}
      spec:
        replicas: ${schema.spec.replicas}
        selector:
          matchLabels:
            app: ${schema.spec.name}
        template:
          metadata:
            labels:
              app: ${schema.spec.name}
          spec:
            containers:
              - name: app
                image: ${schema.spec.image}
                ports:
                  - containerPort: ${schema.spec.port}
                env:
                  - name: ENV
                    value: ${schema.spec.environment}
                resources:
                  requests:
                    cpu: ${schema.spec.resources.cpu}
                    memory: ${schema.spec.resources.memory}
```

### ReadyWhen Conditions

Define when a resource is considered ready:

```yaml
resources:
  - id: deployment
    template: {}
    readyWhen:
      # Check deployment conditions
      - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}

      # Check replica count
      - ${deployment.status.readyReplicas == deployment.spec.replicas}

      # Check updated replicas
      - ${deployment.status.updatedReplicas == deployment.spec.replicas}

  - id: database
    template: {}
    readyWhen:
      # Use optional access for status that may not exist yet
      - ${database.status.?ready == true}
      - ${database.status.?endpoint != null}
```

### IncludeWhen Conditions

Conditionally include resources:

```yaml
resources:
  # Always created
  - id: deployment
    template: {}

  # Only created when ingress is enabled
  - id: ingress
    includeWhen:
      - ${schema.spec.ingress.enabled}
    template:
      apiVersion: networking.k8s.io/v1
      kind: Ingress
      metadata:
        name: ${schema.spec.name}-ingress
      spec:
        rules:
          - host: ${schema.spec.ingress.host}
            http:
              paths:
                - path: /
                  pathType: Prefix
                  backend:
                    service:
                      name: ${service.metadata.name}
                      port:
                        number: 80

  # Only in production environment
  - id: hpa
    includeWhen:
      - ${schema.spec.environment == 'prod'}
    template:
      apiVersion: autoscaling/v2
      kind: HorizontalPodAutoscaler
      metadata:
        name: ${schema.spec.name}-hpa
      spec:
        scaleTargetRef:
          apiVersion: apps/v1
          kind: Deployment
          name: ${deployment.metadata.name}
        minReplicas: 3
        maxReplicas: 20
```

### External References

Reference existing resources not managed by this RGD:

```yaml
resources:
  - id: existingSecret
    externalRef:
      apiVersion: v1
      kind: Secret
      name: ${schema.spec.secretName}
      namespace: ${schema.metadata.namespace}

  - id: deployment
    template:
      apiVersion: apps/v1
      kind: Deployment
      spec:
        template:
          spec:
            containers:
              - name: app
                env:
                  - name: SECRET_VALUE
                    valueFrom:
                      secretKeyRef:
                        name: ${existingSecret.metadata.name}
                        key: value
```

## Dependency Management

### Automatic Detection

KRO automatically detects dependencies from CEL expressions:

```yaml
resources:
  - id: configmap
    template:
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: app-config
      data:
        config.json: '{"key": "value"}'

  - id: deployment
    template:
      apiVersion: apps/v1
      kind: Deployment
      spec:
        template:
          spec:
            volumes:
              - name: config
                configMap:
                  # This creates a dependency: deployment -> configmap
                  name: ${configmap.metadata.name}
```

### Dependency Graph

KRO builds a DAG and creates resources in topological order:

```
configmap -> deployment -> service -> ingress
    |
    v
  secret -> database
```

### Creation Order

1. Resources with no dependencies created first (in parallel)
2. Dependent resources created after dependencies are ready
3. Each resource waits for `readyWhen` conditions before proceeding

### Deletion Order

Resources deleted in reverse topological order to ensure dependents are removed before dependencies.

## Status Section (Managed by KRO)

```yaml
status:
  conditions:
    - type: Ready
      status: "True"
      reason: AllResourcesReady
      message: "All resources are ready"
      lastTransitionTime: "2025-01-15T10:30:00Z"
    - type: Progressing
      status: "False"
      reason: Stable
      message: "All resources stable"
  state: Active              # Active, Inactive, Error
  topologicalOrder:          # Computed creation order
    - configmap
    - deployment
    - service
    - ingress
```

## Complete Example

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: web-application
  annotations:
    kro.run/description: "Web application with optional ingress and monitoring"
spec:
  schema:
    apiVersion: v1alpha1
    kind: WebApplication
    spec:
      name: string
      image: string | default="nginx:latest"
      replicas: integer | default=3
      port: integer | default=80
      environment: string | default="dev"
      resources:
        cpu: string | default="100m"
        memory: string | default="256Mi"
      ingress:
        enabled: boolean | default=false
        host: string | default=""
        tlsEnabled: boolean | default=false
      monitoring:
        enabled: boolean | default=false
    status:
      ready: ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}
      availableReplicas: ${deployment.status.availableReplicas}
      serviceIP: ${service.spec.clusterIP}
      ingressURL: ${ingress.status.?loadBalancer.ingress[0].hostname ?? ''}
    validation:
      - expression: "self.replicas >= 1 && self.replicas <= 100"
        message: "Replicas must be between 1 and 100"
      - expression: "self.environment in ['dev', 'staging', 'prod']"
        message: "Environment must be dev, staging, or prod"
      - expression: "self.ingress.enabled ? self.ingress.host != '' : true"
        message: "Ingress host required when ingress is enabled"
      - expression: "self.environment == 'prod' ? self.replicas >= 3 : true"
        message: "Production environment requires at least 3 replicas"

  resources:
    - id: deployment
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${schema.spec.name}
          labels:
            app: ${schema.spec.name}
            environment: ${schema.spec.environment}
        spec:
          replicas: ${schema.spec.replicas}
          selector:
            matchLabels:
              app: ${schema.spec.name}
          template:
            metadata:
              labels:
                app: ${schema.spec.name}
                environment: ${schema.spec.environment}
            spec:
              containers:
                - name: app
                  image: ${schema.spec.image}
                  ports:
                    - containerPort: ${schema.spec.port}
                  resources:
                    requests:
                      cpu: ${schema.spec.resources.cpu}
                      memory: ${schema.spec.resources.memory}
                    limits:
                      cpu: ${schema.spec.resources.cpu}
                      memory: ${schema.spec.resources.memory}
      readyWhen:
        - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}

    - id: service
      template:
        apiVersion: v1
        kind: Service
        metadata:
          name: ${schema.spec.name}-service
        spec:
          selector: ${deployment.spec.selector.matchLabels}
          ports:
            - protocol: TCP
              port: 80
              targetPort: ${schema.spec.port}
          type: ClusterIP

    - id: ingress
      includeWhen:
        - ${schema.spec.ingress.enabled}
      template:
        apiVersion: networking.k8s.io/v1
        kind: Ingress
        metadata:
          name: ${schema.spec.name}-ingress
          annotations:
            kubernetes.io/ingress.class: nginx
        spec:
          tls: ${schema.spec.ingress.tlsEnabled ? [{"hosts": [schema.spec.ingress.host], "secretName": schema.spec.name + "-tls"}] : []}
          rules:
            - host: ${schema.spec.ingress.host}
              http:
                paths:
                  - path: /
                    pathType: Prefix
                    backend:
                      service:
                        name: ${service.metadata.name}
                        port:
                          number: 80

    - id: serviceMonitor
      includeWhen:
        - ${schema.spec.monitoring.enabled}
      template:
        apiVersion: monitoring.coreos.com/v1
        kind: ServiceMonitor
        metadata:
          name: ${schema.spec.name}-monitor
        spec:
          selector:
            matchLabels:
              app: ${schema.spec.name}
          endpoints:
            - port: http
              interval: 30s
```

## Usage Example

```yaml
apiVersion: v1alpha1
kind: WebApplication
metadata:
  name: production-frontend
  namespace: default
spec:
  name: frontend
  image: myregistry.io/frontend:v2.1.0
  replicas: 5
  port: 8080
  environment: prod
  resources:
    cpu: "500m"
    memory: "1Gi"
  ingress:
    enabled: true
    host: frontend.example.com
    tlsEnabled: true
  monitoring:
    enabled: true
```
