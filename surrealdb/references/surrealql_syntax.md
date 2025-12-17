# SurrealQL Syntax Reference

Complete language reference for SurrealQL, the query language for SurrealDB.

## Statement Types

### Data Manipulation Statements

#### SELECT

```sql
-- Basic syntax
SELECT [VALUE] <fields> FROM <target>
    [WHERE <condition>]
    [SPLIT <field>]
    [GROUP [BY] <field>]
    [ORDER [BY] <field> [ASC|DESC]]
    [LIMIT <number>]
    [START <number>]
    [FETCH <field>]
    [TIMEOUT <duration>]
    [PARALLEL];

-- Select all fields
SELECT * FROM user;

-- Select specific fields
SELECT name, email FROM user;

-- Select with alias
SELECT name AS full_name, email AS contact FROM user;

-- Select VALUE (returns array instead of objects)
SELECT VALUE name FROM user;
-- Returns: ['Alice', 'Bob', 'Carol']

-- Select with computed fields
SELECT *, age * 12 AS age_months FROM user;

-- Select from multiple tables
SELECT * FROM user, post, comment;

-- Select specific records by ID
SELECT * FROM user:alice, user:bob;

-- Select ID range
SELECT * FROM user:00001..=user:01000;

-- Select with graph traversal
SELECT *, ->friends->user AS friends FROM user:alice;

-- Reverse graph traversal
SELECT *, <-follows<-user AS followers FROM user:alice;

-- Multi-hop traversal
SELECT ->follows->(1..5)->user AS network FROM user:alice;

-- Select with FETCH (resolve record links)
SELECT * FROM order FETCH customer, items.product;

-- Select with SPLIT (unnest arrays)
SELECT * FROM user SPLIT tags;

-- Select with ONLY (single record, error if multiple)
SELECT * FROM ONLY user:alice;
```

#### CREATE

```sql
-- Basic syntax
CREATE <target> [CONTENT <object> | SET <field>=<value>, ...]
    [RETURN NONE | BEFORE | AFTER | DIFF];

-- Create with generated ID
CREATE user SET name = 'Alice', email = 'alice@example.com';

-- Create with specific ID
CREATE user:alice SET name = 'Alice';

-- Create with CONTENT (full object)
CREATE user CONTENT {
    name: 'Alice',
    email: 'alice@example.com',
    profile: {
        bio: 'Hello world',
        avatar: 'https://example.com/avatar.jpg'
    }
};

-- Create multiple records
CREATE user CONTENT [
    { name: 'Alice' },
    { name: 'Bob' },
    { name: 'Carol' }
];

-- Create and return nothing (performance)
CREATE user SET name = 'Alice' RETURN NONE;

-- Create and return before state
CREATE user SET name = 'Alice' RETURN BEFORE;

-- Create and return diff
CREATE user SET name = 'Alice' RETURN DIFF;
```

#### INSERT

```sql
-- Insert single record (like CREATE but SQL-style)
INSERT INTO user (name, email) VALUES ('Alice', 'alice@example.com');

-- Insert multiple records
INSERT INTO user [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' }
];

-- Insert with ON DUPLICATE KEY UPDATE (upsert behavior)
INSERT INTO user (id, name, visits) VALUES ('user:alice', 'Alice', 1)
    ON DUPLICATE KEY UPDATE visits += 1;
```

#### UPDATE

```sql
-- Basic syntax
UPDATE <target>
    [CONTENT <object> | MERGE <object> | PATCH <array> | SET <field>=<value>, ...]
    [WHERE <condition>]
    [RETURN NONE | BEFORE | AFTER | DIFF];

-- Update with SET
UPDATE user:alice SET name = 'Alice Smith', updated_at = time::now();

-- Update with operators
UPDATE user:alice SET
    age += 1,           -- Increment
    balance -= 100,     -- Decrement
    tags += 'premium',  -- Add to array
    tags -= 'trial';    -- Remove from array

-- Update with CONTENT (replace entire record)
UPDATE user:alice CONTENT {
    name: 'Alice Smith',
    email: 'alice@example.com'
};

-- Update with MERGE (partial update, preserves existing)
UPDATE user:alice MERGE {
    profile: {
        bio: 'Updated bio'
    }
};

-- Update with PATCH (JSON Patch operations)
UPDATE user:alice PATCH [
    { op: 'replace', path: '/name', value: 'Alice Smith' },
    { op: 'add', path: '/tags/-', value: 'premium' }
];

-- Update multiple records
UPDATE user SET status = 'active' WHERE verified = true;

-- Update with subquery
UPDATE user SET post_count = (SELECT count() FROM post WHERE author = $parent.id);
```

