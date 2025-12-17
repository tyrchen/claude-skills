# AWS ACK Resources Reference for KRO Integration

Reference for integrating AWS Controllers for Kubernetes (ACK) resources with KRO ResourceGraphDefinitions.

## Overview

ACK extends Kubernetes API to manage AWS resources. When combined with KRO, you can create custom APIs that provision both Kubernetes and AWS resources as a single unit.

## ACK Installation

### Per-Service Controllers

Install only the controllers you need:

```bash
# S3 Controller
export SERVICE=s3
export VERSION=$(curl -sL https://api.github.com/repos/aws-controllers-k8s/${SERVICE}-controller/releases/latest | jq -r '.tag_name')
helm install ack-${SERVICE}-controller \
  oci://public.ecr.aws/aws-controllers-k8s/${SERVICE}-chart \
  --version=${VERSION} \
  --namespace ack-system \
  --create-namespace

# RDS Controller
export SERVICE=rds
# ... same pattern

# Common controllers
# s3, rds, dynamodb, sqs, sns, lambda, elasticache, ec2, ecr, eks
```

### IRSA Configuration

```yaml
# ServiceAccount with IAM role annotation
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT_ID:role/ACK-S3-Controller
```

## S3 Resources

### Bucket

```yaml
apiVersion: s3.services.k8s.aws/v1alpha1
kind: Bucket
metadata:
  name: my-bucket
spec:
  name: my-unique-bucket-name-12345  # Must be globally unique
  createBucketConfiguration:
    locationConstraint: us-west-2
  tagging:
    tagSet:
      - key: Environment
        value: Production
      - key: ManagedBy
        value: ACK
  versioning:
    status: Enabled
  publicAccessBlock:
    blockPublicAcls: true
    blockPublicPolicy: true
    ignorePublicAcls: true
    restrictPublicBuckets: true
```

**Status Fields:**
```cel
${bucket.status.ackResourceMetadata.arn}
${bucket.status.ackResourceMetadata.ownerAccountID}
${bucket.status.ackResourceMetadata.region}
```

### KRO Integration Example

```yaml
resources:
  - id: storageBucket
    template:
      apiVersion: s3.services.k8s.aws/v1alpha1
      kind: Bucket
      metadata:
        name: ${schema.spec.name}-storage
      spec:
        name: "${schema.spec.name}-storage-${schema.metadata.uid}"
        versioning:
          status: Enabled
        tagging:
          tagSet:
            - key: Application
              value: ${schema.spec.name}
    readyWhen:
      - ${storageBucket.status.ackResourceMetadata.?arn != null}
```

## RDS Resources

### DBInstance

```yaml
apiVersion: rds.services.k8s.aws/v1alpha1
kind: DBInstance
metadata:
  name: myapp-postgres
spec:
  dbInstanceIdentifier: myapp-postgres
  dbInstanceClass: db.t3.micro
  engine: postgres
  engineVersion: "15.3"
  masterUsername: dbadmin
  masterUserPassword:
    namespace: default
    name: db-credentials
    key: password
  allocatedStorage: 20
  storageType: gp3
  storageEncrypted: true
  backupRetentionPeriod: 7
  preferredBackupWindow: "03:00-04:00"
  preferredMaintenanceWindow: "sun:04:00-sun:05:00"
  multiAZ: true
  publiclyAccessible: false
  vpcSecurityGroupIDs:
    - sg-0123456789abcdef0
  dbSubnetGroupName: my-db-subnet-group
  tags:
    - key: Environment
      value: Production
```

**Status Fields:**
```cel
${dbInstance.status.endpoint.address}
${dbInstance.status.endpoint.port}
${dbInstance.status.dbInstanceStatus}
${dbInstance.status.ackResourceMetadata.arn}
```

### DBSubnetGroup

```yaml
apiVersion: rds.services.k8s.aws/v1alpha1
kind: DBSubnetGroup
metadata:
  name: my-db-subnet-group
spec:
  name: my-db-subnet-group
  description: Subnet group for RDS instances
  subnetIDs:
    - subnet-abc123
    - subnet-def456
  tags:
    - key: Environment
      value: Production
```

### KRO Integration Example

