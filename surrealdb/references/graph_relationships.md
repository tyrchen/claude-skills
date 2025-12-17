# SurrealDB Graph Relationships Reference

Comprehensive guide to modeling and querying relationships in SurrealDB.

## Relationship Models Overview

SurrealDB offers three primary ways to model relationships:

| Model | Use Case | Metadata | Bidirectional | Performance |
|-------|----------|----------|---------------|-------------|
| **Record Links** | Simple references | No | Manual | Fastest |
| **Graph Edges (RELATE)** | Complex relationships | Yes | Built-in | Fast |
| **Embedded Documents** | Denormalized data | Inline | N/A | Fastest read |

## Record Links

Direct references from one record to another using native record IDs.

### One-to-One Relationship

```sql
-- User profile relationship
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD email ON user TYPE string;

DEFINE TABLE profile SCHEMAFULL;
DEFINE FIELD user ON profile TYPE record<user>;
DEFINE FIELD bio ON profile TYPE string;
DEFINE FIELD avatar ON profile TYPE string;

-- Create linked records
CREATE user:alice SET email = 'alice@example.com';
CREATE profile:alice SET
    user = user:alice,
    bio = 'Hello world',
    avatar = 'https://example.com/alice.jpg';

-- Query with link resolution
SELECT *, user.* FROM profile:alice;

-- Reverse lookup
SELECT *, (SELECT * FROM profile WHERE user = $parent.id) AS profile FROM user:alice;
```

### One-to-Many Relationship

```sql
-- Author has many posts
DEFINE TABLE author SCHEMAFULL;
DEFINE FIELD name ON author TYPE string;

DEFINE TABLE post SCHEMAFULL;
DEFINE FIELD title ON post TYPE string;
DEFINE FIELD author ON post TYPE record<author>;

-- Create records
CREATE author:john SET name = 'John Doe';
CREATE post SET title = 'First Post', author = author:john;
CREATE post SET title = 'Second Post', author = author:john;

-- Get author with all posts
SELECT *,
    (SELECT * FROM post WHERE author = $parent.id) AS posts
FROM author:john;

-- Get post with author details
SELECT *, author.* FROM post WHERE author = author:john;
```

### Many-to-Many with Record Links

```sql
-- Students and courses
DEFINE TABLE student SCHEMAFULL;
DEFINE FIELD name ON student TYPE string;
DEFINE FIELD enrolled_courses ON student TYPE array<record<course>> DEFAULT [];

DEFINE TABLE course SCHEMAFULL;
DEFINE FIELD title ON course TYPE string;
DEFINE FIELD enrolled_students ON course TYPE array<record<student>> DEFAULT [];

-- Enroll student (update both sides for bidirectional)
UPDATE student:alice SET enrolled_courses += course:math101;
UPDATE course:math101 SET enrolled_students += student:alice;

-- Query student's courses with details
SELECT *, enrolled_courses.* FROM student:alice;

-- Query course students
SELECT *, enrolled_students.* FROM course:math101;

-- Find courses a student is NOT enrolled in
SELECT * FROM course
WHERE id NOT IN (SELECT VALUE enrolled_courses FROM student:alice);
```

### Self-Referential Links

```sql
-- Category hierarchy
DEFINE TABLE category SCHEMAFULL;
DEFINE FIELD name ON category TYPE string;
DEFINE FIELD parent ON category TYPE option<record<category>>;
DEFINE FIELD children ON category TYPE array<record<category>> DEFAULT [];

-- Create hierarchy
CREATE category:electronics SET name = 'Electronics';
CREATE category:phones SET name = 'Phones', parent = category:electronics;
CREATE category:laptops SET name = 'Laptops', parent = category:electronics;
UPDATE category:electronics SET children = [category:phones, category:laptops];

-- Get full tree (limited depth)
SELECT *, children.*, children.children.* FROM category:electronics;

-- Get ancestors
SELECT *, parent.*, parent.parent.* FROM category:phones;
```

## Graph Edges with RELATE

For complex relationships that need metadata or built-in bidirectional traversal.

### Basic RELATE Syntax