#### UPSERT

```sql
-- Create if not exists, update if exists
UPSERT user:alice SET
    name = 'Alice',
    email = 'alice@example.com',
    last_seen = time::now(),
    visits += 1;

-- Upsert with CONTENT
UPSERT user:alice CONTENT {
    name: 'Alice',
    email: 'alice@example.com'
};

-- Upsert with WHERE (affects update behavior)
UPSERT user SET visits += 1 WHERE email = 'alice@example.com';
```

#### DELETE

```sql
-- Delete specific record
DELETE user:alice;

-- Delete with condition
DELETE user WHERE status = 'inactive';

-- Delete all records from table
DELETE user;

-- Delete and return deleted records
DELETE user WHERE status = 'inactive' RETURN BEFORE;

-- Delete only (error if not exactly one)
DELETE FROM ONLY user:alice;
```

#### RELATE

```sql
-- Create graph edge
RELATE user:alice->follows->user:bob;

-- With properties
RELATE user:alice->follows->user:bob SET
    since = time::now(),
    notifications = true;

-- With CONTENT
RELATE user:alice->follows->user:bob CONTENT {
    since: time::now(),
    source: 'suggestion'
};

-- Multiple relations
RELATE user:alice->follows->(user:bob, user:carol);

-- From query results
RELATE (SELECT id FROM user WHERE premium = true)->subscribes->newsletter:weekly;
```

### Definition Statements

#### DEFINE NAMESPACE

```sql
DEFINE NAMESPACE mycompany;
USE NS mycompany;
```

#### DEFINE DATABASE

```sql
DEFINE DATABASE production;
USE DB production;
```

#### DEFINE TABLE

```sql
-- Basic table
DEFINE TABLE user;

-- Schemafull table
DEFINE TABLE user SCHEMAFULL;

-- Schemaless table (explicit)
DEFINE TABLE event SCHEMALESS;

-- Table with type
DEFINE TABLE follows TYPE RELATION;    -- Only allows graph relations
DEFINE TABLE user TYPE NORMAL;         -- Only allows normal records
DEFINE TABLE data TYPE ANY;            -- Allows any type (default)

-- Table with permissions
DEFINE TABLE post SCHEMAFULL
    PERMISSIONS
        FOR select WHERE published = true OR author = $auth.id
        FOR create WHERE $auth.id != NONE
        FOR update, delete WHERE author = $auth.id;

-- Table with changefeed
DEFINE TABLE user CHANGEFEED 7d;

-- Drop if exists first
DEFINE TABLE user DROP;
```

#### DEFINE FIELD

```sql
-- Basic field
DEFINE FIELD name ON user TYPE string;

-- With default
DEFINE FIELD created_at ON user TYPE datetime DEFAULT time::now();

-- With VALUE (computed on every access)
DEFINE FIELD updated_at ON user TYPE datetime VALUE time::now();

-- With ASSERT (validation)
DEFINE FIELD email ON user TYPE string
    ASSERT string::is::email($value);

-- With ASSERT and custom message
DEFINE FIELD age ON user TYPE int
    ASSERT $value >= 0 AND $value <= 150
    MESSAGE "Age must be between 0 and 150";

-- Optional field
DEFINE FIELD avatar ON user TYPE option<string>;

-- Array field
DEFINE FIELD tags ON user TYPE array<string>;

-- Record reference field
DEFINE FIELD author ON post TYPE record<user>;

-- Nested object fields
DEFINE FIELD profile ON user TYPE object;
DEFINE FIELD profile.name ON user TYPE string;
DEFINE FIELD profile.bio ON user TYPE option<string>;

-- Flexible object (allows any properties)
DEFINE FIELD metadata ON user FLEXIBLE TYPE object;

-- Field on array items
DEFINE FIELD items ON order TYPE array;
DEFINE FIELD items.*.product ON order TYPE record<product>;
DEFINE FIELD items.*.quantity ON order TYPE int;

-- Read-only field (cannot be set by user)
DEFINE FIELD id ON user TYPE string READONLY;

-- Permissions on field
DEFINE FIELD salary ON employee TYPE decimal
    PERMISSIONS
        FOR select WHERE $auth.role = 'hr' OR id = $auth.id
        FOR update WHERE $auth.role = 'hr';
```

