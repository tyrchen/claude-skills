# SurrealDB Security & Authentication Reference

Comprehensive guide to authentication, authorization, and security patterns in SurrealDB.

## Authentication Overview

SurrealDB supports multiple authentication methods:

| Method | Use Case | Scope | Description |
|--------|----------|-------|-------------|
| **Root** | Admin operations | Global | Full system access |
| **Namespace** | Multi-tenant admin | Namespace | Access to all DBs in namespace |
| **Database** | DB administration | Database | Full DB access |
| **Record** | End-user auth | Database | Row-level security via DEFINE ACCESS |

## DEFINE ACCESS (v2.x)

### Record Access (User Authentication)

```sql
-- Basic user authentication
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
```

#### Complete User Auth with Validation

```sql
-- User table
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD email ON user TYPE string ASSERT string::is::email($value);
DEFINE FIELD password ON user TYPE string;
DEFINE FIELD username ON user TYPE option<string>;
DEFINE FIELD status ON user TYPE string DEFAULT 'active'
    ASSERT $value IN ['pending', 'active', 'suspended', 'deleted'];
DEFINE FIELD roles ON user TYPE array<string> DEFAULT ['user'];
DEFINE FIELD email_verified ON user TYPE bool DEFAULT false;
DEFINE FIELD last_login ON user TYPE option<datetime>;
DEFINE FIELD login_attempts ON user TYPE int DEFAULT 0;
DEFINE FIELD locked_until ON user TYPE option<datetime>;
DEFINE FIELD created_at ON user TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON user TYPE datetime VALUE time::now();

DEFINE INDEX unique_email ON user FIELDS email UNIQUE;
DEFINE INDEX unique_username ON user FIELDS username UNIQUE;

-- Access definition with validation
DEFINE ACCESS user_auth ON DATABASE TYPE RECORD
    SIGNUP (
        -- Validate input
        IF !string::is::email($email) {
            THROW "Invalid email format";
        };
        IF string::len($password) < 8 {
            THROW "Password must be at least 8 characters";
        };

        -- Check if email already exists
        IF (SELECT count() FROM user WHERE email = string::lowercase($email)) > 0 {
            THROW "Email already registered";
        };

        -- Create user
        CREATE user SET
            email = string::lowercase($email),
            password = crypto::argon2::generate($password),
            username = $username,
            status = 'pending'
    )
    SIGNIN (
        LET $user = (SELECT * FROM user WHERE email = string::lowercase($email));

        -- Check if user exists
        IF array::len($user) = 0 {
            THROW "Invalid credentials";
        };

        LET $u = $user[0];

        -- Check if account is locked
        IF $u.locked_until IS NOT NONE AND $u.locked_until > time::now() {
            THROW "Account is locked. Try again later.";
        };

        -- Check if account is active
        IF $u.status != 'active' {
            THROW "Account is not active";
        };

        -- Verify password
        IF !crypto::argon2::compare($u.password, $password) {
            -- Increment failed attempts
            UPDATE $u.id SET login_attempts += 1;

            -- Lock account after 5 failed attempts
            IF $u.login_attempts >= 4 {
                UPDATE $u.id SET locked_until = time::now() + 15m;
            };

            THROW "Invalid credentials";
        };

        -- Reset login attempts and update last login
        UPDATE $u.id SET
            login_attempts = 0,
            locked_until = NONE,
            last_login = time::now();

        RETURN $u;
    )
    DURATION FOR TOKEN 1h, FOR SESSION 24h;
```

### JWT Access (API Authentication)

```sql
-- JWT authentication for API access
DEFINE ACCESS api_jwt ON DATABASE TYPE JWT
    ALGORITHM HS256
    KEY 'your-256-bit-secret-key-here'
    DURATION FOR TOKEN 24h;

-- With RS256 (asymmetric)
DEFINE ACCESS api_jwt ON DATABASE TYPE JWT
    ALGORITHM RS256
    KEY '-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----'
    DURATION FOR TOKEN 24h;

-- JWT with issuer validation
DEFINE ACCESS api_jwt ON DATABASE TYPE JWT
    ALGORITHM HS256
    KEY 'your-secret-key'
    WITH ISSUER KEY 'your-issuer-name'
    DURATION FOR TOKEN 24h;
```

### Bearer Token Access

```sql
-- Bearer token for service-to-service auth
DEFINE ACCESS service_token ON DATABASE TYPE BEARER
    DURATION FOR TOKEN 30d;

-- Generate a bearer token (as root/admin)
-- Returns a token that can be used for authentication
```

