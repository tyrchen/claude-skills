# CEL Syntax Reference for Kubernetes

Complete reference for Common Expression Language (CEL) in Kubernetes contexts.

## Data Types

### Primitive Types

| Type | Description | Examples |
|------|-------------|----------|
| `int` | Signed 64-bit integer | `42`, `-1`, `0` |
| `uint` | Unsigned 64-bit integer | `42u`, `0u` |
| `double` | IEEE 754 64-bit float | `3.14`, `-0.5`, `1e10` |
| `bool` | Boolean | `true`, `false` |
| `string` | UTF-8 string | `"hello"`, `'world'` |
| `bytes` | Byte sequence | `b"hello"` |
| `null` | Null value | `null` |

### Complex Types

| Type | Description | Examples |
|------|-------------|----------|
| `list` | Ordered collection | `[1, 2, 3]`, `["a", "b"]` |
| `map` | Key-value pairs | `{"key": "value"}` |
| `duration` | Time duration | `duration('1h30m')` |
| `timestamp` | Point in time | `timestamp('2024-01-01T00:00:00Z')` |

### Kubernetes-Specific Types

| Type | Description | Function |
|------|-------------|----------|
| `Quantity` | Resource quantities | `quantity('2Gi')`, `quantity('500m')` |
| `URL` | Parsed URL | `url('https://example.com:8080/path')` |

## Operators

### Arithmetic Operators

```cel
// Addition
1 + 2              // 3
"hello" + " world" // "hello world" (string concatenation)
[1, 2] + [3, 4]    // [1, 2, 3, 4] (list concatenation)

// Subtraction
5 - 3              // 2

// Multiplication
4 * 3              // 12

// Division
10 / 3             // 3 (integer division)
10.0 / 3.0         // 3.333... (float division)

// Modulo
10 % 3             // 1
```

### Comparison Operators

```cel
// Equality
x == y
x != y

// Ordering
x < y
x <= y
x > y
x >= y

// Examples
"abc" < "abd"      // true (lexicographic)
[1, 2] < [1, 3]    // true (element-wise)
```

### Logical Operators

```cel
// AND (short-circuit)
x && y

// OR (short-circuit)
x || y

// NOT
!x

// Ternary conditional
condition ? trueValue : falseValue
```

### Membership Operators

```cel
// In list
"x" in ["x", "y", "z"]        // true

// In map (checks keys)
"key" in {"key": "value"}      // true

// In string (substring check) - NOT supported directly
// Use contains() instead
```

### Index and Field Access

```cel
// List index (0-based)
myList[0]
myList[size(myList) - 1]      // Last element

// Map key access
myMap["key"]
myMap.key                      // If key is valid identifier

// Nested access
object.spec.containers[0].name
object.metadata.labels["app"]
```

## Functions

### String Functions

```cel
// Length
size("hello")                  // 5

// Contains
"hello world".contains("world")  // true

// Prefix/Suffix
"hello".startsWith("he")       // true
"hello".endsWith("lo")         // true

// Regex match
"hello123".matches("^[a-z]+\\d+$")  // true

// Split
"a,b,c".split(",")             // ["a", "b", "c"]

// Case conversion
"Hello".lower()                // "hello"
"Hello".upper()                // "HELLO"

// Trim
"  hello  ".trim()             // "hello"

// Find (Kubernetes CEL extension)
"hello world".find("[aeiou]")           // "e" (first match)
"hello world".findAll("[aeiou]")        // ["e", "o", "o"]
"hello world".findAll("[aeiou]", 2)     // ["e", "o"] (limit)

// Replace (Kubernetes 1.32+)
"hello".replace("l", "L")              // "heLLo"
```

### List Functions

