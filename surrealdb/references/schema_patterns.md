# SurrealDB Schema Design Patterns

Production-ready schema patterns for common application architectures.

## Schema Strategy Decision Guide

### When to Use SCHEMAFULL

```sql
-- SCHEMAFULL: Strict typing and validation
DEFINE TABLE user SCHEMAFULL;
```

**Use SCHEMAFULL when:**
- Data structure is well-defined and stable
- Type safety and validation are critical
- Production workloads with strict data integrity
- Compliance requirements (HIPAA, GDPR, SOC2)
- Team collaboration where schema serves as documentation

**Benefits:**
- Compile-time type checking
- Automatic validation
- Clear data contracts
- Better query optimization

### When to Use SCHEMALESS

```sql
-- SCHEMALESS: Flexible document storage
DEFINE TABLE event SCHEMALESS;
```

**Use SCHEMALESS when:**
- Rapid prototyping and experimentation
- Highly variable data structures
- Event sourcing with varying event types
- Integration with external systems with unknown schemas
- Analytics data with evolving dimensions

**Benefits:**
- Fast iteration
- No migration overhead
- Flexible document storage
- Easy integration

### Hybrid Approach

```sql
-- Core fields enforced, metadata flexible
DEFINE TABLE product SCHEMAFULL;
DEFINE FIELD name ON product TYPE string;
DEFINE FIELD price ON product TYPE decimal;
DEFINE FIELD sku ON product TYPE string;
DEFINE FIELD metadata ON product FLEXIBLE TYPE object;  -- Flexible nested object
```

## Common Schema Patterns

### 1. User Authentication Schema

```sql
-- User table with authentication
DEFINE TABLE user SCHEMAFULL;

-- Core identity
DEFINE FIELD email ON user TYPE string
    ASSERT string::is::email($value);
DEFINE FIELD password ON user TYPE string;  -- Stored as argon2 hash
DEFINE FIELD username ON user TYPE option<string>;

-- Profile information
DEFINE FIELD profile ON user TYPE object DEFAULT {};
DEFINE FIELD profile.name ON user TYPE option<string>;
DEFINE FIELD profile.avatar ON user TYPE option<string>;
DEFINE FIELD profile.bio ON user TYPE option<string>;
DEFINE FIELD profile.location ON user TYPE option<string>;

-- Account status
DEFINE FIELD status ON user TYPE string DEFAULT 'pending'
    ASSERT $value IN ['pending', 'active', 'suspended', 'deleted'];
DEFINE FIELD verified ON user TYPE bool DEFAULT false;
DEFINE FIELD verified_at ON user TYPE option<datetime>;

-- Security
DEFINE FIELD roles ON user TYPE array<string> DEFAULT ['user'];
DEFINE FIELD mfa_enabled ON user TYPE bool DEFAULT false;
DEFINE FIELD last_login ON user TYPE option<datetime>;
DEFINE FIELD login_attempts ON user TYPE int DEFAULT 0;
DEFINE FIELD locked_until ON user TYPE option<datetime>;

-- Timestamps
DEFINE FIELD created_at ON user TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON user TYPE datetime VALUE time::now();

-- Indexes
DEFINE INDEX unique_email ON user FIELDS email UNIQUE;
DEFINE INDEX unique_username ON user FIELDS username UNIQUE;
DEFINE INDEX user_status ON user FIELDS status;

-- Access control
DEFINE ACCESS user_auth ON DATABASE TYPE RECORD
    SIGNUP (
        CREATE user SET
            email = fn::normalize_email($email),
            password = crypto::argon2::generate($password),
            status = 'pending'
    )
    SIGNIN (
        SELECT * FROM user
        WHERE email = fn::normalize_email($email)
        AND crypto::argon2::compare(password, $password)
        AND status = 'active'
        AND (locked_until IS NONE OR locked_until < time::now())
    )
    DURATION FOR TOKEN 1h, FOR SESSION 24h;

-- Helper function
DEFINE FUNCTION fn::normalize_email($email: string) {
    RETURN string::lowercase(string::trim($email));
};
```

### 2. E-commerce Schema