## Table Permissions

### Basic Permissions

```sql
DEFINE TABLE post SCHEMAFULL
    PERMISSIONS
        FOR select WHERE published = true
        FOR create WHERE $auth.id IS NOT NONE
        FOR update WHERE author = $auth.id
        FOR delete WHERE author = $auth.id;
```

### Permission Syntax

```sql
-- Single operation
PERMISSIONS FOR select WHERE <condition>

-- Multiple operations, same condition
PERMISSIONS FOR select, update WHERE <condition>

-- Different conditions per operation
PERMISSIONS
    FOR select WHERE <condition1>
    FOR create WHERE <condition2>
    FOR update WHERE <condition3>
    FOR delete WHERE <condition4>

-- No access
PERMISSIONS NONE

-- Full access
PERMISSIONS FULL
```

### Permission Variables

| Variable | Description |
|----------|-------------|
| `$auth` | Current authenticated user record |
| `$auth.id` | Current user's record ID |
| `$token` | JWT token claims |
| `$session` | Session information |
| `$scope` | Access method name (v1.x) |
| `$access` | Access method name (v2.x) |

### Common Permission Patterns

#### Public Read, Authenticated Write

```sql
DEFINE TABLE article SCHEMAFULL
    PERMISSIONS
        FOR select WHERE published = true OR author = $auth.id
        FOR create WHERE $auth.id IS NOT NONE
        FOR update, delete WHERE author = $auth.id;
```

#### Owner-Only Access

```sql
DEFINE TABLE private_note SCHEMAFULL
    PERMISSIONS
        FOR select, update, delete WHERE owner = $auth.id
        FOR create WHERE $auth.id IS NOT NONE;
```

#### Role-Based Access

```sql
DEFINE TABLE admin_config SCHEMAFULL
    PERMISSIONS
        FOR select WHERE 'admin' IN $auth.roles OR 'viewer' IN $auth.roles
        FOR create, update WHERE 'admin' IN $auth.roles
        FOR delete WHERE 'superadmin' IN $auth.roles;
```

#### Team/Organization Access

```sql
DEFINE TABLE project SCHEMAFULL
    PERMISSIONS
        FOR select WHERE
            visibility = 'public' OR
            owner = $auth.id OR
            $auth.id IN team_members OR
            (SELECT * FROM organization_member
             WHERE user = $auth.id AND organization = $parent.organization)
        FOR create WHERE $auth.id IS NOT NONE
        FOR update WHERE
            owner = $auth.id OR
            'admin' IN (SELECT VALUE role FROM organization_member
                       WHERE user = $auth.id AND organization = organization)
        FOR delete WHERE owner = $auth.id;
```

#### Time-Based Access

```sql
DEFINE TABLE limited_offer SCHEMAFULL
    PERMISSIONS
        FOR select WHERE
            starts_at <= time::now() AND
            (expires_at IS NONE OR expires_at > time::now())
        FOR create, update, delete WHERE 'admin' IN $auth.roles;
```

#### Hierarchical Access

```sql
-- Parent document controls child access
DEFINE TABLE comment SCHEMAFULL
    PERMISSIONS
        FOR select WHERE
            (SELECT published FROM post WHERE id = $parent.post_id)
            OR author = $auth.id
        FOR create WHERE
            $auth.id IS NOT NONE AND
            (SELECT * FROM post WHERE id = $post_id AND
             (published = true OR author = $auth.id))
        FOR update, delete WHERE author = $auth.id;
```

## Field Permissions

```sql
-- Restrict sensitive field access
DEFINE FIELD salary ON employee TYPE decimal
    PERMISSIONS
        FOR select WHERE $auth.department = 'hr' OR id = $auth.id
        FOR update WHERE $auth.department = 'hr';

-- Hide password from all queries
DEFINE FIELD password ON user TYPE string
    PERMISSIONS
        FOR select NONE
        FOR update WHERE id = $auth.id;

-- Admin-only field
DEFINE FIELD internal_notes ON order TYPE string
    PERMISSIONS
        FOR select, update WHERE 'admin' IN $auth.roles;
```

## Multi-Tenant Security

### Namespace-Level Isolation

```sql
-- Each tenant gets their own namespace
DEFINE NAMESPACE tenant_acme;
DEFINE NAMESPACE tenant_globex;

-- Switch to tenant namespace
USE NS tenant_acme;
USE DB production;
```

### Database-Level Isolation