#### DEFINE INDEX

```sql
-- Basic index
DEFINE INDEX idx_email ON user FIELDS email;

-- Unique index
DEFINE INDEX idx_email ON user FIELDS email UNIQUE;

-- Composite index
DEFINE INDEX idx_user_status ON order FIELDS user, status;

-- Full-text search index
DEFINE ANALYZER english TOKENIZERS blank FILTERS lowercase, snowball(english);
DEFINE INDEX idx_content ON article FIELDS content
    SEARCH ANALYZER english BM25;

-- Vector index (for similarity search)
DEFINE INDEX idx_embedding ON document FIELDS embedding
    MTREE DIMENSION 1536 DIST COSINE;

-- Concurrent index rebuild
REBUILD INDEX idx_email ON user;
```

#### DEFINE ANALYZER

```sql
-- Basic analyzer
DEFINE ANALYZER simple TOKENIZERS blank;

-- With filters
DEFINE ANALYZER english
    TOKENIZERS blank
    FILTERS lowercase, snowball(english), ascii;

-- Available tokenizers: blank, class, camel, punct
-- Available filters: lowercase, uppercase, ascii, snowball(lang), edgengram(min,max), ngram(min,max)
```

#### DEFINE FUNCTION

```sql
-- Basic function
DEFINE FUNCTION fn::greet($name: string) {
    RETURN "Hello, " + $name + "!";
};

-- Function with multiple parameters
DEFINE FUNCTION fn::calculate_total($price: decimal, $quantity: int, $discount: decimal) {
    LET $subtotal = $price * $quantity;
    LET $discount_amount = $subtotal * $discount;
    RETURN $subtotal - $discount_amount;
};

-- Function with complex logic
DEFINE FUNCTION fn::is_premium($user_id: record<user>) {
    LET $user = (SELECT * FROM $user_id);
    IF $user.subscription = 'premium' {
        RETURN true;
    };
    IF (SELECT count() FROM order WHERE customer = $user_id) > 10 {
        RETURN true;
    };
    RETURN false;
};

-- Function that throws errors
DEFINE FUNCTION fn::validate_email($email: string) {
    IF !string::is::email($email) {
        THROW "Invalid email format: " + $email;
    };
    RETURN string::lowercase($email);
};

-- Function with permissions
DEFINE FUNCTION fn::admin_only() PERMISSIONS FULL {
    RETURN "Secret data";
};

-- Overwrite existing function
DEFINE FUNCTION fn::greet OVERWRITE ($name: string) {
    RETURN "Hi, " + $name + "!";
};
```

#### DEFINE EVENT

```sql
-- Trigger on create
DEFINE EVENT log_creation ON user WHEN $event = "CREATE" THEN (
    CREATE audit_log SET
        action = 'create',
        table = 'user',
        record = $after.id,
        timestamp = time::now()
);

-- Trigger on update
DEFINE EVENT log_update ON user WHEN $event = "UPDATE" THEN (
    CREATE audit_log SET
        action = 'update',
        table = 'user',
        record = $after.id,
        before = $before,
        after = $after,
        timestamp = time::now()
);

-- Trigger on delete
DEFINE EVENT log_deletion ON user WHEN $event = "DELETE" THEN (
    CREATE audit_log SET
        action = 'delete',
        table = 'user',
        record = $before.id,
        timestamp = time::now()
);

-- Conditional trigger
DEFINE EVENT notify_price_drop ON product
    WHEN $event = "UPDATE" AND $before.price > $after.price
    THEN (
        CREATE notification SET
            type = 'price_drop',
            product = $after.id,
            old_price = $before.price,
            new_price = $after.price
    );
```

#### DEFINE ACCESS (v2.x)

```sql
-- Record-based access (user authentication)
DEFINE ACCESS user_auth ON DATABASE TYPE RECORD
    SIGNUP (
        CREATE user SET
            email = $email,
            password = crypto::argon2::generate($password),
            created_at = time::now()
    )
    SIGNIN (
        SELECT * FROM user
        WHERE email = $email
        AND crypto::argon2::compare(password, $password)
    )
    DURATION FOR TOKEN 1h, FOR SESSION 24h;

-- JWT access
DEFINE ACCESS api_access ON DATABASE TYPE JWT
    ALGORITHM HS256
    KEY 'your-secret-key'
    DURATION FOR TOKEN 1h;

-- Bearer token access
DEFINE ACCESS service_access ON DATABASE TYPE BEARER
    DURATION FOR TOKEN 30d;
```

