# KRO ResourceGraphDefinition Pulumi Templates

Production-ready Pulumi TypeScript templates for creating KRO ResourceGraphDefinitions.

## Templates

| Template | Description | AWS Resources |
|----------|-------------|---------------|
| `web-application.ts` | Web app with Deployment, Service, optional Ingress/HPA/PDB | None |
| `database-application.ts` | App with AWS RDS database via ACK | RDS DBInstance |
| `fullstack-application.ts` | Full-stack with frontend, backend, and AWS services | S3, ElastiCache, SQS |
| `multi-environment.ts` | Environment-aware app with tier-based configurations | None |

## Usage

### 1. Create Pulumi Project

```bash
mkdir my-kro-project && cd my-kro-project
pulumi new kubernetes-typescript
npm install @pulumi/kubernetes @pulumi/pulumi
```

### 2. Copy Template

```bash
# Copy the template you need
cp path/to/templates/web-application.ts src/
```

### 3. Customize and Deploy

```typescript
import { createWebApplicationRgd } from "./web-application";

const rgd = createWebApplicationRgd({
    name: "my-webapp",
    namespace: "platform",
    labels: {
        team: "platform",
    },
});

export const rgdName = rgd.metadata.name;
```

### 4. Deploy with Pulumi

```bash
pulumi up
```

### 5. Create Instances

After deployment, create instances of your custom API:

```bash
kubectl apply -f - <<EOF
apiVersion: v1alpha1
kind: WebApplication
metadata:
  name: my-frontend
spec:
  name: frontend
  image: nginx:1.25
  replicas: 3
EOF
```

## Template Details

### web-application.ts

Creates a web application stack with:
- Deployment with configurable replicas and resources
- Service (ClusterIP, NodePort, or LoadBalancer)
- Optional Ingress with TLS support
- Optional HorizontalPodAutoscaler
- Optional PodDisruptionBudget

### database-application.ts

Creates a database-backed application with:
- AWS RDS DBInstance via ACK controller
- Kubernetes Secret for database credentials
- ConfigMap for connection details
- Application Deployment with DB connectivity
- Service for application access

Prerequisites:
- ACK RDS controller installed
- IRSA configured for RDS access
- DB subnet group and security group created

### fullstack-application.ts

Creates a complete application stack with:
- Frontend Deployment + Service + Ingress
- Backend Deployment + Service
- AWS S3 bucket for static assets
- AWS ElastiCache Redis for caching
- AWS SQS queue for async processing
- Network Policies for security

Prerequisites:
- ACK controllers: s3, elasticache, sqs
- IRSA configured for all services
- VPC subnets and security groups

### multi-environment.ts

Creates environment-aware applications with:
- Automatic resource sizing by environment (dev/staging/prod)
- Tier-based configurations (standard/critical/background)
- Environment-specific replica counts
- Optional autoscaling with environment-aware behavior
- Optional PDB with tier-based availability
- Optional ServiceMonitor for Prometheus
- Network Policies

## Customization

Each template function accepts configuration arguments:

```typescript
interface WebApplicationRgdArgs {
    name: string;           // Required: RGD name
    namespace?: string;     // Optional: defaults to "default"
    labels?: Record<string, string>;  // Optional: additional labels
}
```

Modify the template's `spec.schema.spec` section to add/remove fields.
Modify the `resources` array to add/remove Kubernetes resources.

## Validation

All templates include CEL validation rules. Add custom validations:

```typescript
validation: [
    {
        expression: "self.replicas >= 1 && self.replicas <= 100",
        message: "Replicas must be between 1 and 100",
    },
    // Add your custom validations
],
```

## Testing

```bash
# Deploy RGD
pulumi up

# Verify RGD is active
kubectl get resourcegraphdefinition

# Check generated CRD
kubectl get crd | grep kro

# Create test instance
kubectl apply -f test-instance.yaml

# Check status
kubectl describe <your-kind> <instance-name>
```