```sql
-- Each tenant gets their own database
USE NS shared;
DEFINE DATABASE tenant_acme;
DEFINE DATABASE tenant_globex;
```

### Row-Level Multi-Tenancy

```sql
-- All data in same tables, filtered by tenant
DEFINE TABLE resource SCHEMAFULL;
DEFINE FIELD tenant ON resource TYPE record<tenant>;
DEFINE FIELD name ON resource TYPE string;
-- ... other fields

-- Enforce tenant isolation via permissions
DEFINE TABLE resource SCHEMAFULL
    PERMISSIONS
        FOR select WHERE tenant = $auth.tenant
        FOR create WHERE tenant = $auth.tenant
        FOR update WHERE tenant = $auth.tenant
        FOR delete WHERE tenant = $auth.tenant;

-- User must have tenant claim
DEFINE ACCESS tenant_user ON DATABASE TYPE RECORD
    SIGNUP (
        CREATE user SET
            email = $email,
            password = crypto::argon2::generate($password),
            tenant = $tenant  -- Set during signup
    )
    SIGNIN (
        SELECT * FROM user
        WHERE email = $email
        AND crypto::argon2::compare(password, $password)
    )
    DURATION FOR TOKEN 1h;
```

## Password Security Best Practices

### Password Hashing

```sql
-- RECOMMENDED: Argon2 (winner of Password Hashing Competition)
crypto::argon2::generate($password)
crypto::argon2::compare($hash, $password)

-- Alternative: Bcrypt
crypto::bcrypt::generate($password)
crypto::bcrypt::compare($hash, $password)

-- Alternative: Scrypt
crypto::scrypt::generate($password)
crypto::scrypt::compare($hash, $password)

-- Alternative: PBKDF2
crypto::pbkdf2::generate($password)
crypto::pbkdf2::compare($hash, $password)
```

### Password Validation

```sql
DEFINE FUNCTION fn::validate_password($password: string) {
    IF string::len($password) < 8 {
        THROW "Password must be at least 8 characters";
    };
    IF !($password ~ /[A-Z]/) {
        THROW "Password must contain uppercase letter";
    };
    IF !($password ~ /[a-z]/) {
        THROW "Password must contain lowercase letter";
    };
    IF !($password ~ /[0-9]/) {
        THROW "Password must contain a number";
    };
    IF !($password ~ /[!@#$%^&*(),.?":{}|<>]/) {
        THROW "Password must contain a special character";
    };
    RETURN true;
};

-- Use in signup
DEFINE ACCESS secure_auth ON DATABASE TYPE RECORD
    SIGNUP (
        -- Validate password
        LET $valid = fn::validate_password($password);

        CREATE user SET
            email = $email,
            password = crypto::argon2::generate($password)
    )
    SIGNIN (
        SELECT * FROM user
        WHERE email = $email
        AND crypto::argon2::compare(password, $password)
    );
```

### Password Reset Flow

```sql
-- Password reset tokens table
DEFINE TABLE password_reset SCHEMAFULL;
DEFINE FIELD user ON password_reset TYPE record<user>;
DEFINE FIELD token ON password_reset TYPE string;
DEFINE FIELD expires_at ON password_reset TYPE datetime;
DEFINE FIELD used ON password_reset TYPE bool DEFAULT false;
DEFINE FIELD created_at ON password_reset TYPE datetime DEFAULT time::now();

DEFINE INDEX reset_token ON password_reset FIELDS token;
DEFINE INDEX reset_user ON password_reset FIELDS user;

-- Generate reset token
DEFINE FUNCTION fn::create_password_reset($email: string) {
    LET $user = (SELECT * FROM user WHERE email = $email);

    IF array::len($user) = 0 {
        -- Don't reveal if email exists
        RETURN { success: true };
    };

    -- Invalidate existing tokens
    UPDATE password_reset SET used = true WHERE user = $user[0].id AND used = false;

    -- Create new token
    LET $token = rand::string(64);
    CREATE password_reset SET
        user = $user[0].id,
        token = crypto::sha256($token),
        expires_at = time::now() + 1h;

    -- Return token (send via email in real app)
    RETURN { success: true, token: $token };
};

-- Reset password with token
DEFINE FUNCTION fn::reset_password($token: string, $new_password: string) {
    LET $reset = (SELECT * FROM password_reset
        WHERE token = crypto::sha256($token)
        AND used = false
        AND expires_at > time::now());

    IF array::len($reset) = 0 {
        THROW "Invalid or expired reset token";
    };

    -- Validate new password
    LET $valid = fn::validate_password($new_password);

    -- Update password
    UPDATE $reset[0].user SET
        password = crypto::argon2::generate($new_password);

    -- Mark token as used
    UPDATE $reset[0].id SET used = true;

    RETURN { success: true };
};
```