### Transaction Statements

```sql
-- Begin transaction
BEGIN TRANSACTION;
-- or
BEGIN;

-- Commit transaction
COMMIT TRANSACTION;
-- or
COMMIT;

-- Cancel/rollback transaction
CANCEL TRANSACTION;
-- or
CANCEL;

-- Example usage
BEGIN TRANSACTION;

LET $order = CREATE order SET
    customer = user:alice,
    total = 99.99,
    status = 'pending';

UPDATE user:alice SET balance -= 99.99;

IF (SELECT balance FROM user:alice) < 0 {
    CANCEL TRANSACTION;
};

COMMIT TRANSACTION;
```

### Control Flow

#### IF-ELSE

```sql
-- In queries
SELECT *,
    IF age >= 18 THEN 'adult' ELSE 'minor' END AS age_group
FROM user;

-- In functions
DEFINE FUNCTION fn::categorize($value: int) {
    IF $value < 0 {
        RETURN 'negative';
    } ELSE IF $value = 0 {
        RETURN 'zero';
    } ELSE {
        RETURN 'positive';
    };
};

-- Inline ternary
SELECT *, (age >= 18 ? 'adult' : 'minor') AS age_group FROM user;
```

#### FOR Loop

```sql
-- In functions
DEFINE FUNCTION fn::sum_array($arr: array<int>) {
    LET $total = 0;
    FOR $item IN $arr {
        LET $total = $total + $item;
    };
    RETURN $total;
};
```

#### LET Variables

```sql
-- Define variable
LET $threshold = 100;
LET $users = (SELECT * FROM user WHERE active = true);

-- Use in subsequent queries
SELECT * FROM order WHERE amount > $threshold AND customer IN $users.id;

-- Multiple variables
LET $start_date = time::now() - 7d;
LET $end_date = time::now();
SELECT * FROM event WHERE timestamp >= $start_date AND timestamp <= $end_date;
```

### Information Statements

```sql
-- Database info
INFO FOR DB;

-- Namespace info
INFO FOR NS;

-- Table info
INFO FOR TABLE user;

-- Root info
INFO FOR ROOT;
```

### Other Statements

#### SLEEP

```sql
-- Pause execution
SLEEP 1s;
SLEEP 500ms;
```

#### THROW

```sql
-- Raise error
THROW "Something went wrong";
THROW "Invalid input: " + $value;
```

#### RETURN

```sql
-- Return value (in functions)
RETURN 42;
RETURN $result;
RETURN NONE;
```

#### CONTINUE / BREAK

```sql
-- In loops
FOR $item IN $items {
    IF $item.skip {
        CONTINUE;
    };
    IF $item.stop {
        BREAK;
    };
    -- process item
};
```

## Operators

### Comparison Operators

```sql
=     -- Equal
!=    -- Not equal
==    -- Exact equal (type-sensitive)
?=    -- Fuzzy equal
<     -- Less than
<=    -- Less than or equal
>     -- Greater than
>=    -- Greater than or equal
```

### Logical Operators

```sql
AND   -- Logical AND
OR    -- Logical OR
NOT   -- Logical NOT
&&    -- Logical AND (alternative)
||    -- Logical OR (alternative)
!     -- Logical NOT (alternative)
```

### Arithmetic Operators

```sql
+     -- Addition
-     -- Subtraction
*     -- Multiplication
/     -- Division
%     -- Modulo
**    -- Power
```

### String Operators

```sql
+     -- Concatenation
CONTAINS      -- Contains substring
CONTAINSNOT   -- Does not contain
CONTAINSALL   -- Contains all
CONTAINSANY   -- Contains any
CONTAINSNONE  -- Contains none
~     -- Fuzzy match
!~    -- Not fuzzy match
```

### Array/Set Operators

```sql
IN           -- Value in array
NOT IN       -- Value not in array
CONTAINS     -- Array contains value
CONTAINSALL  -- Array contains all values
CONTAINSANY  -- Array contains any value
CONTAINSNONE -- Array contains no values
ALLINSIDE    -- All values inside array
ANYINSIDE    -- Any value inside array
NONEINSIDE   -- No values inside array
INSIDE       -- Value inside array
NOTINSIDE    -- Value not inside array
```