```sql
-- Categories with hierarchy
DEFINE TABLE category SCHEMAFULL;
DEFINE FIELD name ON category TYPE string;
DEFINE FIELD slug ON category TYPE string;
DEFINE FIELD description ON category TYPE option<string>;
DEFINE FIELD parent ON category TYPE option<record<category>>;
DEFINE FIELD image ON category TYPE option<string>;
DEFINE FIELD active ON category TYPE bool DEFAULT true;
DEFINE FIELD sort_order ON category TYPE int DEFAULT 0;

DEFINE INDEX unique_slug ON category FIELDS slug UNIQUE;
DEFINE INDEX category_parent ON category FIELDS parent;

-- Products
DEFINE TABLE product SCHEMAFULL;
DEFINE FIELD name ON product TYPE string;
DEFINE FIELD slug ON product TYPE string;
DEFINE FIELD description ON product TYPE string;
DEFINE FIELD sku ON product TYPE string;
DEFINE FIELD price ON product TYPE decimal
    ASSERT $value >= 0;
DEFINE FIELD compare_at_price ON product TYPE option<decimal>;
DEFINE FIELD cost ON product TYPE option<decimal>;
DEFINE FIELD categories ON product TYPE array<record<category>> DEFAULT [];
DEFINE FIELD tags ON product TYPE array<string> DEFAULT [];
DEFINE FIELD images ON product TYPE array<string> DEFAULT [];
DEFINE FIELD inventory ON product TYPE int DEFAULT 0
    ASSERT $value >= 0;
DEFINE FIELD weight ON product TYPE option<decimal>;
DEFINE FIELD dimensions ON product TYPE option<object>;
DEFINE FIELD dimensions.length ON product TYPE option<decimal>;
DEFINE FIELD dimensions.width ON product TYPE option<decimal>;
DEFINE FIELD dimensions.height ON product TYPE option<decimal>;
DEFINE FIELD active ON product TYPE bool DEFAULT true;
DEFINE FIELD featured ON product TYPE bool DEFAULT false;
DEFINE FIELD created_at ON product TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON product TYPE datetime VALUE time::now();

DEFINE INDEX unique_sku ON product FIELDS sku UNIQUE;
DEFINE INDEX unique_slug ON product FIELDS slug UNIQUE;
DEFINE INDEX product_active ON product FIELDS active;
DEFINE INDEX product_categories ON product FIELDS categories;

-- Full-text search
DEFINE ANALYZER product_search TOKENIZERS blank FILTERS lowercase, snowball(english);
DEFINE INDEX product_search_idx ON product FIELDS name, description
    SEARCH ANALYZER product_search BM25;

-- Product Variants
DEFINE TABLE variant SCHEMAFULL;
DEFINE FIELD product ON variant TYPE record<product>;
DEFINE FIELD name ON variant TYPE string;
DEFINE FIELD sku ON variant TYPE string;
DEFINE FIELD price ON variant TYPE option<decimal>;
DEFINE FIELD inventory ON variant TYPE int DEFAULT 0;
DEFINE FIELD options ON variant TYPE object DEFAULT {};
DEFINE FIELD images ON variant TYPE array<string> DEFAULT [];
DEFINE FIELD active ON variant TYPE bool DEFAULT true;

DEFINE INDEX unique_variant_sku ON variant FIELDS sku UNIQUE;
DEFINE INDEX variant_product ON variant FIELDS product;

-- Shopping Cart
DEFINE TABLE cart SCHEMAFULL;
DEFINE FIELD user ON cart TYPE option<record<user>>;
DEFINE FIELD session_id ON cart TYPE option<string>;
DEFINE FIELD items ON cart TYPE array DEFAULT [];
DEFINE FIELD items.*.product ON cart TYPE record<product>;
DEFINE FIELD items.*.variant ON cart TYPE option<record<variant>>;
DEFINE FIELD items.*.quantity ON cart TYPE int;
DEFINE FIELD items.*.price ON cart TYPE decimal;
DEFINE FIELD subtotal ON cart TYPE decimal DEFAULT 0;
DEFINE FIELD created_at ON cart TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON cart TYPE datetime VALUE time::now();
DEFINE FIELD expires_at ON cart TYPE datetime DEFAULT time::now() + 7d;

DEFINE INDEX cart_user ON cart FIELDS user;
DEFINE INDEX cart_session ON cart FIELDS session_id;

-- Orders
DEFINE TABLE order SCHEMAFULL;
DEFINE FIELD order_number ON order TYPE string;
DEFINE FIELD user ON order TYPE option<record<user>>;
DEFINE FIELD email ON order TYPE string;
DEFINE FIELD status ON order TYPE string DEFAULT 'pending'
    ASSERT $value IN ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
DEFINE FIELD payment_status ON order TYPE string DEFAULT 'pending'
    ASSERT $value IN ['pending', 'authorized', 'captured', 'failed', 'refunded'];
DEFINE FIELD items ON order TYPE array;
DEFINE FIELD items.*.product ON order TYPE record<product>;
DEFINE FIELD items.*.variant ON order TYPE option<record<variant>>;
DEFINE FIELD items.*.name ON order TYPE string;
DEFINE FIELD items.*.sku ON order TYPE string;
DEFINE FIELD items.*.quantity ON order TYPE int;
DEFINE FIELD items.*.price ON order TYPE decimal;
DEFINE FIELD subtotal ON order TYPE decimal;
DEFINE FIELD tax ON order TYPE decimal DEFAULT 0;
DEFINE FIELD shipping ON order TYPE decimal DEFAULT 0;
DEFINE FIELD discount ON order TYPE decimal DEFAULT 0;
DEFINE FIELD total ON order TYPE decimal;
DEFINE FIELD shipping_address ON order TYPE object;
DEFINE FIELD billing_address ON order TYPE object;
DEFINE FIELD notes ON order TYPE option<string>;
DEFINE FIELD created_at ON order TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON order TYPE datetime VALUE time::now();

DEFINE INDEX unique_order_number ON order FIELDS order_number UNIQUE;
DEFINE INDEX order_user ON order FIELDS user;
DEFINE INDEX order_status ON order FIELDS status, created_at;
DEFINE INDEX order_email ON order FIELDS email;

-- Order number generator
DEFINE FUNCTION fn::generate_order_number() {
    LET $date = time::format(time::now(), '%Y%m%d');
    LET $random = string::uppercase(rand::string(6, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'));
    RETURN $date + '-' + $random;
};
```