```yaml
resources:
  - id: dbCredentials
    template:
      apiVersion: v1
      kind: Secret
      metadata:
        name: ${schema.spec.name}-db-credentials
      type: Opaque
      stringData:
        username: dbadmin
        password: "${schema.spec.name}-${schema.metadata.uid}"

  - id: database
    template:
      apiVersion: rds.services.k8s.aws/v1alpha1
      kind: DBInstance
      metadata:
        name: ${schema.spec.name}-db
      spec:
        dbInstanceIdentifier: ${schema.spec.name}-db
        dbInstanceClass: ${schema.spec.database.instanceClass}
        engine: ${schema.spec.database.engine}
        engineVersion: ${schema.spec.database.version}
        masterUsername: dbadmin
        masterUserPassword:
          name: ${dbCredentials.metadata.name}
          key: password
        allocatedStorage: ${schema.spec.database.storageSize}
        storageEncrypted: true
        multiAZ: ${schema.spec.environment == 'prod'}
    readyWhen:
      - ${database.status.dbInstanceStatus == 'available'}
      - ${database.status.endpoint.?address != null}

  - id: dbConfigMap
    template:
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: ${schema.spec.name}-db-config
      data:
        DB_HOST: ${database.status.endpoint.address}
        DB_PORT: ${string(database.status.endpoint.port)}
        DB_NAME: ${schema.spec.name}
```

## DynamoDB Resources

### Table

```yaml
apiVersion: dynamodb.services.k8s.aws/v1alpha1
kind: Table
metadata:
  name: users-table
spec:
  tableName: users
  attributeDefinitions:
    - attributeName: userId
      attributeType: S
    - attributeName: email
      attributeType: S
  keySchema:
    - attributeName: userId
      keyType: HASH
  globalSecondaryIndexes:
    - indexName: EmailIndex
      keySchema:
        - attributeName: email
          keyType: HASH
      projection:
        projectionType: ALL
  billingMode: PAY_PER_REQUEST
  pointInTimeRecoverySpecification:
    pointInTimeRecoveryEnabled: true
  sseSpecification:
    enabled: true
    sseType: KMS
  tags:
    - key: Environment
      value: Production
```

**Status Fields:**
```cel
${table.status.tableARN}
${table.status.tableStatus}
${table.status.ackResourceMetadata.arn}
```

### KRO Integration Example

```yaml
resources:
  - id: userTable
    template:
      apiVersion: dynamodb.services.k8s.aws/v1alpha1
      kind: Table
      metadata:
        name: ${schema.spec.name}-users
      spec:
        tableName: ${schema.spec.name}-users
        attributeDefinitions:
          - attributeName: userId
            attributeType: S
        keySchema:
          - attributeName: userId
            keyType: HASH
        billingMode: PAY_PER_REQUEST
    readyWhen:
      - ${userTable.status.tableStatus == 'ACTIVE'}
```

## SQS Resources

### Queue

```yaml
apiVersion: sqs.services.k8s.aws/v1alpha1
kind: Queue
metadata:
  name: order-queue
spec:
  queueName: order-queue
  delaySeconds: 0
  maximumMessageSize: 262144
  messageRetentionPeriod: 345600
  receiveMessageWaitTimeSeconds: 10
  visibilityTimeout: 30
  tags:
    Environment: Production
```

**Status Fields:**
```cel
${queue.status.queueURL}
${queue.status.queueARN}
${queue.status.ackResourceMetadata.arn}
```

### KRO Integration Example

```yaml
resources:
  - id: taskQueue
    template:
      apiVersion: sqs.services.k8s.aws/v1alpha1
      kind: Queue
      metadata:
        name: ${schema.spec.name}-tasks
      spec:
        queueName: ${schema.spec.name}-tasks
        visibilityTimeout: 60
    readyWhen:
      - ${taskQueue.status.queueURL != null}

  - id: workerDeployment
    template:
      apiVersion: apps/v1
      kind: Deployment
      spec:
        template:
          spec:
            containers:
              - name: worker
                env:
                  - name: SQS_QUEUE_URL
                    value: ${taskQueue.status.queueURL}
```

## SNS Resources

### Topic

```yaml
apiVersion: sns.services.k8s.aws/v1alpha1
kind: Topic
metadata:
  name: notifications
spec:
  name: notifications
  displayName: "Application Notifications"
  tags:
    - key: Application
      value: MyApp
```

### Subscription