### Null Operators

```sql
??    -- Null coalescing (if left is null, return right)
?.    -- Optional chaining (safe navigation)
```

### Type Checking

```sql
IS            -- Type check
IS NOT        -- Negative type check

-- Examples
SELECT * FROM data WHERE value IS string;
SELECT * FROM data WHERE value IS NOT null;
SELECT * FROM data WHERE value IS array;
```

## Data Types Reference

### Primitive Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | UTF-8 text | `'hello'`, `"world"` |
| `int` | 64-bit integer | `42`, `-100` |
| `float` | 64-bit floating point | `3.14`, `-0.5` |
| `decimal` | Arbitrary precision decimal | `99.99dec` |
| `bool` | Boolean | `true`, `false` |
| `datetime` | ISO 8601 datetime | `d"2024-01-15T10:30:00Z"` |
| `duration` | Time duration | `1h`, `30m`, `7d` |
| `uuid` | UUID v4/v7 | `u"550e8400-e29b-41d4-a716-446655440000"` |
| `bytes` | Binary data | `<bytes>` |
| `null` | Null value | `null` |
| `none` | No value (different from null) | `NONE` |

### Complex Types

| Type | Description | Example |
|------|-------------|---------|
| `array` | Ordered list | `[1, 2, 3]` |
| `array<T>` | Typed array | `array<string>` |
| `object` | Key-value map | `{ key: 'value' }` |
| `record<T>` | Record reference | `record<user>` |
| `option<T>` | Optional type | `option<string>` |
| `geometry` | GeoJSON geometry | `{ type: 'Point', coordinates: [0, 0] }` |

### Duration Units

```sql
ns    -- Nanoseconds
us    -- Microseconds (or µs)
ms    -- Milliseconds
s     -- Seconds
m     -- Minutes
h     -- Hours
d     -- Days
w     -- Weeks
y     -- Years

-- Examples
1h30m     -- 1 hour 30 minutes
7d12h     -- 7 days 12 hours
500ms     -- 500 milliseconds
```

### Datetime Formats

```sql
-- ISO 8601
d"2024-01-15"
d"2024-01-15T10:30:00"
d"2024-01-15T10:30:00Z"
d"2024-01-15T10:30:00+05:00"

-- Using function
time::now()
time::now() - 7d
time::floor(time::now(), 1d)
```

## Function Reference

### String Functions

```sql
string::concat($a, $b, ...)     -- Concatenate strings
string::contains($s, $sub)       -- Check contains
string::endsWith($s, $suffix)    -- Check suffix
string::startsWith($s, $prefix)  -- Check prefix
string::join($arr, $sep)         -- Join array
string::len($s)                  -- String length
string::lowercase($s)            -- Lowercase
string::uppercase($s)            -- Uppercase
string::trim($s)                 -- Trim whitespace
string::trim::start($s)          -- Trim start
string::trim::end($s)            -- Trim end
string::replace($s, $old, $new)  -- Replace substring
string::reverse($s)              -- Reverse string
string::slice($s, $start, $end)  -- Extract substring
string::split($s, $sep)          -- Split to array
string::words($s)                -- Split into words
string::repeat($s, $n)           -- Repeat string

-- Validation
string::is::alphanum($s)         -- Is alphanumeric
string::is::alpha($s)            -- Is alphabetic
string::is::ascii($s)            -- Is ASCII
string::is::datetime($s, $fmt)   -- Is datetime format
string::is::domain($s)           -- Is domain
string::is::email($s)            -- Is email
string::is::hexadecimal($s)      -- Is hex
string::is::ip($s)               -- Is IP address (v4 or v6)
string::is::ipv4($s)             -- Is IPv4
string::is::ipv6($s)             -- Is IPv6
string::is::latitude($s)         -- Is latitude
string::is::longitude($s)        -- Is longitude
string::is::numeric($s)          -- Is numeric
string::is::semver($s)           -- Is semantic version
string::is::url($s)              -- Is URL
string::is::uuid($s)             -- Is UUID

-- Similarity
string::distance::hamming($a, $b)     -- Hamming distance
string::distance::levenshtein($a, $b) -- Levenshtein distance
string::similarity::fuzzy($a, $b)     -- Fuzzy similarity
string::similarity::jaro($a, $b)      -- Jaro similarity
string::similarity::smithwaterman($a, $b) -- Smith-Waterman
```