```sql
-- Create edge
RELATE <from>-><edge_type>-><to> [SET|CONTENT <data>];

-- Examples
RELATE user:alice->follows->user:bob;
RELATE user:alice->follows->user:bob SET since = time::now();
RELATE user:alice->follows->user:bob CONTENT {
    since: time::now(),
    notifications: true,
    source: 'suggestion'
};

-- Create multiple edges
RELATE user:alice->follows->(user:bob, user:carol, user:dave);

-- Create from query results
RELATE (SELECT id FROM user WHERE premium = true)->subscribes->newsletter:weekly;
```

### Edge Table Definition

```sql
-- Define edge table with schema
DEFINE TABLE follows SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON follows TYPE record<user>;   -- Source (from)
DEFINE FIELD out ON follows TYPE record<user>;  -- Target (to)
DEFINE FIELD since ON follows TYPE datetime DEFAULT time::now();
DEFINE FIELD notifications ON follows TYPE bool DEFAULT true;
DEFINE FIELD source ON follows TYPE option<string>;

-- Prevent duplicate relationships
DEFINE INDEX unique_follow ON follows FIELDS in, out UNIQUE;
```

### Graph Traversal Queries

```sql
-- Forward traversal: Who does Alice follow?
SELECT ->follows->user AS following FROM user:alice;

-- Reverse traversal: Who follows Alice?
SELECT <-follows<-user AS followers FROM user:alice;

-- Both directions
SELECT
    ->follows->user AS following,
    <-follows<-user AS followers
FROM user:alice;

-- Get edge data along with connected records
SELECT
    ->follows AS follow_edges,
    ->follows->user AS following
FROM user:alice;

-- Filter on edge properties
SELECT ->follows[WHERE notifications = true]->user AS notified_following
FROM user:alice;

-- Multi-hop traversal
SELECT ->follows->user->follows->user AS friends_of_friends
FROM user:alice;

-- Bounded depth traversal
SELECT ->follows->(1..3)->user AS network
FROM user:alice;

-- Recursive until condition
SELECT ->follows->(..)->user AS all_network
FROM user:alice;
```

### Common Graph Patterns

#### Social Network

```sql
-- Define schema
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD name ON user TYPE string;
DEFINE FIELD bio ON user TYPE option<string>;

DEFINE TABLE follows SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON follows TYPE record<user>;
DEFINE FIELD out ON follows TYPE record<user>;
DEFINE FIELD since ON follows TYPE datetime DEFAULT time::now();
DEFINE INDEX unique_follow ON follows FIELDS in, out UNIQUE;

DEFINE TABLE likes SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON likes TYPE record<user>;
DEFINE FIELD out ON likes TYPE record<post>;
DEFINE FIELD created_at ON likes TYPE datetime DEFAULT time::now();
DEFINE INDEX unique_like ON likes FIELDS in, out UNIQUE;

-- Follow user
RELATE user:alice->follows->user:bob SET since = time::now();

-- Like post
RELATE user:alice->likes->post:123 SET created_at = time::now();

-- Get feed (posts from followed users)
SELECT
    *,
    (SELECT count() FROM likes WHERE out = $parent.id) AS like_count
FROM post
WHERE author IN (SELECT VALUE ->follows->user FROM user:alice)
ORDER BY created_at DESC
LIMIT 20;

-- Mutual friends
LET $alice_following = (SELECT VALUE ->follows->user.id FROM user:alice);
LET $bob_following = (SELECT VALUE ->follows->user.id FROM user:bob);
SELECT * FROM user WHERE id IN $alice_following AND id IN $bob_following;

-- Friend suggestions (friends of friends not already following)
SELECT
    id,
    name,
    count() AS mutual_count
FROM (SELECT ->follows->user->follows->user AS suggested FROM user:alice)
WHERE suggested NOT IN (SELECT VALUE ->follows->user FROM user:alice)
    AND suggested != user:alice
GROUP BY id, name
ORDER BY mutual_count DESC
LIMIT 10;

-- Check if following
SELECT * FROM follows WHERE in = user:alice AND out = user:bob;
```

#### E-commerce: Product Recommendations