### 3. Content Management Schema

```sql
-- Authors/Contributors
DEFINE TABLE author SCHEMAFULL;
DEFINE FIELD user ON author TYPE record<user>;
DEFINE FIELD display_name ON author TYPE string;
DEFINE FIELD bio ON author TYPE option<string>;
DEFINE FIELD avatar ON author TYPE option<string>;
DEFINE FIELD social ON author TYPE object DEFAULT {};
DEFINE FIELD social.twitter ON author TYPE option<string>;
DEFINE FIELD social.linkedin ON author TYPE option<string>;
DEFINE FIELD social.github ON author TYPE option<string>;

DEFINE INDEX author_user ON author FIELDS user UNIQUE;

-- Posts/Articles
DEFINE TABLE post SCHEMAFULL;
DEFINE FIELD title ON post TYPE string;
DEFINE FIELD slug ON post TYPE string;
DEFINE FIELD content ON post TYPE string;
DEFINE FIELD excerpt ON post TYPE option<string>;
DEFINE FIELD featured_image ON post TYPE option<string>;
DEFINE FIELD author ON post TYPE record<author>;
DEFINE FIELD status ON post TYPE string DEFAULT 'draft'
    ASSERT $value IN ['draft', 'review', 'scheduled', 'published', 'archived'];
DEFINE FIELD visibility ON post TYPE string DEFAULT 'public'
    ASSERT $value IN ['public', 'private', 'password'];
DEFINE FIELD password ON post TYPE option<string>;
DEFINE FIELD categories ON post TYPE array<record<category>> DEFAULT [];
DEFINE FIELD tags ON post TYPE array<string> DEFAULT [];
DEFINE FIELD seo ON post TYPE object DEFAULT {};
DEFINE FIELD seo.title ON post TYPE option<string>;
DEFINE FIELD seo.description ON post TYPE option<string>;
DEFINE FIELD seo.keywords ON post TYPE array<string> DEFAULT [];
DEFINE FIELD reading_time ON post TYPE option<int>;
DEFINE FIELD view_count ON post TYPE int DEFAULT 0;
DEFINE FIELD like_count ON post TYPE int DEFAULT 0;
DEFINE FIELD comment_count ON post TYPE int DEFAULT 0;
DEFINE FIELD published_at ON post TYPE option<datetime>;
DEFINE FIELD scheduled_at ON post TYPE option<datetime>;
DEFINE FIELD created_at ON post TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON post TYPE datetime VALUE time::now();

DEFINE INDEX unique_post_slug ON post FIELDS slug UNIQUE;
DEFINE INDEX post_author ON post FIELDS author;
DEFINE INDEX post_status ON post FIELDS status, published_at;
DEFINE INDEX post_categories ON post FIELDS categories;

-- Full-text search for posts
DEFINE ANALYZER content_search TOKENIZERS blank FILTERS lowercase, snowball(english);
DEFINE INDEX post_search ON post FIELDS title, content, excerpt
    SEARCH ANALYZER content_search BM25;

-- Permissions
DEFINE TABLE post SCHEMAFULL
    PERMISSIONS
        FOR select WHERE status = 'published' OR author.user = $auth.id
        FOR create WHERE $auth.id != NONE
        FOR update WHERE author.user = $auth.id
        FOR delete WHERE author.user = $auth.id;

-- Comments
DEFINE TABLE comment SCHEMAFULL;
DEFINE FIELD post ON comment TYPE record<post>;
DEFINE FIELD parent ON comment TYPE option<record<comment>>;
DEFINE FIELD author ON comment TYPE option<record<user>>;
DEFINE FIELD author_name ON comment TYPE string;
DEFINE FIELD author_email ON comment TYPE string;
DEFINE FIELD content ON comment TYPE string;
DEFINE FIELD status ON comment TYPE string DEFAULT 'pending'
    ASSERT $value IN ['pending', 'approved', 'spam', 'deleted'];
DEFINE FIELD ip_address ON comment TYPE option<string>;
DEFINE FIELD user_agent ON comment TYPE option<string>;
DEFINE FIELD created_at ON comment TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON comment TYPE datetime VALUE time::now();

DEFINE INDEX comment_post ON comment FIELDS post, status;
DEFINE INDEX comment_parent ON comment FIELDS parent;
DEFINE INDEX comment_author ON comment FIELDS author;

-- Media Library
DEFINE TABLE media SCHEMAFULL;
DEFINE FIELD filename ON media TYPE string;
DEFINE FIELD original_filename ON media TYPE string;
DEFINE FIELD mime_type ON media TYPE string;
DEFINE FIELD size ON media TYPE int;
DEFINE FIELD url ON media TYPE string;
DEFINE FIELD thumbnail_url ON media TYPE option<string>;
DEFINE FIELD alt_text ON media TYPE option<string>;
DEFINE FIELD caption ON media TYPE option<string>;
DEFINE FIELD metadata ON media FLEXIBLE TYPE object DEFAULT {};
DEFINE FIELD uploaded_by ON media TYPE record<user>;
DEFINE FIELD created_at ON media TYPE datetime DEFAULT time::now();

DEFINE INDEX media_mime ON media FIELDS mime_type;
DEFINE INDEX media_user ON media FIELDS uploaded_by;
```