```yaml
apiVersion: sns.services.k8s.aws/v1alpha1
kind: Subscription
metadata:
  name: email-subscription
spec:
  topicARN: arn:aws:sns:us-west-2:123456789012:notifications
  protocol: email
  endpoint: alerts@example.com
```

**Status Fields:**
```cel
${topic.status.topicARN}
${topic.status.ackResourceMetadata.arn}
${subscription.status.subscriptionARN}
```

## ElastiCache Resources

### CacheCluster (Redis/Memcached)

```yaml
apiVersion: elasticache.services.k8s.aws/v1alpha1
kind: CacheCluster
metadata:
  name: redis-cluster
spec:
  cacheClusterID: my-redis
  cacheNodeType: cache.t3.micro
  engine: redis
  engineVersion: "7.0"
  numCacheNodes: 1
  port: 6379
  cacheSubnetGroupName: my-cache-subnet-group
  securityGroupIDs:
    - sg-abc123
  tags:
    - key: Environment
      value: Production
```

### ReplicationGroup (Redis Cluster Mode)

```yaml
apiVersion: elasticache.services.k8s.aws/v1alpha1
kind: ReplicationGroup
metadata:
  name: redis-replication
spec:
  replicationGroupID: my-redis-cluster
  replicationGroupDescription: Redis cluster for caching
  cacheNodeType: cache.t3.medium
  engine: redis
  engineVersion: "7.0"
  numNodeGroups: 3
  replicasPerNodeGroup: 2
  automaticFailoverEnabled: true
  multiAZEnabled: true
  atRestEncryptionEnabled: true
  transitEncryptionEnabled: true
```

**Status Fields:**
```cel
${replicationGroup.status.configurationEndpoint.address}
${replicationGroup.status.configurationEndpoint.port}
${replicationGroup.status.status}
```

### KRO Integration Example

```yaml
resources:
  - id: redisCache
    template:
      apiVersion: elasticache.services.k8s.aws/v1alpha1
      kind: ReplicationGroup
      metadata:
        name: ${schema.spec.name}-cache
      spec:
        replicationGroupID: ${schema.spec.name}-cache
        replicationGroupDescription: Cache for ${schema.spec.name}
        cacheNodeType: ${schema.spec.cache.nodeType}
        engine: redis
        numNodeGroups: ${schema.spec.environment == 'prod' ? 3 : 1}
        replicasPerNodeGroup: ${schema.spec.environment == 'prod' ? 2 : 0}
        automaticFailoverEnabled: ${schema.spec.environment == 'prod'}
    readyWhen:
      - ${redisCache.status.status == 'available'}
      - ${redisCache.status.configurationEndpoint.?address != null}

  - id: cacheConfigMap
    template:
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: ${schema.spec.name}-cache-config
      data:
        REDIS_HOST: ${redisCache.status.configurationEndpoint.address}
        REDIS_PORT: ${string(redisCache.status.configurationEndpoint.port)}
```

## Lambda Resources

### Function

```yaml
apiVersion: lambda.services.k8s.aws/v1alpha1
kind: Function
metadata:
  name: my-function
spec:
  name: my-lambda-function
  runtime: python3.11
  handler: index.lambda_handler
  role: arn:aws:iam::ACCOUNT_ID:role/lambda-execution-role
  code:
    s3Bucket: my-lambda-code-bucket
    s3Key: function.zip
  environment:
    variables:
      ENV: production
      LOG_LEVEL: info
  timeout: 30
  memorySize: 256
  tags:
    ManagedBy: ACK
```

**Status Fields:**
```cel
${function.status.functionARN}
${function.status.state}
${function.status.lastModified}
```

## Common ACK Status Patterns

### ACK Resource Metadata

All ACK resources expose common metadata:

```cel
${resource.status.ackResourceMetadata.arn}
${resource.status.ackResourceMetadata.ownerAccountID}
${resource.status.ackResourceMetadata.region}
```

### Condition Checking

```cel
// Check for synced condition
${resource.status.conditions.exists(c, c.type == 'ACK.ResourceSynced' && c.status == 'True')}

// Check for terminal state (error)
${resource.status.conditions.exists(c, c.type == 'ACK.Terminal' && c.status == 'True')}
```

### Null Safety

Always use optional access for status fields:

```cel
// Safe: handles missing status
${database.status.endpoint.?address ?? 'pending'}
${queue.status.?queueURL ?? ''}

// Unsafe: may fail if status not populated
${database.status.endpoint.address}
```