```sql
-- Define schema
DEFINE TABLE product SCHEMAFULL;
DEFINE FIELD name ON product TYPE string;
DEFINE FIELD price ON product TYPE decimal;

DEFINE TABLE purchased SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON purchased TYPE record<user>;
DEFINE FIELD out ON purchased TYPE record<product>;
DEFINE FIELD quantity ON purchased TYPE int DEFAULT 1;
DEFINE FIELD price ON purchased TYPE decimal;
DEFINE FIELD purchased_at ON purchased TYPE datetime DEFAULT time::now();

DEFINE TABLE viewed SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON viewed TYPE record<user>;
DEFINE FIELD out ON viewed TYPE record<product>;
DEFINE FIELD viewed_at ON viewed TYPE datetime DEFAULT time::now();
DEFINE FIELD duration ON viewed TYPE duration;

-- Record purchase
RELATE user:alice->purchased->product:widget SET
    quantity = 2,
    price = 29.99,
    purchased_at = time::now();

-- Record view
RELATE user:alice->viewed->product:gadget SET
    viewed_at = time::now(),
    duration = 45s;

-- "Customers who bought this also bought" (collaborative filtering)
SELECT
    product,
    count() AS frequency
FROM (
    SELECT <-purchased<-user->purchased->product AS product
    FROM product:widget
)
WHERE product != product:widget
GROUP BY product
ORDER BY frequency DESC
LIMIT 5;

-- Recently viewed products
SELECT ->viewed[ORDER BY viewed_at DESC LIMIT 10]->product.*
FROM user:alice;

-- Purchase history with details
SELECT
    out.*,
    quantity,
    price,
    purchased_at
FROM purchased
WHERE in = user:alice
ORDER BY purchased_at DESC;
```

#### Knowledge Graph

```sql
-- Entity types
DEFINE TABLE entity SCHEMAFULL;
DEFINE FIELD name ON entity TYPE string;
DEFINE FIELD type ON entity TYPE string;
DEFINE FIELD properties ON entity FLEXIBLE TYPE object DEFAULT {};

-- Relationship types (generic edge)
DEFINE TABLE relation SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON relation TYPE record<entity>;
DEFINE FIELD out ON relation TYPE record<entity>;
DEFINE FIELD type ON relation TYPE string;
DEFINE FIELD properties ON relation FLEXIBLE TYPE object DEFAULT {};
DEFINE FIELD confidence ON relation TYPE float DEFAULT 1.0;
DEFINE FIELD source ON relation TYPE option<string>;

-- Create entities
CREATE entity:apple SET
    name = 'Apple Inc.',
    type = 'company',
    properties = { founded: 1976, industry: 'technology' };

CREATE entity:tim_cook SET
    name = 'Tim Cook',
    type = 'person',
    properties = { title: 'CEO' };

-- Create relationships
RELATE entity:tim_cook->relation->entity:apple SET
    type = 'works_at',
    properties = { since: 2011, role: 'CEO' };

-- Query: Find all relationships for an entity
SELECT
    <-relation<-entity AS incoming,
    ->relation->entity AS outgoing
FROM entity:apple;

-- Query: Find path between entities
SELECT
    ->relation->(1..5)->entity AS path
FROM entity:tim_cook
WHERE path CONTAINS entity:some_other;

-- Query: Find entities of type with specific relationships
SELECT *
FROM entity
WHERE type = 'person'
    AND ->relation[WHERE type = 'works_at']->entity.type = 'company';
```

#### Organizational Hierarchy

