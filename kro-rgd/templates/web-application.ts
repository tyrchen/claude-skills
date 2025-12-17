/**
 * KRO ResourceGraphDefinition: Web Application Stack
 *
 * Creates a complete web application with:
 * - Deployment with configurable replicas and resources
 * - Service for internal access
 * - Optional Ingress with TLS support
 * - Optional HorizontalPodAutoscaler
 * - Optional PodDisruptionBudget for production
 *
 * Usage:
 *   pulumi up
 *
 * Then create instances:
 *   kubectl apply -f - <<EOF
 *   apiVersion: v1alpha1
 *   kind: WebApplication
 *   metadata:
 *     name: my-frontend
 *   spec:
 *     name: frontend
 *     image: nginx:1.25
 *     replicas: 3
 *     port: 80
 *     environment: prod
 *     ingress:
 *       enabled: true
 *       host: frontend.example.com
 *       tlsEnabled: true
 *   EOF
 */

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface WebApplicationRgdArgs {
    /**
     * Name of the RGD resource
     */
    name: string;

    /**
     * Namespace to deploy the RGD
     */
    namespace?: string;

    /**
     * Additional labels to apply
     */
    labels?: { [key: string]: string };
}

export function createWebApplicationRgd(args: WebApplicationRgdArgs): k8s.apiextensions.CustomResource {
    const namespace = args.namespace ?? "default";

    return new k8s.apiextensions.CustomResource(`${args.name}-rgd`, {
        apiVersion: "kro.run/v1alpha1",
        kind: "ResourceGraphDefinition",
        metadata: {
            name: args.name,
            namespace: namespace,
            labels: {
                "app.kubernetes.io/managed-by": "pulumi",
                "kro.run/type": "web-application",
                ...args.labels,
            },
            annotations: {
                "kro.run/description": "Web application with optional ingress, autoscaling, and PDB",
            },
        },
        spec: {
            schema: {
                apiVersion: "v1alpha1",
                kind: "WebApplication",
                spec: {
                    // Required fields
                    name: "string",

                    // Image configuration
                    image: 'string | default="nginx:latest"',
                    imagePullPolicy: 'string | default="IfNotPresent"',

                    // Scaling
                    replicas: "integer | default=3",

                    // Networking
                    port: "integer | default=80",
                    serviceType: 'string | default="ClusterIP"',

                    // Environment
                    environment: 'string | default="dev"',

                    // Resource limits
                    resources: {
                        cpu: 'string | default="100m"',
                        memory: 'string | default="256Mi"',
                        cpuLimit: 'string | default="500m"',
                        memoryLimit: 'string | default="512Mi"',
                    },

                    // Health checks
                    healthCheck: {
                        enabled: "boolean | default=true",
                        path: 'string | default="/"',
                        port: "integer | default=80",
                        initialDelaySeconds: "integer | default=10",
                        periodSeconds: "integer | default=10",
                    },

                    // Ingress configuration
                    ingress: {
                        enabled: "boolean | default=false",
                        host: 'string | default=""',
                        path: 'string | default="/"',
                        pathType: 'string | default="Prefix"',
                        tlsEnabled: "boolean | default=false",
                        tlsSecretName: 'string | default=""',
                        ingressClassName: 'string | default="nginx"',
                        annotations: 'object | default={}',
                    },

                    // Autoscaling configuration
                    autoscaling: {
                        enabled: "boolean | default=false",
                        minReplicas: "integer | default=2",
                        maxReplicas: "integer | default=10",
                        targetCPUUtilization: "integer | default=70",
                        targetMemoryUtilization: "integer | default=80",
                    },

                    // PodDisruptionBudget
                    pdb: {
                        enabled: "boolean | default=false",
                        minAvailable: 'string | default="50%"',
                    },
                },
                status: {
                    // Deployment status
                    ready:
                        "${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                    availableReplicas: "${deployment.status.availableReplicas}",
                    updatedReplicas: "${deployment.status.updatedReplicas}",

                    // Service status
                    serviceIP: "${service.spec.clusterIP}",
                    serviceName: "${service.metadata.name}",

                    // Ingress status (with null safety)
                    ingressHost: "${ingress.spec.?rules[0].host ?? ''}",
                    ingressURL:
                        "${schema.spec.ingress.enabled ? (schema.spec.ingress.tlsEnabled ? 'https://' : 'http://') + schema.spec.ingress.host : ''}",
                },
                validation: [
                    {
                        expression: "self.replicas >= 1 && self.replicas <= 100",
                        message: "Replicas must be between 1 and 100",
                    },
                    {
                        expression: "self.environment in ['dev', 'staging', 'prod']",
                        message: "Environment must be one of: dev, staging, prod",
                    },
                    {
                        expression: "self.ingress.enabled ? self.ingress.host != '' : true",
                        message: "Ingress host is required when ingress is enabled",
                    },
                    {
                        expression: "self.environment == 'prod' ? self.replicas >= 2 : true",
                        message: "Production environment requires at least 2 replicas",
                    },
                    {
                        expression:
                            "self.autoscaling.enabled ? self.autoscaling.maxReplicas >= self.autoscaling.minReplicas : true",
                        message: "Autoscaling maxReplicas must be >= minReplicas",
                    },
                    {
                        expression: "self.port >= 1 && self.port <= 65535",
                        message: "Port must be between 1 and 65535",
                    },
                ],
            },
            resources: [
                // ConfigMap for application configuration
                {
                    id: "configmap",
                    template: {
                        apiVersion: "v1",
                        kind: "ConfigMap",
                        metadata: {
                            name: "${schema.spec.name}-config",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                                environment: "${schema.spec.environment}",
                            },
                        },
                        data: {
                            ENVIRONMENT: "${schema.spec.environment}",
                            APP_NAME: "${schema.spec.name}",
                            APP_PORT: "${string(schema.spec.port)}",
                        },
                    },
                },

                // Main Deployment
                {
                    id: "deployment",
                    template: {
                        apiVersion: "apps/v1",
                        kind: "Deployment",
                        metadata: {
                            name: "${schema.spec.name}",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                                environment: "${schema.spec.environment}",
                            },
                        },
                        spec: {
                            replicas: "${schema.spec.replicas}",
                            selector: {
                                matchLabels: {
                                    "app.kubernetes.io/name": "${schema.spec.name}",
                                    "app.kubernetes.io/instance": "${schema.metadata.name}",
                                },
                            },
                            template: {
                                metadata: {
                                    labels: {
                                        "app.kubernetes.io/name": "${schema.spec.name}",
                                        "app.kubernetes.io/instance": "${schema.metadata.name}",
                                        environment: "${schema.spec.environment}",
                                    },
                                },
                                spec: {
                                    containers: [
                                        {
                                            name: "app",
                                            image: "${schema.spec.image}",
                                            imagePullPolicy: "${schema.spec.imagePullPolicy}",
                                            ports: [
                                                {
                                                    name: "http",
                                                    containerPort: "${schema.spec.port}",
                                                    protocol: "TCP",
                                                },
                                            ],
                                            envFrom: [
                                                {
                                                    configMapRef: {
                                                        name: "${configmap.metadata.name}",
                                                    },
                                                },
                                            ],
                                            resources: {
                                                requests: {
                                                    cpu: "${schema.spec.resources.cpu}",
                                                    memory: "${schema.spec.resources.memory}",
                                                },
                                                limits: {
                                                    cpu: "${schema.spec.resources.cpuLimit}",
                                                    memory: "${schema.spec.resources.memoryLimit}",
                                                },
                                            },
                                            livenessProbe:
                                                "${schema.spec.healthCheck.enabled ? {'httpGet': {'path': schema.spec.healthCheck.path, 'port': schema.spec.healthCheck.port}, 'initialDelaySeconds': schema.spec.healthCheck.initialDelaySeconds, 'periodSeconds': schema.spec.healthCheck.periodSeconds} : null}",
                                            readinessProbe:
                                                "${schema.spec.healthCheck.enabled ? {'httpGet': {'path': schema.spec.healthCheck.path, 'port': schema.spec.healthCheck.port}, 'initialDelaySeconds': 5, 'periodSeconds': 5} : null}",
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    readyWhen: [
                        "${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                        "${deployment.status.readyReplicas == deployment.spec.replicas}",
                    ],
                },

                // Service
                {
                    id: "service",
                    template: {
                        apiVersion: "v1",
                        kind: "Service",
                        metadata: {
                            name: "${schema.spec.name}-svc",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            type: "${schema.spec.serviceType}",
                            selector: "${deployment.spec.selector.matchLabels}",
                            ports: [
                                {
                                    name: "http",
                                    port: 80,
                                    targetPort: "http",
                                    protocol: "TCP",
                                },
                            ],
                        },
                    },
                },

                // Ingress (conditional)
                {
                    id: "ingress",
                    includeWhen: ["${schema.spec.ingress.enabled}"],
                    template: {
                        apiVersion: "networking.k8s.io/v1",
                        kind: "Ingress",
                        metadata: {
                            name: "${schema.spec.name}-ingress",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                            annotations: "${schema.spec.ingress.annotations}",
                        },
                        spec: {
                            ingressClassName: "${schema.spec.ingress.ingressClassName}",
                            tls: "${schema.spec.ingress.tlsEnabled ? [{'hosts': [schema.spec.ingress.host], 'secretName': schema.spec.ingress.tlsSecretName != '' ? schema.spec.ingress.tlsSecretName : schema.spec.name + '-tls'}] : []}",
                            rules: [
                                {
                                    host: "${schema.spec.ingress.host}",
                                    http: {
                                        paths: [
                                            {
                                                path: "${schema.spec.ingress.path}",
                                                pathType: "${schema.spec.ingress.pathType}",
                                                backend: {
                                                    service: {
                                                        name: "${service.metadata.name}",
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

                // HorizontalPodAutoscaler (conditional)
                {
                    id: "hpa",
                    includeWhen: ["${schema.spec.autoscaling.enabled}"],
                    template: {
                        apiVersion: "autoscaling/v2",
                        kind: "HorizontalPodAutoscaler",
                        metadata: {
                            name: "${schema.spec.name}-hpa",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            scaleTargetRef: {
                                apiVersion: "apps/v1",
                                kind: "Deployment",
                                name: "${deployment.metadata.name}",
                            },
                            minReplicas: "${schema.spec.autoscaling.minReplicas}",
                            maxReplicas: "${schema.spec.autoscaling.maxReplicas}",
                            metrics: [
                                {
                                    type: "Resource",
                                    resource: {
                                        name: "cpu",
                                        target: {
                                            type: "Utilization",
                                            averageUtilization:
                                                "${schema.spec.autoscaling.targetCPUUtilization}",
                                        },
                                    },
                                },
                                {
                                    type: "Resource",
                                    resource: {
                                        name: "memory",
                                        target: {
                                            type: "Utilization",
                                            averageUtilization:
                                                "${schema.spec.autoscaling.targetMemoryUtilization}",
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },

                // PodDisruptionBudget (conditional - typically for production)
                {
                    id: "pdb",
                    includeWhen: ["${schema.spec.pdb.enabled}"],
                    template: {
                        apiVersion: "policy/v1",
                        kind: "PodDisruptionBudget",
                        metadata: {
                            name: "${schema.spec.name}-pdb",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            minAvailable: "${schema.spec.pdb.minAvailable}",
                            selector: {
                                matchLabels: "${deployment.spec.selector.matchLabels}",
                            },
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

const webAppRgd = createWebApplicationRgd({
    name: "web-application",
    namespace: "default",
    labels: {
        environment: environment,
    },
});

export const rgdName = webAppRgd.metadata.name;
export const rgdNamespace = webAppRgd.metadata.namespace;