## Session Management

### Token Duration

```sql
-- Short-lived token, longer session
DEFINE ACCESS user_auth ON DATABASE TYPE RECORD
    -- ... SIGNUP/SIGNIN ...
    DURATION FOR TOKEN 15m, FOR SESSION 7d;

-- Refresh happens automatically within session duration
```

### Manual Session Invalidation

```sql
-- Track sessions
DEFINE TABLE session SCHEMAFULL;
DEFINE FIELD user ON session TYPE record<user>;
DEFINE FIELD token_hash ON session TYPE string;
DEFINE FIELD ip_address ON session TYPE option<string>;
DEFINE FIELD user_agent ON session TYPE option<string>;
DEFINE FIELD created_at ON session TYPE datetime DEFAULT time::now();
DEFINE FIELD last_active ON session TYPE datetime DEFAULT time::now();
DEFINE FIELD revoked ON session TYPE bool DEFAULT false;

DEFINE INDEX session_user ON session FIELDS user;
DEFINE INDEX session_token ON session FIELDS token_hash;

-- Revoke all user sessions (logout everywhere)
DEFINE FUNCTION fn::revoke_all_sessions($user_id: record<user>) {
    UPDATE session SET revoked = true WHERE user = $user_id;
    RETURN { success: true };
};

-- Revoke specific session
DEFINE FUNCTION fn::revoke_session($session_id: record<session>) {
    UPDATE $session_id SET revoked = true;
    RETURN { success: true };
};
```

## API Security Patterns

### Rate Limiting

```sql
-- Rate limit tracking
DEFINE TABLE rate_limit SCHEMAFULL;
DEFINE FIELD key ON rate_limit TYPE string;  -- IP, user ID, API key
DEFINE FIELD endpoint ON rate_limit TYPE string;
DEFINE FIELD count ON rate_limit TYPE int DEFAULT 0;
DEFINE FIELD window_start ON rate_limit TYPE datetime DEFAULT time::now();
DEFINE FIELD window_duration ON rate_limit TYPE duration DEFAULT 1m;

DEFINE INDEX rate_limit_key ON rate_limit FIELDS key, endpoint;

-- Check rate limit
DEFINE FUNCTION fn::check_rate_limit($key: string, $endpoint: string, $limit: int) {
    LET $record = (SELECT * FROM rate_limit
        WHERE key = $key AND endpoint = $endpoint);

    IF array::len($record) = 0 {
        -- First request, create record
        CREATE rate_limit SET
            key = $key,
            endpoint = $endpoint,
            count = 1;
        RETURN { allowed: true, remaining: $limit - 1 };
    };

    LET $r = $record[0];

    -- Check if window expired
    IF $r.window_start + $r.window_duration < time::now() {
        -- Reset window
        UPDATE $r.id SET
            count = 1,
            window_start = time::now();
        RETURN { allowed: true, remaining: $limit - 1 };
    };

    -- Check limit
    IF $r.count >= $limit {
        RETURN {
            allowed: false,
            remaining: 0,
            retry_after: ($r.window_start + $r.window_duration) - time::now()
        };
    };

    -- Increment counter
    UPDATE $r.id SET count += 1;
    RETURN { allowed: true, remaining: $limit - $r.count - 1 };
};
```

### API Key Authentication