```sql
-- Define employee with manager relationship
DEFINE TABLE employee SCHEMAFULL;
DEFINE FIELD name ON employee TYPE string;
DEFINE FIELD title ON employee TYPE string;
DEFINE FIELD department ON employee TYPE string;

DEFINE TABLE reports_to SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON reports_to TYPE record<employee>;
DEFINE FIELD out ON reports_to TYPE record<employee>;
DEFINE FIELD since ON reports_to TYPE datetime DEFAULT time::now();
DEFINE INDEX unique_report ON reports_to FIELDS in, out UNIQUE;

-- Create org structure
CREATE employee:ceo SET name = 'Jane CEO', title = 'CEO', department = 'Executive';
CREATE employee:vp_eng SET name = 'Bob VP', title = 'VP Engineering', department = 'Engineering';
CREATE employee:manager SET name = 'Carol Manager', title = 'Engineering Manager', department = 'Engineering';
CREATE employee:dev1 SET name = 'Dave Dev', title = 'Software Engineer', department = 'Engineering';

RELATE employee:vp_eng->reports_to->employee:ceo;
RELATE employee:manager->reports_to->employee:vp_eng;
RELATE employee:dev1->reports_to->employee:manager;

-- Get direct reports
SELECT <-reports_to<-employee AS direct_reports FROM employee:manager;

-- Get management chain (up to CEO)
SELECT ->reports_to->(..)->employee AS management_chain FROM employee:dev1;

-- Get all subordinates (recursive down)
SELECT <-reports_to<-(..)<-employee AS all_subordinates FROM employee:ceo;

-- Get org chart depth for each employee
DEFINE FUNCTION fn::org_depth($emp: record<employee>) {
    LET $chain = (SELECT ->reports_to->(..)->employee FROM $emp);
    RETURN array::len($chain.management_chain);
};

-- Find common manager
DEFINE FUNCTION fn::common_manager($emp1: record<employee>, $emp2: record<employee>) {
    LET $chain1 = (SELECT VALUE ->reports_to->(..)->employee.id FROM $emp1);
    LET $chain2 = (SELECT VALUE ->reports_to->(..)->employee.id FROM $emp2);

    FOR $manager IN $chain1 {
        IF $manager IN $chain2 {
            RETURN $manager;
        };
    };
    RETURN NONE;
};
```

## Advanced Graph Patterns

### Weighted Graphs

```sql
-- Network/Infrastructure graph
DEFINE TABLE node SCHEMAFULL;
DEFINE FIELD name ON node TYPE string;
DEFINE FIELD type ON node TYPE string;
DEFINE FIELD location ON node TYPE option<geometry>;

DEFINE TABLE connection SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON connection TYPE record<node>;
DEFINE FIELD out ON connection TYPE record<node>;
DEFINE FIELD bandwidth ON connection TYPE int;  -- Mbps
DEFINE FIELD latency ON connection TYPE float;  -- ms
DEFINE FIELD cost ON connection TYPE decimal;
DEFINE FIELD active ON connection TYPE bool DEFAULT true;

-- Create network
CREATE node:dc1 SET name = 'US-East DC', type = 'datacenter';
CREATE node:dc2 SET name = 'US-West DC', type = 'datacenter';
CREATE node:cdn1 SET name = 'CDN Edge 1', type = 'cdn';

RELATE node:dc1->connection->node:dc2 SET
    bandwidth = 10000,
    latency = 45.5,
    cost = 0.02;

-- Find connections under latency threshold
SELECT
    in.name AS from,
    out.name AS to,
    latency,
    bandwidth
FROM connection
WHERE latency < 50 AND active = true
ORDER BY latency;

-- Calculate path cost
SELECT
    ->connection[WHERE active = true] AS path,
    math::sum(->connection.cost) AS total_cost
FROM node:dc1;
```

### Temporal Graphs

```sql
-- Relationships with time validity
DEFINE TABLE employment SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON employment TYPE record<person>;
DEFINE FIELD out ON employment TYPE record<company>;
DEFINE FIELD title ON employment TYPE string;
DEFINE FIELD started_at ON employment TYPE datetime;
DEFINE FIELD ended_at ON employment TYPE option<datetime>;

-- Create employment history
RELATE person:alice->employment->company:acme SET
    title = 'Software Engineer',
    started_at = d'2020-01-15',
    ended_at = d'2022-06-30';

RELATE person:alice->employment->company:tech_co SET
    title = 'Senior Engineer',
    started_at = d'2022-07-01';

-- Current employer
SELECT ->employment[WHERE ended_at IS NONE]->company.*
FROM person:alice;

-- Employment at specific date
LET $date = d'2021-06-15';
SELECT ->employment[WHERE started_at <= $date AND (ended_at IS NONE OR ended_at > $date)]->company.*
FROM person:alice;

-- Full work history
SELECT
    out.* AS company,
    title,
    started_at,
    ended_at,
    IF ended_at IS NONE THEN time::now() - started_at ELSE ended_at - started_at END AS duration
FROM employment
WHERE in = person:alice
ORDER BY started_at DESC;
```