### Array Functions

```sql
array::add($arr, $val)           -- Add if not exists
array::all($arr)                 -- All truthy
array::any($arr)                 -- Any truthy
array::append($arr, $val)        -- Append to end
array::at($arr, $idx)            -- Get at index
array::boolean_and($arr)         -- Logical AND all
array::boolean_or($arr)          -- Logical OR all
array::boolean_xor($arr)         -- Logical XOR all
array::clump($arr, $size)        -- Group into chunks
array::combine($a, $b)           -- Combine arrays
array::complement($a, $b)        -- Set complement
array::concat($a, $b, ...)       -- Concatenate
array::difference($a, $b)        -- Set difference
array::distinct($arr)            -- Remove duplicates
array::filter($arr, $fn)         -- Filter by function
array::find($arr, $fn)           -- Find first match
array::find_index($arr, $fn)     -- Find index
array::first($arr)               -- First element
array::flatten($arr)             -- Flatten nested
array::group($arr)               -- Group by value
array::insert($arr, $idx, $val)  -- Insert at index
array::intersect($a, $b)         -- Set intersection
array::join($arr, $sep)          -- Join to string
array::knn($arr, $point, $k)     -- K-nearest neighbors
array::last($arr)                -- Last element
array::len($arr)                 -- Array length
array::logical_and($arr)         -- Logical AND
array::logical_or($arr)          -- Logical OR
array::logical_xor($arr)         -- Logical XOR
array::map($arr, $fn)            -- Map function
array::matches($arr, $pattern)   -- Regex matches
array::max($arr)                 -- Maximum value
array::min($arr)                 -- Minimum value
array::pop($arr)                 -- Remove last
array::prepend($arr, $val)       -- Add to start
array::push($arr, $val)          -- Add to end
array::remove($arr, $idx)        -- Remove at index
array::reverse($arr)             -- Reverse order
array::shuffle($arr)             -- Random shuffle
array::slice($arr, $start, $end) -- Extract slice
array::sort($arr)                -- Sort ascending
array::sort::asc($arr)           -- Sort ascending
array::sort::desc($arr)          -- Sort descending
array::transpose($arr)           -- Transpose 2D
array::union($a, $b)             -- Set union
array::windows($arr, $size)      -- Sliding window
```

### Math Functions

```sql
math::abs($n)                    -- Absolute value
math::acos($n)                   -- Arc cosine
math::acot($n)                   -- Arc cotangent
math::asin($n)                   -- Arc sine
math::atan($n)                   -- Arc tangent
math::bottom($arr, $k)           -- K smallest
math::ceil($n)                   -- Ceiling
math::clamp($n, $min, $max)      -- Clamp to range
math::cos($n)                    -- Cosine
math::cot($n)                    -- Cotangent
math::deg2rad($n)                -- Degrees to radians
math::e                          -- Euler's number
math::fixed($n, $precision)      -- Fixed precision
math::floor($n)                  -- Floor
math::inf                        -- Infinity
math::interquartile($arr)        -- IQR
math::lerp($a, $b, $t)           -- Linear interpolation
math::ln($n)                     -- Natural logarithm
math::log($n)                    -- Base-10 logarithm
math::log10($n)                  -- Base-10 logarithm
math::log2($n)                   -- Base-2 logarithm
math::max($a, $b)                -- Maximum
math::mean($arr)                 -- Average
math::median($arr)               -- Median
math::min($a, $b)                -- Minimum
math::midhinge($arr)             -- Midhinge
math::mode($arr)                 -- Mode
math::nearestrank($arr, $p)      -- Nearest rank
math::neg_inf                    -- Negative infinity
math::percentile($arr, $p)       -- Percentile
math::pi                         -- Pi
math::pow($base, $exp)           -- Power
math::product($arr)              -- Product of all
math::rad2deg($n)                -- Radians to degrees
math::round($n)                  -- Round
math::sign($n)                   -- Sign (-1, 0, 1)
math::sin($n)                    -- Sine
math::spread($arr)               -- Spread (max - min)
math::sqrt($n)                   -- Square root
math::stddev($arr)               -- Standard deviation
math::sum($arr)                  -- Sum of all
math::tan($n)                    -- Tangent
math::tau                        -- Tau (2*pi)
math::top($arr, $k)              -- K largest
math::trimean($arr)              -- Trimean
math::variance($arr)             -- Variance
```

