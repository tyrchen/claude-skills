# Pulumi TypeScript Guide: Kubernetes CRDs and Custom Resources

## Table of Contents
1. [Introduction](#introduction)
2. [Creating Kubernetes CRDs](#creating-kubernetes-crds)
3. [Deploying Custom Resources](#deploying-custom-resources)
4. [Working with KRO (Kubernetes Resource Orchestrator)](#working-with-kro)
5. [Best Practices](#best-practices)
6. [Handling CRD Dependencies](#handling-crd-dependencies)
7. [Using crd2pulumi for Typed Resources](#using-crd2pulumi-for-typed-resources)
8. [Complex Examples](#complex-examples)

---

## Introduction

Pulumi provides comprehensive support for Kubernetes Custom Resource Definitions (CRDs) through the `@pulumi/kubernetes` package. This guide covers enterprise-grade patterns for managing CRDs and custom resources using TypeScript.

### Key Concepts

- **CRD (Custom Resource Definition)**: Extends the Kubernetes API with custom resource types
- **CR (Custom Resource)**: An instance of a CRD
- **Typed vs Untyped**: Untyped CRs use generic objects; typed CRs leverage TypeScript types for IDE support
- **crd2pulumi**: Tool to generate strongly-typed CustomResource classes from CRD YAML schemas

---

## Creating Kubernetes CRDs

### Basic CRD Definition

```typescript
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Define a Custom Resource Definition
const myCrd = new k8s.apiextensions.v1.CustomResourceDefinition("my-crd", {
    metadata: {
        name: "myresources.example.com", // Must be: <plural>.<group>
    },
    spec: {
        group: "example.com",
        scope: "Namespaced", // or "Cluster"
        names: {
            plural: "myresources",
            singular: "myresource",
            kind: "MyResource",
            shortNames: ["mr"],
            listKind: "MyResourceList",
        },
        versions: [
            {
                name: "v1",
                served: true,
                storage: true, // Exactly one version must have storage: true
                schema: {
                    openAPIV3Schema: {
                        type: "object",
                        properties: {
                            spec: {
                                type: "object",
                                properties: {
                                    replicas: {
                                        type: "integer",
                                        minimum: 1,
                                        maximum: 10,
                                    },
                                    image: {
                                        type: "string",
                                        pattern: "^[a-z0-9.-]+:[a-z0-9.-]+$",
                                    },
                                    resources: {
                                        type: "object",
                                        properties: {
                                            cpu: { type: "string" },
                                            memory: { type: "string" },
                                        },
                                    },
                                },
                                required: ["replicas", "image"],
                            },
                            status: {
                                type: "object",
                                properties: {
                                    phase: {
                                        type: "string",
                                        enum: ["Pending", "Running", "Failed"],
                                    },
                                },
                            },
                        },
                    },
                },
                // Optional: Add additional printer columns for kubectl output
                additionalPrinterColumns: [
                    {
                        name: "Replicas",
                        type: "integer",
                        jsonPath: ".spec.replicas",
                    },
                    {
                        name: "Image",
                        type: "string",
                        jsonPath: ".spec.image",
                    },
                    {
                        name: "Age",
                        type: "date",
                        jsonPath: ".metadata.creationTimestamp",
                    },
                ],
            },
        ],
    },
});

// Export the CRD name for reference
export const crdName = myCrd.metadata.name;
```

### Advanced CRD with Multiple Versions

```typescript
const multiVersionCrd = new k8s.apiextensions.v1.CustomResourceDefinition("database-crd", {
    metadata: {
        name: "databases.db.example.com",
    },
    spec: {
        group: "db.example.com",
        scope: "Namespaced",
        names: {
            plural: "databases",
            singular: "database",
            kind: "Database",
            shortNames: ["db"],
        },
        versions: [
            {
                name: "v1",
                served: true,
                storage: true,
                schema: {
                    openAPIV3Schema: {
                        type: "object",
                        properties: {
                            spec: {
                                type: "object",
                                properties: {
                                    engine: {
                                        type: "string",
                                        enum: ["postgres", "mysql", "mongodb"],
                                    },
                                    version: { type: "string" },
                                    storage: { type: "string" },
                                    backupEnabled: { type: "boolean" },
                                },
                                required: ["engine", "version"],
                            },
                        },
                    },
                },
                subresources: {
                    status: {}, // Enable status subresource
                    scale: {    // Enable scale subresource
                        specReplicasPath: ".spec.replicas",
                        statusReplicasPath: ".status.replicas",
                    },
                },
            },
            {
                name: "v1alpha1",
                served: true,
                storage: false, // Old version, not the storage version
                deprecated: true,
                deprecationWarning: "db.example.com/v1alpha1 is deprecated; use db.example.com/v1",
                schema: {
                    openAPIV3Schema: {
                        type: "object",
                        properties: {
                            spec: {
                                type: "object",
                                properties: {
                                    dbType: { type: "string" },
                                    dbVersion: { type: "string" },
                                },
                            },
                        },
                    },
                },
            },
        ],
    },
});
```

---

## Deploying Custom Resources

### Untyped Custom Resource (Basic Approach)

```typescript
import * as k8s from "@pulumi/kubernetes";

// Create a Custom Resource instance
const myResource = new k8s.apiextensions.CustomResource("my-resource-instance", {
    apiVersion: "example.com/v1",
    kind: "MyResource",
    metadata: {
        name: "my-app",
        namespace: "default",
        labels: {
            app: "my-app",
            environment: "production",
        },
        annotations: {
            "description": "Production application instance",
        },
    },
    spec: {
        replicas: 3,
        image: "nginx:1.21",
        resources: {
            cpu: "500m",
            memory: "512Mi",
        },
    },
}, {
    dependsOn: [myCrd], // Critical: Ensure CRD exists first
});

// Export resource name and status
export const resourceName = myResource.metadata.name;
```

### Custom Resource with Status Handling

```typescript
// For CRDs with status subresources
const databaseInstance = new k8s.apiextensions.CustomResource("postgres-db", {
    apiVersion: "db.example.com/v1",
    kind: "Database",
    metadata: {
        name: "production-db",
        namespace: "databases",
    },
    spec: {
        engine: "postgres",
        version: "14.5",
        storage: "100Gi",
        backupEnabled: true,
    },
}, {
    dependsOn: [multiVersionCrd],
});

// Access computed values from the CR
export const dbEndpoint = databaseInstance.status.apply((s: any) => s?.endpoint);
export const dbPhase = databaseInstance.status.apply((s: any) => s?.phase);
```

---

## Working with KRO (Kubernetes Resource Orchestrator)

### Overview

**KRO (Kube Resource Orchestrator)** is an open-source project that enables advanced resource orchestration in Kubernetes. Released by Amazon in December 2024 with backing from Azure and GCP, KRO allows you to build declarative, secure Kubernetes abstractions.

### Key Features

- **In-cluster controller**: Runs natively in Kubernetes
- **Works with any CRD**: Regardless of API group
- **Continuous reconciliation**: Automatic drift detection
- **ResourceGraphDefinitions (RGDs)**: Factories that describe composition schemas and resource relationships

### TypeKro: TypeScript Integration for KRO

**TypeKro** combines TypeScript type safety, GitOps-friendly YAML output, and KRO's runtime intelligence.

#### TypeKro Benefits

- Write Kubernetes resources in TypeScript with full IDE support
- Catch configuration errors at compile time
- Resources can reference each other's runtime state using CEL expressions
- Choose deployment strategy without rewriting code

#### TypeKro Deployment Modes

1. **KRO Factory Mode (Production)**
   - Deploys a KRO ResourceGraphDefinition
   - Kubernetes control plane orchestrates resource deployment
   - Recommended for production workloads

2. **Direct Factory Mode (Development)**
   - Deploys to clusters without KRO operator installed
   - Resolves dependencies in JavaScript runtime (similar to Pulumi)
   - Useful for quick testing

### TypeKro Example

```typescript
// Note: This is conceptual TypeKro usage
// TypeKro is a separate tool from Pulumi but can complement Pulumi workflows

import { ResourceGraph, KroFactory } from "typekro";

// Define a resource graph
const appGraph = new ResourceGraph({
    name: "my-app",
    resources: {
        deployment: {
            apiVersion: "apps/v1",
            kind: "Deployment",
            spec: {
                replicas: 3,
                selector: { matchLabels: { app: "my-app" } },
                template: {
                    metadata: { labels: { app: "my-app" } },
                    spec: {
                        containers: [{
                            name: "app",
                            image: "nginx:latest",
                        }],
                    },
                },
            },
        },
        service: {
            apiVersion: "v1",
            kind: "Service",
            spec: {
                selector: { app: "my-app" },
                ports: [{ port: 80, targetPort: 8080 }],
                // Reference deployment runtime state with CEL
                type: "${deployment.status.ready ? 'LoadBalancer' : 'ClusterIP'}",
            },
        },
    },
});

// Deploy using KRO
const kroFactory = new KroFactory(appGraph);
kroFactory.deploy();
```

### Integrating KRO with Pulumi

While KRO and Pulumi serve similar purposes (orchestrating Kubernetes resources), they can be used together:

```typescript
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Use Pulumi to deploy KRO ResourceGraphDefinition
const rgd = new k8s.apiextensions.CustomResource("my-app-rgd", {
    apiVersion: "kro.run/v1alpha1",
    kind: "ResourceGraph",
    metadata: {
        name: "my-application",
        namespace: "default",
    },
    spec: {
        schema: {
            apiVersion: "v1alpha1",
            kind: "Application",
            spec: {
                properties: {
                    replicas: { type: "integer", default: 3 },
                    image: { type: "string" },
                },
            },
        },
        resources: [
            {
                id: "deployment",
                template: {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: "${schema.metadata.name}",
                    },
                    spec: {
                        replicas: "${schema.spec.replicas}",
                        template: {
                            spec: {
                                containers: [{
                                    name: "app",
                                    image: "${schema.spec.image}",
                                }],
                            },
                        },
                    },
                },
            },
        ],
    },
});

// Export the ResourceGraph name
export const rgdName = rgd.metadata.name;
```

---

## Best Practices

### 1. Security Best Practices

```typescript
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Use secure defaults in CRD schemas
const secureCrd = new k8s.apiextensions.v1.CustomResourceDefinition("secure-app-crd", {
    metadata: {
        name: "secureapps.security.example.com",
    },
    spec: {
        group: "security.example.com",
        scope: "Namespaced",
        names: {
            plural: "secureapps",
            singular: "secureapp",
            kind: "SecureApp",
        },
        versions: [{
            name: "v1",
            served: true,
            storage: true,
            schema: {
                openAPIV3Schema: {
                    type: "object",
                    properties: {
                        spec: {
                            type: "object",
                            properties: {
                                image: { type: "string" },
                                // Require security context
                                securityContext: {
                                    type: "object",
                                    properties: {
                                        runAsNonRoot: {
                                            type: "boolean",
                                            default: true, // Secure default
                                        },
                                        readOnlyRootFilesystem: {
                                            type: "boolean",
                                            default: true,
                                        },
                                        allowPrivilegeEscalation: {
                                            type: "boolean",
                                            default: false,
                                        },
                                    },
                                    required: ["runAsNonRoot"],
                                },
                                // Reference secrets, don't embed them
                                secretRef: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                    },
                                    required: ["name"],
                                },
                            },
                            required: ["image", "securityContext"],
                        },
                    },
                },
            },
        }],
    },
});
```

### 2. Resource Naming Conventions

```typescript
const config = new pulumi.Config();
const projectName = pulumi.getProject();
const stackName = pulumi.getStack();
const environment = config.get("environment") || stackName;

// Consistent naming pattern
function resourceName(purpose: string): string {
    return `${projectName}-${environment}-${purpose}`;
}

const crd = new k8s.apiextensions.v1.CustomResourceDefinition(
    resourceName("database-crd"),
    {
        metadata: {
            name: "databases.db.example.com",
            labels: {
                "app.kubernetes.io/name": "database-crd",
                "app.kubernetes.io/part-of": projectName,
                "app.kubernetes.io/managed-by": "pulumi",
                "environment": environment,
            },
        },
        // ... rest of spec
    }
);
```

### 3. Standard Tagging Strategy

```typescript
interface CommonLabels {
    "app.kubernetes.io/name": string;
    "app.kubernetes.io/instance": string;
    "app.kubernetes.io/version": string;
    "app.kubernetes.io/component": string;
    "app.kubernetes.io/part-of": string;
    "app.kubernetes.io/managed-by": string;
    "environment": string;
}

function getCommonLabels(
    name: string,
    version: string,
    component: string
): CommonLabels {
    return {
        "app.kubernetes.io/name": name,
        "app.kubernetes.io/instance": `${name}-${pulumi.getStack()}`,
        "app.kubernetes.io/version": version,
        "app.kubernetes.io/component": component,
        "app.kubernetes.io/part-of": pulumi.getProject(),
        "app.kubernetes.io/managed-by": "pulumi",
        "environment": pulumi.getStack(),
    };
}

// Apply to resources
const myResource = new k8s.apiextensions.CustomResource("app-instance", {
    apiVersion: "example.com/v1",
    kind: "MyResource",
    metadata: {
        name: "my-app",
        labels: getCommonLabels("my-app", "1.0.0", "application"),
    },
    spec: {
        // ...
    },
}, { dependsOn: [myCrd] });
```

### 4. Type Safety with Interfaces

```typescript
// Define TypeScript interfaces for your custom resources
interface MyResourceSpec {
    replicas: number;
    image: string;
    resources?: {
        cpu?: string;
        memory?: string;
    };
    env?: Array<{
        name: string;
        value?: string;
        valueFrom?: any;
    }>;
}

interface MyResourceMetadata {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
}

// Type-safe resource creation helper
function createMyResource(
    name: string,
    metadata: MyResourceMetadata,
    spec: MyResourceSpec,
    opts?: pulumi.CustomResourceOptions
): k8s.apiextensions.CustomResource {
    return new k8s.apiextensions.CustomResource(name, {
        apiVersion: "example.com/v1",
        kind: "MyResource",
        metadata: metadata,
        spec: spec,
    }, opts);
}

// Usage with full type checking
const typedResource = createMyResource(
    "typed-app",
    {
        name: "my-typed-app",
        namespace: "default",
        labels: { app: "typed" },
    },
    {
        replicas: 3,
        image: "nginx:1.21",
        resources: {
            cpu: "500m",
            memory: "512Mi",
        },
    },
    { dependsOn: [myCrd] }
);
```

### 5. Component Resources for Encapsulation

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

interface ApplicationArgs {
    name: string;
    namespace: string;
    image: string;
    replicas: number;
    resources?: {
        cpu: string;
        memory: string;
    };
}

// Encapsulate CRD + CR in a component resource
class Application extends pulumi.ComponentResource {
    public readonly crd: k8s.apiextensions.v1.CustomResourceDefinition;
    public readonly instance: k8s.apiextensions.CustomResource;
    public readonly name: pulumi.Output<string>;

    constructor(
        name: string,
        args: ApplicationArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:app:Application", name, {}, opts);

        // Create CRD (if not already exists - use protect: true)
        this.crd = new k8s.apiextensions.v1.CustomResourceDefinition(
            `${name}-crd`,
            {
                metadata: {
                    name: "applications.app.example.com",
                },
                spec: {
                    group: "app.example.com",
                    scope: "Namespaced",
                    names: {
                        plural: "applications",
                        singular: "application",
                        kind: "Application",
                    },
                    versions: [{
                        name: "v1",
                        served: true,
                        storage: true,
                        schema: {
                            openAPIV3Schema: {
                                type: "object",
                                properties: {
                                    spec: {
                                        type: "object",
                                        properties: {
                                            replicas: { type: "integer" },
                                            image: { type: "string" },
                                            resources: {
                                                type: "object",
                                                properties: {
                                                    cpu: { type: "string" },
                                                    memory: { type: "string" },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    }],
                },
            },
            { parent: this, protect: true } // Protect CRD from deletion
        );

        // Create CR instance
        this.instance = new k8s.apiextensions.CustomResource(
            `${name}-instance`,
            {
                apiVersion: "app.example.com/v1",
                kind: "Application",
                metadata: {
                    name: args.name,
                    namespace: args.namespace,
                },
                spec: {
                    replicas: args.replicas,
                    image: args.image,
                    resources: args.resources,
                },
            },
            { parent: this, dependsOn: [this.crd] }
        );

        this.name = this.instance.metadata.name;
        this.registerOutputs({
            name: this.name,
        });
    }
}

// Usage
const app = new Application("my-app", {
    name: "production-app",
    namespace: "default",
    image: "nginx:1.21",
    replicas: 3,
    resources: {
        cpu: "500m",
        memory: "512Mi",
    },
});

export const appName = app.name;
```

---

## Handling CRD Dependencies

### 1. Explicit Dependencies with `dependsOn`

```typescript
import * as k8s from "@pulumi/kubernetes";

// Create CRD first
const crd = new k8s.apiextensions.v1.CustomResourceDefinition("my-crd", {
    metadata: { name: "myresources.example.com" },
    spec: {
        group: "example.com",
        versions: [{
            name: "v1",
            served: true,
            storage: true,
            schema: {
                openAPIV3Schema: {
                    type: "object",
                    properties: {
                        spec: { type: "object" },
                    },
                },
            },
        }],
        scope: "Namespaced",
        names: {
            plural: "myresources",
            singular: "myresource",
            kind: "MyResource",
        },
    },
});

// Create CR with explicit dependency
const cr = new k8s.apiextensions.CustomResource("my-cr", {
    apiVersion: "example.com/v1",
    kind: "MyResource",
    metadata: { name: "instance-1" },
    spec: {},
}, {
    dependsOn: [crd], // Ensures CRD exists before CR creation
});
```

### 2. Dependencies with Helm Charts

```typescript
import * as k8s from "@pulumi/kubernetes";

// Install operator via Helm (includes CRDs)
const operator = new k8s.helm.v3.Release("cert-manager", {
    chart: "cert-manager",
    version: "v1.13.0",
    namespace: "cert-manager",
    createNamespace: true,
    repositoryOpts: {
        repo: "https://charts.jetstack.io",
    },
    values: {
        installCRDs: true, // Important: Install CRDs with Helm
    },
});

// Wait for operator to be ready before creating CRs
const issuer = new k8s.apiextensions.CustomResource("letsencrypt-issuer", {
    apiVersion: "cert-manager.io/v1",
    kind: "ClusterIssuer",
    metadata: {
        name: "letsencrypt-prod",
    },
    spec: {
        acme: {
            server: "https://acme-v02.api.letsencrypt.org/directory",
            email: "admin@example.com",
            privateKeySecretRef: {
                name: "letsencrypt-prod",
            },
            solvers: [{
                http01: {
                    ingress: {
                        class: "nginx",
                    },
                },
            }],
        },
    },
}, {
    dependsOn: [operator], // Wait for Helm release
});
```

### 3. Waiting for CRD Establishment

```typescript
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Create CRD
const crd = new k8s.apiextensions.v1.CustomResourceDefinition("my-crd", {
    metadata: { name: "myresources.example.com" },
    spec: {
        group: "example.com",
        versions: [{
            name: "v1",
            served: true,
            storage: true,
            schema: {
                openAPIV3Schema: {
                    type: "object",
                    properties: { spec: { type: "object" } },
                },
            },
        }],
        scope: "Namespaced",
        names: {
            plural: "myresources",
            singular: "myresource",
            kind: "MyResource",
        },
    },
});

// Wait for CRD to be established (accepted by Kubernetes)
const crdEstablished = crd.status.apply(status => {
    const conditions = status?.conditions || [];
    return conditions.some((c: any) =>
        c.type === "Established" && c.status === "True"
    );
});

// Create CR only after CRD is established
const cr = pulumi.all([crdEstablished, crd.metadata.name]).apply(([established, name]) => {
    if (!established) {
        throw new Error(`CRD ${name} not yet established`);
    }
    return new k8s.apiextensions.CustomResource("my-cr", {
        apiVersion: "example.com/v1",
        kind: "MyResource",
        metadata: { name: "instance-1" },
        spec: {},
    }, { dependsOn: [crd] });
});
```

### 4. Multi-Stack Dependencies

```typescript
// Stack 1: Infrastructure (CRDs)
// File: infra/index.ts
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const crd = new k8s.apiextensions.v1.CustomResourceDefinition("database-crd", {
    metadata: { name: "databases.db.example.com" },
    spec: {
        // ... CRD spec
    },
});

// Export CRD name and group for other stacks
export const crdName = crd.metadata.name;
export const crdGroup = "db.example.com";
export const crdVersion = "v1";
export const crdKind = "Database";

// Stack 2: Applications (uses CRDs from Stack 1)
// File: app/index.ts
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Reference the infrastructure stack
const infraStack = new pulumi.StackReference("infra", {
    name: "organization/project/infra",
});

const crdGroup = infraStack.getOutput("crdGroup");
const crdVersion = infraStack.getOutput("crdVersion");
const crdKind = infraStack.getOutput("crdKind");

// Create CR in application stack
const database = pulumi.all([crdGroup, crdVersion, crdKind]).apply(
    ([group, version, kind]) => new k8s.apiextensions.CustomResource("app-db", {
        apiVersion: `${group}/${version}`,
        kind: kind,
        metadata: {
            name: "application-database",
            namespace: "default",
        },
        spec: {
            engine: "postgres",
            version: "14.5",
        },
    })
);
```

### 5. Circular Dependencies Prevention

```typescript
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Bad: Circular dependency
// DON'T DO THIS:
/*
const crA = new k8s.apiextensions.CustomResource("cr-a", {
    apiVersion: "example.com/v1",
    kind: "ResourceA",
    spec: {
        referenceTo: crB.metadata.name, // References B
    },
});

const crB = new k8s.apiextensions.CustomResource("cr-b", {
    apiVersion: "example.com/v1",
    kind: "ResourceB",
    spec: {
        referenceTo: crA.metadata.name, // References A - CIRCULAR!
    },
});
*/

// Good: Use intermediate resource or defer references
const crA = new k8s.apiextensions.CustomResource("cr-a", {
    apiVersion: "example.com/v1",
    kind: "ResourceA",
    metadata: { name: "resource-a" },
    spec: {
        // Define without reference
    },
}, { dependsOn: [crd] });

const crB = new k8s.apiextensions.CustomResource("cr-b", {
    apiVersion: "example.com/v1",
    kind: "ResourceB",
    metadata: { name: "resource-b" },
    spec: {
        referenceTo: "resource-a", // Use string instead of pulumi.Output
    },
}, { dependsOn: [crd, crA] }); // B depends on A

// Later, update A to reference B if needed
const crAUpdate = new k8s.apiextensions.CustomResource("cr-a-updated", {
    apiVersion: "example.com/v1",
    kind: "ResourceA",
    metadata: { name: "resource-a" },
    spec: {
        referenceTo: "resource-b",
    },
}, { dependsOn: [crB] });
```

---

## Using crd2pulumi for Typed Resources

### Overview

**crd2pulumi** is a CLI tool that generates strongly-typed CustomResource classes from CRD YAML schemas. This is invaluable for complex CRDs like cert-manager or Istio that contain thousands of lines of YAML.

### Benefits

- **IDE Support**: Full autocomplete and type checking
- **Error Prevention**: Catch configuration errors at compile time
- **Documentation**: Types serve as inline documentation
- **Refactoring Safety**: TypeScript compiler catches breaking changes

### Installation

```bash
# Install crd2pulumi
go install github.com/pulumi/crd2pulumi@latest

# Verify installation
crd2pulumi --version
```

### Basic Usage

```bash
# Generate TypeScript types from a CRD file
crd2pulumi --typescript --typescriptPath ./crds-ts ./my-crd.yaml

# Generate from multiple CRD files
crd2pulumi --typescript --typescriptPath ./crds-ts ./crds/*.yaml

# Generate from a URL
crd2pulumi --typescript --typescriptPath ./cert-manager \
  https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.crds.yaml
```

### Example: cert-manager with crd2pulumi

```bash
# Download cert-manager CRDs
curl -sL https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.crds.yaml \
  -o cert-manager-crds.yaml

# Generate TypeScript types
crd2pulumi --typescript --typescriptPath ./certmanager cert-manager-crds.yaml
```

This generates a directory structure:

```
certmanager/
├── index.ts
├── acme/
│   └── v1/
│       ├── Challenge.ts
│       └── Order.ts
└── certmanager/
    └── v1/
        ├── Certificate.ts
        ├── CertificateRequest.ts
        ├── ClusterIssuer.ts
        └── Issuer.ts
```

### Using Generated Types

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as certmanager from "./certmanager";

// Install cert-manager first
const certManager = new k8s.helm.v3.Release("cert-manager", {
    chart: "cert-manager",
    version: "v1.13.0",
    namespace: "cert-manager",
    createNamespace: true,
    repositoryOpts: {
        repo: "https://charts.jetstack.io",
    },
    values: {
        installCRDs: true,
    },
});

// Use typed Certificate resource - full IDE autocomplete!
const certificate = new certmanager.certmanager.v1.Certificate("tls-cert", {
    metadata: {
        name: "example-com-tls",
        namespace: "default",
    },
    spec: {
        secretName: "example-com-tls-secret",
        issuerRef: {
            name: "letsencrypt-prod",
            kind: "ClusterIssuer",
        },
        dnsNames: [
            "example.com",
            "www.example.com",
        ],
        // TypeScript will autocomplete all valid fields!
        privateKey: {
            algorithm: "RSA",
            size: 2048,
        },
        usages: [
            "digital signature",
            "key encipherment",
        ],
    },
}, { dependsOn: [certManager] });

// Use typed ClusterIssuer
const issuer = new certmanager.certmanager.v1.ClusterIssuer("letsencrypt-prod", {
    metadata: {
        name: "letsencrypt-prod",
    },
    spec: {
        acme: {
            server: "https://acme-v02.api.letsencrypt.org/directory",
            email: "admin@example.com",
            privateKeySecretRef: {
                name: "letsencrypt-prod-key",
            },
            solvers: [{
                http01: {
                    ingress: {
                        class: "nginx",
                    },
                },
            }],
        },
    },
}, { dependsOn: [certManager] });

export const certName = certificate.metadata.name;
export const issuerName = issuer.metadata.name;
```

### Advanced: Custom CRD with crd2pulumi

```typescript
// First, create your CRD YAML file
// my-crd.yaml
/*
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: applications.app.example.com
spec:
  group: app.example.com
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                replicas:
                  type: integer
                  minimum: 1
                  maximum: 100
                image:
                  type: string
                resources:
                  type: object
                  properties:
                    cpu:
                      type: string
                    memory:
                      type: string
              required:
                - replicas
                - image
  scope: Namespaced
  names:
    plural: applications
    singular: application
    kind: Application
    shortNames:
      - app
*/

// Generate types
// $ crd2pulumi --typescript --typescriptPath ./myapp my-crd.yaml

// Use typed resources in Pulumi
import * as myapp from "./myapp";

const app = new myapp.app.v1.Application("production-app", {
    metadata: {
        name: "my-application",
        namespace: "default",
    },
    spec: {
        replicas: 5, // TypeScript knows this is a number (1-100)
        image: "nginx:1.21", // TypeScript knows this is required
        resources: {
            cpu: "500m",
            memory: "1Gi",
        },
    },
});
```

### Workflow Integration

```typescript
// package.json scripts for crd2pulumi workflow
{
  "scripts": {
    "generate-crds": "crd2pulumi --typescript --typescriptPath ./crds-ts ./crds/*.yaml",
    "prebuild": "npm run generate-crds",
    "build": "tsc",
    "deploy": "pulumi up"
  }
}

// Automate CRD type generation before deployment
// This ensures your types are always up-to-date with CRD definitions
```

---

## Complex Examples

### Example 1: Istio Virtual Service with Typed Resources

```bash
# Generate Istio CRD types
crd2pulumi --typescript --typescriptPath ./istio \
  https://raw.githubusercontent.com/istio/istio/master/manifests/charts/base/crds/crd-all.gen.yaml
```

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as istio from "./istio";

// Install Istio (simplified)
const istioBase = new k8s.helm.v3.Release("istio-base", {
    chart: "base",
    version: "1.19.0",
    namespace: "istio-system",
    createNamespace: true,
    repositoryOpts: {
        repo: "https://istio-release.storage.googleapis.com/charts",
    },
});

const istiod = new k8s.helm.v3.Release("istiod", {
    chart: "istiod",
    version: "1.19.0",
    namespace: "istio-system",
    repositoryOpts: {
        repo: "https://istio-release.storage.googleapis.com/charts",
    },
}, { dependsOn: [istioBase] });

// Create typed VirtualService
const virtualService = new istio.networking.v1beta1.VirtualService("api-routing", {
    metadata: {
        name: "api-routes",
        namespace: "default",
    },
    spec: {
        hosts: ["api.example.com"],
        gateways: ["api-gateway"],
        http: [
            {
                match: [{
                    uri: { prefix: "/v2/" },
                }],
                route: [{
                    destination: {
                        host: "api-v2",
                        port: { number: 8080 },
                    },
                    weight: 90,
                }],
            },
            {
                match: [{
                    uri: { prefix: "/v1/" },
                }],
                route: [{
                    destination: {
                        host: "api-v1",
                        port: { number: 8080 },
                    },
                }],
            },
        ],
    },
}, { dependsOn: [istiod] });

// Create Gateway
const gateway = new istio.networking.v1beta1.Gateway("api-gateway", {
    metadata: {
        name: "api-gateway",
        namespace: "default",
    },
    spec: {
        selector: {
            istio: "ingressgateway",
        },
        servers: [{
            port: {
                number: 443,
                name: "https",
                protocol: "HTTPS",
            },
            tls: {
                mode: "SIMPLE",
                credentialName: "api-tls-secret",
            },
            hosts: ["api.example.com"],
        }],
    },
}, { dependsOn: [istiod] });

export const vsName = virtualService.metadata.name;
export const gatewayName = gateway.metadata.name;
```

### Example 2: Multi-Tenancy with Namespace-Scoped CRDs

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// Define tenant CRD
const tenantCrd = new k8s.apiextensions.v1.CustomResourceDefinition("tenant-crd", {
    metadata: {
        name: "tenants.multitenancy.example.com",
    },
    spec: {
        group: "multitenancy.example.com",
        scope: "Cluster", // Cluster-scoped
        names: {
            plural: "tenants",
            singular: "tenant",
            kind: "Tenant",
        },
        versions: [{
            name: "v1",
            served: true,
            storage: true,
            schema: {
                openAPIV3Schema: {
                    type: "object",
                    properties: {
                        spec: {
                            type: "object",
                            properties: {
                                namespaces: {
                                    type: "array",
                                    items: { type: "string" },
                                },
                                resourceQuota: {
                                    type: "object",
                                    properties: {
                                        cpu: { type: "string" },
                                        memory: { type: "string" },
                                        storage: { type: "string" },
                                    },
                                },
                                networkPolicies: {
                                    type: "boolean",
                                },
                            },
                            required: ["namespaces", "resourceQuota"],
                        },
                    },
                },
            },
            subresources: {
                status: {},
            },
        }],
    },
});

// Create tenant instances
const tenantA = new k8s.apiextensions.CustomResource("tenant-a", {
    apiVersion: "multitenancy.example.com/v1",
    kind: "Tenant",
    metadata: {
        name: "tenant-a",
    },
    spec: {
        namespaces: ["tenant-a-dev", "tenant-a-prod"],
        resourceQuota: {
            cpu: "10",
            memory: "20Gi",
            storage: "100Gi",
        },
        networkPolicies: true,
    },
}, { dependsOn: [tenantCrd] });

// Create namespaces for tenant
const tenantANamespaces = ["tenant-a-dev", "tenant-a-prod"].map((name, index) =>
    new k8s.core.v1.Namespace(name, {
        metadata: {
            name: name,
            labels: {
                tenant: "tenant-a",
                environment: name.includes("prod") ? "production" : "development",
            },
        },
    }, { dependsOn: [tenantA] })
);

// Create resource quotas
const tenantAQuotas = tenantANamespaces.map((ns, index) =>
    new k8s.core.v1.ResourceQuota(`${ns.metadata.name}-quota`, {
        metadata: {
            name: "tenant-quota",
            namespace: ns.metadata.name,
        },
        spec: {
            hard: {
                "requests.cpu": "5",
                "requests.memory": "10Gi",
                "requests.storage": "50Gi",
                "persistentvolumeclaims": "10",
                "pods": "50",
            },
        },
    }, { dependsOn: [ns] })
);

// Create network policies
const tenantANetworkPolicies = tenantANamespaces.map((ns) =>
    new k8s.networking.v1.NetworkPolicy(`${ns.metadata.name}-netpol`, {
        metadata: {
            name: "default-deny-ingress",
            namespace: ns.metadata.name,
        },
        spec: {
            podSelector: {},
            policyTypes: ["Ingress"],
            ingress: [{
                from: [{
                    namespaceSelector: {
                        matchLabels: {
                            tenant: "tenant-a",
                        },
                    },
                }],
            }],
        },
    }, { dependsOn: [ns] })
);

export const tenantAName = tenantA.metadata.name;
```

### Example 3: Database Operator Pattern with Status Management

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// Database CRD with comprehensive status
const databaseCrd = new k8s.apiextensions.v1.CustomResourceDefinition("database-crd", {
    metadata: {
        name: "databases.db.example.com",
    },
    spec: {
        group: "db.example.com",
        scope: "Namespaced",
        names: {
            plural: "databases",
            singular: "database",
            kind: "Database",
            shortNames: ["db"],
        },
        versions: [{
            name: "v1",
            served: true,
            storage: true,
            schema: {
                openAPIV3Schema: {
                    type: "object",
                    properties: {
                        spec: {
                            type: "object",
                            properties: {
                                engine: {
                                    type: "string",
                                    enum: ["postgres", "mysql", "mongodb"],
                                },
                                version: { type: "string" },
                                storageSize: { type: "string" },
                                replicas: {
                                    type: "integer",
                                    minimum: 1,
                                    maximum: 5,
                                },
                                backup: {
                                    type: "object",
                                    properties: {
                                        enabled: { type: "boolean" },
                                        schedule: { type: "string" },
                                        retention: { type: "integer" },
                                    },
                                },
                                monitoring: {
                                    type: "object",
                                    properties: {
                                        enabled: { type: "boolean" },
                                        exporterImage: { type: "string" },
                                    },
                                },
                            },
                            required: ["engine", "version", "storageSize"],
                        },
                        status: {
                            type: "object",
                            properties: {
                                phase: {
                                    type: "string",
                                    enum: ["Pending", "Creating", "Running", "Updating", "Failed"],
                                },
                                conditions: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            type: { type: "string" },
                                            status: { type: "string" },
                                            lastTransitionTime: { type: "string" },
                                            reason: { type: "string" },
                                            message: { type: "string" },
                                        },
                                    },
                                },
                                endpoint: { type: "string" },
                                readyReplicas: { type: "integer" },
                                lastBackupTime: { type: "string" },
                            },
                        },
                    },
                },
            },
            subresources: {
                status: {}, // Enable status subresource
            },
            additionalPrinterColumns: [
                {
                    name: "Engine",
                    type: "string",
                    jsonPath: ".spec.engine",
                },
                {
                    name: "Version",
                    type: "string",
                    jsonPath: ".spec.version",
                },
                {
                    name: "Phase",
                    type: "string",
                    jsonPath: ".status.phase",
                },
                {
                    name: "Endpoint",
                    type: "string",
                    jsonPath: ".status.endpoint",
                },
                {
                    name: "Age",
                    type: "date",
                    jsonPath: ".metadata.creationTimestamp",
                },
            ],
        }],
    },
});

// Production database with full configuration
const productionDb = new k8s.apiextensions.CustomResource("production-db", {
    apiVersion: "db.example.com/v1",
    kind: "Database",
    metadata: {
        name: "production-postgres",
        namespace: "databases",
        labels: {
            environment: "production",
            app: "api-backend",
        },
        annotations: {
            "backup.db.example.com/priority": "high",
            "monitoring.db.example.com/alert-threshold": "80",
        },
    },
    spec: {
        engine: "postgres",
        version: "15.3",
        storageSize: "500Gi",
        replicas: 3,
        backup: {
            enabled: true,
            schedule: "0 2 * * *", // Daily at 2 AM
            retention: 30, // Keep 30 days
        },
        monitoring: {
            enabled: true,
            exporterImage: "prometheuscommunity/postgres-exporter:v0.13.0",
        },
    },
}, { dependsOn: [databaseCrd] });

// Access status fields
export const dbEndpoint = productionDb.status.apply((s: any) => s?.endpoint || "pending");
export const dbPhase = productionDb.status.apply((s: any) => s?.phase || "Unknown");
export const dbReadyReplicas = productionDb.status.apply((s: any) => s?.readyReplicas || 0);

// Create monitoring ServiceMonitor (if Prometheus Operator is installed)
const dbMonitor = new k8s.apiextensions.CustomResource("db-monitor", {
    apiVersion: "monitoring.coreos.com/v1",
    kind: "ServiceMonitor",
    metadata: {
        name: "database-monitor",
        namespace: "databases",
    },
    spec: {
        selector: {
            matchLabels: {
                app: "database",
                engine: "postgres",
            },
        },
        endpoints: [{
            port: "metrics",
            interval: "30s",
        }],
    },
}, { dependsOn: [productionDb] });
```

### Example 4: GitOps Integration with Flux/ArgoCD

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// GitRepository CRD for Flux
const gitRepoCrd = new k8s.apiextensions.v1.CustomResourceDefinition("gitrepo-crd", {
    metadata: {
        name: "gitrepositories.source.toolkit.fluxcd.io",
    },
    spec: {
        group: "source.toolkit.fluxcd.io",
        scope: "Namespaced",
        names: {
            plural: "gitrepositories",
            singular: "gitrepository",
            kind: "GitRepository",
        },
        versions: [{
            name: "v1beta2",
            served: true,
            storage: true,
            schema: {
                openAPIV3Schema: {
                    type: "object",
                    properties: {
                        spec: {
                            type: "object",
                            properties: {
                                url: { type: "string" },
                                ref: {
                                    type: "object",
                                    properties: {
                                        branch: { type: "string" },
                                        tag: { type: "string" },
                                        commit: { type: "string" },
                                    },
                                },
                                interval: { type: "string" },
                                secretRef: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                    },
                                },
                            },
                            required: ["url", "interval"],
                        },
                    },
                },
            },
        }],
    },
});

// GitRepository instance
const appRepo = new k8s.apiextensions.CustomResource("app-gitrepo", {
    apiVersion: "source.toolkit.fluxcd.io/v1beta2",
    kind: "GitRepository",
    metadata: {
        name: "app-repository",
        namespace: "flux-system",
    },
    spec: {
        url: "https://github.com/example/app-manifests",
        ref: {
            branch: "main",
        },
        interval: "1m",
        secretRef: {
            name: "github-credentials",
        },
    },
}, { dependsOn: [gitRepoCrd] });

// Kustomization CRD for Flux
const kustomizationCrd = new k8s.apiextensions.v1.CustomResourceDefinition("kustomization-crd", {
    metadata: {
        name: "kustomizations.kustomize.toolkit.fluxcd.io",
    },
    spec: {
        group: "kustomize.toolkit.fluxcd.io",
        scope: "Namespaced",
        names: {
            plural: "kustomizations",
            singular: "kustomization",
            kind: "Kustomization",
        },
        versions: [{
            name: "v1beta2",
            served: true,
            storage: true,
            schema: {
                openAPIV3Schema: {
                    type: "object",
                    properties: {
                        spec: {
                            type: "object",
                            properties: {
                                sourceRef: {
                                    type: "object",
                                    properties: {
                                        kind: { type: "string" },
                                        name: { type: "string" },
                                    },
                                },
                                path: { type: "string" },
                                prune: { type: "boolean" },
                                interval: { type: "string" },
                            },
                            required: ["sourceRef", "path", "interval"],
                        },
                    },
                },
            },
        }],
    },
});

// Kustomization instance
const appKustomization = new k8s.apiextensions.CustomResource("app-kustomization", {
    apiVersion: "kustomize.toolkit.fluxcd.io/v1beta2",
    kind: "Kustomization",
    metadata: {
        name: "app-deployment",
        namespace: "flux-system",
    },
    spec: {
        sourceRef: {
            kind: "GitRepository",
            name: "app-repository",
        },
        path: "./environments/production",
        prune: true,
        interval: "5m",
    },
}, {
    dependsOn: [kustomizationCrd, appRepo],
});

export const gitRepoName = appRepo.metadata.name;
export const kustomizationName = appKustomization.metadata.name;
```

### Example 5: Complete Application Stack with CRDs

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();
const clusterName = config.require("clusterName");
const environment = config.require("environment");

// 1. Install operators via Helm
const certManager = new k8s.helm.v3.Release("cert-manager", {
    chart: "cert-manager",
    version: "v1.13.0",
    namespace: "cert-manager",
    createNamespace: true,
    repositoryOpts: {
        repo: "https://charts.jetstack.io",
    },
    values: {
        installCRDs: true,
        global: {
            leaderElection: {
                namespace: "cert-manager",
            },
        },
    },
});

const ingressNginx = new k8s.helm.v3.Release("ingress-nginx", {
    chart: "ingress-nginx",
    version: "4.8.0",
    namespace: "ingress-nginx",
    createNamespace: true,
    repositoryOpts: {
        repo: "https://kubernetes.github.io/ingress-nginx",
    },
    values: {
        controller: {
            service: {
                annotations: {
                    "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                },
            },
        },
    },
});

// 2. Create ClusterIssuer for Let's Encrypt
const letsencryptIssuer = new k8s.apiextensions.CustomResource("letsencrypt-prod", {
    apiVersion: "cert-manager.io/v1",
    kind: "ClusterIssuer",
    metadata: {
        name: "letsencrypt-prod",
    },
    spec: {
        acme: {
            server: "https://acme-v02.api.letsencrypt.org/directory",
            email: config.require("acmeEmail"),
            privateKeySecretRef: {
                name: "letsencrypt-prod-key",
            },
            solvers: [{
                http01: {
                    ingress: {
                        class: "nginx",
                    },
                },
            }],
        },
    },
}, { dependsOn: [certManager] });

// 3. Deploy application
const appNamespace = new k8s.core.v1.Namespace("app-namespace", {
    metadata: {
        name: `app-${environment}`,
        labels: {
            environment: environment,
        },
    },
});

const appDeployment = new k8s.apps.v1.Deployment("app", {
    metadata: {
        name: "web-app",
        namespace: appNamespace.metadata.name,
    },
    spec: {
        replicas: 3,
        selector: {
            matchLabels: { app: "web-app" },
        },
        template: {
            metadata: {
                labels: { app: "web-app" },
            },
            spec: {
                containers: [{
                    name: "app",
                    image: config.require("appImage"),
                    ports: [{ containerPort: 8080 }],
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "128Mi",
                        },
                        limits: {
                            cpu: "500m",
                            memory: "512Mi",
                        },
                    },
                }],
            },
        },
    },
}, { dependsOn: [appNamespace] });

const appService = new k8s.core.v1.Service("app-service", {
    metadata: {
        name: "web-app",
        namespace: appNamespace.metadata.name,
    },
    spec: {
        selector: { app: "web-app" },
        ports: [{
            port: 80,
            targetPort: 8080,
        }],
    },
}, { dependsOn: [appDeployment] });

// 4. Create Certificate
const appCertificate = new k8s.apiextensions.CustomResource("app-cert", {
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: {
        name: "web-app-tls",
        namespace: appNamespace.metadata.name,
    },
    spec: {
        secretName: "web-app-tls-secret",
        issuerRef: {
            name: "letsencrypt-prod",
            kind: "ClusterIssuer",
        },
        dnsNames: [
            config.require("appDomain"),
            `www.${config.require("appDomain")}`,
        ],
    },
}, {
    dependsOn: [letsencryptIssuer, appNamespace],
});

// 5. Create Ingress
const appIngress = new k8s.networking.v1.Ingress("app-ingress", {
    metadata: {
        name: "web-app",
        namespace: appNamespace.metadata.name,
        annotations: {
            "cert-manager.io/cluster-issuer": "letsencrypt-prod",
            "nginx.ingress.kubernetes.io/ssl-redirect": "true",
        },
    },
    spec: {
        ingressClassName: "nginx",
        tls: [{
            hosts: [
                config.require("appDomain"),
                `www.${config.require("appDomain")}`,
            ],
            secretName: "web-app-tls-secret",
        }],
        rules: [{
            host: config.require("appDomain"),
            http: {
                paths: [{
                    path: "/",
                    pathType: "Prefix",
                    backend: {
                        service: {
                            name: "web-app",
                            port: { number: 80 },
                        },
                    },
                }],
            },
        }],
    },
}, {
    dependsOn: [ingressNginx, appService, appCertificate],
});

// Exports
export const namespaceName = appNamespace.metadata.name;
export const appUrl = pulumi.interpolate`https://${config.require("appDomain")}`;
export const certificateName = appCertificate.metadata.name;
export const ingressName = appIngress.metadata.name;
```

---

## Summary

This guide covers the complete lifecycle of working with Kubernetes CRDs in Pulumi with TypeScript:

1. **Creating CRDs**: Define custom resources with validation schemas and multiple versions
2. **Deploying Custom Resources**: Create instances with proper typing and dependency management
3. **KRO Integration**: Understand how KRO and TypeKro complement Pulumi workflows
4. **Best Practices**: Security, naming, tagging, type safety, and component resources
5. **Dependency Management**: Handle complex ordering with `dependsOn`, Helm charts, and stack references
6. **crd2pulumi**: Generate strongly-typed resources for IDE support and error prevention
7. **Complex Examples**: Real-world patterns including Istio, cert-manager, operators, and GitOps

### Key Takeaways

- Always use `dependsOn` for CRD → CR relationships
- Use `crd2pulumi` for complex CRDs to get type safety
- Protect critical CRDs with `protect: true`
- Organize complex infrastructures into component resources
- Apply consistent naming, labeling, and security practices
- Consider KRO/TypeKro for advanced Kubernetes orchestration needs

### Additional Resources

- [Pulumi Kubernetes Documentation](https://www.pulumi.com/registry/packages/kubernetes/)
- [crd2pulumi GitHub Repository](https://github.com/pulumi/crd2pulumi)
- [Kubernetes CRD Documentation](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/)
- [TypeKro Project](https://typekro.run/)
- [KRO Documentation](https://kro.run/)