### Access Control Graph

```sql
-- Permission graph
DEFINE TABLE principal SCHEMAFULL;  -- Users, groups, roles
DEFINE FIELD name ON principal TYPE string;
DEFINE FIELD type ON principal TYPE string
    ASSERT $value IN ['user', 'group', 'role'];

DEFINE TABLE resource SCHEMAFULL;
DEFINE FIELD name ON resource TYPE string;
DEFINE FIELD type ON resource TYPE string;

DEFINE TABLE permission SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON permission TYPE record<principal>;
DEFINE FIELD out ON permission TYPE record<resource>;
DEFINE FIELD actions ON permission TYPE array<string>;
DEFINE FIELD conditions ON permission FLEXIBLE TYPE object DEFAULT {};

DEFINE TABLE member_of SCHEMAFULL TYPE RELATION;
DEFINE FIELD in ON member_of TYPE record<principal>;
DEFINE FIELD out ON member_of TYPE record<principal>;

-- Create principals
CREATE principal:alice SET name = 'Alice', type = 'user';
CREATE principal:dev_team SET name = 'Development Team', type = 'group';
CREATE principal:admin_role SET name = 'Administrator', type = 'role';

-- Create group membership
RELATE principal:alice->member_of->principal:dev_team;

-- Assign permissions
RELATE principal:dev_team->permission->resource:repo SET
    actions = ['read', 'write'];

RELATE principal:admin_role->permission->resource:repo SET
    actions = ['read', 'write', 'delete', 'admin'];

-- Check permissions (direct and inherited)
DEFINE FUNCTION fn::has_permission($user: record<principal>, $resource: record<resource>, $action: string) {
    -- Get all groups/roles user belongs to (recursive)
    LET $principals = array::distinct([
        $user,
        (SELECT VALUE ->member_of->(..)->principal FROM $user)
    ]);

    -- Check if any principal has the required permission
    LET $perms = (
        SELECT actions FROM permission
        WHERE in IN $principals AND out = $resource
    );

    RETURN array::flatten($perms.actions).any(a, a == $action OR a == 'admin');
};

-- Usage
RETURN fn::has_permission(principal:alice, resource:repo, 'write');
```

## Performance Optimization

### Graph Query Optimization

```sql
-- GOOD: Bounded traversal
SELECT ->follows->(1..3)->user FROM user:alice;

-- BAD: Unbounded (can be very expensive)
SELECT ->follows->(..)->user FROM user:alice;

-- GOOD: Filter early in traversal
SELECT ->follows[WHERE active = true]->user[WHERE status = 'active']
FROM user:alice;

-- BAD: Filter after full traversal
SELECT ->follows->user
FROM user:alice
WHERE ->follows->user.status = 'active';

-- GOOD: Limit results
SELECT ->follows->user LIMIT 100 FROM user:alice;

-- GOOD: Use indexes on edge properties
DEFINE INDEX follow_active ON follows FIELDS active;
SELECT ->follows[WHERE active = true]->user FROM user:alice;
```

### Denormalization Strategies

```sql
-- Store counts on parent for fast access
DEFINE FIELD follower_count ON user TYPE int DEFAULT 0;
DEFINE FIELD following_count ON user TYPE int DEFAULT 0;

-- Update counts via event
DEFINE EVENT on_follow ON follows WHEN $event = 'CREATE' THEN (
    UPDATE $after.in SET following_count += 1;
    UPDATE $after.out SET follower_count += 1;
);

DEFINE EVENT on_unfollow ON follows WHEN $event = 'DELETE' THEN (
    UPDATE $before.in SET following_count -= 1;
    UPDATE $before.out SET follower_count -= 1;
);

-- Now queries are instant
SELECT follower_count, following_count FROM user:alice;
```

### Batch Graph Operations

```sql
-- Batch create relationships
LET $users_to_follow = [user:bob, user:carol, user:dave];
FOR $target IN $users_to_follow {
    RELATE user:alice->follows->$target SET since = time::now();
};

-- Or using array syntax
RELATE user:alice->follows->$users_to_follow;

-- Batch delete relationships
DELETE follows WHERE in = user:alice AND out IN [user:bob, user:carol];
```