### 4. SaaS Multi-Tenant Schema

```sql
-- Organizations/Tenants
DEFINE TABLE organization SCHEMAFULL;
DEFINE FIELD name ON organization TYPE string;
DEFINE FIELD slug ON organization TYPE string;
DEFINE FIELD plan ON organization TYPE string DEFAULT 'free'
    ASSERT $value IN ['free', 'starter', 'pro', 'enterprise'];
DEFINE FIELD settings ON organization TYPE object DEFAULT {};
DEFINE FIELD settings.theme ON organization TYPE option<string>;
DEFINE FIELD settings.timezone ON organization TYPE string DEFAULT 'UTC';
DEFINE FIELD settings.locale ON organization TYPE string DEFAULT 'en';
DEFINE FIELD limits ON organization TYPE object DEFAULT {};
DEFINE FIELD limits.users ON organization TYPE int DEFAULT 5;
DEFINE FIELD limits.storage ON organization TYPE int DEFAULT 1073741824;  -- 1GB in bytes
DEFINE FIELD limits.api_calls ON organization TYPE int DEFAULT 10000;
DEFINE FIELD usage ON organization TYPE object DEFAULT {};
DEFINE FIELD usage.users ON organization TYPE int DEFAULT 0;
DEFINE FIELD usage.storage ON organization TYPE int DEFAULT 0;
DEFINE FIELD usage.api_calls ON organization TYPE int DEFAULT 0;
DEFINE FIELD billing ON organization TYPE object DEFAULT {};
DEFINE FIELD billing.customer_id ON organization TYPE option<string>;
DEFINE FIELD billing.subscription_id ON organization TYPE option<string>;
DEFINE FIELD billing.period_start ON organization TYPE option<datetime>;
DEFINE FIELD billing.period_end ON organization TYPE option<datetime>;
DEFINE FIELD active ON organization TYPE bool DEFAULT true;
DEFINE FIELD created_at ON organization TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON organization TYPE datetime VALUE time::now();

DEFINE INDEX unique_org_slug ON organization FIELDS slug UNIQUE;
DEFINE INDEX org_plan ON organization FIELDS plan;

-- Organization Members (Graph Edge)
DEFINE TABLE member SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON member TYPE record<user>;
DEFINE FIELD out ON member TYPE record<organization>;
DEFINE FIELD role ON member TYPE string DEFAULT 'member'
    ASSERT $value IN ['owner', 'admin', 'member', 'viewer'];
DEFINE FIELD permissions ON member TYPE array<string> DEFAULT [];
DEFINE FIELD invited_by ON member TYPE option<record<user>>;
DEFINE FIELD joined_at ON member TYPE datetime DEFAULT time::now();

DEFINE INDEX unique_membership ON member FIELDS in, out UNIQUE;
DEFINE INDEX member_org ON member FIELDS out;
DEFINE INDEX member_role ON member FIELDS out, role;

-- Projects (tenant-scoped)
DEFINE TABLE project SCHEMAFULL;
DEFINE FIELD organization ON project TYPE record<organization>;
DEFINE FIELD name ON project TYPE string;
DEFINE FIELD description ON project TYPE option<string>;
DEFINE FIELD status ON project TYPE string DEFAULT 'active'
    ASSERT $value IN ['active', 'archived', 'deleted'];
DEFINE FIELD visibility ON project TYPE string DEFAULT 'private'
    ASSERT $value IN ['public', 'internal', 'private'];
DEFINE FIELD settings ON project FLEXIBLE TYPE object DEFAULT {};
DEFINE FIELD created_by ON project TYPE record<user>;
DEFINE FIELD created_at ON project TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON project TYPE datetime VALUE time::now();

DEFINE INDEX project_org ON project FIELDS organization;
DEFINE INDEX project_status ON project FIELDS organization, status;

-- Row-level security based on membership
DEFINE TABLE project SCHEMAFULL
    PERMISSIONS
        FOR select WHERE
            visibility = 'public' OR
            (SELECT * FROM member WHERE in = $auth.id AND out = organization)
        FOR create, update, delete WHERE
            (SELECT * FROM member WHERE in = $auth.id AND out = organization AND role IN ['owner', 'admin']);

-- API Keys
DEFINE TABLE api_key SCHEMAFULL;
DEFINE FIELD organization ON api_key TYPE record<organization>;
DEFINE FIELD name ON api_key TYPE string;
DEFINE FIELD key_hash ON api_key TYPE string;  -- Store hashed, never plain
DEFINE FIELD key_prefix ON api_key TYPE string;  -- First 8 chars for identification
DEFINE FIELD scopes ON api_key TYPE array<string> DEFAULT ['read'];
DEFINE FIELD rate_limit ON api_key TYPE int DEFAULT 1000;
DEFINE FIELD expires_at ON api_key TYPE option<datetime>;
DEFINE FIELD last_used_at ON api_key TYPE option<datetime>;
DEFINE FIELD created_by ON api_key TYPE record<user>;
DEFINE FIELD created_at ON api_key TYPE datetime DEFAULT time::now();

DEFINE INDEX api_key_org ON api_key FIELDS organization;
DEFINE INDEX api_key_prefix ON api_key FIELDS key_prefix;
```

