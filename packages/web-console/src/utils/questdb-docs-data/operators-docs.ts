// Auto-generated documentation data for operators
// Generated on 2025-09-21T12:37:52.978Z

export interface DocFile {
  path: string
  title: string
  headers: string[]
  content: string
}

export const operatorsDocs: DocFile[] = [
  {
    path: "operators/bitwise.md",
    title: "Bitwise Operators",
    headers: ["`~` NOT", "`&` AND", "`^` XOR", "`|` OR"],
    content: `This page describes the available operators to assist with performing bitwise
operations on numeric values.

## \`~\` NOT

\`~\` is a unary operation that performs bitwise negation on each bit. Bits that
are 0 become 1, and those that are 1 become 0. Expects a value of \`long\` or
\`int\` type.

#### Examples

\`\`\`questdb-sql
SELECT ~1024
\`\`\`

| column |
| ------ |
| -1025  |

## \`&\` AND

\`&\` is a binary operation that takes two equal-length binary representations and
performs the bitwise AND operation on each pair of the corresponding bits.
Expects values of \`long\` or \`int\` type.

#### Examples

\`\`\`questdb-sql
SELECT 5 & 3
\`\`\`

| column |
| ------ |
| 1      |

## \`^\` XOR

\`^\` is a binary operation that takes two bit patterns of equal length and
performs the bitwise exclusive OR (XOR) operation on each pair of corresponding
bits. Expects a value of \`long\` or \`int\` type.

#### Examples

\`\`\`questdb-sql
SELECT 5 ^ 3
\`\`\`

| column |
| ------ |
| 6      |

## \`|\` OR

\`|\` is a binary operation that takes two bit patterns of equal length and
performs the logical inclusive OR operation on each pair of corresponding bits.
Expects a value of \`long\` or \`int\` type.

#### Examples

\`\`\`questdb-sql
SELECT 5 | 3
\`\`\`

| column |
| ------ |
| 7      |
`
  },
  {
    path: "operators/comparison.md",
    title: "Comparison Operators",
    headers: ["`IN` (list)", "`=` Equals", "`>` Greater than", "`>=` Greater than or equal to", "`<` Lesser than", "`<=` Lesser than or equal to", "`<>` or `!=` Not equals", "`IN` (value1, value2, ...)"],
    content: `This page describes the available operators to assist with comparison
operations.

If \`string\` or \`char\` values are used in the input, they are converted to \`int\`
using the [ASCII Table](https://www.asciitable.com/) for comparison.

## \`IN\` (list)

\`X IN (a, b, c)\` returns true if X is present in the list.

#### Example

\`\`\`questdb-sql
SELECT 5 IN (1, 2, 7, 5, 8)
\`\`\`

| column |
| ------ |
| true   |

## \`=\` Equals

\`(value1) = (value2)\` - returns true if the two values are the same.

#### Arguments

- \`value1\` is any data type.
- \`value2\` is any data type.

#### Return value

Return value type is boolean.

#### Examples

\`\`\`questdb-sql

SELECT '5' = '5';
-- Returns true

SELECT 5 = 5;
-- Returns true

SELECT '5' = '3';
-- Returns false

SELECT 5 = 3;
-- Returns false
\`\`\`

## \`>\` Greater than

- \`(value1) > (value2)\` - returns true if \`value1\` is greater than \`value2\`.

#### Arguments

- \`value1\` and \`value2\` are one of the following data types:
    - any numeric data type
    - \`char\`
    - \`date\`
    - \`timestamp\`
    - \`symbol\`
    - \`string\`

#### Return value

Return value type is boolean.

#### Examples

\`\`\`questdb-sql

SELECT 'abc' > 'def';
-- Returns false

SELECT '5' > '5';
-- Returns false

SELECT 'a' > 'b';
-- Returns false
\`\`\`

## \`>=\` Greater than or equal to

- \`(value1) >= (value2)\` - returns true if \`value1\` is greater than \`value2\`.

#### Arguments

- \`value1\` and \`value2\` are one of the following data types:
    - any numeric data type
    - \`char\`
    - \`date\`
    - \`timestamp\`
    - \`symbol\`
    - \`string\`

#### Return value

Return value type is boolean.

#### Examples

\`\`\`questdb-sql

SELECT 'abc' >= 'def';
-- Returns false

SELECT '5' >= '5';
-- Returns true

SELECT '7' >= '5';
-- Returns true

SELECT 'a' >= 'b';
-- Returns false
\`\`\`

## \`<\` Lesser than

- \`(value1) < (value2)\` - returns true if \`value1\` is less than \`value2\`.

#### Arguments

- \`value1\` and \`value2\` are one of the following data types:
    - any numeric data type
    - \`char\`
    - \`date\`
    - \`timestamp\`
    - \`symbol\`
    - \`string\`

#### Return value

Return value type is boolean.

#### Examples

\`\`\`questdb-sql
SELECT '123' < '456';
-- Returns true

SELECT 5 < 5;
-- Returns false

SELECT 5 < 3;
-- Returns false
\`\`\`

## \`<=\` Lesser than or equal to

- \`(value1) <= (value2)\` - returns true if \`value1\` is less than \`value2\`.

#### Arguments

- \`value1\` and \`value2\` are one of the following data types:
    - any numeric data type
    - \`char\`
    - \`date\`
    - \`timestamp\`
    - \`symbol\`
    - \`string\`

#### Return value

Return value type is boolean.

#### Examples

\`\`\`questdb-sql
SELECT '123' <= '456';
-- Returns true

SELECT 5 <= 5;
-- Returns true

SELECT 5 <= 3;
-- Returns false
\`\`\`

## \`<>\` or \`!=\` Not equals

\`(value1) <> (value2)\` - returns true if \`value1\` is not equal to \`value2\`.

\`!=\` is an alias of \`<>\`.

#### Arguments

- \`value1\` is any data type.
- \`value2\` is any data type.

#### Return value

Return value type is boolean.

#### Examples

\`\`\`questdb-sql

SELECT '5' <> '5';
-- Returns false

SELECT 5 <> 5;
-- Returns false

SELECT 'a' <> 'b';
-- Returns true

SELECT 5 <> 3;
-- Returns true

\`\`\`

## \`IN\` (value1, value2, ...)

The \`IN\` operator, when used with more than one argument, behaves as the
standard SQL \`IN\`. It provides a concise way to represent multiple OR-ed
equality conditions.

#### Arguments

- \`value1\`, \`value2\`, ... are string type values representing dates or
  timestamps.

#### Examples

Consider the following query:

\`\`\`questdb-sql title="IN list"
SELECT * FROM scores
WHERE ts IN ('2018-01-01', '2018-01-01T12:00', '2018-01-02');
\`\`\`

This query is equivalent to:

\`\`\`questdb-sql title="IN list equivalent OR"
SELECT * FROM scores
WHERE ts = '2018-01-01' or ts = '2018-01-01T12:00' or ts = '2018-01-02';
\`\`\`

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| 2018-01-01T12:00:00.000000Z | 589.1 |
| 2018-01-02T00:00:00.000000Z | 131.5 |
`
  },
  {
    path: "operators/date-time.md",
    title: "Date and Time Operators",
    headers: ["`BETWEEN` value1 `AND` value2", "`IN` (timeRange)", "`IN` (timeRangeWithModifier)", "`IN` (interval)"],
    content: `This page describes the available operators to assist with performing time-based
calculations.

:::note

If an operator's first argument is a table's timestamp, QuestDB may use an
[Interval Scan](/docs/concept/interval-scan) for optimization.

:::

## \`BETWEEN\` value1 \`AND\` value2

The \`BETWEEN\` operator allows you to specify a non-standard range. It includes
both upper and lower bounds, similar to standard SQL. The order of these bounds
is interchangeable, meaning \`BETWEEN X AND Y\` is equivalent to
\`BETWEEN Y AND X\`.

#### Arguments

- \`value1\` and \`value2\` can be of \`date\`, \`timestamp\`, or \`string\` type.

#### Examples

\`\`\`questdb-sql title="Explicit range"
SELECT * FROM trades
WHERE timestamp BETWEEN '2022-01-01T00:00:23.000000Z' AND '2023-01-01T00:00:23.500000Z';
\`\`\`

This query returns all records within the specified timestamp range:

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:23.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-01T00:00:23.500000Z | 131.5 |

The \`BETWEEN\` operator can also accept non-constant bounds. For instance, the
following query returns all records older than one year from the current date:

\`\`\`questdb-sql title="One year before current date" demo
SELECT * FROM trades
WHERE timestamp BETWEEN to_str(now(), 'yyyy-MM-dd')
AND dateadd('y', -1, to_str(now(), 'yyyy-MM-dd'));
\`\`\`

The result set for this query would be:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-12-31T23:59:59.999999Z | 115.8 |

\`\`\`questdb-sql title="Results between two specific timestamps"
SELECT * FROM trades WHERE ts BETWEEN '2022-05-23T12:15:00.000000Z' AND '2023-05-23T12:16:00.000000Z';
\`\`\`

This query returns all records from the 15th minute of 12 PM on May 23, 2018:

| ts                          | score |
| --------------------------- | ----- |
| 2018-05-23T12:15:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-05-23T12:15:59.999999Z | 115.8 |

## \`IN\` (timeRange)

Returns results within a defined range of time.

#### Arguments

- \`timeRange\` is a \`string\` type representing the desired time range.

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a partial timestamp comparison](/images/docs/diagrams/whereTimestampPartial.svg)

#### Examples

\`\`\`questdb-sql title="Results in a given year"
SELECT * FROM scores WHERE ts IN '2018';
\`\`\`

This query returns all records from the year 2018:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-12-31T23:59:59.999999Z | 115.8 |

\`\`\`questdb-sql title="Results in a given minute"
SELECT * FROM scores WHERE ts IN '2018-05-23T12:15';
\`\`\`

This query returns all records from the 15th minute of 12 PM on May 23, 2018:

| ts                          | score |
| --------------------------- | ----- |
| 2018-05-23T12:15:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-05-23T12:15:59.999999Z | 115.8 |

## \`IN\` (timeRangeWithModifier)

You can apply a modifier to further customize the range. The modifier extends
the upper bound of the original timestamp based on the modifier parameter. An
optional interval with occurrence can be set, to apply the search in the given
time range repeatedly, for a set number of times.

#### Arguments

- \`timeRangeWithModifier\` is a string in the format
  \`'timeRange;modifier;interval;repetition'\`.

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

In this example, the range is the year 2018. The modifier \`1M\` extends the upper
bound (originally 31 Dec 2018) by one month.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2019-01-31T23:59:59.999999Z | 115.8 |

\`\`\`questdb-sql title="Results in a given month excluding the last 3 days"
SELECT * FROM scores WHERE ts IN '2018-01;-3d';
\`\`\`

In this example, the range is January 2018. The modifier \`-3d\` reduces the upper
bound (originally 31 Jan 2018) by 3 days.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-28T23:59:59.999999Z | 113.8 |

Modifying the interval:

\`\`\`questdb-sql title="Results on a given date with an interval"
SELECT * FROM scores WHERE ts IN '2018-01-01;1d;1y;2';
\`\`\`

In this example, the range is extended by one day from Jan 1 2018, with a
one-year interval, repeated twice. This means that the query searches for
results on Jan 1-2 in 2018 and in 2019:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-02T23:59:59.999999Z | 110.3 |
| 2019-01-01T00:00:00.000000Z | 128.7 |
| ...                         | ...   |
| 2019-01-02T23:59:59.999999Z | 103.8 |

## \`IN\` (interval)

Returns results within a defined range of time, as specified by an \`interval\` value.

#### Arguments

- \`interval\` is an \`interval\` type representing the desired time range.

#### Examples

\`\`\`questdb-sql title="Check if timestamp is in interval success" demo
SELECT true as is_in_interval FROM trades
WHERE '2018-05-17T00:00:00Z'::timestamp IN interval('2018', '2019')
LIMIT -1
\`\`\`

| is_in_interval |
| -------------- |
| true           |

If we adjust the interval to be not in range, we get no result:

\`\`\`questdb-sql title="Check if timestamp is in interval failure" demo
SELECT true as is_in_interval FROM trades
WHERE '2022-05-17T00:00:00Z'::timestamp IN interval('2022', '2023')
LIMIT -1;
\`\`\`

| is_in_interval |
| -------------- |
|                |
`
  },
  {
    path: "operators/ipv4.md",
    title: "IPv4 Operators",
    headers: ["`<` Less than", "`<=` Less than or equal", "`>` Greater than", "`>=` Greater than or equal", "`=` Equals", "`!=` Does not equal", "`<<` Left strict IP address contained by", "`>>` Right strict IP address contained by", "`<<=` Left IP address contained by or equal", "`<<=` Right IP address contained by or equal", "`&` Bitwise AND", "`~` Bitwise NOT", "`|` Bitwise OR", "`+` Add offset to an IP address", "`-` Subtract offset from IP address", "`-` Difference between two IP addresses", "Return netmask - netmask(string)"],
    content: `This document outlines the IPv4 data type operators.

The IP addresses can be in the range of \`0.0.0.1\` - \`255.255.255.255\`.

The address: \`0.0.0.0\` is interpreted as \`NULL\`.

The following operators support \`string\` type arguments to permit the passing of
netmasks:

- \`<<\`
  [Strict IP address contained by](/docs/reference/operators/ipv4/#-left-strict-ip-address-contained-by)
- \`<<=\`
  [IP address contained by or equal](/docs/reference/operators/ipv4/#-left-ip-address-contained-by-or-equal)
- [rnd_ipv4(string, int)](/docs/reference/function/random-value-generator/#rnd_ipv4string-int)
- [netmask()](/docs/reference/operators/ipv4/#return-netmask---netmaskstring)

## \`<\` Less than

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is less than another.

\`\`\`sql
ipv4 '33.1.8.43' < ipv4 '200.6.38.9' -> T
\`\`\`

## \`<=\` Less than or equal

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is less than or equal to another.

\`\`\`sql
ipv4 '33.1.8.43' <= ipv4 '33.1.8.43' -> T
\`\`\`

## \`>\` Greater than

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is greater than another.

\`\`\`sql
ipv4 '33.1.8.43' > ipv4 '200.6.38.9' -> F
\`\`\`

## \`>=\` Greater than or equal

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is greater than or equal to another.

\`\`\`sql
ipv4 '33.1.8.43' >= ipv4 '200.6.38.9' -> F
\`\`\`

## \`=\` Equals

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is equal to another.

\`\`\`sql
ipv4 '44.8.9.10' = ipv4 '6.2.90.1' -> F
\`\`\`

## \`!=\` Does not equal

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is not equal to another.

\`\`\`sql
ipv4 '44.8.9.10' != ipv4 '6.2.90.1' -> T
\`\`\`

## \`<<\` Left strict IP address contained by

Takes one IPv4 argument and one string argument.

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

\`\`\`sql
ipv4 '35.24.65.11' << '35.24.65.2/16' -> T
ipv4 '35.24.65.11' << '35.24.65.2/32' -> F
\`\`\`

## \`>>\` Right strict IP address contained by

Takes one IPv4 argument and one string argument.

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

\`\`\`sql
'35.24.65.2/16' >> ipv4 '35.24.65.11' -> T
'35.24.65.2/32'  >> ipv4 '35.24.65.11' -> F
\`\`\`

## \`<<=\` Left IP address contained by or equal

Takes one IPv4 argument and one string argument

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

\`\`\`sql
ipv4 '35.24.65.11' <<= '35.24.65.2/16' -> T
ipv4 '35.24.65.11' <<= '35.24.65.2/32' -> T
\`\`\`

## \`<<=\` Right IP address contained by or equal

Takes one IPv4 argument and one string argument

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

\`\`\`sql
'35.24.65.2/16' >>= ipv4 '35.24.65.11'  -> T
'35.24.65.2/32' >>= ipv4 '35.24.65.11'  -> T
\`\`\`

## \`&\` Bitwise AND

Takes two IPv4 arguments.

Returns an IPv4 address.

#### Examples

Use case: separating an ip address into its network and host portions

\`\`\`sql
ipv4 '215.53.40.9' & ipv4 '255.255.0.0' -> 215.53.0.0
ipv4 '99.8.63.41' & ipv4 '0.0.63.41' -> 0.0.63.41
\`\`\`

## \`~\` Bitwise NOT

Takes one IPv4 argument.

Returns an IPv4 address.

#### Examples

Use case: computing broadcast address' bitmask from a netmask

\`\`\`sql
~ ipv4 '255.255.0.0' -> 0.0.255.255
\`\`\`

## \`|\` Bitwise OR

Takes two IPv4 arguments.

Returns an IPv4 address.

#### Examples

Use case: computing an ip address' broadcast address

\`\`\`sql
ipv4 '92.11.8.40' | '0.0.255.255' -> 92.11.255.255
\`\`\`

## \`+\` Add offset to an IP address

Takes one IPv4 argument and one integer argument.

Returns an IPv4 address.

#### Examples

Use case: altering an ip address

\`\`\`sql
ipv4 '92.11.8.40' + 5 -> 92.11.8.45
10 + ipv4 '2.6.43.8' -> 2.6.43.18
\`\`\`

## \`-\` Subtract offset from IP address

Takes one IPv4 argument and one integer argument.

Returns an IPv4 address.

#### Examples

\`\`\`sql
ipv4 '92.11.8.40' - 5 -> 92.11.8.35
\`\`\`

## \`-\` Difference between two IP addresses

Takes two IPv4 arguments.

Returns a long.

#### Examples

Use case: calculating the range of unique addresses between two ip addresses

\`\`\`sql
ipv4 '92.11.8.40' - ipv4 '92.11.8.0' -> 40
\`\`\`

## Return netmask - netmask(string)

Takes a \`string\` IPv4 argument as either:

- ipv4 address with a netmask \`22.59.138.9/8\`
- subnet with netmask: \`2.2/16\`

Returns an IPv4 addresses' netmask (\`255.0.0.0\`) in IPv4 format.

#### Examples

Use case: Obtaining the broadcast bitmask for an ip address via performing
bitwise NOT on the netmask.

Apply a bitwise OR to this result to obtain the broadcast address of an ip
address.

\`\`\`sql
~ netmask('68.11.9.2/8')) | ipv4 '68.11.9.2' -> 68.255.255.255
\`\`\`
`
  },
  {
    path: "operators/logical.md",
    title: "Logical Operators",
    headers: ["`OR` Logical OR", "`AND` Logical AND", "`NOT` Logical NOT"],
    content: `## \`OR\` Logical OR

\`OR\` represents a logical OR operation, which takes two predicates and filters for either one being true.

#### Examples

\`\`\`questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 5 OR B = 2
\`\`\`

| a | b  |
| - | -- |
| 5 | 10 |

\`\`\`questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 3 OR B = 2
\`\`\`

| a | b  |
| - | -- |

## \`AND\` Logical AND

\`AND\` represents a logical AND operation, which takes two predicates and filters for both being true.

#### Examples

\`\`\`questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 5 AND B = 2
\`\`\`

| a | b  |
| - | -- |

\`\`\`questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 5 AND B = 10
\`\`\`

| a | b  |
| - | -- |
| 5 | 10 |

## \`NOT\` Logical NOT

\`NOT\` inverts the boolean value. This can be combined with other operators to create their inverse operations, i.e \`NOT IN\`, \`NOT WITHIN\`.

#### Example

\`\`\`questdb-sql
SELECT NOT TRUE
\`\`\`

| column |
| ------ |
| false  |
`
  },
  {
    path: "operators/misc.md",
    title: "Misc Operators",
    headers: ["`.` Prefix", "`::` Cast"],
    content: `## \`.\` Prefix

The \`.\` operator is used to prefix columns with a table name, for example when performing joins.

#### Example

\`\`\`questdb-sql
SELECT *
FROM a, b
WHERE a.id = b.id;
\`\`\`

## \`::\` Cast

\`::\` performs Postgres-style casts.

We recommend the use of [\`CAST\`](/docs/reference/sql/cast/) instead of this operator.

This operator is returned for compatibility with Postgres syntax, so not all conversions will occur as you'd expect.

For example, \`5::FLOAT\` will return a \`DOUBLE\`, not a \`FLOAT\`.

#### Example

\`\`\`questdb-sql
SELECT 5::float, cast(5 as float)
\`\`\`

| cast | cast1 |
| ---- | ----- |
| 5.0  | 5.0   |
`
  },
  {
    path: "operators/numeric.md",
    title: "Numeric Operators",
    headers: ["`*` Multiply", "`/` Divide", "`%` Modulo", "`+` Add", "`-` Subtract", "`-` Negate"],
    content: `These operations work for any numeric types. Also, addition and multiplication
work for N-dimensional arrays. The result will be an array where each element is
the result of applying the operation to the elements at the same coordinates in
the operand arrays.

## \`*\` Multiply

\`*\` is a binary operation to multiply two numbers together.

#### Example

\`\`\`questdb-sql
SELECT 5 + 2
\`\`\`

| column |
|--------|
| 7      |

## \`/\` Divide

\`/\` is a binary operation to divide two numbers.

#### Example

\`\`\`questdb-sql
SELECT 5 / 2, 5.0 / 2.0
\`\`\`

| column | column1 |
|--------|---------|
| 2      | 2.5     |

## \`%\` Modulo

\`%\` performs a modulo operation, returning the remainder of a division.

#### Example

\`\`\`questdb-sql
SELECT 5 % 2
\`\`\`

| column |
|--------|
| 1      |

## \`+\` Add

\`+\` performs an addition operation, for two numbers.

#### Example

\`\`\`questdb-sql
SELECT 5 + 2
\`\`\`

| column |
|--------|
| 7      |

## \`-\` Subtract

\`-\` performs a subtraction operation, for two numbers.

#### Example

\`\`\`questdb-sql
SELECT 5 - 2
\`\`\`

| column |
|--------|
| 3      |

## \`-\` Negate

\`-\` can also be used for unary negation.

#### Example

\`\`\`questdb-sql
SELECT -5
\`\`\`

| column |
|--------|
| -5     |
`
  },
  {
    path: "operators/precedence.md",
    title: "Operator Precedence Table",
    headers: ["Pre-8.0 notice"],
    content: `The following tables provide information about which operators are available, and their corresponding precedences.

For IPv4 operators, this list is not comprehensive, and users should refer directly to the [IPv4](/docs/reference/operators/ipv4/) documentation itself.

## Pre-8.0 notice

In QuestDB 8.0.0, operator precedence is aligned closer to other SQL implementations.

If upgrading from 8.0, review your queries for any relevant changes.

If you are unable to migrate straight away, set the \`cairo.sql.legacy.operator.precedence\` config option to \`true\` in \`server.conf\`.

This is a temporary flag which will be removed in succeeding versions of QuestDB.

Legacy precedence, if set, is:

1. \`.\`, \`::\`
2. (none)
3. \`*\`, \`/\`, \`%\`, \`+\`, \`-\`
4. \`<<\`, \`>>\`, \`<<=\`, \`>>=\`
5. \`||\`
6. \`<\`, \`>\`, \`<=\`, \`>=
7. \`=\`, \`~\`, \`!=\`, \`<>\`, \`!~\`, \`IN\`, \`BETWEEN\`, \`LIKE\`, \`ILIKE\`, \`WITHIN\`
8. \`&\`
9. \`^\`
10. \`|\`
11. \`AND\`, \`OR\`, \`NOT\`

See the next section for the current precedence.

### Current

| operator                                                 | name                         | precedence | description                       |
|----------------------------------------------------------|------------------------------|------------|-----------------------------------|
| [\`.\`](misc.md#-prefix)                                   | prefix                       | 1          | prefix field with table name      |
| [\`::\`](misc.md#-cast)                                    | cast                         | 2          | postgres style type casting       |
| [\`-\`](numeric.md#--negate)                               | negate                       | 3          | unary negation of a number        |
| [\`~\`](bitwise.md#-not)                                   | complement                   | 3          | unary complement of a number      |
| [\`*\`](numeric.md#-multiply)                              | multiply                     | 4          | multiply two numbers              |
| [\`/\`](numeric.md#-divide)                                | divide                       | 4          | divide two numbers                |
| [\`%\`](numeric.md#-modulo)                                | modulo                       | 4          | take the modulo of two numbers    |
| [\`+\`](numeric.md#-add)                                   | add                          | 5          | add two numbers                   |
| [\`-\`](numeric.md#--subtract)                             | subtract                     | 5          | subtract two numbers              |
| [\`<<\`](ipv4.md#-left-strict-ip-address-contained-by)     | left IPv4 contains strict    | 6          |                                   |
| [\`>>\`](ipv4.md#-right-strict-ip-address-contained-by)    | right IPv4 contains strict   | 6          |                                   |
| [\`<<=\`](ipv4.md#-left-ip-address-contained-by-or-equal)  | left IPv4 contains or equal  | 6          |                                   |
| [\`<<=\`](ipv4.md#-right-ip-address-contained-by-or-equal) | right IPv4 contains or equal | 6          |                                   |
| [\`\\|\\|\`](text.md#-concat)                                | concat                       | 7          | concatenate strings               |
| [\`&\`](bitwise.md#-and)                                   | bitwise and                  | 8          | bitwise AND of two numbers        |
| [\`^\`](bitwise.md#-xor)                                   | bitwise xor                  | 9          | bitwise XOR of two numbers        |
| [\`\\|\`](bitwise.md#-or)                                   | bitwise or                   | 10         | bitwise OR of two numbers         |
| [\`IN\`](date-time.md#in-timerange)                        | in                           | 11         | check if value in list or range   |
| [\`BETWEEN\`](date-time.md#between-value1-and-value2)      | between                      | 11         | check if timestamp in range       |
| [\`WITHIN\`](spatial.md#within)                            | within geohash               | 11         | prefix matches geohash            |
| [\`<\`](comparison.md#-lesser-than)                        | lesser than                  | 12         | lt comparison                     |
| [\`<=\`](comparison.md#-lesser-than-or-equal-to)           | lesser than or equal to      | 12         | leq comparison                    |
| [\`>\`](comparison.md#-greater-than)                       | greater than                 | 12         | gt comparison                     |
| [\`>=\`](comparison.md#-greater-than-or-equal-to)          | greater than or equal to     | 12         | geq comparison                    |
| [\`=\`](comparison.md#-equals)                             | equals                       | 13         | eq comparison                     |
| [\`~\`](text.md#-regex-match)                              | regex match                  | 13         | regex pattern match               |
| [\`!=\`](comparison.md#-or--not-equals)                    | not equals                   | 13         | neq comparison                    |
| [\`<>\`](comparison.md#-or--not-equals)                    | not equals                   | 13         | neq comparison                    |
| [\`!~\`](text.md#-regex-doesnt-match)                      | regex does not match         | 13         | regex pattern does not match      |
| [\`LIKE\`](text.md#like)                                   | match string                 | 13         | pattern matching                  |
| [\`ILIKE\`](text.md#ilike)                                 | match string without case    | 13         | case insensitive pattern matching |
| [\`NOT\`](logical.md#not-logical-not)                      | logical not                  | 14         | logical NOT of two numbers        |
| [\`AND\`](logical.md#and-logical-and)                      | logical and                  | 15         | logical AND of two numbers        |
| [\`OR\`](logical.md#or-logical-or)                         | logical or                   | 16         | logical OR of two numbers         |
`
  },
  {
    path: "operators/spatial.md",
    title: "Spatial Operators",
    headers: [],
    content: `This page describes the available operators to perform spatial
calculations. For more information on this type of data, see the
[geohashes documentation](/docs/concept/geohashes/) and the
[spatial functions documentation](/docs/reference/function/spatial/) which have been added to help with filtering and generating data.

### within

\`within(geohash, ...)\` - evaluates if a comma-separated list of geohashes are
equal to or within another geohash.

By default, the operator follows normal syntax rules, and \`WHERE\` is executed before \`LATEST ON\`. The filter is
compatible with parallel execution in most cases.

:::note

In QuestDB 8.3.2, the \`within\` implementation was upgraded, and now supports general \`WHERE\` filtering.

The prior implementation executed \`LATEST ON\` before \`WHERE\`, only supported geohashed constants, and all involved symbol 
columns had to be indexed. However, it is highly optimised for that specific execution and uses SIMD instructions.

To re-enable this implementation, you must set \`query.within.latest.by.optimisation.enabled=true\` in server.conf.

:::

#### Arguments

- \`geohash\` is a geohash type in text or binary form

#### Returns

- evaluates to \`true\` if geohash values are a prefix or complete match based on
  the geohashes passed as arguments

#### Examples

\`\`\`questdb-sql title="example geohash filter" demo
(
SELECT pickup_datetime, 
       make_geohash(pickup_latitude, 
                    pickup_longitude, 
                    60) pickup_geohash
FROM trips
LIMIT 5
)
WHERE pickup_geohash WITHIN (#dr5ru);
\`\`\`



Given a table with the following contents:

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:07.721444Z | device_2  | e   | ezzn5kxb |
| 2021-09-02T14:20:08.241489Z | device_1  | u   | u33w4r2w |
| 2021-09-02T14:20:08.241489Z | device_3  | u   | u33d8b1b |

The \`within\` operator can be used to filter results by geohash:

\`\`\`questdb-sql
SELECT * FROM pos
WHERE g8c within(#ezz, #u33d8)
LATEST ON ts PARTITON BY uuid;
\`\`\`

This yields the following results:

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:07.721444Z | device_2  | e   | ezzn5kxb |
| 2021-09-02T14:20:08.241489Z | device_3  | u   | u33d8b1b |

Additionally, prefix-like matching can be performed to evaluate if geohashes
exist within a larger grid:

\`\`\`questdb-sql
SELECT * FROM pos
WHERE g8c within(#u33)
LATEST ON ts PARTITON BY uuid;
\`\`\`

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:08.241489Z | device_1  | u   | u33w4r2w |
| 2021-09-02T14:20:08.241489Z | device_3  | u   | u33d8b1b |
`
  },
  {
    path: "operators/text.md",
    title: "Text Operators",
    headers: ["`||` Concat", "`~` Regex match", "`!~` Regex doesn't match", "`LIKE`", "`ILIKE`"],
    content: `## \`||\` Concat

\`||\` concatenates strings, similar to [concat()](/docs/reference/function/text/#concat).

#### Example

\`\`\`questdb-sql
SELECT 'a' || 'b'
\`\`\`

| concat |
| ------ |
| ab     |

## \`~\` Regex match

Performs a regular-expression match on a string.

#### Example

\`\`\`questdb-sql
SELECT address FROM (SELECT 'abc@foo.com' as address) WHERE address ~ '@foo.com'
\`\`\`

| address     |
| ----------- |
| abc@foo.com |

## \`!~\` Regex doesn't match

The inverse of the \`~\` regex matching operator.

\`\`\`questdb-sql
SELECT address FROM (SELECT 'abc@foo.com' as address) WHERE address !~ '@bah.com'
\`\`\`

| address     |
| ----------- |
| abc@foo.com |

## \`LIKE\`

\`LIKE\` performs a case-sensitive match, based on a pattern.

The \`%\` wildcard represents 0, 1 or n characters.

The \`_\` wildcard represents a single character.

#### Example

\`\`\`questdb-sql
SELECT 'abc' LIKE '%c', 'abc' LIKE 'a_c'
\`\`\`

| column | column1 |
| ------ | ------- |
| true   | true    |

## \`ILIKE\`

\`ILIKE\` is the same as \`LIKE\`, but performs a case insensitive match,

#### Example

\`\`\`questdb-sql
SELECT 'abC' LIKE '%c', 'abC' ILIKE '%c'
\`\`\`

| column | column1 |
| ------ | ------- |
| false  | true    |
`
  }
]
