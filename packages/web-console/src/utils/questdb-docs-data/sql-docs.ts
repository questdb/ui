// Auto-generated documentation data for sql
// Generated on 2025-09-11T17:23:20.117Z

export interface DocFile {
  path: string
  title: string
  headers: string[]
  content: string
}

export const sqlDocs: DocFile[] = [
  {
    path: 'sql/acl/add-user.md',
    title: 'ADD USER reference',
    headers: ['Syntax', 'Description'],
    content: `To add user to one or more groups in the database, the \`ADD USER\` keywords are
used.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the ADD USER keyword](/images/docs/diagrams/addUser.svg)

## Description

\`ADD USER\` adds a user to one or more groups.

## Examples

\`\`\`questdb-sql
ADD USER john to management, audit;
\`\`\`

It can be verified with:

\`\`\`questdb-sql
SHOW GROUPS john;
\`\`\`

that yields:

| name       |
| ---------- |
| management |
| audit      |
`
  },
  {
    path: 'sql/acl/alter-service-account.md',
    title: 'ALTER SERVICE ACCOUNT reference',
    headers: ['Syntax', 'Description'],
    content: `\`ALTER SERVICE ACCOUNT\` modifies service account settings.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the ALTER SERVICE ACCOUNT keyword](/images/docs/diagrams/alterServiceAccount.svg)

## Description

- \`ALTER SERVICE ACCOUNT serviceAccountName ENABLE\` - enables service account.
- \`ALTER SERVICE ACCOUNT serviceAccountName DISABLE\` - disables service account.
- \`ALTER SERVICE ACCOUNT serviceAccountName WITH PASSWORD password\` - sets
  password for the service account.
- \`ALTER SERVICE ACCOUNT serviceAccountName WITH NO PASSWORD\` - removes password
  for the service account.
- \`ALTER SERVICE ACCOUNT serviceAccountName CREATE TOKEN TYPE JWK\` - adds Json
  Web Key to the service account. Returns public key (x, y) and private key. The
  private key is not stored in QuestDB.
- \`ALTER SERVICE ACCOUNT serviceAccountName DROP TOKEN TYPE JWK\` - removes Json
  Web Key from the service account.
- \`ALTER USER serviceAccountName CREATE TOKEN TYPE REST WITH TTL timeUnit REFRESH\` -
  adds REST token to the service account.
- \`ALTER USER serviceAccountName DROP TOKEN TYPE REST token\` - removes REST
  token from the service account.

## Examples

### Enable service account

\`\`\`questdb-sql
ALTER SERVICE ACCOUNT client_app ENABLE;
\`\`\`

### Disable service account

\`\`\`questdb-sql
ALTER SERVICE ACCOUNT client_app DISABLE;
\`\`\`

### Set password

\`\`\`questdb-sql
ALTER SERVICE ACCOUNT client_app WITH PASSWORD '1m@re@lh@cker';
\`\`\`

### Remove password

\`\`\`questdb-sql
ALTER SERVICE ACCOUNT client_app WITH NO PASSWORD;
\`\`\`

Removing a password is not possible using \`WITH PASSWORD ''\` as the database
will reject empty passwords.

### Add Json Web Key

\`\`\`questdb-sql
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE JWK;
\`\`\`

### Remove Json Web Key

\`\`\`questdb-sql
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE JWK;
\`\`\`

Result of commands above can be verified with \`SHOW USER\`, e.g.

\`\`\`questdb-sql
SHOW SERVICE ACCOUNT client_app;
\`\`\`

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | true    |
| REST Token | false   |

### Add REST API token

\`\`\`questdb-sql
-- generate a token with no TTL refresh
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE REST WITH TTL '1m';
-- generate a token with TTL refresh
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE REST WITH TTL '1m' REFRESH;
\`\`\`

Here, the TTL (Time-to-Live) value should contain an integer and a unit, such as
\`1m\`. The supported units are:

- \`s\` - second
- \`m\` - minute
- \`h\` - hour
- \`d\` - day

The minimum allowable TTL value is 1 minute and the maximum value is 10 years
(10 \\* 365 days).

The \`REFRESH\` modifier is optional. When the \`REFRESH\` modifier is specified,
the token's expiration timestamp will be refreshed on each successful
authentication.

#### Rest API tokens and database replication

Many [QuestDB Enterprise](/enterprise/) instances run within active
[database replication](/docs/operations/replication/) clusters. With replication
enabled, the REST API token will be refreshed on successful authentication to
the **primary** node. The token will **not** be refreshed during successful
authentications to **replica** nodes.

Therefore, tokens with the \`REFRESH\` modifier are for use only on the
**primary** node.

### Remove REST API token

\`\`\`questdb-sql
-- drop single REST API token
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE REST 'qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44';
-- drop all REST API tokens for the given service account
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE REST;
\`\`\`

The result of the above commands can be verified with \`SHOW SERVICE ACCOUNT\`:

\`\`\`questdb-sql
SHOW SERVICE ACCOUNT client_app;
\`\`\`

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |
`
  },
  {
    path: 'sql/acl/alter-user.md',
    title: 'ALTER USER reference',
    headers: ['Syntax', 'Description'],
    content: `For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

\`ALTER USER\` modifies user settings.

## Syntax

![Flow chart showing the syntax of the ALTER USER keyword](/images/docs/diagrams/alterUser.svg)

## Description

- \`ALTER USER username ENABLE\` - enables user account.
- \`ALTER USER username DISABLE\` - disables user account.
- \`ALTER USER username WITH PASSWORD password\` - sets password for the user
  account.
- \`ALTER USER username WITH NO PASSWORD\` - removes password for the user
  account.
- \`ALTER USER username CREATE TOKEN TYPE JWK\` - adds Json Web Key to user
  account. Returns public key (x, y) and private key. The private key is not
  stored in QuestDB.
- \`ALTER USER username DROP TOKEN TYPE JWK\` - removes Json Web Key from user
  account.
- \`ALTER USER username CREATE TOKEN TYPE REST WITH TTL timeUnit REFRESH\` - adds
  REST token to user account.
- \`ALTER USER username DROP TOKEN TYPE REST token\` - removes REST token from
  user account.

## Examples

### Enable user

\`\`\`questdb-sql
ALTER USER john ENABLE;
\`\`\`

### Disable user

\`\`\`questdb-sql
ALTER USER john DISABLE;
\`\`\`

### Set password

\`\`\`questdb-sql
ALTER USER john WITH PASSWORD '1m@re@lh@cker';
\`\`\`

### Remove password

\`\`\`questdb-sql
ALTER USER john WITH NO PASSWORD;
\`\`\`

Removing user's password is not possible with \`WITH PASSWORD ''\` because it
rejects empty passwords.

### Add Json Web Key

\`\`\`questdb-sql
ALTER USER john CREATE TOKEN TYPE JWK;
\`\`\`

### Remove Json Web Key

\`\`\`questdb-sql
ALTER USER john DROP TOKEN TYPE JWK;
\`\`\`

Result of commands above can be verified with \`SHOW USER\`, e.g.

\`\`\`questdb-sql
SHOW USER john;
\`\`\`

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |

### Add REST API token

\`\`\`questdb-sql
-- generate a token with no TTL refresh
ALTER USER john CREATE TOKEN TYPE REST WITH TTL '1m';
-- generate a token with TTL refresh
ALTER USER john CREATE TOKEN TYPE REST WITH TTL '1m' REFRESH;
\`\`\`

Here, the TTL (Time-to-Live) value should contain an integer and a unit, e.g.
\`1m\`. The supported units are:

- \`s\` - second
- \`m\` - minute
- \`h\` - hour
- \`d\` - day

The minimal allowed TTL value is 1 minute, the maximum value is 10 years (10 \\*
365 days).

The REFRESH modifier is optional. When the REFRESH modifier is specified, the
token's expiration timestamp will be refreshed on each successful
authentication.

:::note

When replication is used, the token will not be refreshed on successful
authentication on replicas, but only on the primary node. This makes tokens with
the REFRESH modifier meaningful for use on the primary node only.

:::

### Remove REST API token

\`\`\`questdb-sql
-- drop single REST API token
ALTER USER john DROP TOKEN TYPE REST 'qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44';
-- drop all REST API tokens for the given user
ALTER USER john DROP TOKEN TYPE REST;
\`\`\`

Result of commands above can be verified with \`SHOW USER\`, e.g.

\`\`\`questdb-sql
SHOW USER john;
\`\`\`

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |
`
  },
  {
    path: 'sql/acl/assume-service-account.md',
    title: 'ASSUME SERVICE ACCOUNT reference',
    headers: ['Syntax'],
    content: `\`ASSUME SERVICE ACCOUNT\` switches current user to a service account, basically
replacing its current access list with the service account's access list.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the ASSUME SERVICE ACCOUNT keyword](/images/docs/diagrams/assumeServiceAccount.svg)

## Examples

\`\`\`questdb-sql
ASSUME SERVICE ACCOUNT ilp_ingestion;
\`\`\`
`
  },
  {
    path: 'sql/acl/create-group.md',
    title: 'CREATE GROUP reference',
    headers: ['Syntax', 'Description'],
    content: `\`CREATE GROUP\` - create a new group

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the CREATE GROUP keyword](/images/docs/diagrams/createGroup.svg)

## Description

\`CREATE GROUP\` adds a new user group with no permissions.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. If the name has already been reserved, the command
fails and an error is raised, unless the \`IF NOT EXISTS\` clause is included in
the statement.

Contrary to users and service accounts, it is not possible to log in as group. A
group only serves as a container for permissions which are shared between users.

## Examples

\`\`\`questdb-sql
CREATE GROUP admins;

CREATE GROUP IF NOT EXISTS admins;
\`\`\`

It can be verified with:

\`\`\`questdb-sql
SHOW GROUPS;
\`\`\`

that yields:

| name   |
| ------ |
| admins |
`
  },
  {
    path: 'sql/acl/create-service-account.md',
    title: 'CREATE SERVICE ACCOUNT reference',
    headers: ['Syntax', 'Description'],
    content: `To create a new service account in the database, the \`CREATE SERVICE ACCOUNT\`
keywords are used.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the CREATE SERVICE ACCOUNT keyword](/images/docs/diagrams/createServiceAccount.svg)

## Description

\`CREATE SERVICE ACCOUNT\` adds a new service account with no permissions.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. If the name has already been reserved, the command
fails and an error is raised, unless the \`IF NOT EXISTS\` clause is included in
the statement.

Note that new service accounts can only access the database if the necessary
[endpoint permissions](/docs/operations/rbac/#endpoint-permissions) have been
granted.

The user creating the service account automatically receives the
\`ASSUME SERVICE ACCOUNT\` permission with \`GRANT\` option, unless the \`OWNED BY\`
clause is present, in which case the permission is granted to the user or
group specified in the clause.

The \`OWNED BY\` clause cannot be omitted if the service account is created by
an external user, because permissions cannot be granted to them.

## Examples

\`\`\`questdb-sql
CREATE SERVICE ACCOUNT audit;

CREATE SERVICE ACCOUNT IF NOT EXISTS audit;
\`\`\`

\`\`\`
CREATE GROUP analysts;
CREATE SERVICE ACCOUNT dashboard OWNED BY analysts;

\`\`\`

It can be verified with:

\`\`\`questdb-sql
SHOW SERVICE ACCOUNT audit;
\`\`\`

that yields:

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |
`
  },
  {
    path: 'sql/acl/create-user.md',
    title: 'CREATE USER reference',
    headers: ['Syntax', 'Description', 'Conditional user creation'],
    content: `\`CREATE USER\` - create a new user in the database.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the CREATE USER keyword](/images/docs/diagrams/createUser.svg)

## Description

\`CREATE USER\` adds a new user with no permissions, optionally a password can
also be set for the user.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. If the name has already been reserved, the command
fails and an error is raised, unless the \`IF NOT EXISTS\` clause is included in
the statement.

Note that new users can only access the database if the necessary
[endpoint permissions](/docs/operations/rbac/#endpoint-permissions) have been
granted.

## Conditional user creation

You can use the \`IF NOT EXISTS\` clause to create a user only if it does not
already exist. If the user already exists, the command will have no effect.

When you use the \`IF NOT EXISTS\` clause and the user already exists, the command
will keep the user's password intact and will not change it in any way. This is
true even if the current password differs from the one you are attempting to
set:

\`\`\`questdb-sql title="IF NOT EXISTS with a password"
CREATE USER IF NOT EXISTS john WITH PASSWORD secret;
\`\`\`

\`\`\`questdb-sql title="IF NOT EXISTS with no password"
CREATE USER IF NOT EXISTS john WITH NO PASSWORD;
\`\`\`

If you want to update the user's password unconditionally, you can use the
[ALTER USER](/docs/reference/sql/acl/alter-user/#set-password) command.

## Examples

### Create new user without password

\`\`\`questdb-sql
CREATE USER john;
-- or
CREATE USER IF NOT EXISTS john;
-- or
CREATE USER john WITH NO PASSWORD;
\`\`\`

It can be verified with:

\`\`\`questdb-sql
SHOW USER john;
\`\`\`

that yields:

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

### Create user with password

\`\`\`questdb-sql
CREATE USER jane WITH PASSWORD secret;
\`\`\`

In this case \`SHOW USER\` command returns:

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |
`
  },
  {
    path: 'sql/acl/drop-group.md',
    title: 'DROP GROUP reference',
    headers: ['Syntax', 'Description'],
    content: `\`DROP GROUP\` - remove an existing group.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the DROP GROUP keyword](/images/docs/diagrams/dropGroup.svg)

## Description

\`DROP GROUP\` removes an existing group.

Unless the \`IF EXISTS\` clause is applied, an error is raised and the command
fails if the group does not exist.

When a group is removed, all members of the group lose the permissions inherited
through the group.

## Examples

\`\`\`questdb-sql
DROP GROUP admins;

DROP GROUP IF EXISTS admins;
\`\`\`

It can be verified with:

\`\`\`questdb-sql
SHOW GROUPS;
\`\`\`

that does not include \`admins\` in its result.
`
  },
  {
    path: 'sql/acl/drop-service-account.md',
    title: 'DROP SERVICE ACCOUNT reference',
    headers: ['Syntax', 'Description'],
    content: `\`DROP SERVICE ACCOUNT\` - drop an existing service account

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the DROP SERVICE ACCOUNT keyword](/images/docs/diagrams/dropServiceAccount.svg)

## Description

\`DROP SERVICE ACCOUNT\` removes an existing service account and all related links
to users or groups.

Unless the \`IF EXISTS\` clause is applied, an error is raised and the command
fails if the service account does not exist.

## Examples

\`\`\`questdb-sql
DROP SERVICE ACCOUNT audit;

DROP SERVICE ACCOUNT IF EXISTS audit;
\`\`\`

It can be verified with:

\`\`\`questdb-sql
SHOW SERVICE ACCOUNTS;
\`\`\`

that does not include \`audit\` in its result.
`
  },
  {
    path: 'sql/acl/drop-user.md',
    title: 'DROP USER reference',
    headers: ['Syntax', 'Description'],
    content: `\`DROP USER\` - drop an existing user

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the DROP USER keyword](/images/docs/diagrams/dropUser.svg)

## Description

\`DROP USER\` removes an existing user.

**All related secrets are also deleted.**

Unless the \`IF EXISTS\` clause is applied, an error is raised and the command
fails if the user does not exist.

## Examples

\`\`\`questdb-sql
DROP USER john;

DROP USER IF EXISTS john;
\`\`\`

It can be verified with:

\`\`\`questdb-sql
SHOW USERS;
\`\`\`

that does not include \`john\` in its result.
`
  },
  {
    path: 'sql/acl/exit-service-account.md',
    title: 'EXIT SERVICE ACCOUNT reference',
    headers: ['Syntax'],
    content: `\`EXIT SERVICE ACCOUNT\` - switches current user back from service account,
basically replacing its current access list (belonging to a user account) with
the user's access list.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the EXIT SERVICE ACCOUNT keyword](/images/docs/diagrams/exitServiceAccount.svg)

## Examples

\`\`\`questdb-sql
EXIT SERVICE ACCOUNT audit;
\`\`\`
`
  },
  {
    path: 'sql/acl/grant-assume-service-account.md',
    title: 'GRANT ASSUME SERVICE ACCOUNT reference',
    headers: ['Syntax', 'Description'],
    content: `\`GRANT ASSUME SERVICE ACCOUNT\` - assigns a service account to a user or a group.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the GRANT ASSUME SERVICE ACCOUNT keyword](/images/docs/diagrams/grantAssumeServiceAccount.svg)

## Description

- \`GRANT ASSUME SERVICE ACCOUNT serviceAccount TO userOrGroup\` - assigns a
  service account to a user or a group
- \`GRANT ASSUME SERVICE ACCOUNT serviceAccount TO userOrGroup WITH GRANT OPTION\` -
  assigns a service account to a user or a group with grant option

When a service account is assigned to a user, the user can assume the service
account. Assuming the service account means that the user can switch its own
access list to the access list of the service account. When a service account is
assigned to a group, all users of the group get the permission to assume the
service account.

If the service account is assigned \`WITH GRANT OPTION\`, then the assuming
user(s) are then permitted to grant service account assumption to other users or
groups.

## Examples

\`GRANT ASSUME SERVICE ACCOUNT\` command itself does not return any result, thus
the effects of running SQL commands that follow are shown with
\`SHOW SERVICE ACCOUNTS john\`.

### Assign a service account to a user

\`\`\`questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john;
\`\`\`

| name      | grant_option |
| --------- | ------------ |
| ingestion | false        |

### Assign a service account to a user with grant option

\`\`\`questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john WITH GRANT OPTION;
\`\`\`

| name      | grant_option |
| --------- | ------------ |
| ingestion | true         |

### Removing grant option

\`\`\`questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john WITH GRANT OPTION;
GRANT ASSUME SERVICE ACCOUNT ingestion TO john;
\`\`\`

| name      | grant_option |
| --------- | ------------ |
| ingestion | false        |

### Owner grants

The user who creates a service account will be able to assume as the service
account right after it is created. It will also provide \`WITH GRANT OPTION\` so
that the user can then provide the service account action to others.

FFor example, if user \`john\` has permission to create service accounts, and
creates one called \`ingestion\`:

\`\`\`questdb-sql
CREATE SERVICE ACCOUNT ingestion;
SHOW SERVICE ACCOUNTS john;
\`\`\`

| name      | grant_option |
| --------- | ------------ |
| ingestion | true         |
`
  },
  {
    path: 'sql/acl/grant.md',
    title: 'GRANT reference',
    headers: ['Syntax', 'Description'],
    content: `\`GRANT\` - grants permissions to a user, group or service account.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the GRANT keyword](/images/docs/diagrams/grant.svg)

## Description

- \`GRANT [permissions] TO entity\` - grant database level permissions on database
  level to an entity
- \`GRANT [permissions] ON ALL TABLES TO entity\` - grant table/column level
  permissions on database level to an entity
- \`GRANT [permissions] ON [table] TO entity\` - grant table/column level
  permissions on table level to an entity
- \`GRANT [permissions] ON [table(columns)] TO entity\` - grant column level
  permissions on column level to an entity

### Grant database level permissions

\`\`\`questdb-sql
GRANT CREATE TABLE, SNAPSHOT TO john;
\`\`\`

| permission   | table_name | column_name | grant_option | origin |
| ------------ | ---------- | ----------- | ------------ | ------ |
| CREATE TABLE |            |             | f            | G      |
| SNAPSHOT     |            |             | f            | G      |

### Grant table level permissions for entire database

\`\`\`questdb-sql
GRANT ADD INDEX, REINDEX ON ALL TABLES TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| ADD INDEX  |            |             | f            | G      |
| REINDEX    |            |             | f            | G      |

### Grant table level permissions on specific tables

\`\`\`questdb-sql
GRANT ADD INDEX, REINDEX ON orders, trades TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| ADD INDEX  | trades     |             | f            | G      |
| REINDEX    | trades     |             | f            | G      |
| ADD INDEX  | orders     |             | f            | G      |
| REINDEX    | orders     |             | f            | G      |

### Grant column level permissions for entire database

\`\`\`questdb-sql
GRANT SELECT ON ALL TABLES TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | f            | G      |

### Grant column level permissions on specific tables

\`\`\`questdb-sql
GRANT SELECT ON orders TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |

### Grant column level permissions on specific columns

\`\`\`questdb-sql
GRANT SELECT ON orders(id, name), trades(id, quantity) TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | trades     | id          | f            | G      |
| SELECT     | trades     | quantity    | f            | G      |
| SELECT     | orders     | id          | f            | G      |
| SELECT     | orders     | name        | f            | G      |

### Grant option

If the \`WITH GRANT OPTION\` clause is present, then the target entity is allowed
to grant the permissions to other entities. If the entity already has
permissions matching those being granted, their grant option is overwritten.

\`\`\`questdb-sql
GRANT SELECT ON ALL TABLES TO john WITH GRANT OPTION;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |

\`\`\`questdb-sql
GRANT SELECT ON ALL TABLES TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | f            | G      |

### Verification

By default, \`GRANT\` does not check whether entities exist, making it possible to
grant permissions to users, groups or service accounts that are later created.

To make sure that the target entity of the grant statement exists, use
[verification](/docs/operations/rbac/#grant-verification). The
\`WITH VERIFICATION\` clause enables checks on the target entity and causes the
\`GRANT\` statement to fail if the entity does not exist.

\`\`\`questdb-sql
GRANT SELECT ON orders TO john WITH VERIFICATION;
\`\`\`

### Implicit permissions

In QuestDB, the timestamp column of a table is crucial for time-series
operations like \`ASOF\` and \`LT\` joins, \`SAMPLE BY\` and interval scans. If a user
can access some columns but not the timestamp column, they cannot execute most
queries.

Therefore when a table has a designated timestamp, granting \`SELECT\` or \`UPDATE\`
permissions on any column will automatically extend those permissions to the
timestamp column. These are known as
[implicit permissions](/docs/operations/rbac/#implicit-permissions), and they're
indicated by an \`I\` in the \`origin\` column of the \`SHOW PERMISSIONS\` output.

For example, if you grant \`UPDATE\` permission on the \`id\` column of the
\`products\` table, the timestamp column also receives \`UPDATE\` permission:

\`\`\`questdb-sql
CREATE TABLE products(id int, name string, ts timestamp) timestamp(ts);
GRANT UPDATE ON products(id) TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| UPDATE     | products   | id          | f            | G      |
| UPDATE     | products   | ts          | f            | I      |

### Optimization

When granting permissions on the table or column level, sometimes it might seem
like there is no effect when cross-checking with the \`SHOW permissions\` command.
If QuestDB detects that the permission is already granted on a higher level, it
optimizes and removes any child permissions. Doing so keeps the access list
model simple and permission checks faster.

For example, granting the same permission on the database and table level shows
will show the permission on database level only:

\`\`\`questdb-sql
GRANT INSERT ON ALL TABLES TO john;
GRANT INSERT ON products TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| INSERT     |            |             | f            | G      |

Granting the same permission on the table and column level shows permission on
the table level only:

\`\`\`questdb-sql
GRANT SELECT ON products TO john;
GRANT SELECT ON products(id) TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   |             | f            | G      |

### Grant ahead of table or column creation

Grant permissions ahead of table or column creation:

\`\`\`questdb-sql
GRANT SELECT ON countries TO john;
GRANT UPDATE ON countries(id) TO john;
GRANT UPDATE ON countries(description) TO john;
\`\`\`

Such permissions do not show on \`SHOW PERMISSIONS\` output.

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |

However, when the table is created, then the applicable permissions appear:

\`\`\`questdb-sql
CREATE TABLE countries (id INT, name STRING, iso_code STRING);
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  | id          | f            | G      |

When 'missing' columns are later added to the table, then more permissions
appear:

\`\`\`questdb-sql
ALTER TABLE countries ADD COLUMN description string;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  | id          | f            | G      |
| UPDATE     | countries  | description | f            | G      |

### Grant when table or column is dropped and recreated

Granted permissions are not automatically revoked when related tables or columns
are dropped. Instead, they have no effect until table or column is recreated.

\`\`\`questdb-sql
CREATE TABLE countries (id INT, name STRING, iso_code STRING);
GRANT SELECT ON countries TO john;
GRANT UPDATE ON countries(iso_code) TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  | iso_code    | f            | G      |

Now, if the table is dropped, then permission stops being visible:

\`\`\`questdb-sql
DROP TABLE countries;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |

When the table is later recreated, permission are in full effect again :

\`\`\`questdb-sql
CREATE TABLE countries (id INT, name STRING, iso_code int, alpha2 STRING);
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  |             | f            | G      |

:::note

Only the table and/or column name is used when applying permission. The type is
ignored. In the example above \`iso_code\` was initially of string type, then
recreated as int.

:::

### Owner grants

In QuestDB there are no owners of database objects. Instead, there are
[owner grants](/docs/operations/rbac/#owner-grants).

An owner grant means:

- if a user creates a table, the user automatically gets all table level
  permissions with the grant option on the table
- if a user adds a new column to an existing table, the user automatically gets
  all column level permissions with the grant option on the column
`
  },
  {
    path: 'sql/acl/remove-user.md',
    title: 'REMOVE USER reference',
    headers: ['Syntax'],
    content: `\`REMOVE USER\` - removes user from one or more groups.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the REMOVE USER keyword](/images/docs/diagrams/removeUser.svg)

## Examples

\`\`\`questdb-sql
ADD USER john to management, audit;
REMOVE USER john from management, audit;
\`\`\`

Checking user groups with:

\`\`\`questdb-sql
SHOW GROUPS john;
\`\`\`

should yield an empty list.
`
  },
  {
    path: 'sql/acl/revoke-assume-service-account.md',
    title: 'REVOKE ASSUME SERVICE ACCOUNT reference',
    headers: ['Syntax', 'Description'],
    content: `\`REVOKE ASSUME SERVICE ACCOUNT\` - revokes a service account from a user or a
group.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the REVOKE ASSUME SERVICE ACCOUNT keyword](/images/docs/diagrams/revokeAssumeServiceAccount.svg)

## Description

- \`REVOKE ASSUME SERVICE ACCOUNT serviceAccount FROM userOrGroup\` - revokes a
  service account from a user or a group

When a service account is revoked from a user, the user no no longer assume the
service account.

## Examples

### Revoke a service account from a user

\`\`\`questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john WITH GRANT OPTION;
\`\`\`

| name      | grant_option |
| --------- | ------------ |
| ingestion | t            |

\`\`\`questdb-sql
REVOKE ASSUME SERVICE ACCOUNT ingestion FROM john;
\`\`\`

| name | grant_option |
| ---- | ------------ |
|      |              |
`
  },
  {
    path: 'sql/acl/revoke.md',
    title: 'REVOKE reference',
    headers: ['Syntax', 'Description'],
    content: `\`REVOKE\` - revoke permission from user, group or service account.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the REVOKE keyword](/images/docs/diagrams/revoke.svg)

## Description

- \`REVOKE [permissions] FROM entity\` - revoke database level permissions from an
  entity
- \`REVOKE [permissions] ON ALL TABLES FROM entity\` - revoke table/column level
  permissions on database level from an entity
- \`REVOKE [permissions] ON [table] FROM entity\` - revoke table/column level
  permissions on table level from an entity
- \`REVOKE [permissions] ON [table(columns)] FROM entity\` - revoke column level
  permissions on column level from an entity

### Revoke database level permissions

\`\`\`questdb-sql
REVOKE CREATE TABLE FROM john;
\`\`\`

### Revoke table level permissions for entire database

\`\`\`questdb-sql
REVOKE ADD INDEX, REINDEX ON ALL TABLES FROM john;
\`\`\`

### Revoke table level permissions on specific tables

\`\`\`questdb-sql
REVOKE ADD INDEX, REINDEX ON orders FROM john;
\`\`\`

### Revoke column level permissions for entire database

\`\`\`questdb-sql
REVOKE SELECT ON ALL TABLES FROM john;
\`\`\`

### Revoke column level permissions on specific tables

\`\`\`questdb-sql
REVOKE SELECT ON orders, trades FROM john;
\`\`\`

### Revoke column level permissions on specific columns

\`\`\`questdb-sql
REVOKE SELECT ON orders(id, name) FROM john;
\`\`\`

### Implicit permissions

If the target table has implicit timestamp permissions, then revoking \`SELECT\`
or \`UPDATE\` permission on all other table columns also revokes it on the
designated timestamp column:

\`\`\`questdb-sql
CREATE TABLE products(id INT, name STRING, ts TIMESTAMP) TIMESTAMP(ts);
GRANT SELECT ON products(id) TO john;
GRANT SELECT, UPDATE ON products(name) TO john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| UPDATE     | products   | name        | f            | G      |
| UPDATE     | products   | ts          | f            | I      |
| SELECT     | products   | id          | f            | G      |
| SELECT     | products   | name        | f            | G      |
| SELECT     | products   | ts          | f            | I      |

Revoking a permission from all columns revokes the implicitly granted permission
from the designated timestamp column:

\`\`\`questdb-sql
REVOKE UPDATE ON products(name) FROM john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   | id          | f            | G      |
| SELECT     | products   | name        | f            | G      |
| SELECT     | products   | ts          | f            | I      |

However, if there is even a single column which still has the permission, then
the implicit permission is kept:

\`\`\`questdb-sql
REVOKE SELECT ON products(id) FROM john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   | name        | f            | G      |
| SELECT     | products   | ts          | f            | I      |

### Permission level readjustment

If the user has a database- or table-level permission, then revoking it on a
lower level triggers
[permission level re-adjustment](/docs/operations/rbac/#permission-level-re-adjustment).
Permission is switched to lower level and \`materialized\`:

- database level permission is pushed to table level, so e.g. SELECT will not
  apply to any new tables
- table level permission is pushed to column level, so e.g. SELECT will not
  apply to any new table columns

For example, assume we have the following tables: \`orders\`, \`trades\` and
\`products\`, and revoking a permission from a table which was granted on database
level previously.

\`\`\`questdb-sql
GRANT SELECT ON ALL TABLES TO john;
REVOKE SELECT ON trades FROM john;
\`\`\`

Database level permission is replaced with table level on all existing tables,
except the one being revoked.

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |
| SELECT     | products   |             | f            | G      |

As a consequence permission, which was granted for all tables previously, will
not apply to any newly-created tables:

\`\`\`questdb-sql
CREATE TABLE new_tab( id INT );
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |
| SELECT     | products   |             | f            | G      |

Permission level re-adjustment can also happen from the table level to the
column level. For example, the following column level revoke replaces the table
level permission on the products table with column level permissions:

\`\`\`questdb-sql
REVOKE SELECT on products(id) FROM john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |
| SELECT     | products   | name        | f            | G      |

### Revoke permissions inherited from group

Permissions of groups are applied after user permissions, thus it is not
possible to revoke them directly from the user.

\`\`\`questdb-sql
CREATE group admins;
GRANT SELECT on products to admins;
ADD USER john to admins;
REVOKE SELECT on products from john;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   |             | f            | G      |

To do so, either:

- the user has to be removed from the group where the permission is inherited
  from
- or the permission has to be revoked from the group

\`\`\`questdb-sql
REVOKE SELECT on products FROM admins;
-- or
REMOVE USER john FROM admins;
\`\`\`
`
  },
  {
    path: 'sql/alter-mat-view-alter-column-add-index.md',
    title: 'ALTER MATERIALIZED VIEW ADD INDEX',
    headers: ['Syntax'],
    content: `Indexes an existing [\`symbol\`](/docs/concept/symbol/) column.

## Syntax
![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW with ADD INDEX keyword](/images/docs/diagrams/alterMatViewAddIndex.svg)

Adding an [index](/docs/concept/indexes/) is an atomic, non-blocking, and
non-waiting operation. Once complete, the SQL optimizer will start using the new
index for SQL executions.

:::warning

- The **index capacity** and
  [**symbol capacity**](/docs/concept/symbol/#usage-of-symbols) are different
  settings.
- The index capacity value should not be changed, unless a user is aware of all
  the implications.
- To learn more about index capacity, check the [Index concept](/docs/concept/indexes/#index-capacity) page.
:::

## Example

\`\`\`questdb-sql title="Adding an index with default capacity"
ALTER MATERIALIZED VIEW trades_1h
    ALTER COLUMN symbol ADD INDEX;
\`\`\`


`
  },
  {
    path: 'sql/alter-mat-view-alter-column-drop-index.md',
    title: 'ALTER MATERIALIZED VIEW ALTER COLUMN DROP INDEX',
    headers: ['Syntax'],
    content: `Removes an existing [index](/docs/concept/indexes/) from a column of type [symbol](/docs/concept/symbol/).


## Syntax
![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW keyword](/images/docs/diagrams/alterMatView.svg)
![Flow chart showing the syntax of the ALTER MATERIELIZED with DROP INDEX keyword](/images/docs/diagrams/dropIndex.svg)

Removing an [index](/docs/concept/indexes/) is an atomic, non-blocking, and non-waiting operation. Once
the operation is completed, the SQL engine stops using the index for SQL
executions, and all its associated files are deleted.


## Example

\`\`\`questdb-sql title="Removing an index from a materialized view"
ALTER MATERIALIZED VIEW trades
    ALTER COLUMN instrument DROP INDEX;
\`\`\`
`
  },
  {
    path: 'sql/alter-mat-view-change-symbol-capacity.md',
    title: 'ALTER MATERIALIZED VIEW SYMBOL CAPACITY',
    headers: ['Syntax', 'Notes'],
    content: `Changes the capacity of an existing SYMBOL column in a
[materialized view](/docs/concept/mat-views/).

The capacity of the SYMBOL column is altered without rewriting the data already
stored in the materialized view. This operation allows you to adjust the maximum
number of distinct values that can be stored in a SYMBOL column.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SYMBOL CAPACITY command](/images/docs/diagrams/alterMatViewSymbolCapacity.svg)

## Examples

Change the capacity of the SYMBOL column \`symbol\` in materialized view
\`trades_1h\` to 10000:

\`\`\`questdb-sql
ALTER MATERIALIZED VIEW trades_1h ALTER COLUMN symbol SYMBOL CAPACITY 10000;
\`\`\`

## Notes

- The operation does not rewrite existing data in materialized view partitions,
  making it an efficient way to adjust SYMBOL column configurations.
- The new capacity value must be a positive integer.
- The specified capacity will be automatically rounded to the next power of two.
`
  },
  {
    path: 'sql/alter-mat-view-resume-wal.md',
    title: 'ALTER MATERIALIZED VIEW RESUME WAL',
    headers: ['Syntax', 'See also'],
    content: `:::info

Materialized View support is now generally available (GA) and ready for production use.

If you are using versions earlier than \`8.3.1\`, we suggest you upgrade at your earliest convenience.

:::

\`ALTER MATERIALIZED VIEW RESUME WAL\` restarts
[WAL table](/docs/concept/write-ahead-log/) transactions after resolving errors.

Accepts the same optional \`sequencerTxn\` input as the
[\`ALTER TABLE RESUME WAL\`](/docs/reference/sql/alter-table-resume-wal/)
operation. Refer to that page for more details.

## Syntax

![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW keyword](/images/docs/diagrams/alterMatView.svg)

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW with RESUME WAL keyword](/images/docs/diagrams/resumeWal.svg)

## Example

Use the [\`wal_tables()\`](/docs/reference/function/meta/#wal_tables) function to
investigate the materialized view status:

\`\`\`questdb-sql title="List all tables and materialized views" demo
wal_tables();
\`\`\`

| name      | suspended | writerTxn | sequencerTxn |
| --------- | --------- | --------- | ------------ |
| trades_1h | true      | 3         | 5            |

The \`trades_1h\` view is suspended. The last successful commit is \`3\`.

The following query restarts transactions from the failed transaction, \`4\`:

\`\`\`questdb-sql
ALTER MATERIALIZED VIEW trades_1h RESUME WAL;
\`\`\`

## See also

For more information on the concept, see the
[reference](/docs/concept/mat-views/) on materialized views.
`
  },
  {
    path: 'sql/alter-mat-view-set-refresh-limit.md',
    title: 'ALTER MATERIALIZED VIEW SET REFRESH LIMIT',
    headers: ['Syntax', 'Description'],
    content: `Sets the time limit for incremental refresh on a materialized view.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SET REFRESH LIMIT command](/images/docs/diagrams/alterMatViewSetRefreshLimit.svg)

## Description

To protect older aggregated data from being overwritten by inserts with old
timestamps, configure a refresh limit on a materialized view using the
\`ALTER MATERIALIZED VIEW SET REFRESH LIMIT\` command. This means that base
table's rows with timestamps older than the refresh limit will not be aggregated
in the materialized view.

Let's suppose we've just configured refresh limit on a materialized view:

\`\`\`sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH LIMIT 1 WEEK;
\`\`\`

Next, the current time is \`2025-05-02T12:00:00.000000Z\` and we're inserting a
few rows into the base table:

\`\`\`sql
INSERT INTO trades VALUES
  ('2025-03-02T12:00:00.000000Z', 'BTC-USD', 39269.98, 0.042),
  ('2025-04-02T12:00:00.000000Z', 'BTC-USD', 39170.01, 0.042),
  ('2025-05-02T12:00:00.000000Z', 'BTC-USD', 38450.10, 0.042);
\`\`\`

The first two rows here are older than a week, so incremental refresh will only
take place for the third row with the \`2025-05-02T12:00:00.000000Z\` timestamp.

:::note

The limit is only applied to incremental refresh, but not to the
[\`REFRESH MATERIALIZED VIEW FULL\`](/docs/reference/sql/refresh-mat-view)
command. This means that when you run a full refresh command, all rows from the
base table are aggregated in the materialized view.

:::

The \`REFRESH LIMIT\` value consists of a number and a time unit, one of:

- \`HOURS\`
- \`DAYS\`
- \`WEEKS\`
- \`MONTHS\`
- \`YEARS\`

The limit units fall into two categories:

1. Fixed time periods:
   - \`HOURS\`
   - \`DAYS\`
   - \`WEEKS\`
2. Calendar-based periods:
   - \`MONTHS\`
   - \`YEARS\`

Fixed-time periods are always exact durations: \`1 WEEK\` is always 7 days.

Calendar-based periods may vary in length: \`1 MONTH\` from January 15th goes to
February 15th and could be between 28 and 31 days.

QuestDB accepts both singular and plural forms:

- \`HOUR\` or \`HOURS\`
- \`DAY\` or \`DAYS\`
- \`WEEK\` or \`WEEKS\`
- \`MONTH\` or \`MONTHS\`
- \`YEAR\` or \`YEARS\`

It also supports shorthand notation: \`3h\` for 3 hours, \`2M\` for 2 months.

## Examples

Set the refresh limit to 1 day:

\`\`\`sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH LIMIT 1 DAY;
\`\`\`

Set the limit to 8 hours, using the shorthand syntax for the time unit:

\`\`\`sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH LIMIT 8h;
\`\`\`
`
  },
  {
    path: 'sql/alter-mat-view-set-refresh.md',
    title: 'ALTER MATERIALIZED VIEW SET REFRESH',
    headers: ['Syntax', 'Description'],
    content: `Changes a materialized view's refresh strategy and parameters.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SET REFRESH command](/images/docs/diagrams/alterMatViewSetRefresh.svg)

## Description

Sometimes, the view's refresh strategy and its parameters may need to be changed.
Say, you may want to change the view to be timer refreshed instead of immediate
refresh.

The \`REFRESH\` follows the same format as [CREATE MATERIALIZED VIEW](/docs/reference/sql/create-mat-view/).

## Examples

\`\`\`questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH EVERY '1h';
\`\`\`

\`\`\`questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH PERIOD (LENGTH 1d DELAY 1h);
\`\`\`

\`\`\`questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH IMMEDIATE;
\`\`\`

\`\`\`questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH MANUAL;
\`\`\`
`
  },
  {
    path: 'sql/alter-mat-view-set-ttl.md',
    title: 'ALTER MATERIALIZED VIEW SET TTL',
    headers: ['Syntax', 'Description'],
    content: `Sets the [time-to-live](/docs/concept/ttl/) (TTL) period on a materialized view.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SET TTL command](/images/docs/diagrams/alterMatViewSetTtl.svg)

## Description

To keep only recent aggregated data in a materialized view, configure a
time-to-live (TTL) period on the view using the
\`ALTER MATERIALIZED VIEW SET TTL\` command.

The value follows the same rules as the one in the
[\`ALTER TABLE SET TTL\`](/docs/reference/sql/alter-table-set-ttl) command.

:::note

QuestDB drops data that exceeded its TTL only a whole partition at a time. For
this reason, the TTL period must be a whole number multiple of the view's
partition size.

:::

## Examples

Set the TTL to 3 days:

\`\`\`sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET TTL 3 DAYS;
\`\`\`

Set the TTL to 12 hours, using the shorthand syntax for the time unit:

\`\`\`sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET TTL 12h;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-add-column.md',
    title: 'ALTER TABLE ADD COLUMN',
    headers: ['Syntax', 'OWNED BY'],
    content: `Adds a new column of a specified type to an existing table.

The new column is not back-populated even if the table contains data. While a
single column is added atomically, adding multiple columns is not an atomic
operation. QuestDB will stop adding the remaining columns on the list on the
first failure. It is therefore possible to add some columns and not others.

:::caution

- New column names may only consist of letters, numbers and underscores \`_\`

- Adding a new column does not lock the table for reading and does not wait on
  any reads to finish.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of ALTER TABLE with ADD COLUMN keyword](/images/docs/diagrams/alterTableAddColumn.svg)

## OWNED BY

_Enterprise only._

When a user adds a new column to a table, they automatically get all column
level permissions with the \`GRANT\` option for that column.
However, if the \`OWNED BY\` clause is used, the permissions instead go to the
user, group, or service account named in that clause.

The \`OWNED BY\` clause cannot be omitted if the column is added by an external
user, because permissions cannot be granted to them.

## Examples

Add a new column called \`comment\` of \`STRING\` type to the table \`ratings\`

\`\`\`questdb-sql title="New column"
ALTER TABLE ratings ADD COLUMN comment STRING;
\`\`\`

Add a column only if it doesn't already exist:

\`\`\`questdb-sql title="Add column if not exists"
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS score DOUBLE;
\`\`\`

When adding a column of \`Symbol\` type, optional keywords may be passed which are
unique to this type. These keywords are described in the
[Symbol type](/docs/reference/sql/create-table/#symbols) section of the
\`CREATE TABLE\` documentation.

The following example shows how to add a new \`SYMBOL\` column with \`NOCACHE\` and
\`INDEX\` keywords:

\`\`\`questdb-sql title="New symbol column"
ALTER TABLE ratings ADD COLUMN comment SYMBOL NOCACHE INDEX;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-alter-column-add-index.md',
    title: 'ALTER TABLE COLUMN ADD INDEX',
    headers: ['Syntax'],
    content: `Indexes an existing [\`symbol\`](/docs/concept/symbol/) column.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of the ALTER TABLE with ADD INDEX keyword](/images/docs/diagrams/alterTableAddIndex.svg)

Adding an [index](/docs/concept/indexes/) is an atomic, non-blocking, and
non-waiting operation. Once complete, the SQL optimizer will start using the new
index for SQL executions.

## Example

\`\`\`questdb-sql title="Adding an index"
ALTER TABLE trades ALTER COLUMN instrument ADD INDEX;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-alter-column-cache.md',
    title: 'ALTER TABLE COLUMN CACHE | NOCACHE',
    headers: ['Syntax'],
    content: `\`ALTER TABLE ALTER COLUMN CACHE | NOCACHE\` changes the cache setting for a
[symbol](/docs/concept/symbol/) column.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of NOCACHE | CACHE](/images/docs/diagrams/alterTableNoCache.svg)

- \`columnName\` is the \`symbol\` data type.
- By default, a symbol column is cached.
- Refer to the [Guide on symbol](/docs/concept/symbol/#symbol-columns) for the
  advantages of caching \`symbols\`.

## Examples

\`\`\`questdb-sql
ALTER TABLE 'taxi_ride' ALTER COLUMN passenger_count NOCACHE;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-alter-column-drop-index.md',
    title: 'ALTER TABLE COLUMN DROP INDEX',
    headers: ['Syntax'],
    content: `Removes an existing [index](/docs/concept/indexes/) from a column of type [symbol](/docs/concept/symbol/).


## Syntax
![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of the ALTER TABLE with DROP INDEX keyword](/images/docs/diagrams/dropIndex.svg)

Removing an index is an atomic, non-blocking, and non-waiting operation. Once
the operation is completed, the SQL engine stops using the index for SQL
executions, and all its associated files are deleted.

This operation is similar to:

\`\`\`sql
UPDATE tab SET column=column;
\`\`\`

Where \`column\` is a symbol column that has an [index](/docs/concept/indexes/)
before the operation, and no index afterwards. Readers of the table might be
using the index in transaction A, in the meantime, a writer creates transaction
B containing the new version of the column, minus the index (metadata is set to
not have index, and index files are not copied across to the newer version).
When the readers are finished, QuestDB automatically deletes all the files
pertaining to the version of the column in transaction A (QuestDB uses hardlinks
internally to avoid an actual copy operation of the data files, as they do not
change at all).

## Example

\`\`\`questdb-sql title="Removing an index"
ALTER TABLE trades ALTER COLUMN instrument DROP INDEX;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-attach-partition.md',
    title: 'ALTER TABLE ATTACH PARTITION',
    headers: ['Syntax', 'Description', 'Limitation'],
    content: `Restores one or more partitions to the table where they have been detached from
by using the SQL
[ALTER TABLE DETACH PARTITION](/docs/reference/sql/alter-table-detach-partition/)
statement.

This feature is part of the manual S3/cold storage solution, allowing restoring
data manually.

## Syntax

![Flow chart showing the syntax of ALTER TABLE with ATTACH PARTITION keyword](/images/docs/diagrams/alterTableAttachPartition.svg)

The \`WHERE\` clause is not supported when attaching partitions.

## Description

Before executing \`ATTACH PARTITION\`, the partition folders to be attached must
be made available to QuestDB using one of the following methods:

- Copying the partition folders manually
- Using a [symbolic link](https://en.wikipedia.org/wiki/Symbolic_link)

This section describes the details of each method.

### Manual copy

Partition folders can be manually moved from where they are stored into the
table folder in \`db\`. To make the partitions available for the attach operation,
the files need to be renamed \`<partition_name>.attachable\`.

For example, in a table partitioned by year, given a partition folder named
\`2020.detached\`, rename it as \`2020.attachable\`, and move it to the table
folder.

### Symbolic links

[Symbolic links](https://en.wikipedia.org/wiki/Symbolic_link) can be used to
attach partition folders that exist potentially in a different volume as cold
storage. The partitions attached in this way will be **read-only**. To make
detached partition folders in cold storage available for attaching, for each
partition folder, create a symbolic link with the name
format\`<partition_name>.attachable\` from the table's folder, and set the target
path to the detached partition folder.

In Windows, symbolic links require admin privileges, and thus this method is not
recommended.

:::note

SQL statements that hit partitions attached via symbolic links may have slower
runtime if their volumes have a slower disk.

:::

#### Properties using symbolic links

Partitions attached via the symbolic link approach are **read-only** for the
following operations:

- [\`DETACH PARTITION\`](/docs/reference/sql/alter-table-detach-partition/) and
  [\`DROP PARTITION\`](/docs/reference/sql/alter-table-drop-partition/): Once the
  partition folders are unlinked, the symbolic links are removed, but the
  content remains. Detaching a partition that was attached via symbolic link
  does not create a copy \`<partition_name>.detached\`.
- [\`UPDATE\`](/docs/reference/sql/update/): Attempts to update the read-only
  partitions result in an error.
- [\`INSERT\`](/docs/reference/sql/insert/): Attemps to insert data into a
  read-only partition result in a critical-level log message being logged by the
  server, and the insertion is a no-op. If
  [Prometheus monitoring](/docs/third-party-tools/prometheus/) is configured, an
  alert will be triggered.

For read-only partitions, the following operations are supported:

- [\`ADD COLUMN\`](/docs/reference/sql/alter-table-add-column/)
- [\`DROP COLUMN\`](/docs/reference/sql/alter-table-drop-column/)
- [\`RENAME COLUMN\`](/docs/reference/sql/alter-table-rename-column/)
- [\`ADD INDEX\`](/docs/reference/sql/alter-table-alter-column-add-index/)
- [\`DROP INDEX\`](/docs/reference/sql/alter-table-alter-column-drop-index/)

## Example

### Manual copy

Assuming the QuestDB data directory is \`/var/lib/questdb/db\`, for a table \`x\`
with AWS S3 for cold storage:

1. Copy files from S3:

   \`\`\`bash
   cd /var/lib/questdb/db/x
   # Table x is the original table where the partition were detached from.

   mkdir 2019-02-01.attachable && aws s3 cp s3://questdb-internal/blobs/20190201.tar.gz - | tar xvfz - -C 2019-02-01.attachable --strip-components 1
   mkdir 2019-02-02.attachable && aws s3 cp s3://questdb-internal/blobs/20190202.tar.gz - | tar xvfz - -C 2019-02-01.attachable --strip-components 1
   \`\`\`

2. Execute the SQL \`ALTER TABLE ATTACH PARTITION\` command:

   \`\`\`questdb-sql
   ALTER TABLE x ATTACH PARTITION LIST '2019-02-01', '2019-02-02';
   \`\`\`

3. After the SQL is executed, the partitions will be available to read.

### Symbolic link

The following example creates a table \`tab\` with some data, detaches all but the
last partition, and demonstrates how to attach the partitions using symbolic
links.

These SQL statements create table \`tab\` partitioned by year, and insert seven
rows that result in a total of seven partitions:

\`\`\`sql
CREATE TABLE tab (name STRING, age INT, dob TIMESTAMP) TIMESTAMP(dob) PARTITION BY YEAR;

INSERT INTO tab VALUES('B', 1, '2022-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('C', 2, '2023-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('D', 3, '2024-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('E', 4, '2025-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('F', 5, '2026-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('A', 0, '2027-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('0', 0, '2028-11-08T12:00:00.000000Z');
\`\`\`

This SQL statement detaches partitions 2022, 2023, 2024, 2025, 2026, and 2027:

\`\`\`sql
ALTER TABLE tab DETACH PARTITION WHERE dob < '2028';
\`\`\`

Assuming QuestDB's root directory to be \`/opt/homebrew/var/questdb/db\`, the
content of the table folder is:

\`\`\`shell
2022.detached
2023.detached
2024.detached
2025.detached
2026.detached
2027.detached
2028.5
_cv
_meta
_todo_
_txn
_txn_scoreboard
seq
\`\`\`

You can now move those \`<partition_name.detached>\` folders to a different path,
potentially a different volume:

\`\`\`shell
mv /opt/homebrew/var/questdb/db/tab/*.detached /cold_storage/tab
\`\`\`

When you want to attach these partitions back, create a symlink for every
partition to be attached from the table folder
\`/opt/homebrew/var/questdb/db/tab\`:

\`\`\`shell
ln -s /cold_storage/tab/2022.detached 2022.attachable
ln -s /cold_storage/tab/2023.detached 2023.attachable
ln -s /cold_storage/tab/2024.detached 2024.attachable
ln -s /cold_storage/tab/2025.detached 2025.attachable
ln -s /cold_storage/tab/2026.detached 2026.attachable
ln -s /cold_storage/tab/2027.detached 2027.attachable
\`\`\`

The content of the table folder should look like this now:

\`\`\`shell
2022.attachable -> /cold_storage/tab/2022.detached
2023.attachable -> /cold_storage/tab/2023.detached
2024.attachable -> /cold_storage/tab/2024.detached
2025.attachable -> /cold_storage/tab/2025.detached
2026.attachable -> /cold_storage/tab/2026.detached
2027.attachable -> /cold_storage/tab/2027.detached
2028.5
_cv
_meta
_todo_
_txn
_txn_scoreboard
seq
\`\`\`

After the symbolic links have been created, the partitions can be attached with
the following SQL statement:

\`\`\`sql
ALTER TABLE tab ATTACH PARTITION LIST '2022', '2023', '2024', '2025', '2026', '2027';
\`\`\`

The SQL reference to the partitions does not include the suffix \`.attachable\`.

## Limitation

- S3/Cold storage interaction is manual. Partitions can only be attached to the
  same table they were detached from. The table name must be the same. Moving
  partitions between tables or database instances is not supported.
- The operation will fail if a partition already exists. We are working on
  functionality to allow merging data in the same partition for attaching.
`
  },
  {
    path: 'sql/alter-table-change-column-type.md',
    title: 'ALTER TABLE COLUMN TYPE',
    headers: ['Syntax', 'Supported Data Types', 'Available Conversions', 'Unsupported Conversions'],
    content: `Changes the data type of an existing column in a table.

The data type of the column is altered without affecting the data already stored
in the table. However, it's important to note that altering the column type can
result in data loss or errors if the new type cannot accommodate the existing
data. Therefore, it's recommended to review the data and backup the table before
altering the column type.

:::caution

- Changing the column type may lead to data loss or errors if the new type
  cannot accommodate the existing data.

- The new data type must be compatible with the existing data in the column.

:::

## Syntax

![Flow chart showing the syntax of ALTER TABLE with ALTER COLUMN TYPE keyword](/images/docs/diagrams/alterColumnType.svg)

## Supported Data Types

The \`ALTER TABLE COLUMN TYPE\` command supports changing the column type to any
compatible data type.

## Examples

Change the data type of the column \`age\` in the table \`employees\` to \`INT\`:

\`\`\`questdb-sql
ALTER TABLE employees ALTER COLUMN age TYPE INT;
\`\`\`

When changing the column type, ensure that the new type is compatible with the
existing data. For instance, changing a column type from STRING to DOUBLE might
result in data loss or conversion errors if the existing data contains
non-numeric values.

\`\`\`questdb-sql
ALTER TABLE tbl ALTER COLUMN col_name TYPE DOUBLE;
\`\`\`

It is possible to specify all the additional column type parameters, like
\`CAPACITY\` & \`CACHE\`:

\`\`\`questdb-sql
ALTER TABLE tbl ALTER COLUMN department TYPE SYMBOL CAPACITY 10000 CACHE;
\`\`\`

## Available Conversions

QuestDB supports a wide range of conversions. However, certain type conversions
may lead to data precision loss (e.g., converting a \`FLOAT\` type to an \`INT\`) or
range overflow (e.g., converting a \`LONG\` type to an \`INT\`). The matrices below
depict fully compatible conversions marked with \`X\` and conversions that may
result in data loss marked with \`L\`.

Numeric types support a wide range of conversions, but many of them can result
in the data / precision loss.

| From \\ To | boolean | byte | short | int | float | long | double | date | timestamp |
| --------- | ------- | ---- | ----- | --- | ----- | ---- | ------ | ---- | --------- |
| boolean   |         | X    | X     | X   | X     | X    | X      | X    | X         |
| byte      | L       |      | X     | X   | X     | X    | X      | X    | X         |
| short     | L       | L    |       | X   | X     | X    | X      | X    | X         |
| int       | L       | L    | L     |     | L     | X    | X      | X    | X         |
| float     | L       | L    | L     | L   |       | L    | X      | L    | L         |
| long      | L       | L    | L     | L   | L     |      | L      | X    | X         |
| double    | L       | L    | L     | L   | X     | L    |        | L    | L         |

Conversions between \`TIMESTAMP\` and \`DATE\` types and numeric types are fully
supported. Timestamp values are represented in microseconds since the EPOCH,
while Date values are represented in milliseconds since the EPOCH. The EPOCH is
defined as \`1970-01-01T00:00:00.000000Z\`.

Additionally, when converting from \`BOOLEAN\` values to numerics, \`false\` is
represented as \`0\`, and \`true\` is represented as \`1\`. On the way back \`0\` and
\`NULL\` are converted to \`false\` and all other values converted to \`true\`.

| From \\ To | boolean | byte | short | int | float | long | double | date | timestamp |
| --------- | ------- | ---- | ----- | --- | ----- | ---- | ------ | ---- | --------- |
| date      | L       | L    | L     | L   | L     | X    | X      |      | X         |
| timestamp | L       | L    | L     | L   | L     | X    | X      | L    |           |

Conversions to \`SYMBOL\`, \`STRING\` and \`VARCHAR\` are supported from most of the
data types.

| From \\ To | symbol | string | varchar |
| --------- | ------ | ------ | ------- |
| boolean   | X      | X      | X       |
| byte      | X      | X      | X       |
| short     | X      | X      | X       |
| int       | X      | X      | X       |
| float     | X      | X      | X       |
| long      | X      | X      | X       |
| date      | X      | X      | X       |
| timestamp | X      | X      | X       |
| double    | X      | X      | X       |
| ipv4      | X      | X      | X       |
| char      | X      | X      | X       |
| uuid      | X      | X      | X       |
| symbol    |        | X      | X       |
| string    | X      |        | X       |
| varchar   | X      | X      |         |

However conversion from \`SYMBOL\`, \`STRING\` and \`VARCHAR\` to other types can
result in \`NULL\` values for inconvertable string values.

| From \\ To | boolean | byte | short | char | int | float | long | date | timestamp | double | uuid |
| --------- | ------- | ---- | ----- | ---- | --- | ----- | ---- | ---- | --------- | ------ | ---- |
| string    | L       | L    | L     | L    | L   | L     | L    | L    | L         | L      | L    |
| varchar   | L       | L    | L     | L    | L   | L     | L    | L    | L         | L      | L    |
| symbol    | L       | L    | L     | L    | L   | L     | L    | L    | L         | L      | L    |

When column type change results into range overflow or precision loss, the same
rules as explicit [CAST](/docs/reference/sql/cast/) apply.

## Unsupported Conversions

Converting from the type to itself is not supported.

If the column \`department\` is of type \`SYMBOL\`, then the following query will
result in error, even if the capacity parameter changes:

\`\`\`questdb-sql
ALTER TABLE employees ALTER COLUMN department TYPE SYMBOL CAPACITY 4096;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-change-symbol-capacity.md',
    title: 'ALTER TABLE SYMBOL CAPACITY',
    headers: ['Syntax', 'Notes'],
    content: `Changes the capacity of an existing SYMBOL column in a table.

The capacity of the SYMBOL column is altered without rewriting the data already
stored in the table partitions. This operation allows you to adjust the maximum
number of distinct values that can be stored in a SYMBOL column without the
overhead of rebuilding the entire table.

## Syntax

![Flow chart showing the syntax of ALTER TABLE SYMBOL CAPACITY command](/images/docs/diagrams/alterTableSymbolCapacity.svg)

## Examples

Change the capacity of the SYMBOL column \`ik\` in table \`x\` to 512:

\`\`\`questdb-sql
ALTER TABLE x ALTER COLUMN ik SYMBOL CAPACITY 512;
\`\`\`

Increase the capacity of the SYMBOL column \`department\` in the table \`employees\`
to 10000:

\`\`\`questdb-sql
ALTER TABLE employees ALTER COLUMN department SYMBOL CAPACITY 10000;
\`\`\`

## Notes

- The operation does not rewrite existing data in partitions, making it an
  efficient way to adjust SYMBOL column configurations.
- The new capacity value must be a positive integer.
- The specified capacity will be automatically rounded to the next power of two.
- If you need to both change the data type and capacity, refer to the
  [ALTER TABLE COLUMN TYPE](/docs/reference/sql/alter-table-change-column-type/)
  documentation.
`
  },
  {
    path: 'sql/alter-table-detach-partition.md',
    title: 'ALTER TABLE DETACH PARTITION',
    headers: ['Syntax', 'Limitation'],
    content: `Makes partition data unavailable for reads and prepares partition directory for
transportation. A partition detached by this SQL keyword can be "re-attached"
using the complementary SQL keyword
[ALTER TABLE ATTACH PARTITION](/docs/reference/sql/alter-table-attach-partition/).

## Syntax

![Flow chart showing the syntax of ALTER TABLE with DETACH LIST PARTITION keyword](/images/docs/diagrams/alterTableDetachPartition.svg)

## Example

To detach one or more partitions, let's assume table \`x\` with 3 partitions,
\`2019-02-01\`, \`2019-02-02\`, and \`2019-02-03\`, and designated timestamp column
named \`timestamp\`:

1. Detach two partitions using the SQL \`ALTER TABLE DETACH PARTITION\` command:

   \`\`\`questdb-sql
   ALTER TABLE x DETACH PARTITION LIST '2019-02-01', '2019-02-02';

   -- It is also possible to use WHERE clause to define the partition list:

   ALTER TABLE sensors DETACH PARTITION WHERE timestamp < '2019-02-03T00';
   \`\`\`

2. Users can move the partition, for example, to an S3 bucket:

   \`\`\`bash
   cd /var/lib/questdb/db/x/
   tar cfz - '2019-02-01.detached' | aws s3 cp -  s3://questdb-internal/blobs/20190201.tar.gz
   tar cfz - '2019-02-02.detached' | aws s3 cp -  s3://questdb-internal/blobs/20190202.tar.gz
   \`\`\`

   The table directory is nested in the root directory. The root directory is
   set by \`cairo.root\` and is set to \`db\` by default. The detached partition
   files have the suffix \`.detached\`.

## Limitation

- QuestDB does not compress partitions after detaching nor does it change
  partition format significantly. In most cases, compression will have to be
  done manually before partitions are transported to cold storage.
- The operation does not support detaching:
  - An active (the last) partition.
  - The only partition in case of non-partitioned tables.
`
  },
  {
    path: 'sql/alter-table-disable-deduplication.md',
    title: 'ALTER TABLE DEDUP DISABLE',
    headers: ['Syntax'],
    content: `Disable storage level data deduplication on inserts

## Syntax

![Flow chart showing the syntax of the ALTER TABLE DISABLE DEDUP statement](/images/docs/diagrams/disableDedup.svg)

## Example

Disable deduplication on table \`TICKER_PRICE\`:

\`\`\`sql
ALTER TABLE TICKER_PRICE DEDUP DISABLE
\`\`\`

See more example at [data deduplication](/docs/concept/deduplication#example)
page
`
  },
  {
    path: 'sql/alter-table-drop-column.md',
    title: 'ALTER TABLE DROP COLUMN',
    headers: ['Syntax'],
    content: `Deletes a column from an existing table.

Dropping columns will also attempt to remove files belonging to the column from
all partitions, thus freeing up disk space immediately. If this is not
immediately possible on Windows, the file remove operation is postponed until
files are released by all threads. The logical drop column will succeed on
Windows in presence of active readers.

:::caution

Use \`DROP COLUMN\` with care, as QuestDB **cannot recover data from dropped
columns**! [Backup your database](/docs/operations/backup/) to avoid unintended
data loss.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with DROP COLUMN keyword](/images/docs/diagrams/alterTableDropColumn.svg)

## Example

The following example deletes the column called \`comment\` from the table
\`ratings\`

\`\`\`questdb-sql title="Dropping a column"
ALTER TABLE ratings DROP COLUMN movieId;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-drop-partition.md',
    title: 'ALTER TABLE DROP PARTITION',
    headers: ['Syntax', 'Drop partition by name', 'Drop partitions using boolean expression'],
    content: `Drops one or more partitions from an existing table.

Similar to dropping columns, dropping of partitions is a non-blocking and
non-waiting operation. While atomic for single partitions, dropping multiple
partitions is in itself non-atomic. The operation will exit on the first failure
and will not continue through a list of partitions if one fails to be dropped.

:::caution

Use \`DROP PARTITION\` with care, as QuestDB **cannot recover data from dropped
partitions**! [Backup your database](/docs/operations/backup/) to avoid
unintended data loss.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of ALTER TABLE with DROP PARTITION keyword](/images/docs/diagrams/alterTableDropPartition.svg)

## Drop partition by name

The partition name must match the name of the directory for the given partition.
The naming convention is detailed in [Partitions](/docs/concept/partitions/).

### Examples

\`\`\`questdb-sql title="Drop a single partition"
--DAY
ALTER TABLE measurements DROP PARTITION LIST '2019-05-18';
--MONTH
ALTER TABLE measurements DROP PARTITION LIST '2019-05';
--YEAR
ALTER TABLE measurements DROP PARTITION LIST '2019';
\`\`\`

\`\`\`questdb-sql title="Drop multiple partitions"
ALTER TABLE measurements DROP PARTITION LIST '2018','2019';
\`\`\`

## Drop partitions using boolean expression

Drops partitions based on a boolean expression on the designated timestamp
column.

### Examples

\`\`\`questdb-sql title="Drop one partition"
ALTER TABLE measurements
DROP PARTITION
WHERE timestamp = to_timestamp('2019-01-01:00:00:00', 'yyyy-MM-dd:HH:mm:ss');
\`\`\`

\`\`\`questdb-sql title="Drop all partitions older than 2018"
ALTER TABLE measurements
DROP PARTITION
WHERE timestamp < to_timestamp('2018-01-01:00:00:00', 'yyyy-MM-dd:HH:mm:ss');
\`\`\`
`
  },
  {
    path: 'sql/alter-table-enable-deduplication.md',
    title: 'ALTER TABLE DEDUP ENABLE',
    headers: ['Syntax', 'See also'],
    content: `Enable storage level data deduplication on inserts and configures \`UPSERT KEYS\`.

:::note

- Deduplication can only be enabled for
  [Write-Ahead Log (WAL)](/docs/concept/write-ahead-log) tables.
- Enabling deduplication does not have any effect on the existing data and only
  applies to newly inserted data. This means that a table with deduplication
  enabled can still contain duplicate data.
- Enabling deduplication does not have any effect on modifying data with
  \`UPDATE\` statements.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE DEDUP ENABLE statement](/images/docs/diagrams/enableDedup.svg)

\`UPSERT KEYS\` list can include one or more columns. The [designated timestamp](/docs/concept/designated-timestamp) column must be
  included in the \`UPSERT KEYS\` list.

Running \`ALTER TABLE DEDUP ENABLE\` on a table that already has deduplication
enabled is not an error.

In such cases, the \`UPSERT KEYS\` list overrides the previously set key column
list.

## Example

To enable deduplication on the \`TICKER_PRICE\` table for the \`ts\` and \`ticker\`
columns, where \`ts\` is the designated timestamp for the table, use the following
command:

\`\`\`sql
ALTER TABLE TICKER_PRICE DEDUP ENABLE UPSERT KEYS(ts, ticker)
\`\`\`

See more example at [data deduplication](/docs/concept/deduplication#example)
page

## See also

[ALTER TABLE DEDUP DISABLE](/docs/reference/sql/alter-table-disable-deduplication)
`
  },
  {
    path: 'sql/alter-table-rename-column.md',
    title: 'ALTER TABLE RENAME COLUMN',
    headers: ['Syntax'],
    content: `Rename a column in an existing table.

:::caution

- New column names may only consist of letters, numbers and underscores \`_\`

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of the ALTER TABLE RENAME COLUMN keywords](/images/docs/diagrams/alterTableRenameColumn.svg)

## Example

The following example renames an existing column called \`sensor\` to
\`hum_sensor_1\` from the table \`measurements\`:

\`\`\`questdb-sql title="Renaming a column"
ALTER TABLE measurements RENAME COLUMN sensor TO hum_sensor_1;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-resume-wal.md',
    title: 'ALTER TABLE RESUME WAL',
    headers: ['Syntax', 'Description', 'Diagnosing corrupted WAL transactions'],
    content: `Restarts transactions of a [WAL table](/docs/concept/write-ahead-log/) after
recovery from errors.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of ALTER TABLE with RESUME WAL keyword](/images/docs/diagrams/alterTableResumeWal.svg)

## Description

\`sequencerTxn\` is the unique \`txn\` identification that the Sequencer issues to
transactions.

When \`sequencerTxn\` is not specified, the operation resumes the WAL apply job
from the next uncommitted transaction, including the failed one.

When \`sequencerTxn\` is specified, the operation resumes the WAL apply job
from the provided \`sequencerTxn\` number explicitly.

\`ALTER TABLE RESUME WAL\` is used to restart WAL table transactions after
resolving errors. When transactions are stopped, the \`suspended\` status from the
[\`wal_tables()\`](/docs/reference/function/meta/#wal_tables) function is marked
as \`true\`, and the \`sequencerTxn\` value indicates the last successful commit in
the Sequencer. Once the error is resolved, \`ALTER TABLE RESUME WAL\` restarts the
suspended WAL transactions from the failed transaction. Alternatively, an
optional \`sequencerTxn\` value can be provided to skip the failed transaction.

## Examples

Using the [\`wal_tables()\`](/docs/reference/function/meta/#wal_tables) function
to investigate the table status:

\`\`\`questdb-sql title="List all tables"
wal_tables();
\`\`\`

| name   | suspended | writerTxn | sequencerTxn |
| ------ | --------- | --------- | ------------ |
| trades | true      | 3         | 5            |

The table \`trades\` is suspended. The last successful commit in the table is
\`3\`.

The following query restarts transactions from the failed transaction, \`4\`:

\`\`\`questdb-sql
ALTER TABLE trades RESUME WAL;
\`\`\`

Alternatively, specifying the \`sequencerTxn\` to skip the failed commit (\`4\` in
this case):

\`\`\`questdb-sql
ALTER TABLE trades RESUME WAL FROM TRANSACTION 5;

-- This is equivalent to

ALTER TABLE trades RESUME WAL FROM TXN 5;
\`\`\`

## Diagnosing corrupted WAL transactions

:::note

If you have [data deduplication](/concept/deduplication/) enabled on your tables and you have access to the original events (for instance, they're stored in Apache Kafka, or other replayable source), you may reingest the data after skipping the problematic transactions.

:::

Sometimes a table may get suspended due to full disk or [kernel limits](/docs/operations/capacity-planning/#os-configuration). In this case, an entire WAL segment may be corrupted. This means that there will be multiple transactions that rely on the corrupted segment, and finding the transaction number to resume from may be difficult.

When you run RESUME WAL on such suspended table, you may see an error like this:

\`\`\`
2024-07-10T01:01:01.131720Z C i.q.c.w.ApplyWal2TableJob job failed, table suspended [table=trades~3, error=could not open read-only [file=/home/my_user/.questdb/db/trades~3/wal45/101/_event], errno=2]
\`\`\`

In such a case, you should try skipping all transactions that rely on the corrupted WAL segment. To do that, first you need to find the last applied transaction number for the \`trades\` table:

\`\`\`questdb-sql
SELECT writerTxn
FROM wal_tables()
WHERE name = 'trades';
\`\`\`

| writerTxn |
| --------- |
| 1223      |

Next, query the problematic transaction number:

\`\`\`questdb-sql
SELECT max(sequencertxn)
FROM wal_transactions('trades')
WHERE sequencertxn > 1223
  AND walId = 45
  AND segmentId = 101;
\`\`\`

Here, \`1223\` stands for the last applied transaction number, \`45\` stands for the WAL ID that may be seen in the error log above (\`trades~3/wal45\`), and \`101\` stands for the WAL segment ID from the log (\`trades~3/wal45/101\`).

| max  |
| ---- |
| 1242 |

Since the last problematic transaction is \`1242\`, you can resume the table from transaction \`1243\`:

\`\`\`questdb-sql
ALTER TABLE trades RESUME WAL FROM TXN 1243;
\`\`\`

Note that in rare cases, subsequent transactions may also have corrupted WAL segments, so you may have to repeat this process.
`
  },
  {
    path: 'sql/alter-table-set-param.md',
    title: 'ALTER TABLE SET PARAM',
    headers: ['Syntax', 'Syntax'],
    content: `\`ALTER TABLE SET PARAM\` sets table parameters via SQL.

:::note

- Checking table metadata can be done via the \`tables()\` and \`table_columns()\`
  functions, as described in the
  [meta functions](/docs/reference/function/meta/) documentation page.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of the ALTER TABLE SET PARA keywords](/images/docs/diagrams/alterTableSetParam.svg)

\`maxUncommittedRows\` - defines the maximum number of uncommitted rows per-table
to keep in memory before triggering a commit for a specific table.

The purpose of specifying maximum uncommitted rows per table is to reduce the
occurrences of resource-intensive commits when ingesting out-of-order data.

The global setting for the same parameter is \`cairo.max.uncommitted.rows\`.

## Example

The values for \`maximum uncommitted rows\` can be changed per each table with the
following SQL:

\`\`\`questdb-sql title="Altering out-of-order parameters via SQL"
ALTER TABLE my_table SET PARAM maxUncommittedRows = 10000
\`\`\`

Checking the values per-table may be done using the \`tables()\` function:

\`\`\`questdb-sql title="List table metadata"
SELECT id, name, maxUncommittedRows FROM tables();
\`\`\`

| id  | name     | maxUncommittedRows |
| --- | -------- | ------------------ |
| 1   | my_table | 10000              |

For more details on retrieving table and column information, see the
[meta functions documentation](/docs/reference/function/meta/).

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of the ALTER TABLE SET PARA with commit lag keywords](/images/docs/diagrams/alterTableSetParamCommitLag.svg)

\`o3MaxLag\` allows for specifying the expected maximum _lag_ of late-arriving
records when ingesting out-of-order data. The purpose of specifying a commit lag
per table is to reduce the occurrences of resource-intensive commits when
ingesting out-of-order data. Incoming records will be kept in memory until for
the duration specified in _lag_, then all records up to the boundary will be
ordered and committed.

\`o3MaxLag\` expects a value with a modifier to specify the unit of time for the
value:

| unit | description  |
| ---- | ------------ |
| us   | microseconds |
| s    | seconds      |
| m    | minutes      |
| h    | hours        |
| d    | days         |

To specify \`o3MaxLag\` value to 20 seconds:

\`\`\`questdb-sql
ALTER TABLE my_table SET PARAM o3MaxLag = 20s;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-set-ttl.md',
    title: 'ALTER TABLE SET TTL',
    headers: ['Syntax', 'Description'],
    content: `Sets the time-to-live (TTL) period on a table.

Refer to the [section on TTL](/docs/concept/ttl/) for a conceptual overview.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with SET TTL keyword](/images/docs/diagrams/setTtl.svg)

## Description

To store and analyze only recent data, configure a time-to-live (TTL) period on
a table using the \`ALTER TABLE SET TTL\` command.

Follow the \`TTL\` keyword with a number and a time unit, one of:

- \`HOURS\`
- \`DAYS\`
- \`WEEKS\`
- \`MONTHS\`
- \`YEARS\`

TTL units fall into two categories:

1. Fixed time periods:
   - \`HOURS\`
   - \`DAYS\`
   - \`WEEKS\`
2. Calendar-based periods:
   - \`MONTHS\`
   - \`YEARS\`

Fixed-time periods are always exact durations: \`1 WEEK\` is always 7 days.

Calendar-based periods may vary in length: \`1 MONTH\` from January 15th goes to
February 15th and could be between 28 and 31 days.

QuestDB accepts both singular and plural forms:

- \`HOUR\` or \`HOURS\`
- \`DAY\` or \`DAYS\`
- \`WEEK\` or \`WEEKS\`
- \`MONTH\` or \`MONTHS\`
- \`YEAR\` or \`YEARS\`

It also supports shorthand notation: \`3h\` for 3 hours, \`2M\` for 2 months.

:::note

QuestDB drops data that exceeded its TTL only a whole partition at a time. For
this reason, the TTL period must be a whole number multiple of the table's
partition size.

For example:

- If a table is partitioned by \`DAY\`, the TTL must be a whole number of days
  (\`24 HOURS\`, \`2 DAYS\` and \`3 MONTHS\` are all accepted)
- If a table is partitioned by \`MONTH\`, the TTL must be in months or years.
  QuestDB won't accept the \`HOUR\`, \`DAY\`, or \`WEEK\` units

Refer to the [section on TTL in Concepts](/docs/concept/ttl/) for detailed
information on the behavior of this feature.

:::

## Examples

Set the TTL to 3 weeks:

\`\`\`sql
ALTER TABLE weather SET TTL 3 WEEKS;
\`\`\`

Set the TTL to 12 hours, using the shorthand syntax for the time unit:

\`\`\`sql
ALTER TABLE weather SET TTL 12h;
\`\`\`
`
  },
  {
    path: 'sql/alter-table-set-type.md',
    title: 'ALTER TABLE SET TYPE',
    headers: ['Syntax', 'Description'],
    content: `Converts a non-WAL table to WAL, or a WAL table to non-WAL.

:::info

**Upgrading QuestDB?**

Apply table conversions separately from the version upgrade.

If upgrading, match the following sequence:

1. Convert/\`ALTER\` tables
2. Restart
3. Upgrade
4. Restart

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with SET TYPE keyword](/images/docs/diagrams/setType.svg)

## Description

The command schedules the conversion of the specified table to WAL or non-WAL
type. The actual conversion takes place on the next restart of the server.

If the command issued more than once before the restart, the last command
overrides all previous ones.

If the target type of the conversion is the same as the current type of the
table, the conversion request is ignored.

## Examples

To convert a non-WAL table to WAL:

\`\`\`sql
ALTER TABLE weather SET TYPE WAL;
-- now restart instance
\`\`\`

To convert a WAL table to non-WAL:

\`\`\`sql
ALTER TABLE weather SET TYPE BYPASS WAL;
-- now restart instance
\`\`\`
`
  },
  {
    path: 'sql/alter-table-squash-partitions.md',
    title: 'ALTER TABLE SQUASH PARTITIONS',
    headers: ['Syntax'],
    content: `Merges partition parts back into the physical partition.

This SQL keyword is designed to use for downgrading QuestDB to a version earlier
than 7.2, when
[partition split](/docs/concept/partitions/#splitting-and-squashing-time-partitions)
is introduced. Squashing partition parts makes the database compatible with
earlier QuestDB versions.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with SQUASH PARTITIONS keyword](/images/docs/diagrams/alterTableSquashPartitions.svg)

## Examples

The SQL keyword [SHOW PARTITIONS](/docs/reference/sql/show/) can be used to
display partition split details.

For example, Let's consider the following table \`x\` containing split partitions:

\`\`\`
SHOW PARTITIONS FROM x;
\`\`\`

| index | partitionBy | name                     | minTimestamp                | maxTimestamp                | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | ------------------------ | --------------------------- | --------------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | DAY         | 2023-02-04               | 2023-02-04T00:00:00.000000Z | 2023-02-04T23:59:59.940000Z | 1440000 | 71281136 | 68.0 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 1     | DAY         | 2023-02-05               | 2023-02-05T00:00:00.000000Z | 2023-02-05T20:59:59.880000Z | 1259999 | 65388544 | 62.4 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 2     | DAY         | 2023-02-05T205959-880001 | 2023-02-05T20:59:59.940000Z | 2023-02-05T21:59:59.940000Z | 60002   | 83886080 | 80.0 MiB      | FALSE    | TRUE   | TRUE     | FALSE    | FALSE      |

The table is partition by day and there are two partitions for \`2023-02-05\` as a
result of partition split.

To merge the two partitions:

\`\`\`questdb-sql
ALTER TABLE x SQUASH PARTITIONS;

SHOW PARTITIONS FROM x;
\`\`\`

| index | partitionBy | name       | minTimestamp                | maxTimestamp                | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | ---------- | --------------------------- | --------------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | DAY         | 2023-02-04 | 2023-02-04T00:00:00.000000Z | 2023-02-04T23:59:59.940000Z | 1440000 | 71281136 | 68.0 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 1     | DAY         | 2023-02-05 | 2023-02-05T00:00:00.000000Z | 2023-02-05T21:59:59.940000Z | 1320001 | 65388544 | 62.4 MiB      | FALSE    | TRUE   | TRUE     | FALSE    | FALSE      |
`
  },
  {
    path: 'sql/asof-join.md',
    title: 'ASOF JOIN keyword',
    headers: ['JOIN overview', 'ASOF JOIN', 'SPLICE JOIN'],
    content: `ASOF JOIN is a powerful SQL keyword that allows you to join two time-series
tables.

It is a variant of the [\`JOIN\` keyword](/docs/reference/sql/join/) and shares
many of its execution traits.

This document will demonstrate how to utilize them, and link to other relevant
JOIN context.

## JOIN overview

The JOIN operation is broken into three components:

- Select clause
- Join clause
- Where clause

This document will demonstrate the JOIN clause, where the other keywords
demonstrate their respective clauses.

Visualized, a JOIN operation looks like this:

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/images/docs/diagrams/joinOverview.svg)

- \`selectClause\` - see the [SELECT](/docs/reference/sql/select/) reference docs
  for more information.

- \`joinClause\` \`ASOF JOIN\` with an optional \`ON\` clause which allows only the
  \`=\` predicate and an optional \`TOLERANCE\` clause:

  ![Flow chart showing the syntax of the ASOF, LT, and SPLICE JOIN keyword](/images/docs/diagrams/AsofJoin.svg)

- \`whereClause\` - see the [WHERE](/docs/reference/sql/where/) reference docs for
  more information.

In addition, the following are items of importance:

- Columns from joined tables are combined in a single row.

- Columns with the same name originating from different tables will be
  automatically aliased into a unique column namespace of the result set.

- Though it is usually preferable to explicitly specify join conditions, QuestDB
  will analyze \`WHERE\` clauses for implicit join conditions and will derive
  transient join conditions where necessary.

### Execution order

Join operations are performed in order of their appearance in a SQL query.

Read more about execution order in the
[JOIN reference documentation](/docs/reference/sql/join/).

## ASOF JOIN

\`ASOF JOIN\` joins two time-series on their timestamp, using the following
logic: for each row in the first time-series,

1. consider all timestamps in the second time-series **earlier or equal to**
the first one
2. choose **the latest** such timestamp
3. If the optional \`TOLERANCE\` clause is specified, an additional condition applies: 
   the chosen record from t2 must satisfy \`t1.ts - t2.ts <= tolerance_value\`. If no record
   from t2 meets this condition (along with \`t2.ts <= t1.ts\`), then the row from t1 will not have a match.

### Example

Let's use an example with two tables:

- \`trades\`: trade events on a single stock
- \`order_book\`: level-1 order book snapshots for that stock

\`trades\` data:

<div className="blue-table">

|    timestamp    |  price | size |
| --------------- | ------ | ---- |
| 08:00:00.007140 | 175.97 |  400 |
| 08:00:00.609618 | 178.55 |  400 |
| 08:00:00.672131 | 176.09 |  400 |
| 08:00:00.672147 | 176.03 |  400 |
| 08:00:01.146931 | 175.45 |  400 |
| 08:00:01.495188 | 177.90 |  400 |
| 08:00:01.991977 | 175.35 |  400 |
| 08:00:01.991991 | 175.36 |  400 |
| 08:00:02.039451 | 175.36 |  400 |
| 08:00:02.836413 | 175.55 |  400 |
| 08:00:03.447858 | 176.79 |  400 |
| 08:00:04.782191 | 181.00 |   15 |
| 08:00:05.408871 | 175.77 |  400 |
| 08:00:06.007145 | 176.52 |  400 |
| 08:00:06.740159 | 184.00 |    1 |
| 08:00:07.593841 | 175.75 |  400 |
| 08:00:10.310291 | 176.38 |   29 |
| 08:00:10.550535 | 175.86 |  400 |
| 08:00:10.761790 | 175.94 |  400 |
| 08:00:12.046660 | 176.15 |  400 |
| 08:00:12.897624 | 176.62 |  400 |
| 08:00:13.838193 | 176.51 |   25 |
| 08:00:15.125509 | 176.17 |  400 |
| 08:00:16.727077 | 176.48 |  400 |
| 08:00:18.813886 | 176.68 |  400 |
| 08:00:22.180535 | 176.05 |  400 |
| 08:00:25.125634 | 176.16 |  400 |
| 08:00:26.117889 | 176.33 |    1 |
| 08:00:26.184839 | 176.52 |  400 |
| 08:00:26.185102 | 176.41 |   25 |

</div>

\`order_book\` data:

<div className="pink-table">

| timestamp | bid_price | bid_size | ask_price | ask_size |
| --------- | --------- | -------- | --------- | -------- |
| 08:00:00  |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:01  |    176.33 |     4744 |    176.6  |     8404 |
| 08:00:02  |    176.07 |      136 |    176.76 |     4946 |
| 08:00:03  |    176.07 |       84 |    176.75 |     2182 |
| 08:00:04  |    176.07 |      112 |    176.59 |     2734 |
| 08:00:05  |    176.38 |      212 |    176.5  |     6966 |
| 08:00:06  |    176.33 |      176 |    176.52 |     8174 |
| 08:00:07  |    176.33 |      276 |    176.67 |     7345 |
| 08:00:08  |    176.33 |       48 |    176.67 |     1600 |
| 08:00:09  |    176.35 |       66 |    176.67 |     2400 |
| 08:00:10  |    176.36 |      695 |    176.38 |    20698 |
| 08:00:11  |    176.35 |       98 |    176.59 |     2800 |
| 08:00:12  |    176.48 |      104 |    176.59 |     4040 |
| 08:00:13  |    176.48 |      165 |    176.38 |     6035 |
| 08:00:14  |    176.35 |       56 |    176.38 |      720 |
| 08:00:15  |    176.35 |      119 |    176.38 |     1530 |
| 08:00:16  |    176.35 |      133 |    176.38 |     3710 |
| 08:00:18  |    176.35 |       84 |    176.38 |     1880 |
| 08:00:19  |    176.35 |       14 |    176.38 |      180 |
| 08:00:20  |    176.35 |       14 |    176.38 |      180 |
| 08:00:21  |    176.35 |      112 |    176.38 |     1440 |
| 08:00:22  |    176.35 |      133 |    176.38 |     1710 |
| 08:00:25  |    176.35 |      122 |    176.38 |     3929 |
| 08:00:26  |    176.35 |      300 |    176.37 |     6952 |
| 08:00:28  |    176.07 |       28 |    176.37 |      496 |

</div>

We want to join each trade event to the relevant order book snapshot. All
we have to write is

\`\`\`questdb-sql title="A basic ASOF JOIN example"
trades ASOF JOIN order_book
\`\`\`

and we get this result:

<div className="table-alternate">

|     timestamp   |  price | size | timestamp1 | bid_price | bid_size | ask_price | ask_size |
| --------------- | ------ | ---- | ---------- | --------- | -------- | --------- | -------- |
| 08:00:00.007140 | 175.97 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.609618 | 178.55 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.672131 | 176.09 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.672147 | 176.03 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:01.146931 | 175.45 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.495188 | 177.90 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.991977 | 175.35 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.991991 | 175.36 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:02.039451 | 175.36 |  400 |   08:00:02 |    176.07 |      136 |    176.76 |     4946 |
| 08:00:02.836413 | 175.55 |  400 |   08:00:02 |    176.07 |      136 |    176.76 |     4946 |
| 08:00:03.447858 | 176.79 |  400 |   08:00:03 |    176.07 |       84 |    176.75 |     2182 |
| 08:00:04.782191 | 181.00 |   15 |   08:00:04 |    176.07 |      112 |    176.59 |     2734 |
| 08:00:05.408871 | 175.77 |  400 |   08:00:05 |    176.38 |      212 |    176.50 |     6966 |
| 08:00:06.007145 | 176.52 |  400 |   08:00:06 |    176.33 |      176 |    176.52 |     8174 |
| 08:00:06.740159 | 184.00 |    1 |   08:00:06 |    176.33 |      176 |    176.52 |     8174 |
| 08:00:07.593841 | 175.75 |  400 |   08:00:07 |    176.33 |      276 |    176.67 |     7345 |
| 08:00:10.310291 | 176.38 |   29 |   08:00:10 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:10.550535 | 175.86 |  400 |   08:00:10 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:10.761790 | 175.94 |  400 |   08:00:10 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:12.046660 | 176.15 |  400 |   08:00:12 |    176.48 |      104 |    176.59 |     4040 |
| 08:00:12.897624 | 176.62 |  400 |   08:00:12 |    176.48 |      104 |    176.59 |     4040 |
| 08:00:13.838193 | 176.51 |   25 |   08:00:13 |    176.48 |      165 |    176.38 |     6035 |
| 08:00:15.125509 | 176.17 |  400 |   08:00:15 |    176.35 |      119 |    176.38 |     1530 |
| 08:00:16.727077 | 176.48 |  400 |   08:00:16 |    176.35 |      133 |    176.38 |     3710 |
| 08:00:18.813886 | 176.68 |  400 |   08:00:18 |    176.35 |       84 |    176.38 |     1880 |
| 08:00:22.180535 | 176.05 |  400 |   08:00:22 |    176.35 |      133 |    176.38 |     1710 |
| 08:00:25.125634 | 176.16 |  400 |   08:00:25 |    176.35 |      122 |    176.38 |     3929 |
| 08:00:26.117889 | 176.33 |    1 |   08:00:26 |    176.35 |      300 |    176.37 |     6952 |
| 08:00:26.184839 | 176.52 |  400 |   08:00:26 |    176.35 |      300 |    176.37 |     6952 |
| 08:00:26.185102 | 176.41 |   25 |   08:00:26 |    176.35 |      300 |    176.37 |     6952 |

</div>

### Using \`ON\` for matching column value

The tables in the above example are just about one stock; in reality the same
table covers many stocks, and you want the results not to get mixed between
them. This is what the \`ON\` clause is for -- you can point out the key (ticker)
column and get results separate for each key.

Here's the trades table expanded to include two stocks, and a new \`symbol\` column:

<div className="pink-table">

|    timestamp    | symbol |  price | size |
| --------------- | ------ | ------ | ---- |
| 08:00:00.007168 |   AAPL | 176.91 |  400 |
| 08:00:00.834205 |   AAPL | 175.93 |  400 |
| 08:00:00.988111 |   AAPL | 176.47 |  100 |
| 08:00:01.199577 |   AAPL | 175.46 |  400 |
| 08:00:01.495172 |   AAPL | 177.95 |  400 |
| 08:00:01.538683 |   GOOG | 175.82 |  400 |
| 08:00:01.555565 |   AAPL | 176.33 |   25 |
| 08:00:02.006636 |   GOOG |  150.0 |   10 |
| 08:00:02.039451 |   AAPL | 175.36 |  400 |
| 08:00:02.460454 |   GOOG | 175.45 |  400 |
| 08:00:03.012909 |   GOOG |  175.5 |    1 |
| 08:00:03.494927 |   GOOG |  185.0 |    5 |
| 08:00:03.524212 |   AAPL | 175.48 |  400 |
| 08:00:04.648333 |   AAPL | 175.66 |  400 |
| 08:00:04.943421 |   GOOG | 175.48 |  400 |
| 08:00:05.884890 |   AAPL | 176.54 |   28 |
| 08:00:05.961856 |   GOOG | 175.66 |  400 |
| 08:00:06.589806 |   GOOG | 175.65 |  400 |
| 08:00:06.740159 |   AAPL |  184.0 |    1 |
| 08:00:07.342978 |   GOOG | 176.55 |  400 |
| 08:00:07.345877 |   AAPL | 176.73 |  400 |
| 08:00:10.419065 |   AAPL | 176.41 |  400 |
| 08:00:11.636237 |   AAPL | 176.69 |  400 |
| 08:00:11.683078 |   GOOG | 176.67 |  400 |
| 08:00:13.650868 |   AAPL | 176.52 |  124 |
| 08:00:13.650880 |   AAPL | 176.59 |  124 |
| 08:00:14.055762 |   AAPL | 176.66 |  400 |
| 08:00:14.083022 |   GOOG | 176.81 |  400 |
| 08:00:15.088091 |   GOOG | 176.52 |  400 |
| 08:00:15.125494 |   AAPL | 176.12 |  400 |
| 08:00:15.147691 |   GOOG | 176.54 |  400 |

</div>

Order book, similarly extended with the \`symbol\` column:

<div className="blue-table">

| timestamp | symbol | bid_price | bid_size | ask_price | ask_size |
| --------- | ------ | --------- | -------- | --------- | -------- |
|  08:00:00 |   AAPL |    176.47 |     5542 |    176.82 |    13054 |
|  08:00:01 |   GOOG |    130.32 |     7516 |    130.9  |    25652 |
|  08:00:01 |   AAPL |    176.33 |     4744 |    176.6  |     8404 |
|  08:00:02 |   GOOG |    130.59 |     9046 |    130.68 |     9264 |
|  08:00:02 |   AAPL |    176.07 |      136 |    176.76 |     4946 |
|  08:00:03 |   GOOG |    130.34 |     4086 |    130.82 |    12676 |
|  08:00:03 |   AAPL |    176.07 |       84 |    176.75 |     2182 |
|  08:00:04 |   GOOG |    130.29 |      350 |    130.79 |     8780 |
|  08:00:04 |   AAPL |    176.07 |      112 |    176.59 |     2734 |
|  08:00:05 |   GOOG |    130.29 |      182 |    130.68 |     6060 |
|  08:00:05 |   AAPL |    176.38 |      212 |    176.5  |     6966 |
|  08:00:06 |   GOOG |    130.48 |      394 |    130.65 |     6828 |
|  08:00:06 |   AAPL |    176.33 |      176 |    176.52 |     8174 |
|  08:00:07 |   GOOG |    130.52 |      366 |    130.61 |    21260 |
|  08:00:07 |   AAPL |    176.33 |      276 |    176.67 |     7345 |
|  08:00:08 |   GOOG |    130.48 |      480 |    130.76 |    13032 |
|  08:00:08 |   AAPL |    176.33 |       48 |    176.67 |     1600 |
|  08:00:09 |   GOOG |    130.48 |      216 |    130.74 |     6458 |
|  08:00:09 |   AAPL |    176.35 |       66 |    176.67 |     2400 |
|  08:00:10 |   GOOG |    130.48 |       72 |    130.74 |     2400 |
|  08:00:10 |   AAPL |    176.36 |      695 |    176.38 |    20698 |
|  08:00:11 |   GOOG |    130.51 |     1236 |    130.52 |    26596 |
|  08:00:11 |   AAPL |    176.35 |       98 |    176.59 |     2800 |
|  08:00:12 |   GOOG |    130.5 |       378 |    130.68 |    22000 |
|  08:00:12 |   AAPL |    176.48 |      104 |    176.59 |     4040 |
|  08:00:13 |   GOOG |    130.6 |       174 |    130.68 |     5200 |
|  08:00:13 |   AAPL |    176.48 |      165 |    176.38 |     6035 |
|  08:00:14 |   GOOG |    130.6 |       138 |    130.62 |     8616 |
|  08:00:14 |   AAPL |    176.35 |       56 |    176.38 |      720 |
|  08:00:15 |   GOOG |    130.6 |       394 |    130.52 |     9374 |

</div>

And here's the ASOF JOIN query with the \`ON\` clause added:

\`\`\`questdb-sql title="ASOF JOIN with symbol matching" demo
SELECT t.timestamp, t.symbol, price, size, bid_price, bid_size, ask_price, ask_size
FROM trades t ASOF JOIN order_book ON (symbol);
\`\`\`

Result:

<div className="table-alternate">

|    timestamp    | symbol |  price | size | bid_price | bid_size | ask_price | ask_size |
| --------------- | ------ | ------ | ---- | --------- | -------- | --------- | -------- |
| 08:00:00.007168 |   AAPL | 176.91 |  400 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.834205 |   AAPL | 175.93 |  400 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.988111 |   AAPL | 176.47 |  100 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:01.199577 |   AAPL | 175.46 |  400 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.495172 |   AAPL | 177.95 |  400 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.538683 |   GOOG | 175.82 |  400 |    130.32 |     7516 |    130.90 |    25652 |
| 08:00:01.555565 |   AAPL | 176.33 |   25 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:02.006636 |   GOOG | 150.00 |   10 |    130.59 |     9046 |    130.68 |     9264 |
| 08:00:02.039451 |   AAPL | 175.36 |  400 |    176.07 |      136 |    176.76 |     4946 |
| 08:00:02.460454 |   GOOG | 175.45 |  400 |    130.59 |     9046 |    130.68 |     9264 |
| 08:00:03.012909 |   GOOG | 175.50 |    1 |    130.34 |     4086 |    130.82 |    12676 |
| 08:00:03.494927 |   GOOG | 185.00 |    5 |    130.34 |     4086 |    130.82 |    12676 |
| 08:00:03.524212 |   AAPL | 175.48 |  400 |    176.07 |       84 |    176.75 |     2182 |
| 08:00:04.648333 |   AAPL | 175.66 |  400 |    176.07 |      112 |    176.59 |     2734 |
| 08:00:04.943421 |   GOOG | 175.48 |  400 |    130.29 |      350 |    130.79 |     8780 |
| 08:00:05.884890 |   AAPL | 176.54 |   28 |    176.38 |      212 |    176.50 |     6966 |
| 08:00:05.961856 |   GOOG | 175.66 |  400 |    130.29 |      182 |    130.68 |     6060 |
| 08:00:06.589806 |   GOOG | 175.65 |  400 |    130.48 |      394 |    130.65 |     6828 |
| 08:00:06.740159 |   AAPL | 184.00 |    1 |    176.33 |      176 |    176.52 |     8174 |
| 08:00:07.342978 |   GOOG | 176.55 |  400 |    130.52 |      366 |    130.61 |    21260 |
| 08:00:07.345877 |   AAPL | 176.73 |  400 |    176.33 |      276 |    176.67 |     7345 |
| 08:00:10.419065 |   AAPL | 176.41 |  400 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:11.636237 |   AAPL | 176.69 |  400 |    176.35 |       98 |    176.59 |     2800 |
| 08:00:11.683078 |   GOOG | 176.67 |  400 |    130.51 |     1236 |    130.52 |    26596 |
| 08:00:13.650868 |   AAPL | 176.52 |  124 |    176.48 |      165 |    176.38 |     6035 |
| 08:00:13.650880 |   AAPL | 176.59 |  124 |    176.48 |      165 |    176.38 |     6035 |
| 08:00:14.055762 |   AAPL | 176.66 |  400 |    176.35 |       56 |    176.38 |      720 |
| 08:00:14.083022 |   GOOG | 176.81 |  400 |    130.60 |      138 |    130.62 |     8616 |
| 08:00:15.088091 |   GOOG | 176.52 |  400 |    130.60 |      394 |    130.52 |     9374 |
| 08:00:15.125494 |   AAPL | 176.12 |  400 |    176.35 |       56 |    176.38 |      720 |
| 08:00:15.147691 |   GOOG | 176.54 |  400 |    130.60 |      394 |    130.52 |     9374 |

</div>

### How ASOF JOIN uses timestamps

\`ASOF JOIN\` requires tables or subqueries to be ordered by time. The best way to meet this requirement is to use a
[designated timestamp](/docs/concept/designated-timestamp/), which is set when you create a table. 
This not only enforces the chronological order of your data but also tells QuestDB which column to use for time-series
operations automatically.

#### Default behavior

By default, an \`ASOF JOIN\` will always use the designated timestamp of the tables involved.

This behavior is so fundamental that it extends to subqueries in a unique way: even if you do not explicitly SELECT the
designated timestamp column in a subquery, QuestDB implicitly propagates it. The join is performed correctly under the
hood using this hidden timestamp, which is then omitted from the final result set.

This makes most \`ASOF JOIN\` queries simple and intuitive.

\`\`\`questdb-sql title="ASOF JOIN with designated timestamp"
-- The 'trades' table has 'trade_ts' as its designated timestamp.
-- Even though 'trade_ts' is not selected in the subquery,
-- it is used implicitly for the ASOF JOIN.
WITH trades_subset AS (
  SELECT symbol, price, amount FROM trades
)
SELECT *
FROM trades_subset ASOF JOIN quotes ON (symbol);
\`\`\`

In more complicated subqueries, the implicit propagation of the designated timestamp may not work QuestDB responses with an error
\`left side of time series join has no timestamp\`. In such cases, your subquery should explicitly include the designated
timestamp column in the \`SELECT\` clause to ensure it is used for the join.

#### The standard override method: Using ORDER BY

The easiest and safest way to join on a different timestamp column is to use an \`ORDER BY ... ASC\` clause in your subquery.

When you sort a subquery by a \`TIMESTAMP\` column, QuestDB makes that column the new designated timestamp for the subquery's results. The subsequent \`ASOF JOIN\` will automatically detect and use this new timestamp.

Example: Joining on \`ingestion_time\` instead of the default \`trade_ts\`

\`\`\`questdb-sql title="ASOF JOIN with custom timestamp"
WITH trades_ordered_by_ingestion AS (
  SELECT symbol, price, ingestion_time
  FROM trades
  WHERE symbol = 'QDB'
  -- This ORDER BY clause tells QuestDB to use 'ingestion_time'
  -- as the new designated timestamp for this subquery.
  ORDER BY ingestion_time ASC
)
-- No extra syntax is needed here. The ASOF JOIN automatically uses
-- the new designated timestamp from the subquery.
SELECT *
FROM trades_ordered_by_ingestion
ASOF JOIN quotes ON (symbol);
\`\`\`

#### Using the timestamp() syntax

The \`timestamp()\` syntax is an expert-level hint for the query engine. It should only be used to manually assign a
timestamp to a dataset that does not have one, without forcing a sort.

You should only use this when you can guarantee that your data is already sorted by that timestamp column. Using
\`timestamp()\` incorrectly on unsorted data will lead to incorrect join results.

The primary use case is performance optimization on a table that has no designated timestamp in its schema, but where
you know the data is physically stored in chronological order. Using the \`timestamp()\` hint avoids a costly ORDER BY
operation.

\`\`\`questdb-sql title="ASOF JOIN with timestamp()"
-- Use this ONLY IF 'my_unsorted_table' has NO designated timestamp,
-- but you can guarantee its data is already physically ordered by 'event_time'.

SELECT *
FROM (my_unsorted_table timestamp(event_time))
ASOF JOIN another_table ON (symbol);
\`\`\`

To summarize:

1. By default, the table's designated timestamp is used.
2. To join on a different column, the standard method is to \`ORDER BY\` that column in a subquery.
3. Use the \`timestamp()\` syntax as an expert-level hint to avoid a sort on a table with no designated timestamp, if and
   only if you are certain the data is already sorted.

### TOLERANCE clause

The \`TOLERANCE\` clause enhances ASOF and LT JOINs by limiting how far back in time the join should look for a match in the right
table. The \`TOLERANCE\` parameter accepts a time interval value (e.g., \`2s\`, \`100ms\`, \`1d\`).

When specified, a record from the left table t1 at t1.ts will only be joined with a record from the right table t2 at
t2.ts if both conditions are met: \`t2.ts <= t1.ts\` and \`t1.ts - t2.ts <= tolerance_value\`

This ensures that the matched record from the right table is not only the latest one on or before t1.ts, but also within
the specified time window.

\`\`\`questdb-sql title="ASOF JOIN with a TOLERANCE parameter"
SELECT ...
FROM table1
ASOF JOIN table2 TOLERANCE 10s
[WHERE ...]
\`\`\`

TOLERANCE also works together with the ON clause:
\`\`\`questdb-sql title="ASOF JOIN with keys and a TOLERANCE parameter"
SELECT ...
FROM table1
ASOF JOIN table2 ON (key_column) TOLERANCE 1m
[WHERE ...]
\`\`\`

The interval_literal must be a valid QuestDB interval string, like '5s' (5 seconds), '100ms' (100 milliseconds), '2m' (
2 minutes), '3h' (3 hours), or '1d' (1 day).


#### Example using TOLERANCE:

Consider the \`trades\` and \`order_book\` tables from the previous examples. If we want to join trades to order book snapshots
that occurred no more than 1 second before the trade:

\`\`\`questdb-sql title="TOLERANCE example"
SELECT t.timestamp, t.price, t.size, ob.timestamp AS ob_ts, ob.bid_price, ob.bid_size
FROM trades t
ASOF JOIN order_book ob TOLERANCE 1s;
\`\`\`

Let's analyze a specific trade: trades at \`08:00:01.146931\`.
Without \`TOLERANCE\`, it joins with \`order_book\` at \`08:00:01\`. The time difference is 0.146931s.
If we set \`TOLERANCE\` '100ms', this trade would not find a match, because 0.146931s (146.931ms) is greater than 100ms. The
previous \`order_book\` entry at \`08:00:00\` would be even further away (1.146931s).

Another trade: trades at \`08:00:00.007140\`.
Without \`TOLERANCE\`, it joins with order_book at \`08:00:00\`. The time difference is 0.007140s (7.14ms).
If we set \`TOLERANCE\` '5ms', this trade would not find a match because 7.14ms > 5ms.

#### Supported Units for interval_literal
The \`TOLERANCE\` interval literal supports the following time unit qualifiers:
- U: Microseconds
- T: Milliseconds
- s: Seconds
- m: Minutes
- h: Hours
- d: Days
- w: Weeks

For example, '100U' is 100 microseconds, '50T' is 50 milliseconds, '2s' is 2 seconds, '30m' is 30 minutes,
'1h' is 1 hour, '7d' is 7 days, and '2w' is 2 weeks. Please note that months (M) and years (Y) are not supported as
units for the \`TOLERANCE\` clause.

#### Performance impact of TOLERANCE

Specifying \`TOLERANCE\` can also improve performance. \`ASOF JOIN\` execution plans often scan backward in time on the right
table to find a matching entry for each left-table row. \`TOLERANCE\` allows these scans to terminate early - once a
right-table record is older than the left-table record by more than the specified tolerance - thus avoiding unnecessary
processing of more distant records.

## SPLICE JOIN

Want to join all records from both tables?

\`SPLICE JOIN\` is a full \`ASOF JOIN\`.

Read the [JOIN reference](/docs/reference/sql/join/#splice-join) for more
information on SPLICE JOIN.
`
  },
  {
    path: 'sql/cancel-query.md',
    title: 'CANCEL QUERY',
    headers: ['Syntax', 'Description'],
    content: `Gracefully stops the execution of a running query.

## Syntax

![Flow chart showing the syntax of the CANCEL QUERY keyword](/images/docs/diagrams/cancelQuery.svg)

## Description

The \`CANCEL QUERY\` command sets a flag that is periodically checked by the
running target query. Cancelling depends on how often the flag is checked. It
may not be immediate.

The \`query_id\` is the unique non-negative identification number of a running
query in query registry.

\`CANCEL QUERY\` returns an error if:

1. The given \`query_id\` is negative
2. The query can't be found in registry

A \`query_id\` is found via the
[\`query_activity()\`](/docs/reference/function/meta#query_activity)
meta-function.

## Examples

Consider we have two open tabs of the QuestDB [Web Console](/docs/web-console/).

If we execute the following command in the first tab:

\`\`\`questdb-sql
CREATE TABLE test AS (SELECT x FROM long_sequence(1000000000));
\`\`\`

We can then check that the query is running in the second tab with the
[\`query_activity()\`](/docs/reference/function/meta#query_activity)
meta-function:

\`\`\`questdb-sql
SELECT * FROM query_activity();
\`\`\`

| query_id | worker_id | worker_pool | username | query_start                 | state_change                | state  | query                                                                |
| -------- | --------- | ----------- | -------- | --------------------------- | --------------------------- | ------ | -------------------------------------------------------------------- |
| 29       | 1         | shared      | joe      | 2024-01-09T10:51:05.878627Z | 2024-01-09T10:51:05.878627Z | active | CREATE TABLE test_tab AS (SELECT x FROM long_sequence(10000000000)); |
| 30       | 21        | shared      | joe      | 2024-01-09T10:51:10.661032Z | 2024-01-09T10:51:10.661032Z | active | SELECT \\* FROM query_activity();                                     |

We see that the two latest queries have \`query_id\`'s of 29 and 30, respectively.

Want to cancel it?

There are two methods:

\`\`\`questdb-sql
CANCEL QUERY 29;
\`\`\`

Or:

\`\`\`questdb-sql
SELECT cancel_query(29)
\`\`\`

After execution, the query then gets interrupted and returns a
\`cancelled by user\` error in the first tab where the query was launched.

The \`cancel_query()\` function may cancel multiple queries at the same time or
cancel without the need to lookup a specific \`query_id\`. You can do so by
chaining with a [\`LIKE\`](/docs/reference/function/pattern-matching/#likeilike)
operator:

\`\`\`questdb-sql
SELECT cancel_query(query_id)
FROM query_activity()
WHERE query LIKE 'CREATE TABLE test_tab%'
\`\`\`

This expression returns \`true\` if query was found in the registry and if the
cancellation was set. Otherwise, it returns \`false\`.
`
  },
  {
    path: 'sql/case.md',
    title: 'CASE keyword',
    headers: ['Syntax', 'Description'],
    content: `## Syntax

![Flow chart showing the syntax of CASE](/images/docs/diagrams/case.svg)

## Description

\`CASE\` goes through a set of conditions and returns a value corresponding to the
first condition met. Each new condition follows the \`WHEN condition THEN value\`
syntax. The user can define a return value when no condition is met using
\`ELSE\`. If \`ELSE\` is not defined and no conditions are met, then case returns
\`null\`.

## Examples

Assume the following data

| name  | age |
| ----- | --- |
| Tom   | 4   |
| Jerry | 19  |
| Anna  | 25  |
| Jack  | 8   |

\`\`\`questdb-sql title="CASE with ELSE"
SELECT
name,
CASE
    WHEN age > 18 THEN 'major'
    ELSE 'minor'
END
FROM my_table
\`\`\`

Result

| name  | case  |
| ----- | ----- |
| Tom   | minor |
| Jerry | major |
| Anna  | major |
| Jack  | minor |

\`\`\`questdb-sql title="CASE without ELSE"
SELECT
name,
CASE
    WHEN age > 18 THEN 'major'
END
FROM my_table
\`\`\`

Result

| name  | case  |
| ----- | ----- |
| Tom   | null  |
| Jerry | major |
| Anna  | major |
| Jack  | null  |
`
  },
  {
    path: 'sql/cast.md',
    title: 'CAST keyword',
    headers: ['Syntax', 'Explicit conversion', 'Implicit conversion', 'Alternate syntax'],
    content: `Type conversion. Can be either:

- [Explicit](#explicit-conversion) via \`cast()\`
- [Implicit](#implicit-conversion), in which case it will be automatically
  performed when required by the context.

## Syntax

![Flow chart showing the syntax of the CAST keyword](/images/docs/diagrams/cast.svg)

where:

- \`expression\` can be a constant, a column, or an expression that evaluates to a
  value.
- \`type\` refers to the desired [data type](/docs/reference/sql/datatypes/).

\`cast\` can be used a part of arithmetic expression as normal

## Explicit conversion

Types can be converted from one to another using the \`cast()\` function.

## Examples

\`\`\`questdb-sql title="Queries"
SELECT
cast(3L + 2L AS INT),
cast(1578506142000000 AS TIMESTAMP),
cast('10.2' AS DOUBLE),
cast('行' AS INT);
\`\`\`

| cast | cast1                       | cast2 | cast3 |
| ---- | --------------------------- | ----- | ----- |
| 5    | 2020-01-08T17:55:42.000000Z | 10.2  | 34892 |

Explicit casting of an expression to a smaller
[data type](/docs/reference/sql/datatypes/) may result in loss of data when the
output data type is smaller than the expression.

- Casting a decimal number type (\`float\` or \`double\`) to an integer number type
  (\`long\`, \`int\`, \`short\`) will result in decimals drop.
- If the integer part being cast is larger than the resulting data type, it will
  be resized by truncating bits.
- Conversions from \`char\` to a number type will return the corresponding
  \`unicode\` number and vice versa.

### Precision loss examples

\`\`\`questdb-sql title="Queries"
SELECT
cast(3.5 + 2 AS INT),
cast(7234623 AS SHORT),
cast(2334444.323 AS SHORT);
\`\`\`

| cast | cast1 | cast2  |
| ---- | ----- | ------ |
| 5    | 25663 | -24852 |

When casting numbers into a smaller data type, QuestDB will truncate the higher
bits of this number.

## Implicit conversion

Type casting may be necessary in certain context such as

- Operations involving various different types
- Inserting values where the originating type is different from the destination
  column type.

QuestDB will attempt to convert to the data type required by the context. This
is called \`implicit cast\` and does not require using the \`cast()\` function.

Implicit casts are only performed when they would **NOT**:

1. Reduce overall precision
2. Truncate potential results

Implicit casting also prevents data loss.

When an operation involves multiple types, the resulting type will be the
smallest possible type so that no data is lost.

The below chart illustrates the explicit and implicit cast available in QuestDB:

![Table showing the different possibilities the cast function supports, those are defined by an input and output types](/images/docs/castmap.jpg)

\`\`\`questdb-sql title="Queries"
SELECT
1234L + 567,
1234L + 0.567,
to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss') + 323,
to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss') + 0.323;
\`\`\`

| column | column1  | column2                     | column3          |
| ------ | -------- | --------------------------- | ---------------- |
| 1801   | 1234.567 | 2019-10-17T00:00:00.000323Z | 1571270400000000 |

## Alternate syntax

There is a shorthand cast syntax.

Using the above example:

\`\`\`questdb-sql title="Queries, long form"
SELECT
cast(3.5 + 2 AS INT),
cast(7234623 AS SHORT),
cast(2334444.323 AS SHORT);
\`\`\`

We can use the \`::\` syntax to shorten things up:

\`\`\`questdb-sql title="Queries, short hand"
SELECT
    (3.5 + 2)::INT,
    7234623::SHORT,
    2334444.323::SHORT;
\`\`\`

Which to choose?

It's all preference, however many consider the short hand to be more readable.
`
  },
  {
    path: 'sql/checkpoint.md',
    title: 'CHECKPOINT keyword',
    headers: ['CHECKPOINT syntax', 'CHECKPOINT overview', 'CHECKPOINT examples'],
    content: `Checkpoint SQL toggles the database into and out of "checkpoint mode". In this
mode the databases file system can be safely backed up using external tools,
such as disk snapshots or copy utilities.

_Looking for a detailed guide backup creation and restoration? Check out our
[Backup and Restore](/docs/operations/backup/) guide!_

:::caution

QuestDB currently does not support creating checkpoints on Windows.

If you are a Windows user and require backup functionality, please
[comment on this issue](https://github.com/questdb/questdb/issues/4811).

:::

## CHECKPOINT syntax

![Flow chart showing the syntax of the CHECKPOINT keyword](/images/docs/diagrams/checkpoint.svg)

## CHECKPOINT overview

To enable online backups, data in QuestDB is mutated via either file append or
via copy-on-write. Checkpoint leverages these storage methods to achieve
reliable and consistent restorations from your database backups.

### What happens during CHECKPOINT CREATE?

When initiatied, \`CHECKPOINT CREATE\`:

- Disables background jobs that housekeep stale files and data blocks
- Takes snapshot of table transactions across the whole database (all tables)
- Creates a new on-disk data structure that captures append offsets and versions
  of files that represent data for the above transactions. Typically this data
  is stored in the \`/var/lib/questdb/.checkpoint\` directory.
  - **Do not alter contents of this directory manually**!
- Calls [\`sync()\`](https://man7.org/linux/man-pages/man2/sync.2.html) to
  synchronously flush filesystem caches to disk

### What happens after a checkpoint has been created?

Once a checkpoint is created, QuestDB continues taking in writes. However, it
will consume more disk space. How much more depends on the shape of the data
that is being written. Data that is written via the append method will yeild
almost no additional disk space consumption other that of the data itself. In
contrast, the copy-on-write method will make data copies, which are usually
copies of non-recent table partitions. This will lead to an increase in disk
space consumption.

**It is strongly recommended that you minimize the time database is in
checkpoint mode and monitor the free disk space closely. The recommended way to
achive this is to utilize file system SNAPSHOTS as described in
[our backup and restore guide](/docs/operations/backup/).**

Also note that QuestDB can only enter checkpoint mode once. After that period of
time, the next checkpoint operation must be to exit checkpoint mode. Attempts to
create a new checkpoint when once exists will fail with the appropriate message.

When in checkpoint mode, you can safely access the file system to take your
snapshot.

### What happens after my snapshot is complete?

After your snapshot is complete, checkpoint mode must be exited via the
\`CHECKPOINT RELEASE\` SQL. Once executed, QuestDB will reinstate the usual
housekeeping and reclaim disk space.

The database restore is preformed semi-automatically on the database startup.
This is done deliberately to avoid the restore procedure running accidentally on
the source database instance. The database will attempt a restore when empty an
file, typically \`/var/lib/questdb/_restore\` is present.

The restore procedure will use \`/var/lib/questdb/.checkpoint\` to adjust the
database files and remove extra data copies. After the restore is successful the
database is avaialble as normal with no extra intervantion required.

## CHECKPOINT examples

To enter checkpoint mode:

\`\`\`sql
CHECKPOINT CREATE
\`\`\`

To exit checkpoint mode:

\`\`\`sql
CHECKPOINT RELEASE
\`\`\`
`
  },
  {
    path: 'sql/copy.md',
    title: 'COPY keyword',
    headers: ['Syntax', 'Description', 'Options'],
    content: `:::caution

For partitioned tables, the best \`COPY\` performance can be achieved only on a
machine with a local, physically attached SSD. It is possible to use a network
block storage, such as an AWS EBS volume to perform the operation, with the
following impact:

- Users need to configure the maximum IOPS and throughput setting values for the
  volume.
- The required import time is likely to be 5-10x longer.

:::

## Syntax

![Flow chart showing the syntax of the COPY keyword](/images/docs/diagrams/copy.svg)

## Description

Copies tables from a delimited text file saved in the defined root directory
into QuestDB. \`COPY\` has the following import modes:

- Parallel import, used for copying partitioned tables:

  - The parallel level is based on partition granularity. It is important to
    choose the timestamp column and partition type correctly for the data to be
    imported. The higher the granularity of the partitions, the faster an import
    operation can be completed.
  - If the target table exists and is partitioned, the target table must be
    empty.
  - If the target table does not exist, both \`TIMESTAMP\` and \`PARTITION BY\`
    options must be defined to create a partitioned table. The \`PARTITION BY\`
    value should not be \`NONE\`.
  - When table does exist and is not empty, import is not supported.

- Serial import, used for copying non-partitioned tables:

  - If the target table exists and is not partitioned, the data is appended
    provided the file structure matches the table.
  - If the target table does not exist, then it is created using metadata
    derived from the file data.

:::note

\`COPY\` takes up all the available resources. While one import is running, new
request(s) will be rejected.

:::

\`COPY '<id>' CANCEL\` cancels the copying operation defined by the import \`id\`,
while an import is taking place.

### Root directory

\`COPY\` requires a defined root directory where CSV files are saved and copied
from. A CSV file must be saved to the root directory before starting the \`COPY\`
operation. There are two root directories to be defined:

- \`cairo.sql.copy.root\` is used for storing regular files to be imported. By default,
  it points to the \`root_directory/import\` directory. This allows you to drop a CSV
    file into the \`import\` directory and start the import operation.
- \`cairo.sql.copy.work.root\` is used for storing temporary files like indexes or
  temporary partitions. Unless otherwise specified, it points to the
  \`root_directory/tmp\` directory.

Use the [configuration keys](/docs/configuration/) to edit these properties in
[\`COPY\` configuration settings](/docs/configuration/#csv-import):

\`\`\`shell title="Example"
cairo.sql.copy.root=/Users/UserName/Desktop
\`\`\`

\`cairo.sql.copy.root\` and \`cairo.sql.copy.work.root\` can be on a local disk to
the server, on a remote disk, or a remote filesystem. QuestDB enforces that the
tables are only written from files located in a directory relative to the
directories. This is a security feature preventing random file access by
QuestDB.

:::note

For Mac OS users, using a directory under \`/Users\` may prevent import due to
permission problem. It is preferable to save the CSV file in a folder outside of
the \`/Users\` tree and set the root directory accordingly.

:::

### Log table

\`COPY\` generates a log table,\`sys.text_import_log\`, tracking \`COPY\` operation
for the last three days with the following information:

| Column name   | Data type | Notes                                                                         |
| ------------- | --------- | ----------------------------------------------------------------------------- |
| ts            | timestamp | The log event timestamp                                                       |
| id            | string    | Import id                                                                     |
| table         | symbol    | Destination table name                                                        |
| file          | symbol    | The source csv file                                                           |
| phase         | symbol    | Import phase.\\* Available only in intermediate log records of parallel import |
| status        | symbol    | The event status: started, finished, failed, cancelled                        |
| message       | string    | The error message for when status is failed                                   |
| rows_handled  | long      | The counters for the total number of scanned lines in the file                |
|               |           | The counters are shown in the final log row for the given import              |
| rows_imported | long      | The counters for the total number of imported rows                            |
|               |           | The counters are shown in the final log row for the given import              |
| errors        | long      | The number of errors for the given phase                                      |

\\* Available phases for parallel import are:

- setup
- boundary_check
- indexing
- partition_import
- symbol_table_merge
- update_symbol_keys
- build_symbol_index
- move_partitions
- attach_partitions
- analyze_file_structure
- cleanup

Log table row retention is configurable through
\`cairo.sql.copy.log.retention.days\` setting, and is three days by default.

\`COPY\` returns \`id\` value from \`sys.text_import_log\` to track the import
progress.

## Options

- \`HEADER true/false\`: When \`true\`, QuestDB automatically assumes the first row
  is a header. Otherwise, schema recognition is used to determine whether the
  first row is used as header. The default setting is \`false\`.
- \`TIMESTAMP\`: Define the name of the timestamp column in the file to be
  imported.
- \`FORMAT\`: Timestamp column format when the format is not the default
  (\`yyyy-MM-ddTHH:mm:ss.SSSUUUZ\`) or cannot be detected. See
  [Date and Timestamp format](/docs/reference/function/date-time/#timestamp-format)
  for more information.
- \`DELIMITER\`: Default setting is \`,\`.
- \`PARTITION BY\`: Partition unit.
- \`ON ERROR\`: Define responses to data parsing errors. The valid values are:
  - \`SKIP_ROW\`: Skip the entire row
  - \`SKIP_COLUMN\`: Skip column and use the default value (\`null\` for nullable
    types, \`false\` for boolean, \`0\` for other non-nullable types)
  - \`ABORT\`: Abort whole import on first error, and restore the pre-import table
    status

## Examples

For more details on parallel import, please also see
[Importing data in bulk via CSV](/docs/guides/import-csv/#import-csv-via-copy-sql).

\`\`\`questdb-sql title="COPY"
COPY weather FROM 'weather.csv' WITH HEADER true FORMAT 'yyyy-MM-ddTHH:mm:ss.SSSUUUZ' ON ERROR SKIP_ROW;
\`\`\`

Starts an import asynchronously and returns an import id string:

| id               |
| ---------------- |
| 55ca24e5ba328050 |

The log can be accessed by querying:

\`\`\`questdb-sql
SELECT * FROM 'sys.text_import_log' WHERE id = '55ca24e5ba328050';
\`\`\`

A sample log table:

| ts                          | id               | table   | file        | phase | status  | message | rows_handled | rows_imported | errors |
| --------------------------- | ---------------- | ------- | ----------- | ----- | ------- | ------- | ------------ | ------------- | ------ |
| 2022-08-03T10:40:25.586455Z | 55ca24e5ba328050 | weather | weather.csv |       | started |         |              |               | 0      |
|                             |                  |         |             |       |         |         |              |               |        |

While it is running, import can be cancelled with:

\`\`\`questdb-sql
COPY '55ca24e5ba328050' CANCEL;
\`\`\`

Within a few seconds import should stop and message with 'cancelled' status
should appear in text_import_log, e.g.:

\`\`\`questdb-sql
SELECT * FROM 'sys.text_import_log' WHERE id = '55ca24e5ba328050' LIMIT -1;
\`\`\`

| ts                          | id               | table   | file        | phase | status    | message                                                    | rows_handled | rows_imported | errors |
| :-------------------------- | ---------------- | ------- | ----------- | ----- | --------- | ---------------------------------------------------------- | ------------ | ------------- | ------ |
| 2022-08-03T14:04:42.268502Z | 55ca24e5ba328050 | weather | weather.csv | null  | cancelled | import cancelled [phase=partition_import, msg=\`Cancelled\`] | 0            | 0             | 0      |
`
  },
  {
    path: 'sql/create-mat-view.md',
    title: 'CREATE MATERIALIZED VIEW',
    headers: ['Syntax', 'Metadata', 'Creating a view', 'Alternative refresh strategies', 'Period materialized views', 'Initial refresh', 'Base table', 'Partitioning', 'Time To Live (TTL)', 'IF NOT EXISTS', 'Materialized view names', 'OWNED BY (Enterprise)', 'SYMBOL column capacity', 'Query constraints'],
    content: `:::info

Materialized View support is now generally available (GA) and ready for
production use.

If you are using versions earlier than \`8.3.1\`, we suggest you upgrade at your
earliest convenience.

:::

To create a new materialized view in the database, use the
\`CREATE MATERIALIZED VIEW\` keywords followed by the query that defines the
materialized view.

A materialized view holds the result set of the given query, and is
automatically refreshed and persisted. For more information on the concept, see
the [introduction](/docs/concept/mat-views/) and
[guide](/docs/guides/mat-views/) on materialized views.

## Syntax

The \`CREATE MATERIALIZED VIEW\` statement comes in two flavors: compact and full
syntax. The compact syntax can be used when the default parameters are
sufficient.

![Flow chart showing the syntax of the compact CREATE MATERIALIZED VIEW syntax](/images/docs/diagrams/createMatViewCompactDef.svg)

For more on the semantics of the compact syntax, see the
[materialized view guide](/docs/guides/mat-views/#compact-syntax).

To create a materialized view with full syntax, you need to enter the following
parameters and settings:

![Flow chart showing the syntax of the CREATE MATERIALIZED VIEW keyword](/images/docs/diagrams/createMatViewDef.svg)

## Metadata

To check materialized view metadata, use the \`materialized_views()\` function,
which is described in the [meta functions](/docs/reference/function/meta/)
documentation page.

The following example demonstrate creating materialized views from basic
statements, and introduces feature such as
[partitioning](/glossary/database-partitioning/).

## Creating a view

Our examples use the following base table:

\`\`\`questdb-sql title="Base table"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY;
\`\`\`

Now we can create a materialized view holding aggregated data from the base
table:

\`\`\`questdb-sql title="Hourly materialized view"
CREATE MATERIALIZED VIEW trades_hourly_prices AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
\`\`\`

Now, we've created a materialized view that will be automatically refreshed each
time when the base table (\`trades\`) gets new data.

The refreshes are incremental. The view data is populated partially, and only
for the changed parts of the base table.

:::note

Queries supported by incrementally refreshed materialized views are limited to
\`SAMPLE BY\` queries without \`FROM-TO\` and \`FILL\` clauses, and \`GROUP BY\` queries
with the designated timestamp as the grouping key.

:::

## Alternative refresh strategies

With the default \`IMMEDIATE\` refresh strategy, QuestDB will incrementally
refresh the view each time new data is written to the base table. If your data
is written rapidly in small transactions, this will trigger additional small
writes to the view.

Instead, you can use timer-based refresh, which trigger an incremental refresh
after certain time intervals:

\`\`\`questdb-sql
CREATE MATERIALIZED VIEW price_1h
REFRESH EVERY 1h START '2025-05-30T00:00:00.000000Z' TIME ZONE 'Europe/Berlin'
AS ...
\`\`\`

In this example, the view will start refreshing from the specified timestamp in
Berlin time zone on an hourly schedule. The refresh itself will still be
incremental, but will no longer be triggered on every new insert. You can omit
the \`START <timestamp>\` and \`TIME ZONE <timezone>\` clauses in order to just
start refreshing from \`now\`.

:::tip

The minimum timed interval is one minute (\`1m\`). If you need to refresh faster
than this, please use the default incremental refresh.

:::

In case you want to be in full control of when the incremental refresh happens,
you can use \`MANUAL\` refresh:

\`\`\`questdb-sql
CREATE MATERIALIZED VIEW price_1h
REFRESH MANUAL
AS ...
\`\`\`

Manual strategy means that to refresh the view, you need to run the
[\`REFRESH\` SQL](/docs/reference/sql/refresh-mat-view/) explicitly.

For all these strategies, the refresh itself stays incremental, i.e. the
materialized view is only updated for base table time intervals that received
modifications since the previous refresh.

## Period materialized views

In certain use cases, like storing trading day information, the data becomes
available at fixed time intervals. In this case, \`PERIOD\` variant of
materialized views can be used:

\`\`\`questdb-sql title="Period materialized view"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
\`\`\`

The \`PERIOD\` clause above defines an in-flight time interval (period) in the
\`trades_daily_prices\` materialized view that will not receive data until it
finishes. In this example, the interval is one day (\`LENGTH 1d\`) in London time
zone. The \`DELAY 2h\` clause here means that the data for the trading day may
have 2 hour lag until it's fully written. So, in our example the current
in-flight period in the view is considered complete and gets refreshed
automatically each day at 2AM, London time. Since the default \`IMMEDIATE\`
refresh strategy is used, all writes to older, complete periods in the base
table lead to an immediate and asynchronous refresh in the view once the
transaction is committed.

Period materialized views can be used with any supported refresh strategy, not
only with the \`IMMEDIATE\` one. For instance, they can be configured for
timer-based refresh:

\`\`\`questdb-sql title="Period materialized view with timer refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH EVERY 10m PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
...
\`\`\`

Here, the \`PERIOD\` refresh still takes place once a period completes, but
refreshes for older rows take place each 10 minutes.

Finally, period materialized views can be configure for manual refresh:

\`\`\`questdb-sql title="Period materialized view with timer refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH MANUAL PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
...
\`\`\`

The only way to refresh data on such a materialized view is to run
[\`REFRESH\` SQL](/docs/reference/sql/refresh-mat-view/) explicitly. When run,
\`REFRESH\` statement will refresh incrementally all recently completed periods,
as well as all time intervals touched by the recent write transactions.

## Initial refresh

As soon as a materialized view is created an asynchronous refresh is started. In
situations when this is not desirable, \`DEFERRED\` keyword can be specified along
with the refresh strategy:

\`\`\`questdb-sql title="Deferred manual refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH MANUAL DEFERRED AS
...
\`\`\`

In the above example, the view has manual refresh strategy and it does not
refresh after creation. It will only refresh when you run the
[\`REFRESH\` SQL](/docs/reference/sql/refresh-mat-view/) explicitly.

The \`DEFERRED\` keyword can be also specified for \`IMMEDIATE\` and timer-based
refresh strategies. Here is an example:

\`\`\`questdb-sql title="Deferred timer refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH EVERY 1h DEFERRED START '2026-01-01T00:00:00' AS
...
\`\`\`

In such cases, the view will be refreshed only when the corresponding event
occurs:

- After the next base table transaction in case of \`IMMEDIATE\` refresh strategy.
- At the next trigger time in case of timer-based refresh strategy.

Once a materialized view is created, its refresh strategy can be changed any time
with the [\`ALTER SET REFRESH\`](/docs/reference/sql/alter-mat-view-set-refresh/)
command.

## Base table

Materialized views require that the base table is specified, so that the last
base table transaction number can be saved and later on checked by the
incremental refresh. When creating a materialized view that queries multiple
tables, you must specify one of them as the base table.

\`\`\`questdb-sql title="Hourly materialized view with LT JOIN"
CREATE MATERIALIZED VIEW trades_ext_hourly_prices
WITH BASE trades AS
SELECT
  t.timestamp,
  t.symbol,
  avg(t.price) AS avg_price,
  avg(e.price) AS avg_ext_price
FROM trades t
LT JOIN ext_trades e ON (symbol)
SAMPLE BY 1d;
\`\`\`

## Partitioning

\`PARTITION BY\` optionally allows specifying the
[partitioning strategy](/docs/concept/partitions/) for the materialized view.

Materialized views can be partitioned by one of the following:

- \`YEAR\`
- \`MONTH\`
- \`WEEK\`
- \`DAY\`
- \`HOUR\`

The partitioning strategy **cannot be changed** after the materialized view has
been created.

If unspecified, the \`CREATE MATERIALIZED VIEW\` statement will infer the
[default partitioning strategy](/docs/guides/mat-views/#default-partitioning).

## Time To Live (TTL)

A retention policy can be set on the materialized view, bounding how much data
is stored.

Simply specify a time-to-live (TTL) using the \`TTL\` clause, placing it right
after \`PARTITION BY <unit>\`.

Follow the \`TTL\` keyword with a number and a time unit, one of:

- \`HOURS\`
- \`DAYS\`
- \`WEEKS\`
- \`MONTHS\`
- \`YEARS\`

Refer to the [section on TTL in Concepts](/docs/concept/ttl/) for detailed
information on the behavior of this feature.

:::note

The time-to-live (TTL) for the materialized view can differ from the base table,
depending on your needs.

:::

### Examples

\`\`\`questdb-sql title="Creating a materialized view with PARTITION BY and TTL"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY DAY TTL 7 DAYS;
\`\`\`

\`\`\`questdb-sql title="Creating a materialized view with one day period"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
\`\`\`

\`\`\`questdb-sql title="Creating a materialized view with timer refresh each 10 minutes"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH EVERY 10m START '2025-06-18T00:00:00.000000000' AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
\`\`\`

\`\`\`questdb-sql title="Creating a materialized view with manual refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH MANUAL AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
\`\`\`

## IF NOT EXISTS

An optional \`IF NOT EXISTS\` clause may be added directly after the
\`CREATE MATERIALIZED VIEW\` keywords to indicate that a new view should be
created only if a view with the desired view name does not already exist.

\`\`\`questdb-sql
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_weekly_prices AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 7d;
\`\`\`

## Materialized view names

Materialized view names follow the
[same rules](/docs/reference/sql/create-table/#table-name) as regular tables.

## OWNED BY (Enterprise)

When a user creates a new materialized view, they are automatically assigned all
materialized view level permissions with the \`GRANT\` option for that view. This
behavior can can be overridden using \`OWNED BY\`.

If the \`OWNED BY\` clause is used, the permissions instead go to the user, group,
or service account named in that clause.

The \`OWNED BY\` clause cannot be omitted if the materialized view is created by
an external user, as permissions cannot be granted to them.

\`\`\`questdb-sql
CREATE GROUP analysts;
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY DAY
OWNED BY analysts;
\`\`\`

## SYMBOL column capacity

By default, SYMBOL column capacities in a materialized view are set to the same
values as in the base table. It is also possible to change SYMBOL capacities via
the
[\`ALTER MATERIALIZED VIEW SYMBOL CAPACITY\`](/docs/reference/sql/alter-mat-view-change-symbol-capacity/)
statement.

## Query constraints

There is a list of requirements for the queries that are used in materialized
views. Refer to this
[documentation section](/docs/guides/mat-views/#technical-requirements) to learn
about them.
`
  },
  {
    path: 'sql/create-table.md',
    title: 'CREATE TABLE reference',
    headers: ['Syntax', 'Write-Ahead Log (WAL) Settings', 'Designated timestamp', 'Partitioning', 'Time To Live (TTL)', 'Deduplication', 'IF NOT EXISTS', 'Table name', 'Column name', 'Type definition', 'Column indexes', 'OWNED BY', 'CREATE TABLE AS', 'CREATE TABLE LIKE', 'WITH table parameter', 'Table target volume'],
    content: `To create a new table in the database, the \`CREATE TABLE\` keywords followed by
column definitions are used.

## Syntax

To create a table by manually entering parameters and settings:

![Flow chart showing the syntax of the CREATE TABLE keyword](/images/docs/diagrams/createTableDef.svg)

:::note

Checking table metadata can be done via the \`tables()\` and \`table_columns()\`
functions which are described in the
[meta functions](/docs/reference/function/meta/) documentation page.

:::

To create a table by cloning the metadata of an existing table:

![Flow chart showing the syntax of the CREATE TABLE LIKE keyword](/images/docs/diagrams/createTableLike.svg)

## Examples

The following examples demonstrate creating tables from basic statements, and
introduces feature such as [partitioning](/glossary/database-partitioning/),
designated timestamps and data deduplication. For more information on the
concepts introduced to below, see

- [designated timestamp](/docs/concept/designated-timestamp/) reference on
  electing a timestamp column
- [partition](/docs/concept/partitions/) documentation which describes how
  partitions work in QuestDB
- [symbol](/docs/concept/symbol/) reference for using the \`symbol\` data type
- [data deduplication](/docs/concept/deduplication/) reference on discarding
  duplicates.

This first iteration of our example creates a table with a designated timestamp
and also applies a partitioning strategy, \`BY DAY\`:

\`\`\`questdb-sql title="Basic example, partitioned by day"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY;
\`\`\`

Now we can add a time-to-live (TTL) period. Once an entire data partition is
past its TTL, it becomes eligible for automatic removal.

\`\`\`questdb-sql title="With TTL"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK;
\`\`\`

Next, we enable data deduplication. This will discard exact duplicates on the
timestamp and ticker columns:

\`\`\`questdb-sql title="With deduplication, adding ticker as an upsert key."
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK
DEDUP UPSERT KEYS (timestamp, symbol);
\`\`\`

Finally, we add additional parameters for our SYMBOL type:

\`\`\`questdb-sql title="Adding parameters for symbol type"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 256 NOCACHE,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK
DEDUP UPSERT KEYS (timestamp, symbol);
\`\`\`

## Write-Ahead Log (WAL) Settings

By default, created tables are
[Write-Ahead Log enabled](/docs/concept/write-ahead-log/). While we recommend
WAL-enabled tables, it is still possible to create non-WAL-enabled tables.

\`CREATE TABLE\`'s
[global configuration setting](/docs/configuration/#cairo-engine) allows you to
alter the default behaviour via \`cairo.wal.enabled.default\`:

- \`true\`: Creates a WAL table (default)
- \`false\`: Creates a non-WAL table

And on an individual basis, you can also use \`BYPASS WAL\`.

## Designated timestamp

The timestamp function allows for specifying which column (which must be of
\`timestamp\` type) should be a designated timestamp for the table. For more
information, see the [designated timestamp](/docs/concept/designated-timestamp/)
reference.

The designated timestamp column **cannot be changed** after the table has been
created.

## Partitioning

\`PARTITION BY\` allows for specifying the
[partitioning strategy](/docs/concept/partitions/) for the table. Tables created
via SQL are not partitioned by default (\`NONE\`) and tables can be partitioned by
one of the following:

- \`NONE\`: the default when partition is not defined.
- \`YEAR\`
- \`MONTH\`
- \`WEEK\`
- \`DAY\`
- \`HOUR\`

The partitioning strategy **cannot be changed** after the table has been
created.

## Time To Live (TTL)

To store and analyze only recent data, configure a time-to-live (TTL) period on
a table using the \`TTL\` clause, placing it right after \`PARTITION BY <unit>\`.
You can't set TTL on a non-partitioned table.

Follow the \`TTL\` keyword with a number and a time unit, one of:

- \`HOURS\`
- \`DAYS\`
- \`WEEKS\`
- \`MONTHS\`
- \`YEARS\`

TTL units fall into two categories:

1. Fixed time periods:
   - \`HOURS\`
   - \`DAYS\`
   - \`WEEKS\`
2. Calendar-based periods:
   - \`MONTHS\`
   - \`YEARS\`

Fixed-time periods are always exact durations: \`1 WEEK\` is always 7 days.

Calendar-based periods may vary in length: \`1 MONTH\` from January 15th goes to
February 15th and could be between 28 and 31 days.

QuestDB accepts both singular and plural forms:

- \`HOUR\` or \`HOURS\`
- \`DAY\` or \`DAYS\`
- \`WEEK\` or \`WEEKS\`
- \`MONTH\` or \`MONTHS\`
- \`YEAR\` or \`YEARS\`

It also supports shorthand notation: \`3H\` for 3 hours, \`2M\` for 2 months.

:::note

QuestDB drops data that exceeded its TTL only a whole partition at a time. For
this reason, the TTL period must be a whole number multiple of the table's
partition size.

For example:

- If a table is partitioned by \`DAY\`, the TTL must be a whole number of days
  (\`24 HOURS\`, \`2 DAYS\` and \`3 MONTHS\` are all accepted)
- If a table is partitioned by \`MONTH\`, the TTL must be in months or years.
  QuestDB won't accept the \`HOUR\`, \`DAY\`, or \`WEEK\` units

Refer to the [section on TTL in Concepts](/docs/concept/ttl/) for detailed
information on the behavior of this feature.

:::

## Deduplication

When [Deduplication](/docs/concept/deduplication) is enabled, QuestDB only
inserts rows that do not match the existing data. When you insert a row into a
table with deduplication enabled, QuestDB searches for existing rows with
matching values in all the columns specified with \`UPSERT KEYS\`. It replaces all
such matching rows with the new row.

Deduplication only works on
[Write-Ahead Log (WAL)](/docs/concept/write-ahead-log/) tables.

You can include multiple columns of different types in the \`UPSERT KEYS\` list.

However, there are a few limitations to keep in mind:

- You must include the designated timestamp column
- You cannot use an [\`ARRAY\`](/docs/reference/sql/datatypes) column

You can change the deduplication configuration at any time using \`ALTER TABLE\`:

- Enable deduplication and change \`UPSERT KEYS\` with
  [\`ALTER TABLE ENABLE\`](/docs/reference/sql/alter-table-enable-deduplication/)
- Disable deduplication with using
  [\`ALTER TABLE DISABLE\`](/docs/reference/sql/alter-table-disable-deduplication/)

### Examples

\`\`\`questdb-sql title="Creating a table for tracking ticker prices with daily partitions and upsert deduplication"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
DEDUP UPSERT KEYS (timestamp, symbol);
\`\`\`

\`\`\`questdb-sql title="Enabling dedup on an existing table, for timestamp and ticker columns"
ALTER TABLE trades DEDUP ENABLE UPSERT KEYS (timestamp, symbol);
\`\`\`

\`\`\`questdb-sql title="Disabling dedup on the entire table"
ALTER TABLE trades DEDUP DISABLE;
\`\`\`

\`\`\`questdb-sql title="Checking whether a table has dedup enabled"
SELECT dedup FROM tables() WHERE table_name = '<the table name>';
\`\`\`

\`\`\`questdb-sql title="Checking whether a column has dedup enabled"
SELECT \`column\`, upsertKey FROM table_columns('<the table name>');
\`\`\`

## IF NOT EXISTS

An optional \`IF NOT EXISTS\` clause may be added directly after the
\`CREATE TABLE\` keywords to indicate that a new table should be created if one
with the desired table name does not already exist.

\`\`\`questdb-sql
CREATE TABLE IF NOT EXISTS trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY;
\`\`\`

## Table name

Internally the table name is used as a directory name on the file system. It can
contain both ASCII and Unicode characters. The table name **must be unique** and
an error is returned if a table already exists with the requested name.

In addition, table names are case insensitive: \`example\`, \`exAmPlE\`, \`EXAMplE\`
and \`EXAMPLE\` are all treated the same. Table names containing spaces or period
\`.\` character must be enclosed in **double quotes**, for example:

\`\`\`questdb-sql
CREATE TABLE "example out of.space" (a INT);
INSERT INTO "example out of.space" VALUES (1);
\`\`\`

## Column name

As with table names, the column name is used for file names internally. Although
it does support both ASCII and Unicode characters, character restrictions
specific to the file system still apply.

Tables may have up to **2,147,483,647** columns. Column names are also case
insensitive. For example: \`example\`, \`exAmPlE\`, \`EXAMplE\` and \`EXAMPLE\` are all
treated the same. However, column names **must be** unique within each table and
**must not contain** a period \`.\` character.

## Type definition

When specifying a column, a name and
[type definition](/docs/reference/sql/datatypes/) must be provided. The \`symbol\`
type may have additional optional parameters applied.

![Flow chart showing the syntax of the different column types](/images/docs/diagrams/columnTypeDef.svg)

### Symbols

Optional keywords and parameters may follow the \`symbol\` type which allow for
further optimization on the handling of this type. For more information on the
benefits of using this type, see the [symbol](/docs/concept/symbol/) overview.

#### Symbol capacity

\`CAPACITY\` is an optional keyword used when defining a symbol type on table
creation to indicate how many distinct values this column is expected to have.
When \`distinctValueEstimate\` is not explicitly specified, a default value of
\`cairo.default.symbol.capacity\` is used.

\`distinctValueEstimate\` - the value used to size data structures for
[symbols](/docs/concept/symbol/).

\`\`\`questdb-sql
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 50,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY;
\`\`\`

#### Symbol caching

\`CACHE | NOCACHE\` is used to specify whether a symbol should be cached. The
default value is \`CACHE\` unless otherwise specified.

\`\`\`questdb-sql
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 50 NOCACHE,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp);
\`\`\`

### Casting types

\`castDef\` - casts the type of a specific column. \`columnRef\` must reference
existing column in the \`selectSql\`

![Flow chart showing the syntax of the cast function](/images/docs/diagrams/castDef.svg)

\`\`\`questdb-sql
CREATE TABLE test AS (
  SELECT x FROM long_sequence(10)
), CAST (x AS DOUBLE);
\`\`\`

## Column indexes

Index definitions (\`indexDef\`) are used to create an
[index](/docs/concept/indexes/) for a table column. The referenced table column
must be of type [symbol](/docs/concept/symbol/).

![Flow chart showing the syntax of the index function](/images/docs/diagrams/indexDef.svg)

\`\`\`questdb-sql
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
), INDEX(symbol) TIMESTAMP(timestamp);
\`\`\`

:::warning

- The **index capacity** and
  [**symbol capacity**](/docs/concept/symbol/#usage-of-symbols) are different
  settings.
- The index capacity value should not be changed, unless a user is aware of all
  the implications.
:::

See the [Index concept](/docs/concept/indexes/#how-indexes-work) for more
information about indexes.

## OWNED BY

_Enterprise only._

When a user creates a new table, they automatically get all table level
permissions with the \`GRANT\` option for that table. However, if the \`OWNED BY\`
clause is used, the permissions instead go to the user, group, or service
account named in that clause.

The \`OWNED BY\` clause cannot be omitted if the table is created by an external
user, because permissions cannot be granted to them.

\`\`\`questdb-sql
CREATE GROUP analysts;
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
OWNED BY analysts;
\`\`\`

## CREATE TABLE AS

Creates a table, using the results from the \`SELECT\` statement to determine the
column names and data types.

\`\`\`questdb-sql title="Create table as select"
CREATE TABLE new_trades AS (
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
\`\`\`

We can use keywords such as \`IF NOT EXISTS\`, \`PARTITION BY\`..., as needed for
the new table. The data type of a column can be changed:

\`\`\`questdb-sql title="Clone an existing wide table and change type of cherry-picked columns"
CREATE TABLE new_trades AS (
  SELECT *
  FROM
    trades
), CAST(price AS LONG) TIMESTAMP(timestamp);
\`\`\`

Here we changed type of \`price\` to \`LONG\`.

:::note

Since QuestDB v7.4.0, the default behaviour for \`CREATE TABLE AS\` has been
changed.

Previously, the table would be created atomically. For large tables, this
requires a significant amount of RAM, and can cause errors if the database runs
out of memory.

By default, this will be performed in batches. If the query fails, partial data
may be inserted.

If this is a problem, it is recommended to use the ATOMIC keyword
(\`CREATE ATOMIC TABLE\`). Alternatively, enabling deduplication on the table will
allow you to perform an idempotent insert to re-insert any missed data.

:::

### ATOMIC

Tables can be created atomically, which first loads all of the data and then
commits in a single transaction.

This requires the data to be available in memory all at once, so for large
inserts, this may have performance issues.

To force this behaviour, one can use the \`ATOMIC\` keyword:

\`\`\`questdb-sql title="Create atomic table as select"
CREATE ATOMIC TABLE new_trades AS (
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
\`\`\`

### BATCH

By default, tables will be created with data inserted in batches.

The size of the batches can be configured:

- globally, by setting the \`cairo.sql.create.table.model.batch.size\`
  configuration option in \`server.conf\`.
- locally, by using the \`BATCH\` keyword in the \`CREATE TABLE\` statement.

\`\`\`questdb-sql title="Create batched table as select"
CREATE BATCH 4096 TABLE new_trades AS (
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
\`\`\`

One can also specify the out-of-order commit lag for these batched writes, using
the o3MaxLag option:

\`\`\`questdb-sql title="Create table as select with batching and O3 lag"
CREATE BATCH 4096 o3MaxLag 1s TABLE new_trades AS (
  SELECT * FROM trades
) TIMESTAMP(timestamp);
\`\`\`

### Turning unordered data into ordered data

As an additional example, let's assume we imported a text file into the table
\`taxi_trips_unordered\` and now we want to turn this data into time series
through ordering trips by \`pickup_time\`, assign dedicated timestamp and
partition by month:

\`\`\`questdb-sql title="Create table as select with data manipulation"
CREATE TABLE taxi_trips AS (
  SELECT * FROM taxi_trips_unordered ORDER BY pickup_time
) TIMESTAMP(pickup_time)
PARTITION BY MONTH;
\`\`\`

## CREATE TABLE LIKE

The \`LIKE\` keyword clones the table schema of an existing table or materialized
view without copying the data. Table settings and parameters such as designated
timestamp and symbol column indexes will be cloned, too.

\`\`\`questdb-sql title="Create table like"
CREATE TABLE new_table (LIKE my_table);
\`\`\`

## WITH table parameter

![Flow chart showing the syntax of keyword to specify WITH table parameter](/images/docs/diagrams/createTableWithMaxRowParam.svg)

The parameter influences how often commits of out-of-order data occur. It may be
set during table creation using the \`WITH\` keyword.

\`maxUncommittedRows\` - defines the maximum number of uncommitted rows per-table
to keep in memory before triggering a commit for a specific table.

The purpose of specifying maximum uncommitted rows per table is to reduce the
occurrences of resource-intensive commits when ingesting out-of-order data.

The global setting for the same parameter is \`cairo.max.uncommitted.rows\`.

\`\`\`questdb-sql title="Setting out-of-order table parameters via SQL"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
WITH maxUncommittedRows=250000;
\`\`\`

Checking the values per-table may be done using the \`tables()\` function:

\`\`\`questdb-sql title="List all tables"
SELECT id, table_name, maxUncommittedRows FROM tables();
\`\`\`

| id  | name         | maxUncommittedRows |
| :-- | :----------- | :----------------- |
| 1   | trades       | 250000             |
| 2   | sample_table | 50000              |

## Table target volume

The \`IN VOLUME\` clause is used to create a table in a different volume than the
standard. The table is created in the specified target volume, and a symbolic
link is created in the table's standard volume to point to it.

![Flow chart showing the syntax of keywords to specify a table target volume](/images/docs/diagrams/tableTargetVolumeDef.svg)

The use of the comma (\`,\`) depends on the existence of the \`WITH\` clause:

- If the \`WITH\` clause is present, a comma is mandatory before \`IN VOLUME\`:

  \`\`\`questdb-sql
  CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    amount DOUBLE
  ) TIMESTAMP(timestamp)
  PARTITION BY DAY
  WITH maxUncommittedRows=250000,
  IN VOLUME SECONDARY_VOLUME;
  \`\`\`

- If no \`WITH\` clause is used, the comma must not be added for the \`IN VOLUME\`
  segment:

  \`\`\`questdb-sql
  CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    amount DOUBLE
  ) TIMESTAMP(timestamp)
  PARTITION BY DAY
  IN VOLUME SECONDARY_VOLUME;
  \`\`\`

The use of quotation marks (\`'\`) depends on the volume alias:

- If the alias contains spaces, the quotation marks are required:

  \`\`\`questdb-sql
  CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    amount DOUBLE
  ) TIMESTAMP(timestamp)
  PARTITION BY DAY
  IN VOLUME 'SECONDARY_VOLUME';
  \`\`\`

- If the alias does not contain spaces, no quotation mark is necessary.

### Description

The table behaves the same way as if it had been created in the standard
(default) volume, with the exception that
[\`DROP TABLE\`](/docs/reference/sql/drop/) removes the symbolic link from the
standard volume but the content pointed to is left intact in its volume. A table
using the same name in the same volume cannot be created again as a result, it
requires manual intervention to either remove or rename the table's directory in
its volume.

### Configuration

The secondary table target volume is defined by \`cairo.volumes\` in
[\`server.conf\`](/docs/configuration/#cairo-engine). The default setting contains
an empty list, which means the feature is not enabled.

To enable the feature, define as many volume pairs as you need, with syntax
_alias -> volume-root-path_, and separate different pairs with a comma. For
example:

\`\`\`
cairo.volumes=SECONDARY_VOLUME -> /Users/quest/mounts/secondary, BIN -> /var/bin
\`\`\`

Additional notes about defining the alias and volume root paths:

- Aliases are case-insensitive.
- Volume root paths must be valid and exist at bootstrap time and at the time
  when the table is created.
- Aliases and/or volume root paths can be single quoted, it is not required.
`
  },
  {
    path: 'sql/datatypes.md',
    title: 'Data types',
    headers: ['N-dimensional array', 'VARCHAR and STRING considerations', 'TIMESTAMP and DATE considerations', 'Limitations for variable-sized types', 'Type nullability', 'The UUID type', 'IPv4'],
    content: `| Type Name         | Storage bits    | Nullable | Description                                                                                                                                                                                                                     |
|-------------------|-----------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| \`boolean\`         | \`1\`             | No       | Boolean \`true\` or \`false\`.                                                                                                                                                                                                      |
| \`ipv4\`            | \`32\`            | Yes      | \`0.0.0.1\` to \`255.255.255.255\`                                                                                                                                                                                                  |
| \`byte\`            | \`8\`             | No       | Signed integer, \`-128\` to \`127\`.                                                                                                                                                                                                |
| \`short\`           | \`16\`            | No       | Signed integer, \`-32,768\` to \`32,767\`.                                                                                                                                                                                          |
| \`char\`            | \`16\`            | Yes      | \`unicode\` character.                                                                                                                                                                                                            |
| \`int\`             | \`32\`            | Yes      | Signed integer, \`-2,147,483,648\` to \`2,147,483,647\`.                                                                                                                                                                            |
| \`float\`           | \`32\`            | Yes      | Single precision IEEE 754 floating point value.                                                                                                                                                                                 |
| \`symbol\`          | \`32\`            | Yes      | A symbol, stored as a 32-bit signed index into the symbol table. Each index corresponds to a \`string\` value. The index is transparently translated to the string value. Symbol table is stored separately from the column data. |
| \`varchar\`         | \`128 + utf8Len\` | Yes      | Length-prefixed sequence of UTF-8 encoded characters, stored using a 128-bit header and UTF-8 encoded data. Sequences shorter than 9 bytes are fully inlined within the header and do not occupy any additional data space.     |
| \`string\`          | \`96+n*16\`       | Yes      | Length-prefixed sequence of UTF-16 encoded characters whose length is stored as signed 32-bit integer with maximum value of \`0x7fffffff\`.                                                                                       |
| \`long\`            | \`64\`            | Yes      | Signed integer, \`-9,223,372,036,854,775,808\` to \`9,223,372,036,854,775,807\`.                                                                                                                                                    |
| \`date\`            | \`64\`            | Yes      | Signed offset in **milliseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                   |
| \`timestamp\`       | \`64\`            | Yes      | Signed offset in **microseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                   |
| \`double\`          | \`64\`            | Yes      | Double precision IEEE 754 floating point value.                                                                                                                                                                                 |
| \`uuid\`            | \`128\`           | Yes      | [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier) values. See also [the UUID type](#the-uuid-type).                                                                                                           |
| \`binary\`          | \`64+n*8\`        | Yes      | Length-prefixed sequence of bytes whose length is stored as signed 64-bit integer with maximum value of \`0x7fffffffffffffffL\`.                                                                                                  |
| \`long256\`         | \`256\`           | Yes      | Unsigned 256-bit integer. Does not support arithmetic operations, only equality checks. Suitable for storing a hash code, such as crypto public addresses.                                                                      |
| \`geohash(<size>)\` | \`8\`-\`64\`        | Yes      | Geohash with precision specified as a number followed by \`b\` for bits, \`c\` for chars. See [the geohashes documentation](/docs/concept/geohashes/) for details on use and storage.                                               |
| \`array\`           | See description | Yes      | Header: 20 + 4 \\* \`nDims\` bytes. Payload: dense array of values. Example: \`DOUBLE[3][4]\`: header 28 bytes, payload 3\\*4\\*8 = 96 bytes.                                                                                          |
| \`interval\`        | \`128\`           | Yes      | Pair of timestamps representing a time interval. Not a persisted type: you can use it in expressions, but can't have a database column of this type.                                                                            |

## N-dimensional array

In addition to the scalar types above, QuestDB also supports
[N-dimensional arrays](/docs/concept/array), currently only for the \`DOUBLE\`
type.

## VARCHAR and STRING considerations

QuestDB supports two types for storing strings: \`VARCHAR\` and \`STRING\`.

Most users should use \`VARCHAR\`. It uses the UTF-8 encoding, whereas \`STRING\`
uses UTF-16, which is less space-efficient for strings containing mostly ASCII
characters. QuestDB keeps supporting it only to maintain backward compatibility.

Additionally, \`VARCHAR\` includes several optimizations for fast access and
storage.

## TIMESTAMP and DATE considerations

While the \`date\` type is available, we highly recommend using the \`timestamp\`
instead. The only material advantage of \`date\` is a wider time range, but
\`timestamp\` is adequate in virtually all cases. It has microsecond resolution
(vs. milliseconds for \`date\`), and is fully supported by all date/time
functions, while support for \`date\` is limited.

## Limitations for variable-sized types

The maximum size of a single \`VARCHAR\` field is 268 MB, and the maximum total
size of a \`VARCHAR\` column in a single partition is 218 TB.

The maximum size of a \`BINARY\` field is defined by the limits of the 64-bit
signed integer (8,388,608 petabytes).

The maximum size of a \`STRING\` field is defined by the limits of the 32-bit
signed integer (1,073,741,824 characters).

The maximum number of dimensions an array can have is 32. The hard limit on the
total number of elements in an array (lengths of all dimensions multiplied
together) is \`2^31 - 1\` divided by the byte size of array element. For a
\`DOUBLE[]\`, this is \`2^28 - 1\` or 268,435,455. The actual limit QuestDB will
enforce is configurable via \`cairo.max.array.element.count\`, with the default of
10,000,000. The length of each individual dimension has a limit of \`2^28 - 1\` or
268,435,455, regardless of element size.

## Type nullability

Many nullable types reserve a value that marks them \`NULL\`:

| Type Name        | Null value                                                           | Description                                                                              |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| \`float\`          | \`NaN\`, \`+Infinity\`, \`-Infinity\`                                      | As defined by IEEE 754 (\`java.lang.Float.NaN\` etc.)                                      |
| \`double\`         | \`NaN\`, \`+Infinity\`, \`-Infinity\`                                      | As defined by IEEE 754 (\`java.lang.Double.NaN\`, etc.)                                    |
| \`long256\`        | \`0x8000000000000000800000000000000080000000000000008000000000000000\` | The value equals four consecutive \`long\` null literals.                                  |
| \`long\`           | \`0x8000000000000000L\`                                                | Minimum possible value a \`long\` can take, -2^63.                                         |
| \`date\`           | \`0x8000000000000000L\`                                                | Minimum possible value a \`long\` can take, -2^63.                                         |
| \`timestamp\`      | \`0x8000000000000000L\`                                                | Minimum possible value a \`long\` can take, -2^63.                                         |
| \`int\`            | \`0x80000000\`                                                         | Minimum possible value an \`int\` can take, -2^31.                                         |
| \`uuid\`           | \`80000000-0000-0000-8000-000000000000\`                               | Both 64 highest bits and 64 lowest bits set to -2^63.                                    |
| \`char\`           | \`0x0000\`                                                             | The zero char (\`NUL\` in ASCII).                                                          |
| \`geohash(byte)\`  | \`0xff\`                                                               | Valid for geohashes of 1 to 7 bits (inclusive).                                          |
| \`geohash(short)\` | \`0xffff\`                                                             | Valid for geohashes of 8 to 15 bits (inclusive).                                         |
| \`geohash(int)\`   | \`0xffffffff\`                                                         | Valid for geohashes of 16 to 31 bits (inclusive).                                        |
| \`geohash(long)\`  | \`0xffffffffffffffff\`                                                 | Valid for geohashes of 32 to 60 bits (inclusive).                                        |
| \`symbol\`         | \`0x80000000\`                                                         | Symbol is stored as an \`int\` offset into a lookup file. The value \`-1\` marks it \`NULL\`.  |
| \`ipv4\`           | \`0.0.0.0\` (\`0x00000000\`)                                             | IPv4 address is stored as a 32-bit integer and the zero value represents \`NULL\`.         |
| \`varchar\`        | \`N/A\`                                                                | Varchar column has an explicit \`NULL\` marker in the header.                              |
| \`string\`         | \`N/A\`                                                                | String column is length-prefixed, the length is an \`int\` and \`-1\` marks it \`NULL\`.       |
| \`binary\`         | \`N/A\`                                                                | Binary column is length prefixed, the length is a \`long\` and \`-1\` marks it \`NULL\`.       |
| \`array\`          | \`N/A\`                                                                | Array column marks a \`NULL\` value with a zero in the \`size\` field of the header.         |

To filter columns that contain, or don't contain, \`NULL\` values use a filter
like:

\`\`\`questdb-sql
SELECT * FROM <table> WHERE <column> = NULL;
SELECT * FROM <table> WHERE <column> != NULL;
\`\`\`

Alternatively, from version 6.3 use the NULL equality operator aliases:

\`\`\`questdb-sql
SELECT * FROM <table> WHERE <column> IS NULL;
SELECT * FROM <table> WHERE <column> IS NOT NULL;
\`\`\`

:::note

\`NULL\` values still occupy disk space.

:::

## The UUID type

QuestDB natively supports the \`UUID\` type, which should be used for \`UUID\`
columns instead of storing \`UUIDs\` as \`strings\`. \`UUID\` columns are internally
stored as 128-bit integers, allowing more efficient performance particularly in
filtering and sorting. Strings inserted into a \`UUID\` column is permitted but
the data will be converted to the \`UUID\` type.

\`\`\`questdb-sql title="Inserting strings into a UUID column"
CREATE TABLE my_table (
    id UUID
);
[...]
INSERT INTO my_table VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
[...]
SELECT * FROM my_table WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
\`\`\`

If you use the [PostgreSQL Wire Protocol](/docs/reference/api/postgres/) then
you can use the \`uuid\` type in your queries. The JDBC API does not distinguish
the UUID type, but the Postgres JDBC driver supports it in prepared statements:

\`\`\`java
UUID uuid = UUID.randomUUID();
PreparedStatement ps = connection.prepareStatement("INSERT INTO my_table VALUES (?)");
ps.setObject(1, uuid);
\`\`\`

[QuestDB Client Libraries](/docs/ingestion-overview/#first-party-clients) can
send \`UUIDs\` as \`strings\` to be converted to UUIDs by the server.

## IPv4

QuestDB supports the IPv4 data type. It has validity checks and some
IPv4-specific functions.

IPv4 addresses exist within the range of \`0.0.0.1\` - \`255.255.255.255\`.

An all-zero address - \`0.0.0.0\` - is interpreted as \`NULL\`.

Create a column with the IPv4 data type like this:

\`\`\`sql
-- Creating a table named traffic with two ipv4 columns: src and dst.
CREATE TABLE traffic (ts timestamp, src ipv4, dst ipv4) timestamp(ts) PARTITION BY DAY;
\`\`\`

IPv4 addresses support a wide range of existing SQL functions, and there are
some operators specifically for them. For a full list, see
[IPv4 Operators](/docs/reference/operators/ipv4/).

### Limitations

You cannot auto-create an IPv4 column using the InfluxDB Line Protocol, since it
doesn't support this type explicitly. The QuestDB server cannot distinguish
between string and IPv4 data. However, you can insert IPv4 data into a
pre-existing IPv4 column by sending IPs as strings.
`
  },
  {
    path: 'sql/declare.md',
    title: 'DECLARE keyword',
    headers: ['Syntax', 'Mechanics', 'Limitations'],
    content: `\`DECLARE\` specifies a series of variable bindings used throughout your query. 

This syntax is supported within \`SELECT\` queries.

## Syntax

![Flow chart showing the syntax of the DECLARE keyword](/images/docs/diagrams/declare.svg)

## Mechanics

The \`DECLARE\` keyword comes before the \`SELECT\` clause in your query:

\`\`\`questdb-sql title="Basic DECLARE" demo
DECLARE
    @x := 5
SELECT @x;
\`\`\`

Use the variable binding operator \`:=\` (walrus) to associate expressions to names.

:::tip

It is easy to accidentally omit the \`:\` when writing variable binding expressions.

Don't confuse the \`:=\` operator with a simple equality \`=\`!

You should see an error message like this:
> expected variable assignment operator \`:=\`

:::

The above example declares a single binding, which states that the variable \`@x\` is replaced with the constant integer \`5\`.

The variables are resolved at parse-time, meaning that the variable is no longer present
when the query is compiled. 

So the above example reduces to this simple query:

\`\`\`questdb-sql title="basic DECLARE post-reduction" demo
SELECT 5;
\`\`\`

| 5 |
|---|
| 5 |


### Multiple bindings

To declare multiple variables, set the bind expressions with commas \`,\`:

\`\`\`questdb-sql title="Multiple variable bindings" demo
DECLARE 
    @x := 5,
    @y := 2
SELECT @x + @y;
\`\`\`

| column |
|--------|
| 7      |

### Variables as functions

A variable need not be just a constant. It could also be a function call, 
and variables with function values can be nested:

\`\`\`questdb-sql title="declaring function variable" demo
DECLARE
  @today := today(),
  @start := interval_start(@today),
  @end := interval_end(@today)
SELECT @today = interval(@start, @end);
\`\`\`

| column |
|--------|
| true   |


### Declarations in subqueries

Declarations made in parent queries are available in subqueries. 

\`\`\`questdb-sql title="variable shadowing" demo
DECLARE
    @x := 5
SELECT y FROM (
    SELECT @x AS y
);
\`\`\`

| y |
|---| 
| 5 |

#### Shadowing

If a subquery declares a variable of the same name, then the variable is shadowed
and takes on the new value. 

However, any queries above this subquery are unaffected - the
variable bind is not globally mutated.

\`\`\`questdb-sql title="variable shadowing" demo
DECLARE
    @x := 5
SELECT @x + y FROM (
    DECLARE @x := 10
    SELECT @x AS y
);
\`\`\`

| column |
|--------|
| 15     |

### Declarations as subqueries

Declarations themselves can be subqueries. 

We suggest that this is not overused, as removing the subquery definition from its execution
location may make queries harder to debug.

Nevertheless, it is possible to define a variable as a subquery:

\`\`\`questdb-sql title="table cursor as a variable" demo
DECLARE
    @subquery := (SELECT timestamp FROM trades)
SELECT * FROM @subquery;
\`\`\`

You can even use already-declared variables to define your subquery variable:

\`\`\`questdb-sql title="nesting decls inside decl subqueries" demo
DECLARE
    @timestamp := timestamp,
    @symbol := symbol,
    @subquery := (SELECT @timestamp, @symbol FROM trades)
SELECT * FROM @subquery;
\`\`\`

### Declarations in CTEs

Naturally, \`DECLARE\` also works with CTEs:

\`\`\`questdb-sql title="declarations inside CTEs" demo
DECLARE 
  @x := 5
WITH first AS (
  DECLARE @x := 10
  SELECT @x as a -- a = 10
),
second AS (
  DECLARE @y := 4
  SELECT 
    @x + @y as b, -- b = 5 + 4 = 9
    a -- a = 10
    FROM first
)
SELECT a, b
FROM second;
\`\`\`

| a  | b |
|----|---|
| 10 | 9 |


### Bind variables

\`DECLARE\` syntax will work with prepared statements over PG Wire, so long as the client library
does not perform syntax validation that rejects the \`DECLARE\` syntax:

\`\`\`questdb-sql
DECLARE @x := ?, @y := ? 
SELECT @x::int + @y::int;

-- Then bind the following values: (1, 2)
\`\`\`

| column |
|--------|
| 3      |

This can be useful to minimise repeated bind variables. 

For example, rather than passing the same value to multiple positional arguments, 
you could instead use a declared variable and send a single bind variable:


\`\`\`questdb-sql
-- instead of this:
SELECT ? as name, id FROM users WHERE name = ?;

-- do this:
DECLARE @name := ?
SELECT @name as name, id FROM users WHERE name = @name;
\`\`\`
Or for repeating columns:

\`\`\`questdb-sql
DECLARE 
    @col = ?,
    @symbol = ?
SELECT avg(@col), min(@col), max(@col) 
FROM trades 
WHERE symbol = @symbol;
\`\`\`
## Limitations

Most basic expressions are supported, and we provide examples later in this document. 

We suggest you use variables to simplify repeated constants within your code, and minimise
how many places you need to update the constant.

### Disallowed expressions

However, not all expressions are supported. The following are explicitly disallowed:

#### Bracket lists

\`\`\`questdb-sql title="bracket lists are not allowed"
DECLARE
    @symbols := ('BTC-USD', 'ETH-USD')
SELECT timestamp, price, symbol
FROM trades
WHERE symbol IN @symbols;

-- error: unexpected bind expression - bracket lists not supported
\`\`\`

#### SQL statement fragments

\`\`\`questdb-sql title="sql fragments are not allowed"
DECLARE
    @x := FROM trades
SELECT 5 @x;

-- table and column names that are SQL keywords have to be enclosed in double quotes, such as "FROM"\`\`\`
\`\`\`

### Language client support

Some language SQL clients do not allow identifiers to be passed as if it was a normal value. One example is \`psycopg\`.
In this case, you should use an alternate API to splice in identifiers, for example:


\`\`\`python title="psycopg"
cur.execute(
    sql.SQL("""
        DECLARE @col := {}
        SELECT max(@col), min(@col), avg(price) 
        FROM btc_trades;
    """).format(sql.Identifier('price')))
\`\`\`

## Examples

### SAMPLE BY

\`\`\`questdb-sql title="DECLARE with SAMPLE BY" demo
DECLARE 
    @period := 1m,
    @window := '2024-11-25',
    @symbol := 'ETH-USD'
SELECT 
   timestamp, symbol, side, sum(amount) as volume 
FROM trades
WHERE side = 'sell' 
AND timestamp IN @window 
AND symbol = @symbol
SAMPLE BY @period 
FILL(NULL);
\`\`\`

| timestamp                   | symbol  | side | volume           |
|-----------------------------|---------|------|------------------|
| 2024-11-25T00:00:00.000000Z | ETH-USD | sell | 153.470574999999 | 
| 2024-11-25T00:01:00.000000Z | ETH-USD | sell | 298.927738       |
| 2024-11-25T00:02:00.000000Z | ETH-USD | sell | 66.253058        |
| ...                         | ...     | ...  | ...              |

### INSERT INTO SELECT

\`\`\`questdb-sql
INSERT INTO trades (timestamp, symbol) 
SELECT * FROM 
(
    DECLARE 
        @x := now(), 
        @y := 'ETH-USD' 
    SELECT @x as timestamp, @y as symbol
);
\`\`\`

### CREATE TABLE AS SELECT

\`\`\`questdb-sql
CREATE TABLE trades AS (
    DECLARE 
        @x := now(), 
        @y := 'ETH-USD' 
    SELECT @x as timestamp, @y as symbol, 123 as price
);
\`\`\`

`
  },
  {
    path: 'sql/distinct.md',
    title: 'DISTINCT keyword',
    headers: ['Syntax'],
    content: `\`SELECT DISTINCT\` is used to return only distinct (i.e different) values from a
column as part of a [SELECT statement](/docs/reference/sql/select/).

## Syntax

![Flow chart showing the syntax of the DISTINCT keyword](/images/docs/diagrams/distinct.svg)

## Examples

The following query will return a list of all unique ratings in the table.

\`\`\`questdb-sql title="Simple query"
SELECT DISTINCT movieId
FROM ratings;
\`\`\`

SELECT DISTINCT can be used in conjunction with more advanced queries and
filters.

\`\`\`questdb-sql title="With aggregate"
SELECT DISTINCT movieId, count()
FROM ratings;
\`\`\`

\`\`\`questdb-sql title="With filter"
SELECT DISTINCT movieId, count()
FROM ratings
WHERE score > 3;
\`\`\`
`
  },
  {
    path: 'sql/drop-mat-view.md',
    title: 'DROP MATERIALIZED VIEW',
    headers: ['Syntax', 'IF EXISTS', 'See also'],
    content: `:::info

Materialized View support is now generally available (GA) and ready for production use.

If you are using versions earlier than \`8.3.1\`, we suggest you upgrade at your earliest convenience.

:::

\`DROP MATERIALIZED VIEW\` permanently deletes a materialized view and its
contents.

The deletion is **permanent** and **not recoverable**, except if the view was
created in a non-standard volume. In such cases, the view is only logically
removed while the underlying data remains intact in its volume.

Disk space is reclaimed asynchronously after the materialized view is dropped.

Existing read queries for this view may delay space reclamation.

## Syntax

![Flow chart showing the syntax of the DROP MATERIALIZED VIEW keyword](/images/docs/diagrams/dropMatView.svg)

## Example

\`\`\`questdb-sql
DROP MATERIALIZED VIEW trades_1h;
\`\`\`

## IF EXISTS

Add an optional \`IF EXISTS\` clause after the \`DROP MATERIALIZED VIEW\` keywords
to indicate that the selected materialized view should be dropped, but only if
it exists.

## See also

For more information on the concept, see the the
[introduction](/docs/concept/mat-views/) and [guide](/docs/guides/mat-views/) on
materialized views.
`
  },
  {
    path: 'sql/drop.md',
    title: 'DROP TABLE keyword',
    headers: ['Syntax', 'Description', 'See also'],
    content: `\`DROP TABLE\` permanently deletes a table and its contents. \`DROP ALL TABLES\`
permanently deletes all tables, all materialized views, and their contents on disk.

:::note

[Backup your database](/docs/operations/backup/) to avoid unintended data loss.

:::

## Syntax

![Flow chart showing the syntax of the DROP TABLE keyword](/images/docs/diagrams/dropTable.svg)

### IF EXISTS

An optional \`IF EXISTS\` clause may be added directly after the \`DROP TABLE\`
keywords to indicate that the selected table should be dropped if it exists.

## Description

This command irremediably deletes the data in the target table. Unless the table
was created in a different volume than the standard, see
[CREATE TABLE IN VOLUME](/docs/reference/sql/create-table/#table-target-volume),
in which case the table is only logically removed and data remains intact in its
volume. In doubt, make sure you have created
[backups](/docs/operations/backup/) of your data.

Disk space is reclaimed asynchronously after the table is dropped. Ongoing table
reads might delay space reclamation.

## Example

\`\`\`questdb-sql
DROP TABLE ratings;
\`\`\`

\`\`\`questdb-sql
DROP ALL TABLES;
\`\`\`

## See also

To delete the data inside a table but keep the table and its structure, use
[TRUNCATE](/docs/reference/sql/truncate/).
`
  },
  {
    path: 'sql/explain.md',
    title: 'EXPLAIN keyword',
    headers: ['Syntax', 'Limitations:', 'See also'],
    content: `\`EXPLAIN\` displays the execution plan of an \`INSERT\`, \`SELECT\`, or \`UPDATE\`
statement.

## Syntax

![Flow chart showing the syntax of the EXPLAIN keyword](/images/docs/diagrams/explain.svg)

### Description

A query execution plan shows how a statement will be implemented: which table is
going to be accessed and how, what join method are employed, and which
predicates are JIT-compiled etc. \`EXPLAIN\` output is a tree of nodes containing
properties and subnodes (aka child nodes).

In a plan such as:

| QUERY PLAN                                                                 |
| -------------------------------------------------------------------------- |
| Async JIT Filter                                                           |
| &nbsp;&nbsp;filter: 100 \`<\` l                                              |
| &nbsp;&nbsp;workers: 1                                                     |
| &nbsp;&nbsp;&nbsp;&nbsp;DataFrame                                          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Row forward scan           |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Frame forward scan on: tab |

there are:

- 4 nodes:
  - Async JIT Filter
  - DataFrame
  - Row forward scan
  - Frame forward scan
- 2 properties (both belong to Async JIT Filter node):
  - filter
  - workers

For simplicity, some nodes have special properties shown on the same line as
type; for example, \`Filter filter: b.age=10\` or \`Limit lo: 10\`.

The following list contains some plan node types:

- \`Async Filter\` - a parallelized filter that evaluates expressions with Java
  code. In certain scenarios, it also implements the \`LIMIT\` keyword.
- \`Async JIT Filter\` - a parallelized filter that evaluates expressions with
  Just-In-Time-compiled filter. In certain scenarios, it also implements the
  \`LIMIT\` keyword.
- \`Interval forward\` - scans one or more table data ranges based on the
  designated timestamp predicates. Scan endpoints are found via a binary search
  on timestamp column.
- \`CachedWindow\` - container for window functions that copies data to memory and
  sorts it, e.g. [row_number()](/docs/reference/function/window/#row_number)
- \`Window\` - container for window functions optimized for frames ordered by
  designated timestamp. Instead of copying the underlying dataset to memory it
  buffers just enough per-partition values to compute function result.
- \`Count\` - returns the count of records in subnode.
- \`Cursor-order scan\` - scans table records using row ids taken from an index,
  in index order - first all row ids linked to index value A, then B, etc.
- \`DataFrame\` - full or partial table scan. It contains two children:
  - row cursor - which iterates over rows inside a frame (e.g.
    \`Row forward scan\`).
  - frame cursor - which iterates over table partitions or partition chunks
    (e.g. \`Frame forward scan\`).
- \`Filter\` - standalone (non-JIT-compiled, non-parallelized) filter.
- \`Frame forward/backward scan\` - scans table partitions in a specified
  direction.
- \`GroupBy\` - group by with or without key(s). If \`vectorized\` field shows
  \`true\`, then the node is parallelized and uses vectorized calculations.
- \`Hash\` - subnode of this node is used to build a hash table that is later
  looked up (usually in a \`JOIN\` clause but also applies to \`EXCEPT\` or
  \`INTERSECT\`).
- \`Index forward/backward scan\` - scans all row ids associated with a given
  \`symbol\` value from start to finish or vice versa.
- \`Limit\` - standalone node implementing the \`LIMIT\` keyword. Other nodes can
  implement \`LIMIT\` internally, e.g. the \`Sort\` node.
- \`Row forward/backward scan\` - scans data frame (usually partitioned) records
  in a specified direction.
- \`Sort\` - sorts data. If low or hi property is specified, then the sort buffer
  size is limited and a number of rows are skipped after sorting.
- \`SampleBy\` - \`SAMPLE BY\` keyword implementation. If the \`fill\` is not shown,
  it means \`fill(none)\`.
- \`Selected Record\` - used to reorder or rename columns. It does not do any
  significant processing on its own.
- \`Table-order scan\` - scans table records using row ids taken from an index in
  table (physical) order - from the lowest to highest row id.
- \`VirtualRecord\` - adds expressions to a subnode's columns.

Other node types should be easy to link to SQL and database concepts, e.g.
\`Except\`, \`Hash Join\` or \`Lt Join\`.

Many nodes, especially join and sort, have 'light' and 'heavy' variants, e.g.
\`Hash Join Light\` and \`Hash Join\`. The former is used when child node(s) support
efficient random access lookups (e.g. \`DataFrame\`) so storing row id in the
buffer is enough; otherwise, the whole record needs to be copied and the 'heavy'
factory is used.

## Examples

To illustrate how \`EXPLAIN\` works, consider the \`trades\` table
[in the QuestDB demo instance](https://demo.questdb.io/):

\`\`\`questdb-sql
CREATE TABLE trades (
  symbol SYMBOL CAPACITY 256 CACHE,
  side SYMBOL CAPACITY 256 CACHE,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP (timestamp) PARTITION BY DAY
\`\`\`

### Using \`EXPLAIN\` for the plan for \`SELECT\`

The following query highlight the plan for \`ORDER BY\` for the table:

\`\`\`questdb-sql
EXPLAIN SELECT * FROM trades ORDER BY ts DESC;
\`\`\`

| QUERY PLAN                                             |
| ------------------------------------------------------ |
| DataFrame                                              |
| &nbsp;&nbsp;&nbsp;&nbsp;Row backward scan              |
| &nbsp;&nbsp;&nbsp;&nbsp;Frame backward scan on: trades |

The plan shows that no sort is required and the result is produced by scanning
the table backward. The scanning direction is possible because the data in the
\`trades\` table is stored in timestamp order.

Now, let's check the plan for \`trades\` with a simple filter:

\`\`\`questdb-sql
EXPLAIN SELECT * FROM trades WHERE amount > 100.0;
\`\`\`

| QUERY PLAN                                                                    |
| ----------------------------------------------------------------------------- |
| Async JIT Filter                                                              |
| &nbsp;&nbsp;filter: 100.0 \`<\` amount                                          |
| &nbsp;&nbsp;workers: 1                                                        |
| &nbsp;&nbsp;&nbsp;&nbsp;DataFrame                                             |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Row forward scan              |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Frame forward scan on: trades |

In this example, the plan shows that the \`trades\` table undergoes a full scan
(\`DataFrame\` and subnodes) and the data is processed by the parallelized
JIT-compiled filter.

### Using \`EXPLAIN\` for the plan for \`CREATE\` and \`INSERT\`

Apart from \`SELECT\`, \`EXPLAIN\` also works on \`CREATE\` and \`INSERT\` statements.
Single-row inserts are straightforward. The examples in this section show the
plan for more complicated \`CREATE\` and \`INSERT\` queries.

\`\`\`questdb-sql
EXPLAIN CREATE TABLE trades AS
(
  SELECT
    rnd_symbol('a', 'b') symbol,
    rnd_symbol('Buy', 'Sell') side,
    rnd_double() price,
    rnd_double() amount,
    x::timestamp timestamp
  FROM long_sequence(10)
) TIMESTAMP(timestamp) PARTITION BY DAY;
\`\`\`

| QUERY PLAN                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- |
| Create table: trades                                                                                                             |
| &nbsp;&nbsp;&nbsp;&nbsp;VirtualRecord                                                                                            |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;functions: [rnd_symbol([a,b]),rnd_symbol([Buy,Sell]),rnd_double(),rnd_double(),x::timestamp] |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;long_sequence count: 10                                                          |

The plan above shows that the data is fetched from a \`long_sequence\` cursor,
with random data generating functions called in \`VirtualRecord\`.

The same applies to the following query:

\`\`\`questdb-sql
EXPLAIN INSERT INTO trades
  SELECT
    rnd_symbol('a', 'b') symbol,
    rnd_symbol('Buy', 'Sell') side,
    rnd_double() price,
    rnd_double() amount,
    x::timestamp timestamp
  FROM long_sequence(10);
\`\`\`

| QUERY PLAN                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- |
| Insert into table: trades                                                                                                        |
| &nbsp;&nbsp;&nbsp;&nbsp;VirtualRecord                                                                                            |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;functions: [rnd_symbol([a,b]),rnd_symbol([Buy,Sell]),rnd_double(),rnd_double(),x::timestamp] |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;long_sequence count: 10                                                          |

Of course, statements could be much more complex than that. Consider the
following \`UPDATE\` query:

\`\`\`questdb-sql
EXPLAIN UPDATE trades SET amount = 0 WHERE timestamp IN '2022-11-11';
\`\`\`

| QUERY PLAN                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ |
| Update table: trades                                                                                                                       |
| &nbsp;&nbsp;&nbsp;&nbsp;VirtualRecord                                                                                                      |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;functions: [0]                                                                                         |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;DataFrame                                                                                  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Row forward scan                                                   |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Interval forward scan on: trades                                   |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;intervals: [static=[1668124800000000,1668211199999999] |

The important bit here is \`Interval forward scan\`. It means that the table is
forward scanned only between points designated by the
\`timestamp IN '2022-11-11'\` predicate, that is between
\`2022-11-11 00:00:00,000000\` and \`2022-11-11 23:59:59,999999\` (shown as raw
epoch micro values in the plan above). \`VirtualRecord\` is only used to pass 0
constant for each row coming from \`DataFrame\`.

## Limitations:

To minimize resource usage, the \`EXPLAIN\` command does not execute the
statement, to avoid paying a potentially large upfront cost for certain queries
(especially those involving hash join or sort).

\`EXPLAIN\` provides a useful indication of the query execution, but it does not
guarantee to show the actual execution plan. This is because elements determined
during query runtime are missing.

While \`EXPLAIN\` shows the number of workers that could be used by a parallelized
node it is only the upper limit. Depending on the data volume and system load, a
query can use fewer workers.

:::note

Under the hood, the plan nodes are called \`Factories\`. Most plan nodes can be
mapped to implementation by adding the \`RecordCursorFactory\` or
\`FrameCursorFactory\` suffix, e.g.

- \`DataFrame\` -> \`DataFrameRecordCursorFactory\`
- \`Async JIT Filter\` -> \`AsyncJitFilteredRecordCursorFactory\`
- \`SampleByFillNoneNotKeyed\` -> \`SampleByFillNoneNotKeyedRecordCursorFactory\`
  while some are a bit harder to identify, e.g.
- \`GroupByRecord vectorized: false\` ->
  \`io.questdb.griffin.engine.groupby.GroupByRecordCursorFactory\`
- \`GroupByRecord vectorized: true\` ->
  \`io.questdb.griffin.engine.groupby.vect.GroupByRecordCursorFactory\`

Other classes can be identified by searching for the node name in the \`toPlan()\`
methods.

:::

## See also

This section includes links to additional information such as tutorials:

- [EXPLAIN Your SQL Query Plan](/blog/explain-sql-query-plan/)
- [Exploring Query Plan Scan Nodes with SQL EXPLAIN](/blog/exploring-query-plan-scan-nodes-sql-explain/)
`
  },
  {
    path: 'sql/fill.md',
    title: 'FILL keyword',
    headers: [],
    content: `Queries using a [SAMPLE BY](/docs/reference/sql/sample-by/) aggregate on data
which has missing records may return a discontinuous series of results. The
\`FILL\` keyword allows for specifying a fill behavior for results which have
missing aggregates due to missing rows.

Details for the \`FILL\` keyword can be found on the
[SAMPLE BY](/docs/reference/sql/sample-by/) page.

To specify a default handling for \`null\` values within queries, see the
[coalesce() function](/docs/reference/function/conditional/#coalesce)
documentation.
`
  },
  {
    path: 'sql/group-by.md',
    title: 'GROUP BY keyword',
    headers: ['Syntax'],
    content: `Groups aggregation calculations by one or several keys. In QuestDB, this clause
is [optional](/docs/concept/sql-extensions/#group-by-is-optional).

## Syntax

![Flow chart showing the syntax of the GROUP BY keyword](/images/docs/diagrams/groupBy.svg)

:::note

QuestDB groups aggregation results implicitly and does not require the GROUP BY
keyword. It is only supported for convenience. Using the GROUP BY clause
explicitly will return the same results as if the clause was omitted.

:::

## Examples

The below queries perform aggregations on a single key. Using \`GROUP BY\`
explicitly or implicitly yields the same results:

\`\`\`questdb-sql title="Single key aggregation, explicit GROUP BY"
SELECT sensorId, avg(temp)
FROM readings
GROUP BY sensorId;
\`\`\`

\`\`\`questdb-sql title="Single key aggregation, implicit GROUP BY"
SELECT sensorId, avg(temp)
FROM readings;
\`\`\`

The below queries perform aggregations on multiple keys. Using \`GROUP BY\`
explicitly or implicitly yields the same results:

\`\`\`questdb-sql title="Multiple key aggregation, explicit GROUP BY"
SELECT sensorId, sensorType, avg(temp)
FROM readings
GROUP BY sensorId,sensorType;
\`\`\`

\`\`\`questdb-sql title="Multiple key aggregation, implicit GROUP BY"
SELECT sensorId, sensorType, avg(temp)
FROM readings;
\`\`\`

When used explicitly, the list of keys in the \`GROUP BY\` clause must match the
list of keys in the \`SELECT\` clause, otherwise an error will be returned:

\`\`\`questdb-sql title="Error - Column b is missing in the GROUP BY clause"
SELECT a, b, avg(temp)
FROM tab
GROUP BY a;
\`\`\`

\`\`\`questdb-sql title="Error - Column b is missing in the SELECT clause"
SELECT a, avg(temp)
FROM tab
GROUP BY a, b;
\`\`\`

\`\`\`questdb-sql title="Success - Columns match"
SELECT a, b, avg(temp)
FROM tab
GROUP BY a, b;
\`\`\`
`
  },
  {
    path: 'sql/insert.md',
    title: 'INSERT keyword',
    headers: ['Syntax'],
    content: `\`INSERT\` ingests selected data into a database table.

## Syntax

Inserting values directly or using sub-queries:

![Flow chart showing the syntax of the INSERT keyword](/images/docs/diagrams/insert.svg)

Inserting using sub-query alias:

![Flow chart showing the syntax of the WITH AS INSERT keyword](/images/docs/diagrams/withAsInsert.svg)

### Description

:::note

If the target partition is
[attached by a symbolic link](/docs/reference/sql/alter-table-attach-partition/#symbolic-links),
the partition is read-only. \`INSERT\` operation on a read-only partition triggers
a critical-level log in the server, and the insert is a no-op.

:::

Inserting values directly or using sub-queries:

- \`VALUE\`: Directly defines the values to be inserted.
- \`SELECT\`: Inserts values based on the result of a
  [SELECT](/docs/reference/sql/select/) query

Setting sub-query alias:

- \`WITH AS\`: Inserts values based on a sub-query, to which an alias is given by
  using [WITH](/docs/reference/sql/with/).

Parameter:

- \`batch\` expects a \`batchCount\` (integer) value defining how many records to
  process at any one time.

## Examples

\`\`\`questdb-sql title="Inserting all columns"
INSERT INTO trades
VALUES(
    '2021-10-05T11:31:35.878Z',
    'AAPL',
    255,
    123.33,
    'B');
\`\`\`

\`\`\`questdb-sql title="Bulk inserts"
INSERT INTO trades
VALUES
    ('2021-10-05T11:31:35.878Z', 'AAPL', 245, 123.4, 'C'),
    ('2021-10-05T12:31:35.878Z', 'AAPL', 245, 123.3, 'C'),
    ('2021-10-05T13:31:35.878Z', 'AAPL', 250, 123.1, 'C'),
    ('2021-10-05T14:31:35.878Z', 'AAPL', 250, 123.0, 'C');
\`\`\`

\`\`\`questdb-sql title="Specifying schema"
INSERT INTO trades (timestamp, symbol, quantity, price, side)
VALUES(
    to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
    'AAPL',
    255,
    123.33,
    'B');
\`\`\`

:::note

Columns can be omitted during \`INSERT\` in which case the value will be \`NULL\`

:::

\`\`\`questdb-sql title="Inserting only specific columns"
INSERT INTO trades (timestamp, symbol, price)
VALUES(to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),'AAPL','B');
\`\`\`

### Inserting query results

This method allows you to insert as many rows as your query returns at once.

\`\`\`questdb-sql title="Insert as select"
INSERT INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';
\`\`\`

Using the [\`WITH\` keyword](/docs/reference/sql/with/) to set up an alias for a
\`SELECT\` sub-query:

\`\`\`questdb-sql title="Insert with sub-query"
WITH confirmed_id AS (
    SELECT * FROM unconfirmed_trades
    WHERE trade_id = '47219345234'
)
INSERT INTO confirmed_trades
SELECT * FROM confirmed_id;
\`\`\`

:::note

Since QuestDB v7.4.0, the default behaviour for \`INSERT INTO SELECT\` has been
changed.

Previously, the table would be created atomically. For large tables, this
requires a significant amount of RAM, and can cause errors if the database runs
out of memory.

By default, this will be performed in batches. If the query fails, partial data
may be inserted.

If this is a problem, it is recommended to use the ATOMIC keyword
(\`INSERT ATOMIC INTO\`). Alternatively, enabling deduplication on the table will
allow you to perform an idempotent insert to re-insert any missed data.

:::

### ATOMIC

Inserts can be performed created atomically, which first loads all of the data
and then commits in a single transaction.

This requires the data to be available in memory all at once, so for large
inserts, this may have performance issues.

To force this behaviour, one can use the \`ATOMIC\` keyword:

\`\`\`questdb-sql title="Insert as select atomically"
INSERT ATOMIC INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';
\`\`\`

### BATCH

By default, data will be inserted in batches.

The size of the batches can be configured:

- globally, by setting the \`cairo.sql.insert.model.batch.size\` configuration
  option in \`server.conf\`.
- locally, by using the \`BATCH\` keyword in the \`INSERT INTO\` statement.

The composition is \`INSERT\` + \`BATCH\` + number of rows + \`INTO\` + \`TABLE\`,
followed by the \`SELECT\` statement.

In our example, we use 4096 as the batch size:

\`\`\`questdb-sql title="Insert as select batched"
INSERT BATCH 4096 INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';
\`\`\`

One can also specify the out-of-order commit lag for these batched writes, using
the o3MaxLag option:

\`\`\`questdb-sql title="Insert as select with batching and O3 lag"
INSERT BATCH 4096 o3MaxLag '1s' INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';
\`\`\`
`
  },
  {
    path: 'sql/join.md',
    title: 'JOIN keyword',
    headers: ['Syntax', 'Execution order', 'Implicit joins', 'Using the `ON` clause for the `JOIN` predicate', 'ASOF JOIN', '(INNER) JOIN', 'LEFT (OUTER) JOIN', 'CROSS JOIN', 'LT JOIN', 'SPLICE JOIN'],
    content: `QuestDB supports the type of joins you can frequently find in
[relational databases](/glossary/relational-database/): \`INNER\`, \`LEFT (OUTER)\`,
\`CROSS\`. Additionally, it implements joins which are particularly useful for
time-series analytics: \`ASOF\`, \`LT\`, and \`SPLICE\`. \`FULL\` joins are not yet
implemented and are on our roadmap.

All supported join types can be combined in a single SQL statement; QuestDB
SQL's optimizer determines the best execution order and algorithms.

There are no known limitations on the size of tables or sub-queries used in
joins and there are no limitations on the number of joins, either.

## Syntax

High-level overview:

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/images/docs/diagrams/joinOverview.svg)

- \`selectClause\` - see [SELECT](/docs/reference/sql/select/) for more
  information.
- \`whereClause\` - see [WHERE](/docs/reference/sql/where/) for more information.
- The specific syntax for \`joinClause\` depends on the type of \`JOIN\`:

  - \`INNER\` and \`LEFT\` \`JOIN\` has a mandatory \`ON\` clause allowing arbitrary
    \`JOIN\` predicates, \`operator\`:

  ![Flow chart showing the syntax of the INNER, LEFT JOIN keyword](/images/docs/diagrams/InnerLeftJoin.svg)

  - \`ASOF\`, \`LT\`, and \`SPLICE\` \`JOIN\` has optional \`ON\` clause allowing only the
    \`=\` predicate. 
  - \`ASOF\` and \`LT\` join additionally allows an optional \`TOLERANCE\` clause:

  ![Flow chart showing the syntax of the ASOF, LT, and SPLICE JOIN keyword](/images/docs/diagrams/AsofLtSpliceJoin.svg)

  - \`CROSS JOIN\` does not allow any \`ON\` clause:

  ![Flow chart showing the syntax of the CROSS JOIN keyword](/images/docs/diagrams/crossJoin.svg)

Columns from joined tables are combined in a single row. Columns with the same
name originating from different tables will be automatically aliased to create a
unique column namespace of the resulting set.

Though it is usually preferable to explicitly specify join conditions, QuestDB
will analyze \`WHERE\` clauses for implicit join conditions and will derive
transient join conditions where necessary.

## Execution order

Join operations are performed in order of their appearance in a SQL query. The
following query performs a join on a table with a very small table (just one row
in this example) and a bigger table with 10 million rows:

\`\`\`questdb-sql
WITH
  Manytrades AS
    (SELECT * FROM trades limit 10000000),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM Lookup
INNER JOIN ManyTrades
  ON Lookup.symbol = Manytrades.symbol;
\`\`\`

The performance of this query can be improved by rewriting the query as follows:

\`\`\`questdb-sql
WITH
  Manytrades AS
    (SELECT * FROM trades limit 10000000),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
INNER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
\`\`\`

As a general rule, whenever you have a table significantly larger than the
other, try to use the large one first. If you use \`EXPLAIN\` with the queries
above, you should see the first version needs to Hash over 10 million rows,
while the second version needs to Hash only over 1 row.

## Implicit joins

It is possible to join two tables using the following syntax:

\`\`\`questdb-sql
SELECT *
FROM a, b
WHERE a.id = b.id;
\`\`\`

The type of join as well as the column are inferred from the \`WHERE\` clause, and
may be either an \`INNER\` or \`CROSS\` join. For the example above, the equivalent
explicit statement would be:

\`\`\`questdb-sql
SELECT *
FROM a
JOIN b ON (id);
\`\`\`

## Using the \`ON\` clause for the \`JOIN\` predicate

When tables are joined on a column that has the same name in both tables you can
use the \`ON (column)\` shorthand.

When the \`ON\` clause is permitted (all except \`CROSS JOIN\`), it is possible to
join multiple columns.

For example, the following two tables contain identical column names \`symbol\`
and \`side\`:

\`mayTrades\`:

<div className="pink-table">

| symbol  | side | total  |
| ------- | ---- | ------ |
| ADA-BTC | buy  | 8079   |
| ADA-BTC | sell | 7678   |
| ADA-USD | buy  | 308271 |
| ADA-USD | sell | 279624 |

</div>

\`juneTrades\`:

<div className="blue-table">

| symbol  | side | total  |
| ------- | ---- | ------ |
| ADA-BTC | buy  | 10253  |
| ADA-BTC | sell | 17460  |
| ADA-USD | buy  | 312359 |
| ADA-USD | sell | 245066 |

</div>

It is possible to add multiple JOIN ON condition:

\`\`\`questdb-sql
WITH
  mayTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-05'
    ORDER BY Symbol
    LIMIT 4
  ),
  juneTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-06'
    ORDER BY Symbol
    LIMIT 4
  )
SELECT *
FROM mayTrades
JOIN JuneTrades
  ON mayTrades.symbol = juneTrades.symbol
    AND mayTrades.side = juneTrades.side;
\`\`\`

The query can be simplified further since the column names are identical:

\`\`\`questdb-sql
WITH
  mayTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-05'
    ORDER BY Symbol
    LIMIT 4
  ),
  juneTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-06'
    ORDER BY Symbol
    LIMIT 4
  )
SELECT *
FROM mayTrades
JOIN JuneTrades ON (symbol, side);
\`\`\`

The result of both queries is the following:

<div className="table-alternate">

| symbol  | symbol1 | side | side1 | total  | total1 |
| ------- | ------- | ---- | ----- | ------ | ------ |
| ADA-BTC | ADA-BTC | buy  | buy   | 8079   | 10253  |
| ADA-BTC | ADA-BTC | sell | sell  | 7678   | 17460  |
| ADA-USD | ADA-USD | buy  | buy   | 308271 | 312359 |
| ADA-USD | ADA-USD | sell | sell  | 279624 | 245066 |

</div>

## ASOF JOIN

ASOF JOIN is a powerful time-series join extension.

It has its own page, [ASOF JOIN](/docs/reference/sql/asof-join/).

## (INNER) JOIN

\`(INNER) JOIN\` returns rows from two tables where the records on the compared
column have matching values in both tables. \`JOIN\` is interpreted as
\`INNER JOIN\` by default, making the \`INNER\` keyword implicit.

The query we just saw above is an example. It returns the \`symbol\`, \`side\` and
\`total\` from the \`mayTrades\` subquery, and adds the \`symbol\`, \`side\`, and
\`total\` from the \`juneTrades\` subquery. Both tables are matched based on the
\`symbol\` and \`side\`, as specified on the \`ON\` condition.

## LEFT (OUTER) JOIN

\`LEFT OUTER JOIN\` or simply \`LEFT JOIN\` returns **all** records from the left
table, and if matched, the records of the right table. When there is no match
for the right table, it returns \`NULL\` values in right table fields.

The general syntax is as follows:

\`\`\`questdb-sql title="LEFT JOIN ON"
WITH
  Manytrades AS
    (SELECT * FROM trades limit 100),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
LEFT OUTER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
\`\`\`

In this example, the result will have 100 rows, one for each row on the
\`ManyTrades\` subquery. When there is no match with the \`Lookup\` subquery, the
columns \`Symbol1\` and \`Description\` will be \`null\`.

\`\`\`sql
-- Omitting 'OUTER' makes no difference:
WITH
  Manytrades AS
    (SELECT * FROM trades limit 100),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
LEFT JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
\`\`\`

A \`LEFT OUTER JOIN\` query can also be used to select all rows in the left table
that do not exist in the right table.

\`\`\`questdb-sql
WITH
  Manytrades AS
    (SELECT * FROM trades limit 100),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
LEFT OUTER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol
WHERE Lookup.Symbol = NULL;
\`\`\`

In this case, the result has 71 rows out of the 100 in the larger table, and the
columns corresponding to the \`Lookup\` table are all \`NULL\`.

## CROSS JOIN

\`CROSS JOIN\` returns the Cartesian product of the two tables being joined and
can be used to create a table with all possible combinations of columns.

The following query is joining a table (a subquery in this case) with itself, to
compare row by row if we have any rows with exactly the same values for all the
columns except the timestamp, and if the timestamps are within 10 seconds from
each other:

\`\`\`questdb-sql
-- detect potential duplicates, with same values
-- and within a 10 seconds range

WITH t AS (
  SELECT * FROM trades WHERE timestamp IN '2024-06-01'
)
SELECT * from t CROSS JOIN t AS t2
WHERE t.timestamp < t2.timestamp
  AND datediff('s', t.timestamp , t2.timestamp ) < 10
  AND t.symbol = t2.symbol
  AND t.side = t2.side
  AND t.price = t2.price
  AND t.amount = t2.amount;
\`\`\`

:::note

\`CROSS JOIN\` does not have an \`ON\` clause.

:::

## LT JOIN

Similar to [\`ASOF JOIN\`](/docs/reference/sql/asof-join/), \`LT JOIN\` joins two different time-series measured. For
each row in the first time-series, the \`LT JOIN\` takes from the second
time-series a timestamp that meets both of the following criteria:

- The timestamp is the closest to the first timestamp.
- The timestamp is **strictly prior to** the first timestamp.

In other words: \`LT JOIN\` won't join records with equal timestamps.

### Example

Consider the following tables:

Table \`tradesA\`:

<div className="pink-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2022-03-08T18:03:57.710419Z | 39269.98 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |

</div>

Table \`tradesB\`:

<div className="blue-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2022-03-08T18:03:57.710419Z | 39269.98 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |

</div>

An \`LT JOIN\` can be built using the following query:

\`\`\`questdb-sql
WITH miniTrades AS (
  SELECT timestamp, price
  FROM TRADES
  WHERE symbol = 'BTC-USD'
  LIMIT 3
)
SELECT tradesA.timestamp, tradesB.timestamp, tradesA.price
FROM miniTrades tradesA
LT JOIN miniTrades tradesB;
\`\`\`

The query above returns the following results:

<div className="table-alternate">

| timestamp                   | timestamp1                  | price    |
| --------------------------- | --------------------------- | -------- |
| 2022-03-08T18:03:57.710419Z | NULL                        | 39269.98 |
| 2022-03-08T18:03:58.357448Z | 2022-03-08T18:03:57.710419Z | 39265.31 |
| 2022-03-08T18:03:58.357448Z | 2022-03-08T18:03:57.710419Z | 39265.31 |

</div>

Notice how the first record in the \`tradesA\` table is not joined with any record
in the \`tradesB\` table. This is because there is no record in the \`tradesB\`
table with a timestamp prior to the timestamp of the first record in the
\`tradesA\` table.

Similarly, the second record in the \`tradesB\` table is joined with the first
record in the \`tradesA\` table because the timestamp of the first record in the
\`tradesB\` table is prior to the timestamp of the second record in the \`tradesA\`
table.

:::note

As seen on this example, \`LT\` join is often useful to join a table to itself in
order to get preceding values for every row.

:::

The \`ON\` clause can also be used in combination with \`LT JOIN\` to join both by
timestamp and column values.

### TOLERANCE clause
The \`TOLERANCE\` clause enhances LT JOIN by limiting how far back in time the join should look for a match in the right
table. The \`TOLERANCE\` parameter accepts a time interval value (e.g., 2s, 100ms, 1d).

When specified, a record from the left table t1 at t1.ts will only be joined with a record from the right table t2 at
t2.ts if both conditions are met: \`t2.ts < t1.ts\` and \`t1.ts - t2.ts <= tolerance_value\`

This ensures that the matched record from the right table is not only the latest one on or before t1.ts, but also within
the specified time window.

\`\`\`questdb-sql title="LT JOIN with a TOLERANCE parameter"
SELECT ...
FROM table1
LT JOIN table2 TOLERANCE 10s
[WHERE ...]
\`\`\`

The interval_literal must be a valid QuestDB interval string, like '5s' (5 seconds), '100ms' (100 milliseconds),
'2m' ( 2 minutes), '3h' (3 hours), or '1d' (1 day).

#### Supported Units for interval_literal
The \`TOLERANCE\` interval literal supports the following time unit qualifiers:
- U: Microseconds
- T: Milliseconds
- s: Seconds
- m: Minutes
- h: Hours
- d: Days
- w: Weeks

For example, '100U' is 100 microseconds, '50T' is 50 milliseconds, '2s' is 2 seconds, '30m' is 30 minutes,
'1h' is 1 hour, '7d' is 7 days, and '2w' is 2 weeks. Please note that months (M) and years (Y) are not supported as
units for the \`TOLERANCE\` clause.

See [\`ASOF JOIN documentation\`](/docs/reference/sql/asof-join#tolerance-clause) for more examples with the \`TOLERANCE\` clause.

## SPLICE JOIN

\`SPLICE JOIN\` is a full \`ASOF JOIN\`. It will return all the records from both
tables. For each record from left table splice join will find prevailing record
from right table and for each record from right table - prevailing record from
left table.

Considering the following tables:

Table \`buy\` (the left table):

<div className="pink-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2024-06-22T00:00:00.039906Z | 0.092014 |
| 2024-06-22T00:00:00.343909Z | 9.805    |

</div>

The \`sell\` table (the right table):

<div className="blue-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2024-06-22T00:00:00.222534Z | 64120.28 |
| 2024-06-22T00:00:00.222534Z | 64120.28 |

</div>

A \`SPLICE JOIN\` can be built as follows:

\`\`\`questdb-sql
WITH
buy AS (  -- select the first 5 buys in June 22
  SELECT timestamp, price FROM trades
  WHERE timestamp IN '2024-06-22' AND side = 'buy' LIMIT 2
),
sell AS ( -- select the first 5 sells in June 22
  SELECT timestamp, price FROM trades
  WHERE timestamp IN '2024-06-22' AND side = 'sell' LIMIT 2
)
SELECT
  buy.timestamp, sell.timestamp, buy.price, sell.price
FROM buy
SPLICE JOIN sell;
\`\`\`

This query returns the following results:

<div className="table-alternate">

| timestamp                   | timestamp1                  | price    | price1   |
| --------------------------- | --------------------------- | -------- | -------- |
| 2024-06-22T00:00:00.039906Z | NULL                        | 0.092014 | NULL     |
| 2024-06-22T00:00:00.039906Z | 2024-06-22T00:00:00.222534Z | 0.092014 | 64120.28 |
| 2024-06-22T00:00:00.039906Z | 2024-06-22T00:00:00.222534Z | 0.092014 | 64120.28 |
| 2024-06-22T00:00:00.343909Z | 2024-06-22T00:00:00.222534Z | 9.805    | 64120.28 |

</div>

Note that the above query does not use the optional \`ON\` clause. In case you
need additional filtering on the two tables, the \`ON\` clause can also be used.
`
  },
  {
    path: 'sql/latest-on.md',
    title: 'LATEST ON keyword',
    headers: ['Syntax', 'Description'],
    content: `Retrieves the latest entry by timestamp for a given key or combination of keys,
for scenarios where multiple time series are stored in the same table.

## Syntax

![Flow chart showing the syntax of the LATEST ON keyword](/images/docs/diagrams/latestOn.svg)

where:

- \`columnName\` used in the \`LATEST ON\` part of the clause is a \`TIMESTAMP\`
  column.
- \`columnName\` list used in the \`PARTITION BY\` part of the clause is a list of
  columns of one of the following types: \`SYMBOL\`, \`STRING\`, \`BOOLEAN\`, \`SHORT\`,
  \`INT\`, \`LONG\`, \`LONG256\`, \`CHAR\`.

## Description

\`LATEST ON\` is used as part of a [SELECT statement](/docs/reference/sql/select/)
for returning the most recent records per unique time series identified by the
\`PARTITION BY\` column values.

\`LATEST ON\` requires a
[designated timestamp](/docs/concept/designated-timestamp/) column. Use
[sub-queries](#latest-on-over-sub-query) for tables without the designated
timestamp.

The query syntax has an impact on the [execution order](#execution-order) of the
\`LATEST ON\` clause and the \`WHERE\` clause.

To illustrate how \`LATEST ON\` is intended to be used, consider the \`trips\` table
[in the QuestDB demo instance](https://demo.questdb.io/). This table has a
\`payment_type\` column as \`SYMBOL\` type which specifies the method of payment per
trip. We can find the most recent trip for each unique method of payment with
the following query:

\`\`\`questdb-sql
SELECT payment_type, pickup_datetime, trip_distance
FROM trips
LATEST ON pickup_datetime PARTITION BY payment_type;
\`\`\`

| payment_type | pickup_datetime             | trip_distance |
| ------------ | --------------------------- | ------------- |
| Dispute      | 2014-12-31T23:55:27.000000Z | 1.2           |
| Voided       | 2019-06-27T17:56:45.000000Z | 1.9           |
| Unknown      | 2019-06-30T23:57:42.000000Z | 3.9           |
| No Charge    | 2019-06-30T23:59:30.000000Z | 5.2           |
| Cash         | 2019-06-30T23:59:54.000000Z | 2             |
| Card         | 2019-06-30T23:59:56.000000Z | 1             |

The above query returns the latest value within each time series stored in the
table. Those time series are determined based on the values in the column(s)
specified in the \`LATEST ON\` clause. In our example those time series are
represented by different payment types. Then the column used in the \`LATEST ON\`
part of the clause stands for the designated timestamp column for the table.
This allows the database to find the latest value within each time series.

## Examples

For the next examples, we can create a table called \`balances\` with the
following SQL:

\`\`\`questdb-sql
CREATE TABLE balances (
    cust_id SYMBOL,
    balance_ccy SYMBOL,
    balance DOUBLE,
    ts TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;

insert into balances values ('1', 'USD', 600.5, '2020-04-21T16:03:43.504432Z');
insert into balances values ('2', 'USD', 950, '2020-04-21T16:08:34.404665Z');
insert into balances values ('2', 'EUR', 780.2, '2020-04-21T16:11:22.704665Z');
insert into balances values ('1', 'USD', 1500, '2020-04-21T16:11:32.904234Z');
insert into balances values ('1', 'EUR', 650.5, '2020-04-22T16:11:32.904234Z');
insert into balances values ('2', 'USD', 900.75, '2020-04-22T16:12:43.504432Z');
insert into balances values ('2', 'EUR', 880.2, '2020-04-22T16:18:34.404665Z');
insert into balances values ('1', 'USD', 330.5, '2020-04-22T16:20:14.404997Z');
\`\`\`

This provides us with a table with the following content:

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 1       | USD         | 600.5   | 2020-04-21T16:01:22.104234Z |
| 2       | USD         | 950     | 2020-04-21T16:03:43.504432Z |
| 2       | EUR         | 780.2   | 2020-04-21T16:08:34.404665Z |
| 1       | USD         | 1500    | 2020-04-21T16:11:22.704665Z |
| 1       | EUR         | 650.5   | 2020-04-22T16:11:32.904234Z |
| 2       | USD         | 900.75  | 2020-04-22T16:12:43.504432Z |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

### Single column

When a single \`symbol\` column is specified in \`LATEST ON\` queries, the query
will end after all distinct symbol values are found.

\`\`\`questdb-sql title="Latest records by customer ID"
SELECT * FROM balances
LATEST ON ts PARTITION BY cust_id;
\`\`\`

The query returns two rows with the most recent records per unique \`cust_id\`
value:

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

### Multiple columns

When multiple columns are specified in \`LATEST ON\` queries, the returned results
are the most recent **unique combinations** of the column values. This example
query returns \`LATEST ON\` customer ID and balance currency:

\`\`\`questdb-sql title="Latest balance by customer and currency"
SELECT cust_id, balance_ccy, balance
FROM balances
LATEST ON ts PARTITION BY cust_id, balance_ccy;
\`\`\`

The results return the most recent records for each unique combination of
\`cust_id\` and \`balance_ccy\`.

| cust_id | balance_ccy | balance | inactive | ts                          |
| ------- | ----------- | ------- | -------- | --------------------------- |
| 1       | EUR         | 650.5   | FALSE    | 2020-04-22T16:11:32.904234Z |
| 2       | USD         | 900.75  | FALSE    | 2020-04-22T16:12:43.504432Z |
| 2       | EUR         | 880.2   | FALSE    | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | FALSE    | 2020-04-22T16:20:14.404997Z |

#### Performance considerations

When the \`LATEST ON\` clause contains a single \`symbol\` column, QuestDB will know
all distinct values upfront and stop scanning table contents once the latest
entry has been found for each distinct symbol value.

When the \`LATEST ON\` clause contains multiple columns, QuestDB has to scan the
entire table to find distinct combinations of column values.

Although scanning is fast, performance will degrade on hundreds of millions of
records. If there are multiple columns in the \`LATEST ON\` clause, this will
result in a full table scan.

### LATEST ON over sub-query

For this example, we can create another table called \`unordered_balances\` with
the following SQL:

\`\`\`questdb-sql
CREATE TABLE unordered_balances (
    cust_id SYMBOL,
    balance_ccy SYMBOL,
    balance DOUBLE,
    ts TIMESTAMP
);

insert into unordered_balances values ('2', 'USD', 950, '2020-04-21T16:08:34.404665Z');
insert into unordered_balances values ('1', 'USD', 330.5, '2020-04-22T16:20:14.404997Z');
insert into unordered_balances values ('2', 'USD', 900.75, '2020-04-22T16:12:43.504432Z');
insert into unordered_balances values ('1', 'USD', 1500, '2020-04-21T16:11:32.904234Z');
insert into unordered_balances values ('1', 'USD', 600.5, '2020-04-21T16:03:43.504432Z');
insert into unordered_balances values ('1', 'EUR', 650.5, '2020-04-22T16:11:32.904234Z');
insert into unordered_balances values ('2', 'EUR', 880.2, '2020-04-22T16:18:34.404665Z');
insert into unordered_balances values ('2', 'EUR', 780.2, '2020-04-21T16:11:22.704665Z');
\`\`\`

Note that this table doesn't have a designated timestamp column and also
contains time series that are unordered by \`ts\` column.

Due to the absent designated timestamp column, we can't use \`LATEST ON\` directly
on this table, but it's possible to use \`LATEST ON\` over a sub-query:

\`\`\`questdb-sql title="Latest balance by customer over unordered data"
(SELECT * FROM unordered_balances)
LATEST ON ts PARTITION BY cust_id;
\`\`\`

Just like with the \`balances\` table, the query returns two rows with the most
recent records per unique \`cust_id\` value:

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

### Execution order

The following queries illustrate how to change the execution order in a query by
using brackets.

#### WHERE first

\`\`\`questdb-sql
SELECT * FROM balances
WHERE balance > 800
LATEST ON ts PARTITION BY cust_id;
\`\`\`

This query executes \`WHERE\` before \`LATEST ON\` and returns the most recent
balance which is above 800. The execution order is as follows:

- filter out all balances below 800
- find the latest balance by \`cust_id\`

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 1       | USD         | 1500    | 2020-04-22T16:11:22.704665Z |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |

#### LATEST ON first

\`\`\`questdb-sql
(SELECT * FROM balances LATEST ON ts PARTITION BY cust_id) --note the brackets
WHERE balance > 800;
\`\`\`

This query executes \`LATEST ON\` before \`WHERE\` and returns the most recent
records, then filters out those below 800. The steps are:

1. Find the latest balances by customer ID.
2. Filter out balances below 800. Since the latest balance for customer 1 is
   equal to 330.5, it is filtered out in this step.

| cust_id | balance_ccy | balance | inactive | ts                          |
| ------- | ----------- | ------- | -------- | --------------------------- |
| 2       | EUR         | 880.2   | FALSE    | 2020-04-22T16:18:34.404665Z |

#### Combination

It's possible to combine a time-based filter with the balance filter from the
previous example to query the latest values for the \`2020-04-21\` date and filter
out those below 800.

\`\`\`questdb-sql
(balances WHERE ts in '2020-04-21' LATEST ON ts PARTITION BY cust_id)
WHERE balance > 800;
\`\`\`

Since QuestDB allows you to omit the \`SELECT * FROM\` part of the query, we
omitted it to keep the query compact.

Such a combination is very powerful since it allows you to find the latest
values for a time slice of the data and then apply a filter to them in a single
query.
`
  },
  {
    path: 'sql/limit.md',
    title: 'LIMIT keyword',
    headers: ['Syntax'],
    content: `Specify the number and position of records returned by a
[SELECT statement](/docs/reference/sql/select/).

In other implementations of SQL, this is sometimes replaced by statements such
as \`OFFSET\` or \`ROWNUM\` Our implementation of \`LIMIT\` encompasses both in one
statement.

## Syntax

![Flow chart showing the syntax of the LIMIT keyword](/images/docs/diagrams/limit.svg)

- \`numberOfRecords\` is the number of records to return.
- \`upperBound\` and \`lowerBound\` is the return range. \`lowerBound\` is
  **exclusive** and \`upperBound\` is **inclusive**.

A \`positive\` number will return the \`first\` \`n\` records. A \`negative\` number
will return the \`last\` \`n\` records.

## Examples

\`\`\`questdb-sql title="First 5 results"
SELECT * FROM ratings LIMIT 5;
\`\`\`

\`\`\`questdb-sql title="Last 5 results"
SELECT * FROM ratings LIMIT -5;
\`\`\`

\`\`\`questdb-sql title="Range results - this will return records 3, 4 and 5"
SELECT * FROM ratings LIMIT 2,5;
\`\`\`

\`negative\` range parameters will return results from the bottom of the table.
Assuming a table with \`n\` records, the following will return records between
\`n-7\` (exclusive) and \`n-3\` (inclusive), i.e \`{n-6, n-5, n-4, n-3}\`. Both
\`upperBound\` and \`lowerBound\` must be negative numbers, in this case:

\`\`\`questdb-sql title="Range results (negative)"
SELECT * FROM ratings LIMIT -7, -3;
\`\`\`
`
  },
  {
    path: 'sql/order-by.md',
    title: 'ORDER BY keyword',
    headers: ['Syntax', 'Notes'],
    content: `Sort the results of a query in ascending or descending order.

## Syntax

![Flow chart showing the syntax of the ORDER BY keyword](/images/docs/diagrams/orderBy.svg)

Default order is \`ASC\`. You can omit to order in ascending order.

## Notes

Ordering data requires holding it in RAM. For large operations, we suggest you
check you have sufficient memory to perform the operation.

## Examples

\`\`\`questdb-sql title="Omitting ASC will default to ascending order"
ratings ORDER BY userId;
\`\`\`

\`\`\`questdb-sql title="Ordering in descending order"
ratings ORDER BY userId DESC;
\`\`\`

\`\`\`questdb-sql title="Multi-level ordering"
ratings ORDER BY userId, rating DESC;
\`\`\`
`
  },
  {
    path: 'sql/over.md',
    title: 'Over Keyword - Window Functions',
    headers: ['Deep Dive: What is a Window Function?', 'Syntax', 'Supported functions', 'Components of a window function', 'Frame types and behavior', 'Frame boundaries', 'Exclusion options', 'Notes and restrictions'],
    content: `Window functions perform calculations across sets of table rows that are related to the current row. Unlike aggregate functions that return a single result for a group of rows, window functions return a value for every row while considering a window of rows defined by the OVER clause.

We'll cover high-level, introductory information about window functions, and then move on to composition.

We also have some [common examples](/docs/reference/function/window#common-window-function-examples) to get you started.

:::tip
Click _Demo this query_ within our query examples to see them in our live demo.
:::

## Deep Dive: What is a Window Function?

A window function performs a calculation across a set of rows that are related
to the current row. This set of related rows is called a "window", defined by an
\`OVER\` clause that follows the window function.

In practical terms, window functions are used when you need to perform a
calculation that depends on a group of rows, but you want to retain the
individual rows in the result set. This is different from aggregate functions
like a cumulative \`sum\` or \`avg\`, which perform calculations on a group of rows
and return a single result.

The underlying mechanism of a window function involves three components:

- **Partitioning:** The \`PARTITION BY\` clause divides the result set into
  partitions (groups of rows) upon which the window function is applied. If no
  partition is defined, the function treats all rows of the query result set as
  a single partition.

- **Ordering:** The \`ORDER BY\` clause within the \`OVER\` clause determines the
  order of the rows in each partition.

- **Frame Specification:** This defines the set of rows included in the window,
  relative to the current row. For example,
  \`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\` includes all rows from the
  start of the partition to the current row.

Use cases for window functions are vast.

They are often used in analytics for tasks such as:

- Calculating running totals or averages
- Finding the maximum or minimum value in a sequence or partition
- Ranking items within a specific category or partition
- Calculating [moving averages](/docs/reference/function/window#avg) or
  [cumulative sums](/docs/reference/function/window#cumulative-bid-size)

Window functions are tough to grok.

An analogy before we get to building:

Imagine a group of cars in a race. Each car has a number, a name, and a finish
time. If you wanted to know the average finish time, you could use an aggregate
function like [\`avg()\`](/docs/reference/function/window#avg) to calculate it. But this would only give you a single
result: the average time. You wouldn't know anything about individual cars'
times.

For example, a window function allows you to calculate the average finish time
for all the cars (the window), but display it on each car (row), so you can
compare this average to each car's average speed to see if they were faster or
slower than the global average.

So, in essence, window functions allow you to perform calculations that consider
more than just the individual row or the entire table, but a 'window' of related
rows. This 'window' could be all rows with the same value in a certain column,
like all cars of the same engine size, or it could be a range of rows based on
some order, like the three cars who finished before and after a certain car.

This makes window functions incredibly powerful for complex calculations and
analyses.

## Syntax

\`\`\`txt
functionName OVER (
    [PARTITION BY columnName [, ...]]
    [ORDER BY columnName [ASC | DESC] [, ...]]
    [ROWS | RANGE BETWEEN frame_start AND frame_end]
    [EXCLUDE CURRENT ROW | EXCLUDE NO OTHERS]
)
\`\`\`
Where:

- \`functionName\`: The window function to apply (e.g., avg, sum, rank)
- \`OVER\`: Specifies the window over which the function operates
  - \`PARTITION BY\`: Divides the result set into partitions
  - \`ORDER BY\`: Specifies the order of rows within each partition
  - \`ROWS | RANGE BETWEEN\`: Defines the window frame relative to the current row
  - \`EXCLUDE\`: Optionally excludes certain rows from the frame

## Supported functions

- [\`avg()\`](/docs/reference/function/window#avg) – Calculates the average within a window

- [\`count()\`](/docs/reference/function/window#count) – Counts rows or non-null values

- [\`dense_rank()\`](/docs/reference/function/window#dense_rank) – Assigns a rank to rows monotonically

- [\`first_not_null_value()\`](/docs/reference/function/window#first_not_null_value) – Retrieves the first not null value in a window

- [\`first_value()\`](/docs/reference/function/window#first_value) – Retrieves the first value in a window

- [\`lag()\`](/docs/reference/function/window#lag) – Accesses data from previous rows

- [\`last_value()\`](/docs/reference/function/window#last_value) – Retrieves the last value in a window

- [\`lead()\`](/docs/reference/function/window#lead) – Accesses data from subsequent rows

- [\`max()\`](/docs/reference/function/window#max) – Returns the maximum value within a window

- [\`min()\`](/docs/reference/function/window#min) – Returns the minimum value within a window

- [\`rank()\`](/docs/reference/function/window#rank) – Assigns a rank to rows

- [\`row_number()\`](/docs/reference/function/window#row_number) – Assigns sequential numbers to rows

- [\`sum()\`](/docs/reference/function/window#cumulative-bid-size) – Calculates the sum within a window

## Components of a window function

A window function calculates results across a set of rows related to the current row, called a window. This allows for complex calculations like moving averages, running totals, and rankings without collapsing rows.

1. **Function Name**: Specifies the calculation to perform (e.g., \`avg(price)\`)
2. **OVER Clause**: Defines the window for the function
   - \`PARTITION BY\`: Divides the result set into partitions
   - \`ORDER BY\`: Orders rows within partitions
   - Frame Specification: Defines the subset of rows using ROWS or RANGE
3. **Exclusion Option**: Excludes specific rows from the frame

### Example

\`\`\`questdb-sql title="Moving average example" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS moving_avg
FROM trades;
\`\`\`

This calculates a moving average of price over the current and three preceding rows for each symbol. For other
common window function examples, please check the [Window functions reference](/docs/reference/function/window#common-window-function-examples).


## Frame types and behavior

Window frames specify which rows are included in the calculation relative to the current row.

\`\`\`mermaid
sequenceDiagram
    participant R1 as Row at 09:00
    participant R2 as Row at 09:02
    participant R3 as Row at 09:03
    participant R4 as Row at 09:04<br/>(Current Row)

    Note over R4: Calculating at 09:04

    rect rgb(191, 223, 255)
    Note over R2,R4: ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    end

    rect rgb(255, 223, 191)
    Note over R3,R4: RANGE BETWEEN<br/>'1' MINUTE PRECEDING<br/>AND CURRENT ROW
    end
\`\`\`

### ROWS frame

Defines the frame based on a physical number of rows:

\`\`\`txt
ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
\`\`\`

This includes the current row and two preceding rows.

\`\`\`mermaid
sequenceDiagram
    participant R1 as Row 1
    participant R2 as Row 2
    participant R3 as Row 3
    participant R4 as Row 4
    participant R5 as Row 5

    Note over R1: Frame includes Row1
    Note over R2: Frame includes Row1, Row2
    Note over R3: Frame includes Row1, Row2, Row3
    Note over R4: Frame includes Row2, Row3, Row4
    Note over R5: Frame includes Row3, Row4, Row5
\`\`\`

### RANGE frame

:::note
RANGE functions have a known issue. When using RANGE, all the rows with the same value will have the same output for the function. Read the [open issue](https://github.com/questdb/questdb/issues/5177) for more information.
:::

Defines the frame based on the actual values in the ORDER BY column, rather than counting rows. Unlike ROWS, which counts a specific number of rows, RANGE considers the values in the ORDER BY column to determine the window.

Important requirements for RANGE:
- Data must be ordered by the designated timestamp column
- The window is calculated based on the values in that ORDER BY column

For example, with a current row at 09:04 and \`RANGE BETWEEN '1' MINUTE PRECEDING AND CURRENT ROW\`:
- Only includes rows with timestamps between 09:03 and 09:04 (inclusive)
- Earlier rows (e.g., 09:00, 09:02) are excluded as they fall outside the 1-minute range

\`\`\`mermaid
sequenceDiagram
    participant R1 as Row at 09:00
    participant R2 as Row at 09:02
    participant R3 as Row at 09:03
    participant R4 as Row at 09:04<br/>(Current Row)

    Note over R4: Calculating at 09:04

    %% Only include rows within 1 minute of current row (09:03-09:04)
    rect rgba(255, 223, 191)
    Note over R3,R4: RANGE BETWEEN<br/>'1' MINUTE PRECEDING<br/>AND CURRENT ROW
    end

    %% Show excluded rows in grey or with a visual indicator
    Note over R1,R2: Outside 1-minute range
\`\`\`

The following time units can be used in RANGE window functions:

- day
- hour
- minute
- second
- millisecond
- microsecond

Plural forms of these time units are also accepted (e.g., 'minutes', 'hours').

\`\`\`questdb-sql title="Multiple time intervals example" demo
SELECT
    timestamp,
    bid_px_00,
    -- 5-minute average: includes rows from (current_timestamp - 5 minutes) to current_timestamp
    AVG(bid_px_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '5' MINUTE PRECEDING AND CURRENT ROW
    ) AS avg_5min,
    -- 100ms count: includes rows from (current_timestamp - 100ms) to current_timestamp
    COUNT(*) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '100' MILLISECOND PRECEDING AND CURRENT ROW
    ) AS updates_100ms,
    -- 2-second sum: includes rows from (current_timestamp - 2 seconds) to current_timestamp
    SUM(bid_sz_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '2' SECOND PRECEDING AND CURRENT ROW
    ) AS volume_2sec
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
\`\`\`

This query demonstrates different time intervals in action, calculating:
- 5-minute moving average of best bid price
- Update frequency in 100ms windows
- 2-second rolling volume

Note that each window calculation is based on the timestamp values, not the number of rows. This means the number of rows included can vary depending on how many records exist within each time interval.

## Frame boundaries

Frame boundaries determine which rows are included in the window calculation:

- \`UNBOUNDED PRECEDING\`: Starts at the first row of the partition
- \`<value> PRECEDING\`: Starts or ends at a specified number of rows or interval before the current row
- \`CURRENT ROW\`: Starts or ends at the current row

When the frame clause is not specified, the default frame is
\`RANGE UNBOUNDED PRECEDING\`, which includes all rows from the start of the
partition to the current row.

- If \`ORDER BY\` is not present, the frame includes the entire partition, as all
  rows are considered equal.

- If \`ORDER BY\` is present, the frame includes all rows from the start of the
  partition to the current row. Note that \`UNBOUNDED FOLLOWING\` is only allowed
  when the frame start is \`UNBOUNDED PRECEDING\`, which means the frame includes
  the entire partition.

### Restrictions

1. Frame start can only be:
   - \`UNBOUNDED PRECEDING\`
   - \`<value> PRECEDING\`
   - \`CURRENT ROW\`

2. Frame end can only be:
   - \`CURRENT ROW\`
   - \`<value> PRECEDING\` (unless start is \`UNBOUNDED PRECEDING\`)

3. RANGE frames must be ordered by a designated timestamp

## Exclusion options

Modifies the window frame by excluding certain rows:

### EXCLUDE NO OTHERS

- Default behavior
- Includes all rows in the frame

\`\`\`mermaid
sequenceDiagram
    participant R1 as Row 1
    participant R2 as Row 2
    participant CR as Current Row
    participant R4 as Row 4

    rect rgba(255, 223, 191)
    Note over R1,CR: Frame includes all rows from the frame start up to and including the current row
    end
\`\`\`

### EXCLUDE CURRENT ROW

- Excludes the current row from the frame
- When frame ends at \`CURRENT ROW\`, end boundary automatically adjusts to \`1 PRECEDING\`
- This automatic adjustment ensures that the current row is effectively excluded from the calculation, as there cannot be a frame that ends after the current row when the current row is excluded.

\`\`\`mermaid
sequenceDiagram
    participant R1 as Row 1
    participant R2 as Row 2
    participant CR as Current Row
    participant R4 as Row 4

    rect rgba(255, 223, 191)
    Note over R1,R2: Frame includes all rows <br/> from the frame startup to one row <br/> before the current row<br/>(excluding the current row)
    end
    rect rgba(255, 0, 0, 0.1)
    Note over CR: Current Row is excluded
    end
\`\`\`

#### Example query

To tie it together, consider the following example:

\`\`\`questdb-sql title="EXCLUSION example" demo
SELECT
    timestamp,
    price,
    SUM(price) OVER (
        ORDER BY timestamp
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        EXCLUDE CURRENT ROW
    ) AS cumulative_sum_excluding_current
FROM trades;
\`\`\`

The query calculates a cumulative sum of the price column for each row in the trades table, excluding the current row from the calculation. By using \`EXCLUDE CURRENT ROW\`, the window frame adjusts to include all rows from the start up to one row before the current row. This demonstrates how the \`EXCLUDE CURRENT ROW\` option modifies the window frame to exclude the current row, affecting the result of the window function.



## Notes and restrictions

### ORDER BY behavior

- ORDER BY in OVER clause determines the logical order for window functions
- Independent of the query-level ORDER BY
- Required for window-only functions
- Required for RANGE frames

### Frame specifications

- ROWS frames:
  - Based on physical row counts
  - More efficient for large datasets
  - Can be used with any ORDER BY column

- RANGE frames:
  - Defines the frame based on the actual values in the ORDER BY column, rather than counted row.
  - Require ORDER BY on timestamp
  - Support time-based intervals (e.g., '1h', '5m')

### Exclusion behavior

- Using \`EXCLUDE CURRENT ROW\` with frame end at \`CURRENT ROW\`:
  - Automatically adjusts end boundary to \`1 PRECEDING\`
  - Ensures consistent results across queries

### Performance considerations

- ROWS frames typically perform better than RANGE frames for large datasets
- Partitioning can improve performance by processing smaller chunks of data
- Consider index usage when ordering by timestamp columns

### Common pitfalls

#### Using window functions in WHERE clauses:

\`\`\`questdb-sql title="Not allowed!"
-- Incorrect usage
SELECT
    symbol,
    price,
    timestamp
FROM trades
WHERE
    avg(price) OVER (ORDER BY timestamp) > 100;
\`\`\`

Instead, build like so:

\`\`\`questdb-sql title="Correct usage" demo
with prices_and_avg AS (
SELECT
    symbol,
    price, avg(price) OVER (ORDER BY timestamp) as moving_avg_price,
    timestamp
FROM trades
WHERE timestamp in yesterday()
)
select * from prices_and_avg
WHERE
   moving_avg_price  > 100;
\`\`\`

#### Missing ORDER BY in OVER clause

When no \`ORDER BY\` is specified, the average will be calculated for the whole
partition. Given we don't have a PARTITION BY and we are using a global window,
all the rows will show the same average. This is the average for the whole
dataset.

\`\`\`questdb-sql title="Missing ORDER BY"
-- Potential issue
SELECT
    symbol,
    price,
    sum(price) OVER () AS cumulative_sum
FROM trades;
WHERE timestamp in yesterday();
\`\`\`

To compute the _moving average_, we need to specify an \`ORDER BY\` clause:

\`\`\`questdb-sql title="Safer usage" demo
SELECT
    symbol,
    price,
    sum(price) OVER (ORDER BY TIMESTAMP) AS cumulative_sum
FROM trades
WHERE timestamp in yesterday();
\`\`\`

We may also have a case where all the rows for the same partition (symbol) will
have the same average, if we include a \`PARTITION BY\` clause without an
\`ORDER BY\` clause:

\`\`\`questdb-sql title="Partitioned usage" demo
-- Potential issue
SELECT
    symbol,
    price,
    sum(price) OVER (PARTITION BY symbol ) AS cumulative_sum
FROM trades
WHERE timestamp in yesterday();
\`\`\`

For every row to show the moving average for each symbol, we need to specify both
an \`ORDER BY\` and a \`PARTITION BY\` clause:

\`\`\`questdb-sql title="Partitioned and ordered usage" demo
SELECT
    symbol,
    price,
    sum(price) OVER (PARTITION BY symbol ORDER BY TIMESTAMP) AS cumulative_sum
FROM trades
WHERE timestamp in yesterday();
\`\`\`
`
  },
  {
    path: 'sql/overview.md',
    title: 'Query & SQL Overview',
    headers: ['QuestDB Web Console', 'PostgreSQL', 'REST HTTP API', 'Apache Parquet', 'What\'s next?'],
    content: `import Screenshot from "@theme/Screenshot"

import Tabs from "@theme/Tabs"

import TabItem from "@theme/TabItem"

import CQueryPartial from "../../partials/\\_c.sql.query.partial.mdx"

import CsharpQueryPartial from "../../partials/\\_csharp.sql.query.partial.mdx"

import GoQueryPartial from "../../partials/\\_go.sql.query.partial.mdx"

import JavaQueryPartial from "../../partials/\\_java.sql.query.partial.mdx"

import NodeQueryPartial from "../../partials/\\_nodejs.sql.query.partial.mdx"

import RubyQueryPartial from "../../partials/\\_ruby.sql.query.partial.mdx"

import PHPQueryPartial from "../../partials/\\_php.sql.query.partial.mdx"

import PythonQueryPartial from "../../partials/\\_python.sql.query.partial.mdx"

import CurlExecQueryPartial from "../../partials/\\_curl.exec.query.partial.mdx"

import GoExecQueryPartial from "../../partials/\\_go.exec.query.partial.mdx"

import NodejsExecQueryPartial
from"../../partials/\\_nodejs.exec.query.partial.mdx"

import PythonExecQueryPartial from
"../../partials/\\_python.exec.query.partial.mdx"

Querying - as a base action - is performed in three primary ways:

1. Query via the
   [QuestDB Web Console](/docs/reference/sql/overview/#questdb-web-console)
2. Query via [PostgreSQL](/docs/reference/sql/overview/#postgresql)
3. Query via [REST HTTP API](/docs/reference/sql/overview/#rest-http-api)
4. Query via [Apache Parquet](/docs/reference/sql/overview/#apache-parquet)

For efficient and clear querying, QuestDB provides SQL with enhanced time series
extensions. This makes analyzing, downsampling, processing and reading time
series data an intuitive and flexible experience.

Queries can be written into many applications using existing drivers and clients
of the PostgreSQL or REST-ful ecosystems. However, querying is also leveraged
heavily by third-party tools to provide visualizations, such as within
[Grafana](/docs/third-party-tools/grafana/), or for connectivity into broad data
infrastructure and application environments such as with a tool like
[Cube](/docs/third-party-tools/cube/).

> Need to ingest data first? Checkout our
> [Ingestion overview](/docs/ingestion-overview/).

## QuestDB Web Console

The Web Console is available by default at
[localhost:9000](http://localhost:9000). The GUI makes it easy to write, return
and chart queries. There is autocomplete, syntax highlighting, errors, and more.
If you want to test a query or interact direclty with your data in the cleanest
and simplest way, apply queries via the [Web Console](/docs/web-console/).

<Screenshot
  alt="A shot of the Web Console, showing auto complete and a colourful returned table."
  src="images/docs/console/overview.webp"
  title="Click to zoom"
/>

For an example, click _Demo this query_ in the below snippet. This will run a
query within our public demo instance and [Web Console](/docs/web-console/):

\`\`\`questdb-sql title='Navigate time with SQL' demo
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM trades
WHERE  timestamp > dateadd('d', -1, now())
SAMPLE BY 15m;
\`\`\`

If you see _Demo this query_ on other snippets in this docs, they can be run
against the demo instance.

## PostgreSQL

Query QuestDB using the PostgreSQL endpoint via the default port \`8812\`.

See [PGWire Client overview](/docs/pgwire/pgwire-intro/) for details on how to
connect to QuestDB using PostgreSQL clients.

Brief examples in multiple languages are shown below.

<Tabs defaultValue="python" values={[ { label: "Python", value: "python" },
{ label: "Java", value: "java" }, { label: "NodeJS", value: "nodejs" }, { label:
"Go", value: "go" }, { label: "C#", value: "csharp" }, { label: "C", value:
"c" }, { label: "Ruby", value: "ruby" }, { label: "PHP", value: "php" } ]}>

<TabItem value="python">
  <PythonQueryPartial />
</TabItem>

<TabItem value="java">
  <JavaQueryPartial />
</TabItem>

<TabItem value="nodejs">
  <NodeQueryPartial />
</TabItem>

<TabItem value="go">
  <GoQueryPartial />
</TabItem>

<TabItem value="c">
  <CQueryPartial />
</TabItem>

<TabItem value="csharp">
  <CsharpQueryPartial />
</TabItem>

<TabItem value="ruby">
  <RubyQueryPartial />
</TabItem>

<TabItem value="php">
  <PHPQueryPartial />
</TabItem>

</Tabs>


#### Further Reading

See the [PGWire Client overview](/docs/pgwire/pgwire-intro/) for more details on how to use PostgreSQL
clients to connect to QuestDB.

## REST HTTP API

QuestDB exposes a REST API for compatibility with a wide range of libraries and
tools.

The REST API is accessible on port \`9000\` and has the following query-capable
entrypoints:

For details such as content type, query parameters and more, refer to the
[REST HTTP API](/docs/reference/api/rest/) reference.

| Entrypoint                                  | HTTP Method | Description                             | REST HTTP API Reference                                       |
| :------------------------------------------ | :---------- | :-------------------------------------- | :------------------------------------------------------------ |
| [\`/exp?query=..\`](#exp-sql-query-to-csv)    | GET         | Export SQL Query as CSV                 | [Reference](/docs/reference/api/rest/#exp---export-data)      |
| [\`/exec?query=..\`](#exec-sql-query-to-json) | GET         | Run SQL Query returning JSON result set | [Reference](/docs/reference/api/rest/#exec---execute-queries) |

#### \`/exp\`: SQL Query to CSV

The \`/exp\` entrypoint allows querying the database with a SQL select query and
obtaining the results as CSV.

For obtaining results in JSON, use \`/exec\` instead, documented next.

<Tabs defaultValue="curl" values={[ { label: "cURL", value: "curl" }, { label:
"Python", value: "python" }, ]}>

<TabItem value="curl">

\`\`\`bash
curl -G --data-urlencode \\
    "query=SELECT * FROM example_table2 LIMIT 3" \\
    http://localhost:9000/exp
\`\`\`

\`\`\`csv
"col1","col2","col3"
"a",10.5,true
"b",100.0,false
"c",,true
\`\`\`

</TabItem>

<TabItem value="python">

\`\`\`python
import requests

resp = requests.get(
    'http://localhost:9000/exp',
    {
        'query': 'SELECT * FROM example_table2',
        'limit': '3,6'   # Rows 3, 4, 5
    })
print(resp.text)
\`\`\`

\`\`\`csv
"col1","col2","col3"
"d",20.5,true
"e",200.0,false
"f",,true
\`\`\`

</TabItem>

</Tabs>

#### \`/exec\`: SQL Query to JSON

The \`/exec\` entrypoint takes a SQL query and returns results as JSON.

This is similar to the \`/exp\` entry point which returns results as CSV.

##### Querying Data

<Tabs defaultValue="curl" values={[ { label: "cURL", value: "curl" }, { label:
"Python", value: "python" }, { label: "NodeJS", value: "nodejs" }, { label:
"Go", value: "go" }, ]}>

<TabItem value="curl">
  <CurlExecQueryPartial />
</TabItem>

<TabItem value="python">
  <PythonExecQueryPartial />
</TabItem>

<TabItem value="nodejs">
  <NodejsExecQueryPartial />
</TabItem>

<TabItem value="go">
  <GoExecQueryPartial />
</TabItem>

</Tabs>

Alternatively, the \`/exec\` endpoint can be used to create a table and the
\`INSERT\` statement can be used to populate it with values:

<Tabs defaultValue="curl" values={[ { label: "cURL", value: "curl" }, { label:
"NodeJS", value: "nodejs" }, { label: "Python", value: "python" }, ]}>

<TabItem value="curl">

\`\`\`shell
# Create Table
curl -G \\
  --data-urlencode "query=CREATE TABLE IF NOT EXISTS trades(name VARCHAR, value INT)" \\
  http://localhost:9000/exec

# Insert a row
curl -G \\
  --data-urlencode "query=INSERT INTO trades VALUES('abc', 123456)" \\
  http://localhost:9000/exec

# Update a row
curl -G \\
  --data-urlencode "query=UPDATE trades SET value = 9876 WHERE name = 'abc'" \\
  http://localhost:9000/exec
\`\`\`

</TabItem>

<TabItem value="nodejs">

The \`node-fetch\` package can be installed using \`npm i node-fetch\`.

\`\`\`javascript
const fetch = require("node-fetch");

const HOST = "http://localhost:9000";

async function createTable() {
  try {
    const query = "CREATE TABLE IF NOT EXISTS trades (name VARCHAR, value INT)";

    const response = await fetch(
      \`\${HOST}/exec?query=\${encodeURIComponent(query)}\`,
    );
    const json = await response.json();

    console.log(json);
  } catch (error) {
    console.log(error);
  }
}

async function insertData() {
  try {
    const query = "INSERT INTO trades VALUES('abc', 123456)";

    const response = await fetch(
      \`\${HOST}/exec?query=\${encodeURIComponent(query)}\`,
    );
    const json = await response.json();

    console.log(json);
  } catch (error) {
    console.log(error);
  }
}

async function updateData() {
  try {
    const query = "UPDATE trades SET value = 9876 WHERE name = 'abc'";

    const response = await fetch(
      \`\${HOST}/exec?query=\${encodeURIComponent(query)}\`,
    );
    const json = await response.json();

    console.log(json);
  } catch (error) {
    console.log(error);
  }
}

createTable().then(insertData).then(updateData);
\`\`\`

</TabItem>

<TabItem value="python">

\`\`\`python
import requests
import json

host = 'http://localhost:9000'

def run_query(sql_query):
  query_params = {'query': sql_query, 'fmt' : 'json'}
  try:
    response = requests.get(host + '/exec', params=query_params)
    json_response = json.loads(response.text)
    print(json_response)
  except requests.exceptions.RequestException as e:
    print("Error: %s" % (e))

# create table
run_query("CREATE TABLE IF NOT EXISTS trades (name VARCHAR, value INT)")
# insert row
run_query("INSERT INTO trades VALUES('abc', 123456)")
# update row
run_query("UPDATE trades SET value = 9876 WHERE name = 'abc'")
\`\`\`

</TabItem>

</Tabs>

## Apache Parquet

:::info

Apache Parquet support is in **beta**. It may not be fit for production use.

Please let us know if you run into issues. Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

:::

Parquet files can be read and thus queried by QuestDB.

QuestDB is shipped with a demo Parquet file, \`trades.parquet\`, which can be
queried using the \`read_parquet\` function.

Example:

\`\`\`questdb-sql title="read_parquet example"
SELECT
  *
FROM
  read_parquet('trades.parquet')
WHERE
  side = 'buy';
\`\`\`

The trades.parquet file is located in the \`import\` subdirectory inside the
QuestDB root directory. Drop your own Parquet files to the import directory and
query them using the \`read_parquet()\` function.

You can change the allowed directory by setting the \`cairo.sql.copy.root\`
configuration key.

For more information, see the
[Parquet documentation](/docs/reference/function/parquet/).

## What's next?

Now... SQL! It's query time.

Whether you want to use the [Web Console](/docs/web-console/), PostgreSQL or REST HTTP (or both),
query construction is rich.

To brush up and learn what's unique in QuestDB, consider the following:

- [Data types](/docs/reference/sql/datatypes/)
- [SQL execution order](/docs/concept/sql-execution-order/)

And to learn about some of our favourite, most powerful syntax:

- [Window functions](/docs/reference/function/window/) are a powerful analysis
  tool
- [Aggregate functions](/docs/reference/function/aggregation/) - aggregations
  are key!
- [Date & time operators](/docs/reference/operators/date-time/) to learn about
  date and time
- [\`SAMPLE BY\`](/docs/reference/sql/sample-by/) to summarize data into chunks
  based on a specified time interval, from a year to a microsecond
- [\`WHERE IN\`](/docs/reference/sql/where/#time-range-where-in) to compress time ranges
  into concise intervals
- [\`LATEST ON\`](/docs/reference/sql/latest-on/) for latest values within
  multiple series within a table
- [\`ASOF JOIN\`](/docs/reference/sql/asof-join/) to associate timestamps between
  a series based on proximity; no extra indices required
- [Materialized Views](/docs/guides/mat-views/) to pre-compute complex queries
  for optimal performance

Looking for visuals?

- Explore [Grafana](/docs/third-party-tools/grafana/)
- Jump quickly into the [Web Console](/docs/web-console/)
`
  },
  {
    path: 'sql/refresh-mat-view.md',
    title: 'REFRESH MATERIALIZED VIEW',
    headers: ['Syntax', 'See also'],
    content: `:::info

Materialized View support is now generally available (GA) and ready for
production use.

If you are using versions earlier than \`8.3.1\`, we suggest you upgrade at your
earliest convenience.

:::

\`REFRESH MATERIALIZED VIEW\` refreshes a materialized view. This is helpful when
a view becomes invalid, and no longer refreshes incrementally.

When the \`FULL\` keyword is specified, this command deletes the data in the
target materialized view and inserts the results of the query into the view. It
also marks the materialized view as valid, reactivating the incremental refresh
processes.

When the \`INCREMENTAL\` keyword is used, the \`REFRESH\` command schedules an
incremental refresh of the materialized view. Usually, incremental refresh is
automatic, so this command is useful only in niche situations when incremental
refresh is not working as expected, but the view is still valid.

When the \`RANGE\` keyword is specified, this command refreshes the data in the
specified time range only. This command is useful for a valid materialized
view with configured
[\`REFRESH LIMIT\`](/docs/reference/sql/alter-mat-view-set-refresh-limit/). That's
because inserted base table rows with timestamps older than the refresh limit
are ignored by incremental refresh, so range refresh may be used to
recalculate materialized view on older rows. Range refresh does not affect
incremental refresh, e.g. it does not update the last base table transaction
used by incremental refresh.

## Syntax

![Flow chart showing the syntax of the REFRESH MATERIALIZED VIEW keyword](/images/docs/diagrams/refreshMatView.svg)

## Examples

\`\`\`questdb-sql
REFRESH MATERIALIZED VIEW trades_1h FULL;
\`\`\`

\`\`\`questdb-sql
REFRESH MATERIALIZED VIEW trades_1h INCREMENTAL;
\`\`\`

\`\`\`questdb-sql
REFRESH MATERIALIZED VIEW trades_1h RANGE FROM '2025-05-05T01:00:00.000000Z' TO '2025-05-05T02:00:00.000000Z';
\`\`\`

## See also

For more information on the concept, see the the
[introduction](/docs/concept/mat-views/) and [guide](/docs/guides/mat-views/) on
materialized views.
`
  },
  {
    path: 'sql/reindex.md',
    title: 'REINDEX',
    headers: ['Syntax', 'Options'],
    content: `Rebuilds one or more [index](/docs/concept/indexes/) columns of the given table.
This operation is intended to be used after a hardware or software crash, when
the index data are corrupted and the table cannot be opened for writes.

The operation can only be performed when there is no other reader and writer
working on the table. During the operation, the table is locked and no read and
write should be performed on the selected table.

## Syntax

![Flow chart showing the syntax of the REINDEX keyword](/images/docs/diagrams/reindex.svg)

## Options

By default, \`REINDEX\` rebuilds all indexes in the selected table. The following
options can be used to narrow down the scope of the operation:

- \`COLUMN\`: When defined, \`REINDEX\` rebuilds the index for the selected column.
- \`PARTITION\`: When defined, \`REINDEX\` rebuilds index files in the selected
  partition only. The partition name must match the name of the directory for
  the given partition. The naming convention is detailed in
  [Partitions](/docs/concept/partitions/).

## Example

Rebuilding all the indexes in the table \`trades\`:

\`\`\`questdb-sql title="Rebuilding an index"
REINDEX TABLE trades LOCK EXCLUSIVE;
\`\`\`

Rebuilding the index in the column \`instruments\`:

\`\`\`questdb-sql title="Rebuilding an index"
REINDEX TABLE trades COLUMN instruments LOCK EXCLUSIVE;
\`\`\`

Rebuilding one partition (\`2021-12-17\`) of the index in the column
\`instruments\`:

\`\`\`questdb-sql title="Rebuilding an index"
REINDEX TABLE trades COLUMN instruments PARTITION '2021-12-17' LOCK EXCLUSIVE;
\`\`\`
`
  },
  {
    path: 'sql/rename.md',
    title: 'RENAME TABLE keyword',
    headers: ['Syntax'],
    content: `\`RENAME TABLE\` is used to change the name of a table.

## Syntax

![Flow chart showing the syntax of the RENAME TABLE keyword](/images/docs/diagrams/renameTable.svg)

## Example

\`\`\`questdb-sql
RENAME TABLE 'test.csv' TO 'myTable';
\`\`\`
`
  },
  {
    path: 'sql/sample-by.md',
    title: 'SAMPLE BY keyword',
    headers: ['Syntax', 'Sample units', 'FROM-TO', 'Fill options', 'Sample calculation', 'ALIGN TO FIRST OBSERVATION', 'ALIGN TO CALENDAR', 'Performance optimization', 'See also'],
    content: `\`SAMPLE BY\` is used on [time-series data](/blog/what-is-time-series-data/) to summarize large datasets into
aggregates of homogeneous time chunks as part of a
[SELECT statement](/docs/reference/sql/select/).

To use \`SAMPLE BY\`, a table column needs to be specified as a
[designated timestamp](/docs/concept/designated-timestamp/).

Users performing \`SAMPLE BY\` queries on datasets **with missing data** may make
use of the [FILL](#fill-options) keyword to specify a fill behavior.

## Syntax

### SAMPLE BY keywords

![Flow chart showing the syntax of the SAMPLE BY keywords](/images/docs/diagrams/sampleBy.svg)

### FROM-TO keywords

![Flow chart showing the syntax of the FROM-TO keywords](/images/docs/diagrams/fromTo.svg)

### FILL keywords

![Flow chart showing the syntax of the FILL keyword](/images/docs/diagrams/fill.svg)

### ALIGN TO keywords

![Flow chart showing the syntax of the ALIGN TO keywords](/images/docs/diagrams/alignToCalTimeZone.svg)

## Sample units

The size of sampled groups are specified with the following syntax:

\`\`\`questdb-sql
SAMPLE BY n{units}
\`\`\`

Where the unit for sampled groups may be one of the following:

| unit | description |
| ---- | ----------- |
| \`U\`  | microsecond |
| \`T\`  | millisecond |
| \`s\`  | second      |
| \`m\`  | minute      |
| \`h\`  | hour        |
| \`d\`  | day         |
| \`M\`  | month       |
| \`y\`  | year        |

For example, given a table \`trades\`, the following query returns the number of
trades per hour:

\`\`\`questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1h;
\`\`\`

## FROM-TO

:::note

Versions prior to QuestDB 8.1.0 do not have access to this extension.

Please see the new blog for more information.

:::

When using \`SAMPLE BY\` with \`FILL\`, you can fill missing rows within the result set with pre-determined values.

However, this method will only fill rows between existing data in the data set and cannot fill rows outside of this range.

To fill outside the bounds of the existing data, you can specify a fill range using a \`FROM-TO\` clause. The boundary
timestamps are expected in UTC.

Note that \`FROM-TO\` clause can be used only on non-keyed SAMPLE BY queries, i.e. queries that have no grouping columns
other than the timestamp.

#### Syntax

Specify the shape of the query using \`FROM\` and \`TO\`:

\`\`\`questdb-sql title='Pre-filling trip data' demo
SELECT pickup_datetime as t, count()
FROM trips
SAMPLE BY 1d FROM '2008-12-28' TO '2009-01-05' FILL(NULL);
\`\`\`

Since no rows existed before 2009, QuestDB automatically fills in these rows.

This is distinct from the \`WHERE\` clause with a simple rule of thumb -
\`WHERE\` controls what data flows in, \`FROM-TO\` controls what data flows out.

Use both \`FROM\` and \`TO\` in isolation to pre-fill or post-fill data. If \`FROM\` is not provided, then the lower bound is the start of the dataset, aligned to calendar. The opposite is true omitting \`TO\`.

#### \`WHERE\` clause optimisation

If the user does not provide a \`WHERE\` clause, or the \`WHERE\` clause does not consider the designated timestamp,
QuestDB will add one for you, matching the \`FROM-TO\` interval.

This means that the query will run optimally, and avoid touching data not relevant to the result.

Therefore, we compile the prior query into something similar to this:

\`\`\`questdb-sql title='Pre-filling trip data with WHERE optimisation' demo
SELECT pickup_datetime as t, count()
FROM trips
WHERE pickup_datetime >= '2008-12-28'
  AND pickup_datetime <  '2009-01-05'
SAMPLE BY 1d FROM '2008-12-28' TO '2009-01-05' FILL(NULL);
\`\`\`

#### Limitations

Here are the current limits to this feature.

- This syntax is not compatible with \`FILL(PREV)\` or \`FILL(LINEAR)\`.
- This syntax is for \`ALIGN TO CALENDAR\` only (default alignment).
- Does not consider any specified \`OFFSET\`.
- This syntax is for non-keyed \`SAMPLE BY\` i.e. only designated timestamp and aggregate columns.

## Fill options

The \`FILL\` keyword is optional and expects one or more \`fillOption\` strategies
which will be applied to one or more aggregate columns. The following
restrictions apply:

- Keywords denoting fill strategies may not be combined. Only one option from
  \`NONE\`, \`NULL\`, \`PREV\`, \`LINEAR\` and constants may be used.
- \`LINEAR\` strategy is not supported for keyed queries, i.e. queries that
  contain non-aggregated columns other than the timestamp in the SELECT clause.
- The \`FILL\` keyword must precede alignment described in the
  [sample calculation section](#sample-calculation), i.e.:

\`\`\`questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(LINEAR)
ALIGN TO ...
\`\`\`

| fillOption | Description                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| \`NONE\`     | No fill applied. If there is no data, the time sample will be skipped in the results. A table could be missing intervals. |
| \`NULL\`     | Fills with \`NULL\` values.                                                                                                 |
| \`PREV\`     | Fills using the previous value.                                                                                           |
| \`LINEAR\`   | Fills by linear interpolation of the 2 surrounding points.                                                                |
| \`x\`        | Fills with a constant value - where \`x\` is the desired value, for example \`FILL(100.05)\`.                                 |

Consider an example table named \`prices\` which has no records during the entire
third hour (\`2021-01-01T03\`):

| ts                          | price |
| --------------------------- | ----- |
| 2021-01-01T01:00:00.000000Z | p1    |
| 2021-01-01T02:00:00.000000Z | p2    |
| 2021-01-01T04:00:00.000000Z | p4    |
| 2021-01-01T05:00:00.000000Z | p5    |

The following query returns the maximum price per hour. As there are missing
values, an aggregate cannot be calculated:

\`\`\`questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h;
\`\`\`

A row is missing for the \`2021-01-01T03:00:00.000000Z\` sample:

| ts                          | max  |
| --------------------------- | ---- |
| 2021-01-01T01:00:00.000000Z | max1 |
| 2021-01-01T02:00:00.000000Z | max2 |
| 2021-01-01T04:00:00.000000Z | max4 |
| 2021-01-01T05:00:00.000000Z | max5 |

A \`FILL\` strategy can be employed which fills with the previous value using
\`PREV\`:

\`\`\`questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(PREV);
\`\`\`

| ts                              | max      |
| ------------------------------- | -------- |
| 2021-01-01T01:00:00.000000Z     | max1     |
| 2021-01-01T02:00:00.000000Z     | max2     |
| **2021-01-01T03:00:00.000000Z** | **max2** |
| 2021-01-01T04:00:00.000000Z     | max4     |
| 2021-01-01T05:00:00.000000Z     | max5     |

Linear interpolation is done using the \`LINEAR\` fill option:

\`\`\`questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(LINEAR);
\`\`\`

| ts                              | max               |
| ------------------------------- | ----------------- |
| 2021-01-01T01:00:00.000000Z     | max1              |
| 2021-01-01T02:00:00.000000Z     | max2              |
| **2021-01-01T03:00:00.000000Z** | **(max2+max4)/2** |
| 2021-01-01T04:00:00.000000Z     | max4              |
| 2021-01-01T05:00:00.000000Z     | max5              |

A constant value can be used as a \`fillOption\`:

\`\`\`questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(100.5);
\`\`\`

| ts                              | max       |
| ------------------------------- | --------- |
| 2021-01-01T01:00:00.000000Z     | max1      |
| 2021-01-01T02:00:00.000000Z     | max2      |
| **2021-01-01T03:00:00.000000Z** | **100.5** |
| 2021-01-01T04:00:00.000000Z     | max4      |
| 2021-01-01T05:00:00.000000Z     | max5      |

Finally, \`NULL\` may be used as a \`fillOption\`:

\`\`\`questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(NULL);
\`\`\`

| ts                              | max      |
| ------------------------------- | -------- |
| 2021-01-01T01:00:00.000000Z     | max1     |
| 2021-01-01T02:00:00.000000Z     | max2     |
| **2021-01-01T03:00:00.000000Z** | **null** |
| 2021-01-01T04:00:00.000000Z     | max4     |
| 2021-01-01T05:00:00.000000Z     | max5     |

### Multiple fill values

\`FILL()\` accepts a list of values where each value corresponds to a single
aggregate column in the SELECT clause order:

\`\`\`questdb-sql
SELECT min(price), max(price), avg(price), ts
FROM prices
SAMPLE BY 1h
FILL(NULL, 10, PREV);
\`\`\`

In the above query \`min(price)\` aggregate will get \`FILL(NULL)\` strategy
applied, \`max(price)\` will get \`FILL(10)\`, and \`avg(price)\` will get
\`FILL(PREV)\`.

## Sample calculation

The default time calculation of sampled groups is an absolute value, in other
words, sampling by one day is a 24 hour range which is not bound to calendar
dates. To align sampled groups to calendar dates, the \`ALIGN TO\` keywords can be
used and are described in the [ALIGN TO CALENDAR](#align-to-calendar) section
below.

:::note

Since QuestDB v7.4.0, the default behaviour for \`ALIGN TO\` has changed. If you do not specify
an explicit alignment, \`SAMPLE BY\` expressions will use \`ALIGN TO CALENDAR\` behaviour.

The prior default behaviour can be retained by specifying \`ALIGN TO FIRST OBSERVATION\` on a \`SAMPLE BY\` query.

Alternatively, one can set the \`cairo.sql.sampleby.default.alignment.calendar\` option to \`false\` in \`server.conf\`.

:::

## ALIGN TO FIRST OBSERVATION

Consider a table \`sensors\` with the following data spanning three calendar days:

\`\`\`questdb-sql
CREATE TABLE sensors (
  ts TIMESTAMP,
  val INT
) TIMESTAMP(ts) PARTITION BY DAY WAL;

INSERT INTO sensors (ts, val) VALUES
  ('2021-05-31T23:10:00.000000Z', 10),
  ('2021-06-01T01:10:00.000000Z', 80),
  ('2021-06-01T07:20:00.000000Z', 15),
  ('2021-06-01T13:20:00.000000Z', 10),
  ('2021-06-01T19:20:00.000000Z', 40),
  ('2021-06-02T01:10:00.000000Z', 90),
  ('2021-06-02T07:20:00.000000Z', 30);
\`\`\`

The following query can be used to sample the table by day.

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1d
ALIGN TO FIRST OBSERVATION;
\`\`\`

This query will return two rows:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T23:10:00.000000Z | 5     |
| 2021-06-01T23:10:00.000000Z | 2     |

The timestamp value for the 24 hour groups start at the first-observed
timestamp, and continue in \`1d\` intervals.

## ALIGN TO CALENDAR

The default behaviour for SAMPLE BY, this option aligns data to calendar dates, with two optional parameters:

- [TIME ZONE](#time-zone)
- [WITH OFFSET](#with-offset)

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1d;
\`\`\`

or:

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1d
ALIGN TO CALENDAR;
\`\`\`

Gives the following result:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T00:00:00.000000Z | 1     |
| 2021-06-01T00:00:00.000000Z | 4     |
| 2021-06-02T00:00:00.000000Z | 2     |

In this case, the timestamps are floored to the nearest UTC day, and grouped. The counts correspond
to the number of entries occurring within each UTC day.

This is particularly useful for summarising data for charting purposes; see the [candlestick chart](https://dashboard.questdb.io/d-solo/fb13b4ab-b1c9-4a54-a920-b60c5fb0363f/public-dashboard-questdb-io-use-cases-crypto?orgId=1&refresh=750ms&panelId=6) from the example [crypto dashboard](https://questdb.com/dashboards/crypto/).

### TIME ZONE

A time zone may be provided for sampling with calendar alignment. Details on the
options for specifying time zones with available formats are provided in the
guide for
[working with timestamps and time zones](/docs/guides/working-with-timestamps-timezones/).

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1d
ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin';
\`\`\`

In this case, the 24 hour samples begin at \`2021-05-31T22:00:00.000000Z\`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T22:00:00.000000Z | 5     |
| 2021-06-01T22:00:00.000000Z | 2     |

Additionally, an offset may be applied when aligning sample calculation to
calendar

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1d
ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin' WITH OFFSET '00:45';
\`\`\`

In this case, the 24 hour samples begin at \`2021-05-31T22:45:00.000000Z\`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T22:45:00.000000Z | 5     |
| 2021-06-01T22:45:00.000000Z | 1     |

#### Local timezone output

The timestamp values output from \`SAMPLE BY\` queries is in UTC. To have UTC
values converted to specific timezones, the
[to_timezone() function](/docs/reference/function/date-time/#to_timezone) should
be used.

\`\`\`questdb-sql
SELECT to_timezone(ts, 'PST') ts, count
FROM (
  SELECT ts, count()
  FROM sensors
  SAMPLE BY 2h
  ALIGN TO CALENDAR TIME ZONE 'PST'
);
\`\`\`

#### Time zone transitions

Calendar dates may contain historical time zone transitions or may vary in the
total number of hours due to daylight savings time. Considering the 31st October
2021, in the \`Europe/London\` calendar day which consists of 25 hours:

> - Sunday, 31 October 2021, 02:00:00 clocks are turned backward 1 hour to
> - Sunday, 31 October 2021, 01:00:00 local standard time

When a \`SAMPLE BY\` operation crosses time zone transitions in cases such as
this, the first sampled group which spans a transition will include aggregates
by full calendar range. Consider a table \`sensors\` with one data point per hour
spanning five calendar hours:

| ts                          | val |
| --------------------------- | --- |
| 2021-10-31T00:10:00.000000Z | 10  |
| 2021-10-31T01:10:00.000000Z | 20  |
| 2021-10-31T02:10:00.000000Z | 30  |
| 2021-10-31T03:10:00.000000Z | 40  |
| 2021-10-31T04:10:00.000000Z | 50  |

The following query will sample by hour with the \`Europe/London\` time zone and
align to calendar ranges:

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1h
ALIGN TO CALENDAR TIME ZONE 'Europe/London';
\`\`\`

The record count for the hour which encounters a time zone transition will
contain two records for both hours at the time zone transition:

| ts                          | count |
| --------------------------- | ----- |
| 2021-10-31T00:00:00.000000Z | 2     |
| 2021-10-31T01:00:00.000000Z | 1     |
| 2021-10-31T02:00:00.000000Z | 1     |
| 2021-10-31T03:00:00.000000Z | 1     |

Similarly, given one data point per hour on this table, running \`SAMPLE BY 1d\`
will have a count of \`25\` for this day when aligned to calendar time zone
\`Europe/London\`.

### WITH OFFSET

Aligning sampling calculation can be provided an arbitrary offset in the format
\`'+/-HH:mm'\`, for example:

- \`'00:30'\` plus thirty minutes
- \`'+00:30'\` plus thirty minutes
- \`'-00:15'\` minus 15 minutes

The query uses the default offset '00:00' if the parameter is not set.

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1d
ALIGN TO CALENDAR WITH OFFSET '02:00';
\`\`\`

In this case, the 24 hour samples begin at \`2021-05-31T02:00:00.000000Z\`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T02:00:00.000000Z | 2     |
| 2021-06-01T02:00:00.000000Z | 4     |
| 2021-06-02T02:00:00.000000Z | 1     |

### TIME ZONE WITH OFFSET

The \`TIME ZONE\` and \`WITH OFFSET\` options can be combined.

\`\`\`questdb-sql
SELECT ts, count()
FROM sensors
SAMPLE BY 1h
ALIGN TO CALENDAR TIME ZONE 'Europe/London' WITH OFFSET '02:00';
\`\`\`

The sample then begins from \`Europe/London\` at \`2021-10-31T02:00:00.000000Z\`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-10-31T02:00:00.000000Z | 1     |
| 2021-10-31T03:00:00.000000Z | 1     |
| 2021-10-31T04:00:00.000000Z | 3     |
| 2021-10-31T05:00:00.000000Z | 2     |

## Examples

Assume the following table \`trades\`:

| ts                          | quantity | price  |
| --------------------------- | -------- | ------ |
| 2021-05-31T23:45:10.000000Z | 10       | 100.05 |
| 2021-06-01T00:01:33.000000Z | 5        | 100.05 |
| 2021-06-01T00:15:14.000000Z | 200      | 100.15 |
| 2021-06-01T00:30:40.000000Z | 300      | 100.15 |
| 2021-06-01T00:45:20.000000Z | 10       | 100    |
| 2021-06-01T01:00:50.000000Z | 50       | 100.15 |

This query will return the number of trades per hour:

\`\`\`questdb-sql title="Hourly interval"
SELECT ts, count()
FROM trades
SAMPLE BY 1h;
\`\`\`

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T23:45:10.000000Z | 3     |
| 2021-06-01T00:45:10.000000Z | 1     |
| 2021-05-31T23:45:10.000000Z | 1     |
| 2021-06-01T00:45:10.000000Z | 1     |

The following will return the trade volume in 30 minute intervals

\`\`\`questdb-sql title="30 minute interval"
SELECT ts, sum(quantity*price)
FROM trades
SAMPLE BY 30m;
\`\`\`

| ts                          | sum    |
| --------------------------- | ------ |
| 2021-05-31T23:45:10.000000Z | 1000.5 |
| 2021-06-01T00:15:10.000000Z | 16024  |
| 2021-06-01T00:45:10.000000Z | 8000   |
| 2021-06-01T00:15:10.000000Z | 8012   |
| 2021-06-01T00:45:10.000000Z | 8000   |

The following will return the average trade notional (where notional is = q \\*
p) by day:

\`\`\`questdb-sql title="Daily interval"
SELECT ts, avg(quantity*price)
FROM trades
SAMPLE BY 1d;
\`\`\`

| ts                          | avg               |
| --------------------------- | ----------------- |
| 2021-05-31T23:45:10.000000Z | 6839.416666666667 |

To make this sample align to calendar dates:

\`\`\`questdb-sql title="Calendar alignment"
SELECT ts, avg(quantity*price)
FROM trades
SAMPLE BY 1d
ALIGN TO CALENDAR;
\`\`\`

| ts                          | avg    |
| --------------------------- | ------ |
| 2021-05-31T00:00:00.000000Z | 1000.5 |
| 2021-06-01T00:00:00.000000Z | 8007.2 |

## Performance optimization

For frequently executed \`SAMPLE BY\` queries, consider using [materialized views](/docs/guides/mat-views/) to pre-compute aggregates. This can significantly improve query performance, especially for complex sampling operations on large datasets.

\`\`\`questdb-sql
CREATE MATERIALIZED VIEW hourly_metrics AS
SELECT 
    timestamp_floor('h', ts) as hour,
    symbol,
    avg(price) as avg_price,
    sum(volume) as total_volume
FROM trades
SAMPLE BY 1h;
\`\`\`

## See also

This section includes links to additional information such as tutorials:

- [Materialized Views Guide](/docs/guides/mat-views/) - Pre-compute SAMPLE BY queries for better performance
- [SQL Extensions for Time-Series Data in QuestDB](/blog/2022/11/23/sql-extensions-time-series-data-questdb-part-ii/)
- [Three SQL Keywords for Finding Missing Data](/blog/three-sql-keywords-for-finding-missing-data/)
`
  },
  {
    path: 'sql/select.md',
    title: 'SELECT keyword',
    headers: ['Syntax', 'Simple select', 'Boolean expressions', 'Aggregation', 'Supported clauses', 'Additional time-series clauses'],
    content: `\`SELECT\` allows you to specify a list of columns and expressions to be selected
and evaluated from a table.

:::tip

Looking for SELECT best practices? Checkout our
[**Maximize your SQL efficiency: SELECT best practices**](/blog/2024/03/11/sql-select-statement-best-practices/)
blog.

:::

## Syntax

![Flow chart showing the syntax of the SELECT keyword](/images/docs/diagrams/select.svg)

Note: \`table\` can either a specified table in your database or passed forward as
the result of a sub-query.

## Simple select

### All columns

QuestDB supports \`SELECT * FROM tablename\`. When selecting all, you can also
omit most of the statement and pass the table name.

The two examples below are equivalent

\`\`\`questdb-sql title="QuestDB dialect"
trades;
\`\`\`

\`\`\`questdb-sql title="Traditional SQL equivalent"
SELECT * FROM trades;
\`\`\`

### Specific columns

To select specific columns, replace \\* by the names of the columns you are
interested in.

Example:

\`\`\`questdb-sql
SELECT timestamp, symbol, side FROM trades;
\`\`\`

### Aliases

Using aliases allow you to give expressions or column names of your choice. You
can assign an alias to a column or an expression by writing the alias name you
want after that expression.

:::note

Alias names and column names must be unique.

:::

\`\`\`questdb-sql
SELECT timestamp, symbol,
    price AS rate,
    amount quantity
FROM trades;
\`\`\`

Notice how you can use or omit the \`AS\` keyword.

### Arithmetic expressions

\`SELECT\` is capable of evaluating multiple expressions and functions. You can
mix comma separated lists of expressions with the column names you are
selecting.

\`\`\`questdb-sql
SELECT timestamp, symbol,
    price * 0.25 AS price25pct,
    amount > 10 AS over10
FROM trades
\`\`\`

The result of \`amount > 10\` is a boolean. The column will be named "over10" and
take values true or false.

## Boolean expressions

Supports \`AND\`/\`OR\`, \`NOT\` & \`XOR\`.

### AND and OR

AND returns true if both operands are true, and false otherwise.

OR returns true if at least one of the operands is true.

\`\`\`questdb-sql
SELECT
    (true AND false) AS this_will_return_false,
    (true OR false) AS this_will_return_true;
\`\`\`

### NOT

NOT inverts the truth value of the operand.

\`\`\`questdb-sql
SELECT
    NOT (true AND false) AS this_will_return_true;
\`\`\`

### XOR

^ is the bitwise XOR operator. It applies only to the Long data type.
Depending on what you need, you might prefer to cast the input and
output to boolean values.

\`\`\`questdb-sql
SELECT
    (1 ^ 1) AS will_return_0,
    (1 ^ 20) AS will_return_21,
    (true::int ^ false::long)::boolean AS will_return_true,
    (true::int ^ true::long)::boolean AS will_return_false;
\`\`\`

## Aggregation

Supported aggregation functions are listed on the
[aggregation reference](/docs/reference/function/aggregation/).

### Aggregation by group

QuestDB evaluates aggregation functions without need for traditional \`GROUP BY\`
whenever there is a mix of column names and aggregation functions
in a \`SELECT\` clause. You can have any number of discrete value columns and
any number of aggregation functions. The three statements below are equivalent.

\`\`\`questdb-sql title="QuestDB dialect"
SELECT symbol, avg(price), count()
FROM trades;
\`\`\`

\`\`\`questdb-sql title="Traditional SQL equivalent"
SELECT symbol, avg(price), count()
FROM trades
GROUP BY Symbol;
\`\`\`

\`\`\`questdb-sql title="Traditional SQL equivalent with positional argument"
SELECT symbol, avg(price), count()
FROM trades
GROUP BY 1;
\`\`\`

### Aggregation arithmetic

Aggregation functions can be used in arithmetic expressions. The following
computes \`mid\` of prices for every symbol.

\`\`\`questdb-sql
SELECT symbol, (min(price) + max(price))/2 mid, count() count
FROM trades;
\`\`\`

:::tip

Whenever possible, it is recommended to perform arithmetic \`outside\` of
aggregation functions as this can have a dramatic impact on performance. For
example, \`min(price/2)\` is going to execute considerably more slowly than
\`min(price)/2\`, although both return the same result.

:::

## Supported clauses

QuestDB supports the following standard SQL clauses within SELECT statements.

### CASE

Conditional results based on expressions.

#### Syntax

![Flow chart showing the syntax of CASE](/images/docs/diagrams/case.svg)

For more information, please refer to the
[CASE reference](/docs/reference/function/conditional/)

### CAST

Convert values and expression between types.

#### Syntax

![Flow chart showing the syntax of the CAST keyword](/images/docs/diagrams/cast.svg)

For more information, please refer to the
[CAST reference](/docs/reference/sql/cast/)

### DISTINCT

Returns distinct values of the specified column(s).

#### Syntax

![Flow chart showing the syntax of the DISTINCT keyword](/images/docs/diagrams/distinct.svg)

For more information, please refer to the
[DISTINCT reference](/docs/reference/sql/distinct/).

### FILL

Defines filling strategy for missing data in aggregation queries. This function
complements [SAMPLE BY](/docs/reference/sql/sample-by/) queries.

#### Syntax

![Flow chart showing the syntax of the FILL keyword](/images/docs/diagrams/fill.svg)

For more information, please refer to the
[FILL reference](/docs/reference/sql/fill/).

### JOIN

Join tables based on a key or timestamp.

#### Syntax

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/images/docs/diagrams/joinOverview.svg)

For more information, please refer to the
[JOIN reference](/docs/reference/sql/join/)

### LIMIT

Specify the number and position of records returned by a query.

#### Syntax

![Flow chart showing the syntax of the LIMIT keyword](/images/docs/diagrams/limit.svg)

For more information, please refer to the
[LIMIT reference](/docs/reference/sql/limit/).

### ORDER BY

Orders the results of a query by one or several columns.

#### Syntax

![Flow chart showing the syntax of the ORDER BY keyword](/images/docs/diagrams/orderBy.svg)

For more information, please refer to the
[ORDER BY reference](/docs/reference/sql/order-by)

### UNION, EXCEPT & INTERSECT

Combine the results of two or more select statements. Can include or ignore
duplicates.

#### Syntax

![Flow chart showing the syntax of the UNION, EXCEPT & INTERSECT keyword](/images/docs/diagrams/unionExceptIntersect.svg)

For more information, please refer to the
[UNION, EXCEPT & INTERSECT reference](/docs/reference/sql/union-except-intersect/)

### WHERE

Filters query results

#### Syntax

![Flow chart showing the syntax of the WHERE clause](/images/docs/diagrams/where.svg)

QuestDB supports complex WHERE clauses along with type-specific searches. For
more information, please refer to the
[WHERE reference](/docs/reference/sql/where/). There are different syntaxes for
[text](/docs/reference/sql/where/#symbol-and-string),
[numeric](/docs/reference/sql/where/#numeric), or
[timestamp](/docs/reference/sql/where/#timestamp-and-date) filters.

## Additional time-series clauses

QuestDB augments SQL with the following clauses.

### LATEST ON

Retrieves the latest entry by timestamp for a given key or combination of keys
This function requires a
[designated timestamp](/docs/concept/designated-timestamp/).

#### Syntax

![Flow chart showing the syntax of the LATEST ON keyword](/images/docs/diagrams/latestOn.svg)

For more information, please refer to the
[LATEST ON reference](/docs/reference/sql/latest-on/).

### SAMPLE BY

Aggregates [time-series data](/blog/what-is-time-series-data/) into homogeneous time chunks. For example daily
average, monthly maximum etc. This function requires a
[designated timestamp](/docs/concept/designated-timestamp/).

#### Syntax

![Flow chart showing the syntax of the SAMPLE BY keyword](/images/docs/diagrams/sampleBy.svg)

For more information, please refer to the
[SAMPLE BY reference](/docs/reference/sql/sample-by/).

### TIMESTAMP

Dynamically creates a
[designated timestamp](/docs/concept/designated-timestamp/) on the output of a
query. This allows to perform timestamp operations like [SAMPLE BY](#sample-by)
or [LATEST ON](#latest-on) on tables which originally do not have a designated
timestamp.

:::caution

The output query must be ordered by time. \`TIMESTAMP()\` does not check for order
and using timestamp functions on unordered data may produce unexpected results.

:::

#### Syntax

![Flow chart showing the syntax of the timestamp function](/images/docs/diagrams/dynamicTimestamp.svg)

For more information, refer to the
[TIMESTAMP reference](/docs/reference/function/timestamp/)
`
  },
  {
    path: 'sql/show.md',
    title: 'SHOW keyword',
    headers: ['Syntax', 'Description', 'See also'],
    content: `This keyword provides table, column, and partition information including
metadata. The \`SHOW\` keyword is useful for checking the
[designated timestamp setting](/docs/concept/designated-timestamp/) column, the
[partition attachment settings](/docs/reference/sql/alter-table-attach-partition/),
and partition storage size on disk.

## Syntax

![Flow chart showing the syntax of the SHOW keyword](/images/docs/diagrams/show.svg)

## Description

- \`SHOW TABLES\` returns all the tables.
- \`SHOW COLUMNS\` returns all the columns and their metadata for the selected
  table.
- \`SHOW PARTITIONS\` returns the partition information for the selected table.
- \`SHOW CREATE TABLE\` returns a DDL query that allows you to recreate the table.
- \`SHOW USER\` shows user secret (enterprise-only)
- \`SHOW GROUPS\` shows all groups the user belongs or all groups in the system
    (enterprise-only)
- \`SHOW USERS\` shows all users (enterprise-only)
- \`SHOW SERVICE ACCOUNT\` displays details of a service account (enterprise-only)
- \`SHOW SERVICE ACCOUNTS\` displays all service accounts or those assigned to the
  user/group (enterprise-only)
- \`SHOW PERMISSIONS\` displays permissions of user, group or service account
  (enterprise-only)
- \`SHOW SERVER_VERSION\` displays PostgreSQL compatibility version
- \`SHOW PARAMETERS\` shows configuration keys and their matching \`env_var_name\`,
  their values and the source of the value

## Examples

### SHOW TABLES

\`\`\`questdb-sql title="show tables" demo
SHOW TABLES;
\`\`\`

| table_name      |
| --------------- |
| ethblocks_json  |
| trades          |
| weather         |
| AAPL_orderbook  |
| trips           |

### SHOW COLUMNS

\`\`\`questdb-sql
SHOW COLUMNS FROM my_table;
\`\`\`

| column | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | designated |
| ------ | --------- | ------- | ------------------ | ------------ | -------------- | ---------- |
| symb   | SYMBOL    | true    | 1048576            | false        | 256            | false      |
| price  | DOUBLE    | false   | 0                  | false        | 0              | false      |
| ts     | TIMESTAMP | false   | 0                  | false        | 0              | true       |
| s      | STRING    | false   | 0                  | false        | 0              | false      |


### SHOW CREATE TABLE

\`\`\`questdb-sql title="retrieving table ddl" demo
SHOW CREATE TABLE trades;
\`\`\`

| ddl                                                                                                                                                                                                                                      |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| CREATE TABLE trades (symbol SYMBOL CAPACITY 256 CACHE, side SYMBOL CAPACITY 256 CACHE, price DOUBLE, amount DOUBLE, timestamp TIMESTAMP) timestamp(timestamp) PARTITION BY DAY WAL WITH maxUncommittedRows=500000, o3MaxLag=600000000us; |

This is printed with formatting, so when pasted into a text editor that support formatting characters, you will see:

\`\`\`questdb-sql
CREATE TABLE trades ( 
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL
WITH maxUncommittedRows=500000, o3MaxLag=600000000us;
\`\`\`

#### Enterprise variant

[QuestDB Enterprise](/enterprise/) will include an additional \`OWNED BY\` clause populated with the current user.

For example,

\`\`\`questdb-sql
CREATE TABLE trades ( 
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL
WITH maxUncommittedRows=500000, o3MaxLag=600000000us
OWNED BY 'admin';
\`\`\`

This clause assigns permissions for the table to that user. 

If permissions should be assigned to a different user,
please modify this clause appropriately.

### SHOW PARTITIONS

\`\`\`questdb-sql
SHOW PARTITIONS FROM my_table;
\`\`\`

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | WEEK        | 2022-W52 | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 1     | WEEK        | 2023-W01 | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 2     | WEEK        | 2023-W02 | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

### SHOW PARAMETERS

\`\`\`questdb-sql
SHOW PARAMETERS;
\`\`\`

The output demonstrates:

- \`property_path\`: the configuration key
- \`env_var_name\`: the matching env var for the key
- \`value\`: the current value of the key
- \`value_source\`: how the value is set (default, conf or env)

| property_path                             | env_var_name                                  | value      | value_source |
| ----------------------------------------- | --------------------------------------------- | ---------- | ------------ |
| http.min.net.connection.rcvbuf            | QDB_HTTP_MIN_NET_CONNECTION_RCVBUF            | 1024       | default      |
| http.health.check.authentication.required | QDB_HTTP_HEALTH_CHECK_AUTHENTICATION_REQUIRED | true       | default      |
| pg.select.cache.enabled                   | QDB_PG_SELECT_CACHE_ENABLED                   | true       | conf         |
| cairo.sql.sort.key.max.pages              | QDB_CAIRO_SQL_SORT_KEY_MAX_PAGES              | 2147483647 | env          |

You can optionally chain \`SHOW PARAMETERS\` with other clauses:

\`\`\`questdb-sql
-- This query will return all parameters where the value contains 'C:'
SHOW PARAMETERS WHERE value ILIKE '%C:%';

-- This query will return all parameters where the property_path is not 'cairo.root' or 'cairo.sql.backup.root', ordered by the first column
SHOW PARAMETERS WHERE property_path NOT IN ('cairo.root', 'cairo.sql.backup.root') ORDER BY 1;

-- This query will return all parameters where the value_source is 'env'
SHOW PARAMETERS WHERE value_source = 'env';
\`\`\`

### SHOW USER

\`\`\`questdb-sql
SHOW USER; --as john
\`\`\`

or

\`\`\`questdb-sql
SHOW USER john;
\`\`\`

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

### SHOW USERS

\`\`\`questdb-sql
SHOW USERS;
\`\`\`

| name  |
| ----- |
| admin |
| john  |

### SHOW GROUPS

\`\`\`questdb-sql
SHOW GROUPS;
\`\`\`

or

\`\`\`questdb-sql
SHOW GROUPS john;
\`\`\`

| name       |
| ---------- |
| management |

### SHOW SERVICE ACCOUNT

\`\`\`questdb-sql
SHOW SERVICE ACCOUNT;
\`\`\`

or

\`\`\`questdb-sql
SHOW SERVICE ACCOUNT ilp_ingestion;
\`\`\`

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

### SHOW SERVICE ACCOUNTS

\`\`\`questdb-sql
SHOW SERVICE ACCOUNTS;
\`\`\`

| name       |
| ---------- |
| management |
| svc1_admin |

\`\`\`questdb-sql
SHOW SERVICE ACCOUNTS john;
\`\`\`

| name       |
| ---------- |
| svc1_admin |

\`\`\`questdb-sql
SHOW SERVICE ACCOUNTS admin_group;
\`\`\`

| name       |
| ---------- |
| svc1_admin |

### SHOW PERMISSIONS FOR CURRENT USER

\`\`\`questdb-sql
SHOW PERMISSIONS;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |

### SHOW PERMISSIONS user

\`\`\`questdb-sql
SHOW PERMISSIONS admin;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |
| INSERT     | orders     |             | f            | G      |
| UPDATE     | order_itme | quantity    | f            | G      |

### SHOW PERMISSIONS

#### For a group

\`\`\`questdb-sql
SHOW PERMISSIONS admin_group;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| INSERT     | orders     |             | f            | G      |

#### For a service account

\`\`\`questdb-sql
SHOW PERMISSIONS ilp_ingestion;
\`\`\`

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |
| INSERT     |            |             | f            | G      |
| UPDATE     |            |             | f            | G      |

### SHOW SERVER_VERSION

Shows PostgreSQL compatibility version.

\`\`\`questdb-sql
SHOW SERVER_VERSION;
\`\`\`

| server_version |
| -------------- |
| 12.3 (questdb) |

## See also

The following functions allow querying tables with filters and using the results
as part of a function:

- [table_columns()](/docs/reference/function/meta/#table_columns)
- [tables()](/docs/reference/function/meta/#tables)
- [table_partitions()](/docs/reference/function/meta/#table_partitions)
`
  },
  {
    path: 'sql/snapshot.md',
    title: 'SNAPSHOT keyword',
    headers: ['Syntax'],
    content: `This is a *deprecated* syntax to prepare the database for a full backup or a filesystem (disk) snapshot. 
\`SNAPSHOT\` SQL syntax has been superceded by [\`CHECKPOINT\` SQL syntax](/docs/reference/sql/checkpoint/)

_For a detailed guide backup creation and restoration? Check out our
[Backup and Restore](/docs/operations/backup/) guide!_

## Syntax

![Flow chart showing the syntax of the SNAPSHOT keyword](/images/docs/diagrams/snapshot.svg)

`
  },
  {
    path: 'sql/truncate.md',
    title: 'TRUNCATE TABLE keyword',
    headers: ['Syntax', 'Notes', 'See also'],
    content: `\`TRUNCATE TABLE\` permanently deletes the contents of a table without deleting
the table itself.

## Syntax

![Flow chart showing the syntax of the TRUNCATE TABLE keyword](/images/docs/diagrams/truncateTable.svg)

## Notes

This command irremediably deletes the data in the target table. In doubt, make
sure you have created [backups](/docs/operations/backup/) of your data.

## Examples

\`\`\`questdb-sql
TRUNCATE TABLE ratings;
\`\`\`

## See also

To delete both the data and the table structure, use
[DROP](/docs/reference/sql/drop/).
`
  },
  {
    path: 'sql/union-except-intersect.md',
    title: 'UNION EXCEPT INTERSECT keywords',
    headers: ['Syntax', 'Keyword execution priority', 'Clauses', 'Alias'],
    content: `## Overview

\`UNION\`, \`EXCEPT\`, and \`INTERSECT\` perform set operations.

\`UNION\` is used to combine the results of two or more queries.

\`EXCEPT\` and \`INTERSECT\` return distinct rows by comparing the results of two
queries.

To work properly, all of the following must be true:

- Each query statement should return the same number of column.
- Each column to be combined should have data types that are either the same, or
  supported by \`implicit cast\`. For example, IPv4 columns can be combined with VARCHAR/STRING
  columns as they will be automatically cast. See [CAST](/docs/reference/sql/cast/) for more
  information.
  - Example:
    \`\`\`questdb-sql
    select '1'::varchar as col from long_sequence(1)
    union all
    select '127.0.0.1'::ipv4 from long_sequence(1);
    \`\`\`

- Columns in each query statement should be in the same order.

## Syntax

### UNION

![Flow chart showing the syntax of the UNION, EXCEPT & INTERSECT keyword](/images/docs/diagrams/unionExceptIntersect.svg)

- \`UNION\` returns distinct results.
- \`UNION ALL\` returns all \`UNION\` results including duplicates.
- \`EXCEPT\` returns distinct rows from the left input query that are not returned
  by the right input query.
- \`EXCEPT ALL\` returns all \`EXCEPT\` results including duplicates.
- \`INTERSECT\` returns distinct rows that are returned by both input queries.
- \`INTERSECT ALL\` returns all \`INTERSECT\` results including duplicates.

## Examples

The examples for the set operations use the following tables:

sensor_1:

| ID  | make              | city          |
| --- | ----------------- | ------------- |
| 1   | Honeywell         | New York      |
| 2   | United Automation | Miami         |
| 3   | Omron             | Miami         |
| 4   | Honeywell         | San Francisco |
| 5   | Omron             | Boston        |
| 6   | RS Pro            | Boston        |
| 1   | Honeywell         | New York      |

Notice that the last row in the sensor_1 table is a duplicate.

sensor_2:

| ID  | make              | city          |
| --- | ----------------- | ------------- |
| 1   | Honeywell         | San Francisco |
| 2   | United Automation | Boston        |
| 3   | Eberle            | New York      |
| 4   | Honeywell         | Boston        |
| 5   | Omron             | Boston        |
| 6   | RS Pro            | Boston        |

### UNION

\`\`\`questdb-sql
sensor_1 UNION sensor_2;
\`\`\`

returns

| ID  | make              | city          |
| --- | ----------------- | ------------- |
| 1   | Honeywell         | New York      |
| 2   | United Automation | Miami         |
| 3   | Omron             | Miami         |
| 4   | Honeywell         | San Francisco |
| 5   | Omron             | Boston        |
| 6   | RS Pro            | Boston        |
| 1   | Honeywell         | San Francisco |
| 2   | United Automation | Boston        |
| 3   | Eberle            | New York      |
| 4   | Honeywell         | Boston        |

\`UNION\` eliminates duplication even when one of the queries returns nothing.

For instance:

\`\`\`questdb-sql
sensor_1
UNION
sensor_2 WHERE ID > 10;
\`\`\`

returns:

| ID  | make              | city          |
| --- | ----------------- | ------------- |
| 1   | Honeywell         | New York      |
| 2   | United Automation | Miami         |
| 3   | Omron             | Miami         |
| 4   | Honeywell         | San Francisco |
| 5   | Omron             | Boston        |
| 6   | RS Pro            | Boston        |

The duplicate row in \`sensor_1\` is not returned as a result.

\`\`\`questdb-sql
sensor_1 UNION ALL sensor_2;
\`\`\`

returns

| ID  | make              | city          |
| --- | ----------------- | ------------- |
| 1   | Honeywell         | New York      |
| 2   | United Automation | Miami         |
| 3   | Omron             | Miami         |
| 4   | Honeywell         | San Francisco |
| 5   | Omron             | Boston        |
| 6   | RS Pro            | Boston        |
| 1   | Honeywell         | San Francisco |
| 2   | United Automation | Boston        |
| 3   | Eberle            | New York      |
| 4   | Honeywell         | Boston        |
| 5   | Omron             | Boston        |
| 6   | RS Pro            | Boston        |

### EXCEPT

\`\`\`questdb-sql
sensor_1 EXCEPT sensor_2;
\`\`\`

returns

| ID  | make              | city          |
| --- | ----------------- | ------------- |
| 1   | Honeywell         | New York      |
| 2   | United Automation | Miami         |
| 3   | Omron             | Miami         |
| 4   | Honeywell         | San Francisco |

Notice that \`EXCEPT\` eliminates duplicates. Let's run \`EXCEPT ALL\` to change
that.

\`\`\`questdb-sql
sensor_1 EXCEPT ALL sensor_2;
\`\`\`

| ID  | make              | city          |
| --- | ----------------- | ------------- |
| 1   | Honeywell         | New York      |
| 2   | United Automation | Miami         |
| 3   | Omron             | Miami         |
| 4   | Honeywell         | San Francisco |
| 1   | Honeywell         | New York      |

### INTERSECT

\`\`\`questdb-sql
sensor_1 INTERSECT sensor_2;
\`\`\`

returns

| ID  | make   | city   |
| --- | ------ | ------ |
| 5   | Omron  | Boston |
| 6   | RS Pro | Boston |

In this example we have no duplicates, but if there were any, we could use
\`INTERSECT ALL\` to have them.

## Keyword execution priority

The QuestDB's engine processes the keywords from left to right, unless the
priority is defined by parenthesis.

For example:

\`\`\`questdb-sql
query_1 UNION query_2 EXCEPT query_3;
\`\`\`

is executed as:

\`\`\`questdb-sql
(query_1 UNION query_2) EXCEPT query_3;
\`\`\`

Similarly, the following syntax:

\`\`\`questdb-sql
query_1 UNION query_2 INTERSECT query_3;
\`\`\`

is executed as:

\`\`\`questdb-sql
(query_1 UNION query_2) INTERSECT query_3;
\`\`\`

## Clauses

The set operations can be used with clauses such as \`LIMIT\`, \`ORDER BY\`, and
\`WHERE\`. However, when the clause keywords are added after the set operations,
the execution order for different clauses varies.

For \`LIMIT\` and \`ORDER BY\`, the clauses are applied after the set operations.

For example:

\`\`\`questdb-sql
query_1 UNION query_2
LIMIT 3;
\`\`\`

is executed as:

\`\`\`questdb-sql
(query_1 UNION query_2)
LIMIT 3;
\`\`\`

For \`WHERE\`, the clause is applied first to the query immediate prior to it.

\`\`\`questdb-sql
query_1 UNION query_2
WHERE value = 1;
\`\`\`

is executed as:

\`\`\`questdb-sql
query_1 UNION (query_2 WHERE value = 1);
\`\`\`

:::note

- QuestDB applies \`GROUP BY\` implicitly. See
  [GROUP BY reference](/docs/reference/sql/group-by/) for more information.
- Quest does not support the clause \`HAVING\` yet.

:::

## Alias

When different aliases are used with set operations, the execution follows a
left-right order and the output uses the first alias.

For example:

\`\`\`questdb-sql
SELECT alias_1 FROM table_1
UNION
SELECT alias_2 FROM table_2;
\`\`\`

The output shows \`alias_1\`.

`
  },
  {
    path: 'sql/update.md',
    title: 'UPDATE keyword',
    headers: ['Syntax'],
    content: `Updates data in a database table.

## Syntax

![Flow chart showing the syntax of the UPDATE keyword](/images/docs/diagrams/update.svg)

:::note

- the same \`columnName\` cannot be specified multiple times after the SET keyword
  as it would be ambiguous
- the designated timestamp column cannot be updated as it would lead to altering
  history of the [time-series data](/blog/what-is-time-series-data/)
- If the target partition is
  [attached by a symbolic link](/docs/reference/sql/alter-table-attach-partition/#symbolic-links),
  the partition is read-only. \`UPDATE\` operation on a read-only partition will
  fail and generate an error.

:::

## Examples

\`\`\`questdb-sql title="Update with constant"
UPDATE trades SET price = 125.34 WHERE symbol = 'AAPL';
\`\`\`

\`\`\`questdb-sql title="Update with function"
UPDATE book SET mid = (bid + ask)/2 WHERE symbol = 'AAPL';
\`\`\`

\`\`\`questdb-sql title="Update with subquery"
UPDATE spreads s SET s.spread = p.ask - p.bid FROM prices p WHERE s.symbol = p.symbol;
\`\`\`

\`\`\`questdb-sql title="Update with multiple joins"
WITH up AS (
    SELECT p.ask - p.bid AS spread, p.timestamp
    FROM prices p
    JOIN instruments i ON p.symbol = i.symbol
    WHERE i.type = 'BOND'
)
UPDATE spreads s
SET spread = up.spread
FROM up
WHERE s.timestamp = up.timestamp;
\`\`\`

\`\`\`questdb-sql title="Update with a sub-query"
WITH up AS (
    SELECT symbol, spread, ts
    FROM temp_spreads
    WHERE timestamp between '2022-01-02' and '2022-01-03'
)
UPDATE spreads s
SET spread = up.spread
FROM up
WHERE up.ts = s.ts AND s.symbol = up.symbol;
\`\`\`
`
  },
  {
    path: 'sql/vacuum-table.md',
    title: 'VACUUM TABLE',
    headers: ['Syntax', 'Description'],
    content: `\`VACUUM TABLE\` reclaims storage by scanning file systems and deleting duplicate
directories and files.

## Syntax

![Flow chart showing Vacuum Table syntax](/images/docs/diagrams/vacuumTable.svg)

## Description

This command provides a manual mechanism to reclaim the disk space. The
implementation scans file system to detect duplicate directories and files.
Frequent usage of the command can be relatively expensive. Thus, \`VACUUM TABLE\`
has to be executed sparingly.

When a table is appended in an out-of-order manner, the \`VACUUM TABLE\` command
writes a new partition version to the disk. The old partition version directory
is deleted once it is not read by \`SELECT\` queries. In the event of file system
errors, physical deletion of old files may be interrupted and an outdated
partition version may be left behind consuming the disk space.

When an \`UPDATE\` SQL statement is run, it copies column files of the selected
table. The old column files are automatically deleted but in certain
circumstances, they can be left behind. In this case, \`VACUUM TABLE\` can be used
to re-trigger the deletion process of the old column files.

The \`VACUUM TABLE\` command starts a new scan over table partition directories
and column files. It detects redundant, unused files consuming the disk space
and deletes them. \`VACUUM TABLE\` executes asynchronously, i.e. it may keep
scanning and deleting files after their response is returned to the SQL client.

## Example

\`\`\`questdb-sql
VACUUM TABLE trades;
\`\`\`
`
  },
  {
    path: 'sql/where.md',
    title: 'WHERE keyword',
    headers: ['Syntax', 'Symbol and string', 'Numeric', 'Boolean', 'Timestamp and date'],
    content: `\`WHERE\` clause filters data. Filter expressions are required to return boolean
result.

QuestDB includes a [JIT compiler](/docs/concept/jit-compiler/) for SQL queries
which contain \`WHERE\` clauses.

## Syntax

The general syntax is as follows. Specific filters have distinct syntaxes
detailed thereafter.

![Flow chart showing the syntax of the WHERE clause](/images/docs/diagrams/where.svg)

### Logical operators

QuestDB supports \`AND\`, \`OR\`, \`NOT\` as logical operators and can assemble
conditions using brackets \`()\`.

![Flow chart showing the detailed syntax of the WHERE clause](/images/docs/diagrams/whereComplex.svg)

\`\`\`questdb-sql title="Example"
SELECT * FROM table
WHERE
a = 1 AND (b = 2 OR c = 3 AND NOT d);
\`\`\`

## Symbol and string

QuestDB can filter strings and symbols based on equality, inequality, and
regular expression patterns.

### Exact match

Evaluates match of a string or symbol.

![Flow chart showing the syntax of the WHERE clause with a string comparison](/images/docs/diagrams/whereExactString.svg)

\`\`\`questdb-sql title="Example"
SELECT * FROM users
WHERE name = 'John';
\`\`\`

| name | age |
| ---- | --- |
| John | 31  |
| John | 45  |
| ...  | ... |

### Does NOT match

Evaluates mismatch of a string or symbol.

![Flow chart showing the syntax of the WHERE clause with a string comparison](/images/docs/diagrams/whereStringNotMatch.svg)

\`\`\`questdb-sql title="Example"
SELECT * FROM users
WHERE name != 'John';
\`\`\`

| name | age |
| ---- | --- |
| Tim  | 31  |
| Tom  | 45  |
| ...  | ... |

### Regular expression match

Evaluates match against a regular expression defined using
[java.util.regex](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html)
patterns.

![Flow chart showing the syntax of the WHERE clause with a regex comparison](/images/docs/diagrams/whereRegexMatch.svg)

\`\`\`questdb-sql title="Regex example"
SELECT * FROM users WHERE name ~ 'Jo';
\`\`\`

| name     | age |
| -------- | --- |
| Joe      | 31  |
| Jonathan | 45  |
| ...      | ... |

### Regular expression does NOT match

Evaluates mismatch against a regular expression defined using
[java.util.regex](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html)
patterns.

![Flow chart showing the syntax of the WHERE clause with a regex comparison](/images/docs/diagrams/whereRegexNotMatch.svg)

\`\`\`questdb-sql title="Example"
SELECT * FROM users WHERE name !~ 'Jo';
\`\`\`

| name | age |
| ---- | --- |
| Tim  | 31  |
| Tom  | 45  |
| ...  | ... |

### List search

Evaluates match or mismatch against a list of elements.

![Flow chart showing the syntax of the WHERE clause with a list comparison](/images/docs/diagrams/whereListIn.svg)

\`\`\`questdb-sql title="List match"
SELECT * FROM users WHERE name in('Tim', 'Tom');
\`\`\`

| name | age |
| ---- | --- |
| Tim  | 31  |
| Tom  | 45  |
| ...  | ... |

\`\`\`questdb-sql title="List mismatch"
SELECT * FROM users WHERE NOT name in('Tim', 'Tom');
\`\`\`

| name   | age |
| ------ | --- |
| Aaron  | 31  |
| Amelie | 45  |
| ...    | ... |

## Numeric

QuestDB can filter numeric values based on equality, inequality, comparison, and
proximity.

:::note

For timestamp filters, we recommend the
[timestamp search notation](#timestamp-and-date) which is faster and less
verbose.

:::

### Equality, inequality and comparison

![Flow chart showing the syntax of the WHERE clause with a numeric comparison](/images/docs/diagrams/whereNumericValue.svg)

\`\`\`questdb-sql title="Superior or equal to 23"
SELECT * FROM users WHERE age >= 23;
\`\`\`

\`\`\`questdb-sql title="Equal to 23"
SELECT * FROM users WHERE age = 23;
\`\`\`

\`\`\`questdb-sql title="NOT Equal to 23"
SELECT * FROM users WHERE age != 23;
\`\`\`

<!--
QuestDB does not support \`eq()\`. This section is therefore commented out and can be uncommented when we add the functionality.
### Proximity

Evaluates whether the column value is within a range of the target value. This
is useful to simulate equality on \`double\` and \`float\` values.

![Flow chart showing the syntax of the WHERE clause with an EQ comparison](/images/docs/diagrams/whereEqDoublePrecision.svg)

\`\`\`questdb-sql title="Equal to 23 with 0.00001 precision"
SELECT * FROM users WHERE eq(age, 23, 0.00001);
\`\`\`

:::tip

When performing multiple equality checks of double values against integer
constants, it may be preferable to store double values as long integers with a
scaling factor.

:::
-->

## Boolean

![Flow chart showing the syntax of the WHERE clause with a boolean comparison](/images/docs/diagrams/whereBoolean.svg)

Using the columnName will return \`true\` values. To return \`false\` values,
precede the column name with the \`NOT\` operator.

\`\`\`questdb-sql title="Example - true"
SELECT * FROM users WHERE isActive;
\`\`\`

| userId | isActive |
| ------ | -------- |
| 12532  | true     |
| 38572  | true     |
| ...    | ...      |

\`\`\`questdb-sql title="Example - false"
SELECT * FROM users WHERE NOT isActive;
\`\`\`

| userId | isActive |
| ------ | -------- |
| 876534 | false    |
| 43234  | false    |
| ...    | ...      |

## Timestamp and date

QuestDB supports both its own timestamp search notation and standard search
based on inequality. This section describes the use of the **timestamp search
notation** which is efficient and fast but requires a
[designated timestamp](/docs/concept/designated-timestamp/).

If a table does not have a designated timestamp applied during table creation,
one may be applied dynamically
[during a select operation](/docs/reference/function/timestamp/#during-a-select-operation).

### Native timestamp format

QuestDB automatically recognizes strings formatted as ISO timestamp as a
\`timestamp\` type. The following are valid examples of strings parsed as
\`timestamp\` types:

| Valid STRING Format              | Resulting Timestamp         |
| -------------------------------- | --------------------------- |
| 2010-01-12T12:35:26.123456+01:30 | 2010-01-12T11:05:26.123456Z |
| 2010-01-12T12:35:26.123456+01    | 2010-01-12T11:35:26.123456Z |
| 2010-01-12T12:35:26.123456Z      | 2010-01-12T12:35:26.123456Z |
| 2010-01-12T12:35:26.12345        | 2010-01-12T12:35:26.123450Z |
| 2010-01-12T12:35:26.1234         | 2010-01-12T12:35:26.123400Z |
| 2010-01-12T12:35:26.123          | 2010-01-12T12:35:26.123000Z |
| 2010-01-12T12:35:26.12           | 2010-01-12T12:35:26.120000Z |
| 2010-01-12T12:35:26.1            | 2010-01-12T12:35:26.100000Z |
| 2010-01-12T12:35:26              | 2010-01-12T12:35:26.000000Z |
| 2010-01-12T12:35                 | 2010-01-12T12:35:00.000000Z |
| 2010-01-12T12                    | 2010-01-12T12:00:00.000000Z |
| 2010-01-12                       | 2010-01-12T00:00:00.000000Z |
| 2010-01                          | 2010-01-01T00:00:00.000000Z |
| 2010                             | 2010-01-01T00:00:00.000000Z |
| 2010-01-12 12:35:26.123456-02:00 | 2010-01-12T14:35:26.123456Z |
| 2010-01-12 12:35:26.123456Z      | 2010-01-12T12:35:26.123456Z |
| 2010-01-12 12:35:26.123          | 2010-01-12T12:35:26.123000Z |
| 2010-01-12 12:35:26.12           | 2010-01-12T12:35:26.120000Z |
| 2010-01-12 12:35:26.1            | 2010-01-12T12:35:26.100000Z |
| 2010-01-12 12:35:26              | 2010-01-12T12:35:26.000000Z |
| 2010-01-12 12:35                 | 2010-01-12T12:35:00.000000Z |

### Exact timestamp

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a timestamp comparison](/images/docs/diagrams/whereTimestampExact.svg)

\`\`\`questdb-sql title="Timestamp equals date"
SELECT scores WHERE ts = '2010-01-12T00:02:26.000Z';
\`\`\`

| ts                       | score |
| ------------------------ | ----- |
| 2010-01-12T00:02:26.000Z | 2.4   |
| 2010-01-12T00:02:26.000Z | 3.1   |
| ...                      | ...   |

\`\`\`questdb-sql title="Timestamp equals timestamp"
SELECT scores WHERE ts = '2010-01-12T00:02:26.000000Z';
\`\`\`

| ts                          | score |
| --------------------------- | ----- |
| 2010-01-12T00:02:26.000000Z | 2.4   |
| 2010-01-12T00:02:26.000000Z | 3.1   |
| ...                         | ...   |

### Time range (WHERE IN)

Returns results within a defined range.

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a partial timestamp comparison](/images/docs/diagrams/whereTimestampPartial.svg)

\`\`\`questdb-sql title="Results in a given year"
SELECT * FROM scores WHERE ts IN '2018';
\`\`\`

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:0000.000000Z  | 123.4 |
| ...                         | ...   |
| 2018-12-31T23:59:59.999999Z | 115.8 |

\`\`\`questdb-sql title="Results in a given minute"
SELECT * FROM scores WHERE ts IN '2018-05-23T12:15';
\`\`\`

| ts                          | score |
| --------------------------- | ----- |
| 2018-05-23T12:15:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-05-23T12:15:59.999999Z | 115.8 |

### Time range with interval modifier

You can apply a modifier to further customize the range. The modifier extends
the upper bound of the original timestamp based on the modifier parameter. An
optional interval with occurrence can be set, to apply the search in the given
time range repeatedly, for a set number of times.

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a timestamp/modifier comparison](/images/docs/diagrams/whereTimestampIntervalSearch.svg)

- \`timestamp\` is the original time range for the query.
- \`modifier\` is a signed integer modifying the upper bound applying to the
  \`timestamp\`:

  - A \`positive\` value extends the selected period.
  - A \`negative\` value reduces the selected period.

- \`interval\` is an unsigned integer indicating the desired interval period for
  the time range.
- \`repetition\` is an unsigned integer indicating the number of times the
  interval should be applied.

#### Examples

Modifying the range:

\`\`\`questdb-sql title="Results in a given year and the first month of the next year"
SELECT * FROM scores WHERE ts IN '2018;1M';
\`\`\`

The range is 2018. The modifier extends the upper bound (originally 31 Dec 2018)
by one month.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2019-01-31T23:59:59.999999Z | 115.8 |

\`\`\`questdb-sql title="Results in a given month excluding the last 3 days"
SELECT * FROM scores WHERE ts IN '2018-01;-3d';
\`\`\`

The range is Jan 2018. The modifier reduces the upper bound (originally 31
Jan 2018) by 3 days.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-28T23:59:59.999999Z | 113.8 |

Modifying the interval:

\`\`\`questdb-sql title="Results on a given date with an interval"
SELECT * FROM scores WHERE ts IN '2018-01-01;1d;1y;2';

\`\`\`

The range is extended by one day from Jan 1 2018, with a one-year interval,
repeated twice. This means that the query searches for results on Jan 1-2 in
2018 and in 2019:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-02T23:59:59.999999Z | 110.3 |
| 2019-01-01T00:00:00.000000Z | 128.7 |
| ...                         | ...   |
| 2019-01-02T23:59:59.999999Z | 103.8 |

A more complete query breakdown would appear as such:

\`\`\`questdb-sql
-- IN extension for time-intervals

SELECT * FROM trades WHERE timestamp in '2023'; -- whole year
SELECT * FROM trades WHERE timestamp in '2023-12'; -- whole month
SELECT * FROM trades WHERE timestamp in '2023-12-20'; -- whole day

-- The whole day, extending 15s into the next day
SELECT * FROM trades WHERE timestamp in '2023-12-20;15s';

-- For the past 7 days, 2 seconds before and after midnight
SELECT * from trades WHERE timestamp in '2023-09-20T23:59:58;4s;-1d;7'
\`\`\`

### IN with multiple arguments

#### Syntax

\`IN\` with more than 1 argument is treated as standard SQL \`IN\`. It is a
shorthand of multiple \`OR\` conditions, i.e. the following query:

\`\`\`questdb-sql title="IN list"
SELECT * FROM scores
WHERE ts IN ('2018-01-01', '2018-01-01T12:00', '2018-01-02');
\`\`\`

is equivalent to:

\`\`\`questdb-sql title="IN list equivalent OR"
SELECT * FROM scores
WHERE ts = '2018-01-01' or ts = '2018-01-01T12:00' or ts = '2018-01-02';
\`\`\`

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| 2018-01-01T12:00:00.000000Z | 589.1 |
| 2018-01-02T00:00:00.000000Z | 131.5 |

### BETWEEN

#### Syntax

For non-standard ranges, users can explicitly specify the target range using the
\`BETWEEN\` operator. As with standard SQL, both upper and lower bounds of
\`BETWEEN\` are inclusive, and the order of lower and upper bounds is not
important so that \`BETWEEN X AND Y\` is equivalent to \`BETWEEN Y AND X\`.

\`\`\`questdb-sql title="Explicit range"
SELECT * FROM scores
WHERE ts BETWEEN '2018-01-01T00:00:23.000000Z' AND '2018-01-01T00:00:23.500000Z';
\`\`\`

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:23.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-01T00:00:23.500000Z | 131.5 |

\`BETWEEN\` can accept non-constant bounds, for example, the following query will
return all records older than one year before the current date:

\`\`\`questdb-sql title="One year before current date"
SELECT * FROM scores
WHERE ts BETWEEN to_str(now(), 'yyyy-MM-dd')
AND dateadd('y', -1, to_str(now(), 'yyyy-MM-dd'));
\`\`\`

##### Inclusivity example

Inclusivity is precise, and may be more granular than the provided dates appear.

If a timestamp in the format YYYY-MM-DD is passed forward, it is computed as YYYY-MM-DDThh:mm:ss.sss.

To demonstrate, note the behaviour of the following example queries:

\`\`\`questdb-sql title="Demonstrating inclusivity"
SELECT *
FROM trades
WHERE timestamp BETWEEN '2024-04-01' AND '2024-04-03'
LIMIT -1;
\`\`\`

| symbol | side |   price   |  amount  |          timestamp          |
|--------|------|-----------|----------|-----------------------------|
| BTC-USD| sell | 65,464.14 | 0.05100764 | 2024-04-02T23:59:59.9947212 |

The query pushes to the boundaries as far as is possible, all the way to: \`2024-04-02T23:59:59.9947212\`.

If there was an event at precisely \`2024-04-03T00:00:00.00000\`, it would also be included.

Now let us look at:

\`\`\`title="Demonstrating inclusivity"
SELECT *
FROM trades
WHERE timestamp BETWEEN '2024-04-01' AND '2024-04-03T00:00:00.99'
LIMIT -1;
\`\`\`

| symbol  | side |  price   |   amount   |            timestamp             |
|---------|------|----------|------------|----------------------------------|
| ETH-USD | sell | 3,279.11 | 0.00881686 | 2024-04-03T00:00:00.988858Z      |

Even with fractional seconds, the boundary is inclusive.

A row with timestamp 2024-04-03T00:00:00.990000Z would also return in boundary.
`
  },
  {
    path: 'sql/with.md',
    title: 'WITH keyword',
    headers: ['Syntax'],
    content: `Supports Common Table Expressions (CTEs), e.i., naming one or several
sub-queries to be used with a [\`SELECT\`](/docs/reference/sql/select/),
[\`INSERT\`](/docs/reference/sql/insert/), or
[\`UPDATE\`](/docs/reference/sql/update/) query.

Using a CTE makes it easy to simplify large or complex statements which involve
sub-queries, particularly when such sub-queries are used several times.

## Syntax

![Flow chart showing the syntax of the WITH clause](/images/docs/diagrams/with.svg)

Where:

- \`alias\` is the name given to the sub-query for ease of reusing
- \`subQuery\` is a SQL query (e.g \`SELECT * FROM table\`)

## Examples

\`\`\`questdb-sql title="Single alias"
WITH first_10_users AS (SELECT * FROM users limit 10)
SELECT user_name FROM first_10_users;
\`\`\`

\`\`\`questdb-sql title="Using recursively"
WITH first_10_users AS (SELECT * FROM users limit 10),
first_5_users AS (SELECT * FROM first_10_users limit 5)
SELECT user_name FROM first_5_users;
\`\`\`

\`\`\`questdb-sql title="Flag whether individual trips are longer or shorter than average"
WITH avg_distance AS (SELECT avg(trip_distance) average FROM trips)
SELECT pickup_datetime, trips.trip_distance > avg_distance.average longer_than_average
FROM trips CROSS JOIN avg_distance;
\`\`\`

\`\`\`questdb-sql title="Update with a sub-query"
WITH up AS (
    SELECT symbol, spread, ts
    FROM temp_spreads
    WHERE timestamp between '2022-01-02' and '2022-01-03'
)
UPDATE spreads s
SET spread = up.spread
FROM up
WHERE up.ts = s.ts AND s.symbol = up.symbol;
\`\`\`

\`\`\`questdb-sql title="Insert with a sub-query"
WITH up AS (
    SELECT symbol, spread, ts
    FROM temp_spreads
    WHERE timestamp between '2022-01-02' and '2022-01-03'
)
INSERT INTO spreads
SELECT * FROM up;
\`\`\`
`
  }
]
