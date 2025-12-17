/**
 * KRO ResourceGraphDefinition: Database Application with AWS RDS via ACK
 *
 * Creates a complete database-backed application with:
 * - AWS RDS instance via ACK controller
 * - Kubernetes Secret for database credentials
 * - ConfigMap for database connection info
 * - Application Deployment with database connectivity
 * - Service for application access
 *
 * Prerequisites:
 *   - ACK RDS controller installed: helm install ack-rds-controller oci://public.ecr.aws/aws-controllers-k8s/rds-chart
 *   - IRSA configured for RDS access
 *   - DB subnet group and security group pre-created
 *
 * Usage:
 *   pulumi up
 *
 * Then create instances:
 *   kubectl apply -f - <<EOF
 *   apiVersion: v1alpha1
 *   kind: DatabaseApplication
 *   metadata:
 *     name: my-api
 *   spec:
 *     name: api-backend
 *     image: myregistry/api:v1.0
 *     database:
 *       instanceClass: db.t3.medium
 *       engine: postgres
 *       engineVersion: "15.4"
 *       allocatedStorage: 50
 *       dbName: myapi
 *       masterUsername: admin
 *       dbSubnetGroupName: my-db-subnet-group
 *       vpcSecurityGroupIDs:
 *         - sg-12345678
 *   EOF
 */

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface DatabaseApplicationRgdArgs {
    /**
     * Name of the RGD resource
     */
    name: string;

    /**
     * Namespace to deploy the RGD
     */
    namespace?: string;

    /**
     * AWS region for RDS resources
     */
    awsRegion?: string;

    /**
     * Additional labels to apply
     */
    labels?: { [key: string]: string };
}