```sql
-- API keys table
DEFINE TABLE api_key SCHEMAFULL;
DEFINE FIELD name ON api_key TYPE string;
DEFINE FIELD key_hash ON api_key TYPE string;  -- Store hashed
DEFINE FIELD key_prefix ON api_key TYPE string;  -- First 8 chars for lookup
DEFINE FIELD user ON api_key TYPE record<user>;
DEFINE FIELD scopes ON api_key TYPE array<string> DEFAULT ['read'];
DEFINE FIELD rate_limit ON api_key TYPE int DEFAULT 1000;
DEFINE FIELD expires_at ON api_key TYPE option<datetime>;
DEFINE FIELD last_used_at ON api_key TYPE option<datetime>;
DEFINE FIELD revoked ON api_key TYPE bool DEFAULT false;
DEFINE FIELD created_at ON api_key TYPE datetime DEFAULT time::now();

DEFINE INDEX api_key_prefix ON api_key FIELDS key_prefix;
DEFINE INDEX api_key_user ON api_key FIELDS user;

-- Generate API key
DEFINE FUNCTION fn::create_api_key($name: string, $scopes: array<string>) {
    LET $key = 'sk_' + rand::string(32);
    LET $prefix = string::slice($key, 0, 11);  -- sk_ + first 8 chars

    CREATE api_key SET
        name = $name,
        key_hash = crypto::sha256($key),
        key_prefix = $prefix,
        user = $auth.id,
        scopes = $scopes;

    -- Return key only once, user must save it
    RETURN { key: $key, prefix: $prefix };
};

-- Validate API key
DEFINE FUNCTION fn::validate_api_key($key: string) {
    LET $prefix = string::slice($key, 0, 11);

    LET $api_key = (SELECT * FROM api_key
        WHERE key_prefix = $prefix
        AND key_hash = crypto::sha256($key)
        AND revoked = false
        AND (expires_at IS NONE OR expires_at > time::now()));

    IF array::len($api_key) = 0 {
        THROW "Invalid API key";
    };

    -- Update last used
    UPDATE $api_key[0].id SET last_used_at = time::now();

    RETURN $api_key[0];
};

-- Check API key scope
DEFINE FUNCTION fn::check_scope($api_key: record<api_key>, $required_scope: string) {
    LET $key = (SELECT scopes FROM $api_key);
    IF $required_scope NOT IN $key.scopes {
        THROW "Insufficient permissions";
    };
    RETURN true;
};
```

## Audit Logging

```sql
-- Audit log table
DEFINE TABLE audit_log SCHEMAFULL;
DEFINE FIELD action ON audit_log TYPE string;
DEFINE FIELD table ON audit_log TYPE string;
DEFINE FIELD record_id ON audit_log TYPE option<string>;
DEFINE FIELD actor ON audit_log TYPE option<record<user>>;
DEFINE FIELD actor_type ON audit_log TYPE string DEFAULT 'user';
DEFINE FIELD ip_address ON audit_log TYPE option<string>;
DEFINE FIELD user_agent ON audit_log TYPE option<string>;
DEFINE FIELD changes ON audit_log FLEXIBLE TYPE object DEFAULT {};
DEFINE FIELD timestamp ON audit_log TYPE datetime DEFAULT time::now();

DEFINE INDEX audit_actor ON audit_log FIELDS actor, timestamp;
DEFINE INDEX audit_table ON audit_log FIELDS table, timestamp;
DEFINE INDEX audit_record ON audit_log FIELDS record_id, timestamp;

-- Create audit events for sensitive tables
DEFINE EVENT audit_user_changes ON user WHEN $event IN ['CREATE', 'UPDATE', 'DELETE'] THEN (
    CREATE audit_log SET
        action = $event,
        table = 'user',
        record_id = IF $event = 'DELETE' THEN string($before.id) ELSE string($after.id) END,
        actor = $auth.id,
        changes = {
            before: IF $event != 'CREATE' THEN {
                email: $before.email,
                status: $before.status,
                roles: $before.roles
            } ELSE NONE END,
            after: IF $event != 'DELETE' THEN {
                email: $after.email,
                status: $after.status,
                roles: $after.roles
            } ELSE NONE END
        }
);

-- Query audit trail
SELECT * FROM audit_log
WHERE table = 'user' AND record_id = 'user:alice'
ORDER BY timestamp DESC;

-- Query user activity
SELECT * FROM audit_log
WHERE actor = user:admin
ORDER BY timestamp DESC
LIMIT 100;
```

## Security Checklist

### Authentication
- [ ] Use Argon2 for password hashing
- [ ] Implement password complexity requirements
- [ ] Add account lockout after failed attempts
- [ ] Use short token durations with longer sessions
- [ ] Implement secure password reset flow

### Authorization
- [ ] Apply principle of least privilege
- [ ] Define explicit permissions on all tables
- [ ] Use field-level permissions for sensitive data
- [ ] Test permissions with different user roles

### Data Protection
- [ ] Encrypt sensitive data at rest
- [ ] Never log passwords or tokens
- [ ] Use HTTPS for all connections
- [ ] Implement audit logging

### API Security
- [ ] Implement rate limiting
- [ ] Validate all input data
- [ ] Use API keys with scopes
- [ ] Set appropriate CORS policies

### Multi-Tenancy
- [ ] Choose appropriate isolation level
- [ ] Enforce tenant context in all queries
- [ ] Test cross-tenant data leakage
- [ ] Implement tenant-aware audit logs
