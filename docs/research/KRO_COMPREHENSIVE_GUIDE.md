# KRO (Kube Resource Orchestrator) - Comprehensive Guide

## Table of Contents
1. [What is KRO and What Problem Does It Solve?](#what-is-kro)
2. [ResourceGraphDefinition (RGD) - Purpose and Structure](#resourcegraphdefinition-rgd)
3. [How RGD Works - Schema, Fields, and Orchestration](#how-rgd-works)
4. [Complete RGD Examples](#complete-rgd-examples)
5. [Creating Custom APIs on Kubernetes](#creating-custom-apis)
6. [CEL Expressions in RGD](#cel-expressions-in-rgd)
7. [Best Practices for Writing RGDs](#best-practices)
8. [Current Status and Requirements](#current-status-and-requirements)

---

## What is KRO and What Problem Does It Solve? {#what-is-kro}

### Overview

**KRO (Kube Resource Orchestrator)** is an open-source, Kubernetes-native project that allows you to define custom Kubernetes APIs using simple and straightforward configuration. It's a subproject of Kubernetes SIG Cloud Provider, developed collaboratively by AWS, Google Cloud, and Microsoft Azure.

### The Problem KRO Solves

**Complexity in Kubernetes Resource Management:**
- Deploying applications in Kubernetes often requires creating multiple related resources (Deployments, Services, ConfigMaps, Ingresses, etc.)
- Managing dependencies between resources is manual and error-prone
- Creating abstractions for platform teams requires writing custom operators or controllers (complex)
- Existing tools like Helm focus on templating but don't manage resource lifecycles or dependencies natively

**KRO's Solution:**
- Create custom Kubernetes APIs that group multiple resources as a single unit
- Define resource dependencies declaratively using CEL expressions
- Automatic dependency resolution and creation ordering
- Full lifecycle management with drift detection and reconciliation
- No need to write custom controllers in Go or other languages

### Key Differentiators

**vs Helm:**
- Helm is a templating and package manager
- KRO creates true custom APIs with lifecycle management and dependency orchestration
- KRO provides type-safe CEL expressions vs string-based templating

**vs Crossplane:**
- Crossplane focuses on infrastructure provisioning across clouds
- KRO is lighter-weight and focuses on Kubernetes-native resource composition
- KRO has simpler learning curve and faster development cycle

**vs Custom Operators:**
- Writing custom operators requires Go programming and deep controller knowledge
- KRO uses declarative YAML with CEL expressions
- Faster iteration and simpler maintenance

---

## ResourceGraphDefinition (RGD) - Purpose and Structure {#resourcegraphdefinition-rgd}

### What is ResourceGraphDefinition?

A **ResourceGraphDefinition (RGD)** is KRO's fundamental custom resource. It defines a collection of Kubernetes resources and their relationships as a directed acyclic graph (DAG).

**Key Concept:** When you create an RGD, KRO automatically:
1. Validates the definition and CEL expressions
2. Generates a new Custom Resource Definition (CRD)
3. Registers it with the Kubernetes API server
4. Deploys a dedicated microcontroller to manage instances

### RGD Structure

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: <rgd-name>                    # Name of your custom API
  namespace: <namespace>              # Optional namespace
spec:
  schema:                             # Define your custom API structure
    apiVersion: <version>             # API version (e.g., v1alpha1)
    kind: <CustomKind>                # Custom resource kind
    spec: {}                          # User-configurable fields
    status: {}                        # Auto-populated status fields
  resources: []                       # Kubernetes resources to create
status:                               # Managed by KRO
  conditions: []                      # Status conditions
  state: ""                           # Current state
  topologicalOrder: []                # Computed resource creation order
```

### Core Components

#### 1. Metadata Section
Standard Kubernetes resource metadata:
- `name`: Identifier for the RGD
- `namespace`: Where the RGD lives (optional)
- `labels`: Standard Kubernetes labels
- `annotations`: Additional metadata

#### 2. Schema Section
Defines your custom API interface:
- `apiVersion`: Version of your custom API
- `kind`: Name of your custom resource type
- `spec`: Fields users can configure
- `status`: Auto-populated fields from underlying resources
- `validation`: CEL-based validation rules

#### 3. Resources Section
List of Kubernetes resources to create:
- `id`: Unique identifier (lowerCamelCase)
- `template`: Actual Kubernetes resource YAML
- `readyWhen`: CEL expressions for readiness
- `includeWhen`: CEL expressions for conditional inclusion
- `externalRef`: Reference to external resources

#### 4. Status Section (Managed by KRO)
- `conditions`: Current state conditions
- `state`: Overall RGD state (Active, Inactive, etc.)
- `topologicalOrder`: Computed dependency order

---

## How RGD Works - Schema, Fields, and Orchestration {#how-rgd-works}

### Schema Definition

The schema defines what your custom API looks like to end users.

```yaml
spec:
  schema:
    apiVersion: v1alpha1
    kind: Application
    spec:
      # User-configurable fields with types and defaults
      name: string
      image: string | default="nginx:latest"
      replicas: integer | default=3
      environment: string | default="dev"
      ingress:
        enabled: boolean | default=false
        host: string | default=""
    status:
      # Auto-populated from underlying resources
      availableReplicas: ${deployment.status.availableReplicas}
      conditions: ${deployment.status.conditions}
      serviceEndpoint: ${service.spec.clusterIP}
      ingressURL: ${ingress.status.?loadBalancer.ingress[0].hostname}
    validation:
      # CEL-based validation rules
      - expression: "self.replicas >= 1 && self.replicas <= 100"
        message: "Replicas must be between 1 and 100"
      - expression: "self.ingress.enabled ? self.ingress.host != '' : true"
        message: "Ingress host must be specified when ingress is enabled"
```

### Field Type System

KRO supports standard types:
- `string`: Text values
- `integer`: Whole numbers
- `boolean`: true/false
- `object`: Nested structures
- `array`: Lists of values

**Default values:**
```yaml
image: string | default="nginx:latest"
replicas: integer | default=3
enabled: boolean | default=false
```

### Resource Definitions

Each resource in the `resources` array defines a Kubernetes object:

```yaml
resources:
  - id: deployment                    # lowerCamelCase identifier
    template:                         # Standard Kubernetes YAML
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: ${schema.spec.name}     # CEL expression referencing schema
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
                  - containerPort: 80
    readyWhen:                        # Wait for deployment to be ready
      - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}
```

### Dependency Management

KRO automatically builds a directed acyclic graph (DAG) from CEL expressions:

**Automatic Dependency Detection:**
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
                  name: ${configmap.metadata.name}  # Creates dependency
```

**Creation Order:**
1. KRO analyzes all CEL expressions
2. Builds dependency graph
3. Computes topological order
4. Creates resources in correct sequence
5. Waits for readiness before proceeding

**Deletion Order:**
- Resources deleted in reverse topological order
- Ensures dependents are removed before dependencies

**Parallel Creation:**
- Resources with no dependencies are created simultaneously
- Improves deployment speed

### Conditional Resource Inclusion

Use `includeWhen` to conditionally create resources:

```yaml
resources:
  - id: ingress
    includeWhen:
      - ${schema.spec.ingress.enabled}  # Only create if enabled
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
```

### Readiness Conditions

Control when KRO considers a resource ready:

```yaml
resources:
  - id: deployment
    template:
      # ... deployment spec
    readyWhen:
      # Wait for all conditions
      - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}
      - ${deployment.status.readyReplicas == deployment.spec.replicas}
      - ${deployment.status.updatedReplicas == deployment.spec.replicas}
```

### Validation and Type Checking

**KRO performs extensive validation when you create an RGD:**

1. **Schema Validation:**
   - Verifies field types are valid
   - Checks default values match types
   - Validates CEL syntax in validation rules

2. **Resource Validation:**
   - Verifies CRDs exist for all resource kinds
   - Fetches OpenAPI schemas from API server
   - Type-checks all CEL expressions against actual schemas
   - Validates field paths exist

3. **Dependency Validation:**
   - Detects circular dependencies (not allowed)
   - Ensures referenced resource IDs exist
   - Validates topological ordering is possible

4. **CEL Expression Validation:**
   - Syntax checking
   - Type compatibility
   - Field existence verification

**Errors are caught immediately** when creating the RGD, before any instances are deployed.

---

## Complete RGD Examples {#complete-rgd-examples}

### Example 1: Simple Web Application

This example creates a custom `Application` API that deploys a web app with Deployment and Service.

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: simple-webapp
spec:
  schema:
    apiVersion: v1alpha1
    kind: Application
    spec:
      name: string
      image: string | default="nginx:latest"
      replicas: integer | default=3
      port: integer | default=80
    status:
      availableReplicas: ${deployment.status.availableReplicas}
      serviceIP: ${service.spec.clusterIP}
  resources:
    - id: deployment
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${schema.spec.name}
          labels:
            app: ${schema.spec.name}
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
                - name: ${schema.spec.name}
                  image: ${schema.spec.image}
                  ports:
                    - containerPort: ${schema.spec.port}

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
```

**Using the Application API:**

```yaml
apiVersion: v1alpha1
kind: Application
metadata:
  name: my-web-app
spec:
  name: my-web-app
  image: nginx:1.21
  replicas: 5
  port: 8080
```

### Example 2: Application with Optional Ingress

Extends the previous example with conditional Ingress creation.

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: webapp-with-ingress
spec:
  schema:
    apiVersion: v1alpha1
    kind: WebApplication
    spec:
      name: string
      image: string | default="nginx:latest"
      replicas: integer | default=3
      port: integer | default=80
      ingress:
        enabled: boolean | default=false
        host: string | default=""
        tlsEnabled: boolean | default=false
        tlsSecretName: string | default=""
    status:
      availableReplicas: ${deployment.status.availableReplicas}
      serviceIP: ${service.spec.clusterIP}
      ingressURL: ${ingress.status.?loadBalancer.ingress[0].hostname}
    validation:
      - expression: "self.ingress.enabled ? self.ingress.host != '' : true"
        message: "Ingress host must be specified when ingress is enabled"
      - expression: "self.ingress.tlsEnabled ? self.ingress.tlsSecretName != '' : true"
        message: "TLS secret name required when TLS is enabled"
  resources:
    - id: deployment
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${schema.spec.name}
          labels:
            app: ${schema.spec.name}
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
                - name: ${schema.spec.name}
                  image: ${schema.spec.image}
                  ports:
                    - containerPort: ${schema.spec.port}
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
          tls: ${schema.spec.ingress.tlsEnabled ? [{"hosts": [schema.spec.ingress.host], "secretName": schema.spec.ingress.tlsSecretName}] : []}
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
```

**Using the WebApplication API:**

```yaml
apiVersion: v1alpha1
kind: WebApplication
metadata:
  name: production-app
spec:
  name: production-app
  image: myapp:v2.0
  replicas: 10
  port: 8080
  ingress:
    enabled: true
    host: app.example.com
    tlsEnabled: true
    tlsSecretName: app-tls-cert
```

### Example 3: Database-Backed Application

Shows dependency management between database and application.

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: app-with-database
spec:
  schema:
    apiVersion: v1alpha1
    kind: DatabaseApplication
    spec:
      appName: string
      appImage: string
      appReplicas: integer | default=3
      dbName: string
      dbStorageSize: string | default="10Gi"
      dbVersion: string | default="15"
    status:
      appStatus: ${deployment.status.conditions}
      appReplicas: ${deployment.status.availableReplicas}
      databaseEndpoint: ${database.status.?endpoint}
      databaseReady: ${database.status.?ready}
  resources:
    - id: dbSecret
      template:
        apiVersion: v1
        kind: Secret
        metadata:
          name: ${schema.spec.dbName}-credentials
        type: Opaque
        stringData:
          username: dbuser
          password: "${schema.spec.dbName}-${schema.metadata.uid}"  # Generate unique password
          database: ${schema.spec.dbName}

    - id: database
      template:
        apiVersion: postgresql.cnpg.io/v1
        kind: Cluster
        metadata:
          name: ${schema.spec.dbName}
        spec:
          instances: 3
          postgresql:
            version: ${schema.spec.dbVersion}
          storage:
            size: ${schema.spec.dbStorageSize}
          bootstrap:
            initdb:
              database: ${schema.spec.dbName}
              owner: dbuser
              secret:
                name: ${dbSecret.metadata.name}
      readyWhen:
        - ${database.status.?ready == true}
        - ${database.status.?instances > 0}

    - id: configmap
      template:
        apiVersion: v1
        kind: ConfigMap
        metadata:
          name: ${schema.spec.appName}-config
        data:
          DATABASE_HOST: ${database.status.?writeService}
          DATABASE_PORT: "5432"
          DATABASE_NAME: ${schema.spec.dbName}

    - id: deployment
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${schema.spec.appName}
        spec:
          replicas: ${schema.spec.appReplicas}
          selector:
            matchLabels:
              app: ${schema.spec.appName}
          template:
            metadata:
              labels:
                app: ${schema.spec.appName}
            spec:
              containers:
                - name: app
                  image: ${schema.spec.appImage}
                  env:
                    - name: DATABASE_HOST
                      valueFrom:
                        configMapKeyRef:
                          name: ${configmap.metadata.name}
                          key: DATABASE_HOST
                    - name: DATABASE_PORT
                      valueFrom:
                        configMapKeyRef:
                          name: ${configmap.metadata.name}
                          key: DATABASE_PORT
                    - name: DATABASE_NAME
                      valueFrom:
                        configMapKeyRef:
                          name: ${configmap.metadata.name}
                          key: DATABASE_NAME
                    - name: DATABASE_USER
                      valueFrom:
                        secretKeyRef:
                          name: ${dbSecret.metadata.name}
                          key: username
                    - name: DATABASE_PASSWORD
                      valueFrom:
                        secretKeyRef:
                          name: ${dbSecret.metadata.name}
                          key: password
      readyWhen:
        - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}

    - id: service
      template:
        apiVersion: v1
        kind: Service
        metadata:
          name: ${schema.spec.appName}-service
        spec:
          selector: ${deployment.spec.selector.matchLabels}
          ports:
            - protocol: TCP
              port: 80
              targetPort: 8080
```

**Dependency Graph:**
```
dbSecret
   |
   v
database --> configmap
   |            |
   v            v
      deployment
          |
          v
       service
```

### Example 4: Multi-Environment Application

Demonstrates conditional resources based on environment.

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: multi-env-app
spec:
  schema:
    apiVersion: v1alpha1
    kind: EnvironmentApplication
    spec:
      name: string
      image: string
      environment: string | default="dev"
      replicas: integer | default=1
      resources:
        requests:
          cpu: string | default="100m"
          memory: string | default="128Mi"
        limits:
          cpu: string | default="500m"
          memory: string | default="512Mi"
      monitoring:
        enabled: boolean | default=false
        scrapeInterval: string | default="30s"
    status:
      ready: ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}
      replicas: ${deployment.status.availableReplicas}
    validation:
      - expression: "self.environment in ['dev', 'staging', 'prod']"
        message: "Environment must be dev, staging, or prod"
      - expression: "self.environment == 'prod' ? self.replicas >= 3 : true"
        message: "Production environment requires at least 3 replicas"
  resources:
    - id: namespace
      template:
        apiVersion: v1
        kind: Namespace
        metadata:
          name: ${schema.spec.name}-${schema.spec.environment}
          labels:
            environment: ${schema.spec.environment}
            app: ${schema.spec.name}

    - id: resourceQuota
      includeWhen:
        - ${schema.spec.environment == 'dev' || schema.spec.environment == 'staging'}
      template:
        apiVersion: v1
        kind: ResourceQuota
        metadata:
          name: ${schema.spec.name}-quota
          namespace: ${namespace.metadata.name}
        spec:
          hard:
            requests.cpu: ${schema.spec.environment == 'dev' ? '2' : '4'}
            requests.memory: ${schema.spec.environment == 'dev' ? '4Gi' : '8Gi'}
            limits.cpu: ${schema.spec.environment == 'dev' ? '4' : '8'}
            limits.memory: ${schema.spec.environment == 'dev' ? '8Gi' : '16Gi'}

    - id: deployment
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${schema.spec.name}
          namespace: ${namespace.metadata.name}
          labels:
            app: ${schema.spec.name}
            environment: ${schema.spec.environment}
          annotations:
            prometheus.io/scrape: ${schema.spec.monitoring.enabled ? 'true' : 'false'}
            prometheus.io/port: "8080"
            prometheus.io/path: "/metrics"
        spec:
          replicas: ${schema.spec.environment == 'prod' ? (schema.spec.replicas < 3 ? 3 : schema.spec.replicas) : schema.spec.replicas}
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
                  resources:
                    requests:
                      cpu: ${schema.spec.resources.requests.cpu}
                      memory: ${schema.spec.resources.requests.memory}
                    limits:
                      cpu: ${schema.spec.resources.limits.cpu}
                      memory: ${schema.spec.resources.limits.memory}
                  env:
                    - name: ENVIRONMENT
                      value: ${schema.spec.environment}
      readyWhen:
        - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}

    - id: hpa
      includeWhen:
        - ${schema.spec.environment == 'prod' || schema.spec.environment == 'staging'}
      template:
        apiVersion: autoscaling/v2
        kind: HorizontalPodAutoscaler
        metadata:
          name: ${schema.spec.name}-hpa
          namespace: ${namespace.metadata.name}
        spec:
          scaleTargetRef:
            apiVersion: apps/v1
            kind: Deployment
            name: ${deployment.metadata.name}
          minReplicas: ${schema.spec.environment == 'prod' ? 3 : 2}
          maxReplicas: ${schema.spec.environment == 'prod' ? 20 : 10}
          metrics:
            - type: Resource
              resource:
                name: cpu
                target:
                  type: Utilization
                  averageUtilization: 70

    - id: serviceMonitor
      includeWhen:
        - ${schema.spec.monitoring.enabled}
      template:
        apiVersion: monitoring.coreos.com/v1
        kind: ServiceMonitor
        metadata:
          name: ${schema.spec.name}-monitor
          namespace: ${namespace.metadata.name}
        spec:
          selector:
            matchLabels:
              app: ${schema.spec.name}
          endpoints:
            - port: http
              interval: ${schema.spec.monitoring.scrapeInterval}
```

---

## Creating Custom APIs on Kubernetes {#creating-custom-apis}

### How KRO Creates Custom APIs

When you apply a ResourceGraphDefinition, KRO performs these steps:

1. **Validation Phase:**
   - Validates RGD syntax and structure
   - Type-checks all CEL expressions
   - Verifies CRDs exist for referenced resources
   - Detects circular dependencies

2. **CRD Generation Phase:**
   - Generates OpenAPI schema from your schema definition
   - Creates a new CustomResourceDefinition
   - Registers CRD with Kubernetes API server

3. **Controller Deployment Phase:**
   - Deploys dedicated microcontroller for your API
   - Controller watches for instances of your custom resource
   - Sets up reconciliation loop

4. **Ready State:**
   - RGD status becomes "Active"
   - Your custom API is available cluster-wide
   - Users can create instances

### API Lifecycle

**Creating an RGD:**
```bash
kubectl apply -f my-rgd.yaml
```

**Checking RGD Status:**
```bash
kubectl get resourcegraphdefinition
kubectl describe resourcegraphdefinition my-app

# Check generated CRD
kubectl get crd
```

**Using Your Custom API:**
```bash
# Create instance
kubectl apply -f my-app-instance.yaml

# Check instances
kubectl get myapp
kubectl describe myapp my-instance

# Check underlying resources
kubectl get all -l kro.run/instance=my-instance
```

**Updating the RGD:**
```bash
kubectl apply -f my-rgd-v2.yaml

# KRO will:
# 1. Validate new definition
# 2. Update CRD schema
# 3. Reconcile existing instances (if compatible)
```

**Deleting Instances:**
```bash
kubectl delete myapp my-instance

# KRO automatically:
# 1. Deletes resources in reverse dependency order
# 2. Waits for finalizers
# 3. Cleans up instance
```

**Deleting the RGD:**
```bash
kubectl delete resourcegraphdefinition my-app

# WARNING: This deletes:
# - The CRD
# - All instances
# - All underlying resources
```

### Multi-Tenancy and Namespaces

**Namespace-scoped Custom APIs:**
```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: team-application
  namespace: team-a  # RGD in team-a namespace
spec:
  schema:
    apiVersion: v1alpha1
    kind: Application
    spec:
      name: string
    # Resources created in instance's namespace
  resources:
    - id: deployment
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${schema.spec.name}
          namespace: ${schema.metadata.namespace}  # Same namespace as instance
```

**Cross-Namespace Resources:**
```yaml
resources:
  - id: sharedConfigMap
    template:
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: shared-config
        namespace: shared-resources  # Different namespace
```

### Integration with GitOps

KRO works seamlessly with GitOps tools like Flux and ArgoCD:

**Repository Structure:**
```
/platform
  /rgds
    - application.yaml
    - database.yaml
    - monitoring-stack.yaml
/applications
  /team-a
    - app1.yaml
    - app2.yaml
  /team-b
    - app3.yaml
```

**Flux Kustomization:**
```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: platform-rgds
spec:
  interval: 10m
  path: ./platform/rgds
  sourceRef:
    kind: GitRepository
    name: platform-repo
  prune: true
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: team-a-apps
spec:
  interval: 5m
  path: ./applications/team-a
  sourceRef:
    kind: GitRepository
    name: app-repo
  dependsOn:
    - name: platform-rgds  # Wait for RGDs first
  prune: true
```

---

## CEL Expressions in RGD {#cel-expressions-in-rgd}

### What is CEL?

**CEL (Common Expression Language)** is Google's open-source expression language used throughout Kubernetes. It's the same language used for:
- Kubernetes validation rules
- Admission control policies
- Field selectors

### Why CEL in KRO?

- **Type-safe:** Expressions are type-checked at compile time
- **Sandboxed:** Cannot modify state or access filesystems
- **Fast:** Compile-once, evaluate-many architecture (nanoseconds to microseconds)
- **Familiar:** Same syntax as Kubernetes ValidatingAdmissionPolicy

### CEL Expression Syntax

**Expression Delimiters:**
```yaml
${expression}
```

**Two Expression Types:**

1. **Standalone Expressions** (replace entire field value):
```yaml
replicas: ${schema.spec.replicas}
port: ${schema.spec.port}
enabled: ${schema.spec.features.monitoring}
```

2. **String Templates** (embed in strings):
```yaml
name: "${schema.spec.prefix}-${schema.spec.name}"
image: "${schema.spec.registry}/${schema.spec.image}:${schema.spec.tag}"
url: "https://${schema.spec.domain}/api/v1"
```

### Referencing Data

**Schema Variables:**
```yaml
# User-provided spec fields
${schema.spec.fieldName}

# Instance metadata
${schema.metadata.name}
${schema.metadata.namespace}
${schema.metadata.labels}
${schema.metadata.annotations}
${schema.metadata.uid}
```

**Resource Variables:**
```yaml
# Reference other resources by ID
${deployment.metadata.name}
${deployment.spec.replicas}
${deployment.status.availableReplicas}

# Nested field access
${deployment.spec.template.spec.containers[0].image}

# Status fields
${service.spec.clusterIP}
${ingress.status.loadBalancer.ingress[0].hostname}
```

### Optional Field Access (`?` operator)

Use `?` before fields that might not exist:

```yaml
# Without ? - fails if field missing
endpoint: ${database.status.endpoint}

# With ? - returns null if field missing
endpoint: ${database.status.?endpoint}

# Chaining optional access
hostname: ${ingress.status.?loadBalancer.?ingress[0].?hostname}

# With default value
hostname: ${ingress.status.?loadBalancer.?ingress[0].?hostname ?? 'pending'}
```

**When to use `?`:**
- Status fields that appear later (after reconciliation)
- Optional configuration fields
- Fields in schema-less resources (ConfigMap data)

### Type System

**Primitive Types:**
```yaml
string: ${schema.spec.name}
integer: ${schema.spec.replicas}
boolean: ${schema.spec.enabled}
double: ${schema.spec.cpuLimit}
```

**Complex Types:**
```yaml
# Objects/Maps
labels: ${{"app": schema.spec.name, "env": schema.spec.environment}}

# Arrays
tags: ${[schema.spec.name, schema.spec.environment, "v1"]}

# Nested structures
spec:
  selector: ${deployment.spec.selector}  # Returns entire object
```

**Type Checking:**
KRO validates expression types match field expectations:
```yaml
# VALID: integer field, integer expression
replicas: ${schema.spec.replicas}

# INVALID: integer field, string expression
replicas: ${schema.spec.name}  # Compilation error

# VALID: type conversion
replicas: ${int(schema.spec.replicasString)}
```

### Operators and Functions

**Comparison Operators:**
```yaml
${schema.spec.replicas > 3}
${schema.spec.environment == 'prod'}
${schema.spec.version >= '2.0.0'}
${schema.spec.enabled != false}
```

**Logical Operators:**
```yaml
${schema.spec.enabled && schema.spec.environment == 'prod'}
${schema.spec.debug || schema.spec.verbose}
${!schema.spec.disabled}
```

**Ternary Operator:**
```yaml
# condition ? true_value : false_value
replicas: ${schema.spec.environment == 'prod' ? 10 : 3}
image: ${schema.spec.debug ? 'app:debug' : 'app:latest'}
resources:
  limits:
    cpu: ${schema.spec.environment == 'prod' ? '2000m' : '500m'}
```

**String Functions:**
```yaml
# String concatenation
name: "${'prefix-' + schema.spec.name}"

# String formatting
url: ${"%s://%s:%d".format([schema.spec.protocol, schema.spec.host, schema.spec.port])}

# String operations
lowercase: ${schema.spec.name.lowerAscii()}
uppercase: ${schema.spec.environment.upperAscii()}
contains: ${schema.spec.image.contains('nginx')}
startsWith: ${schema.spec.name.startsWith('app-')}
endsWith: ${schema.spec.version.endsWith('-beta')}
```

**List/Array Functions:**
```yaml
# Map operation
images: ${schema.spec.containers.map(c, c.image)}

# Filter operation
prodContainers: ${schema.spec.containers.filter(c, c.environment == 'prod')}

# Check if all elements match
allReady: ${deployment.status.conditions.all(c, c.status == 'True')}

# Check if any element matches
hasError: ${deployment.status.conditions.exists(c, c.type == 'Failed')}

# Size of list
containerCount: ${size(schema.spec.containers)}

# List concatenation
allTags: ${schema.spec.tags + ['managed-by-kro']}
```

**Map/Object Functions:**
```yaml
# Check if key exists
hasKey: ${has(schema.spec.labels.environment)}

# Get keys
labelKeys: ${schema.spec.labels.keys()}

# Merge maps
allLabels: ${schema.spec.labels + {'managed-by': 'kro'}}
```

**Numeric Functions:**
```yaml
# Math operations
total: ${schema.spec.base + schema.spec.additional}
multiplied: ${schema.spec.replicas * 2}
percentage: ${schema.spec.value / 100.0}

# Type conversions
intValue: ${int(schema.spec.stringNumber)}
stringValue: ${string(schema.spec.replicas)}
doubleValue: ${double(schema.spec.intValue)}
```

**Null Coalescing:**
```yaml
# Use default if null
value: ${schema.spec.?optional ?? 'default'}
replicas: ${deployment.status.?readyReplicas ?? 0}
```

### Advanced CEL Patterns

**Conditional Resource Creation:**
```yaml
# Create monitoring resources only in prod
includeWhen:
  - ${schema.spec.environment == 'prod'}
  - ${schema.spec.monitoring.enabled}
  - ${has(schema.spec.monitoring.endpoint)}
```

**Complex Object Construction:**
```yaml
env:
  - name: DATABASE_URL
    value: ${"postgresql://%s:%s@%s:%d/%s".format([
      schema.spec.db.user,
      schema.spec.db.password,
      database.status.endpoint,
      database.status.port,
      schema.spec.db.name
    ])}
  - name: REPLICAS
    value: ${string(schema.spec.replicas)}
  - name: IS_PROD
    value: ${string(schema.spec.environment == 'prod')}
```

**Multi-Condition Readiness:**
```yaml
readyWhen:
  # All deployment replicas ready
  - ${deployment.status.readyReplicas == deployment.spec.replicas}
  # Deployment is available
  - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}
  # No progressing issues
  - ${!deployment.status.conditions.exists(c, c.type == 'Progressing' && c.status == 'False')}
  # Service has cluster IP
  - ${has(service.spec.clusterIP)}
```

**Validation Rules:**
```yaml
validation:
  # Replicas in valid range
  - expression: "self.replicas >= 1 && self.replicas <= 100"
    message: "Replicas must be between 1 and 100"

  # Prod environment requirements
  - expression: "self.environment == 'prod' ? self.replicas >= 3 : true"
    message: "Production environment requires at least 3 replicas"

  # Image tag validation
  - expression: "self.environment == 'prod' ? !self.image.endsWith(':latest') : true"
    message: "Production environment cannot use :latest tag"

  # Mutual exclusivity
  - expression: "!(self.monitoring.enabled && self.debug.enabled)"
    message: "Monitoring and debug mode cannot both be enabled"

  # Required field combinations
  - expression: "self.ingress.enabled ? has(self.ingress.host) && self.ingress.host != '' : true"
    message: "Ingress host required when ingress is enabled"
```

**Dynamic Resource Allocation:**
```yaml
resources:
  requests:
    cpu: ${schema.spec.environment == 'prod' ? '1000m' : (schema.spec.environment == 'staging' ? '500m' : '100m')}
    memory: ${schema.spec.environment == 'prod' ? '2Gi' : (schema.spec.environment == 'staging' ? '1Gi' : '256Mi')}
  limits:
    cpu: ${schema.spec.resources.?limits.?cpu ?? (schema.spec.environment == 'prod' ? '2000m' : '1000m')}
    memory: ${schema.spec.resources.?limits.?memory ?? (schema.spec.environment == 'prod' ? '4Gi' : '2Gi')}
```

### CEL Best Practices

1. **Use Optional Access for Status Fields:**
   ```yaml
   # Good: handles missing status
   ready: ${deployment.status.?readyReplicas ?? 0}

   # Bad: fails if status not yet populated
   ready: ${deployment.status.readyReplicas}
   ```

2. **Type Safety:**
   ```yaml
   # Good: explicit type conversion
   replicas: ${int(schema.spec.replicasString)}

   # Bad: implicit type conversion (may fail)
   replicas: ${schema.spec.replicasString}
   ```

3. **Readable Complex Expressions:**
   ```yaml
   # Good: clear logic
   enabled: ${schema.spec.features.monitoring &&
             schema.spec.environment == 'prod' &&
             has(schema.spec.monitoring.endpoint)}

   # Acceptable for simple cases
   enabled: ${schema.spec.features.monitoring}
   ```

4. **Avoid Deep Nesting:**
   ```yaml
   # Good: break down complex access
   containerImage: ${deployment.spec.template.spec.containers[0].image}

   # Consider: if too deep, expose via status
   status:
     primaryImage: ${deployment.spec.template.spec.containers[0].image}
   ```

5. **Null Safety:**
   ```yaml
   # Good: handle nulls explicitly
   value: ${config.data.?KEY ?? 'default-value'}

   # Bad: may return null unexpectedly
   value: ${config.data.?KEY}
   ```

---

## Best Practices for Writing RGDs {#best-practices}

### 1. Schema Design

**Principle: Design user-friendly APIs**

```yaml
# GOOD: Clear, intuitive fields with sensible defaults
spec:
  schema:
    apiVersion: v1alpha1
    kind: Application
    spec:
      name: string
      image: string | default="nginx:latest"
      replicas: integer | default=3
      environment: string | default="dev"
      ingress:
        enabled: boolean | default=false
        host: string | default=""

# BAD: Cryptic fields, no defaults
spec:
  schema:
    spec:
      n: string
      img: string
      r: integer
      e: string
      ing_en: boolean
```

**Recommendations:**
- Use descriptive field names
- Provide sensible defaults for common use cases
- Group related fields in nested objects
- Document field purposes in annotations
- Keep required fields minimal

### 2. Validation Rules

**Principle: Fail fast with clear error messages**

```yaml
validation:
  # Good: specific, actionable error messages
  - expression: "self.replicas >= 1 && self.replicas <= 100"
    message: "Replicas must be between 1 and 100"

  - expression: "self.environment in ['dev', 'staging', 'prod']"
    message: "Environment must be one of: dev, staging, prod"

  - expression: "self.environment == 'prod' ? self.replicas >= 3 : true"
    message: "Production environment requires at least 3 replicas for high availability"

  # Bad: vague error messages
  - expression: "self.replicas > 0"
    message: "Invalid replicas"
```

**Recommendations:**
- Validate all critical fields
- Provide clear, actionable error messages
- Check for invalid combinations
- Enforce environment-specific requirements
- Validate format of strings (URLs, emails, etc.)

### 3. Resource Organization

**Principle: Logical ordering and grouping**

```yaml
resources:
  # 1. Foundational resources (secrets, configs)
  - id: secret
    template:
      apiVersion: v1
      kind: Secret
      # ...

  # 2. Infrastructure (databases, queues)
  - id: database
    template:
      apiVersion: postgresql.cnpg.io/v1
      kind: Cluster
      # ...

  # 3. Configuration (configmaps referencing infra)
  - id: config
    template:
      apiVersion: v1
      kind: ConfigMap
      data:
        DATABASE_URL: ${database.status.endpoint}
      # ...

  # 4. Application (deployments, statefulsets)
  - id: deployment
    template:
      apiVersion: apps/v1
      kind: Deployment
      # ...

  # 5. Networking (services, ingresses)
  - id: service
    template:
      apiVersion: v1
      kind: Service
      # ...

  # 6. Optional/conditional resources
  - id: ingress
    includeWhen:
      - ${schema.spec.ingress.enabled}
    template:
      # ...
```

### 4. Readiness Conditions

**Principle: Comprehensive but not overly strict**

```yaml
# GOOD: Comprehensive readiness checks
- id: deployment
  template:
    # ...
  readyWhen:
    - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}
    - ${deployment.status.readyReplicas == deployment.spec.replicas}
    - ${deployment.status.updatedReplicas == deployment.spec.replicas}

# BETTER: Handle optional status fields
- id: database
  template:
    # ...
  readyWhen:
    - ${database.status.?ready == true}
    - ${database.status.?instances > 0}
    - ${has(database.status.writeService)}

# BAD: Too lenient or missing
- id: deployment
  template:
    # ...
  # No readyWhen - proceeds immediately
```

**Recommendations:**
- Always define `readyWhen` for critical resources
- Check multiple conditions for comprehensive readiness
- Use optional access (`?`) for status fields
- Consider dependent resource needs
- Don't over-complicate for simple resources

### 5. Status Field Exposure

**Principle: Surface useful information to users**

```yaml
# GOOD: Expose relevant status information
schema:
  status:
    # Application status
    ready: ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}
    availableReplicas: ${deployment.status.availableReplicas}
    desiredReplicas: ${deployment.spec.replicas}

    # Connection information
    serviceIP: ${service.spec.clusterIP}
    ingressURL: ${ingress.status.?loadBalancer.ingress[0].hostname ?? 'pending'}

    # Database connection
    databaseEndpoint: ${database.status.?writeService ?? 'initializing'}
    databaseReady: ${database.status.?ready ?? false}

# BAD: No status or too much noise
schema:
  status:
    everything: ${deployment}  # Too much information
```

**Recommendations:**
- Expose connection endpoints
- Show readiness status clearly
- Include replica counts
- Provide URLs/hostnames for external access
- Use defaults for pending values (`?? 'pending'`)
- Don't expose sensitive data

### 6. Naming Conventions

**Principle: Consistent, predictable naming**

```yaml
resources:
  # Good: consistent naming pattern
  - id: deployment
    template:
      metadata:
        name: ${schema.spec.name}
        labels:
          app.kubernetes.io/name: ${schema.spec.name}
          app.kubernetes.io/instance: ${schema.metadata.name}
          app.kubernetes.io/managed-by: kro

  - id: service
    template:
      metadata:
        name: ${schema.spec.name}-service  # Predictable suffix
        labels:
          app.kubernetes.io/name: ${schema.spec.name}

  - id: ingress
    template:
      metadata:
        name: ${schema.spec.name}-ingress  # Predictable suffix

# Bad: inconsistent naming
  - id: deployment
    template:
      metadata:
        name: ${schema.spec.name}

  - id: service
    template:
      metadata:
        name: ${schema.spec.name}-svc  # Abbreviated

  - id: ingress
    template:
      metadata:
        name: ingress-${schema.spec.name}  # Prefix instead of suffix
```

**Recommendations:**
- Use consistent suffixes (`-service`, `-ingress`, not `-svc`, `-ing`)
- Include recommended Kubernetes labels
- Add `managed-by: kro` label
- Use `app.kubernetes.io/*` label conventions
- Name resources predictably for debugging

### 7. Resource Limits and Requests

**Principle: Set sensible defaults, allow overrides**

```yaml
# GOOD: Defaults with user overrides
schema:
  spec:
    resources:
      requests:
        cpu: string | default="100m"
        memory: string | default="128Mi"
      limits:
        cpu: string | default="500m"
        memory: string | default="512Mi"

resources:
  - id: deployment
    template:
      spec:
        template:
          spec:
            containers:
              - name: app
                resources:
                  requests:
                    cpu: ${schema.spec.resources.requests.cpu}
                    memory: ${schema.spec.resources.requests.memory}
                  limits:
                    cpu: ${schema.spec.resources.limits.cpu}
                    memory: ${schema.spec.resources.limits.memory}

# BETTER: Environment-specific defaults
resources:
  - id: deployment
    template:
      spec:
        template:
          spec:
            containers:
              - name: app
                resources:
                  requests:
                    cpu: ${schema.spec.environment == 'prod' ? '1000m' : '100m'}
                    memory: ${schema.spec.environment == 'prod' ? '1Gi' : '256Mi'}
```

**Recommendations:**
- Always set resource requests and limits
- Provide sensible defaults based on environment
- Allow user overrides
- Consider pod disruption budgets for prod
- Set up HPA for production workloads

### 8. Security Best Practices

**Principle: Secure by default**

```yaml
# GOOD: Security-focused defaults
resources:
  - id: deployment
    template:
      spec:
        template:
          spec:
            securityContext:
              runAsNonRoot: true
              runAsUser: 1000
              fsGroup: 1000
              seccompProfile:
                type: RuntimeDefault
            containers:
              - name: app
                securityContext:
                  allowPrivilegeEscalation: false
                  capabilities:
                    drop:
                      - ALL
                  readOnlyRootFilesystem: true

# Consider: Network policies
  - id: networkPolicy
    template:
      apiVersion: networking.k8s.io/v1
      kind: NetworkPolicy
      metadata:
        name: ${schema.spec.name}-netpol
      spec:
        podSelector:
          matchLabels:
            app: ${schema.spec.name}
        policyTypes:
          - Ingress
          - Egress
        ingress:
          - from:
              - podSelector:
                  matchLabels:
                    access: ${schema.spec.name}
```

**Recommendations:**
- Run as non-root user
- Drop all capabilities by default
- Use read-only root filesystem when possible
- Define network policies
- Use seccomp profiles
- Don't expose secrets in status
- Implement RBAC for service accounts

### 9. Documentation and Annotations

**Principle: Make RGDs self-documenting**

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: application
  annotations:
    kro.run/description: "Deploys a web application with optional ingress and monitoring"
    kro.run/version: "v1.2.0"
    kro.run/maintainer: "platform-team@example.com"
    kro.run/examples: |
      apiVersion: v1alpha1
      kind: Application
      metadata:
        name: my-app
      spec:
        name: my-app
        image: nginx:1.21
        replicas: 3
        ingress:
          enabled: true
          host: app.example.com
```

**Recommendations:**
- Add description annotation
- Include version information
- Provide example usage
- Document breaking changes
- Link to detailed documentation

### 10. Testing Strategy

**Principle: Validate before deploying to production**

**Test in stages:**

1. **Validation Testing:**
   ```bash
   # Apply RGD to test cluster
   kubectl apply -f rgd.yaml

   # Check RGD status
   kubectl describe resourcegraphdefinition my-app

   # Verify CRD created
   kubectl get crd | grep my-api
   ```

2. **Instance Testing:**
   ```bash
   # Create test instance
   kubectl apply -f test-instance.yaml

   # Watch creation progress
   kubectl get all -l kro.run/instance=test-instance -w

   # Check instance status
   kubectl describe myapp test-instance

   # Verify resource creation order
   kubectl get events --sort-by='.lastTimestamp'
   ```

3. **Update Testing:**
   ```bash
   # Update instance
   kubectl apply -f test-instance-updated.yaml

   # Verify resources updated correctly
   kubectl describe deployment test-app
   ```

4. **Deletion Testing:**
   ```bash
   # Delete instance
   kubectl delete myapp test-instance

   # Verify all resources cleaned up
   kubectl get all -l kro.run/instance=test-instance
   ```

**Recommendations:**
- Test in non-production environment first
- Validate all conditional branches (includeWhen)
- Test different environment configurations
- Verify deletion cleans up all resources
- Check for resource leaks
- Monitor resource creation time

### 11. Versioning Strategy

**Principle: Plan for evolution**

```yaml
# Version 1: Initial release
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: application
spec:
  schema:
    apiVersion: v1alpha1
    kind: Application
    # ...

# Version 2: Add new optional field (backward compatible)
spec:
  schema:
    apiVersion: v1alpha1  # Same API version
    kind: Application
    spec:
      # ... existing fields
      monitoring:
        enabled: boolean | default=false  # New optional field

# Version 3: Breaking change (new API version)
spec:
  schema:
    apiVersion: v1beta1  # New API version
    kind: Application
    spec:
      # ... updated fields with breaking changes
```

**Recommendations:**
- Start with v1alpha1
- Increment API version for breaking changes
- Use annotations to track RGD versions
- Provide migration guides
- Maintain backward compatibility when possible
- Plan deprecation timeline

### 12. Performance Considerations

**Principle: Optimize for scale**

```yaml
# GOOD: Efficient CEL expressions
status:
  ready: ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}

# BAD: Complex, repeated calculations
status:
  ready: ${deployment.status.conditions.filter(c, c.type == 'Available').size() > 0 && deployment.status.conditions.filter(c, c.type == 'Available')[0].status == 'True'}
```

**Recommendations:**
- Keep CEL expressions simple
- Avoid deeply nested expressions
- Minimize number of resources in single RGD (split if needed)
- Use `readyWhen` to prevent cascading failures
- Consider resource creation time in complex graphs
- Monitor reconciliation time

---

## Current Status and Requirements {#current-status-and-requirements}

### Project Status

**Current State (as of December 2025):**
- **API Version:** v1alpha1
- **Project Phase:** Alpha (active development)
- **Production Ready:** NO - Not yet intended for production use
- **Latest Release:** v0.7.1 (December 13, 2025)
- **Breaking Changes:** May occur as the project evolves

**Important Notice:**
> "This project is a public experiment and is under active development. It is not yet intended for production use. The ResourceGraphDefinition CRD and other APIs used in this project are not solidified and highly subject to change."

### Kubernetes Version Requirements

**Minimum Kubernetes Version:**
- Kubernetes 1.25+ (recommended)
- Requires support for CEL in CRDs (introduced in 1.25)
- Works with any standard Kubernetes cluster (kind, EKS, GKE, AKS, etc.)

**Tested Platforms:**
- Amazon EKS
- Google Kubernetes Engine (GKE)
- Azure Kubernetes Service (AKS)
- kind (Kubernetes in Docker)
- Standard Kubernetes clusters

### Installation

**Prerequisites:**
```bash
# Kubernetes cluster (1.25+)
kubectl version

# Helm 3.x
helm version

# kubectl configured
kubectl cluster-info
```

**Install KRO using Helm:**
```bash
# Get latest version
export KRO_VERSION=$(curl -sL \
  https://api.github.com/repos/kubernetes-sigs/kro/releases/latest | \
  jq -r '.tag_name | ltrimstr("v")')

# Install KRO
helm install kro oci://ghcr.io/kubernetes-sigs/kro/charts/kro \
  --namespace kro-system \
  --create-namespace \
  --version=${KRO_VERSION}

# Verify installation
kubectl get pods -n kro-system
kubectl get crd | grep kro.run
```

**Alternative: AWS EKS Managed Installation:**
```bash
# KRO available as EKS managed add-on
aws eks create-addon \
  --cluster-name my-cluster \
  --addon-name kro \
  --addon-version v0.7.1-eksbuild.1
```

**Verify Installation:**
```bash
# Check KRO controller is running
kubectl get deployment -n kro-system

# Check KRO version
kubectl get deployment kro-controller -n kro-system -o yaml | grep image:

# Check CRD installed
kubectl get crd resourcegraphdefinitions.kro.run
```

### Current Limitations

**Known Limitations (v1alpha1):**

1. **Alpha API Stability:**
   - Breaking changes may occur
   - Not recommended for production
   - Upgrade paths may require resource recreation

2. **Feature Gaps:**
   - Limited observability/metrics
   - No built-in backup/restore
   - Limited multi-cluster support

3. **Performance:**
   - Large graphs (>20 resources) may have slower reconciliation
   - Complex CEL expressions can impact performance

4. **Validation:**
   - Some edge cases in CEL validation
   - Limited circular dependency detection in complex graphs

5. **Documentation:**
   - Still evolving
   - Some advanced patterns not fully documented

### Roadmap to Production

**Expected Timeline:**
- **v1alpha2 (Q1 2026):** Enhanced validation, better error messages
- **v1beta1 (Q2-Q3 2026):** API stabilization, performance improvements
- **v1 GA (Late 2026/Early 2027):** Production-ready, stable API

**Before Production Use:**
- Wait for v1beta1 at minimum
- Test thoroughly in non-production environments
- Have rollback plan for RGD changes
- Monitor GitHub releases for breaking changes
- Join community meetings for roadmap updates

### Community and Support

**Official Resources:**
- **Website:** https://kro.run
- **GitHub:** https://github.com/kubernetes-sigs/kro
- **Documentation:** https://kro.run/docs

**Community:**
- **Slack:** #kro channel on Kubernetes Slack
- **Meetings:** Biweekly Wednesdays at 9AM PT
- **Zoom:** https://us06web.zoom.us/j/85388697226

**Contributing:**
- Apache 2.0 License
- Welcome contributions from community
- Follow Kubernetes Code of Conduct
- Submit issues and PRs on GitHub

**Getting Help:**
- GitHub Issues for bugs and feature requests
- Slack for general questions
- Community meetings for discussions
- AWS/GCP/Azure support channels for cloud-specific issues

### Monitoring and Observability

**Check RGD Status:**
```bash
# List all RGDs
kubectl get resourcegraphdefinition

# Describe specific RGD
kubectl describe resourcegraphdefinition my-app

# Check generated CRD
kubectl get crd my-app.example.com -o yaml

# View RGD controller logs
kubectl logs -n kro-system deployment/kro-controller
```

**Check Instance Status:**
```bash
# List instances
kubectl get myapp

# Describe instance
kubectl describe myapp my-instance

# Check underlying resources
kubectl get all -l kro.run/instance=my-instance

# View events
kubectl get events --field-selector involvedObject.name=my-instance
```

**Debugging:**
```bash
# Check RGD validation errors
kubectl get resourcegraphdefinition my-app -o jsonpath='{.status.conditions}'

# Check instance reconciliation status
kubectl get myapp my-instance -o jsonpath='{.status.conditions}'

# View detailed controller logs
kubectl logs -n kro-system deployment/kro-controller --tail=100 -f
```

### Migration and Upgrade Path

**Current Limitations:**
- Alpha → Beta may require resource recreation
- No automated migration tools yet
- Plan for manual migration

**Best Practices for Alpha Usage:**
- Use in dev/test environments only
- Document your RGD configurations
- Version control all RGD definitions
- Maintain rollback procedures
- Stay updated with release notes

---

## Summary

**KRO (Kube Resource Orchestrator)** is a collaborative open-source project from AWS, Google Cloud, and Microsoft that simplifies creating custom Kubernetes APIs through declarative ResourceGraphDefinitions. It eliminates the need to write custom operators while providing:

- **Declarative API design** with type-safe CEL expressions
- **Automatic dependency resolution** and resource orchestration
- **Full lifecycle management** with drift detection
- **Validation at creation time** preventing runtime errors
- **Kubernetes-native integration** working seamlessly with existing tools

While currently in alpha (v1alpha1), KRO shows promise for simplifying platform engineering and internal developer platforms. It's ideal for teams wanting to create abstractions over Kubernetes resources without the complexity of custom controller development.

**Current recommendation:** Experiment in non-production environments, contribute to the community, and prepare for broader adoption as the project matures toward beta and GA releases.

---

## Sources

- [KRO Official Website](https://kro.run/)
- [KRO GitHub Repository](https://github.com/kubernetes-sigs/kro)
- [KRO Documentation - Overview](https://kro.run/docs/overview/)
- [KRO Documentation - RGD Overview](https://kro.run/docs/concepts/rgd/overview/)
- [KRO Documentation - CEL Expressions](https://kro.run/docs/concepts/rgd/cel-expressions/)
- [KRO Documentation - Resource Basics](https://kro.run/docs/concepts/rgd/resource-definitions/resource-basics/)
- [KRO Examples](https://kro.run/examples/)
- [Google Cloud Blog - Introducing KRO](https://cloud.google.com/blog/products/containers-kubernetes/introducing-kube-resource-orchestrator)
- [AWS Open Source Blog - Introducing KRO](https://aws.amazon.com/blogs/opensource/introducing-open-source-kro-kube-resource-orchestrator/)
- [AWS EKS Documentation - Resource Composition with KRO](https://docs.aws.amazon.com/eks/latest/userguide/kro.html)
- [Azure AKS Blog - Building Community with CRDs: KRO](https://azure.github.io/AKS/2025/01/30/kube-resource-orchestrator)
- [Platform Engineering Blog - Introducing KRO](https://platformengineering.org/blog/introducing-kubernetes-resource-orchestrator-kro)