### Time Functions

```sql
time::now()                      -- Current timestamp
time::day($dt)                   -- Day of month (1-31)
time::floor($dt, $duration)      -- Floor to duration
time::ceil($dt, $duration)       -- Ceiling to duration
time::format($dt, $format)       -- Format as string
time::group($dt, $duration)      -- Group by duration
time::hour($dt)                  -- Hour (0-23)
time::max($a, $b)                -- Maximum datetime
time::min($a, $b)                -- Minimum datetime
time::minute($dt)                -- Minute (0-59)
time::month($dt)                 -- Month (1-12)
time::nano($dt)                  -- Nanoseconds
time::round($dt, $duration)      -- Round to duration
time::second($dt)                -- Second (0-59)
time::timezone()                 -- Current timezone
time::unix($dt)                  -- Unix timestamp (seconds)
time::wday($dt)                  -- Weekday (1-7, Mon=1)
time::week($dt)                  -- Week of year
time::yday($dt)                  -- Day of year
time::year($dt)                  -- Year

-- Duration functions
duration::days($dur)             -- Total days
duration::hours($dur)            -- Total hours
duration::micros($dur)           -- Total microseconds
duration::millis($dur)           -- Total milliseconds
duration::mins($dur)             -- Total minutes
duration::nanos($dur)            -- Total nanoseconds
duration::secs($dur)             -- Total seconds
duration::weeks($dur)            -- Total weeks
duration::years($dur)            -- Total years

-- Duration creation
duration::from::days($n)         -- Create from days
duration::from::hours($n)        -- Create from hours
duration::from::micros($n)       -- Create from microseconds
duration::from::millis($n)       -- Create from milliseconds
duration::from::mins($n)         -- Create from minutes
duration::from::nanos($n)        -- Create from nanoseconds
duration::from::secs($n)         -- Create from seconds
duration::from::weeks($n)        -- Create from weeks
```

### Crypto Functions

```sql
-- Hashing
crypto::md5($data)               -- MD5 hash
crypto::sha1($data)              -- SHA-1 hash
crypto::sha256($data)            -- SHA-256 hash
crypto::sha512($data)            -- SHA-512 hash

-- Password hashing (recommended for passwords)
crypto::argon2::generate($password)              -- Hash password
crypto::argon2::compare($hash, $password)        -- Verify password

crypto::bcrypt::generate($password)              -- Hash with bcrypt
crypto::bcrypt::compare($hash, $password)        -- Verify bcrypt

crypto::scrypt::generate($password)              -- Hash with scrypt
crypto::scrypt::compare($hash, $password)        -- Verify scrypt

crypto::pbkdf2::generate($password)              -- Hash with PBKDF2
crypto::pbkdf2::compare($hash, $password)        -- Verify PBKDF2
```

### Type Functions

```sql
-- Type checking
type::is::array($val)            -- Is array
type::is::bool($val)             -- Is boolean
type::is::bytes($val)            -- Is bytes
type::is::collection($val)       -- Is collection
type::is::datetime($val)         -- Is datetime
type::is::decimal($val)          -- Is decimal
type::is::duration($val)         -- Is duration
type::is::float($val)            -- Is float
type::is::geometry($val)         -- Is geometry
type::is::int($val)              -- Is integer
type::is::line($val)             -- Is line
type::is::none($val)             -- Is none
type::is::null($val)             -- Is null
type::is::multiline($val)        -- Is multiline
type::is::multipoint($val)       -- Is multipoint
type::is::multipolygon($val)     -- Is multipolygon
type::is::number($val)           -- Is number
type::is::object($val)           -- Is object
type::is::point($val)            -- Is point
type::is::polygon($val)          -- Is polygon
type::is::record($val)           -- Is record
type::is::string($val)           -- Is string
type::is::uuid($val)             -- Is UUID

-- Type conversion
type::bool($val)                 -- Convert to bool
type::datetime($val)             -- Convert to datetime
type::decimal($val)              -- Convert to decimal
type::duration($val)             -- Convert to duration
type::float($val)                -- Convert to float
type::int($val)                  -- Convert to int
type::number($val)               -- Convert to number
type::point($val)                -- Convert to point
type::string($val)               -- Convert to string
type::table($val)                -- Convert to table name
type::thing($table, $id)         -- Create record ID
```