### 5. Analytics/Events Schema

```sql
-- Events (append-only, time-series optimized)
DEFINE TABLE event SCHEMALESS;  -- Flexible for varying event types

-- Core event fields (enforced)
DEFINE FIELD event_type ON event TYPE string;
DEFINE FIELD timestamp ON event TYPE datetime DEFAULT time::now();
DEFINE FIELD source ON event TYPE string;

-- Optional standard fields
DEFINE FIELD user_id ON event TYPE option<string>;
DEFINE FIELD session_id ON event TYPE option<string>;
DEFINE FIELD device_id ON event TYPE option<string>;

-- Context (flexible)
DEFINE FIELD context ON event FLEXIBLE TYPE object DEFAULT {};

-- Properties (event-specific, flexible)
DEFINE FIELD properties ON event FLEXIBLE TYPE object DEFAULT {};

-- Indexes for common queries
DEFINE INDEX event_type_time ON event FIELDS event_type, timestamp;
DEFINE INDEX event_user ON event FIELDS user_id, timestamp;
DEFINE INDEX event_session ON event FIELDS session_id;

-- Aggregated Metrics (pre-computed)
DEFINE TABLE metric SCHEMAFULL;
DEFINE FIELD name ON metric TYPE string;
DEFINE FIELD period ON metric TYPE string
    ASSERT $value IN ['minute', 'hour', 'day', 'week', 'month'];
DEFINE FIELD timestamp ON metric TYPE datetime;
DEFINE FIELD dimensions ON metric TYPE object DEFAULT {};
DEFINE FIELD value ON metric TYPE decimal;
DEFINE FIELD count ON metric TYPE int DEFAULT 1;

DEFINE INDEX metric_lookup ON metric FIELDS name, period, timestamp;
DEFINE INDEX metric_dimensions ON metric FIELDS name, dimensions, timestamp;

-- Sessions
DEFINE TABLE session SCHEMAFULL;
DEFINE FIELD session_id ON session TYPE string;
DEFINE FIELD user_id ON session TYPE option<string>;
DEFINE FIELD device_id ON session TYPE option<string>;
DEFINE FIELD started_at ON session TYPE datetime DEFAULT time::now();
DEFINE FIELD ended_at ON session TYPE option<datetime>;
DEFINE FIELD duration ON session TYPE option<duration>;
DEFINE FIELD page_views ON session TYPE int DEFAULT 0;
DEFINE FIELD events ON session TYPE int DEFAULT 0;
DEFINE FIELD utm ON session TYPE object DEFAULT {};
DEFINE FIELD utm.source ON session TYPE option<string>;
DEFINE FIELD utm.medium ON session TYPE option<string>;
DEFINE FIELD utm.campaign ON session TYPE option<string>;
DEFINE FIELD referrer ON session TYPE option<string>;
DEFINE FIELD landing_page ON session TYPE option<string>;
DEFINE FIELD exit_page ON session TYPE option<string>;
DEFINE FIELD device ON session TYPE object DEFAULT {};
DEFINE FIELD device.type ON session TYPE option<string>;
DEFINE FIELD device.os ON session TYPE option<string>;
DEFINE FIELD device.browser ON session TYPE option<string>;
DEFINE FIELD geo ON session TYPE object DEFAULT {};
DEFINE FIELD geo.country ON session TYPE option<string>;
DEFINE FIELD geo.region ON session TYPE option<string>;
DEFINE FIELD geo.city ON session TYPE option<string>;

DEFINE INDEX session_id_idx ON session FIELDS session_id UNIQUE;
DEFINE INDEX session_user ON session FIELDS user_id, started_at;
DEFINE INDEX session_time ON session FIELDS started_at;
```