export function createDatabaseApplicationRgd(
    args: DatabaseApplicationRgdArgs
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
                "kro.run/type": "database-application",
                ...args.labels,
            },
            annotations: {
                "kro.run/description": "Database application with AWS RDS via ACK",
            },
        },
        spec: {
            schema: {
                apiVersion: "v1alpha1",
                kind: "DatabaseApplication",
                spec: {
                    // Application configuration
                    name: "string",
                    image: "string",
                    replicas: "integer | default=2",
                    port: "integer | default=8080",
                    environment: 'string | default="dev"',

                    // Application resources
                    resources: {
                        cpu: 'string | default="250m"',
                        memory: 'string | default="512Mi"',
                        cpuLimit: 'string | default="1000m"',
                        memoryLimit: 'string | default="1Gi"',
                    },

                    // Database configuration
                    database: {
                        // RDS instance configuration
                        instanceClass: 'string | default="db.t3.micro"',
                        engine: 'string | default="postgres"',
                        engineVersion: 'string | default="15.4"',
                        allocatedStorage: "integer | default=20",
                        maxAllocatedStorage: "integer | default=100",

                        // Database settings
                        dbName: "string",
                        masterUsername: 'string | default="admin"',
                        port: "integer | default=5432",

                        // Network configuration
                        dbSubnetGroupName: "string",
                        vpcSecurityGroupIDs: "[]string",
                        publiclyAccessible: "boolean | default=false",

                        // Backup configuration
                        backupRetentionPeriod: "integer | default=7",
                        preferredBackupWindow: 'string | default="03:00-04:00"',
                        preferredMaintenanceWindow: 'string | default="Mon:04:00-Mon:05:00"',

                        // Additional options
                        multiAZ: "boolean | default=false",
                        storageEncrypted: "boolean | default=true",
                        storageType: 'string | default="gp3"',
                        deletionProtection: "boolean | default=false",
                        skipFinalSnapshot: "boolean | default=true",
                    },

                    // Additional environment variables (optional)
                    extraEnvVars: "object | default={}",
                },
                status: {
                    // Application status
                    applicationReady:
                        "${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
                    availableReplicas: "${deployment.status.availableReplicas}",
                    serviceEndpoint: "${service.spec.clusterIP}",

                    // Database status
                    databaseReady: "${dbinstance.status.?dbInstanceStatus == 'available'}",
                    databaseEndpoint: "${dbinstance.status.?endpoint.address ?? 'pending'}",
                    databasePort: "${dbinstance.status.?endpoint.port ?? 0}",
                    databaseArn: "${dbinstance.status.?ackResourceMetadata.arn ?? 'pending'}",

                    // Overall status
                    ready:
                        "${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True') && dbinstance.status.?dbInstanceStatus == 'available'}",
                },
                validation: [
                    {
                        expression: "self.replicas >= 1 && self.replicas <= 50",
                        message: "Replicas must be between 1 and 50",
                    },
                    {
                        expression: "self.database.engine in ['postgres', 'mysql', 'mariadb']",
                        message: "Database engine must be postgres, mysql, or mariadb",
                    },
                    {
                        expression:
                            "self.database.allocatedStorage >= 20 && self.database.allocatedStorage <= 65536",
                        message: "Allocated storage must be between 20 and 65536 GB",
                    },
                    {
                        expression:
                            "self.database.maxAllocatedStorage >= self.database.allocatedStorage",
                        message: "Max allocated storage must be >= allocated storage",
                    },
                    {
                        expression: "self.database.backupRetentionPeriod >= 0 && self.database.backupRetentionPeriod <= 35",
                        message: "Backup retention period must be between 0 and 35 days",
                    },
                    {
                        expression: "size(self.database.vpcSecurityGroupIDs) >= 1",
                        message: "At least one VPC security group ID is required",
                    },
                    {
                        expression:
                            "self.environment == 'prod' ? self.database.multiAZ == true : true",
                        message: "Production environment requires Multi-AZ deployment",
                    },
                    {
                        expression:
                            "self.environment == 'prod' ? self.database.deletionProtection == true : true",
                        message: "Production environment requires deletion protection",
                    },
                ],
            },
            resources: [
                // Kubernetes Secret for database master password
                // Note: In production, use external-secrets or sealed-secrets
                {
                    id: "dbsecret",
                    template: {
                        apiVersion: "v1",
                        kind: "Secret",
                        metadata: {
                            name: "${schema.spec.name}-db-credentials",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "database",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        type: "Opaque",
                        stringData: {
                            // Generate a random password - in production use external secrets
                            password:
                                "${schema.spec.name}-${schema.metadata.uid.substring(0, 8)}",
                        },
                    },
                },

                // AWS RDS DBInstance via ACK
                {
                    id: "dbinstance",
                    template: {
                        apiVersion: "rds.services.k8s.aws/v1alpha1",
                        kind: "DBInstance",
                        metadata: {
                            name: "${schema.spec.name}-db",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "database",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        spec: {
                            dbInstanceIdentifier: "${schema.spec.name}-${schema.metadata.namespace}",
                            dbInstanceClass: "${schema.spec.database.instanceClass}",
                            engine: "${schema.spec.database.engine}",
                            engineVersion: "${schema.spec.database.engineVersion}",
                            allocatedStorage: "${schema.spec.database.allocatedStorage}",
                            maxAllocatedStorage: "${schema.spec.database.maxAllocatedStorage}",
                            storageType: "${schema.spec.database.storageType}",
                            storageEncrypted: "${schema.spec.database.storageEncrypted}",

                            dbName: "${schema.spec.database.dbName}",
                            masterUsername: "${schema.spec.database.masterUsername}",
                            masterUserPassword: {
                                name: "${dbsecret.metadata.name}",
                                key: "password",
                            },
                            port: "${schema.spec.database.port}",

                            dbSubnetGroupName: "${schema.spec.database.dbSubnetGroupName}",
                            vpcSecurityGroupIDs: "${schema.spec.database.vpcSecurityGroupIDs}",
                            publiclyAccessible: "${schema.spec.database.publiclyAccessible}",

                            multiAZ: "${schema.spec.database.multiAZ}",
                            backupRetentionPeriod: "${schema.spec.database.backupRetentionPeriod}",
                            preferredBackupWindow: "${schema.spec.database.preferredBackupWindow}",
                            preferredMaintenanceWindow:
                                "${schema.spec.database.preferredMaintenanceWindow}",

                            deletionProtection: "${schema.spec.database.deletionProtection}",
                            skipFinalSnapshot: "${schema.spec.database.skipFinalSnapshot}",

                            tags: [
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
                    readyWhen: ["${dbinstance.status.?dbInstanceStatus == 'available'}"],
                },

                // ConfigMap with database connection info
                {
                    id: "dbconfig",
                    template: {
                        apiVersion: "v1",
                        kind: "ConfigMap",
                        metadata: {
                            name: "${schema.spec.name}-db-config",
                            namespace: "${schema.metadata.namespace}",
                            labels: {
                                "app.kubernetes.io/name": "${schema.spec.name}",
                                "app.kubernetes.io/component": "database",
                                "app.kubernetes.io/managed-by": "kro",
                            },
                        },
                        data: {
                            DB_HOST: "${dbinstance.status.endpoint.address}",
                            DB_PORT: "${string(dbinstance.status.endpoint.port)}",
                            DB_NAME: "${schema.spec.database.dbName}",
                            DB_USER: "${schema.spec.database.masterUsername}",
                            DB_ENGINE: "${schema.spec.database.engine}",
                            // Connection string format varies by engine
                            DB_CONNECTION_STRING:
                                "${schema.spec.database.engine}://${schema.spec.database.masterUsername}@${dbinstance.status.endpoint.address}:${string(dbinstance.status.endpoint.port)}/${schema.spec.database.dbName}",
                        },
                    },
                },

                // Application Deployment
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
                                "app.kubernetes.io/component": "application",
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
                                                        name: "${dbconfig.metadata.name}",
                                                    },
                                                },
                                            ],
                                            env: [
                                                {
                                                    name: "DB_PASSWORD",
                                                    valueFrom: {
                                                        secretKeyRef: {
                                                            name: "${dbsecret.metadata.name}",
                                                            key: "password",
                                                        },
                                                    },
                                                },
                                                {
                                                    name: "APP_ENV",
                                                    value: "${schema.spec.environment}",
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
                                            livenessProbe: {
                                                httpGet: {
                                                    path: "/health",
                                                    port: "http",
                                                },
                                                initialDelaySeconds: 30,
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
                        "${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}",
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

const dbAppRgd = createDatabaseApplicationRgd({
    name: "database-application",
    namespace: "default",
    awsRegion: awsRegion,
    labels: {
        environment: environment,
    },
});

export const rgdName = dbAppRgd.metadata.name;
export const rgdNamespace = dbAppRgd.metadata.namespace;
