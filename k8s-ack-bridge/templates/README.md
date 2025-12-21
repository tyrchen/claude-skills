# Bridge Operator Templates

This directory contains templates for creating new bridge operators.

## Directory Structure

```
templates/
└── bridge-operator/
    ├── Cargo.toml.template      # Rust project configuration
    └── src/
        ├── controller.rs.template  # Main controller logic
        └── crd.rs.template         # Custom Resource Definition
```

## Template Variables

Replace these placeholders when using templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{OPERATOR_NAME}}` | Operator binary name | `ack-bridge` |
| `{{RESOURCE_KIND}}` | CRD kind name | `APIGatewayDomain` |
| `{{RESOURCE_KIND_LOWER}}` | Lowercase kind | `apigateway-domain` |
| `{{GROUP}}` | API group | `bridge.ack.tubi.internal` |
| `{{VERSION}}` | API version | `v1alpha1` |
| `{{SHORT_NAME}}` | kubectl shortname | `agd` |

## Usage

### 1. Copy Templates

```bash
mkdir -p my-operator/src
cp templates/bridge-operator/Cargo.toml.template my-operator/Cargo.toml
cp templates/bridge-operator/src/*.template my-operator/src/
```

### 2. Rename Files

```bash
cd my-operator/src
mv controller.rs.template controller.rs
mv crd.rs.template crd.rs
```

### 3. Replace Variables

```bash
# macOS
find . -type f -name "*.rs" -exec sed -i '' 's/{{OPERATOR_NAME}}/my-operator/g' {} \;
find . -type f -name "*.rs" -exec sed -i '' 's/{{RESOURCE_KIND}}/MyResource/g' {} \;
find . -type f -name "*.rs" -exec sed -i '' 's/{{GROUP}}/my.company.io/g' {} \;
find . -type f -name "*.rs" -exec sed -i '' 's/{{VERSION}}/v1alpha1/g' {} \;

# Linux
find . -type f -name "*.rs" -exec sed -i 's/{{OPERATOR_NAME}}/my-operator/g' {} \;
# ... etc
```

### 4. Add AWS Client (Optional)

If your operator needs direct AWS API calls, add an AWS client module:

```rust
// src/aws/mod.rs
pub mod route53;
pub mod acm;
// etc.
```

### 5. Implement TODO Sections

Each template has `// TODO:` comments marking sections that need implementation:

- Prerequisite checks
- Primary resource creation
- Secondary resource creation
- Direct AWS operations
- Cleanup logic

### 6. Add Main Entry Point

```rust
// src/main.rs
mod controller;
mod crd;
mod aws; // if using AWS

use std::sync::Arc;
use kube::Client;

pub struct State {
    pub client: Client,
    // Add AWS clients here
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let client = Client::try_default().await?;
    let state = Arc::new(State { client });

    controller::run(state).await
}
```

## Testing

### Unit Tests

```bash
cargo test
```

### Integration Tests

```bash
# Requires cluster access
cargo test -- --ignored
```

### Clean Delete/Re-apply Test

```bash
# The gold standard idempotency test
kubectl apply -f my-resource.yaml
kubectl wait --for=condition=Ready myresource/test --timeout=300s

kubectl delete -f my-resource.yaml
kubectl wait --for=delete myresource/test --timeout=60s

kubectl apply -f my-resource.yaml
kubectl wait --for=condition=Ready myresource/test --timeout=300s
```

## Best Practices

1. **Always use UPSERT semantics** for AWS resources that may exist
2. **Use `deletion-policy: retain`** on all ACK resources
3. **Set owner references** for cascade deletion
4. **Report detailed conditions** for observability
5. **Handle terminal states** by checking AWS directly
6. **Make cleanup idempotent** - succeed whether resource exists or not