### 6. Task/Project Management Schema

```sql
-- Workspaces
DEFINE TABLE workspace SCHEMAFULL;
DEFINE FIELD name ON workspace TYPE string;
DEFINE FIELD slug ON workspace TYPE string;
DEFINE FIELD description ON workspace TYPE option<string>;
DEFINE FIELD owner ON workspace TYPE record<user>;
DEFINE FIELD settings ON workspace TYPE object DEFAULT {};
DEFINE FIELD created_at ON workspace TYPE datetime DEFAULT time::now();

DEFINE INDEX unique_workspace_slug ON workspace FIELDS slug UNIQUE;

-- Boards
DEFINE TABLE board SCHEMAFULL;
DEFINE FIELD workspace ON board TYPE record<workspace>;
DEFINE FIELD name ON board TYPE string;
DEFINE FIELD description ON board TYPE option<string>;
DEFINE FIELD visibility ON board TYPE string DEFAULT 'private'
    ASSERT $value IN ['public', 'private'];
DEFINE FIELD columns ON board TYPE array DEFAULT [];
DEFINE FIELD columns.*.id ON board TYPE string;
DEFINE FIELD columns.*.name ON board TYPE string;
DEFINE FIELD columns.*.color ON board TYPE option<string>;
DEFINE FIELD columns.*.limit ON board TYPE option<int>;
DEFINE FIELD created_at ON board TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON board TYPE datetime VALUE time::now();

DEFINE INDEX board_workspace ON board FIELDS workspace;

-- Tasks
DEFINE TABLE task SCHEMAFULL;
DEFINE FIELD board ON task TYPE record<board>;
DEFINE FIELD column_id ON task TYPE string;
DEFINE FIELD title ON task TYPE string;
DEFINE FIELD description ON task TYPE option<string>;
DEFINE FIELD priority ON task TYPE string DEFAULT 'medium'
    ASSERT $value IN ['low', 'medium', 'high', 'urgent'];
DEFINE FIELD status ON task TYPE string DEFAULT 'open'
    ASSERT $value IN ['open', 'in_progress', 'review', 'done', 'cancelled'];
DEFINE FIELD assignees ON task TYPE array<record<user>> DEFAULT [];
DEFINE FIELD labels ON task TYPE array<string> DEFAULT [];
DEFINE FIELD due_date ON task TYPE option<datetime>;
DEFINE FIELD estimated_hours ON task TYPE option<decimal>;
DEFINE FIELD logged_hours ON task TYPE decimal DEFAULT 0;
DEFINE FIELD position ON task TYPE int DEFAULT 0;
DEFINE FIELD parent ON task TYPE option<record<task>>;
DEFINE FIELD attachments ON task TYPE array DEFAULT [];
DEFINE FIELD created_by ON task TYPE record<user>;
DEFINE FIELD created_at ON task TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON task TYPE datetime VALUE time::now();
DEFINE FIELD completed_at ON task TYPE option<datetime>;

DEFINE INDEX task_board ON task FIELDS board, column_id, position;
DEFINE INDEX task_assignee ON task FIELDS assignees;
DEFINE INDEX task_status ON task FIELDS board, status;
DEFINE INDEX task_due ON task FIELDS due_date;
DEFINE INDEX task_parent ON task FIELDS parent;

-- Task Comments
DEFINE TABLE task_comment SCHEMAFULL;
DEFINE FIELD task ON task_comment TYPE record<task>;
DEFINE FIELD author ON task_comment TYPE record<user>;
DEFINE FIELD content ON task_comment TYPE string;
DEFINE FIELD mentions ON task_comment TYPE array<record<user>> DEFAULT [];
DEFINE FIELD attachments ON task_comment TYPE array DEFAULT [];
DEFINE FIELD edited ON task_comment TYPE bool DEFAULT false;
DEFINE FIELD created_at ON task_comment TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON task_comment TYPE datetime VALUE time::now();

DEFINE INDEX comment_task ON task_comment FIELDS task, created_at;

-- Time Entries
DEFINE TABLE time_entry SCHEMAFULL;
DEFINE FIELD task ON time_entry TYPE record<task>;
DEFINE FIELD user ON time_entry TYPE record<user>;
DEFINE FIELD description ON time_entry TYPE option<string>;
DEFINE FIELD started_at ON time_entry TYPE datetime;
DEFINE FIELD ended_at ON time_entry TYPE option<datetime>;
DEFINE FIELD duration ON time_entry TYPE duration;
DEFINE FIELD billable ON time_entry TYPE bool DEFAULT true;
DEFINE FIELD created_at ON time_entry TYPE datetime DEFAULT time::now();

DEFINE INDEX time_task ON time_entry FIELDS task;
DEFINE INDEX time_user ON time_entry FIELDS user, started_at;
```