```cel
// Size
size([1, 2, 3])                // 3

// All elements satisfy condition
[1, 2, 3].all(x, x > 0)        // true

// Any element satisfies condition
[1, 2, 3].exists(x, x > 2)     // true

// Exactly one satisfies
[1, 2, 3].exists_one(x, x > 2) // true (only 3)

// Filter elements
[1, 2, 3, 4].filter(x, x > 2)  // [3, 4]

// Transform elements
[1, 2, 3].map(x, x * 2)        // [2, 4, 6]

// Index functions (Kubernetes extension)
[1, 2, 3, 2].indexOf(2)        // 1
[1, 2, 3, 2].lastIndexOf(2)    // 3

// Aggregate functions (Kubernetes extension)
[1, 2, 3].min()                // 1
[1, 2, 3].max()                // 3
[1, 2, 3].sum()                // 6

// Sorting check
[1, 2, 3].isSorted()           // true
```

### Map Functions

```cel
// Size (number of keys)
size({"a": 1, "b": 2})         // 2

// All keys satisfy condition
{"a": 1, "b": 2}.all(k, k.size() == 1)  // true

// Any key satisfies condition
{"a": 1, "b": 2}.exists(k, k == "a")    // true
```

### Type Functions

```cel
// Type checking
type(42)                       // int
type("hello")                  // string
type([1, 2])                   // list

// Type conversion
int("42")                      // 42
uint(42)                       // 42u
double(42)                     // 42.0
string(42)                     // "42"
bool(1)                        // true (non-zero)

// Duration conversion
duration("1h")                 // 1 hour duration
duration("30m")                // 30 minute duration
duration("1h30m")              // 1.5 hour duration
duration("90s")                // 90 second duration
```

### Field Existence

```cel
// Check if field exists (CRITICAL for optional fields)
has(object.spec.field)

// Safe field access pattern
has(object.spec.field) && object.spec.field == "value"

// Nested field check
has(object.spec.template.spec.securityContext) &&
has(object.spec.template.spec.securityContext.runAsNonRoot)
```

### Kubernetes Quantity Functions

```cel
// Parse Kubernetes quantities
quantity("2Gi")                // 2 GiB
quantity("500m")               // 500 millicores (0.5 CPU)
quantity("1.5")                // 1.5 (cores, generic)

// Quantity comparisons
quantity("2Gi") > quantity("1Gi")   // true
quantity("500m") < quantity("1")     // true (0.5 < 1.0 CPU)

// Validate quantity format
isQuantity("2Gi")              // true
isQuantity("invalid")          // false

// Quantity arithmetic (Kubernetes 1.31+)
quantity("1Gi") + quantity("500Mi")  // ~1.5Gi
```

### URL Functions

```cel
// Parse URL
url("https://example.com:8080/path?query=1")

// URL components
url("https://example.com:8080/path").getScheme()    // "https"
url("https://example.com:8080/path").getHost()      // "example.com"
url("https://example.com:8080/path").getHostname()  // "example.com"
url("https://example.com:8080/path").getPort()      // "8080"
url("https://example.com:8080/path").getPath()      // "/path"
url("https://example.com:8080/path").getQuery()     // {"query": ["1"]}

// Validate URL
isURL("https://example.com")   // true
isURL("not a url")             // false
```

### Authorization Functions (Kubernetes 1.31+)

```cel
// Check user permissions
authorizer.group("apps")
  .resource("deployments")
  .namespace(object.metadata.namespace)
  .check("create")
  .allowed()

// Check service account permissions
authorizer.serviceAccount("default", "my-sa")
  .resource("secrets")
  .check("get")
  .allowed()

// With specific name
authorizer.group("")
  .resource("configmaps")
  .namespace("kube-system")
  .name("my-config")
  .check("update")
  .allowed()
```

## Context Variables

### ValidatingAdmissionPolicy

| Variable | Type | Description |
|----------|------|-------------|
| `object` | Object | Incoming resource being validated |
| `oldObject` | Object | Existing resource (UPDATE only) |
| `request` | AdmissionRequest | Request metadata |
| `params` | Object | Parameters from binding |
| `namespaceObject` | Namespace | Namespace resource |
| `authorizer` | Authorizer | Permission checker (1.31+) |

### Request Object Fields