### Record Functions

```sql
record::id($record)              -- Get ID part
record::table($record)           -- Get table name
record::exists($record)          -- Check if exists
```

### Random Functions

```sql
rand()                           -- Random float 0-1
rand::bool()                     -- Random boolean
rand::enum($a, $b, ...)          -- Random from values
rand::float()                    -- Random float
rand::float($min, $max)          -- Random float in range
rand::guid()                     -- Random GUID
rand::int()                      -- Random integer
rand::int($min, $max)            -- Random int in range
rand::string()                   -- Random string
rand::string($len)               -- Random string of length
rand::string($len, $charset)     -- Random from charset
rand::time()                     -- Random datetime
rand::time($min, $max)           -- Random datetime in range
rand::ulid()                     -- Random ULID
rand::uuid()                     -- Random UUID v4
rand::uuid::v4()                 -- Random UUID v4
rand::uuid::v7()                 -- Random UUID v7
```

### Geo Functions

```sql
geo::area($geometry)             -- Area in m²
geo::bearing($p1, $p2)           -- Bearing in degrees
geo::centroid($geometry)         -- Centroid point
geo::distance($p1, $p2)          -- Distance in meters
geo::hash::decode($hash)         -- Decode geohash
geo::hash::encode($point)        -- Encode to geohash
geo::hash::encode($point, $precision)
```

### HTTP Functions

```sql
http::get($url)                  -- HTTP GET
http::get($url, $headers)        -- GET with headers
http::post($url, $body)          -- HTTP POST
http::post($url, $body, $headers)
http::put($url, $body)           -- HTTP PUT
http::put($url, $body, $headers)
http::patch($url, $body)         -- HTTP PATCH
http::patch($url, $body, $headers)
http::delete($url)               -- HTTP DELETE
http::delete($url, $headers)
http::head($url)                 -- HTTP HEAD
http::head($url, $headers)
```

### Object Functions

```sql
object::entries($obj)            -- Get [key, value] pairs
object::from_entries($arr)       -- Create from pairs
object::keys($obj)               -- Get keys
object::len($obj)                -- Number of keys
object::values($obj)             -- Get values
```

### Parse Functions

```sql
parse::email::domain($email)     -- Get domain from email
parse::email::user($email)       -- Get user from email
parse::url::domain($url)         -- Get domain from URL
parse::url::fragment($url)       -- Get fragment
parse::url::host($url)           -- Get host
parse::url::path($url)           -- Get path
parse::url::port($url)           -- Get port
parse::url::query($url)          -- Get query string
parse::url::scheme($url)         -- Get scheme
```

### Search Functions

```sql
search::analyze($analyzer, $text)  -- Analyze text
search::highlight($field, $tag1, $tag2)  -- Highlight matches
search::offsets($field)           -- Get match offsets
search::score($n)                 -- Get relevance score
```

### Session Functions

```sql
session::db()                    -- Current database
session::id()                    -- Session ID
session::ip()                    -- Client IP
session::ns()                    -- Current namespace
session::origin()                -- Request origin
session::ac()                    -- Current access method
session::rd()                    -- Current record
session::token()                 -- Session token
```

### Vector Functions

```sql
vector::add($a, $b)              -- Add vectors
vector::angle($a, $b)            -- Angle between
vector::cross($a, $b)            -- Cross product
vector::distance::chebyshev($a, $b)    -- Chebyshev distance
vector::distance::euclidean($a, $b)    -- Euclidean distance
vector::distance::hamming($a, $b)      -- Hamming distance
vector::distance::manhattan($a, $b)    -- Manhattan distance
vector::distance::minkowski($a, $b, $p) -- Minkowski distance
vector::divide($v, $scalar)      -- Divide by scalar
vector::dot($a, $b)              -- Dot product
vector::magnitude($v)            -- Vector magnitude
vector::multiply($v, $scalar)    -- Multiply by scalar
vector::normalize($v)            -- Normalize to unit
vector::project($a, $b)          -- Project a onto b
vector::similarity::cosine($a, $b)     -- Cosine similarity
vector::similarity::jaccard($a, $b)    -- Jaccard similarity
vector::similarity::pearson($a, $b)    -- Pearson correlation
vector::subtract($a, $b)         -- Subtract vectors
```
