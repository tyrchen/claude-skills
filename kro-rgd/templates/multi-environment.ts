/**
 * KRO ResourceGraphDefinition: Multi-Environment Application
 *
 * Creates an application with environment-aware configuration:
 * - Environment-specific resource quotas
 * - Different replica counts per environment
 * - NetworkPolicies based on environment
 * - Environment-specific secrets and configs
 * - Optional production features (PDB, HPA, monitoring)
 *
 * Usage:
 *   pulumi up
 *
 * Then create instances:
 *   kubectl apply -f - <<EOF
 *   apiVersion: v1alpha1
 *   kind: MultiEnvApplication
 *   metadata:
 *     name: my-service
 *   spec:
 *     name: my-service
 *     image: myregistry/service:v1.0
 *     environment: prod
 *     tier: critical
 *   EOF
 */

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface MultiEnvironmentRgdArgs {
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

export function createMultiEnvironmentRgd(
    args: MultiEnvironmentRgdArgs
): k8s.apiextensions.CustomResource {
    const namespace = args.namespace ?? "default";

    return new k8s.apiextensions.CustomResource(`${args.name}-rgd`, {
        apiVersion: "kro.run/v1alpha1",
        kind: "ResourceGraphDefinition",
        metadata: {
            name: args.name,
            namespace: namespace,
            labels: {
                "app.kubernetes.io/managed-by": "pulumi",
                "kro.run/type": "multi-environment",
                ...args.labels,
            },
            annotations: {
                "kro.run/description": "Multi-environment application with tier-based configurations",
            },
        },
        spec: {
            schema: {
                apiVersion: "v1alpha1",
                kind: "MultiEnvApplication",
                spec: {
                    // Basic configuration
                    name: "string",
                    image: "string",
                    imagePullPolicy: 'string | default="IfNotPresent"',

                    // Environment settings
                    environment: 'string | default="dev"',
                    tier: 'string | default="standard"',

                    // Port configuration
                    port: "integer | default=8080",
                    metricsPort: "integer | default=9090",

                    // Override defaults (optional)
                    overrides: {
                        replicas: "integer | default=0",
                        cpuRequest: 'string | default=""',
                        memoryRequest: 'string | default=""',
                        cpuLimit: 'string | default=""',
                        memoryLimit: 'string | default=""',
                    },

                    // Feature flags
                    features: {
                        autoscaling: "boolean | default=false",
                        pdb: "boolean | default=false",
                        monitoring: "boolean | default=false",
                        networkPolicy: "boolean | default=true",
                    },

                    // Autoscaling config (when enabled)
                    autoscaling: {
                        minReplicas: "integer | default=0",
                        maxReplicas: "integer | default=0",
                        targetCPU: "integer | default=70",
                    },
                },
                status: {
                    ready:
                        "${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                    availableReplicas: "${deployment.status.availableReplicas}",
                    desiredReplicas: "${deployment.spec.replicas}",
                    serviceEndpoint: "${service.spec.clusterIP}",
                    environment: "${schema.spec.environment}",
                    tier: "${schema.spec.tier}",
                    effectiveReplicas: "${deployment.spec.replicas}",
                },
                validation: [
                    {
                        expression: "self.environment in ['dev', 'staging', 'prod']",
                        message: "Environment must be dev, staging, or prod",
                    },
                    {
                        expression: "self.tier in ['standard', 'critical', 'background']",
                        message: "Tier must be standard, critical, or background",
                    },
                    {
                        expression:
                            "self.environment == 'prod' && self.tier == 'critical' ? self.features.pdb == true : true",
                        message: "Critical tier in production requires PDB enabled",
                    },
                    {
                        expression:
                            "self.features.autoscaling ? (self.autoscaling.maxReplicas >= self.autoscaling.minReplicas) : true",
                        message: "Autoscaling maxReplicas must be >= minReplicas",
                    },
                    {
                        expression:
                            "self.environment == 'prod' ? self.features.monitoring == true : true",
                        message: "Monitoring must be enabled in production",
                    },
                ],
            },
            resources: [
                // ConfigMap with environment-specific defaults
                {
                    id: "envConfig",
                    template: {
                        apiVersion: "v1",
                        kind: "ConfigMap",
                        metadata: {
                            name: "${schema.spec.name}-env-config",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/managed-by": "kro",
                                environment: "${schema.spec.environment}",
                                tier: "${schema.spec.tier}",
                            },
                        },
                        data: {
                            ENVIRONMENT: "${schema.spec.environment}",
                            TIER: "${schema.spec.tier}",
                            LOG_LEVEL:
                                "${schema.spec.environment == 'prod' ? 'info' : 'debug'}",
                            ENABLE_DEBUG:
                                "${schema.spec.environment == 'dev' ? 'true' : 'false'}",
                            METRICS_ENABLED:
                                "${schema.spec.features.monitoring ? 'true' : 'false'}",

                            // Environment-specific resource defaults (for reference)
                            DEFAULT_REPLICAS:
                                "${schema.spec.environment == 'prod' ? (schema.spec.tier == 'critical' ? '5' : '3') : (schema.spec.environment == 'staging' ? '2' : '1')}",
                            DEFAULT_CPU_REQUEST:
                                "${schema.spec.tier == 'critical' ? '500m' : (schema.spec.tier == 'standard' ? '250m' : '100m')}",
                            DEFAULT_MEMORY_REQUEST:
                                "${schema.spec.tier == 'critical' ? '1Gi' : (schema.spec.tier == 'standard' ? '512Mi' : '256Mi')}",
                        },
                    },
                },

                // Main Deployment with environment-aware configuration
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
                                tier: "${schema.spec.tier}",
                            },
                        },
                        spec: {
                            // Compute replicas based on environment and tier, with override support
                            replicas:
                                "${schema.spec.overrides.replicas > 0 ? schema.spec.overrides.replicas : (schema.spec.environment == 'prod' ? (schema.spec.tier == 'critical' ? 5 : 3) : (schema.spec.environment == 'staging' ? 2 : 1))}",
                            selector: {
                                matchLabels: {
                                    "app.kubernetes.io/name": "${schema.spec.name}",
                                    "app.kubernetes.io/instance": "${schema.metadata.name}",
                                },
                            },
                            strategy: {
                                type: "RollingUpdate",
                                rollingUpdate: {
                                    // Production gets more conservative update strategy
                                    maxSurge:
                                        "${schema.spec.environment == 'prod' ? '25%' : '50%'}",
                                    maxUnavailable:
                                        "${schema.spec.environment == 'prod' ? '0' : '25%'}",
                                },
                            },
                            template: {
                                metadata: {
                                    labels: {
                                        "app.kubernetes.io/name": "${schema.spec.name}",
                                        "app.kubernetes.io/instance": "${schema.metadata.name}",
                                        environment: "${schema.spec.environment}",
                                        tier: "${schema.spec.tier}",
                                    },
                                    annotations: {
                                        "prometheus.io/scrape":
                                            "${schema.spec.features.monitoring ? 'true' : 'false'}",
                                        "prometheus.io/port": "${string(schema.spec.metricsPort)}",
                                    },
                                },
                                spec: {
                                    // Spread pods across zones in production
                                    topologySpreadConstraints:
                                        "${schema.spec.environment == 'prod' ? [{'maxSkew': 1, 'topologyKey': 'topology.kubernetes.io/zone', 'whenUnsatisfiable': 'ScheduleAnyway', 'labelSelector': {'matchLabels': {'app.kubernetes.io/name': schema.spec.name}}}] : []}",
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
                                                {
                                                    name: "metrics",
                                                    containerPort: "${schema.spec.metricsPort}",
                                                    protocol: "TCP",
                                                },
                                            ],
                                            envFrom: [
                                                {
                                                    configMapRef: {
                                                        name: "${envConfig.metadata.name}",
                                                    },
                                                },
                                            ],
                                            resources: {
                                                requests: {
                                                    // Use override if provided, otherwise compute from tier
                                                    cpu: "${schema.spec.overrides.cpuRequest != '' ? schema.spec.overrides.cpuRequest : (schema.spec.tier == 'critical' ? '500m' : (schema.spec.tier == 'standard' ? '250m' : '100m'))}",
                                                    memory: "${schema.spec.overrides.memoryRequest != '' ? schema.spec.overrides.memoryRequest : (schema.spec.tier == 'critical' ? '1Gi' : (schema.spec.tier == 'standard' ? '512Mi' : '256Mi'))}",
                                                },
                                                limits: {
                                                    cpu: "${schema.spec.overrides.cpuLimit != '' ? schema.spec.overrides.cpuLimit : (schema.spec.tier == 'critical' ? '2000m' : (schema.spec.tier == 'standard' ? '1000m' : '500m'))}",
                                                    memory: "${schema.spec.overrides.memoryLimit != '' ? schema.spec.overrides.memoryLimit : (schema.spec.tier == 'critical' ? '2Gi' : (schema.spec.tier == 'standard' ? '1Gi' : '512Mi'))}",
                                                },
                                            },
                                            livenessProbe: {
                                                httpGet: {
                                                    path: "/health",
                                                    port: "http",
                                                },
                                                initialDelaySeconds:
                                                    "${schema.spec.environment == 'prod' ? 30 : 10}",
                                                periodSeconds: 10,
                                                failureThreshold: 3,
                                            },
                                            readinessProbe: {
                                                httpGet: {
                                                    path: "/ready",
                                                    port: "http",
                                                },
                                                initialDelaySeconds: 5,
                                                periodSeconds: 5,
                                                failureThreshold: 3,
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    readyWhen: [
                        "${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                        "${deployment.status.readyReplicas >= 1}",
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
                            type: "ClusterIP",
                            selector: "${deployment.spec.selector.matchLabels}",
                            ports: [
                                {
                                    name: "http",
                                    port: 80,
                                    targetPort: "http",
                                    protocol: "TCP",
                                },
                                {
                                    name: "metrics",
                                    port: 9090,
                                    targetPort: "metrics",
                                    protocol: "TCP",
                                },
                            ],
                        },
                    },
                },

                // HorizontalPodAutoscaler (conditional)
                {
                    id: "hpa",
                    includeWhen: ["${schema.spec.features.autoscaling}"],
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
                            // Use autoscaling config if provided, otherwise derive from environment/tier
                            minReplicas:
                                "${schema.spec.autoscaling.minReplicas > 0 ? schema.spec.autoscaling.minReplicas : (schema.spec.environment == 'prod' ? (schema.spec.tier == 'critical' ? 5 : 3) : 2)}",
                            maxReplicas:
                                "${schema.spec.autoscaling.maxReplicas > 0 ? schema.spec.autoscaling.maxReplicas : (schema.spec.environment == 'prod' ? (schema.spec.tier == 'critical' ? 20 : 10) : 5)}",
                            metrics: [
                                {
                                    type: "Resource",
                                    resource: {
                                        name: "cpu",
                                        target: {
                                            type: "Utilization",
                                            averageUtilization:
                                                "${schema.spec.autoscaling.targetCPU}",
                                        },
                                    },
                                },
                            ],
                            behavior: {
                                scaleDown: {
                                    // Conservative scale down in production
                                    stabilizationWindowSeconds:
                                        "${schema.spec.environment == 'prod' ? 300 : 60}",
                                    policies: [
                                        {
                                            type: "Percent",
                                            value:
                                                "${schema.spec.environment == 'prod' ? 10 : 50}",
                                            periodSeconds: 60,
                                        },
                                    ],
                                },
                                scaleUp: {
                                    stabilizationWindowSeconds: 0,
                                    policies: [
                                        {
                                            type: "Percent",
                                            value: 100,
                                            periodSeconds: 15,
                                        },
                                        {
                                            type: "Pods",
                                            value: 4,
                                            periodSeconds: 15,
                                        },
                                    ],
                                    selectPolicy: "Max",
                                },
                            },
                        },
                    },
                },

                // PodDisruptionBudget (conditional)
                {
                    id: "pdb",
                    includeWhen: ["${schema.spec.features.pdb}"],
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
                            // Critical tier requires more availability
                            minAvailable: "${schema.spec.tier == 'critical' ? '75%' : '50%'}",
                            selector: {
                                matchLabels: "${deployment.spec.selector.matchLabels}",
                            },
                        },
                    },
                },

                // ServiceMonitor for Prometheus (conditional)
                {
                    id: "serviceMonitor",
                    includeWhen: ["${schema.spec.features.monitoring}"],
                    template: {
                        apiVersion: "monitoring.coreos.com/v1",
                        kind: "ServiceMonitor",
                        metadata: {
                            name: "${schema.spec.name}-monitor",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            selector: {
                                matchLabels: {
                                    "app.kubernetes.io/name": "${schema.spec.name}",
                                },
                            },
                            endpoints: [
                                {
                                    port: "metrics",
                                    interval:
                                        "${schema.spec.tier == 'critical' ? '15s' : '30s'}",
                                    path: "/metrics",
                                },
                            ],
                        },
                    },
                },

                // NetworkPolicy (conditional)
                {
                    id: "networkPolicy",
                    includeWhen: ["${schema.spec.features.networkPolicy}"],
                    template: {
                        apiVersion: "networking.k8s.io/v1",
                        kind: "NetworkPolicy",
                        metadata: {
                            name: "${schema.spec.name}-netpol",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/instance": "${schema.metadata.name}",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            podSelector: {
                                matchLabels: "${deployment.spec.selector.matchLabels}",
                            },
                            policyTypes: ["Ingress", "Egress"],
                            ingress: [
                                {
                                    // Allow from same namespace
                                    from: [
                                        {
                                            namespaceSelector: {
                                                matchLabels: {
                                                    "kubernetes.io/metadata.name":
                                                        "${schema.metadata.namespace}",
                                                },
                                            },
                                        },
                                    ],
                                    ports: [
                                        {
                                            protocol: "TCP",
                                            port: "${schema.spec.port}",
                                        },
                                    ],
                                },
                                {
                                    // Allow metrics scraping from monitoring namespace
                                    from: [
                                        {
                                            namespaceSelector: {
                                                matchLabels: {
                                                    "name": "monitoring",
                                                },
                                            },
                                        },
                                    ],
                                    ports: [
                                        {
                                            protocol: "TCP",
                                            port: "${schema.spec.metricsPort}",
                                        },
                                    ],
                                },
                            ],
                            egress: [
                                {
                                    // Allow DNS
                                    to: [
                                        {
                                            namespaceSelector: {},
                                            podSelector: {
                                                matchLabels: {
                                                    "k8s-app": "kube-dns",
                                                },
                                            },
                                        },
                                    ],
                                    ports: [
                                        {
                                            protocol: "UDP",
                                            port: 53,
                                        },
                                    ],
                                },
                                {
                                    // Allow to same namespace
                                    to: [
                                        {
                                            namespaceSelector: {
                                                matchLabels: {
                                                    "kubernetes.io/metadata.name":
                                                        "${schema.metadata.namespace}",
                                                },
                                            },
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

const multiEnvRgd = createMultiEnvironmentRgd({
    name: "multi-environment-app",
    namespace: "default",
});

export const rgdName = multiEnvRgd.metadata.name;
export const rgdNamespace = multiEnvRgd.metadata.namespace;