## Field Definition Patterns

### Computed Fields

```sql
-- Always computed on read
DEFINE FIELD full_name ON user TYPE string
    VALUE string::concat(first_name, ' ', last_name);

-- Computed with conditional
DEFINE FIELD display_name ON user TYPE string
    VALUE IF username != NONE THEN username ELSE email END;

-- Age from birthdate
DEFINE FIELD age ON user TYPE option<int>
    VALUE IF birthdate != NONE THEN
        duration::years(time::now() - birthdate)
    ELSE
        NONE
    END;
```

### Validation Patterns

```sql
-- Email validation
DEFINE FIELD email ON user TYPE string
    ASSERT string::is::email($value);

-- URL validation
DEFINE FIELD website ON profile TYPE option<string>
    ASSERT $value IS NONE OR string::is::url($value);

-- Range validation
DEFINE FIELD age ON user TYPE int
    ASSERT $value >= 0 AND $value <= 150
    MESSAGE "Age must be between 0 and 150";

-- Enum validation
DEFINE FIELD status ON order TYPE string
    ASSERT $value IN ['pending', 'processing', 'shipped', 'delivered'];

-- Array length validation
DEFINE FIELD tags ON post TYPE array<string>
    ASSERT array::len($value) <= 10
    MESSAGE "Maximum 10 tags allowed";

-- Regex pattern
DEFINE FIELD phone ON contact TYPE option<string>
    ASSERT $value IS NONE OR $value ~ /^\+?[1-9]\d{1,14}$/
    MESSAGE "Invalid phone number format";

-- Complex validation
DEFINE FIELD password ON user TYPE string
    ASSERT string::len($value) >= 8
        AND $value ~ /[A-Z]/
        AND $value ~ /[a-z]/
        AND $value ~ /[0-9]/
    MESSAGE "Password must be 8+ chars with uppercase, lowercase, and number";
```