```cel
request.kind.group             // API group
request.kind.version           // API version
request.kind.kind              // Resource kind
request.resource.group         // Resource API group
request.resource.version       // Resource version
request.resource.resource      // Resource name
request.subResource            // Subresource (if any)
request.requestKind            // Original request kind
request.requestResource        // Original request resource
request.name                   // Object name
request.namespace              // Object namespace
request.operation              // CREATE, UPDATE, DELETE, CONNECT
request.userInfo.username      // Requesting user
request.userInfo.uid           // User UID
request.userInfo.groups        // User groups
request.dryRun                 // Is dry-run request
request.options                // Request options
```

### CRD Validation (x-kubernetes-validations)

| Variable | Type | Description |
|----------|------|-------------|
| `self` | varies | Current field value |
| `oldSelf` | varies | Previous field value (UPDATE) |

## Expression Patterns

### Safe Optional Field Access

```cel
// Pattern: Check existence before access
has(object.spec.field) && object.spec.field == "value"

// Pattern: Deeply nested optional fields
has(object.spec.template) &&
has(object.spec.template.spec) &&
has(object.spec.template.spec.securityContext) &&
object.spec.template.spec.securityContext.runAsNonRoot == true

// Pattern: Optional with default
has(object.spec.replicas) ? object.spec.replicas : 1
```

### Collection Iteration

```cel
// All elements must satisfy
object.spec.containers.all(c, has(c.resources.limits))

// At least one element satisfies
object.spec.containers.exists(c, c.image.contains("nginx"))

// Filter and check
object.spec.containers.filter(c, c.name == "main").size() == 1

// Transform and aggregate
object.spec.containers.map(c, c.name).size()
```

### String Validation

```cel
// Naming convention
object.metadata.name.matches("^[a-z][a-z0-9-]*[a-z0-9]$")

// Email format
object.metadata.annotations["owner"].matches(
  "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
)

// Length limits
object.metadata.name.size() <= 63

// Prefix/suffix validation
object.metadata.name.startsWith("prod-") ||
object.metadata.name.startsWith("staging-")
```

### Numeric Validation

```cel
// Range check
object.spec.replicas >= 1 && object.spec.replicas <= 100

// Resource quantities
quantity(object.spec.resources.limits.memory) <= quantity("4Gi")

// Percentage (as integer 0-100)
object.spec.percentage >= 0 && object.spec.percentage <= 100
```

### Update Validation

```cel
// Immutable field (CRD validation)
oldSelf == self

// Only allow increase
self >= oldSelf

// Prevent certain changes
!(has(oldSelf.critical) && oldSelf.critical != self.critical)
```

## Error Handling

### Common Runtime Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `no such key` | Map key doesn't exist | Use `'key' in map && map['key']` |
| `no such field` | Object field doesn't exist | Use `has(object.field)` |
| `type error` | Type mismatch | Check types, use conversion |
| `index out of range` | List index invalid | Check `size()` first |
| `division by zero` | Zero divisor | Check divisor != 0 |

### Safe Access Patterns

```cel
// Safe map access
has(object.metadata.labels) &&
'app' in object.metadata.labels &&
object.metadata.labels['app'] == "myapp"

// Safe list access
size(object.spec.containers) > 0 &&
object.spec.containers[0].name == "main"

// Safe nested access
has(object.spec) &&
has(object.spec.template) &&
has(object.spec.template.spec) &&
object.spec.template.spec.containers.all(c, ...)
```

## Cost Estimation

CEL expressions have cost limits to prevent API server overload.

### Cost Factors

| Operation | Relative Cost |
|-----------|--------------|
| Constant | 1 |
| Variable access | 1 |
| Field access | 1 |
| List/map element | 1 |
| Arithmetic | 1 |
| Comparison | 1 |
| String comparison | length |
| Regex match | 10 * length |
| List iteration | size |
| Nested iteration | O(n^2) |

### Reducing Cost

```cel
// Set schema bounds
// In OpenAPI schema:
// maxItems: 100
// maxProperties: 50
// maxLength: 256

// Avoid nested iterations
// BAD: O(n^2)
list1.all(x, list2.all(y, ...))

// GOOD: O(n)
list1.all(x, ...) && list2.all(y, ...)

// Short-circuit expensive operations
has(field) && field.matches(regex)  // Regex only if field exists
```
