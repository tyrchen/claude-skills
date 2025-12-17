/**
 * KRO ResourceGraphDefinition: Full-Stack Application with AWS Services
 *
 * Creates a production-ready full-stack application with:
 * - Frontend deployment with Ingress
 * - Backend API deployment
 * - AWS S3 bucket for static assets (via ACK)
 * - AWS ElastiCache Redis for caching (via ACK)
 * - AWS SQS queue for async processing (via ACK)
 * - Kubernetes Secrets and ConfigMaps
 * - Network Policies for security
 *
 * Prerequisites:
 *   - ACK controllers installed: s3, elasticache, sqs
 *   - IRSA configured for all AWS services
 *   - VPC subnets and security groups pre-created
 *
 * Usage:
 *   pulumi up
 *
 * Then create instances:
 *   kubectl apply -f - <<EOF
 *   apiVersion: v1alpha1
 *   kind: FullStackApplication
 *   metadata:
 *     name: my-app
 *   spec:
 *     name: myapp
 *     frontend:
 *       image: myregistry/frontend:v1.0
 *       host: myapp.example.com
 *     backend:
 *       image: myregistry/backend:v1.0
 *     storage:
 *       bucketName: myapp-assets
 *     cache:
 *       enabled: true
 *       nodeType: cache.t3.micro
 *     queue:
 *       enabled: true
 *   EOF
 */

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface FullStackApplicationRgdArgs {
    /**
     * Name of the RGD resource
     */
    name: string;

    /**
     * Namespace to deploy the RGD
     */
    namespace?: string;

    /**
     * AWS region for resources
     */
    awsRegion?: string;

    /**
     * Additional labels to apply
     */
    labels?: { [key: string]: string };
}