### Default Values

```sql
-- Static default
DEFINE FIELD status ON user TYPE string DEFAULT 'pending';

-- Dynamic default
DEFINE FIELD created_at ON user TYPE datetime DEFAULT time::now();

-- Conditional default
DEFINE FIELD trial_ends ON subscription TYPE datetime
    DEFAULT time::now() + 14d;

-- UUID default
DEFINE FIELD api_key ON user TYPE string DEFAULT rand::uuid();

-- Object default
DEFINE FIELD settings ON user TYPE object DEFAULT {
    notifications: true,
    theme: 'light',
    language: 'en'
};
```

### Optional vs Required Fields

```sql
-- Required field (default)
DEFINE FIELD name ON user TYPE string;

-- Optional field
DEFINE FIELD bio ON user TYPE option<string>;

-- Optional with default (resolves to default if not provided)
DEFINE FIELD role ON user TYPE string DEFAULT 'user';

-- Nullable (can be explicitly set to null)
DEFINE FIELD deleted_at ON user TYPE option<datetime>;
```

## Index Strategies

### Single Field Indexes

```sql
-- Basic index
DEFINE INDEX idx_email ON user FIELDS email;

-- Unique index
DEFINE INDEX idx_email ON user FIELDS email UNIQUE;
```

### Composite Indexes

```sql
-- Multi-field index (order matters for queries)
DEFINE INDEX idx_org_status ON project FIELDS organization, status;

-- Use for queries like:
-- SELECT * FROM project WHERE organization = org:123 AND status = 'active'
-- SELECT * FROM project WHERE organization = org:123
-- NOT efficient for: SELECT * FROM project WHERE status = 'active'
```

### Full-Text Search Indexes

```sql
-- Define analyzer
DEFINE ANALYZER english_analyzer
    TOKENIZERS blank
    FILTERS lowercase, snowball(english), ascii;

-- Create search index
DEFINE INDEX content_search ON article FIELDS title, content, tags
    SEARCH ANALYZER english_analyzer BM25;

-- Search query
SELECT *, search::score(1) AS score FROM article
WHERE title @@ 'database' OR content @@ 'database'
ORDER BY score DESC;
```

### Vector/Embedding Indexes

```sql
-- For AI/ML similarity search
DEFINE INDEX embedding_idx ON document FIELDS embedding
    MTREE DIMENSION 1536 DIST COSINE;

-- Or HNSW for larger datasets
DEFINE INDEX embedding_idx ON document FIELDS embedding
    HNSW DIMENSION 1536 DIST COSINE EF_CONSTRUCTION 150 M 12;

-- Query nearest neighbors
SELECT * FROM document
WHERE embedding <|10,cosine|> $query_embedding;
```