## Complete KRO + ACK Example

```yaml
apiVersion: kro.run/v1alpha1
kind: ResourceGraphDefinition
metadata:
  name: full-stack-app
spec:
  schema:
    apiVersion: v1alpha1
    kind: FullStackApplication
    spec:
      name: string
      image: string
      replicas: integer | default=3
      database:
        engine: string | default="postgres"
        version: string | default="15.3"
        instanceClass: string | default="db.t3.micro"
        storageGB: integer | default=20
      cache:
        enabled: boolean | default=false
        nodeType: string | default="cache.t3.micro"
      queue:
        enabled: boolean | default=false
    status:
      ready: ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True') && database.status.dbInstanceStatus == 'available'}
      databaseEndpoint: ${database.status.endpoint.?address ?? 'pending'}
      databasePort: ${database.status.endpoint.?port ?? 5432}
      cacheEndpoint: ${redisCache.status.configurationEndpoint.?address ?? 'N/A'}
      queueURL: ${taskQueue.status.?queueURL ?? 'N/A'}

  resources:
    # Database credentials
    - id: dbCredentials
      template:
        apiVersion: v1
        kind: Secret
        metadata:
          name: ${schema.spec.name}-db-credentials
        type: Opaque
        stringData:
          username: dbadmin
          password: "${schema.spec.name}-db-${schema.metadata.uid}"

    # RDS Database
    - id: database
      template:
        apiVersion: rds.services.k8s.aws/v1alpha1
        kind: DBInstance
        metadata:
          name: ${schema.spec.name}-db
        spec:
          dbInstanceIdentifier: ${schema.spec.name}-db
          dbInstanceClass: ${schema.spec.database.instanceClass}
          engine: ${schema.spec.database.engine}
          engineVersion: ${schema.spec.database.version}
          masterUsername: dbadmin
          masterUserPassword:
            name: ${dbCredentials.metadata.name}
            key: password
          allocatedStorage: ${schema.spec.database.storageGB}
          storageEncrypted: true
      readyWhen:
        - ${database.status.dbInstanceStatus == 'available'}
        - ${database.status.endpoint.?address != null}

    # Redis Cache (conditional)
    - id: redisCache
      includeWhen:
        - ${schema.spec.cache.enabled}
      template:
        apiVersion: elasticache.services.k8s.aws/v1alpha1
        kind: CacheCluster
        metadata:
          name: ${schema.spec.name}-cache
        spec:
          cacheClusterID: ${schema.spec.name}-cache
          cacheNodeType: ${schema.spec.cache.nodeType}
          engine: redis
          numCacheNodes: 1
      readyWhen:
        - ${redisCache.status.?cacheClusterStatus == 'available'}

    # SQS Queue (conditional)
    - id: taskQueue
      includeWhen:
        - ${schema.spec.queue.enabled}
      template:
        apiVersion: sqs.services.k8s.aws/v1alpha1
        kind: Queue
        metadata:
          name: ${schema.spec.name}-tasks
        spec:
          queueName: ${schema.spec.name}-tasks
      readyWhen:
        - ${taskQueue.status.?queueURL != null}

    # Database config
    - id: dbConfig
      template:
        apiVersion: v1
        kind: ConfigMap
        metadata:
          name: ${schema.spec.name}-db-config
        data:
          DB_HOST: ${database.status.endpoint.address}
          DB_PORT: ${string(database.status.endpoint.port)}
          DB_NAME: ${schema.spec.name}
          REDIS_HOST: ${redisCache.status.?configurationEndpoint.?address ?? ''}
          SQS_QUEUE_URL: ${taskQueue.status.?queueURL ?? ''}

    # Application deployment
    - id: deployment
      template:
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: ${schema.spec.name}
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
                  envFrom:
                    - configMapRef:
                        name: ${dbConfig.metadata.name}
                    - secretRef:
                        name: ${dbCredentials.metadata.name}
      readyWhen:
        - ${deployment.status.conditions.exists(c, c.type == 'Available' && c.status == 'True')}

    # Service
    - id: service
      template:
        apiVersion: v1
        kind: Service
        metadata:
          name: ${schema.spec.name}-service
        spec:
          selector:
            app: ${schema.spec.name}
          ports:
            - port: 80
              targetPort: 8080
```