export function createFullStackApplicationRgd(
    args: FullStackApplicationRgdArgs
): k8s.apiextensions.CustomResource {
    const namespace = args.namespace ?? "default";
    const awsRegion = args.awsRegion ?? "us-west-2";

    return new k8s.apiextensions.CustomResource(`${args.name}-rgd`, {
        apiVersion: "kro.run/v1alpha1",
        kind: "ResourceGraphDefinition",
        metadata: {
            name: args.name,
            namespace: namespace,
            labels: {
                "app.kubernetes.io/managed-by": "pulumi",
                "kro.run/type": "fullstack-application",
                ...args.labels,
            },
            annotations: {
                "kro.run/description":
                    "Full-stack application with S3, ElastiCache, and SQS via ACK",
            },
        },
        spec: {
            schema: {
                apiVersion: "v1alpha1",
                kind: "FullStackApplication",
                spec: {
                    // Application name
                    name: "string",
                    environment: 'string | default="dev"',

                    // Frontend configuration
                    frontend: {
                        image: "string",
                        replicas: "integer | default=2",
                        port: "integer | default=3000",
                        resources: {
                            cpu: 'string | default="100m"',
                            memory: 'string | default="256Mi"',
                        },
                        ingress: {
                            enabled: "boolean | default=true",
                            host: "string",
                            tlsEnabled: "boolean | default=false",
                            ingressClassName: 'string | default="nginx"',
                        },
                    },

                    // Backend configuration
                    backend: {
                        image: "string",
                        replicas: "integer | default=3",
                        port: "integer | default=8080",
                        resources: {
                            cpu: 'string | default="250m"',
                            memory: 'string | default="512Mi"',
                        },
                    },

                    // S3 storage configuration
                    storage: {
                        enabled: "boolean | default=true",
                        bucketName: "string",
                        versioning: "boolean | default=true",
                        encryption: "boolean | default=true",
                    },

                    // ElastiCache Redis configuration
                    cache: {
                        enabled: "boolean | default=false",
                        nodeType: 'string | default="cache.t3.micro"',
                        numCacheNodes: "integer | default=1",
                        engine: 'string | default="redis"',
                        engineVersion: 'string | default="7.0"',
                        port: "integer | default=6379",
                        subnetGroupName: 'string | default=""',
                        securityGroupIDs: "[]string | default=[]",
                    },

                    // SQS queue configuration
                    queue: {
                        enabled: "boolean | default=false",
                        queueName: 'string | default=""',
                        visibilityTimeoutSeconds: "integer | default=30",
                        messageRetentionPeriod: "integer | default=345600",
                        delaySeconds: "integer | default=0",
                        fifoQueue: "boolean | default=false",
                    },

                    // Network policies
                    networkPolicy: {
                        enabled: "boolean | default=true",
                    },
                },
                status: {
                    // Overall status
                    ready:
                        "${frontendDeployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True') && backendDeployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",

                    // Frontend status
                    frontendReady:
                        "${frontendDeployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                    frontendURL:
                        "${schema.spec.frontend.ingress.enabled ? (schema.spec.frontend.ingress.tlsEnabled ? 'https://' : 'http://') + schema.spec.frontend.ingress.host : ''}",

                    // Backend status
                    backendReady:
                        "${backendDeployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                    backendEndpoint: "${backendService.spec.clusterIP}",

                    // AWS resource status
                    bucketArn: "${bucket.status.?ackResourceMetadata.arn ?? 'pending'}",
                    cacheEndpoint: "${cacheCluster.status.?cacheNodes[0].endpoint.address ?? 'disabled'}",
                    queueURL: "${queue.status.?queueURL ?? 'disabled'}",
                },
                validation: [
                    {
                        expression: "self.environment in ['dev', 'staging', 'prod']",
                        message: "Environment must be dev, staging, or prod",
                    },
                    {
                        expression: "self.frontend.replicas >= 1 && self.frontend.replicas <= 20",
                        message: "Frontend replicas must be between 1 and 20",
                    },
                    {
                        expression: "self.backend.replicas >= 1 && self.backend.replicas <= 50",
                        message: "Backend replicas must be between 1 and 50",
                    },
                    {
                        expression:
                            "self.frontend.ingress.enabled ? self.frontend.ingress.host != '' : true",
                        message: "Ingress host required when ingress is enabled",
                    },
                    {
                        expression:
                            "self.cache.enabled ? (size(self.cache.securityGroupIDs) >= 1) : true",
                        message: "At least one security group ID required for cache",
                    },
                    {
                        expression: "self.environment == 'prod' ? self.backend.replicas >= 3 : true",
                        message: "Production requires at least 3 backend replicas",
                    },
                ],
            },
            resources: [
                // ======================
                // S3 Bucket (ACK)
                // ======================
                {
                    id: "bucket",
                    includeWhen: ["${schema.spec.storage.enabled}"],
                    template: {
                        apiVersion: "s3.services.k8s.aws/v1alpha1",
                        kind: "Bucket",
                        metadata: {
                            name: "${schema.spec.storage.bucketName}",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "storage",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            name: "${schema.spec.storage.bucketName}",
                            versioning: {
                                status:
                                    "${schema.spec.storage.versioning ? 'Enabled' : 'Suspended'}",
                            },
                            encryption: {
                                rules: [
                                    {
                                        applyServerSideEncryptionByDefault: {
                                            sseAlgorithm: "AES256",
                                        },
                                        bucketKeyEnabled: true,
                                    },
                                ],
                            },
                            publicAccessBlock: {
                                blockPublicAcls: true,
                                blockPublicPolicy: true,
                                ignorePublicAcls: true,
                                restrictPublicBuckets: true,
                            },
                            tagging: {
                                tagSet: [
                                    {
                                        key: "ManagedBy",
                                        value: "KRO",
                                    },
                                    {
                                        key: "Application",
                                        value: "${schema.spec.name}",
                                    },
                                    {
                                        key: "Environment",
                                        value: "${schema.spec.environment}",
                                    },
                                ],
                            },
                        },
                    },
                    readyWhen: ["${bucket.status.?ackResourceMetadata.arn != null}"],
                },

                // ======================
                // ElastiCache Cluster (ACK)
                // ======================
                {
                    id: "cacheCluster",
                    includeWhen: ["${schema.spec.cache.enabled}"],
                    template: {
                        apiVersion: "elasticache.services.k8s.aws/v1alpha1",
                        kind: "CacheCluster",
                        metadata: {
                            name: "${schema.spec.name}-cache",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "cache",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            cacheClusterID:
                                "${schema.spec.name}-${schema.spec.environment}",
                            cacheNodeType: "${schema.spec.cache.nodeType}",
                            engine: "${schema.spec.cache.engine}",
                            engineVersion: "${schema.spec.cache.engineVersion}",
                            numCacheNodes: "${schema.spec.cache.numCacheNodes}",
                            port: "${schema.spec.cache.port}",
                            cacheSubnetGroupName: "${schema.spec.cache.subnetGroupName}",
                            securityGroupIDs: "${schema.spec.cache.securityGroupIDs}",
                            tags: [
                                {
                                    key: "ManagedBy",
                                    value: "KRO",
                                },
                                {
                                    key: "Application",
                                    value: "${schema.spec.name}",
                                },
                            ],
                        },
                    },
                    readyWhen: ["${cacheCluster.status.?cacheClusterStatus == 'available'}"],
                },

                // ======================
                // SQS Queue (ACK)
                // ======================
                {
                    id: "queue",
                    includeWhen: ["${schema.spec.queue.enabled}"],
                    template: {
                        apiVersion: "sqs.services.k8s.aws/v1alpha1",
                        kind: "Queue",
                        metadata: {
                            name: "${schema.spec.name}-queue",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "queue",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            queueName:
                                "${schema.spec.queue.queueName != '' ? schema.spec.queue.queueName : schema.spec.name + '-' + schema.spec.environment + (schema.spec.queue.fifoQueue ? '.fifo' : '')}",
                            visibilityTimeout:
                                "${string(schema.spec.queue.visibilityTimeoutSeconds)}",
                            messageRetentionPeriod:
                                "${string(schema.spec.queue.messageRetentionPeriod)}",
                            delaySeconds: "${string(schema.spec.queue.delaySeconds)}",
                            fifoQueue: "${schema.spec.queue.fifoQueue}",
                            tags: {
                                ManagedBy: "KRO",
                                Application: "${schema.spec.name}",
                                Environment: "${schema.spec.environment}",
                            },
                        },
                    },
                    readyWhen: ["${queue.status.?queueURL != null}"],
                },

                // ======================
                // ConfigMap for AWS resources
                // ======================
                {
                    id: "awsConfig",
                    template: {
                        apiVersion: "v1",
                        kind: "ConfigMap",
                        metadata: {
                            name: "${schema.spec.name}-aws-config",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "config",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        data: {
                            S3_BUCKET:
                                "${schema.spec.storage.enabled ? schema.spec.storage.bucketName : ''}",
                            S3_BUCKET_ARN:
                                "${schema.spec.storage.enabled ? bucket.status.ackResourceMetadata.arn : ''}",
                            REDIS_HOST:
                                "${schema.spec.cache.enabled ? cacheCluster.status.cacheNodes[0].endpoint.address : ''}",
                            REDIS_PORT:
                                "${schema.spec.cache.enabled ? string(schema.spec.cache.port) : ''}",
                            SQS_QUEUE_URL: "${schema.spec.queue.enabled ? queue.status.queueURL : ''}",
                            ENVIRONMENT: "${schema.spec.environment}",
                        },
                    },
                },

                // ======================
                // Backend Deployment
                // ======================
                {
                    id: "backendDeployment",
                    template: {
                        apiVersion: "apps/v1",
                        kind: "Deployment",
                        metadata: {
                            name: "${schema.spec.name}-backend",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "backend",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            replicas: "${schema.spec.backend.replicas}",
                            selector: {
                                matchLabels: {
                                    "app.kubernetes.io/name": "${schema.spec.name}",
                                    "app.kubernetes.io/component": "backend",
                                },
                            },
                            template: {
                                metadata: {
                                    labels: {
                                        "app.kubernetes.io/name": "${schema.spec.name}",
                                        "app.kubernetes.io/component": "backend",
                                        environment: "${schema.spec.environment}",
                                    },
                                },
                                spec: {
                                    containers: [
                                        {
                                            name: "backend",
                                            image: "${schema.spec.backend.image}",
                                            ports: [
                                                {
                                                    name: "http",
                                                    containerPort: "${schema.spec.backend.port}",
                                                },
                                            ],
                                            envFrom: [
                                                {
                                                    configMapRef: {
                                                        name: "${awsConfig.metadata.name}",
                                                    },
                                                },
                                            ],
                                            resources: {
                                                requests: {
                                                    cpu: "${schema.spec.backend.resources.cpu}",
                                                    memory: "${schema.spec.backend.resources.memory}",
                                                },
                                                limits: {
                                                    cpu: "${schema.spec.backend.resources.cpu}",
                                                    memory: "${schema.spec.backend.resources.memory}",
                                                },
                                            },
                                            livenessProbe: {
                                                httpGet: {
                                                    path: "/health",
                                                    port: "http",
                                                },
                                                initialDelaySeconds: 15,
                                                periodSeconds: 10,
                                            },
                                            readinessProbe: {
                                                httpGet: {
                                                    path: "/ready",
                                                    port: "http",
                                                },
                                                initialDelaySeconds: 5,
                                                periodSeconds: 5,
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    readyWhen: [
                        "${backendDeployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                    ],
                },

                // Backend Service
                {
                    id: "backendService",
                    template: {
                        apiVersion: "v1",
                        kind: "Service",
                        metadata: {
                            name: "${schema.spec.name}-backend-svc",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "backend",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            type: "ClusterIP",
                            selector: "${backendDeployment.spec.selector.matchLabels}",
                            ports: [
                                {
                                    name: "http",
                                    port: 80,
                                    targetPort: "http",
                                },
                            ],
                        },
                    },
                },

                // ======================
                // Frontend Deployment
                // ======================
                {
                    id: "frontendDeployment",
                    template: {
                        apiVersion: "apps/v1",
                        kind: "Deployment",
                        metadata: {
                            name: "${schema.spec.name}-frontend",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "frontend",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            replicas: "${schema.spec.frontend.replicas}",
                            selector: {
                                matchLabels: {
                                    "app.kubernetes.io/name": "${schema.spec.name}",
                                    "app.kubernetes.io/component": "frontend",
                                },
                            },
                            template: {
                                metadata: {
                                    labels: {
                                        "app.kubernetes.io/name": "${schema.spec.name}",
                                        "app.kubernetes.io/component": "frontend",
                                        environment: "${schema.spec.environment}",
                                    },
                                },
                                spec: {
                                    containers: [
                                        {
                                            name: "frontend",
                                            image: "${schema.spec.frontend.image}",
                                            ports: [
                                                {
                                                    name: "http",
                                                    containerPort: "${schema.spec.frontend.port}",
                                                },
                                            ],
                                            env: [
                                                {
                                                    name: "BACKEND_URL",
                                                    value: "http://${backendService.metadata.name}",
                                                },
                                                {
                                                    name: "ENVIRONMENT",
                                                    value: "${schema.spec.environment}",
                                                },
                                            ],
                                            resources: {
                                                requests: {
                                                    cpu: "${schema.spec.frontend.resources.cpu}",
                                                    memory: "${schema.spec.frontend.resources.memory}",
                                                },
                                                limits: {
                                                    cpu: "${schema.spec.frontend.resources.cpu}",
                                                    memory: "${schema.spec.frontend.resources.memory}",
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    readyWhen: [
                        "${frontendDeployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                    ],
                },

                // Frontend Service
                {
                    id: "frontendService",
                    template: {
                        apiVersion: "v1",
                        kind: "Service",
                        metadata: {
                            name: "${schema.spec.name}-frontend-svc",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "frontend",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            type: "ClusterIP",
                            selector: "${frontendDeployment.spec.selector.matchLabels}",
                            ports: [
                                {
                                    name: "http",
                                    port: 80,
                                    targetPort: "http",
                                },
                            ],
                        },
                    },
                },

                // Frontend Ingress
                {
                    id: "frontendIngress",
                    includeWhen: ["${schema.spec.frontend.ingress.enabled}"],
                    template: {
                        apiVersion: "networking.k8s.io/v1",
                        kind: "Ingress",
                        metadata: {
                            name: "${schema.spec.name}-ingress",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "frontend",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            ingressClassName: "${schema.spec.frontend.ingress.ingressClassName}",
                            tls: "${schema.spec.frontend.ingress.tlsEnabled ? [{'hosts': [schema.spec.frontend.ingress.host], 'secretName': schema.spec.name + '-tls'}] : []}",
                            rules: [
                                {
                                    host: "${schema.spec.frontend.ingress.host}",
                                    http: {
                                        paths: [
                                            {
                                                path: "/api",
                                                pathType: "Prefix",
                                                backend: {
                                                    service: {
                                                        name: "${backendService.metadata.name}",
                                                        port: {
                                                            number: 80,
                                                        },
                                                    },
                                                },
                                            },
                                            {
                                                path: "/",
                                                pathType: "Prefix",
                                                backend: {
                                                    service: {
                                                        name: "${frontendService.metadata.name}",
                                                        port: {
                                                            number: 80,
                                                        },
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                },

                // ======================
                // Network Policies
                // ======================
                {
                    id: "backendNetworkPolicy",
                    includeWhen: ["${schema.spec.networkPolicy.enabled}"],
                    template: {
                        apiVersion: "networking.k8s.io/v1",
                        kind: "NetworkPolicy",
                        metadata: {
                            name: "${schema.spec.name}-backend-netpol",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "backend",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            podSelector: {
                                matchLabels: {
                                    "app.kubernetes.io/name": "${schema.spec.name}",
                                    "app.kubernetes.io/component": "backend",
                                },
                            },
                            policyTypes: ["Ingress"],
                            ingress: [
                                {
                                    from: [
                                        {
                                            podSelector: {
                                                matchLabels: {
                                                    "app.kubernetes.io/name": "${schema.spec.name}",
                                                    "app.kubernetes.io/component": "frontend",
                                                },
                                            },
                                        },
                                    ],
                                    ports: [
                                        {
                                            protocol: "TCP",
                                            port: "${schema.spec.backend.port}",
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
            ],
        },
    });
}

// Example usage
const config = new pulumi.Config();
const environment = config.get("environment") ?? "dev";
const awsRegion = config.get("aws:region") ?? "us-west-2";

const fullstackRgd = createFullStackApplicationRgd({
    name: "fullstack-application",
    namespace: "default",
    awsRegion: awsRegion,
    labels: {
        environment: environment,
    },
});

export const rgdName = fullstackRgd.metadata.name;
export const rgdNamespace = fullstackRgd.metadata.namespace;
