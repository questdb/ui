// Auto-generated documentation data for functions
// Generated on 2025-10-10T09:50:25.778Z

export interface DocFile {
  path: string
  title: string
  headers: string[]
  content: string
}

export const functionsDocs: DocFile[] = [
  {
    path: "function/aggregation.md",
    title: "Aggregate functions",
    headers: ["approx_count_distinct", "approx_percentile", "approx_median", "avg", "corr", "count", "count_distinct", "covar_pop", "covar_samp", "first/last", "first_not_null", "last_not_null", "haversine_dist_deg", "ksum", "max", "min", "nsum", "stddev / stddev_samp", "stddev_pop", "string_agg", "string_distinct_agg", "sum", "variance / var_samp", "var_pop"],
    content: `This page describes the available functions to assist with performing aggregate
calculations.

## approx_count_distinct

\`approx_count_distinct(column_name, precision)\` - estimates the number of
distinct non-\`null\` values in \`IPv4\`, \`int\`, or \`long\` columns using the
[HyperLogLog](/glossary/HyperLogLog/) data structure, which provides an
approximation rather than an exact count.

The precision of HyperLogLog can be controlled via the optional \`precision\`
parameter, typically between 4 and 16. A higher precision leads to more accurate
results with increased memory usage. The default is 1.

This function is useful within [high cardinality](/glossary/high-cardinality/)
datasets where an exact count is not required. Thus consider it the higher
cardinality alternative to
[\`count_distinct\`](/docs/reference/function/aggregation/#count_distinct).

#### Parameters

- \`column_name\`: The name of the column for which to estimate the count of
  distinct values.
- \`precision\` (optional): A number specifying the precision of the
  [HyperLogLog](/glossary/hyperloglog/) algorithm, which influences the
  trade-off between accuracy and memory usage. A higher precision gives a more
  accurate estimate, but consumes more memory. Defaults to 1 (lower accuracy,
  high efficiency).

#### Return value

Return value type is \`long\`.

#### Examples

_Please note that exact example values will vary as they are approximations
derived from the HyperLogLog algorithm._

\`\`\`questdb-sql title="Estimate count of distinct IPv4 addresses with precision 5"
SELECT approx_count_distinct(ip_address, 5) FROM logs;
\`\`\`

| approx_count_distinct |
| :-------------------- |
| 1234567               |

---

\`\`\`questdb-sql title="Estimate count of distinct user_id (int) values by date"
SELECT date, approx_count_distinct(user_id) FROM sessions GROUP BY date;
\`\`\`

| date       | approx_count_distinct |
| :--------- | :-------------------- |
| 2023-01-01 | 2358                  |
| 2023-01-02 | 2491                  |
| ...        | ...                   |

---

\`\`\`questdb-sql title="Estimate count of distinct product_id values by region"
SELECT region, approx_count_distinct(product_id) FROM sales GROUP BY region;
\`\`\`

| region | approx_count_distinct |
| :----- | :-------------------- |
| North  | 1589                  |
| South  | 1432                  |
| East   | 1675                  |
| West   | 1543                  |

---

\`\`\`questdb-sql title="Estimate count of distinct order_ids with precision 8"
SELECT approx_count_distinct(order_id, 8) FROM orders;
\`\`\`

| approx_count_distinct |
| :-------------------- |
| 3456789               |

---

\`\`\`questdb-sql title="Estimate count of distinct transaction_ids by store_id"
SELECT store_id, approx_count_distinct(transaction_id) FROM transactions GROUP BY store_id;
\`\`\`

| store_id | approx_count_distinct |
| :------- | :-------------------- |
| 1        | 56789                 |
| 2        | 67890                 |
| ...      | ...                   |

## approx_percentile

\`approx_percentile(value, percentile, precision)\` calculates the approximate
value for the given non-negative column and percentile using the
[HdrHistogram](http://hdrhistogram.org/) algorithm.

#### Parameters

- \`value\` is any numeric non-negative value.
- \`percentile\` is a \`double\` value between 0.0 and 1.0, inclusive.
- \`precision\` is an optional \`int\` value between 0 and 5, inclusive. This is the
  number of significant decimal digits to which the histogram will maintain
  value resolution and separation. For example, when the input column contains
  integer values between 0 and 3,600,000,000 and the precision is set to 3,
  value quantization within the range will be no larger than 1/1,000th (or 0.1%)
  of any value. In this example, the function tracks and analyzes the counts of
  observed response times ranging between 1 microsecond and 1 hour in magnitude,
  while maintaining a value resolution of 1 microsecond up to 1 millisecond, a
  resolution of 1 millisecond (or better) up to one second, and a resolution of
  1 second (or better) up to 1,000 seconds. At its maximum tracked value (1
  hour), it would still maintain a resolution of 3.6 seconds (or better).

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql title="Approximate percentile"
SELECT approx_percentile(latency, 0.99) FROM request_logs;
\`\`\`

| approx_percentile |
| :---------------- |
| 101.5             |

## approx_median

\`approx_median(value, precision)\` calculates the approximate median (50th percentile) of a set of non-negative numeric values using the [HdrHistogram](http://hdrhistogram.org/) algorithm. This is equivalent to calling \`approx_percentile(value, 0.5, precision)\`.

The function will throw an error if any negative values are encountered in the input. All input values must be non-negative.

#### Parameters

- \`value\` is any non-negative numeric value.
- \`precision\` (optional) is an \`int\` value between 0 and 5, inclusive. This is the number of significant decimal digits to which the histogram will maintain value resolution and separation. Higher precision leads to more accurate results with increased memory usage. Defaults to 1 (lower accuracy, high efficiency).

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql title="Calculate approximate median price by symbol" demo
SELECT symbol, approx_median(price) FROM trades GROUP BY symbol;
\`\`\`

| symbol  | approx_median |
| :------ | :----------- |
| BTC-USD | 39265.31     |
| ETH-USD | 2615.46      |

\`\`\`questdb-sql title="Calculate approximate median with higher precision" demo
SELECT symbol, approx_median(price, 3) FROM trades GROUP BY symbol;
\`\`\`

| symbol  | approx_median |
| :------ | :----------- |
| BTC-USD | 39265.312    |
| ETH-USD | 2615.459     |

## avg

\`avg(value)\` calculates simple average of values ignoring missing data (e.g
\`null\` values).

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql title="Average transaction amount"
SELECT avg(amount) FROM transactions;
\`\`\`

| avg  |
| :--- |
| 22.4 |

\`\`\`questdb-sql title="Average transaction amount by payment_type"
SELECT payment_type, avg(amount) FROM transactions;
\`\`\`

| payment_type | avg   |
| :----------- | :---- |
| cash         | 22.1  |
| card         | 27.4  |
| null         | 18.02 |

## corr

\`corr(arg0, arg1)\` is a function that measures how closely two sets of numbers
move in the same direction. It does this by comparing how much each number in
each set differs from the average of its set. This calculation is based on
[Welford's Algorithm](https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm).

- If the numbers in both sets tend to be above or below their average values at
  the same time, the function will return a value close to 1.

- If one set of numbers tends to be above its average value when the other set
  is below its average, the function will return a value close to -1.

- If there's no clear pattern, the function will return a value close to 0.

#### Parameters

- \`arg0\` is any numeric value representing the first variable
- \`arg1\` is any numeric value representing the second variable

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql title="Correlation between price and quantity"
SELECT corr(price, quantity) FROM transactions;
\`\`\`

| corr |
| :--- |
| 0.89 |

\`\`\`questdb-sql title="Correlation between price and quantity grouped by payment type"
SELECT payment_type, corr(price, quantity) FROM transactions GROUP BY payment_type;
\`\`\`

| payment_type | avg  |
| :----------- | :--- |
| cash         | 0.85 |
| card         | 0.92 |
| null         | 0.78 |

## count

- \`count()\` or \`count(*)\` - counts the number of rows irrespective of underlying
  data.
- \`count(column_name)\` - counts the number of non-null values in a given column.

#### Parameters

- \`count()\` does not require arguments.
- \`count(column_name)\` - supports the following data types:
  - \`double\`
  - \`float\`
  - \`integer\`
  - \`character\`
  - \`short\`
  - \`byte\`
  - \`timestamp\`
  - \`date\`
  - \`long\`
  - \`long256\`
  - \`geohash\`
  - \`varchar\`
  - \`string\`
  - \`symbol\`

#### Return value

Return value type is \`long\`.

#### Examples

Count of rows in the \`transactions\` table:

\`\`\`questdb-sql
SELECT count() FROM transactions;
\`\`\`

| count |
| :---- |
| 100   |

Count of rows in the \`transactions\` table aggregated by the \`payment_type\`
value:

\`\`\`questdb-sql
SELECT payment_type, count() FROM transactions;
\`\`\`

| payment_type | count |
| :----------- | :---- |
| cash         | 25    |
| card         | 70    |
| null         | 5     |

Count non-null transaction amounts:

\`\`\`questdb-sql
SELECT count(amount) FROM transactions;
\`\`\`

| count |
| :---- |
| 95    |

Count non-null transaction amounts by \`payment_type\`:

\`\`\`questdb-sql
SELECT payment_type, count(amount) FROM transactions;
\`\`\`

| payment_type | count |
| :----------- | :---- |
| cash         | 24    |
| card         | 67    |
| null         | 4     |

:::note

\`null\` values are aggregated with \`count()\`, but not with \`count(column_name)\`

:::

## count_distinct

\`count_distinct(column_name)\` - counts distinct non-\`null\` values in \`varchar\`,
\`symbol\`, \`long256\`, \`UUID\`, \`IPv4\`, \`long\`, \`int\` or \`string\` columns.

#### Return value

Return value type is \`long\`.

#### Examples

- Count of distinct sides in the transactions table. Side column can either be
  \`BUY\` or \`SELL\` or \`null\`.

\`\`\`questdb-sql
SELECT count_distinct(side) FROM transactions;
\`\`\`

| count_distinct |
| :------------- |
| 2              |

- Count of distinct counterparties in the transactions table aggregated by
  \`payment_type\` value.

\`\`\`questdb-sql
SELECT payment_type, count_distinct(counterparty) FROM transactions;
\`\`\`

| payment_type | count_distinct |
| :----------- | :------------- |
| cash         | 3              |
| card         | 23             |
| null         | 5              |

## covar_pop

\`covar_pop(arg0, arg1)\` is a function that measures how much two sets of numbers
change together. It does this by looking at how much each number in each set
differs from the average of its set. It multiplies these differences together,
adds them all up, and then divides by the total number of pairs. This gives a
measure of the overall trend.

- If the numbers in both sets tend to be above or below their average values at
  the same time, the function will return a positive number.

- If one set of numbers tends to be above its average value when the other set
  is below its average, the function will return a negative number.

- The closer the result is to zero, the less relationship there is between the
  two sets of numbers.

#### Parameters

- \`arg0\` is any numeric value representing the first variable
- \`arg1\` is any numeric value representing the second variable.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql title="Population covariance between price and quantity"
SELECT covar_pop(price, quantity) FROM transactions;
\`\`\`

| covar_pop |
| :-------- |
| 15.2      |

\`\`\`questdb-sql title="Population covariance between price and quantity grouped by payment type"
SELECT payment_type, covar_pop(price, quantity) FROM transactions GROUP BY payment_type;
\`\`\`

| payment_type | covar_pop |
| :----------- | :-------- |
| cash         | 14.8      |
| card         | 16.2      |
| null         | 13.5      |

## covar_samp

\`covar_samp(arg0, arg1)\` is a function that finds the relationship between two
sets of numbers. It does this by looking at how much the numbers vary from the
average in each set.

- If the numbers in both sets tend to be above or below their average values at
  the same time, the function will return a positive number.

- If one set of numbers tends to be above its average value when the other set
  is below its average, the function will return a negative number.

- The closer the result is to zero, the less relationship there is between the
  two sets of numbers.

#### Parameters

- \`arg0\` is any numeric value representing the first variable.
- \`arg1\` is any numeric value representing the second variable.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql title="Sample covariance between price and quantity"
SELECT covar_samp(price, quantity) FROM transactions;
\`\`\`

| covar_samp |
| :--------- |
| 15.8       |

\`\`\`questdb-sql title="Sample covariance between price and quantity grouped by payment type"
SELECT payment_type, covar_samp(price, quantity) FROM transactions GROUP BY payment_type;
\`\`\`

| payment_type | covar_samp |
| :----------- | :--------- |
| cash         | 15.4       |
| card         | 16.8       |
| null         | 14.1       |

## first/last

- \`first(column_name)\` - returns the first value of a column.
- \`last(column_name)\` - returns the last value of a column.

Supported column datatype: \`double\`, \`float\`, \`integer\`, \`IPv4\`, \`character\`,
\`short\`, \`byte\`, \`timestamp\`, \`date\`, \`long\`, \`geohash\`, \`symbol\`, \`varchar\` and
\`uuid\`.

If a table has a [designated timestamp](/docs/concept/designated-timestamp/),
then the first row is always the row with the lowest timestamp (oldest) and the
last row is always the one with the highest (latest) timestamp. For a table
without a designated timestamp column, \`first\` returns the first row and \`last\`
returns the last inserted row, regardless of any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table \`sensors\`, which has a designated timestamp column:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| arduino-01 | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |

The following query returns oldest value for the \`device_id\` column:

\`\`\`questdb-sql
SELECT first(device_id) FROM sensors;
\`\`\`

| first      |
| :--------- |
| arduino-01 |

The following query returns the latest symbol value for the \`device_id\` column:

\`\`\`questdb-sql
SELECT last(device_id) FROM sensors;
\`\`\`

| last       |
| :--------- |
| arduino-03 |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
\`sensors_unordered\`:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| arduino-01 | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |

The following query returns the first record for the \`device_id\` column:

\`\`\`questdb-sql
SELECT first(device_id) FROM sensors_unordered;
\`\`\`

| first      |
| :--------- |
| arduino-01 |

The following query returns the last record for the \`device_id\` column:

\`\`\`questdb-sql
SELECT last(device_id) FROM sensors_unordered;
\`\`\`

| last       |
| :--------- |
| arduino-02 |

## first_not_null

- \`first_not_null(column_name)\` - returns the first non-null value of a column.

Supported column datatype: \`double\`, \`float\`, \`integer\`, \`IPv4\`, \`char\`,
\`short\`, \`byte\`, \`timestamp\`, \`date\`, \`long\`, \`geohash\`, \`symbol\`, \`varchar\` and
\`uuid\`.

If a table has a designated timestamp, then the first non-null row is always the
row with the lowest timestamp (oldest). For a table without a designated
timestamp column, \`first_not_null\` returns the first non-null row, regardless of
any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table \`sensors\`, which has a designated timestamp column:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |

The following query returns oldest non-null value for the device_id column:

\`\`\`questdb-sql
SELECT first_not_null(device_id) FROM sensors;
\`\`\`

| first_not_null |
| :------------- |
| arduino-02     |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
\`sensors_unordered\`:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |

The following query returns the first non-null record for the device_id column:

\`\`\`questdb-sql
SELECT first_not_null(device_id) FROM sensors_unordered;
\`\`\`

| first_not_null |
| :------------- |
| arduino-03     |

## last_not_null

- \`last_not_null(column_name)\` - returns the last non-null value of a column.

Supported column datatype: \`double\`, \`float\`, \`integer\`, \`IPv4\`, \`char\`,
\`short\`, \`byte\`, \`timestamp\`, \`date\`, \`long\`, \`geohash\`, \`symbol\`, \`varchar\` and
\`uuid\`.

If a table has a designated timestamp, then the last non-null row is always the
row with the highest timestamp (most recent). For a table without a designated
timestamp column, \`last_not_null\` returns the last non-null row, regardless of
any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table \`sensors\`, which has a designated timestamp column:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |

The following query returns most recent non-null value for the device_id column:

\`\`\`questdb-sql
SELECT last_not_null(device_id) FROM sensors;
\`\`\`

| last_not_null |
| :------------ |
| arduino-03    |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
\`sensors_unordered\`:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |

The following query returns the last non-null record for the \`device_id\` column:

\`\`\`questdb-sql
SELECT last_not_null(device_id) FROM sensors_unordered;
\`\`\`

| last_not_null |
| :------------ |
| arduino-02    |

## haversine_dist_deg

\`haversine_dist_deg(lat, lon, ts)\` - calculates the traveled distance for a
series of latitude and longitude points.

#### Parameters

- \`lat\` is the latitude expressed as degrees in decimal format (\`double\`)
- \`lon\` is the longitude expressed as degrees in decimal format (\`double\`)
- \`ts\` is the \`timestamp\` for the data point

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql title="Calculate the aggregate traveled distance for each car_id"
SELECT car_id, haversine_dist_deg(lat, lon, k)
  FROM table rides
\`\`\`

## ksum

\`ksum(value)\` - adds values ignoring missing data (e.g \`null\` values). Values
are added using the

[Kahan compensated sum algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm).
This is only beneficial for floating-point values such as \`float\` or \`double\`.

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

\`\`\`questdb-sql
SELECT ksum(a)
FROM (SELECT rnd_double() a FROM long_sequence(100));
\`\`\`

| ksum              |
| :---------------- |
| 52.79143968514029 |

## max

\`max(value)\` - returns the highest value ignoring missing data (e.g \`null\`
values).

#### Parameters

- \`value\` is any numeric or string value

#### Return value

Return value type is the same as the type of the argument.

#### Examples

\`\`\`questdb-sql title="Highest transaction amount"
SELECT max(amount) FROM transactions;
\`\`\`

| max  |
| :--- |
| 55.3 |

\`\`\`questdb-sql title="Highest transaction amount by payment_type"
SELECT payment_type, max(amount) FROM transactions;
\`\`\`

| payment_type | amount |
| :----------- | :----- |
| cash         | 31.5   |
| card         | 55.3   |
| null         | 29.2   |

## min

\`min(value)\` - returns the lowest value ignoring missing data (e.g \`null\`
values).

#### Parameters

- \`value\` is any numeric or string value

#### Return value

Return value type is the same as the type of the argument.

#### Examples

\`\`\`questdb-sql title="Lowest transaction amount"
SELECT min(amount) FROM transactions;
\`\`\`

| min  |
| :--- |
| 12.5 |

\`\`\`questdb-sql title="Lowest transaction amount, by payment_type"
SELECT payment_type, min(amount) FROM transactions;
\`\`\`

| payment_type | min  |
| :----------- | :--- |
| cash         | 12.5 |
| card         | 15.3 |
| null         | 22.2 |

## nsum

\`nsum(value)\` - adds values ignoring missing data (e.g \`null\` values). Values
are added using the
[Neumaier sum algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm#Further_enhancements).
This is only beneficial for floating-point values such as \`float\` or \`double\`.

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql
SELECT nsum(a)
FROM (SELECT rnd_double() a FROM long_sequence(100));
\`\`\`

| nsum             |
| :--------------- |
| 49.5442334742831 |

## stddev / stddev_samp

\`stddev_samp(value)\` - Calculates the sample standard deviation of a set of
values, ignoring missing data (e.g., null values). The sample standard deviation
is a measure of the amount of variation or dispersion in a sample of a
population. A low standard deviation indicates that the values tend to be close
to the mean of the set, while a high standard deviation indicates that the
values are spread out over a wider range.

\`stddev\` is an alias for \`stddev_samp\`.

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql
SELECT stddev_samp(x)
FROM (SELECT x FROM long_sequence(100));
\`\`\`

| stddev_samp     |
| :-------------- |
| 29.011491975882 |

## stddev_pop

\`stddev_pop(value)\` - Calculates the population standard deviation of a set of
values. The population standard deviation is a measure of the amount of
variation or dispersion of a set of values. A low standard deviation indicates
that the values tend to be close to the mean of the set, while a high standard
deviation indicates that the values are spread out over a wider range.

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql
SELECT stddev_pop(x)
FROM (SELECT x FROM long_sequence(100));
\`\`\`

| stddev_samp       |
| :---------------- |
| 28.86607004772212 |

## string_agg

\`string_agg(value, delimiter)\` - Concatenates the given string values into a
single string with the delimiter used as a value separator.

#### Parameters

- \`value\` is a \`varchar\` value.
- \`delimiter\` is a \`char\` value.

#### Return value

Return value type is \`varchar\`.

#### Examples

\`\`\`questdb-sql
SELECT string_agg(x::varchar, ',')
FROM (SELECT x FROM long_sequence(5));
\`\`\`

| string_agg |
| :--------- |
| 1,2,3,4,5  |

## string_distinct_agg

\`string_distinct_agg(value, delimiter)\` - concatenates distinct non-null string
values into a single string, using the specified delimiter to separate the
values.

- \`string_distinct_agg\` ignores null values and only concatenates non-null
  distinct values.

- Order is guaranteed.

- Does not support \`ORDER BY\`.

#### Parameters

- \`value\`: A varchar or string column containing the values to be aggregated.
- \`delimiter\`: A char value used to separate the distinct values in the
  concatenated string.

#### Return value

Return value type is \`string\`.

#### Examples

Suppose we want to find all the distinct sky cover types observed in the weather
tablein our public demo:

\`\`\`questdb-sql title="string_distinct_agg example" demo
SELECT string_distinct_agg(skyCover, ',') AS distinct_sky_covers
FROM weather;
\`\`\`

This query will return a single string containing all the distinct skyCover
values separated by commas. The skyCover column contains values such as OVC
(Overcast), BKN (Broken clouds), SCT (Scattered clouds), and CLR (Clear skies).
Even though the skyCover column may have many rows with repeated values,
\`string_distinct_agg\` aggregates only the unique non-null values. The result is a
comma-separated list of all distinct sky cover conditions observed.

Result:

| distinct_sky_covers |
| ------------------- |
| OVC,BKN,SCT,CLR,OBS |

You can also group the aggregation by another column.

To find out which sky cover conditions are observed for each wind direction:

\`\`\`questdb-sql title="string_distinct_agg example with GROUP BY" demo
SELECT windDir, string_distinct_agg(skyCover, ',') AS distinct_sky_covers
FROM weather
GROUP BY windDir;
\`\`\`

| windDir | distinct_sky_covers |
| ------- | ------------------- |
| 30      | OVC,BKN             |
| 45      | BKN,SCT             |
| 60      | OVC,SCT,CLR         |

## sum

\`sum(value)\` - adds values ignoring missing data (e.g \`null\` values).

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

\`\`\`questdb-sql title="Sum all quantities in the transactions table"
SELECT sum(quantity) FROM transactions;
\`\`\`

| sum |
| :-- |
| 100 |

\`\`\`questdb-sql title="Sum all quantities in the transactions table, aggregated by item"
SELECT item, sum(quantity) FROM transactions;
\`\`\`

| item   | count |
| :----- | :---- |
| apple  | 53    |
| orange | 47    |

#### Overflow

\`sum\` does not perform overflow check. To avoid overflow, you can cast the
argument to wider type.

\`\`\`questdb-sql title="Cast as long to avoid overflow"
SELECT sum(cast(a AS LONG)) FROM table;
\`\`\`

## variance / var_samp

\`var_samp(value)\` - Calculates the sample variance of a set of values. The
sample variance is a measure of the amount of variation or dispersion of a set
of values in a sample from a population. A low variance indicates that the
values tend to be very close to the mean, while a high variance indicates that
the values are spread out over a wider range.

\`variance()\` is an alias for \`var_samp\`.

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql
SELECT var_samp(x)
FROM (SELECT x FROM long_sequence(100));
\`\`\`

| stddev_samp      |
| :--------------- |
| 841.666666666666 |

## var_pop

\`var_pop(value)\` - Calculates the population variance of a set of values. The
population variance is a measure of the amount of variation or dispersion of a
set of values. A low variance indicates that the values tend to be very close to
the mean, while a high variance indicates that the values are spread out over a
wider range.

#### Parameters

- \`value\` is any numeric value.

#### Return value

Return value type is \`double\`.

#### Examples

\`\`\`questdb-sql
SELECT var_pop(x)
FROM (SELECT x FROM long_sequence(100));
\`\`\`

| stddev_samp |
| :---------- |
| 833.25      |
`
  },
  {
    path: "function/array.md",
    title: "Array functions",
    headers: ["array_avg", "array_count", "array_cum_sum", "array_max", "array_min", "array_position", "array_sum", "array_stddev", "array_stddev_pop", "array_stddev_samp", "dim_length", "dot_product", "flatten", "insertion_point", "matmul", "shift", "transpose"],
    content: `This page documents functions for n-dimensional arrays. This isn't an exhaustive
list of all functions that may take an array parameter. For example, financial
functions are listed in [their own section](/docs/reference/function/finance/), whether or
not they can take an array parameter.

## array_avg

\`array_avg(array)\` returns the average of all the array elements. \`NULL\` elements
don't contribute to either count or sum.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_avg(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
\`\`\`

| array_avg |
| --------- |
| 1.5       |

## array_count

\`array_count(array)\` returns the number of finite elements in the array. \`NULL\`
elements do not contribute to the count.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT
  array_count(ARRAY[ [1.0, null], [null, 2.0] ]) c1,
  array_count(ARRAY[ [0.0/0.0, 1.0/0.0], [-1.0/0.0, 0.0/0.0] ]) c2;
\`\`\`

| c1 |  c2 |
| ---| --- |
| 2  |  0  |

## array_cum_sum

\`array_cum_sum(array)\` returns a 1D array of the cumulative sums over the array,
traversing it in row-major order. The input array can have any dimensionality.
The returned 1D array has the same number of elements as the input array. \`NULL\`
elements behave as if they were zero.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_cum_sum(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
\`\`\`

|      array_cum_sum     |
| ---------------------- |
| ARRAY[1.0,2.0,4.0,6.0] |

## array_max

\`array_max(array)\` returns the maximum value from all the array elements. \`NULL\`
elements and non-finite values (NaN, Infinity) are ignored. If the array
contains no finite values, the function returns \`NULL\`.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_max(ARRAY[ [1.0, 5.0], [3.0, 2.0] ]);
\`\`\`

| array_max |
| --------- |
| 5.0       |

## array_min

\`array_min(array)\` returns the minimum value from all the array elements. \`NULL\`
elements and non-finite values (NaN, Infinity) are ignored. If the array
contains no finite values, the function returns \`NULL\`.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_min(ARRAY[ [1.0, 5.0], [3.0, 2.0] ]);
\`\`\`

| array_min |
| --------- |
| 1.0       |

## array_position

\`array_position(array, elem)\` returns the position of \`elem\` inside the 1D \`array\`. If
\`elem\` doesn't appear in \`array\`, it returns \`NULL\`. If \`elem\` is \`NULL\`, it returns the
position of the first \`NULL\` element, if any.

#### Parameters

- \`array\` — the 1D array
- \`elem\` — the element to look for

#### Examples

\`\`\`questdb-sql
SELECT
  array_position(ARRAY[1.0, 2.0], 1.0) p1,
  array_position(ARRAY[1.0, 2.0], 3.0) p2;
\`\`\`

| p1 | p2   |
| -- | ---- |
| 1  | NULL |

## array_sum

\`array_sum(array)\` returns the sum of all the array elements. \`NULL\` elements
behave as if they were zero.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_sum(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
\`\`\`

| array_sum |
| --------- |
| 6.0       |

## array_stddev

\`array_stddev(array)\` returns the sample standard deviation of all the array
elements. This is an alias for \`array_stddev_samp()\`. \`NULL\` elements and
non-finite values (NaN, Infinity) are ignored. If the array contains fewer than
2 finite values, the function returns \`NULL\`.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_stddev(ARRAY[ [1.0, 2.0], [3.0, 4.0] ]);
\`\`\`

| array_stddev |
| ------------ |
| 1.29099445   |

## array_stddev_pop

\`array_stddev_pop(array)\` returns the population standard deviation of all the
array elements. \`NULL\` elements and non-finite values (NaN, Infinity) are
ignored. The population standard deviation uses N in the denominator of the
standard deviation formula. If the array contains no finite values, the function
returns \`NULL\`.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_stddev_pop(ARRAY[ [1.0, 2.0], [3.0, 4.0] ]);
\`\`\`

| array_stddev_pop |
| ---------------- |
| 1.11803399       |

## array_stddev_samp

\`array_stddev_samp(array)\` returns the sample standard deviation of all the
array elements. \`NULL\` elements and non-finite values (NaN, Infinity) are
ignored. The sample standard deviation uses N-1 in the denominator of the
standard deviation formula. If the array contains fewer than 2 finite values,
the function returns \`NULL\`.

#### Parameter

- \`array\` — the array

#### Example

\`\`\`questdb-sql
SELECT array_stddev_samp(ARRAY[ [1.0, 2.0], [3.0, 4.0] ]);
\`\`\`

| array_stddev_samp |
| ----------------- |
| 1.29099445        |

## dim_length

\`dim_length(array, dim)\` returns the length of the n-dimensional array along
dimension \`dim\`.

#### Parameters

- \`array\` — the array
- \`dim\` — the dimension (1-based) whose length to get

#### Example

Get the length of the array along the 1st dimension.

\`\`\`questdb-sql
SELECT dim_length(ARRAY[42, 42], 1);
\`\`\`

|  dim_length  |
| ------------ |
|       2      |

## dot_product

\`dot_product(left_array, right_array)\` returns the dot-product of the two
arrays, which must be of the same shape. The result is equal to
\`array_sum(left_array * right_array)\`.

#### Parameters

- \`left_array\` — the left array
- \`right_array\` — the right array

#### Example

\`\`\`questdb-sql
SELECT dot_product(
  ARRAY[ [3.0, 4.0], [2.0, 5.0] ],
  ARRAY[ [3.0, 4.0], [2.0, 5.0] ]
);
\`\`\`

| dot_product |
| ----------- |
| 54.0        |

## flatten

\`flatten(array)\` flattens all the array's elements into a 1D array, in row-major
order.

#### Parameters

- \`array\` — the array

#### Example

Flatten a 2D array.

\`\`\`questdb-sql
SELECT flatten(ARRAY[[1, 2], [3, 4]]);
\`\`\`

|      flatten      |
| ----------------- |
| [1.0,2.0,3.0,4.0] |

## insertion_point

Finds the insertion point of the supplied value into a sorted 1D array. The
array can be sorted ascending or descending, and the function auto-detects this.

:::warning

The array must be sorted, and must not contain \`NULL\`s, but this function
doesn't enforce it. It runs a binary search for the value, and the behavior with
an unsorted array is unspecified.

:::

#### Parameters

- \`array\` — the 1D array
- \`value\` — the value whose insertion point to look for
- \`ahead_of_equal\` (optional, default \`false\`) — when true (false), returns the
  insertion point before (after) any elements equal to \`value\`

#### Examples

\`\`\`questdb-sql
SELECT
  insertion_point(ARRAY[1.0, 2.0, 3.0], 2.5) i1,
  insertion_point(ARRAY[1.0, 2.0, 3.0], 2.0) i2,
  insertion_point(ARRAY[1.0, 2.0, 3.0], 2.0, true) i3;
\`\`\`

| i1 | i2 | i3 |
| -- | -- | -- |
| 3  | 3  | 2  |

## matmul

\`matmul(left_matrix, right_matrix)\` performs matrix multiplication. This is an
operation from linear algebra.

A matrix is represented as a 2D array. We call the first matrix coordinate "row"
and the second one "column".

\`left_matrix\`'s number of columns (its dimension 2) must be equal to
\`right_matrix\`'s number of rows (its dimension 1).

The resulting matrix has the same number of rows as \`left_matrix\` and the same
number of columns as \`right_matrix\`. The value at every (row, column) position
in the result is equal to the sum of products of matching elements in the
corresponding row of \`left_matrix\` and column of \`right_matrix\`. In a formula,
with C = A x B:

$$

C_{jk} = \\sum_{i=1}^{n} A_{ji} B_{ik}

$$

#### Parameters

- \`left_matrix\`: the left-hand matrix. Must be a 2D array
- \`right_matrix\`: the right-hand matrix. Must be a 2D array with as many rows as
  there are columns in \`left_matrix\`

#### Example

Multiply the matrices:

$$

\\begin{bmatrix}
1 & 2 \\\\
3 & 4
\\end{bmatrix}
\\times
\\begin{bmatrix}
2 & 3 \\\\
2 & 3
\\end{bmatrix}
=
\\begin{bmatrix}
6 & 9 \\\\
14 & 21
\\end{bmatrix}

$$

\`\`\`questdb-sql
SELECT matmul(ARRAY[[1, 2], [3, 4]], ARRAY[[2, 3], [2, 3]]);
\`\`\`

|          matmul           |
| ------------------------- |
|  [[6.0,9.0],[14.0,21.0]]  |

## shift

\`shift(array, distance, [fill_value])\` shifts the elements in the \`array\`'s last
(deepest) dimension by \`distance\`. The distance can be positive (right shift) or
negative (left shift). More formally, it moves elements from position \`i\` to
\`i + distance\`, dropping elements whose resulting position is outside the array.
It fills the holes created by shifting with \`fill_value\`, the default being
\`NULL\`.

#### Parameters

- \`array\` — the array
- \`distance\` — the shift distance
— \`fill_value\` — the value to place in empty slots after shifting

#### Example

\`\`\`questdb-sql
SELECT shift(ARRAY[ [1.0, 2.0], [3.0, 4.0] ], 1);
\`\`\`

|            shift           |
| -------------------------- |
| ARRAY[[null,1.0],[null,3.0]] |

\`\`\`questdb-sql
SELECT shift(ARRAY[ [1.0, 2.0], [3.0, 4.0] ], -1);
\`\`\`

|            shift           |
| -------------------------- |
| ARRAY[[2.0,null],[4.0,null]] |

\`\`\`questdb-sql
SELECT shift(ARRAY[ [1.0, 2.0], [3.0, 4.0] ], -1, 10.0);
\`\`\`

|             shift            |
| ---------------------------- |
| ARRAY[[2.0,10.0],[4.0,10.0]] |

## transpose

\`transpose(array)\` transposes an array, reversing the order of its coordinates.
This is most often used on a matrix, swapping its rows and columns.

#### Example

Transpose the matrix:

$$

    \\begin{bmatrix}
    1 & 2 \\\\
    3 & 4
    \\end{bmatrix}
^T
=
\\begin{bmatrix}
1 & 3 \\\\
2 & 4
\\end{bmatrix}

$$

\`\`\`questdb-sql
SELECT transpose(ARRAY[[1, 2], [3, 4]]);
\`\`\`

|        transpose        |
| ----------------------- |
|  [[1.0,3.0],[2.0,4.0]]  |
`
  },
  {
    path: "function/binary.md",
    title: "Binary functions",
    headers: ["base64", "See also"],
    content: `This page describes the available functions to assist with working with binary
data.

## base64

\`base64(data, maxLength)\` encodes raw binary data using the base64 encoding into
a string with a maximum length defined by \`maxLength\`.

**Arguments:**

- \`data\` is the binary data to be encoded.
- \`maxLength\` is the intended maximum length of the encoded string.

**Return value:**

Return value type is \`string\`.

**Example:**

\`\`\`questdb-sql
SELECT base64(rnd_bin(), 20);
-- \`rnd_bin\` can be used to generate random binary data.
\`\`\`

| base64                       |
| ---------------------------- |
| q7QDHliR4V1OsAEUVCFwDDTerbI= |

## See also

[\`rnd_bin\`](/docs/reference/function/random-value-generator/#rnd_bin) can be
used to generate random binary data.
`
  },
  {
    path: "function/boolean.md",
    title: "Boolean functions",
    headers: ["isOrdered", "SELECT boolean expressions"],
    content: `This page describes the available functions to assist with performing boolean
calculations on numeric and timestamp types.

## isOrdered

\`isOrdered(column)\` return a \`boolean\` indicating whether the column values are
ordered in a table.

**Arguments:**

- \`column\` is a column name of numeric or timestamp type.

**Return value:**

Return value type is \`boolean\`.

**Examples:**

Given a table with the following contents:

| numeric_sequence | ts                          |
| :--------------- | :-------------------------- |
| 1                | 2021-05-01T11:00:00.000000Z |
| 2                | 2021-05-01T12:00:00.000000Z |
| 3                | 2021-05-01T13:00:00.000000Z |

\`\`\`questdb-sql
SELECT isOrdered(numeric_sequence) is_num_ordered,
       isOrdered(ts) is_ts_ordered
FROM my_table
\`\`\`

| is_num_ordered | is_ts_ordered |
| :------------- | :------------ |
| true           | true          |

Adding an integer and timestamp rows out-of-order

| numeric_sequence | ts                          |
| :--------------- | :-------------------------- |
| 1                | 2021-05-01T11:00:00.000000Z |
| 2                | 2021-05-01T12:00:00.000000Z |
| 3                | 2021-05-01T13:00:00.000000Z |
| 2                | 2021-05-01T12:00:00.000000Z |

\`\`\`questdb-sql
SELECT isOrdered(numeric_sequence) FROM my_table
\`\`\`

| is_num_ordered | is_ts_ordered |
| :------------- | :------------ |
| false          | false         |

## SELECT boolean expressions

If you'd like to apply boolean logic in your SELECT expressions, see the
[SELECT reference](/docs/reference/sql/select/).
`
  },
  {
    path: "function/conditional.md",
    title: "Conditional functions",
    headers: ["case", "coalesce", "nullif"],
    content: `Conditional functions allow for conditionally selecting input values.

## case

The \`case\` keyword  goes through a set of conditions and returns a value corresponding to the
first condition met.

For full syntax and examples, please visit the [CASE Keyword Reference](/docs/reference/sql/case)

## coalesce

\`coalesce(value [, ...])\` - returns the first non-null argument in a provided
list of arguments in cases where null values should not appear in query results.

This function is an implementation of the \`COALESCE\` expression in PostgreSQL
and as such, should follow the expected behavior described in the
[coalesce PostgreSQL documentation](https://www.postgresql.org/docs/current/functions-conditional.html#FUNCTIONS-COALESCE-NVL-IFNULL)

**Arguments:**

- \`coalesce(value [, ...])\` \`value\` and subsequent comma-separated list of
  arguments which may be of any type except binary. If the provided arguments
  are of different types, one should be \`CAST\`able to another.

**Return value:**

The returned value is the first non-null argument passed.

**Examples:**

Given a table with the following records:

| timestamp                   | amount |
| :-------------------------- | :----- |
| 2021-02-11T09:39:16.332822Z | 1      |
| 2021-02-11T09:39:16.333481Z | null   |
| 2021-02-11T09:39:16.333511Z | 3      |

The following example demonstrates how to use \`coalesce()\` to return a default
value of \`0\` for an expression if the \`amount\` column contains \`null\` values.

\`\`\`questdb-sql
SELECT timestamp,
       coalesce(amount, 0) as amount_not_null
FROM transactions
\`\`\`

| timestamp                   | amount_not_null |
| :-------------------------- | :-------------- |
| 2021-02-11T09:39:16.332822Z | 1               |
| 2021-02-11T09:39:16.333481Z | 0               |
| 2021-02-11T09:39:16.333511Z | 3               |

## nullif

\`nullif(value1, value2)\` - returns a null value if \`value1\` is equal to \`value2\`
or otherwise returns \`value1\`.

This function is an implementation of the \`NULLIF\` expression in PostgreSQL and
as such, should follow the expected behavior described in the
[nullif PostgreSQL documentation](https://www.postgresql.org/docs/current/functions-conditional.html#FUNCTIONS-COALESCE-NVL-IFNULL).

**Arguments:**

- \`value1\` is any numeric, char, or string value.
- \`value2\` is any numeric, char, or string value.

**Return value:**

The returned value is either \`NULL\`, or the first argument passed.

**Examples:**

Given a table with the following records:

| timestamp                   | amount |
| :-------------------------- | :----- |
| 2021-02-11T09:39:16.332822Z | 0      |
| 2021-02-11T09:39:16.333481Z | 11     |
| 2021-02-11T09:39:16.333511Z | 3      |

The following example demonstrates how to use \`nullif()\` to return a \`null\` if
the \`amount\` column contains \`0\` values.

\`\`\`questdb-sql
SELECT timestamp,
       nullif(amount, 0) as amount_null_if_zero
FROM transactions
\`\`\`

| timestamp                   | amount_null_if_zero |
| :-------------------------- | :------------------ |
| 2021-02-11T09:39:16.332822Z | null                |
| 2021-02-11T09:39:16.333481Z | 11                  |
| 2021-02-11T09:39:16.333511Z | 3                   |
`
  },
  {
    path: "function/date-time.md",
    title: "Timestamp, date and time functions",
    headers: ["Timestamp format", "Timestamp to Date conversion", "date_trunc", "dateadd", "datediff", "day", "day_of_week", "day_of_week_sunday_first", "days_in_month", "extract", "hour", "interval", "interval_start", "interval_end", "is_leap_year", "micros", "millis", "minute", "month", "nanos", "now", "pg_postmaster_start_time", "second", "today, tomorrow, yesterday", "today, tomorrow, yesterday with timezone", "sysdate", "systimestamp", "systimestamp_ns", "timestamp_ceil", "timestamp_floor", "timestamp_shuffle", "to_date", "to_str", "to_timestamp", "to_timestamp_ns", "to_timezone", "to_utc", "week_of_year", "year"],
    content: `This page describes the available functions to assist with performing time-based
calculations using timestamps.

## Timestamp format

The timestamp format is formed by units and arbitrary text. A unit is a
combination of letters representing a date or time component, as defined by the
table below. The letters used to form a unit are case-sensitive.

See
[Timestamps in QuestDB](/docs/guides/working-with-timestamps-timezones/#timestamps-in-questdb)
for more examples of how the units are used to parse inputs.

| Unit   | Date or Time Component                                                                                         | Presentation       | Examples                              |
| ------ | -------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------- |
| \`G\`    | Era designator                                                                                                 | Text               | AD                                    |
| \`y\`    | \`y\` single digit or greedy year, depending on the number of digits in input                                    | Year               | 1996; 96; 999; 3                      |
| \`yy\`   | Two digit year of the current century                                                                          | Year               | 96 (interpreted as 2096)              |
| \`yyy\`  | Three-digit year                                                                                               | Year               | 999                                   |
| \`yyyy\` | Four-digit year                                                                                                | Year               | 1996                                  |
| \`M\`    | Month in year, numeric, greedy                                                                                 | Month              | 7; 07; 007; etc.                      |
| \`MM\`   | Month in year, two-digit                                                                                       | Month              | 07                                    |
| \`MMM\`  | Month in year, name                                                                                            | Month              | Jul; July                             |
| \`w\`    | Week in year                                                                                                   | Number             | 2                                     |
| \`ww\`   | ISO week of year (two-digit)                                                                                   | Number             | 02                                    |
| \`D\`    | Day in year                                                                                                    | Number             | 189                                   |
| \`d\`    | Day in month                                                                                                   | Number             | 10                                    |
| \`F\`    | Day of week in month                                                                                           | Number             | 2                                     |
| \`E\`    | Day name in week                                                                                               | Text               | Tuesday; Tue                          |
| \`u\`    | Day number of week (1 = Monday, ..., 7 = Sunday)                                                               | Number             | 1                                     |
| \`a\`    | Am/pm marker                                                                                                   | Text               | PM                                    |
| \`H\`    | Hour in day (0-23)                                                                                             | Number             | 0                                     |
| \`k\`    | Hour in day (1-24)                                                                                             | Number             | 24                                    |
| \`K\`    | Hour in am/pm (0-11)                                                                                           | Number             | 0                                     |
| \`h\`    | Hour in am/pm (1-12)                                                                                           | Number             | 12                                    |
| \`m\`    | Minute in hour                                                                                                 | Number             | 30                                    |
| \`s\`    | Second in minute                                                                                               | Number             | 55                                    |
| \`SSS\`  | 3-digit millisecond (see explanation below for fraction-of-second)                                             | Number             | 978                                   |
| \`S\`    | Millisecond up to 3 digits (see explanation below for fraction-of-second)                                      | Number             | 900                                   |
| \`UUU\`  | 3-digit microsecond (see explanation below for fraction-of-second)                                             | Number             | 456                                   |
| \`U\`    | Microsecond up to 3 digits (see explanation below for fraction-of-second)                                      | Number             | 456                                   |
| \`U+\`   | Microsecond up to 6 digits (see explanation below for fraction-of-second)                                      | Number             | 123456                                |
| \`N\`    | Nanosecond up to 3 digits (see explanation below for fraction-of-second)                                       | Number             | 900                                   |
| \`N+\`   | Microsecond up to 9 digits (see explanation below for fraction-of-second)                                      | Number             | 123456789                             |
| \`z\`    | Time zone                                                                                                      | General time zone  | Pacific Standard Time; PST; GMT-08:00 |
| \`Z\`    | Time zone                                                                                                      | RFC 822 time zone  | -0800                                 |
| \`x\`    | Time zone                                                                                                      | ISO 8601 time zone | -08; -0800; -08:00                    |

### Examples for greedy year format \`y\`

The interpretation of \`y\` depends on the number of digits in the input text:

- If the input year is a two-digit number, the output timestamp assumes the
  current century.
- Otherwise, the number is interpreted as it is.

| Input year | Timestamp value interpreted by \`y-M\` | Notes                                                |
| ---------- | ------------------------------------ | ---------------------------------------------------- |
| \`5-03\`     | \`0005-03-01T00:00:00.000000Z\`        | Greedily parsing the number as it is                 |
| \`05-03\`    | \`2005-03-01T00:00:00.000000Z\`        | Greedily parsing the number assuming current century |
| \`005-03\`   | \`0005-03-01T00:00:00.000000Z\`        | Greedily parsing the number as it is                 |
| \`0005-03\`  | \`0005-03-01T00:00:00.000000Z\`        | Greedily parsing the number as it is                 |

### Examples for fractions of a second

In a basic example, \`y-M-dTHH:mm:ss.S\` specifies to parse 1, 2, or 3 decimals.
Here are more examples, showing just the last part starting with the \`.\`:

| format       | number of decimals | example input | parsed fraction of second |
| ------------ | ------------------ | ------------- | ------------------------- |
| \`.S\`         | 1-3                | \`.12\`         | 12 milliseconds           |
| \`.SSS\`       | 3                  | \`.123\`        | 123 milliseconds          |
| \`.SSSU\`      | 4-6                | \`.1234\`       | 123,400 microseconds      |
| \`.SSSUUU\`    | 6                  | \`.123456\`     | 123,456 microseconds      |
| \`.U+\`        | 1-6                | \`.12345\`      | 123,450 microseconds      |
| \`.SSSUUUN\`   | 7-9                | \`.1234567\`    | 123,456,700 nanoseconds   |
| \`.SSSUUUNNN\` | 9                  | \`.123456789\`  | 123,456,789 nanoseconds   |
| \`.N+\`        | 1-9                | \`.12\`         | 120,000,000 nanoseconds   |

## Timestamp to Date conversion

As described at the [data types section](/docs/reference/sql/datatypes), the
only difference between \`TIMESTAMP\`, \`TIMESTAMP_NS\`, and \`DATE\` in QuestDB type
system is the resolution. Whilst \`TIMESTAMP\` stores resolution as an offset from Unix epoch in
microseconds, \`TIMESTAMP_NS\` stores it as an offset in nanoseconds, and \`DATE\` stores the
offset in milliseconds.

Since the three types are backed by a signed long, this means the \`DATE\` type has a
wider range. A \`DATE\` column can store about ±2.9 million years from the Unix
epoch, whereas a \`TIMESTAMP\` has an approximate range of ±290,000 years, and a
\`TIMESTAMP_NS\` has an approximate range of ±2262 years.

For most purposes a \`TIMESTAMP\` is preferred, as it offers a wider range of
functions whilst still being 8 bytes in size.

Be aware that, when using a \`TIMESTAMP\` or \`TIMESTAMP_NS\` as the designated
timestamp, you cannot set it to any value before the Unix epoch (\`1970-01-01T00:00:00.000000Z\`).

To explicitly convert from \`TIMESTAMP\` to \`DATE\` or \`TIMESTAMP_NS\`, you can use
\`CAST(ts_column AS DATE)\` or \`CAST(ts_column AS TIMESTAMP_NS)\`. To convert from
\`DATE\` or \`TIMESTAMP_NS\` to \`TIMESTAMP\` you can \`CAST(column AS TIMESTAMP_NS)\`.

### Programmatically convert from language-specific datetimes into QuestDB timestamps

Different programming languages use different types of objects to represent the
\`DATE\` type. To learn how to convert from the \`DATE\` type into a \`TIMESTAMP\`
object in Python, Go, Java, JavaScript, C/C++, Rust, or C#/.NET, please visit
our [Date to Timestamp conversion](/docs/clients/date-to-timestamp-conversion)
reference.

---


## date_trunc

\`date_trunc(unit, timestamp)\` - returns a timestamp truncated to the specified
precision.

**Arguments:**

- \`unit\` is one of the following:

  - \`millennium\`
  - \`decade\`
  - \`century\`
  - \`year\`
  - \`quarter\`
  - \`month\`
  - \`week\`
  - \`day\`
  - \`hour\`
  - \`minute\`
  - \`second\`
  - \`millisecond\`
  - \`microsecond\`
  - \`nanosecond\`

- \`timestamp\` is any \`timestamp\`, \`timestamp_ns\`, or ISO-8601 string value.

**Return value:**

Return value defaults to \`timestamp\`, but it will return a \`timestamp_ns\` if the timestamp argument is
of type \`timestamp_ns\` or if the date passed as a string contains nanoseconds resolution.

**Examples:**

\`\`\`questdb-sql
SELECT date_trunc('hour', '2022-03-11T22:00:30.555555Z') hour,
date_trunc('month', '2022-03-11T22:00:30.555555Z') month,
date_trunc('year','2022-03-11T22:00:30.555555Z') year;
date_trunc('year','2022-03-11T22:00:30.555555000Z') year;
\`\`\`

| hour (timestamp_ns)         | month (timestamp_ns)        | year (timestamp_ns)         | year (timestamp_ns)            |
| --------------------------- | --------------------------- | --------------------------- | ------------------------------ |
| 2022-03-11T22:00:00.000000Z | 2022-03-01T00:00:00.000000Z | 2022-01-01T00:00:00.000000Z | 2022-01-01T00:00:00.000000000Z |

## dateadd

\`dateadd(period, n, startDate[, timezone])\` - adds \`n\` \`period\` to \`startDate\`,
optionally respecting timezone DST transitions.

:::tip

When a timezone is specified, the function handles daylight savings time
transitions correctly. This is particularly important when adding periods that
could cross DST boundaries (like weeks, months, or years).

Without the timezone parameter, the function performs simple UTC arithmetic
which may lead to incorrect results when crossing DST boundaries. For
timezone-aware calculations, use the timezone parameter.

:::

**Arguments:**

- \`period\` is a \`char\`. Period to be added. Available periods are:

  - \`n\`: nanoseconds
  - \`u\`: microseconds
  - \`T\`: milliseconds
  - \`s\`: second
  - \`m\`: minute
  - \`h\`: hour
  - \`d\`: day
  - \`w\`: week
  - \`M\`: month
  - \`y\`: year

- \`n\` is an \`int\` indicating the number of periods to add.
- \`startDate\` is a timestamp, timestamp_ns, or date indicating the timestamp to add the period
  to.
- \`timezone\` (optional) is a string specifying the timezone to use for DST-aware
  calculations - for example, 'Europe/London'.

**Return value:**

Return value type defaults to \`timestamp\`, but it will return a \`timestamp_ns\` if the \`startDate\`
argument is a \`timetamp_ns\`.

**Examples:**

\`\`\`questdb-sql title="Adding hours"
SELECT systimestamp(), dateadd('h', 2, systimestamp())
FROM long_sequence(1);
\`\`\`

| systimestamp                | dateadd                     |
| :-------------------------- | :-------------------------- |
| 2020-04-17T00:30:51.380499Z | 2020-04-17T02:30:51.380499Z |

\`\`\`questdb-sql title="Adding days"
SELECT systimestamp(), dateadd('d', 2, systimestamp())
FROM long_sequence(1);
\`\`\`

| systimestamp                | dateadd                     |
| :-------------------------- | :-------------------------- |
| 2020-04-17T00:30:51.380499Z | 2020-04-19T00:30:51.380499Z |

\`\`\`questdb-sql title="Adding weeks with timezone"
SELECT
    '2024-10-21T10:00:00Z',
    dateadd('w', 1, '2024-10-21T10:00:00Z', 'Europe/Bratislava') as with_tz,
    dateadd('w', 1, '2024-10-21T10:00:00Z') as without_tz
FROM long_sequence(1);
\`\`\`

| timestamp                | with_tz                  | without_tz               |
| :----------------------- | :----------------------- | :----------------------- |
| 2024-10-21T10:00:00.000Z | 2024-10-28T10:00:00.000Z | 2024-10-28T09:00:00.000Z |

Note how the timezone-aware calculation correctly handles the DST transition in
\`Europe/Bratislava\`.

\`\`\`questdb-sql title="Adding months"
SELECT systimestamp(), dateadd('M', 2, systimestamp())
FROM long_sequence(1);
\`\`\`

| systimestamp                | dateadd                     |
| :-------------------------- | :-------------------------- |
| 2020-04-17T00:30:51.380499Z | 2020-06-17T00:30:51.380499Z |

## datediff

\`datediff(period, date1, date2)\` - returns the absolute number of \`period\`
between \`date1\` and \`date2\`.

**Arguments:**

- \`period\` is a char. Period to be added. Available periods are:

  - \`n\`: nanoseconds
  - \`u\`: microseconds
  - \`T\`: milliseconds
  - \`s\`: second
  - \`m\`: minute
  - \`h\`: hour
  - \`d\`: day
  - \`w\`: week
  - \`M\`: month
  - \`y\`: year

- \`date1\` and \`date2\` are \`timestamp\`, \`timestamp_ns\`, \`date\`, or date literal strings defining the dates to compare.

**Return value:**

Return value type is \`long\`

**Examples:**

\`\`\`questdb-sql title="Difference in days"
SELECT datediff('d', '2020-01-23', '2020-01-27');
\`\`\`

| datediff |
| :------- |
| 4        |

\`\`\`questdb-sql title="Difference in months"
SELECT datediff('M', '2020-01-23', '2020-02-27');
\`\`\`

| datediff |
| :------- |
| 1        |

## day

\`day(value)\` - returns the \`day\` of month for a given timestamp from \`1\` to
\`31\`.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Day of the month" demo
SELECT day(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM trades
LIMIT -1;
\`\`\`

| day |
| :-- |
| 01  |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT day(ts), count() FROM transactions;
\`\`\`

| day | count |
| :-- | :---- |
| 1   | 2323  |
| 2   | 6548  |
| ... | ...   |
| 30  | 9876  |
| 31  | 2567  |

## day_of_week

\`day_of_week(value)\` - returns the day number in a week from \`1\` (Monday) to \`7\`
(Sunday).

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql
SELECT to_str(ts,'EE'),day_of_week(ts) FROM myTable;
\`\`\`

| day       | day_of_week |
| :-------- | :---------- |
| Monday    | 1           |
| Tuesday   | 2           |
| Wednesday | 3           |
| Thursday  | 4           |
| Friday    | 5           |
| Saturday  | 6           |
| Sunday    | 7           |

## day_of_week_sunday_first

\`day_of_week_sunday_first(value)\` - returns the day number in a week from \`1\`
(Sunday) to \`7\` (Saturday).

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql
SELECT to_str(ts,'EE'),day_of_week_sunday_first(ts) FROM myTable;
\`\`\`

| day       | day_of_week_sunday_first |
| :-------- | :----------------------- |
| Monday    | 2                        |
| Tuesday   | 3                        |
| Wednesday | 4                        |
| Thursday  | 5                        |
| Friday    | 6                        |
| Saturday  | 7                        |
| Sunday    | 1                        |

## days_in_month

\`days_in_month(value)\` - returns the number of days in a month from a given
timestamp or date.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql
SELECT month(ts), days_in_month(ts) FROM myTable;
\`\`\`

| month | days_in_month |
| :---- | :------------ |
| 4     | 30            |
| 5     | 31            |
| 6     | 30            |
| 7     | 31            |
| 8     | 31            |

## extract

\`extract(unit, timestamp)\` - returns the selected time unit from the input
timestamp.

**Arguments:**

- \`unit\` is one of the following:

  - \`millennium\`
  - \`epoch\`
  - \`decade\`
  - \`century\`
  - \`year\`
  - \`isoyear\`
  - \`doy\` (day of year)
  - \`quarter\`
  - \`month\`
  - \`week\`
  - \`dow\` (day of week)
  - \`isodow\`
  - \`day\`
  - \`hour\`
  - \`minute\`
  - \`second\`
  - \`microseconds\`
  - \`milliseconds\`

- \`timestamp\` is any \`timestamp\`, \`timestamp_ns\`, \`date\`, or date literal string value.

**Return value:**

Return value type is \`integer\`.

**Examples**

\`\`\`questdb-sql

SELECT extract(millennium from '2023-03-11T22:00:30.555555Z') millennium,
extract(year from '2023-03-11T22:00:30.555555Z') year,
extract(month from '2023-03-11T22:00:30.555555Z') month,
extract(week from '2023-03-11T22:00:30.555555Z') quarter,
extract(hour from '2023-03-11T22:00:30.555555Z') hour,
extract(second from '2023-03-11T22:00:30.555555Z') second;
\`\`\`

| millennium | year | month | quarter | hour | second |
| ---------- | ---- | ----- | ------- | ---- | ------ |
| 3          | 2023 | 3     | 10      | 22   | 30     |

## hour

\`hour(value)\` - returns the \`hour\` of day for a given timestamp from \`0\` to
\`23\`.

**Arguments:**

- \`timestamp\` is any \`timestamp\`, \`timestamp_ns\`, \`date\`, or date literal string value.

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Hour of the day"
SELECT hour(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
\`\`\`

| hour |
| :--- |
| 12   |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT hour(ts), count() FROM transactions;
\`\`\`

| hour | count |
| :--- | :---- |
| 0    | 2323  |
| 1    | 6548  |
| ...  | ...   |
| 22   | 9876  |
| 23   | 2567  |

## interval

\`interval(start_timestamp, end_timestamp)\` - creates a time interval from two
timestamps.

**Arguments:**

- \`start_timestamp\` is a timestamp.
- \`end_timestamp\` is a timestamp not earlier than the \`start_timestamp\`.

**Return value:**

Return value type is \`interval\`.

**Examples:**

\`\`\`questdb-sql title="Construct an interval" demo
SELECT interval('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z')
\`\`\`

| interval                                                 |
| :------------------------------------------------------- |
| ('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z') |

## interval_start

\`interval_start(interval)\` - extracts the lower bound of the interval.

**Arguments:**

- \`interval\` is an \`interval\`.

**Return value:**

Return value type is \`timestamp\` or \`timestamp_ns\`, depending on the type of values in the interval.

**Examples:**

\`\`\`questdb-sql title="Extract an interval lower bound" demo
SELECT
  interval_start(
    interval('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z')
  )
\`\`\`

| interval_start              |
| :-------------------------- |
| 2024-10-08T11:09:47.573000Z |

## interval_end

\`interval_end(interval)\` - extracts the upper bound of the interval.

**Arguments:**

- \`interval\` is an \`interval\`.

**Return value:**

Return value type is \`timestamp\` or \`timestamp_ns\`, depending on the type of values in the interval.

**Examples:**

\`\`\`questdb-sql title="Extract an interval upper bound" demo
SELECT
  interval_end(
    interval('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z')
  )
\`\`\`

| interval_end                |
| :-------------------------- |
| 2024-10-09T11:09:47.573000Z |

## is_leap_year

\`is_leap_year(value)\` - returns \`true\` if the \`year\` of \`value\` is a leap year,
\`false\` otherwise.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`boolean\`

**Examples:**

\`\`\`questdb-sql title="Simple example" demo
SELECT year(timestamp), is_leap_year(timestamp)
FROM trades
limit -1;
\`\`\`

| year | is_leap_year |
| :--- | :----------- |
| 2020 | true         |
| 2021 | false        |
| 2022 | false        |
| 2023 | false        |
| 2024 | true         |
| 2025 | false        |

## micros

\`micros(value)\` - returns the \`micros\` of the millisecond for a given date or
timestamp from \`0\` to \`999\`.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Micros of the second"
SELECT micros(to_timestamp('2020-03-01:15:43:21.123456', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'))
FROM long_sequence(1);
\`\`\`

| millis |
| :----- |
| 456    |

\`\`\`questdb-sql title="Parsing 3 digits when no unit is added after U"
SELECT micros(to_timestamp('2020-03-01:15:43:21.123456', 'yyyy-MM-dd:HH:mm:ss.SSSU'))
FROM long_sequence(1);
\`\`\`

| millis |
| :----- |
| 456    |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT micros(ts), count() FROM transactions;
\`\`\`

| second | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 998    | 9876  |
| 999    | 2567  |

## millis

\`millis(value)\` - returns the \`millis\` of the second for a given date or
timestamp from \`0\` to \`999\`.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Millis of the second"
SELECT millis(
    to_timestamp('2020-03-01:15:43:21.123456', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'))
FROM long_sequence(1);
\`\`\`

| millis |
| :----- |
| 123    |

\`\`\`questdb-sql title="Parsing 3 digits when no unit is added after S"
SELECT millis(to_timestamp('2020-03-01:15:43:21.123', 'yyyy-MM-dd:HH:mm:ss.S'))
FROM long_sequence(1);
\`\`\`

| millis |
| :----- |
| 123    |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT millis(ts), count() FROM transactions;
\`\`\`

| second | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 998    | 9876  |
| 999    | 2567  |

## minute

\`minute(value)\` - returns the \`minute\` of the hour for a given timestamp from
\`0\` to \`59\`.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Minute of the hour" demo
SELECT minute(to_timestamp('2022-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM trades
LIMIT -1;
\`\`\`

| minute |
| :----- |
| 43     |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT minute(ts), count() FROM transactions;
\`\`\`

| minute | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 58     | 9876  |
| 59     | 2567  |

## month

\`month(value)\` - returns the \`month\` of year for a given date from \`1\` to \`12\`.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Month of the year"
SELECT month(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
\`\`\`

| month |
| :---- |
| 03    |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT month(ts), count() FROM transactions;
\`\`\`

| month | count |
| :---- | :---- |
| 1     | 2323  |
| 2     | 6548  |
| ...   | ...   |
| 11    | 9876  |
| 12    | 2567  |

## nanos

\`nanos(value)\` - returns the \`nanos\` of the second for a given date or
timestamp from \`0\` to \`999\`.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Nanos of the second"
SELECT nanos(
    to_timestamp_ns('2020-03-01:15:43:21.123456789', 'yyyy-MM-dd:HH:mm:ss.SSSUUUNNN')) as nanos
FROM long_sequence(1);
\`\`\`

| nanos |
| :----- |
| 789    |



## now

\`now()\` - offset from UTC Epoch in microseconds.

Calculates \`UTC timestamp\` using system's real time clock. Unlike
\`systimestamp()\`, it does not change within the query execution timeframe and
should be used in WHERE clause to filter designated timestamp column relative to
current time, i.e.:

- \`SELECT now() FROM long_sequence(200)\` will return the same timestamp for all
  rows
- \`SELECT systimestamp() FROM long_sequence(200)\` will have new timestamp values
  for each row

**Arguments:**

- \`now()\` does not accept arguments.

**Return value:**

Return value type is \`timestamp\`.

**Examples:**

\`\`\`questdb-sql title="Filter records to created within last day"
SELECT created, origin FROM telemetry
WHERE created > dateadd('d', -1, now());
\`\`\`

| created                     | origin |
| :-------------------------- | :----- |
| 2021-02-01T21:51:34.443726Z | 1      |

\`\`\`questdb-sql title="Query returns same timestamp in every row"
SELECT now() FROM long_sequence(3)
\`\`\`

| now                         |
| :-------------------------- |
| 2021-02-01T21:51:34.443726Z |
| 2021-02-01T21:51:34.443726Z |
| 2021-02-01T21:51:34.443726Z |

\`\`\`questdb-sql title="Query based on last minute"
SELECT * FROM readings
WHERE date_time > now() - 60000000L;
\`\`\`

## pg_postmaster_start_time

\`pg_postmaster_start_time()\` - returns the time when the server started.

**Arguments**

- \`pg_postmaster_start_time()\` does not accept arguments.

**Return value:**

Return value type is \`timestamp\`

**Examples**

\`\`\`questdb-sql
SELECT pg_postmaster_start_time();
\`\`\`

|  pg_postmaster_start_time   |
| :-------------------------: |
| 2023-03-30T16:20:29.763961Z |

## second

\`second(value)\` - returns the \`second\` of the minute for a given date or
timestamp from \`0\` to \`59\`.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, or \`date\`

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Second of the minute"
SELECT second(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
\`\`\`

| second |
| :----- |
| 43     |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT second(ts), count() FROM transactions;
\`\`\`

| second | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 58     | 9876  |
| 59     | 2567  |

## today, tomorrow, yesterday

- \`today()\` - returns an interval representing the current day.

- \`tomorrow()\` - returns an interval representing the next day.

- \`yesterday()\` - returns an interval representing the previous day.

Interval is in the UTC/GMT+0 timezone.

**Arguments:**

No arguments taken.

**Return value:**

Return value is of type \`interval\`.

**Examples:**

\`\`\`questdb-sql title="Using today"
SELECT true as in_today FROM long_sequence(1)
WHERE now() IN today();
\`\`\`

## today, tomorrow, yesterday with timezone

- \`today(timezone)\` - returns an interval representing the current day with
  timezone adjustment.

- \`tomorrow(timezone)\` - returns an interval representing the next day timezone
  adjustment.

- \`yesterday(timezone)\` - returns an interval representing the previous day
  timezone adjustment.

**Arguments:**

\`timezone\` is a \`string\` matching a timezone.

**Return value:**

Return value is of type \`interval\`.

**Examples:**

\`\`\`questdb-sql title="Using today" demo
SELECT today() as today, today('CEST') as adjusted;
\`\`\`

| today                                                    | adjusted                                                 |
| :------------------------------------------------------- | :------------------------------------------------------- |
| ('2024-10-08T00:00:00.000Z', '2024-10-08T23:59:59.999Z') | ('2024-10-07T22:00:00.000Z', '2024-10-08T21:59:59.999Z') |

This function allows the user to specify their local timezone and receive a UTC
interval that corresponds to their 'day'.

In this example, \`CEST\` is a +2h offset, so the \`CEST\` day started at \`10:00 PM\`
\`UTC\` the day before.

## sysdate

\`sysdate()\` - returns the timestamp of the host system as a \`date\` with
\`millisecond\` precision.

Calculates \`UTC date\` with millisecond precision using system's real time clock.
The value is affected by discontinuous jumps in the system time (e.g., if the
system administrator manually changes the system time).

\`sysdate()\` value can change within the query execution timeframe and should
**NOT** be used in WHERE clause to filter designated timestamp column.

:::tip

Use \`now()\` with WHERE clause filter.

:::

**Arguments:**

- \`sysdate()\` does not accept arguments.

**Return value:**

Return value type is \`date\`.

**Examples:**

\`\`\`questdb-sql title="Insert current system date along with a value"
INSERT INTO readings
VALUES(sysdate(), 123.5);
\`\`\`

| sysdate                     | reading |
| :-------------------------- | :------ |
| 2020-01-02T19:28:48.727516Z | 123.5   |

\`\`\`questdb-sql title="Query based on last minute"
SELECT * FROM readings
WHERE date_time > sysdate() - 60000000L;
\`\`\`

## systimestamp

\`systimestamp()\` - offset from UTC Epoch in microseconds. Calculates
\`UTC timestamp\` using system's real time clock. The value is affected by
discontinuous jumps in the system time (e.g., if the system administrator
manually changes the system time).

\`systimestamp()\` value can change within the query execution timeframe and
should **NOT** be used in WHERE clause to filter designated timestamp column.

:::tip

Use now() with WHERE clause filter.

:::

**Arguments:**

- \`systimestamp()\` does not accept arguments.

**Return value:**

Return value type is \`timestamp\`.

**Examples:**

\`\`\`questdb-sql title="Insert current system timestamp"
INSERT INTO readings
VALUES(systimestamp(), 123.5);
\`\`\`

| ts                          | reading |
| :-------------------------- | :------ |
| 2020-01-02T19:28:48.727516Z | 123.5   |

## systimestamp_ns

\`systimestamp_ns()\` - offset from UTC Epoch in nanoseconds. Calculates
\`UTC timestamp\` using system's real time clock. The value is affected by
discontinuous jumps in the system time (e.g., if the system administrator
manually changes the system time).

\`systimestamp_ns()\` value can change within the query execution timeframe and
should **NOT** be used in WHERE clause to filter designated timestamp column.

:::tip

Use now() with WHERE clause filter.

:::

**Arguments:**

- \`systimestamp_ns()\` does not accept arguments.

**Return value:**

Return value type is \`timestamp_ns\`.

**Examples:**

\`\`\`questdb-sql title="Insert current system timestamp_ns"
INSERT INTO readings
VALUES(systimestamp_ns(), 123.5);
\`\`\`

| ts                             | reading |
| :----------------------------- | :------ |
| 2020-01-02T19:28:48.727516132Z | 123.5   |

## timestamp_ceil

\`timestamp_ceil(unit, timestamp)\` - performs a ceiling calculation on a
timestamp by given unit.

A unit must be provided to specify which granularity to perform rounding.

**Arguments:**

\`timestamp_ceil(unit, timestamp)\` has the following arguments:

\`unit\` - may be one of the following:

- \`n\` nanoseconds
- \`U\` microseconds
- \`T\` milliseconds
- \`s\` seconds
- \`m\` minutes
- \`h\` hours
- \`d\` days
- \`M\` months
- \`y\` year

\`timestamp\` - any \`timestamp\`, \`timestamp_ns\`, \`date\`, or date literal string value.

**Return value:**

Return value type defaults to \`timestamp\`, but it will return a \`timestamp_ns\` if the timestamp argument is of type
\`timestamp_ns\` or if the date passed as a string contains nanoseconds resolution.

**Examples:**

\`\`\`questdb-sql
WITH t AS (SELECT cast('2016-02-10T16:18:22.862145333Z' AS timestamp_ns) ts)
SELECT
  ts,
  timestamp_ceil('n', ts) c_nano,
  timestamp_ceil('U', ts) c_micro,
  timestamp_ceil('T', ts) c_milli,
  timestamp_ceil('s', ts) c_second,
  timestamp_ceil('m', ts) c_minute,
  timestamp_ceil('h', ts) c_hour,
  timestamp_ceil('d', ts) c_day,
  timestamp_ceil('M', ts) c_month,
  timestamp_ceil('y', ts) c_year
  FROM t
\`\`\`

| ts                             | c_nano                         | c_micro                        | c_milli                        | c_second                       | c_minute | c_hour | c_day | c_month | c_year |
| ------------------------------ | ------------------------------ | ------------------------------ | ------------------------------ | ------------------------------ | -------- | ------ | ----- | ------- | ------ |
| 2016-02-10T16:18:22.862145333Z | 2016-02-10T16:18:22.862145333Z | 2016-02-10T16:18:22.862146000Z | 2016-02-10T16:18:22.863000000Z | 2016-02-10T16:18:23.000000000Z |


## timestamp_floor

\`timestamp_floor(interval, timestamp)\` - performs a floor calculation on a
timestamp by given interval expression.

An interval expression must be provided to specify which granularity to perform
rounding for.

**Arguments:**

\`timestamp_floor(interval, timestamp)\` has the following arguments:

\`unit\` - is a time interval expression that may use one of the following
suffices:

- \`n\` nanoseconds
- \`U\` microseconds
- \`T\` milliseconds
- \`s\` seconds
- \`m\` minutes
- \`h\` hours
- \`d\` days
- \`M\` months
- \`y\` year

\`timestamp\` - any \`timestamp\`, \`timestamp_ns\`, \`date\`, or date literal string value.

**Return value:**

Return value type defaults to \`timestamp\`, but it will return a \`timestamp_ns\` if the timestamp argument is of type
\`timestamp_ns\` or if the date passed as a string contains nanoseconds resolution.

**Examples:**

\`\`\`questdb-sql
SELECT timestamp_floor('5d', '2018-01-01')
\`\`\`

Gives:

| timestamp_floor             |
| --------------------------- |
| 2017-12-30T00:00:00.000000Z |

The number part of the expression is optional:

\`\`\`questdb-sql
WITH t AS (SELECT cast('2016-02-10T16:18:22.862145333Z' AS timestamp_ns) ts)
SELECT
  ts,
  timestamp_floor('n', ts) c_nano,
  timestamp_floor('U', ts) c_micro,
  timestamp_floor('T', ts) c_milli,
  timestamp_floor('s', ts) c_second,
  timestamp_floor('m', ts) c_minute,
  timestamp_floor('h', ts) c_hour,
  timestamp_floor('d', ts) c_day,
  timestamp_floor('M', ts) c_month,
  timestamp_floor('y', ts) c_year
  FROM t
\`\`\`

Gives:

| ts                             | c_nano                         | c_micro                        | c_milli                        | c_second                       | c_minute | c_hour | c_day | c_month | c_year |
| ------------------------------ | ------------------------------ | ------------------------------ | ------------------------------ | ------------------------------ | -------- | ------ | ----- | ------- | ------ |
| 2016-02-10T16:18:22.862145333Z | 2016-02-10T16:18:22.862145333Z | 2016-02-10T16:18:22.862145000Z | 2016-02-10T16:18:22.862000000Z | 2016-02-10T16:18:22.000000000Z |


#### timestamp_floor with offset

When timestamps are floored by \`timestamp_floor(interval, timestamp)\`, they are
based on a root timestamp of \`0\`. This means that some floorings with a stride
can be confusing, since they are based on a modulo from \`1970-01-01\`.

For example:

\`\`\`questdb-sql
SELECT timestamp_floor('5d', '2018-01-01')
\`\`\`

Gives:

| timestamp_floor             |
| --------------------------- |
| 2017-12-30T00:00:00.000000Z |

If you wish to calculate bins from an offset other than \`1970-01-01\`, you can
add a third parameter: \`timestamp_floor(interval, timestamp, offset)\`. The
offset acts as a baseline from which further values are calculated.

\`\`\`questdb-sql
SELECT timestamp_floor('5d', '2018-01-01', '2018-01-01')
\`\`\`

Gives:

| timestamp_floor             |
| --------------------------- |
| 2018-01-01T00:00:00.000000Z |

You can test this on the QuestDB Demo:

\`\`\`questdb-sql
SELECT timestamp_floor('5d', pickup_datetime, '2018') t, count
FROM trips
WHERE pickup_datetime in '2018'
ORDER BY 1;
\`\`\`

Gives:

| t                           | count   |
| --------------------------- | ------- |
| 2018-01-01T00:00:00.000000Z | 1226531 |
| 2018-01-06T00:00:00.000000Z | 1468302 |
| 2018-01-11T00:00:00.000000Z | 1604016 |
| 2018-01-16T00:00:00.000000Z | 1677303 |
| ...                         | ...     |

## timestamp_shuffle

\`timestamp_shuffle(timestamp_1, timestamp_2)\` - generates a random timestamp
inclusively between the two input timestamps.

**Arguments:**

- \`timestamp_1\` - any \`timestamp\`, \`timestamp_ns\`, \`date\`, or date literal string value.
- \`timestamp_2\` - a timestamp value that is not equal to \`timestamp_1\`

**Return value:**

Return value type defaults to \`timestamp\`, but it will return a \`timestamp_ns\` if the timestamp argument is of type
\`timestamp_ns\` or if the date passed as a string contains nanoseconds resolution.

**Examples:**

\`\`\`questdb-sql
SELECT timestamp_shuffle('2023-03-31T22:00:30.555998Z', '2023-04-01T22:00:30.555998Z');
\`\`\`

| timestamp_shuffle           |
| :-------------------------- |
| 2023-04-01T11:44:41.893394Z |


## to_date

:::note

While the \`date\` data type is available, we highly recommend applying the
\`timestamp\` data type in its place.

The only material advantage of date is a wider time range; timestamp however is
adequate in virtually all cases.

Date supports fewer functions and uses milliseconds instead of microseconds.

:::

\`to_date(string, format)\` - converts string to \`date\` by using the supplied
\`format\` to extract the value.

Will convert a \`string\` to \`date\` using the format definition passed as an
argument. When the \`format\` definition does not match the \`string\` input, the
result will be \`null\`.

For more information about recognized timestamp formats, see the
[timestamp format section](#timestamp-format).

**Arguments:**

- \`string\` is any string that represents a date and/or time.
- \`format\` is a string that describes the \`date format\` in which \`string\` is
  expressed.

**Return value:**

Return value type is \`date\`

**Examples:**

\`\`\`questdb-sql title="string matches format" demo
SELECT to_date('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss')
FROM trades;
\`\`\`

| to_date                  |
| :----------------------- |
| 2020-03-01T15:43:21.000Z |

\`\`\`questdb-sql title="string does not match format"
SELECT to_date('2020-03-01:15:43:21', 'yyyy')
FROM long_sequence(1);
\`\`\`

| to_date |
| :------ |
| null    |

\`\`\`questdb-sql title="Using with INSERT"
INSERT INTO measurements
values(to_date('2019-12-12T12:15', 'yyyy-MM-ddTHH:mm'), 123.5);
\`\`\`

| date                     | value |
| :----------------------- | :---- |
| 2019-12-12T12:15:00.000Z | 123.5 |

## to_str

\`to_str(value, format)\` - converts timestamp value to a string in the specified
format.

Will convert a timestamp value to a string using the format definition passed as
an argument. When elements in the \`format\` definition are unrecognized, they
will be passed-through as string.

For more information about recognized timestamp formats, see the
[timestamp format section](#timestamp-format).

**Arguments:**

- \`value\` is any \`date\`, \`timestamp\`, or \`timestamp_ns\` value
- \`format\` is a timestamp format.

**Return value:**

Return value type is \`string\`

**Examples:**

- Basic example

\`\`\`questdb-sql
SELECT to_str(systimestamp(), 'yyyy-MM-dd') FROM long_sequence(1);
\`\`\`

| to_str     |
| :--------- |
| 2020-03-04 |

- With unrecognized timestamp definition

\`\`\`questdb-sql
SELECT to_str(systimestamp(), 'yyyy-MM-dd gooD DAY 123') FROM long_sequence(1);
\`\`\`

| to_str                  |
| :---------------------- |
| 2020-03-04 gooD DAY 123 |

## to_timestamp

\`to_timestamp(string, format)\` - converts \`string\` to \`timestamp\` by using the
supplied \`format\` to extract the value with microsecond precision.

When the \`format\` definition does not match the \`string\` input, the result will
be \`null\`.

For more information about recognized timestamp formats, see the
[timestamp format section](#timestamp-format).

**Arguments:**

- \`string\` is any string that represents a date and/or time.
- \`format\` is a string that describes the timestamp format in which \`string\` is
  expressed.

**Return value:**

Return value type is \`timestamp\`. QuestDB provides \`timestamp\` with microsecond
resolution. Input strings with nanosecond precision will be parsed but lose the
precision. Use [\`to_timestamp_ns\`](#to_timestamp_ns) if nanosecond precision is required.

**Examples:**

\`\`\`questdb-sql title="Pattern matching with microsecond precision"
SELECT to_timestamp('2020-03-01:15:43:21.127329', 'yyyy-MM-dd:HH:mm:ss.SSSUUU')
FROM long_sequence(1);
\`\`\`

| to_timestamp                |
| :-------------------------- |
| 2020-03-01T15:43:21.127329Z |

\`\`\`questdb-sql title="Precision loss when pattern matching with nanosecond precision"
SELECT to_timestamp('2020-03-01:15:43:00.000000001Z', 'yyyy-MM-dd:HH:mm:ss.SSSUUUNNNZ')
FROM long_sequence(1);
\`\`\`

| to_timestamp                |
| :-------------------------- |
| 2020-03-01T15:43:00.000000Z |

\`\`\`questdb-sql title="String does not match format"
SELECT to_timestamp('2020-03-01:15:43:21', 'yyyy')
FROM long_sequence(1);
\`\`\`

| to_timestamp |
| :----------- |
| null         |

\`\`\`questdb-sql title="Using with INSERT"
INSERT INTO measurements
values(to_timestamp('2019-12-12T12:15', 'yyyy-MM-ddTHH:mm'), 123.5);
\`\`\`

| timestamp                   | value |
| :-------------------------- | :---- |
| 2019-12-12T12:15:00.000000Z | 123.5 |

Note that conversion of ISO timestamp format is optional. QuestDB automatically
converts \`string\` to \`timestamp\` if it is a partial or full form of
\`yyyy-MM-ddTHH:mm:ss.SSSUUU\` or \`yyyy-MM-dd HH:mm:ss.SSSUUU\` with a valid time
offset, \`+01:00\` or \`Z\`. See more examples in
[Native timestamp](/docs/reference/sql/where/#native-timestamp-format)


## to_timestamp_ns

\`to_timestamp_ns(string, format)\` - converts \`string\` to \`timestamp_ns\` by using the
supplied \`format\` to extract the value with nanosecond precision.

When the \`format\` definition does not match the \`string\` input, the result will
be \`null\`.

For more information about recognized timestamp formats, see the
[timestamp format section](#timestamp-format).

**Arguments:**

- \`string\` is any string that represents a date and/or time.
- \`format\` is a string that describes the timestamp format in which \`string\` is
  expressed.

**Return value:**

Return value type is \`timestamp_ns\`. If nanoseconds are not needed, you can use
[\`to_timestamp\`](#to_timestamp) instead.

**Examples:**

\`\`\`questdb-sql title="Pattern matching with nanosecond precision"
SELECT to_timestamp_ns('2020-03-01:15:43:21.127329512', 'yyyy-MM-dd:HH:mm:ss.SSSUUUNNN') as timestamp_ns
FROM long_sequence(1);
\`\`\`

| timestamp_ns                   |
| :----------------------------- |
| 2020-03-01T15:43:21.127329512Z |


## to_timezone

\`to_timezone(timestamp, timezone)\` - converts a timestamp value to a specified
timezone. For more information on the time zone database used for this function,
see the
[QuestDB time zone database documentation](/docs/guides/working-with-timestamps-timezones/).

**Arguments:**

- \`timestamp\` is any \`timestamp\`, \`timestamp_ns\`, microsecond Epoch, or string equivalent
- \`timezone\` may be \`Country/City\` tz database name, time zone abbreviation such
  as \`PST\` or in UTC offset in string format.

**Return value:**

Return value defaults to \`timestamp\`, but it will return a \`timestamp_ns\` if the timestamp argument is
of type \`timestamp_ns\` or if the date passed as a string contains nanoseconds resolution.

**Examples:**

- Unix UTC timestamp in microseconds to \`Europe/Berlin\`

\`\`\`questdb-sql
SELECT to_timezone(1623167145000000, 'Europe/Berlin')
\`\`\`

| to_timezone                 |
| :-------------------------- |
| 2021-06-08T17:45:45.000000Z |

- Unix UTC timestamp in microseconds to PST by UTC offset

\`\`\`questdb-sql
SELECT to_timezone(1623167145000000, '-08:00')
\`\`\`

| to_timezone                 |
| :-------------------------- |
| 2021-06-08T07:45:45.000000Z |

- Timestamp as string to \`PST\`

\`\`\`questdb-sql
SELECT to_timezone('2021-06-08T13:45:45.000000Z', 'PST')
\`\`\`

| to_timezone                 |
| :-------------------------- |
| 2021-06-08T06:45:45.000000Z |

## to_utc

\`to_utc(timestamp, timezone)\` - converts a timestamp by specified timezone to
UTC. May be provided a timezone in string format or a UTC offset in hours and
minutes. For more information on the time zone database used for this function,
see the
[QuestDB time zone database documentation](/docs/guides/working-with-timestamps-timezones/).

**Arguments:**

- \`timestamp\` is any \`timestamp\`, \`timestamp_ns\`, microsecond Epoch, or string equivalent
- \`timezone\` may be \`Country/City\` tz database name, time zone abbreviation such
  as \`PST\` or in UTC offset in string format.

**Return value:**

Return value defaults to \`timestamp\`, but it will return a \`timestamp_ns\` if the timestamp argument is
of type \`timestamp_ns\` or if the date passed as a string contains nanoseconds resolution.

**Examples:**

- Convert a Unix timestamp in microseconds from the \`Europe/Berlin\` timezone to
  UTC

\`\`\`questdb-sql
SELECT to_utc(1623167145000000, 'Europe/Berlin')
\`\`\`

| to_utc                      |
| :-------------------------- |
| 2021-06-08T13:45:45.000000Z |

- Unix timestamp in microseconds from PST to UTC by UTC offset

\`\`\`questdb-sql
SELECT to_utc(1623167145000000, '-08:00')
\`\`\`

| to_utc                      |
| :-------------------------- |
| 2021-06-08T23:45:45.000000Z |

- Timestamp as string in \`PST\` to UTC

\`\`\`questdb-sql
SELECT to_utc('2021-06-08T13:45:45.000000Z', 'PST')
\`\`\`

| to_utc                      |
| :-------------------------- |
| 2021-06-08T20:45:45.000000Z |

## week_of_year

\`week_of_year(value)\` - returns the number representing the week number in the
year.

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, \`date\`, or date string literal.

**Return value:**

Return value type is \`int\`

**Examples**

\`\`\`questdb-sql
SELECT week_of_year('2023-03-31T22:00:30.555998Z');
\`\`\`

| week_of_year |
| :----------: |
|      13      |

## year

\`year(value)\` - returns the \`year\` for a given timestamp

**Arguments:**

- \`value\` is any \`timestamp\`, \`timestamp_ns\`, \`date\`, or date string literal.

**Return value:**

Return value type is \`int\`

**Examples:**

\`\`\`questdb-sql title="Year"
SELECT year(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
\`\`\`

| year |
| :--- |
| 2020 |

\`\`\`questdb-sql title="Using in an aggregation"
SELECT month(ts), count() FROM transactions;
\`\`\`

| year | count |
| :--- | :---- |
| 2015 | 2323  |
| 2016 | 9876  |
| 2017 | 2567  |
`
  },
  {
    path: "function/finance.md",
    title: "Finance functions",
    headers: ["l2price", "mid", "regr_intercept", "regr_slope", "spread_bps", "vwap", "wmid"],
    content: `This page describes functions specific to the financial services domain.

## l2price

Level-2 trade price calculation.

\`l2price(target_size, size_array, price_array)\`

\`l2price(target_size, size_1, price_1, size_2, price_2, ..., size_n, price_n)\`

Consider \`size_1\`, \`price_1\`, \`size_2\`, \`price_2\`, ..., \`size_n\`,
\`price_n\` to be either side of an order book with \`n\` price levels. Then, the
return value of the function is the average trade price of a market order
executed with the size of \`target_size\` against the book.

Let's take the below order book as an example.

| Size | Bid   | Ask   | Size |
| ---- | ----- | ----- | ---- |
| 10   | 14.10 | 14.50 | 14   |
| 17   | 14.00 | 14.60 | 16   |
| 19   | 13.90 | 14.80 | 23   |
| 21   | 13.70 | 15.10 | 12   |
| 18   | 13.40 |       |      |

A _buy market order_ with the size of 50 would wipe out the first two price
levels of the _Ask_ side of the book, and would also trade on the third level.

The full price of the trade:

$$
14 \\cdot \\$14.50 + 16 \\cdot \\$14.60 + (50 - 14 - 16) \\cdot \\$14.80 = \\$732.60
$$

The average price of the instrument in this trade:

$$
\\$732.60 / 50 = \\$14.652
$$

This average trade price is the output of the function when executed with the
parameters taken from the above example:

\`\`\`questdb-sql
select l2price(50, ARRAY[14.0, 16.0, 23.0, 12.0], ARRAY[14.50, 14.60, 14.80, 15.10]);
\`\`\`

or

\`\`\`questdb-sql
select l2price(50, 14, 14.50, 16, 14.60, 23, 14.80, 12, 15.10);
\`\`\`

| l2price |
| ------- |
| 14.652  |

### Parameters

There are two variants of the function, one accepting arrays of numbers,
and the other accepting individual numbers:

The variant with arrays takes a \`target size\`, and a pair of arrays of type
\`DOUBLE[]\`: \`size\` and \`price\`. The arrays must match in length. Each
element of the array represents a price level of the order book.

The variant with individual numbers takes a \`target size\`, and a variable
number of \`size\`/\`price\` pairs of type \`DOUBLE\`, or convertible to \`DOUBLE\`
(\`FLOAT\`, \`LONG\`, \`INT\`, \`SHORT\`, \`BYTE\`).

- \`target_size\`: The size of a hypothetical market order to be filled.
- \`size*\`: The sizes of offers available at the corresponding price levels (can
  be fractional).
- \`price*\`: Price levels of the order book.

### Return value

The function returns a \`double\`, representing the average trade price.

It returns \`NULL\` if the price is not calculable. For example, if the target
size cannot be filled, or there is incomplete data in the set (nulls).

### Examples - ARRAY

Test data:

\`\`\`questdb-sql
CREATE TABLE order_book (
  ts TIMESTAMP,
  bidSize DOUBLE[], bid DOUBLE[],
  askSize DOUBLE[], ask DOUBLE[]
) TIMESTAMP(ts) PARTITION BY DAY;

INSERT INTO order_book VALUES
  ('2024-05-22T09:40:15.006000Z',
    ARRAY[40.0, 47.0, 39.0], ARRAY[14.10, 14.00, 13.90],
    ARRAY[54.0, 36.0, 23.0], ARRAY[14.50, 14.60, 14.80]),
  ('2024-05-22T09:40:15.175000Z',
    ARRAY[42.0, 45.0, 35.0], ARRAY[14.00, 13.90, 13.80],
    ARRAY[16.0, 57.0, 30.0], ARRAY[14.30, 14.50, 14.60]),
  ('2024-05-22T09:40:15.522000Z',
    ARRAY[36.0, 38.0, 31.0], ARRAY[14.10, 14.00, 13.90],
    ARRAY[30.0, 47.0, 34.0], ARRAY[14.40, 14.50, 14.60]);
\`\`\`

Trading price of instrument when buying 100:

\`\`\`questdb-sql
SELECT ts, L2PRICE(100, askSize, ask) AS buy FROM order_book;
\`\`\`

| ts                          | buy             |
| --------------------------- | --------------- |
| 2024-05-22T09:40:15.006000Z | 14.565999999999 |
| 2024-05-22T09:40:15.175000Z | 14.495          |
| 2024-05-22T09:40:15.522000Z | 14.493          |

Trading price of instrument when selling 100:

\`\`\`questdb-sql
SELECT ts, L2PRICE(100, bidSize, bid) AS sell FROM order_book;
\`\`\`

| ts                          | sell   |
| --------------------------- | ------ |
| 2024-05-22T09:40:15.006000Z | 14.027 |
| 2024-05-22T09:40:15.175000Z | 13.929 |
| 2024-05-22T09:40:15.522000Z | 14.01  |

The spread for target quantity 100:

\`\`\`questdb-sql
SELECT ts, L2PRICE(100, askSize, ask) - L2PRICE(100, bidSize, bid) AS spread FROM order_book;
\`\`\`

| ts                          | spread         |
| --------------------------- | -------------- |
| 2024-05-22T09:40:15.006000Z | 0.538999999999 |
| 2024-05-22T09:40:15.175000Z | 0.565999999999 |
| 2024-05-22T09:40:15.522000Z | 0.483          |

### Examples - scalar columns

Test data:

\`\`\`questdb-sql
CREATE TABLE order_book (
  ts TIMESTAMP,
  bidSize1 DOUBLE, bid1 DOUBLE, bidSize2 DOUBLE, bid2 DOUBLE, bidSize3 DOUBLE, bid3 DOUBLE,
  askSize1 DOUBLE, ask1 DOUBLE, askSize2 DOUBLE, ask2 DOUBLE, askSize3 DOUBLE, ask3 DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;

INSERT INTO order_book VALUES
  ('2024-05-22T09:40:15.006000Z', 40, 14.10, 47, 14.00, 39, 13.90, 54, 14.50, 36, 14.60, 23, 14.80),
  ('2024-05-22T09:40:15.175000Z', 42, 14.00, 45, 13.90, 35, 13.80, 16, 14.30, 57, 14.50, 30, 14.60),
  ('2024-05-22T09:40:15.522000Z', 36, 14.10, 38, 14.00, 31, 13.90, 30, 14.40, 47, 14.50, 34, 14.60);
\`\`\`

Trading price of instrument when buying 100:

\`\`\`questdb-sql
SELECT ts, L2PRICE(100, askSize1, ask1, askSize2, ask2, askSize3, ask3) AS buy FROM order_book;
\`\`\`

| ts                          | buy             |
| --------------------------- | --------------- |
| 2024-05-22T09:40:15.006000Z | 14.565999999999 |
| 2024-05-22T09:40:15.175000Z | 14.495          |
| 2024-05-22T09:40:15.522000Z | 14.493          |

Trading price of instrument when selling 100:

\`\`\`questdb-sql
SELECT ts, L2PRICE(100, bidSize1, bid1, bidSize2, bid2, bidSize3, bid3) AS sell FROM order_book;
\`\`\`

| ts                          | sell   |
| --------------------------- | ------ |
| 2024-05-22T09:40:15.006000Z | 14.027 |
| 2024-05-22T09:40:15.175000Z | 13.929 |
| 2024-05-22T09:40:15.522000Z | 14.01  |

The spread for target size of 100:

\`\`\`questdb-sql
SELECT ts, L2PRICE(100, askSize1, ask1, askSize2, ask2, askSize3, ask3)
  - L2PRICE(100, bidSize1, bid1, bidSize2, bid2, bidSize3, bid3) AS spread FROM order_book;
\`\`\`

| ts                          | spread         |
| --------------------------- | -------------- |
| 2024-05-22T09:40:15.006000Z | 0.538999999999 |
| 2024-05-22T09:40:15.175000Z | 0.565999999999 |
| 2024-05-22T09:40:15.522000Z | 0.483          |

## mid

\`mid(bid, ask)\` - calculates the midpoint of a bidding price and asking price.

Returns null if either argument is NaN or null.

### Parameters

- \`bid\` is any numeric bidding price value.
- \`ask\` is any numeric asking price value.

### Return value

Return value type is \`double\`.

### Examples

\`\`\`questdb-sql
SELECT mid(1.5760, 1.5763)
\`\`\`

| mid     |
| :------ |
| 1.57615 |

## regr_intercept

\`regr_intercept(y, x)\` - Calculates the y-intercept of the linear regression line for the given numeric columns y (dependent variable) and x (independent variable).

- The function requires at least two valid (y, x) pairs to compute the intercept.
  - If fewer than two pairs are available, the function returns null.
- Supported data types for x and y include \`double\`, \`float\`, and \`integer\` types.
- The \`regr_intercept\` function can be used with other statistical aggregation functions like \`regr_slope\` or \`corr\`.
- The order of arguments in \`regr_intercept(y, x)\` matters.
  - Ensure that y is the dependent variable and x is the independent variable.

### Calculation

The y-intercept $b_0$ of the regression line $y = b_0 + b_1 x$ is calculated using the formula:

$$
b_0 = \\bar{y} - b_1 \\bar{x}
$$

Where:

- $\\bar{y}$ is the mean of y values
- $\\bar{x}$ is the mean of x values
- $b_1$ is the slope calculated by \`regr_slope(y, x)\`

### Arguments

- y: A numeric column representing the dependent variable.
- x: A numeric column representing the independent variable.

### Return value

Return value type is \`double\`.

The function returns the y-intercept of the regression line, indicating the predicted value of y when x is 0.

### Examples

#### Calculate the regression intercept between two variables

Using the same measurements table:

| x   | y   |
| --- | --- |
| 1.0 | 2.0 |
| 2.0 | 3.0 |
| 3.0 | 5.0 |
| 4.0 | 4.0 |
| 5.0 | 6.0 |

Calculate the y-intercept:

\`\`\`questdb-sql
SELECT regr_intercept(y, x) AS y_intercept FROM measurements;
\`\`\`

Result:

| y_intercept |
| ----------- |
| 1.4         |

Or: When x is 0, y is predicted to be 1.4 units.

#### Calculate the regression intercept grouped by category

Using the same sales_data table:

| category | advertising_spend | sales |
| -------- | ---------------- | ----- |
| A        | 1000             | 15000 |
| A        | 2000             | 22000 |
| A        | 3000             | 28000 |
| B        | 1500             | 18000 |
| B        | 2500             | 26000 |
| B        | 3500             | 31000 |

\`\`\`questdb-sql
SELECT category, regr_intercept(sales, advertising_spend) AS base_sales
FROM sales_data
GROUP BY category;
\`\`\`

Result:

| category | base_sales |
| -------- | ---------- |
| A        | 9500       |
| B        | 12000      |

Or:

- In category A, with no advertising spend, the predicted base sales are 9,500 units
- In category B, with no advertising spend, the predicted base sales are 12,000 units

#### Handling null values

The function ignores rows where either x or y is null:

\`\`\`questdb-sql
SELECT regr_intercept(y, x) AS y_intercept
FROM (
    SELECT 1 AS x, 2 AS y
    UNION ALL SELECT 2, NULL
    UNION ALL SELECT NULL, 4
    UNION ALL SELECT 4, 5
);
\`\`\`

Result:

| y_intercept |
| ----------- |
| 1.4         |

Only the rows where both x and y are not null are considered in the calculation.

## regr_slope

\`regr_slope(y, x)\` - Calculates the slope of the linear regression line for the
given numeric columns y (dependent variable) and x (independent variable).

- The function requires at least two valid (x, y) pairs to compute the slope.
  - If fewer than two pairs are available, the function returns null.
- Supported data types for x and y include \`double\`, \`float\`, and \`integer\`
  types.
- The regr_slope function can be used with other statistical aggregation
  functions like \`corr\` or \`covar_samp\`.
- The order of arguments in \`regr_slope(y, x)\` matters.
  - Ensure that y is the dependent variable and x is the independent variable.

### Calculation

The slope $b_1$ of the regression line $y = b_0 + b_1 x$ is calculated using the
formula:

$$
b_1 = \\frac{N \\sum (xy) - \\sum x \\sum y}{N \\sum (x^2) - (\\sum x)^2}
$$

Where:

- $N$ is the number of valid data points.
- $\\sum (xy)$ is the sum of the products of $x$ and $y$.
- $\\sum x$ and $\\sum y$ is the sums of $x$ and $y$ values, respectively.
- $\\sum (x^2)$ is the sum of the squares of $x$ values.

### Arguments

- y: A numeric column representing the dependent variable.
- x: A numeric column representing the independent variable.

### Return value

Return value type is \`double\`.

The function returns the slope of the regression line, indicating how much y
changes for a unit change in x.

### Examples

#### Calculate the regression slope between two variables

Suppose you have a table measurements with the following data:

| x   | y   |
| --- | --- |
| 1.0 | 2.0 |
| 2.0 | 3.0 |
| 3.0 | 5.0 |
| 4.0 | 4.0 |
| 5.0 | 6.0 |

You can calculate the slope of the regression line between y and x using:

\`\`\`questdb-sql
SELECT regr_slope(y, x) AS slope FROM measurements;
\`\`\`

Result:

| slope |
| ----- |
| 0.8   |

Or: The slope of 0.8 indicates that for each unit increase in x, y increases by
0.8 units on average.

#### Calculate the regression slope grouped by a category

Consider a table sales_data:

| category | advertising_spend | sales |
| -------- | ----------------- | ----- |
| A        | 1000              | 15000 |
| A        | 2000              | 22000 |
| A        | 3000              | 28000 |
| B        | 1500              | 18000 |
| B        | 2500              | 26000 |
| B        | 3500              | 31000 |

Calculate the regression slope of \`sales\` versus \`advertising_spend\` for each
category:

\`\`\`questdb-sql
SELECT category, regr_slope(sales, advertising_spend) AS slope FROM sales_data
GROUP BY category;
\`\`\`

Result:

| category | slope |
| -------- | ----- |
| A        | 8.5   |
| B        | 7.0   |

Or:

- In category A, for every additional unit spent on advertising, sales increase
  by 8.5 units on average.
- In category B, the increase is 7.0 units per advertising unit spent.

#### Handling null values

If your data contains null values, \`regr_slope()\` will ignore those rows:

\`\`\`questdb
SELECT regr_slope(y, x) AS slope FROM ( SELECT 1 AS x, 2 AS y UNION ALL SELECT
2, NULL UNION ALL SELECT NULL, 4 UNION ALL SELECT 4, 5 );
\`\`\`

Result:

| slope |
| ----- |
| 0.8   |

Only the rows where both x and y are not null are considered in the calculation.

#### Calculating beta

Assuming you have a table \`stock_returns\` with daily returns for a specific
stock and the market index:

| date       | stock_return | market_return |
| ---------- | ------------ | ------------- |
| 2023-01-01 | 0.5          | 0.4           |
| 2023-01-02 | -0.2         | -0.1          |
| 2023-01-03 | 0.3          | 0.2           |
| ...        | ...          | ...           |

Calculate the stock's beta coefficient:

\`\`\`questdb-sql
SELECT regr_slope(stock_return, market_return) AS beta FROM stock_returns;
\`\`\`

| beta |
| ---- |
| 1.2  |

Or: A beta of 1.2 suggests the stock is 20% more volatile than the market.

Remember: The order of arguments in \`regr_slope(y, x)\` matters.

Ensure that y is the dependent variable and x is the independent variable.

## spread_bps

\`spread_bps(bid, ask)\` - calculates the quoted bid-ask spread, based on the
highest bidding price, and the lowest asking price.

The result is provided in basis points, and the calculation is:

$$
\\frac
{\\text{spread}\\left(\\text{bid}, \\text{ask}\\right)}
{\\text{mid}\\left(\\text{bid}, \\text{ask}\\right)}
\\cdot
10\\,000
$$

### Parameters

- \`bid\` is any numeric bidding price value.
- \`ask\` is any numeric asking price value.

### Return value

Return value type is \`double\`.

### Examples

\`\`\`questdb-sql
SELECT spread_bps(1.5760, 1.5763)
\`\`\`

| spread_bps     |
| :------------- |
| 1.903372140976 |

## vwap

\`vwap(price, quantity)\` - Calculates the volume-weighted average price (VWAP)
based on the given price and quantity columns. This is defined by the following
formula:

$$
\\text{vwap} =
\\frac
{\\text{sum}\\left(\\text{price} \\cdot \\text{quantity}\\right)}
{\\text{sum}\\left(\\text{quantity}\\right)}
$$

### Parameters

- \`price\` is any numeric price value.
- \`quantity\` is any numeric quantity value.

### Return value

Return value type is \`double\`.

### Examples

\`\`\`questdb-sql
SELECT vwap(x, x)
FROM (SELECT x FROM long_sequence(100));
\`\`\`

| vwap |
| :--- |
| 67   |

## wmid

\`wmid(bidSize, bidPrice, askPrice, askSize)\` - calculates the weighted mid-price
for a sized bid/ask pair.

It is calculated with these formulae:

$$
\\text{imbalance} =
\\frac
{ \\text{bidSize} }
{ \\left(  \\text{bidSize} + \\text{askSize} \\right) }
$$

$$
\\text{wmid} = \\text{askPrice} \\cdot \\text{imbalance}
+ \\text{bidPrice}
\\cdot \\left( 1 - \\text{imbalance} \\right)
$$

### Parameters

- \`bidSize\` is any numeric value representing the size of the bid offer.
- \`bidPrice\` is any numeric value representing the bidding price.
- \`askPrice\` is any numeric value representing the asking price.
- \`askSize\` is any numeric value representing the size of the ask offer.

### Return value

Return value type is \`double\`.

### Examples

\`\`\`questdb-sql
SELECT wmid(100, 5, 6, 100)
\`\`\`

| wmid |
| :--- |
| 5.5  |
`
  },
  {
    path: "function/hash.md",
    title: "Hash Functions",
    headers: ["Supported functions", "Function reference", "Notes and restrictions"],
    content: `Hash functions generate fixed-size string outputs from variable-length inputs. 

These functions are useful for data integrity verification, checksums, and data anonymization.

## Supported functions

- [\`md5()\`](#md5) – Generates a 128-bit (32 character) hash value
- [\`sha1()\`](#sha1) – Generates a 160-bit (40 character) hash value
- [\`sha256()\`](#sha256) – Generates a 256-bit (64 character) hash value

## Function reference

### md5()

Calculates an MD5 hash of the input value and returns it as a hexadecimal string.

**Arguments:**
- String, varchar, or binary value

**Return value:**
- A 32-character hexadecimal string representing the MD5 hash
- NULL if the input is NULL

**Examples:**
\`\`\`questdb-sql title="md5() with string input" demo
SELECT md5('abc');
-- Returns: '900150983cd24fb0d6963f7d28e17f72'

SELECT md5('');
-- Returns: 'd41d8cd98f00b204e9800998ecf8427e'
\`\`\`

\`\`\`questdb-sql title="md5() with UTF-8 input" demo
SELECT md5('Hello, world!');
-- Returns: '6cd3556deb0da54bca060b4c39479839'
\`\`\`

### sha1()

Calculates a SHA1 hash of the input value and returns it as a hexadecimal string.

**Arguments:**
- String, varchar, or binary value

**Return value:**
- A 40-character hexadecimal string representing the SHA1 hash
- NULL if the input is NULL

**Examples:**
\`\`\`questdb-sql title="sha1() with string input" demo
SELECT sha1('abc');
-- Returns: 'a9993e364706816aba3e25717850c26c9cd0d89d'

SELECT sha1('');
-- Returns: 'da39a3ee5e6b4b0d3255bfef95601890afd80709'
\`\`\`

\`\`\`questdb-sql title="sha1() with UTF-8 input" demo
SELECT sha1('Hello, world!');
-- Returns: '943a702d06f34599aee1f8da8ef9f7296031d699'
\`\`\`

### sha256()

Calculates a SHA256 hash of the input value and returns it as a hexadecimal string.

**Arguments:**
- String, varchar, or binary value

**Return value:**
- A 64-character hexadecimal string representing the SHA256 hash
- NULL if the input is NULL

**Examples:**
\`\`\`questdb-sql title="sha256() with string input" demo
SELECT sha256('abc');
-- Returns: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

SELECT sha256('');
-- Returns: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
\`\`\`

\`\`\`questdb-sql title="sha256() with UTF-8 input" demo
SELECT sha256('Hello, world!');
-- Returns: '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3'
\`\`\`

## Notes and restrictions

### Input handling
- All hash functions support string, varchar, and binary inputs
- Empty strings produce a valid hash value
- NULL inputs always return NULL outputs
- UTF-8 strings are fully supported

### Thread safety
- Hash functions are not thread-safe
- Each function instance maintains its own internal state

### Output characteristics
- Output is always lowercase hexadecimal
- Output length is fixed regardless of input size:
  - MD5: 32 characters
  - SHA1: 40 characters
  - SHA256: 64 characters

### Implementation details
- Uses Java's built-in MessageDigest implementations
- Supported algorithms are guaranteed to be available on all Java platforms
- Processes input in a single pass

### Common use cases

#### Data integrity verification

\`\`\`questdb-sql
SELECT 
    filename,
    sha256(content) = expected_hash as is_valid
FROM files;
\`\`\`

#### Anonymizing sensitive data

\`\`\`questdb-sql
SELECT 
    md5(email) as hashed_email,
    count(*) as user_count
FROM users
GROUP BY hashed_email;
\`\`\`

#### Binary data hashing

\`\`\`questdb-sql
SELECT 
    file_id,
    sha1(binary_content) as content_hash
FROM binary_files;
\`\`\`

`
  },
  {
    path: "function/json.md",
    title: "JSON functions",
    headers: ["json_extract"],
    content: `This page describes functions to handle JSON data.

## json_extract

Extracts fields from a JSON document stored in VARCHAR columns.

\`json_extract(doc, json_path)::datatype\`

Here [\`datatype\`](#type-conversions) can be any type supported by QuestDB.

### Usage

This is an example query that extracts fields from a \`trade_details\` \`VARCHAR\` column
containing JSON documents:

\`\`\`questdb-sql title="json_extract example"
SELECT
    json_extract(trade_details, '$.quantity')::long quantity,
    json_extract(trade_details, '$.price')::double price,
    json_extract(trade_details, '$.executions[0].timestamp')::timestamp first_ex_ts
FROM
    trades
WHERE
    json_extract(trade_details, '$.exchange') = 'NASDAQ'
\`\`\`

| quantity | price  | first_ex_ts                 |
| -------- | ------ | --------------------------- |
| 1000     | 145.09 | 2023-07-12T10:00:00.000000Z |

The query above:
   * Filters rows, keeping only trades made on NASDAQ.
   * Obtains the price and quantity fields.
   * Extracts the timestamp of the first execution for the trade.

The above query can run against this inserted JSON document:

\`\`\`json
{
  "trade_id": "123456",
  "instrument_id": "AAPL",
  "trade_type": "buy",
  "quantity": 1000,
  "price": 145.09,
  "vwap": {
    "start_timestamp": "2023-07-12T09:30:00Z",
    "end_timestamp": "2023-07-12T16:00:00Z",
    "executed_volume": 1000,
    "executed_value": 145000
  },
  "execution_time": "2023-07-12T15:59:59Z",
  "exchange": "NASDAQ",
  "strategy": "VWAP",
  "executions": [
    {
      "timestamp": "2023-07-12T10:00:00Z",
      "price": 144.50,
      "quantity": 200
    },
    {
      "timestamp": "2023-07-12T15:15:00Z",
      "price": 145.50,
      "quantity": 250
    }
  ]
}
\`\`\`

### JSON path syntax

We support a subset of the [JSONPath](https://en.wikipedia.org/wiki/JSONPath) syntax.
* \`$\` denotes the root of the document. Its use is optional and provided for
  compatibility with the JSON path standard and other databases. Note that
  all search operations always start from the root.
* \`.field\` accesses a JSON object key.
* \`[n]\` accesses a JSON array index (where \`n\` is a number).

The path cannot be constructed dynamically, such as via string concatenation.

### Type conversions

You can specify any
[datatype supported by QuestDB](/docs/reference/sql/datatypes) as the return
type. Here are some examples:

\`\`\`questdb-sql title="Extracting JSON to various datatypes"
-- Extracts the string, or the raw JSON token for non-string JSON types.
json_extract('{"name": "Lisa"}', '$.name')::varchar  -- Lisa
json_extract('[0.25, 0.5, 1.0]', '$.name')::varchar  -- [0.25, 0.5, 1.0]

-- Extracts the number as a long, returning NULL if the field is not a number
-- or is out of range. Floating point numbers are truncated.
-- Numbers can be enclosed in JSON strings.
json_extract('{"qty": 10000}', '$.qty')::long        -- 10000
json_extract('{ "qty": '9999999' }', '$.qty')::long  -- 9999999
json_extract('1.75', '$')::long                      -- 1

-- Extracts the number as a double, returning NULL if the field is not a number
-- or is out of range.
json_extract('{"price": 100.25}', '$.price')::double -- 100.25
json_extract('10000', '$')::double                   -- 10000.0
json_extract('{"price": null}', '$.price')::double   -- NULL

-- JSON \`true\` is extracted as the boolean \`true\`. Everything else is \`false\`.
json_extract('[true]', '$[0]')::boolean              -- true
json_extract('["true"]', '$[0]')::boolean            -- false

-- SHORT numbers can't represent NULL values, so return 0 instead.
json_extract('{"qty": 10000}', '$.qty')::short       -- 10000
json_extract('{"qty": null}', '$.qty')::short        -- 0
json_extract('{"qty": 1000000}', '$.qty')::short     -- 0  (out of range)
\`\`\`

Calling \`json_extract\` without immediately casting to a datatype will always
return a \`VARCHAR\`.

\`\`\`questdb-sql title="Extracting a path as VARCHAR"
json_extract('{"name": "Lisa"}', '$.name')           -- Lisa
\`\`\`

As a quirk, for PostgreSQL compatibility, suffix-casting to \`::float\` in QuestDB
produces a \`DOUBLE\` datatype. If you need a \`FLOAT\`, use the \`cast\` function
instead as so:

\`\`\`questdb-sql title="Extract a float from a JSON array"
SELECT
    cast(json_extract('[0.25, 0.5, 1.0]', '$[0]') as float) a
FROM
    long_sequence(1)
\`\`\`

#### Table of type conversions

The following table summarizes the type conversions.
* **Horizontal**: the source JSON field type
* **Vertical**: the target datatype

|               | null  | boolean    | string | number   | array & object |
|---------------|-------|------------|--------|----------|----------------|
| **BOOLEAN**   | false | ✓          | false  | false    | false          |
| **SHORT**     | 0     | 0 or 1     | ✓ (i)  | ✓ (i)    | 0              |
| **INT**       | NULL  | 0 or 1     | ✓ (i)  | ✓ (i)    | NULL           |
| **LONG**      | NULL  | 0 or 1     | ✓ (i)  | ✓ (i)    | NULL           |
| **FLOAT**     | NULL  | 0.0 or 1.0 | ✓ (ii) | ✓ (ii)   | NULL           |
| **DOUBLE**    | NULL  | 0.0 or 1.0 | ✓ (ii) | ✓ (ii)   | NULL           |
| **VARCHAR**   | NULL  | ✓ (iii)    | ✓      | ✓ (iii)  | ✓ (iii)        |
| **DATE**      | NULL  | NULL       | ✓ (iv) | ✓ (iv)   | NULL           |
| **TIMESTAMP** | NULL  | NULL       | ✓ (v)  | ✓ (vi)   | NULL           |
| **IPV4**      | NULL  | NULL       | ✓      | ✓        | NULL           |

All other types are supported through the \`VARCHAR\` type. In other words,
\`json_extract(..)::UUID\` is effectively equivalent to
\`json_extract(..)::VARCHAR::UUID\`.

* **✓**: Supported conversion.
* **(i)**: Floating point numbers are truncated. Out of range numbers evaluate to \`NULL\` or \`0\` (for \`SHORT\`).
* **(ii)**: Out of range numbers evaluate to \`NULL\`. Non-IEEE754 numbers are rounded to the nearest representable value. The \`FLOAT\` type can incur further precision loss.
* **(iii)**: JSON booleans, numbers, arrays and objects are returned as their raw JSON string representation.
* **(iv)**: Dates are expected in ISO8601 format as strings. If the date is not in this format, the result is \`NULL\`. Numeric values are parsed as milliseconds since the Unix epoch. Floating point precision is ignored.
* **(v)**: Timestamps are expected in ISO8601 format as strings. If the timestamp is not in this format, the result is \`NULL\`.
* **(vi)**: Numeric values are parsed as microseconds since the Unix epoch. Floating point precision is ignored.



### Error handling

Any errors will return \`NULL\` data when extracting to any datatype except
boolean and short, where these will return \`false\` and \`0\` respectively.

\`\`\`questdb-sql title="Error examples"
-- If either the document or the path is NULL, the result is NULL.
json_extract(NULL, NULL)                             -- NULL

-- If the document is malformed, the result is NULL.
json_extract('{"name": "Lisa"', '$.name')            -- NULL
--                           ^___ note the missing closing brace
\`\`\`

### Performance

Extracting fields from JSON documents provides flexibility, but comes at a
performance cost compared to storing fields directly in columns.

As a ballpark estimate, you should expect extracting a field from a JSON
document to be around one order of magnitude slower than extracting the same
data directly from a dedicated database column. As such, we recommend using JSON
only when the requirement of handling multiple data fields flexibly outweighs
the performance penalty.

### Migrating JSON fields to columns

JSON offers an opportunity to capture a wide range of details early
in a solution's design process. During early stages, it may not be clear which
fields will provide the most value. Once known, you can then modify the database
schema to extract these fields into first-class columns.

Extending the previous example, we can add \`price\` and \`quantity\` columns to 
the pre-existing \`trades\` table as so:

\`\`\`questdb-sql title="Extracting JSON to a new column"
-- Add two columns for caching.
ALTER TABLE trades ADD COLUMN quantity long;
ALTER TABLE trades ADD COLUMN price double;

-- Populate the columns from the existing JSON document.
UPDATE trades SET quantity = json_extract(trade_details, '$.quantity')::long;
UPDATE trades SET price = json_extract(trade_details, '$.price')::double;
\`\`\`

Alternatively, you can insert the extracted fields into a separate table:

\`\`\`questdb-sql title="Extracting JSON fields to a separate table"
INSERT INTO trades_summary SELECT
    json_extract(trade_details, '$.quantity')::long as quantity,
    json_extract(trade_details, '$.price')::double as price,
    timestamp
FROM trades;
\`\`\`
`
  },
  {
    path: "function/meta.md",
    title: "Meta functions",
    headers: ["build", "functions", "query_activity", "memory_metrics", "reader_pool", "writer_pool", "current database, schema, or user", "tables", "table_storage", "wal_tables", "table_columns", "table_partitions", "materialized_views", "version/pg_catalog.version", "hydrate_table_metadata('table1', 'table2' ...)", "flush_query_cache()", "reload_config()"],
    content: `These functions provide instance-level information and table, column and
partition information including metadata. They are particularly useful for
learning useful information about your instance, including:

- [Designated timestamp](/docs/concept/designated-timestamp/) columns
- [Attached, detached, or attachable](/docs/reference/sql/alter-table-attach-partition/)
  partitions
- Partition storage size on disk
- Running SQL commands

## build

**Arguments:**

- \`build()\` does not require arguments.

**Return value:**

Returns a string with the current QuestDB version and hash.

**Examples:**

\`\`\`questdb-sql
SELECT build();
\`\`\`

| build                                                                                              |
| -------------------------------------------------------------------------------------------------- |
| Build Information: QuestDB 7.3.5, JDK 17.0.7, Commit Hash 460b817b0a3705c5633619a8ef9efb5163f1569c |

## functions

**Arguments:**

- \`functions()\` does not require arguments.

**Return value:**

Returns all available database functions.

**Examples:**

\`\`\`questdb-sql
functions();
\`\`\`

| name | signature | signature_translated  | runtime_constant | type     |
| ---- | --------- | --------------------- | ---------------- | -------- |
| or   | or(TT)    | or(boolean, boolean)  | FALSE            | STANDARD |
| and  | and(TT)   | and(boolean, boolean) | FALSE            | STANDARD |
| not  | not(T)    | not(boolean)          | FALSE            | STANDARD |

## query_activity

**Arguments:**

- \`query_activity()\` does not require arguments.

**Return value:**

Returns metadata on running SQL queries, including columns such as:

- query_id - identifier of the query that can be used with
  [cancel query](/docs/reference/sql/cancel-query) command or
  [cancelQuery()](/docs/reference/sql/cancel-query) function
- worker_id - identifier of worker thread that initiated query processing. Note
  that many multithreaded queries also run on other workers
- worker_pool - name of worker pool used to execute the query
- username - name of user executing the query
- query_start - timestamp of when query started
- state_change - timestamp of latest query state change, such as a cancellation
- state - state of running query, can be \`active\` or \`cancelled\`
- query - text of sql query

**Examples:**

\`\`\`questdb-sql
SELECT * FROM query_activity();
\`\`\`

| query_id | worker_id | worker_pool | username | query_start                 | state_change                | state  | query                                                     |
| -------- | --------- | ----------- | -------- | --------------------------- | --------------------------- | ------ | --------------------------------------------------------- |
| 62179    | 5         | shared      | bob      | 2024-01-09T10:03:05.557397Z | 2024-01-09T10:03:05.557397  | active | select \\* from query_activity()                           |
| 57777    | 6         | shared      | bob      | 2024-01-09T08:58:55.988017Z | 2024-01-09T08:58:55.988017Z | active | SELECT symbol,approx_percentile(price, 50, 2) from trades |

## memory_metrics

**Arguments:**

- \`memory_metrics()\` does not require arguments.

**Return value:**

Returns granular memory metrics.

**Examples:**

\`\`\`questdb-sql
memory_metrics();
\`\`\`

| memory_tag     | bytes     |
| -------------- | --------- |
| TOTAL_USED     | 142624730 |
| RSS            | 328609792 |
| MMAP_DEFAULT   | 196728    |
| NATIVE_DEFAULT | 256       |
| MMAP_O3        | 0         |
| NATIVE_O3      | 96        |

## reader_pool

**Arguments:**

- \`reader_pool()\` does not require arguments.

**Return value:**

Returns information about the current state of the reader pool in QuestDB. The
reader pool is a cache of table readers that are kept open to speed up
subsequent reads from the same table. The returned information includes the
table name, the ID of the thread that currently owns the reader, the timestamp
of the last time the reader was accessed, and the current transaction ID with
which the reader is associated.

**Examples:**

\`\`\`questdb-sql
SELECT * FROM reader_pool();
\`\`\`

| table_name | owner_thread_id | last_access_timestamp       | current_txn |
| ---------- | --------------- | --------------------------- | ----------- |
| sensors    | null            | 2023-12-01T19:28:14.311703Z | 1           |

## writer_pool

**Arguments:**

- \`writer_pool()\` does not require arguments.

**Return value:**

Returns information about the current state of the writer pool in QuestDB. The
writer pool is a cache of table writers that are kept open to speed up
subsequent writes to the same table. The returned information includes the table
name, the ID of the thread that currently owns the writer, the timestamp of the
last time the writer was accessed, and the reason for the ownership.

**Examples:**

\`\`\`questdb-sql
SELECT * FROM writer_pool();
\`\`\`

| table_name                    | owner_thread_id | last_access_timestamp       | ownership_reason |
| ----------------------------- | --------------- | --------------------------- | ---------------- |
| sys.column_versions_purge_log | 1               | 2023-12-01T18:50:03.412468Z | QuestDB system   |
| telemetry_config              | 1               | 2023-12-01T18:50:03.470604Z | telemetryConfig  |
| telemetry                     | 1               | 2023-12-01T18:50:03.464501Z | telemetry        |
| sys.telemetry_wal             | 1               | 2023-12-01T18:50:03.467924Z | telemetry        |
| example_table                 | null            | 2023-12-01T20:33:33.270984Z | null             |

## current database, schema, or user

\`current_database()\`, \`current_schema()\`, and \`current_user()\` are standard SQL
functions that return information about the current database, schema, schemas,
and user, respectively.

\`\`\`questdb-sql
-- Get the current database
SELECT current_database();

-- Get the current schema
SELECT current_schema();

-- Get the current user
SELECT current_user();
\`\`\`

Each of these functions returns a single value, so you can use them in a SELECT
statement without any arguments.

## tables

\`tables()\` or \`all_tables()\` returns all tables and materialized views in the
database including table metadata.

**Arguments:**

- \`tables()\` does not require arguments.

**Return value:**

Returns a \`table\`.

**Examples:**

\`\`\`questdb-sql title="List all tables"
tables();
\`\`\`

| id  | table_name  | designatedTimestamp | partitionBy | maxUncommittedRows | o3MaxLag   | walEnabled | directoryName    | dedup | ttlValue | ttlUnit | matView |
| --- | ----------- | ------------------- | ----------- | ------------------ | ---------- | ---------- | ---------------- | ----- | -------- | ------- | ------- |
| 1   | my_table    | ts                  | DAY         | 500000             | 30000000 0 | false      | my_table         | false | 0        | HOUR    | false   |
| 2   | device_data | null                | NONE        | 10000              | 30000000   | false      | device_data      | false | 0        | HOUR    | false   |
| 3   | short_lived | null                | HOUR        | 10000              | 30000000   | false      | short_lived (->) | false | 1        | HOUR    | false   |

:::note

\`(->)\` means the table was created using the
[IN VOLUME](/docs/reference/sql/create-table/#table-target-volume) clause.

:::

\`\`\`questdb-sql title="All tables with a daily partitioning strategy"
tables() WHERE partitionBy = 'DAY';
\`\`\`

| id  | name     | designatedTimestamp | partitionBy | maxUncommittedRows | walEnabled | directoryName | dedup | ttlValue | ttlUnit | matView |
| --- | -------- | ------------------- | ----------- | ------------------ | ---------- | ------------- | ----- | -------- | ------- | ------- |
| 1   | my_table | ts                  | DAY         | 500000             | true       | my_table      | false | 0        | HOUR    | false   |

## table_storage

\`table_storage()\` - Returns information about the storage and structure of all
user tables and materialized views in the database.

Provides detailed storage information about all user tables and materialized
views within QuestDB. It returns one row per table, including information about
partitioning, row counts, and disk usage.

- The \`table_storage()\` function excludes system tables; it only lists
  user-created tables.
- The \`diskSize\` value represents the total size of all files associated with
  the table on disk, including data, index, and metadata files.
- The \`partitionBy\` column indicates the partitioning strategy used for the
  table. It can be \`NONE\` if the table is not partitioned.

**Return values:**

The function returns the following columns:

- \`tableName\` (\`string\`): The name of the table or materialized view.
- \`walEnabled\` (\`boolean\`): Indicates whether Write-Ahead Logging (WAL) is
  enabled for the table.
- \`partitionBy\` (\`string\`): The partitioning type of the table (e.g., NONE, DAY,
  MONTH, YEAR, etc.).
- \`partitionCount\` (\`long\`): The number of partitions the table has.
- \`rowCount\` (\`long\`): The total number of rows in the table.
- \`diskSize\` (\`long\`): The total disk space used by the table, in bytes.

**Examples:**

Retrieve storage information for all tables.

\`\`\`questdb-sql title="Checking our demo tables" demo
SELECT * FROM table_storage();
\`\`\`

- The query retrieves storage details for all tables in the database.
- The \`diskSize\` column shows the total disk space used by each table in bytes.

| tableName      | walEnabled | partitionBy | partitionCount | rowCount   | diskSize     |
| -------------- | ---------- | ----------- | -------------- | ---------- | ------------ |
| trips          | true       | MONTH       | 126            | 1634599313 | 261536158948 |
| AAPL_orderbook | true       | HOUR        | 16             | 3024878    | 2149403527   |
| weather        | false      | NONE        | 1              | 137627     | 9972598      |
| trades         | true       | DAY         | 954            | 1000848308 | 32764798760  |
| ethblocks_json | true       | DAY         | 3328           | 20688364   | 28311960478  |

<hr />

Filter tables with WAL enabled.

\`\`\`questdb-sql title="WAL only tables" demo
SELECT tableName, rowCount, diskSize
FROM table_storage()
WHERE walEnabled = true;
\`\`\`

| tableName      | rowCount   | diskSize     |
| -------------- | ---------- | ------------ |
| trips          | 1634599313 | 261536158948 |
| AAPL_orderbook | 3024878    | 2149403527   |
| trades         | 1000850255 | 32764804264  |
| ethblocks_json | 20688364   | 28311960478  |

<hr />

Show tables partitioned by \`HOUR\`.

\`\`\`questdb-sql title="Show tables partitioned by hour" demo
SELECT tableName, partitionCount, rowCount
FROM table_storage()
WHERE partitionBy = 'HOUR';
\`\`\`

## wal_tables

\`wal_tables()\` returns the WAL status for all
[WAL tables](/docs/concept/write-ahead-log/) or materialized views in the
database.

**Arguments:**

- \`wal_tables()\` does not require arguments.

**Return value:**

Returns a \`table\` including the following information:

- \`name\` - table or materialized view name
- \`suspended\` - suspended status flag
- \`writerTxn\` - the last committed transaction in TableWriter
- \`writerLagTxnCount\` - the number of transactions that are kept invisible when
  writing to the table; these transactions will be eventually moved to the table
  data and become visible for readers
- \`sequencerTxn\` - the last committed transaction in the sequencer

**Examples:**

\`\`\`questdb-sql title="List all tables"
wal_tables();
\`\`\`

| name        | suspended | writerTxn | writerLagTxnCount | sequencerTxn |
| ----------- | --------- | --------- | ----------------- | ------------ |
| sensor_wal  | false     | 2         | 1                 | 4            |
| weather_wal | false     | 3         | 0                 | 3            |
| test_wal    | true      | 7         | 1                 | 9            |

## table_columns

\`table_columns('tableName')\` returns the schema of a table or a materialized
view.

**Arguments:**

- \`tableName\` is the name of an existing table or materialized view as a string.

**Return value:**

Returns a \`table\` with the following columns:

- \`column\` - name of the available columns in the table
- \`type\` - type of the column
- \`indexed\` - if indexing is applied to this column
- \`indexBlockCapacity\` - how many row IDs to store in a single storage block on
  disk
- \`symbolCached\` - whether this \`symbol\` column is cached
- \`symbolCapacity\` - how many distinct values this column of \`symbol\` type is
  expected to have
- \`designated\` - if this is set as the designated timestamp column for this
  table
- \`upsertKey\` - if this column is a part of UPSERT KEYS list for table
  [deduplication](/docs/concept/deduplication)

For more details on the meaning and use of these values, see the
[CREATE TABLE](/docs/reference/sql/create-table/) documentation.

**Examples:**

\`\`\`questdb-sql title="Get all columns in a table"
table_columns('my_table');
\`\`\`

| column | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | designated | upsertKey |
| ------ | --------- | ------- | ------------------ | ------------ | -------------- | ---------- | --------- |
| symb   | SYMBOL    | true    | 1048576            | false        | 256            | false      | false     |
| price  | DOUBLE    | false   | 0                  | false        | 0              | false      | false     |
| ts     | TIMESTAMP | false   | 0                  | false        | 0              | true       | false     |
| s      | VARCHAR   | false   | 0                  | false        | 0              | false      | false     |

\`\`\`questdb-sql title="Get designated timestamp column"
SELECT column, type, designated FROM table_columns('my_table') WHERE designated = true;
\`\`\`

| column | type      | designated |
| ------ | --------- | ---------- |
| ts     | TIMESTAMP | true       |

\`\`\`questdb-sql title="Get the count of column types"
SELECT type, count() FROM table_columns('my_table');
\`\`\`

| type      | count |
| --------- | ----- |
| SYMBOL    | 1     |
| DOUBLE    | 1     |
| TIMESTAMP | 1     |
| VARCHAR   | 1     |

## table_partitions

\`table_partitions('tableName')\` returns information for the partitions of a
table or a materialized view with the option to filter the partitions.

**Arguments:**

- \`tableName\` is the name of an existing table or materialized view as a string.

**Return value:**

Returns a table with the following columns:

- \`index\` - _INTEGER_, index of the partition (_NaN_ when the partition is not
  attached)
- \`partitionBy\` - _STRING_, one of _NONE_, _HOUR_, _DAY_, _WEEK_, _MONTH_ and
  _YEAR_
- \`name\` - _STRING_, name of the partition, e.g. \`2023-03-14\`,
  \`2023-03-14.detached\`, \`2023-03-14.attachable\`
- \`minTimestamp\` - _LONG_, min timestamp of the partition (_NaN_ when the table
  is not partitioned)
- \`maxTimestamp\` - _LONG_, max timestamp of the partition (_NaN_ when the table
  is not partitioned)
- \`numRows\` - _LONG_, number of rows in the partition
- \`diskSize\` - _LONG_, size of the partition in bytes
- \`diskSizeHuman\` - _STRING_, size of the partition meant for humans to read
  (same output as function
  [size_pretty](/docs/reference/function/numeric/#size_pretty))
- \`readOnly\` - _BOOLEAN_, true if the partition is
  [attached via soft link](/docs/reference/sql/alter-table-attach-partition/#symbolic-links)
- \`active\` - _BOOLEAN_, true if the partition is the last partition, and whether
  we are writing to it (at least one record)
- \`attached\` - _BOOLEAN_, true if the partition is
  [attached](/docs/reference/sql/alter-table-attach-partition/)
- \`detached\` - _BOOLEAN_, true if the partition is
  [detached](/docs/reference/sql/alter-table-detach-partition/) (\`name\` of the
  partition will contain the \`.detached\` extension)
- \`attachable\` - _BOOLEAN_, true if the partition is detached and can be
  attached (\`name\` of the partition will contain the \`.attachable\` extension)

**Examples:**

\`\`\`questdb-sql title="Create table my_table"
CREATE TABLE my_table AS (
    SELECT
        rnd_symbol('EURO', 'USD', 'OTHER') symbol,
        rnd_double() * 50.0 price,
        rnd_double() * 20.0 amount,
        to_timestamp('2023-01-01', 'yyyy-MM-dd') + x * 6 * 3600 * 100000L timestamp
    FROM long_sequence(700)
), INDEX(symbol capacity 32) TIMESTAMP(timestamp) PARTITION BY WEEK;
\`\`\`

\`\`\`questdb-sql title="Get all partitions from my_table"
table_partitions('my_table');
\`\`\`

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | WEEK        | 2022-W52 | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 1     | WEEK        | 2023-W01 | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 2     | WEEK        | 2023-W02 | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

\`\`\`questdb-sql title="Get size of a table in disk"
SELECT size_pretty(sum(diskSize)) FROM table_partitions('my_table');
\`\`\`

| size_pretty |
| ----------- |
| 80.3 MB     |

\`\`\`questdb-sql title="Get active partition of a table"
SELECT * FROM table_partitions('my_table') WHERE active = true;
\`\`\`

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

## materialized_views

\`materialized_views()\` returns the list of all materialized views in the
database.

**Arguments:**

- \`materialized_views()\` does not require arguments.

**Return value:**

Returns a \`table\` including the following information:

- \`view_name\` - materialized view name
- \`refresh_type\` - refresh strategy type
- \`base_table_name\` - base table name
- \`last_refresh_start_timestamp\` - last time when an incremental refresh for the
  view was started
- \`last_refresh_finish_timestamp\` - last time when an incremental refresh for
  the view finished
- \`view_sql\` - query used to populate view data
- \`view_table_dir_name\` - view directory name
- \`invalidation_reason\` - message explaining why the view was marked as invalid
- \`view_status\` - view status: 'valid', 'refreshing', or 'invalid'
- \`refresh_base_table_txn\` - the last base table transaction used to refresh the
  materialized view
- \`base_table_txn\` - the last committed transaction in the base table
- \`refresh_limit_value\` - how many units back in time the refresh limit goes
- \`refresh_limit_unit\` - how long each unit is
- \`timer_start\` - start date for the scheduled refresh timer
- \`timer_interval_value\` - how many interval units between each refresh
- \`timer_interval_unit\` - how long each unit is

**Examples:**

\`\`\`questdb-sql title="List all materialized views"
materialized_views();
\`\`\`

| view_name        | refresh_type | base_table_name | last_refresh_start_timestamp | last_refresh_finish_timestamp | view_sql                                                                                                                                                     | view_table_dir_name | invalidation_reason | view_status | refresh_base_table_txn | base_table_txn | refresh_limit_value | refresh_limit_unit | timer_start | timer_interval_value | timer_interval_unit |
|------------------|--------------|-----------------|------------------------------|-------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------|---------------------|-------------|------------------------|----------------|---------------------|--------------------|-------------|----------------------|---------------------|
| trades_OHLC_15m  | immediate   | trades          | 2025-05-30T16:40:37.562421Z  | 2025-05-30T16:40:37.568800Z   | SELECT timestamp, symbol, first(price) AS open, max(price) as high, min(price) as low, last(price) AS close, sum(amount) AS volume FROM trades SAMPLE BY 15m | trades_OHLC_15m~27  | null                | valid       | 55141609               | 55141609       | 0                   | null               | null        | 0                    | null                |
| trades_latest_1d | immediate   | trades          | 2025-05-30T16:40:37.554274Z  | 2025-05-30T16:40:37.562049Z   | SELECT timestamp, symbol, side, last(price) AS price, last(amount) AS amount, last(timestamp) as latest FROM trades SAMPLE BY 1d                             | trades_latest_1d~28 | null                | valid       | 55141609               | 55141609       | 0                   | null               | null        | 0                    | null                |


## version/pg_catalog.version

\`version()\` or \`pg_catalog.version()\` returns the supported version of the
PostgreSQL Wire Protocol.

**Arguments:**

- \`version()\` or \`pg_catalog.version()\` does not require arguments.

**Return value:**

Returns \`string\`.

**Examples:**

\`\`\`questdb-sql
SELECT version();

--The above equals to:

SELECT pg_catalog.version();
\`\`\`

| version                                                             |
| ------------------------------------------------------------------- |
| PostgreSQL 12.3, compiled by Visual C++ build 1914, 64-bit, QuestDB |

## hydrate_table_metadata('table1', 'table2' ...)

\`hydrate_table_metadata' re-reads table metadata from disk to update the static
metadata cache.

:::warning

This function should only be used when directed by QuestDB support. Misuse could
cause corruption of the metadata cache, requiring the database to be restarted.

:::

**Arguments:**

A variable list of strings, corresponding to table names.

Alternatively, a single asterisk, '\\*', representing all tables.

**Return value:**

Returns \`boolean\`. \`true\` if successful, \`false\` if unsuccessful.

**Examples:**

Simply pass table names as arguments to the function.

\`\`\`
SELECT hydrate_table_metadata('trades', 'trips');
\`\`\`

| hydrate_table_metadata |
| ---------------------- |
| true                   |

If you want to re-read metadata for all user tables, simply use an asterisk:

\`\`\`
SELECT hydrate_table_metadata('*');
\`\`\`

## flush_query_cache()

\`flush_query_cache' invalidates cached query execution plans.

**Arguments:**

- \`flush_query_cache()\` does not require arguments.

**Return value:**

Returns \`boolean\`. \`true\` if successful, \`false\` if unsuccessful.

**Examples:**

\`\`\`questdb-sql title="Flush cached query execution plans"
SELECT flush_query_cache();
\`\`\`

## reload_config()

\`reload_config' reloads server configuration file's contents (\`server.conf\`)
without server restart. The list of reloadable settings can be found
[here](/docs/configuration/#reloadable-settings).

**Arguments:**

- \`reload_config()\` does not require arguments.

**Return value:**

Returns \`boolean\`. \`true\` if any configuration properties were reloaded, \`false\`
if none were reloaded.

**Examples:**

Edit \`server.conf\` and run \`reload_config\`:

\`\`\`questdb-sql title="Reload server configuration"
SELECT reload_config();
\`\`\`
`
  },
  {
    path: "function/numeric.md",
    title: "Numeric functions",
    headers: ["abs", "ceil / ceiling", "exp", "floor", "greatest", "least", "ln", "log", "power", "round", "round_down", "round_half_even", "round_up", "sign", "size_pretty", "sqrt"],
    content: `This page describes the available functions to assist with performing numeric
calculations.

## abs

\`abs(value)\` return the absolute value. The behavior of \`abs\` is as follows:

- When the input \`value\` is positive, \`abs\` returns \`value\`
- When the input \`value\` is negative, \`abs\` returns \`- value\`
- When the input \`value\` is \`0\`, \`abs\` returns \`0\`

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is the same as the type of the argument.

**Examples:**

\`\`\`questdb-sql
SELECT
    x - 2 a,
    abs(x -2)
FROM long_sequence(3);
\`\`\`

| a   | abs |
| --- | --- |
| -1  | 1   |
| 0   | 0   |
| 1   | 1   |

## ceil / ceiling

\`ceil(value)\` or \`ceiling()\` returns the smallest integer greater than, or equal
to, a specified numeric expression.

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT ceil(15.75) as RoundedUp;
\`\`\`

| RoundedUp |
| --------- |
| 16        |

## exp

\`exp()\` returns the exponential value of a specified numeric expression.

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT exp(2) as Exponent;
\`\`\`

| Exponent      |
| ------------- |
| 7.38905609893 |

## floor

\`floor()\` returns the largest integer less than or equal to a specified numeric
expression.

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT floor(15.75) as RoundedDown;
\`\`\`

| RoundedUp |
| --------- |
| 15        |


## greatest

\`greatest(args...)\` returns the largest entry in a series of numbers. 

\`null\` will be returned only if all of the arguments are \`null\`.

**Arguments:**

- \`args...\` is a variable-size list of \`long\` or \`double\` values.

**Return value:**

Return value type is \`double\` or \`long\`.

**Examples:**

\`\`\`questdb-sql
SELECT greatest(11, 3, 8, 15)
\`\`\`

| greatest |
|----------|
| 15       |



## least

\`least(args...)\` returns the smallest entry in a series of numbers.


\`null\` will be returned only if all of the arguments are \`null\`.

**Arguments:**

- \`args...\` is a variable-size list of \`long\` or \`double\` values.

**Return value:**

Return value type is \`double\` or \`long\`.

**Examples:**

\`\`\`questdb-sql
SELECT least(11, 3, 8, 15)
\`\`\`

| least |
|-------|
| 3     |


## ln

\`ln(value)\` return the natural logarithm (**log*e***) of a given number.

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT ln(4.123)
\`\`\`

| ln             |
| -------------- |
| 1.416581053724 |


## log

\`log(value)\` return the base 10 logarithm of a given number.

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT log(100)
\`\`\`

| log          |
| ------------ |
|            2 |

:::note
Some databases use \`LOG\` to refer to the natural logarithm and \`LOG10\` for the base 10 logarithm. QuestDB follows PostgreSQL conventions and uses \`LOG\` for base 10 and \`LN\` for natural logarithm.
:::


## power

\`power(base, exponent)\` returns the value of a number \`base\` raised to the power
defined by \`exponent\`.

**Arguments:**

- \`base\` is any numeric value.
- \`exponent\` is any numeric value.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT power(2, 3);
\`\`\`

| power |
| ----- |
| 8     |

## round

\`round(value, scale)\` returns the **closest** value in the specified scale. It
uses the "half up" tie-breaking method when the value is exactly halfway between
the \`round_up\` and \`round_down\` values.

\`round(value)\` is equivalent to \`round(value, 0)\`.

**Arguments:**

- \`value\` is any numeric value.
- \`scale\` is the number of decimal points returned. A negative scale means the
  rounding will occur to a digit to the left of the decimal point. For example,
  -1 means the number will be rounded to the nearest tens and +1 to the nearest
  tenths.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT
    d,
    round(d, -2),
    round(d, -1),
    round(d,0),
    round(d,1),
    round(d,2)
FROM dbl;
\`\`\`

| d            | round-2 | round-1 | round0 | round1 | round2  |
| ------------ | ------- | ------- | ------ | ------ | ------- |
| -0.811905406 | 0       | 0       | -1     | -0.8   | -0.81   |
| -5.002768547 | 0       | -10     | -5     | -5     | -5      |
| -64.75487334 | -100    | -60     | -65    | -64.8  | -64.75  |
| -926.531695  | -900    | -930    | -927   | -926.5 | -926.53 |
| 0.069361448  | 0       | 0       | 0      | 0.1    | 0.07    |
| 4.003627053  | 0       | 0       | 4      | 4      | 4       |
| 86.91359825  | 100     | 90      | 87     | 86.9   | 86.91   |
| 376.3807766  | 400     | 380     | 376    | 376.4  | 376.38  |

## round_down

\`round_down(value, scale)\` - rounds a value down to the specified scale

**Arguments:**

- \`value\` is any numeric value.
- \`scale\` is the number of decimal points returned. A negative scale means the
  rounding will occur to a digit to the left of the decimal point. For example,
  -1 means the number will be rounded to the nearest tens and +1 to the nearest
  tenths.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT
    d,
    round_down(d, -2),
    round_down(d, -1),
    round_down(d,0),
    round_down(d,1),
    round_down(d,2)
FROM dbl;
\`\`\`

| d            | r_down-2 | r_down-1 | r_down0 | r_down1 | r_down2 |
| ------------ | -------- | -------- | ------- | ------- | ------- |
| -0.811905406 | 0        | 0        | 0       | -0.8    | -0.81   |
| -5.002768547 | 0        | 0        | -5      | -5      | -5      |
| -64.75487334 | 0        | -60      | -64     | -64.7   | -64.75  |
| -926.531695  | -900     | -920     | -926    | -926.5  | -926.53 |
| 0.069361448  | 0        | 0        | 0       | 0       | 0.06    |
| 4.003627053  | 0        | 0        | 4       | 4       | 4       |
| 86.91359825  | 0        | 80       | 86      | 86.9    | 86.91   |
| 376.3807766  | 400      | 370      | 376     | 376.3   | 376.38  |

## round_half_even

\`round_half_even(value, scale)\` - returns the **closest** value in the specified
scale. It uses the "half up" tie-breaking method when the value is exactly
halfway between the \`round_up\` and \`round_down\` values.

**Arguments:**

- \`value\` is any numeric value.
- \`scale\` is the number of decimal points returned. A negative scale means the
  rounding will occur to a digit to the left of the decimal point. For example,
  -1 means the number will be rounded to the nearest tens and +1 to the nearest
  tenths.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql title="Tie-breaker behavior"
SELECT
    round_half_even(5.55, 1),
    round_half_even(5.65, 1)
FROM long_sequence(1);
\`\`\`

| round_half_even | round_half_even |
| --------------- | --------------- |
| 5.6             | 5.6             |

\`\`\`questdb-sql title="More examples"
SELECT
    d,
    round_half_even(d, -2),
    round_half_even(d, -1),
    round_half_even(d,0),
    round_half_even(d,1),
    round_half_even(d,2)
FROM dbl;
\`\`\`

| d            | r_h_e-2 | r_h_e-1 | r_h_e0 | r_h_e1 | r_h_e2  |
| ------------ | ------- | ------- | ------ | ------ | ------- |
| -0.811905406 | 0       | 0       | -1     | -0.8   | -0.81   |
| -5.002768547 | 0       | 0       | -5     | -5     | -5      |
| -64.75487334 | -100    | -60     | -65    | -64.8  | -64.75  |
| -926.531695  | -900    | -930    | -927   | -926.5 | -926.53 |
| 0.069361448  | 0       | 0       | 0      | 0.1    | 0.07    |
| 4.003627053  | 0       | 0       | 4      | 4      | 4       |
| 86.91359825  | 100     | 90      | 87     | 86.9   | 86.91   |
| 376.3807766  | 400     | 380     | 376    | 376.4  | 376.38  |

## round_up

\`round_up(value, scale)\` - rounds a value up to the specified scale

**Arguments:**

- \`value\` is any numeric value.
- \`scale\` is the number of decimal points returned. A negative scale means the
  rounding will occur to a digit to the left of the decimal point. For example,
  -1 means the number will be rounded to the nearest tens and +1 to the nearest
  tenths.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT
    d,
    round_up(d, -2),
    round_up(d, -1),
    round_up(d,0),
    round_up(d,1),
    round_up(d,2)
FROM dbl;
\`\`\`

| d            | r_up-2 | r_up-1 | r_up0 | r_up1  | r_up2   |
| ------------ | ------ | ------ | ----- | ------ | ------- |
| -0.811905406 | -100   | -10    | -1    | -0.9   | -0.82   |
| -5.002768547 | -100   | -10    | -6    | -5.1   | -5.01   |
| -64.75487334 | -100   | -70    | -65   | -64.8  | -64.76  |
| -926.531695  | -1000  | -930   | -927  | -926.6 | -926.54 |
| 0.069361448  | 100    | 10     | 1     | 0.1    | 0.07    |
| 4.003627053  | 100    | 10     | 5     | 4.1    | 4.01    |
| 86.91359825  | 100    | 90     | 87    | 87     | 86.92   |
| 376.3807766  | 400    | 380    | 377   | 376.4  | 376.39  |

## sign

\`sign(value)\` returns sign of the argument, that is:
- -1 for negative value
-  0 for zero
- +1 for positive value

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is the same as argument's.

**Examples:**

\`\`\`questdb-sql
SELECT x-3 arg, sign(x-3) from long_sequence(5)
\`\`\`

| arg | sign |
|-----|------|
| -2  | -1   |
| -1  | -1   |
| 0   | 0    |
| 1   | 1    |
| 2   | 1    |

## size_pretty

\`size_pretty(value)\` returns a human-readable string equivalent to the input
value.

**Arguments:**

- \`value\` is a \`long\` value that represents size in bytes.

**Return value:**

Return value type is \`string\`. The string contains the size as a floating point
with one significant figure followed by the scale
[in base 1024](https://en.wikipedia.org/wiki/Byte#Multiple-byte_units).

**Examples:**

\`\`\`questdb-sql
SELECT size_pretty(400032);
\`\`\`

| size_pretty |
| ----------- |
| 390.7 KiB   |

## sqrt

\`sqrt(value)\` return the square root of a given number.

**Arguments:**

- \`value\` is any numeric value.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql
SELECT sqrt(4000.32)
\`\`\`

| log              |
| ---------------- |
| 63.2480829749013 |
`
  },
  {
    path: "function/parquet.md",
    title: "Parquet functions",
    headers: ["read_parquet"],
    content: `This page introduces the [Apache Parquet](/glossary/apache-parquet/) read function.

:::info

Apache Parquet support is in **beta**. It may not be fit for production use.

Please let us know if you run into issues. Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

:::

## read_parquet

Reads a parquet file as a table.

\`read_parquet(parquet_file_path)\`

### Usage

With this function, query a Parquet file located at the QuestDB copy root directory. Both relative and absolute file
paths are supported.

\`\`\`questdb-sql title="read_parquet example"
SELECT
  *
FROM
  read_parquet('trades.parquet')
WHERE
  side = 'buy'
LIMIT 1;
\`\`\`

| symbol  | side | price   | amount     | timestamp                   |
|---------|------|---------|:-----------|-----------------------------|
| BTC-USD | buy  | 62755.6 | 0.00043367 | 2024-07-01T00:46:39.754075Z |

The query above:

- Reads all columns from the file \`trades.parquet\` located at the server copy root directory, 
  i.e. \`import/trades.parquet\` in the QuestDB copy root directory by default.
- Filters rows, keeping only the first row where the \`side\` column equals \`buy\`.

### Configuration

For security reason, reading is only allowed from a specified directory. It defaults to the \`import\` directory
inside the QuestDB copy root directory. To change the allowed directory, set the \`cairo.sql.copy.root\` 
configuration by using one of the following settings:
  - The environment variable \`QDB_CAIRO_SQL_COPY_ROOT\`.
  - The \`cairo.sql.copy.root\` key in \`server.conf\`.

### Limitations

Parquet format support rich set of data types, including structural types. QuestDB only can read data types that match
QuestDB data types:

- Varchar
- Int
- Long
- Short
- Byte
- Boolean
- UUID
- Double
- Float
- Timestamp
- Binary

Parquet columns with unsupported data types are ignored.

Multiple files are not suppored, only a single file.

Nested data and/or arrays are not supported.
`
  },
  {
    path: "function/pattern-matching.md",
    title: "Pattern matching operators",
    headers: ["~ (match) and !~ (does not match)", "LIKE/ILIKE", "regexp_replace"],
    content: `This page describes the available operators to assist with performing pattern
matching. For operators using regular expressions (\`regex\` in the syntax),
QuestDB uses
[Java regular expression implementation](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html).

:::note VARCHAR and STRING data types

QuestDB supports two types of string data: \`VARCHAR\` and \`STRING\`. Most users
should use \`VARCHAR\` as it is more efficient. See
[VARCHAR vs STRING](/docs/reference/sql/datatypes#varchar-and-string-considerations)
for more information.

Functions described in this page work with both types.

:::

## ~ (match) and !~ (does not match)

- \`(string) ~ (regex)\` - returns true if the \`string\` value matches a regular
  expression, \`regex\`, otherwise returns false (case sensitive match).
- \`(string) !~ (regex)\` - returns true if the \`string\` value fails to match a
  regular expression, \`regex\`, otherwise returns false (case sensitive match).

### Arguments

- \`string\` is an expression that evaluates to the \`string\` data type.
- \`regex\` is any regular expression pattern.

### Return value

Return value type is \`boolean\`.

## LIKE/ILIKE

- \`(string) LIKE (pattern)\` - returns true if the \`string\` value matches
  \`pattern\`, otherwise returns false (case sensitive match).
- \`(string) ILIKE (pattern)\` - returns true if the \`string\` value matches
  \`pattern\`, otherwise returns false (case insensitive match).

### Arguments

- \`string\` is an expression that evaluates to the \`string\` data type.
- \`pattern\` is a pattern which can contain wildcards like \`_\` and \`%\`.

### Return value

Return value type is \`boolean\`.

### Description

If the pattern doesn't contain wildcards, then the pattern represents the string
itself.

The wildcards which can be used in pattern are interpreted as follows:

- \`_\` - matches any single character.
- \`%\` - matches any sequence of zero or more characters.

Wildcards can be used as follows:

\`\`\`questdb-sql
SELECT 'quest' LIKE 'quest' ;
-- Returns true
SELECT 'quest' LIKE 'ques_';
-- Returns true
SELECT 'quest' LIKE 'que%';
-- Returns true
SELECT 'quest' LIKE '_ues_';
-- Returns true
SELECT 'quest' LIKE 'q_'
-- Returns false
\`\`\`

\`ILIKE\` performs a case insensitive match as follows:

\`\`\`questdb-sql
SELECT 'quest' ILIKE 'QUEST';
-- Returns true
SELECT 'qUeSt' ILIKE 'QUEST';
-- Returns true
SELECT 'quest' ILIKE 'QUE%';
-- Returns true
SELECT 'QUEST' ILIKE '_ues_';
-- Returns true
\`\`\`

### Examples

#### LIKE

\`\`\`questdb-sql
SELECT * FROM trades
WHERE symbol LIKE '%-USD'
LATEST ON timestamp PARTITION BY symbol;
\`\`\`

| symbol  | side | price    | amount     | timestamp                   |
| ------- | ---- | -------- | ---------- | --------------------------- |
| ETH-USD | sell | 1348.13  | 3.22455108 | 2022-10-04T15:25:58.834362Z |
| BTC-USD | sell | 20082.08 | 0.16591219 | 2022-10-04T15:25:59.742552Z |

#### ILIKE

\`\`\`questdb-sql
SELECT * FROM trades
WHERE symbol ILIKE '%-usd'
LATEST ON timestamp PARTITION BY symbol;
\`\`\`

| symbol  | side | price    | amount     | timestamp                   |
| ------- | ---- | -------- | ---------- | --------------------------- |
| ETH-USD | sell | 1348.13  | 3.22455108 | 2022-10-04T15:25:58.834362Z |
| BTC-USD | sell | 20082.08 | 0.16591219 | 2022-10-04T15:25:59.742552Z |

## regexp_replace

\`regexp_replace (string1, regex , string2 )\` - provides substitution of new text
for substrings that match regular expression patterns.

### Arguments:

- \`string1\` is a source \`string\` value to be manipulated.
- \`regex\` is a regular expression pattern.
- \`string2\` is any \`string\` value to replace part or the whole of the source
  value.

### Return value

Return value type is \`string\`. The source string is returned unchanged if there
is no match to the pattern. If there is a match, the source string is returned
with the replacement string substituted for the matching substring.

### Examples:

\`\`\`questdb-sql title="Example description -  regexp_replace"
SELECT regexp_replace('MYSQL is a great database', '^(\\S*)', 'QuestDB');
\`\`\`

\`\`\`
QuestDB is a great database
\`\`\`
`
  },
  {
    path: "function/random-value-generator.md",
    title: "Random value generator",
    headers: ["Usage", "Generating sequences", "rnd_boolean", "rnd_byte", "rnd_short", "rnd_int", "rnd_long", "rnd_long256", "rnd_float", "rnd_double", "rnd_date()", "rnd_timestamp()", "rnd_char", "rnd_symbol", "rnd_varchar", "rnd_str", "rnd_bin", "rnd_uuid4", "rnd_ipv4()", "rnd_ipv4(string, int)", "rnd_double_array()"],
    content: `The following functions have been created to help with our test suite. They are
also useful for users testing QuestDB on specific workloads in order to quickly
generate large test datasets that mimic the structure of their actual data.

Values can be generated either:

- Pseudo randomly
- [Deterministically](/docs/reference/function/row-generator/#long_sequence)
  when specifying a \`seed\`

QuestDB supports the following random generation functions:

- [rnd_boolean](#rnd_boolean)
- [rnd_byte](#rnd_byte)
- [rnd_short](#rnd_short)
- [rnd_int](#rnd_int)
- [rnd_long](#rnd_long)
- [rnd_long256](#rnd_long256)
- [rnd_float](#rnd_float)
- [rnd_double](#rnd_double)
- [rnd_date](#rnd_date)
- [rnd_timestamp](#rnd_timestamp)
- [rnd_char](#rnd_char)
- [rnd_symbol](#rnd_symbol)
- [rnd_varchar](#rnd_varchar)
- [rnd_str](#rnd_str)
- [rnd_bin](#rnd_bin)
- [rnd_uuid4](#rnd_uuid4)
- [rnd_ipv4](#rnd_ipv4)
- [rnd_double_array](#rnd_double_array)

## Usage

Random functions should be used for populating test tables only. They do not
hold values in memory and calculations should not be performed at the same time
as the random numbers are generated.

For example, running
\`SELECT round(a,2), a FROM (SELECT rnd_double() a FROM long_sequence(10));\` is
bad practice and will return inconsistent results.

A better approach would be to populate a table and then run the query. So for
example

1. **create** - \`CREATE TABLE test(val double);\`
2. **populate** -
   \`INSERT INTO test SELECT * FROM (SELECT rnd_double() FROM long_sequence(10));\`
3. **query** - \`SELECT round(val,2) FROM test;\`

## Generating sequences

This page describes the functions to generate values. To generate sequences of
values, please refer the page about
[row generators](/docs/reference/function/row-generator/).

## rnd_boolean

\`rnd_boolean()\` - generates a random \`boolean\` value, either \`true\` or \`false\`,
both having equal probability.

**Return value:**

Return value type is \`boolean\`.

**Examples:**

\`\`\`questdb-sql title="Random boolean"
SELECT
    value a,
    count() b
FROM (SELECT rnd_boolean() value FROM long_sequence(100));
\`\`\`

| a     | b   |
| ----- | --- |
| true  | 47  |
| false | 53  |

## rnd_byte

- \`rnd_byte()\` - returns a random integer which can take any value between \`0\`
  and \`127\`.
- \`rnd_byte(min, max)\` - generates byte values in a specific range (for example
  only positive, or between 1 and 10).

**Arguments:**

- \`min\`: is a \`byte\` representing the lowest possible generated value
  (inclusive).
- \`max\`: is a \`byte\` representing the highest possible generated value
  (inclusive).

**Return value:**

Return value type is \`byte\`.

**Examples:**

\`\`\`questdb-sql title="Random byte"
SELECT rnd_byte() FROM long_sequence(5);
SELECT rnd_byte(-1,1) FROM long_sequence(5);
\`\`\`

\`\`\`
122,34,17,83,24
0,1,-1,-1,0
\`\`\`

## rnd_short

- \`rnd_short()\` - returns a random integer which can take any value between
  \`-32768\` and \`32767\`.
- \`rnd_short(min, max)\` - returns short values in a specific range (for example
  only positive, or between 1 and 10). Supplying \`min\` above \`max\` will result
  in an \`invalid range\` error.

**Arguments:**

- \`min\`: is a \`short\` representing the lowest possible generated value
  (inclusive).
- \`max\`: is a \`short\` representing the highest possible generated value
  (inclusive).

**Return value:**

Return value type is \`short\`.

**Examples:**

\`\`\`questdb-sql title="Random short"
SELECT rnd_short() FROM long_sequence(5);
SELECT rnd_short(-1,1) FROM long_sequence(5);
\`\`\`

\`\`\`
-27434,234,-12977,8843,24
0,1,-1,-1,0
\`\`\`

## rnd_int

- \`rnd_int()\` is used to return a random integer which can take any value
  between \`-2147483648\` and \`2147483647\`.
- \`rnd_int(min, max, nanRate)\` is used to generate int values in a specific
  range (for example only positive, or between 1 and 10), or to get occasional
  \`NaN\` values along with int values.

**Arguments:**

- \`min\`: is an \`int\` representing the lowest possible generated value
  (inclusive).
- \`max\`: is an \`int\` representing the highest possible generated value
  (inclusive).
- \`nanRate\` is an \`int\` defining the frequency of occurrence of \`NaN\` values:
  - \`0\`: No \`NaN\` will be returned.
  - \`1\`: Will only return \`NaN\`.
  - \`N > 1\`: On average, one in N generated values will be NaN.

**Return value:**

Return value type is \`int\`.

**Examples:**

\`\`\`questdb-sql title="Random int"
SELECT rnd_int() FROM long_sequence(5)
SELECT rnd_int(1,4,0) FROM long_sequence(5);
SELECT rnd_int(1,4,1) FROM long_sequence(5);
SELECT rnd_int(1,4,2) FROM long_sequence(5);
\`\`\`

\`\`\`
1822685476, 1173192835, -2808202361, 78121757821, 44934191
1,4,3,1,2
null,null,null,null,null
1,null,4,null,2
\`\`\`

## rnd_long

- \`rnd_long()\` is used to return a random signed integer between
  \`0x8000000000000000L\` and \`0x7fffffffffffffffL\`.
- \`rnd_long(min, max, nanRate)\` is used to generate long values in a specific
  range (for example only positive, or between 1 and 10), or to get occasional
  \`NaN\` values along with int values.

**Arguments:**

- \`min\`: is a \`long\` representing the lowest possible generated value
  (inclusive).
- \`max\`: is a \`long\` representing the highest possible generated value
  (inclusive).
- \`nanRate\` is an \`int\` defining the frequency of occurrence of \`NaN\` values:
  - \`0\`: No \`NaN\` will be returned.
  - \`1\`: Will only return \`NaN\`.
  - \`N > 1\`: On average, one in N generated values will be \`NaN\`.

**Return value:**

Return value type is \`long\`.

**Examples:**

\`\`\`questdb-sql title="Random long"
SELECT rnd_long() FROM long_sequence(5);
SELECT rnd_long(1,4,0) FROM long_sequence(5);
SELECT rnd_long(1,4,1) FROM long_sequence(5);
SELECT rnd_long(-10000000,10000000,2) FROM long_sequence(5);
\`\`\`

\`\`\`questdb-sql
1,4,3,1,2
null,null,null,null,null
-164567594, -323331140, 26846334, -892982893, -351053301
300291810703592700, 2787990010234796000, 4305203476273459700, -8518907563589124000, 8443756723558216000
\`\`\`

## rnd_long256

- \`rnd_long256()\` - generates a random \`long256\` value between 0 and 2^256.

**Return value:**

Return value type is \`long256\`.

**Examples:**

\`\`\`questdb-sql title="Random long256"
SELECT rnd_long256() FROM long_sequence(5);
\`\`\`

\`\`\`
0x5dd94b8492b4be20632d0236ddb8f47c91efc2568b4d452847b4a645dbe4871a,
0x55f256188b3474aca83ccc82c597668bb84f36d3f5b25afd9e194c1867625918,
0x630c6f02c1c2e0c2aa4ac80ab684aa36d91dd5233cc185bb7097400fa12e7de0,
0xa9eeaa5268f911f4bcac2e89b621bd28bba90582077fc9fb9f14a53fcf6368b7,
0x7c80546eea2ec093a5244e39efad3f39c5489d2337007fd0b61d8b141058724d
\`\`\`

## rnd_float

- \`rnd_float()\` - generates a random **positive** \`float\` between 0 and 1.
- \`rnd_float(nanRate)\` - generates a random **positive** \`float\` between 0 and 1
  which will be \`NaN\` at a frequency defined by \`nanRate\`.

**Arguments:**

- \`nanRate\` is an \`int\` defining the frequency of occurrence of \`NaN\` values:
- \`0\`: No \`NaN\` will be returned.
- \`1\`: Will only return \`NaN\`.
- \`N > 1\`: On average, one in N generated values will be \`NaN\`.

**Return value:**

Return value type is \`float\`.

**Examples:**

\`\`\`questdb-sql title="Random float"
SELECT rnd_float() FROM long_sequence(5);
SELECT rnd_float(2) FROM long_sequence(6);
\`\`\`

\`\`\`
0.3821478, 0.5162148, 0.22929084, 0.03736937, 0.39675003
0.08108246, 0.7082644, null, 0.6784522, null, 0.5711276
\`\`\`

## rnd_double

- \`rnd_double()\` - generates a random **positive** \`double\` between 0 and 1.
- \`rnd_double(nanRate)\` - generates a random **positive** \`double\` between 0 and
  1 which will be \`NaN\` at a frequency defined by \`nanRate\`.

**Arguments:**

- \`nanRate\` is an \`int\` defining the frequency of occurrence of \`NaN\` values:
- \`0\`: No \`NaN\` will be returned.
- \`1\`: Will only return \`NaN\`.
- \`N > 1\`: On average, one in N generated values will be \`NaN\`.

**Return value:**

Return value type is \`double\`.

**Examples:**

\`\`\`questdb-sql title="Random double"
SELECT rnd_double() FROM long_sequence(5);
SELECT rnd_double(2) FROM long_sequence(5);
\`\`\`

\`\`\`
0.99115364871, 0.31011470271, 0.10776479191, 0.53938281731, 0.89820403511
0.99115364871, null, null, 0.53938281731, 0.89820403511
\`\`\`

## rnd_date()

- \`rnd_date()\` generates a random date between \`start\` and \`end\` dates (both
  inclusive). IT will also generate \`NaN\` values at a frequency defined by
  \`nanRate\`. When \`start\` or \`end\` are invalid dates, or when \`start\` is
  superior to \`end\`, it will return \`invalid range\` error. When \`nanRate\` is
  inferior to 0, it will return \`invalid NAN rate\` error.

**Arguments:**

- \`start\` is a \`date\` defining the minimum possible generated date (inclusive)
- \`end\` is a \`date\` defining the maximum possible generated date (inclusive)
- \`nanRate\` defines the frequency of occurrence of \`NaN\` values:
  - \`0\`: No \`NaN\` will be returned.
  - \`1\`: Will only return \`NaN\`.
  - \`N > 1\`: On average, one in N generated values will be NaN.

**Return value:**

Return value type is \`date\`.

**Examples:**

\`\`\`questdb-sql title="Random date"
SELECT rnd_date(
    to_date('2015', 'yyyy'),
    to_date('2016', 'yyyy'),
    0)
FROM long_sequence(5);
\`\`\`

\`\`\`questdb-sql
2015-01-29T18:00:17.402Z, 2015-11-15T20:22:14.112Z,
2015-12-08T09:26:04.483Z, 2015-05-28T02:22:47.022Z,
2015-10-13T19:16:37.034Z
\`\`\`

## rnd_timestamp()

- \`rnd_timestamp(start, end, nanRate)\` generates a random timestamp between
  \`start\` and \`end\` timestamps (both inclusive). It will also generate \`NaN\`
  values at a frequency defined by \`nanRate\`. When \`start\` or \`end\` are invalid
  timestamps, or when \`start\` is superior to \`end\`, it will return
  \`invalid range\` error. When \`nanRate\` is inferior to 0, it will return
  \`invalid NAN rate\` error.

**Arguments:**

- \`start\` is a \`timestamp\` defining the minimum possible generated timestamp
  (inclusive)
- \`end\` is a \`timestamp\` defining the maximum possible generated timestamp
  (inclusive)
- \`nanRate\` defines the frequency of occurrence of \`NaN\` values:
  - \`0\`: No \`NaN\` will be returned.
  - \`1\`: Will only return \`NaN\`.
  - \`N > 1\`: On average, one in N generated values will be NaN.

**Return value:**

Return value type is \`timestamp\`.

**Examples:**

\`\`\`questdb-sql title="Random timestamp"
SELECT rnd_timestamp(
    to_timestamp('2015', 'yyyy'),
    to_timestamp('2016', 'yyyy'),
    0)
FROM long_sequence(5);
\`\`\`

\`\`\`questdb-sql
2015-01-29T18:00:17.402762Z, 2015-11-15T20:22:14.112744Z,
2015-12-08T09:26:04.483039Z, 2015-05-28T02:22:47.022680Z,
2015-10-13T19:16:37.034203Z
\`\`\`

#### Sequences

To generate increasing timestamps, please refer the page about
[row generators](/docs/reference/function/row-generator/).

## rnd_char

- \`rnd_char()\` is used to generate a random \`char\` which will be an uppercase
  character from the 26-letter A to Z alphabet. Letters from A to Z will be
  generated with equal probability.

**Return value:**

Return value type is \`char\`.

**Examples:**

\`\`\`questdb-sql title="Random char"
SELECT rnd_char() FROM long_sequence(5);
\`\`\`

\`\`\`
G, P, E, W, K
\`\`\`

## rnd_symbol

- \`rnd_symbol(symbolList)\` is used to choose a random \`symbol\` from a list
  defined by the user. It is useful when looking to generate specific symbols
  from a finite list (e.g \`BUY, SELL\` or \`AUTUMN, WINTER, SPRING, SUMMER\`.
  Symbols are randomly chosen from the list with equal probability. When only
  one symbol is provided in the list, this symbol will be chosen with 100%
  probability, in which case it is more efficient to use
  \`cast('your_symbol' as symbol\`
- \`rnd_symbol(list_size, minLength, maxLength, nullRate)\` generated a finite
  list of distinct random symbols and chooses one symbol from the list at
  random. The finite list is of size \`list_size\`. The generated symbols length
  is between \`minLength\` and \`maxLength\` (both inclusive). The function will
  also generate \`null\` values at a rate defined by \`nullRate\`.

**Arguments:**

- \`symbolList\` is a variable-length list of possible \`symbol\` values expressed
  as a comma-separated list of strings. For example,
  \`'a', 'bcd', 'efg123', '行'\`
- \`list_size\` is the number of distinct \`symbol\` values to generated
- \`minLength\` is an \`int\` defining the minimum length for of a generated symbol
  (inclusive)
- \`maxLength\` is an \`int\` defining the maximum length for of a generated symbol
  (inclusive)
- \`nullRate\` is an \`int\` defining the frequency of occurrence of \`null\` values:
  - \`0\`: No \`null\` will be returned.
  - \`1\`: Will only return \`null\`.
  - \`N > 1\`: On average, one in N generated values will be \`null\`.

**Return value:**

Return value type is \`symbol\`.

**Examples:**

\`\`\`questdb-sql title="Random symbol from a list"
SELECT rnd_symbol('ABC','def', '123')
FROM long_sequence(5);
\`\`\`

\`\`\`
'ABC', '123', 'def', '123', 'ABC'
\`\`\`

\`\`\`questdb-sql title="Random symbol, randomly generated"
SELECT rnd_symbol(2, 3, 4, 0)
FROM long_sequence(5);
\`\`\`

\`\`\`
'ABC', 'DEFG', 'ABC', 'DEFG', 'DEFG'
\`\`\`

## rnd_varchar

- \`rnd_varchar(stringList)\` chooses a random \`varchar\` string from a list
  defined by the user. It is useful when looking to generate specific strings
  from a finite list (e.g \`BUY, SELL\` or \`AUTUMN, WINTER, SPRING, SUMMER\`.
  Strings are randomly chosen from the list with equal probability. When only
  one string is provided in the list, this string will be chosen with 100%
  probability.
- \`rnd_varchar(minLength, maxLength, nullRate)\` generates strings of a length
  between between \`minLength\` and \`maxLength\` (both inclusive). The function
  will also generate \`null\` values at a rate defined by \`nullRate\`.

**Arguments:**

- \`strList\` is a variable-length list of possible \`string\` values expressed as a
  comma-separated list of strings. For example, \`'a', 'bcd', 'efg123', '行'\`
- \`minLength\` is an \`int\` defining the minimum length for of a generated string
  (inclusive)
- \`maxLength\` is an \`int\` defining the maximum length for of a generated string
  (inclusive)
- \`nullRate\` is an \`int\` defining the frequency of occurrence of \`null\` values:
  - \`0\`: No \`null\` will be returned.
  - \`1\`: Will only return \`null\`.
  - \`N > 1\`: On average, one in N generated values will be \`null\`.

**Return value:**

Return value type is \`varchar\`.

**Examples:**

\`\`\`questdb-sql title="Random string from a list"
SELECT rnd_varchar('ABC','def', '123')
FROM long_sequence(5);
\`\`\`

\`\`\`
'ABC', '123', 'def', '123', 'ABC'
\`\`\`

\`\`\`questdb-sql title="Random strings, including null, between min and max length."
SELECT rnd_varchar(2, 2, 4)
FROM long_sequence(4);
\`\`\`

\`\`\`text
'潃', 'Ԓ㠗', '콻薓', '8>'
\`\`\`

## rnd_str

- \`rnd_str(stringList)\` is used to choose a random \`string\` from a list defined
  by the user. It is useful when looking to generate specific strings from a
  finite list (e.g \`BUY, SELL\` or \`AUTUMN, WINTER, SPRING, SUMMER\`. Strings are
  randomly chosen from the list with equal probability. When only one string is
  provided in the list, this string will be chosen with 100% probability.
- \`rnd_str(minLength, maxLength, nullRate)\` generates strings of a length
  between between \`minLength\` and \`maxLength\` (both inclusive). The function
  will also generate \`null\` values at a rate defined by \`nullRate\`.
- \`rnd_str(list_size, minLength, maxLength, nullRate)\` generates a finite list
  of distinct random string and chooses one string from the list at random. The
  finite list is of size \`list_size\`, which is optional.

**Arguments:**

- \`strList\` is a variable-length list of possible \`string\` values expressed as a
  comma-separated list of strings. For example, \`'a', 'bcd', 'efg123', '行'\`
- \`list_size\` is an optional field declaring the number of distinct \`string\`
  values to generate.
- \`minLength\` is an \`int\` defining the minimum length for of a generated string
  (inclusive)
- \`maxLength\` is an \`int\` defining the maximum length for of a generated string
  (inclusive)
- \`nullRate\` is an \`int\` defining the frequency of occurrence of \`null\` values:
  - \`0\`: No \`null\` will be returned.
  - \`1\`: Will only return \`null\`.
  - \`N > 1\`: On average, one in N generated values will be \`null\`.

**Return value:**

Return value type is \`string\`.

**Examples:**

\`\`\`questdb-sql title="Random string from a list"
SELECT rnd_str('ABC','def', '123')
FROM long_sequence(5);
\`\`\`

\`\`\`
'ABC', '123', 'def', '123', 'ABC'
\`\`\`

\`\`\`questdb-sql title="Random strings, including null, between min and max length."
SELECT rnd_str(2, 2, 4)
FROM long_sequence(8);
\`\`\`

\`\`\`
'AB', 'CD', null, 'EF', 'CD', 'EF', null, 'AB'
\`\`\`

\`\`\`questdb-sql title="5 strings from a set of 3 distinct strings, each 2 characters long, no nulls."
SELECT rnd_str(3, 2, 2, 0) FROM long_sequence(5);
\`\`\`

\`\`\`
'DS', 'GG', 'XS', 'GG', 'XS'
\`\`\`

## rnd_bin

- \`rnd_bin()\` generates random binary data of a size up to \`32\` bytes.
- \`rnd_bin(minBytes, maxBytes, nullRate)\` generates random binary data of a size
  between \`minBytes\` and \`maxBytes\` and returns \`null\` at a rate defined by
  \`nullRate\`.

**Arguments:**

- \`minBytes\` is a \`long\` defining the minimum size in bytes for of a generated
  binary (inclusive)
- \`maxBytes\` is a \`long\` defining the maximum size in bytes for of a generated
  binary (inclusive)
- \`nullRate\` is an \`int\` defining the frequency of occurrence of \`null\` values:
  - \`0\`: No \`null\` will be returned.
  - \`1\`: Will only return \`null\`.
  - \`N > 1\`: On average, one in N generated values will be \`null\`.

**Return value:**

Return value type is \`binary\`.

**Examples:**

\`\`\`questdb-sql title="Random binary"
SELECT rnd_bin() FROM long_sequence(5);
SELECT rnd_bin(2, 5, 2) FROM long_sequence(5);
\`\`\`

## rnd_uuid4

- \`rnd_uuid4()\` is used to generate a random
  [UUID](/docs/reference/sql/datatypes/#the-uuid-type).
- The generated UUIDs are
  [version 4](<https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_(random)>)
  as per the [RFC 4122](https://tools.ietf.org/html/rfc4122#section-4.4)
  specification.
- Generated UUIDs do not use a cryptographically strong random generator and
  should not be used for security purposes.

**Return value:**

Return value type is \`uuid\`.

**Examples:**

\`\`\`questdb-sql title="Random char"
SELECT rnd_uuid4() FROM long_sequence(3);
\`\`\`

\`\`\`
deca0b0b-b14b-4d39-b891-9e1e786a48e7
2f113ebb-d36e-4e58-b804-6ece2263abe4
6eddd24a-8889-4345-8001-822cc2d41951
\`\`\`

## rnd_ipv4()

Random address generator for a single address.

Returns a single IPv4 address.

Useful for testing.

**Examples:**

\`\`\`sql
rnd_ipv4()
/* Return address between 0.0.0.1 - 255.255.255.255 */
97.29.14.22
\`\`\`

## rnd_ipv4(string, int)

Generates a random ip address within the bounds of a given subnet.

The integer argument dictates how many null values will be generated.

Returns an IPv4 address within specified range.

**Examples:**

\`\`\`sql
rnd_ipv4('22.43.200.9/16', 0)
/* Return address between 22.43.0.0 - 22.43.255.25 */
22.43.200.12
\`\`\`

## rnd_double_array()

Generates a \`DOUBLE\` array with random elements. There are two main forms:

1. \`rnd_double_array(nDims, [ nanRate, [ maxDimLength ] ])\` — generates an array with
   the specified dimensionality and random dimension lengths, as well as random
   elements. \`nanRate\` and \`maxDimLength\` are optional parameters. The default
   \`nanRate\` is zero and the default \`maxDimLength\` is 16.

2. \`rnd_double_array(nDims, nanRate, 0, dim1Len, dim2Len, dim3Len, ...)\` —
   generates an array of fixed size with random elements. Note the dummy argument 0,
   its is needed to disambiguate from other forms.

**Examples:**

Generate a 2-dimensional array with 50% NaNs and max dimension length 2:

\`\`\`questdb-sql
SELECT rnd_double_array(2, 2, 2);
\`\`\`

\`\`\`text
[
  [NaN, 0.45738551710910846],
  [0.7702337472360304, NaN]
]
\`\`\`

Generate a random 2x5 array with no NaNs:

\`\`\`questdb-sql
SELECT rnd_double_array(2, 0, 0, 2, 5);
\`\`\`

\`\`\`text
[
  [0.316129098879942,  0.8662158040337894, 0.8642568676265672,  0.6470407728977403, 0.4740048603478647],
  [0.2928431722534959, 0.4269209916086062, 0.08520276767101154, 0.5371988206397026, 0.5786689751730609]
]
\`\`\`
`
  },
  {
    path: "function/row-generator.md",
    title: "Row generator",
    headers: ["generate_series", "long_sequence"],
    content: `## generate_series

Use \`generate_series\` to generate a pseudo-table with an arithmetic series in a
single column. You can call it in isolation (\`generate_series(...)\`), or as part of
a SELECT statement (\`SELECT * FROM generate_series(...)\`).

This function can generate a \`LONG\` or \`DOUBLE\` series. There is also a
[variant](/docs/reference/function/timestamp-generator#generate_series)
that generates a \`TIMESTAMP\` series.

The \`start\` and \`end\` values are interchangeable, and you can use a negative
\`step\` value to obtain a descending arithmetic series.

The series is inclusive on both ends.

The step argument is optional, and defaults to 1.

**Arguments:**

\`generate_series(start_long, end_long, step_long)\` - generates a series of
longs.

\`generate_series(start_double, end_double, step_double)\` - generates a series of
doubles.

**Return value:**

The column type of the pseudo-table is either \`LONG\` or \`DOUBLE\`, according to
the type of the arguments.

**Examples:**

\`\`\`questdb-sql title="Ascending LONG series" demo
generate_series(-3, 3, 1);
-- or
generate_series(-3, 3);
\`\`\`

| generate_series |
| --------------- |
| -3              |
| -2              |
| -1              |
| 0               |
| 1               |
| 2               |
| 3               |

\`\`\`questdb-sql title="Descending LONG series" demo
generate_series(3, -3, -1);
\`\`\`

| generate_series |
| --------------- |
| 3               |
| 2               |
| 1               |
| 0               |
| -1              |
| -2              |
| -3              |

\`\`\`questdb-sql title="Ascending DOUBLE series" demo
generate_series(-3d, 3d, 1d);
-- or
generate_series(-3d, 3d);
\`\`\`

| generate_series |
| --------------- |
| -3.0            |
| -2.0            |
| -1.0            |
| 0.0             |
| 1.0             |
| 2.0             |
| 3.0             |

\`\`\`questdb-sql title="Descending DOUBLE series" demo
generate_series(-3d, 3d, -1d);
\`\`\`

| generate_series |
| --------------- |
| 3.0             |
| 2.0             |
| 1.0             |
| 0.0             |
| -1.0            |
| -2.0            |
| -3.0            |

## long_sequence

Use \`long_sequence()\` as a row generator to create table data for testing. The
function deals with two concerns:

- generates a pseudo-table with an ascending series of LONG numbers starting at
  1
- serves as the provider of pseudo-randomness to all the
   [random value functions](/docs/reference/function/random-value-generator/)

Basic usage of this function involves providing the number of rows to generate.
You can achieve deterministic pseudo-random behavior by providing the random
seed values.

- \`long_sequence(num_rows)\` — generates rows with a random seed
- \`long_sequence(num_rows, seed1, seed2)\` — generates rows deterministically

:::tip

Deterministic procedural generation makes it easy to test on vast amounts of
data without moving large files across machines. Using the same seed on any
machine at any time will consistently produce the same results for all random
functions.

:::

**Arguments:**

- \`num_rows\` — \`long\` representing the number of rows to generate
- \`seed1\` and \`seed2\` — \`long\` numbers that combine into a \`long128\` seed

**Examples:**

\`\`\`questdb-sql title="Generate multiple rows"
SELECT x, rnd_double()
FROM long_sequence(5);
\`\`\`

| x   | rnd_double   |
| --- | ------------ |
| 1   | 0.3279246687 |
| 2   | 0.8341038236 |
| 3   | 0.1023834675 |
| 4   | 0.9130602021 |
| 5   | 0.718276777  |

\`\`\`questdb-sql title="Access row_number using the x column"
SELECT x, x*x
FROM long_sequence(5);
\`\`\`

| x   | x\\*x |
| --- | ---- |
| 1   | 1    |
| 2   | 4    |
| 3   | 9    |
| 4   | 16   |
| 5   | 25   |

\`\`\`questdb-sql title="Use with a fixed random seed"
SELECT rnd_double()
FROM long_sequence(2,128349234,4327897);
\`\`\`

:::note

The results below will be the same on any machine at any time as long as they
use the same seed in \`long_sequence\`.

:::

| rnd_double         |
| ------------------ |
| 0.8251337821991485 |
| 0.2714941145110299 |
`
  },
  {
    path: "function/spatial.md",
    title: "Geospatial functions",
    headers: ["rnd_geohash", "make_geohash"],
    content: `Spatial functions allow for operations relating to the geohash types which
provide geospatial data support. For more information on this type of data, see
the [geohashes documentation](/docs/concept/geohashes/) and the
[operators](/docs/reference/operators/spatial/) which help with filtering data.

## rnd_geohash

\`rnd_geohash(bits)\` returns a random geohash of variable precision.

**Arguments:**

\`bits\` - an integer between \`1\` and \`60\` which determines the precision of the
generated geohash.

**Return value:**

Returns a \`geohash\`

**Examples:**

\`\`\`questdb-sql
SELECT rnd_geohash(7) g7,
      rnd_geohash(10) g10,
      rnd_geohash(30) g30,
      rnd_geohash(29) g29,
      rnd_geohash(60) g60
FROM long_sequence(5);
\`\`\`

| g7      | g10 | g30    | g29                           | g60          |
| ------- | --- | ------ | ----------------------------- | ------------ |
| 1101100 | 4h  | hsmmq8 | 01110101011001101111110111011 | rjtwedd0z72p |
| 0010011 | vf  | f9jc1q | 10101111100101111111101101101 | fzj09w97tj1h |
| 0101011 | kx  | fkhked | 01110110010001001000110001100 | v4cs8qsnjkeh |
| 0000001 | 07  | qm99sm | 11001010011011000010101100101 | hrz9gq171nc5 |
| 0101011 | 6t  | 3r8jb5 | 11011101010111001010010001010 | fm521tq86j2c |

## make_geohash

\`make_geohash(lon, lat, bits)\` returns a geohash equivalent of latitude and
longitude, with precision specified in bits.

\`make_geohash()\` is intended to be used via SQL over HTTP / PostgreSQL wire
protocol, for use within Java (embedded) scenario, see the
[Java embedded documentation for geohashes](/docs/concept/geohashes/#java-embedded-usage).

**Arguments:**

- \`lon\` - longitude coordinate as a floating point value with up to eight
  decimal places
- \`lat\` - latitude coordinate as a floating point value with up to eight decimal
  places
- \`bits\` - an integer between \`1\` and \`60\` which determines the precision of the
  generated geohash.

The latitude and longitude arguments may be constants, column values or the
results of a function which produces them.

**Return value:**

Returns a \`geohash\`.

- If latitude and longitude comes from constants and is incorrect, an error is
  thrown
- If column values have invalid lat / long coordinates, this produces \`null\`.

**Examples:**

\`\`\`questdb-sql
SELECT make_geohash(142.89124148, -12.90604153, 40)
\`\`\`
`
  },
  {
    path: "function/text.md",
    title: "Text functions",
    headers: ["concat", "length", "left", "right", "replace", "lpad", "ltrim", "rtrim", "trim", "split_part", "starts_with", "string_agg", "strpos / position", "substring", "to_lowercase / lower", "to_uppercase / upper", "quote_ident"],
    content: `This page describes the available functions to assist with performing text
manipulation such as concatenation, case conversion, and string length
calculation.

:::note VARCHAR and STRING data types

QuestDB supports two types of string data: \`VARCHAR\` and \`STRING\`. Most users
should use \`VARCHAR\` as it is more efficient. See
[VARCHAR vs STRING](/docs/reference/sql/datatypes#varchar-and-string-considerations)
for more information.

Functions described in this page work with both types.

:::

## concat

\`concat(str, ...)\` - concatenates a string from one or more input values.

\`\`\`questdb-sql title="Example"
SELECT firstName, lastName, concat(firstName, ' ', lastName) FROM names;
\`\`\`

| firstName | lastName | concat        |
| --------- | -------- | ------------- |
| Tim       | Thompson | Tim Thompson  |
| Anna      | Thompson | Anna Thompson |
| Anna      | Mason    | Anna Mason    |
| Tom       | Johnson  | Tom Johnson   |
| Tim       | Smith    | Tim Smith     |

:::tip

\`concat()\` can be used to generate \`line protocol\`. See an example below.

:::

\`\`\`questdb-sql title="Generating line protocol"
SELECT
concat(
    'trades,instrument=', rnd_str(2,2,0),
    ',side=', rnd_str('B', 'S'),
    ' price=', abs(cast(rnd_double(0)*100000 AS INT)),
    ',quantity=', abs(cast(rnd_double(0)*10000 AS INT)),
    ' ',
    1571270400000 + (x-1) * 100
)
FROM long_sequence(5) x;
\`\`\`

\`\`\`title="Result"
trades,instrument=CR,side=B price=70867,quantity=9192 1571270400000
trades,instrument=LN,side=S price=37950,quantity=1439 1571270400100
trades,instrument=ZJ,side=S price=82829,quantity=8871 1571270400200
trades,instrument=EW,side=S price=10427,quantity=1945 1571270400300
trades,instrument=MI,side=B price=99348,quantity=8450 1571270400400
\`\`\`

## length

\`length(string)\` - reads length of \`string\` value type (result is \`int\`)

\`length(symbol)\` - reads length of \`symbol\` value type (result is \`int\`)

\`length(blob)\` - reads length of \`binary\` value type (result is \`long\`)

- a \`string\`
- a \`symbol\`
- a \`binary\` blob

\`\`\`questdb-sql title="Example"
SELECT name a, length(name) b FROM names limit 4
\`\`\`

| a      | b   |
| ------ | --- |
| AARON  | 5   |
| AMELIE | 6   |
| TOM    | 3   |
| null   | -1  |

## left

\`left(string, count)\` - extracts a substring of the given length from a string
(starting from left).

**Arguments:**

- \`string\` is a string to extract from.
- \`count\` is an integer specifying the count of characters to be extracted into
  a substring.

**Return value:**

Returns a string with the extracted characters.

**Examples:**

\`\`\`questdb-sql title="Example"
SELECT name, left('Thompson', 3) l FROM names LIMIT 3
\`\`\`

| name   | l   |
| ------ | --- |
| AARON  | AAR |
| AMELIE | AME |
| TOM    | TOM |

## right

\`right(string, count)\` - extracts a substring of the given length from a string
(starting from right).

**Arguments:**

- \`string\` is a string to extract from.
- \`count\` is an integer specifying the count of characters to be extracted into
  a substring.

**Return value:**

Returns a string with the extracted characters.

**Examples:**

\`\`\`questdb-sql title="Example"
SELECT name, right('Thompson', 2) r FROM names LIMIT 3
\`\`\`

| name   | l   |
| ------ | --- |
| AARON  | ON  |
| AMELIE | IE  |
| TOM    | OM  |

## replace

\`replace\` replaces all occurrences of a substring within a string with another
substring.

**Arguments:**

- \`replace(string, from_string, to_string)\`

  - \`string\` is the original string where replacements will be made.
  - \`from_string\` is the substring that will be searched for in the original
    string.
  - \`to_string\` is the substring that will replace occurrences of \`from_string\`.

**Return value:**

Returns a new string that is derived from the original string by replacing every
occurrence of \`from_string\` with \`to_string\`.

**Examples:**

\`\`\`sql
SELECT replace('Hello World', 'World', 'QuestDB');
\`\`\`

| replace       |
| ------------- |
| Hello QuestDB |

## lpad

**Arguments:**

- \`lpad(string, length, fill)\`

  - \`string\` is the input string that you want to pad.
  - \`length\` is the length of the resulting string after padding. If this is
    less than the length of the original string, the original string is
    truncated to the specified length.
  - \`fill\` is the string to use for padding. If this is not specified, spaces
    are used.

**Return value:**

Returns a string that is padded on the left with the specified fill string to
the specified length.

**Example:**

\`\`\`questdb-sql title="Using lpad function"
SELECT lpad('QuestDB', 10, '0') AS padded_string;
\`\`\`

| lpad       |
| ---------- |
| 000QuestDB |

## ltrim

**Arguments:**

- \`ltrim(string)\`

  - \`string\` is the input string from which you want to remove leading
    whitespace.

**Return value:**

Returns a string with leading whitespace removed.

**Example:**

\`\`\`questdb-sql title="Using ltrim function"
SELECT ltrim('   QuestDB   ') AS trimmed_string;
\`\`\`

| trim                            |
| ------------------------------- |
| QuestDB&nbsp;&nbsp;&nbsp;&nbsp; |

## rtrim

\`rtrim\` extracts white space from the right of a string value.

**Arguments:**

- \`rtrim(string)\`

**Return value:**

Returns a new string derived from the original string, minus all trailing
occurrences of white space.

**Examples:**

\`\`\`sql
SELECT rtrim('Hello QuestDB   ');
\`\`\`

| rtrim         |
| ------------- |
| Hello QuestDB |

## trim

**Arguments:**

- \`trim(string)\`

  - \`string\` is the input string from which you want to remove leading and
    trailing whitespace.

**Return value:**

Returns a string with leading and trailing whitespace removed.

**Example:**

\`\`\`questdb-sql title="Using trim function"
SELECT trim('   QuestDB   ') AS trimmed_string;
\`\`\`

| trim    |
| ------- |
| QuestDB |

## split_part

**Arguments:**

- \`split_part(string, delimiter, part)\`

  - \`string\` is the original string that will be split.
  - \`delimiter\` is the character or characters that will be used to split the
    string.
  - \`part\` is an integer that specifies which part to return, starting from 1.

**Return value:**

Returns the part at the specified position from the string that has been split
by the delimiter.

**Examples:**

\`\`\`sql
SELECT split_part('Hello,QuestDB,SQL', ',', 2);
\`\`\`

| split_part |
| ---------- |
| QuestDB    |

## starts_with

**Arguments:**

- \`starts_with(string, substring)\`

  - \`string\` is the original string that will be checked.
  - \`substring\` is the substring that will be checked if it's at the start of
    the original string.

**Return value:**

Returns \`true\` if the original string starts with the specified substring,
\`false\` otherwise.

**Examples:**

\`\`\`sql
SELECT starts_with('Hello QuestDB', 'Hello');
\`\`\`

| starts_with |
| ----------- |
| true        |

## string_agg

**Arguments:**

- \`string_agg(expression, delimiter)\`

  - \`expression\` is the string that will be aggregated.
  - \`delimiter\` is the string that will be inserted between the values in the
    result string.

**Return value:**

Returns a string that is the result of concatenating all the string values in a
group, separated by the specified delimiter.

**Examples:**

\`\`\`questdb-sql
SELECT string_agg(make, ',') as makes
FROM sensors;
\`\`\`

| makes                                                       |
| ----------------------------------------------------------- |
| Honeywell,Honeywell,United Automation,United Automation,... |

It's common to append a \`LIMIT\` so that, such as in this case, the values
repeat:

\`\`\`questdb-sql
SELECT string_agg(make, ',') as makes
FROM (
  SELECT make
  FROM sensors
  LIMIT 10
) sub;
\`\`\`

This will return 10 concatenated strings.

## strpos / position

\`strpos(string, substring)\` or \`position(string, substring)\` - searches for the
first substring occurrence in a string, and returns the index position of the
starting character. If the substring is not found, this function returns \`0\`.
The performed search is case-sensitive.

**Arguments:**

- \`string\` is a string to search in.
- \`substring\` is a string to search for.

**Return value:**

Returns an integer for the substring position. Positions start from \`1\`.

**Examples:**

\`\`\`questdb-sql title="Example"
SELECT name, strpos(name, 'Thompson') idx
FROM full_names
LIMIT 4;

-- This is equal to:
SELECT name, position(name, 'Thompson') idx
FROM full_names
LIMIT 4;
\`\`\`

| name          | idx |
| ------------- | --- |
| Tim Thompson  | 5   |
| Anna Thompson | 6   |
| Anna Mason    | 0   |
| Tom Johnson   | 0   |

Assuming we have a table \`example_table\` with a single string type column \`col\`:

| col        |
| ---------- |
| apple,pear |
| cat,dog    |
| ...        |

As a more advanced example, we can use \`strpos()\` or \`position()\` to split the
string values of \`col\`, in this case splitting at the comma character, \`,\` . By
using \`left()\`/\`right()\` functions, we can choose the string values at the left
and right of the comma:

\`\`\`questdb-sql title="Splitting string into two separate columns"
SELECT col,
       left(col, strpos(col, ',') - 1) as col1,
       right(col, length(col) - strpos(col, ',')) as col2
FROM example_table;

-- This is equal to:

SELECT col,
       left(col, position(col, ',') - 1) as col1,
       right(col, length(col) - position(col, ',')) as col2
FROM example_table;
\`\`\`

| col        | col1  | col2 |
| ---------- | ----- | ---- |
| apple,pear | apple | pear |
| cat,dog    | cat   | dog  |

## substring

\`substring(string, start, length)\` - extracts a substring from the given string.

**Arguments:**

- \`string\` is a string to extract from.
- \`start\` is an integer specifying the position of the first character to be
  extracted. Positions start from \`1\`.
- \`length\` is an integer specifying the count of characters to be extracted.
  Should be non-negative.

**Return value:**

Returns a string with the extracted characters. If any part the arguments is
\`null\`, the function returns \`null\`.

**Examples:**

\`\`\`questdb-sql title="Example"
SELECT id, substring(id, 1, 2) country FROM orders LIMIT 3
\`\`\`

| id              | country |
| --------------- | ------- |
| UK2022072619373 | UK      |
| UK2022072703162 | UK      |
| US2022072676246 | US      |

If the \`start\` argument is negative, the output depends on the value of
\`start+length\`:

- If \`start+length\` is greater than 1, the substring stops at position
  \`start+length - 1\`.
- If \`start+length\` is zero, the output is empty string.
- If \`start+length\` is less than zero, the output is \`null\`.

\`\`\`questdb-sql title="Example"
SELECT substring('Lorem ipsum dolor sit amet', -5, 9)
\`\`\`

| substring |
| --------- |
| Lor       |

## to_lowercase / lower

- \`to_lowercase(string)\` or \`lower(string)\` - converts all upper case string
  characters to lowercase

**Arguments**:

\`string\` is the input strong to be converted.

**Return value**:

Return value type is \`string\`.

**Examples**:

\`\`\`questdb-sql
SELECT lower('questDB');
-- This is equal to:
SELECT to_lowercase('questDB');
\`\`\`

| to_lowercase |
| ------------ |
| questdb      |

## to_uppercase / upper

- \`to_uppercase(string)\` or \`upper(string)\` - converts all lower case string
  characters to uppercase

**Arguments**:

\`string\` is the input strong to be converted.

**Return value**:

Return value type is \`string\`.

**Examples**:

\`\`\`questdb-sql
SELECT upper('questDB');
-- This is equal to:
SELECT to_uppercase('questDB');
\`\`\`

| to_uppercase |
| ------------ |
| QUESTDB      |

## quote_ident

**Arguments:**

- \`quote_ident(string)\`
  - \`string\` is the string that may need quoting to be used as a SQL identifier.

**Return value:**

Returns the value enclosed in quotes if needed to make it a valid SQL
identifier, else the value unchanged.

**Examples:**

\`\`\`sql
SELECT quote_ident("a b");
\`\`\`

| quote_ident |
| ----------- |
| "a b"       |

\`\`\`sql
SELECT quote_ident("ab");
\`\`\`

| quote_ident |
| ----------- |
| ab          |
`
  },
  {
    path: "function/timestamp-generator.md",
    title: "Timestamp generator",
    headers: ["timestamp_sequence", "generate_series"],
    content: `## timestamp_sequence

This function acts similarly to
[\`rnd_*\`](/docs/reference/function/random-value-generator/) functions. It
generates a single timestamp value (not a pseudo-table), but when used in
combination with the \`long_sequence()\` pseudo-table function, its output forms a
series of timestamps that monotonically increase.

- \`timestamp_sequence(startTimestamp, step)\` generates a sequence of \`timestamp\`
  starting at \`startTimestamp\`, and incrementing by a \`step\` set as a \`long\`
  value in microseconds. The \`step\` can be either;

  - a fixed value, resulting in a steadily-growing timestamp series
  - a random function invocation, such as
    [rnd_short()](/docs/reference/function/random-value-generator#rnd_short),
    resulting in a timestamp series that grows in random steps

**Arguments:**

- \`startTimestamp\` — the starting (i.e lowest) generated timestamp in the
  sequence
- \`step\` — the interval (in microseconds) between 2 consecutive generated
  timestamps

**Return value:**

The default type of the return value is \`TIMESTAMP\`. If a \`TIMESTAMP_NS\` or a date literal string with nanosecond
resolution is passed as one of the arguments, the return value will be a \`TIMESTAMP_NS\`.

**Examples:**

\`\`\`questdb-sql title="Monotonic timestamp increase"
SELECT x, timestamp_sequence(
            to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
            100000L)
FROM long_sequence(5);
\`\`\`

| x   | timestamp_sequence          |
| --- | --------------------------- |
| 1   | 2019-10-17T00:00:00.000000Z |
| 2   | 2019-10-17T00:00:00.100000Z |
| 3   | 2019-10-17T00:00:00.200000Z |
| 4   | 2019-10-17T00:00:00.300000Z |
| 5   | 2019-10-17T00:00:00.400000Z |

\`\`\`questdb-sql title="Randomized timestamp increase"
SELECT x, timestamp_sequence(
            to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
            rnd_short(1,5) * 100000L)
FROM long_sequence(5);
\`\`\`

| x   | timestamp_sequence          |
| --- | --------------------------- |
| 1   | 2019-10-17T00:00:00.000000Z |
| 2   | 2019-10-17T00:00:00.100000Z |
| 3   | 2019-10-17T00:00:00.600000Z |
| 4   | 2019-10-17T00:00:00.900000Z |
| 5   | 2019-10-17T00:00:01.300000Z |

## generate_series

This function generates a pseudo-table containing an arithmetic series of
timestamps. Use it when you don't need a given number of rows, but a given time
period defined by start, and, and step.

You can call it in isolation (\`generate_series(...)\`), or as part of a SELECT
statement (\`SELECT * FROM generate_series(...)\`).

Provide the time step either in microseconds, or in a period string, similar to
\`SAMPLE BY\`.

The \`start\` and \`end\` values are interchangeable; use a negative time step value
to obtain the series in reverse order.

The series is inclusive on both ends.

**Arguments:**

There are two timestamp-generating variants of \`generate_series\`:

- \`generate_series(start, end, step_period)\` - generate a series of timestamps
  between \`start\` and \`end\`, in periodic steps
- \`generate_series(start, end, step_micros)\` - generates a series of timestamps
  between \`start\` and \`end\`, in microsecond steps

**Return value:**

The default type of the return value is \`TIMESTAMP\`. If a \`TIMESTAMP_NS\` or a date literal string with nanosecond
resolution is passed as one of the arguments, the return value will be a \`TIMESTAMP_NS\`.

**Examples:**

\`\`\`questdb-sql title="Ascending series using a period" demo
generate_series('2025-01-01', '2025-02-01', '5d');
\`\`\`

| generate_series (timestamp) |
| --------------------------- |
| 2025-01-01T00:00:00.000000Z |
| 2025-01-06T00:00:00.000000Z |
| 2025-01-11T00:00:00.000000Z |
| 2025-01-16T00:00:00.000000Z |
| 2025-01-21T00:00:00.000000Z |
| 2025-01-26T00:00:00.000000Z |
| 2025-01-31T00:00:00.000000Z |

\`\`\`questdb-sql title="Descending series using a period" demo
generate_series('2025-01-01', '2025-02-01', '-5d');
\`\`\`

| generate_series (timestamp) |
| --------------------------- |
| 2025-02-01T00:00:00.000000Z |
| 2025-01-27T00:00:00.000000Z |
| 2025-01-22T00:00:00.000000Z |
| 2025-01-17T00:00:00.000000Z |
| 2025-01-12T00:00:00.000000Z |
| 2025-01-07T00:00:00.000000Z |
| 2025-01-02T00:00:00.000000Z |

\`\`\`questdb-sql title="Ascending series using microseconds" demo
generate_series(
 '2025-01-01T00:00:00Z'::timestamp,
 '2025-01-01T00:05:00Z'::timestamp,
 60_000_000
);
\`\`\`

| generate_series (timestamp) |
| --------------------------- |
| 2025-01-01T00:00:00.000000Z |
| 2025-01-01T00:01:00.000000Z |
| 2025-01-01T00:02:00.000000Z |
| 2025-01-01T00:03:00.000000Z |
| 2025-01-01T00:04:00.000000Z |
| 2025-01-01T00:05:00.000000Z |

\`\`\`questdb-sql title="Descending series using microseconds" demo
generate_series(
 '2025-01-01T00:00:00Z'::timestamp,
 '2025-01-01T00:05:00Z'::timestamp,
 -60_000_000
);
\`\`\`

| generate_series (timestamp) |
| --------------------------- |
| 2025-01-01T00:05:00.000000Z |
| 2025-01-01T00:04:00.000000Z |
| 2025-01-01T00:03:00.000000Z |
| 2025-01-01T00:02:00.000000Z |
| 2025-01-01T00:01:00.000000Z |
| 2025-01-01T00:00:00.000000Z |


\`\`\`questdb-sql title="Series using nanosecond timestamp" demo
generate_series( '2025-01-01', '2025-02-01T00:00:00.000000000Z', '1s');
\`\`\`

| generate_series (timestamp_ns) |
| ------------------------------ |
| 2025-01-01T00:00:00.000000000Z |
| 2025-01-06T00:00:00.000000000Z |
| 2025-01-11T00:00:00.000000000Z |
| 2025-01-16T00:00:00.000000000Z |
| 2025-01-21T00:00:00.000000000Z |
| 2025-01-26T00:00:00.000000000Z |
| 2025-01-31T00:00:00.000000000Z |



\`\`\`questdb-sql title="Series using nanosecond timestamp and nanosecond step" demo
generate_series( to_timestamp_ns('2025-01-01T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
 '2025-01-01T00:00:00.000001', '500n');
 \`\`\`

| generate_series                |
| ------------------------------ |
| 2025-01-01T00:00:00.000000000Z |
| 2025-01-01T00:00:00.000000500Z |
| 2025-01-01T00:00:00.000001000Z |
`
  },
  {
    path: "function/timestamp.md",
    title: "Timestamp function",
    headers: ["Syntax", "Optimization with WHERE clauses"],
    content: `\`timestamp(columnName)\` elects a
[designated timestamp](/docs/concept/designated-timestamp/):

- during a [CREATE TABLE](/docs/reference/sql/create-table/#designated-timestamp) operation
- during a [SELECT](/docs/reference/sql/select#timestamp) operation
  (\`dynamic timestamp\`)
- when ingesting data via InfluxDB Line Protocol, for tables that do not already
  exist in QuestDB, partitions are applied automatically by day by default with
  a \`timestamp\` column

:::note

- Checking if tables contain a designated timestamp column can be done via the
  \`tables()\` and \`table_columns()\` functions which are described in the
  [meta functions](/docs/reference/function/meta/) documentation page.

- There are two timestamp resolutions available in QuestDB: microseconds and nanoseconds. See
  [Timestamps in QuestDB](/docs/guides/working-with-timestamps-timezones/#timestamps-in-questdb)
  for more details.
:::

## Syntax

### During a CREATE operation

Create a [designated timestamp](/docs/concept/designated-timestamp/) column
during table creation. For more information, refer to the
[CREATE TABLE](/docs/reference/sql/create-table/) section.

![Flow chart showing the syntax of the TIMESTAMP keyword](/images/docs/diagrams/timestamp.svg)

### During a SELECT operation

Creates a [designated timestamp](/docs/concept/designated-timestamp/) column in
the result of a query. Assigning a timestamp in a \`SELECT\` statement
(\`dynamic timestamp\`) allows for time series operations such as \`LATEST BY\`,
\`SAMPLE BY\` or \`LATEST BY\` on tables which do not have a \`designated timestamp\`
assigned.

![Flow chart showing the syntax of the timestamp function](/images/docs/diagrams/dynamicTimestamp.svg)

## Optimization with WHERE clauses

When filtering on a designated timestamp column in WHERE clauses, QuestDB automatically optimizes the query by applying time-based partition filtering. This optimization also works with subqueries that return timestamp values.

For example:

\`\`\`questdb-sql title="Timestamp optimization with WHERE clause" demo
SELECT *
FROM trades
WHERE ts > (SELECT min(ts) FROM trades)
  AND ts < (SELECT max(ts) FROM trades);
\`\`\`

In this case, if \`ts\` is the designated timestamp column, QuestDB will optimize the query by:

1. Evaluating the subqueries to determine the time range
2. Using this range to filter partitions before scanning the data
3. Applying the final timestamp comparison on the remaining records

This optimization applies to timestamp comparisons using:

- Greater than (\`>\`)
- Less than (\`<\`)
- Equals (\`=\`)
- Greater than or equal to (\`>=\`)
- Less than or equal to (\`<=\`)

## Examples

### During a CREATE operation

The following creates a table with
[designated timestamp](/docs/concept/designated-timestamp/).

\`\`\`questdb-sql title="Create table"
CREATE TABLE
temperatures(ts timestamp, sensorID symbol, sensorLocation symbol, reading double)
timestamp(ts);
\`\`\`

### During a SELECT operation

The following will query a table and assign a
[designated timestamp](/docs/concept/designated-timestamp/) to the output. Note
the use of brackets to ensure the timestamp clause is applied to the result of
the query instead of the whole \`readings\` table.

\`\`\`questdb-sql title="Dynamic timestamp"
(SELECT cast(dateTime AS TIMESTAMP) ts, device, value FROM readings) timestamp(ts);
\`\`\`

Although the \`readings\` table does not have a designated timestamp, we are able
to create one on the fly. Now, we can use this into a subquery to perform
timestamp operations.

\`\`\`questdb-sql title="Dynamic timestamp subquery"
SELECT ts, avg(value) FROM
(SELECT cast(dateTime AS TIMESTAMP) ts, value FROM readings) timestamp(ts)
SAMPLE BY 1d;
\`\`\`

If the data is unordered, it is important to order it first.

\`\`\`questdb-sql title="Dynamic timestamp - unordered data"
SELECT ts, avg(value) FROM
(SELECT ts, value FROM unordered_readings ORDER BY ts) timestamp(ts)
SAMPLE BY 1d;
\`\`\`
`
  },
  {
    path: "function/touch.md",
    title: "Touch function",
    headers: [],
    content: `The \`touch()\` function loads a table from disk to memory. Useful for triggering
a "hot" start from conditions where data may be "cold", such as after a restart
or any condition which caused disk cache to flush. A "hot" start provides the
usual fast and expected query performance, as no caching or movement from disk
to memory is required prior to an initial query.

### Arguments:

Wraps a SQL statement.

### Return value

Returns an \`object\` representing index state.

\`\`\`json
{
  "data_pages": number,
  "index_key_pages": number,
  "index_values_pages": number
}
\`\`\`

### General example

Consider a table with an indexed symbol column:

\`\`\`sql
CREATE TABLE x AS (
  SELECT
    rnd_geohash(40) g,
    rnd_double(0)* 100 a,
    rnd_symbol(5, 4, 4, 1) b,
    timestamp_sequence(0, 100000000000) k
  FROM
    long_sequence(20)
),
index(b) timestamp(k) PARTITION BY DAY;
\`\`\`

Run \`touch()\` to "warm up" the table:

\`\`\`sql
SELECT touch(SELECT * FROM x WHERE k IN '1970-01-22');
\`\`\`

On success, an object is returned with the state of the index.

\`\`\`json
{
  "data_pages": 4,
  "index_key_pages": 1,
  "index_values_pages": 1
}
\`\`\`

### Practical example

Many people use scripts to restart QuestDB.

Use \`touch()\` after startup via the REST API:

\`\`\`shell
curl -G \\
  --data-urlencode "SELECT touch(SELECT * FROM x WHERE k IN '1970-01-22');" \\
  http://localhost:9000/exec
\`\`\`

All subsequent queries will be within performance expectations, without
additional latency added for "warming up" the data. Touch simulates a query
without transferring data over the network, apart from the object as
confirmation.
`
  },
  {
    path: "function/trigonometric.md",
    title: "Trigonometric functions",
    headers: ["sin", "cos", "tan", "cot", "asin", "acos", "atan", "atan2", "radians", "degrees", "pi"],
    content: `This page describes the available functions to assist with performing
trigonometric calculations.

:::tip

Positive and negative infinity values are expressed as \`'Infinity'\` or
\`'-Infinity'\` in QuestDB.

:::

## sin

\`sin(angleRadians)\` returns the trigonometric sine of an angle.

### Arguments

- \`angleRadians\` is a numeric value indicating the angle in radians.

### Return value

Return value type is \`double\`.

### Description

Special case: if the argument is \`NaN\` or an infinity, then the result is
\`Null\`.

### Examples

\`\`\`questdb-sql
SELECT pi()/2 angle, sin(pi()/2) sin;
\`\`\`

| angle          | sin |
| -------------- | --- |
| 1.570796326794 | 1   |

## cos

\`cos(angleRadians)\` returns the trigonometric cosine of an angle.

### Arguments

- \`angleRadians\` numeric value for the angle, in radians.

### Return value

Return value type is \`double\`.

### Description

Special case: if the argument is \`NaN\` or an infinity, then the result is
\`Null\`.

### Examples

\`\`\`questdb-sql
SELECT pi()/2 angle, cos(pi()/2) cos;
\`\`\`

| angle          | cos                   |
| -------------- | --------------------- |
| 1.570796326794 | 6.123233995736766e-17 |

## tan

\`tan(angleRadians)\` returns the trigonometric tangent of an angle.

### Arguments

- \`angleRadians\` numeric value for the angle, in radians.

### Return value

Return value type is \`double\`.

### Description

Special case: if the argument is \`NaN\` or an infinity, then the result is
\`Null\`.

### Examples

\`\`\`questdb-sql
SELECT pi()/2 angle, tan(pi()/2) tan;
\`\`\`

| angle          | tan               |
| -------------- | ----------------- |
| 1.570796326794 | 16331239353195370 |

## cot

\`cot(angleRadians)\` returns the trigonometric cotangent of an angle.

### Arguments

- \`angleRadians\` numeric value for the angle, in radians.

### Return value

Return value type is \`double\`.

### Description

Special case: if the argument is \`NaN\`, 0, or an infinity, then the result is
\`Null\`.

<!-- - If the argument is 0, then the result is positive infin.
Currently returning null TBD-->

### Examples

\`\`\`questdb-sql
SELECT pi()/2 angle, cot(pi()/2) cot;
\`\`\`

| angle          | cot                   |
| -------------- | --------------------- |
| 1.570796326794 | 6.123233995736766e-17 |

## asin

\`asin(value)\` the arcsine of a value.

### Arguments

- \`value\` is a numeric value whose arcsine is to be returned.

### Return value

Return value type is \`double\`. The returned angle is between -pi/2 and pi/2
inclusively.

### Description

Special case: if the argument is \`NaN\` or an infinity, then the result is
\`Null\`.

### Examples

\`\`\`questdb-sql
SELECT asin(1.0) asin;
\`\`\`

| asin           |
| -------------- |
| 1.570796326794 |

## acos

\`acos(value)\` returns the arccosine of a value.

### Arguments

- \`value\` is a numeric value whose arccosine is to be returned. The returned
  angle is between 0.0 and pi inclusively.

### Return value

Return value type is \`double\`.

### Description

Special cases: if the argument is \`NaN\` or its absolute value is greater than 1,
then the result is \`Null\`.

### Examples

\`\`\`questdb-sql
SELECT acos(0.0) acos;
\`\`\`

| acos           |
| -------------- |
| 1.570796326794 |

## atan

\`atan(value)\` returns the arctangent of a value.

### Arguments

- \`value\` is a numeric value whose arctangent is to be returned.

### Return value

Return value type is \`double\`. The returned angle is between -pi/2 and pi/2
inclusively.

### Description

Special cases:

- If the argument is \`NaN\`, then the result is \`Null\`.
- If the argument is infinity, then the result is the closest value to pi/2 with
  the same sign as the input.

### Examples

Special case where input is \`'-Infinity'\`:

\`\`\`questdb-sql
SELECT atan('-Infinity');
\`\`\`

Returns the closest value to pi/2 with the same sign as the input:

| atan            |
| --------------- |
| -1.570796326794 |

\`\`\`questdb-sql
SELECT atan(1.0) atan;
\`\`\`

| atan           |
| -------------- |
| 0.785398163397 |

## atan2

\`atan2(valueY, valueX)\` returns the angle _theta_ from the conversion of
rectangular coordinates (x, y) to polar (r, theta). This function computes
_theta_ (the phase) by computing an arctangent of y/x in the range of -pi to pi
inclusively.

### Arguments

- \`valueY\` numeric ordinate coordinate.
- \`valueX\` numeric abscissa coordinate.

:::note

The arguments to this function pass the y-coordinate first and the x-coordinate
second.

:::

### Return value

Return value type is \`double\` between -pi and pi inclusively.

### Description:

\`atan2(valueY, valueX)\` measures the counterclockwise angle _theta_, in radians,
between the positive x-axis and the point (x, y):

![Atan2 trigonometric function](/images/docs/atan2.svg)

Special cases:

| input \`valueY\`        | input \`valueX\` | \`atan2\` return value               |
| --------------------- | -------------- | ---------------------------------- |
| 0                     | Positive value | 0                                  |
| Positive finite value | 'Infinity'     | 0                                  |
| -0                    | Positive value | 0                                  |
| Negative finite value | 'Infinity'     | 0                                  |
| 0                     | Negative value | Double value closest to pi         |
| Positive finite value | '-Infinity'    | Double value closest to pi         |
| -0                    | Negative value | Double value closest to -pi        |
| Negative finite value | '-Infinity'    | Double value closest to -pi        |
| Positive value        | 0 or -0        | Double value closest to pi/2       |
| 'Infinity'            | Finite value   | Double value closest to pi/2       |
| Negative value        | 0 or -0        | Double value closest to -pi/2      |
| '-Infinity'           | Finite value   | Double value closest to -pi/2      |
| 'Infinity'            | 'Infinity'     | Double value closest to pi/4       |
| 'Infinity'            | '-Infinity'    | Double value closest to 3/4 \\* pi  |
| '-Infinity'           | 'Infinity'     | Double value closest to -pi/4      |
| '-Infinity'           | '-Infinity'    | Double value closest to -3/4 \\* pi |

### Examples

\`\`\`questdb-sql
SELECT atan2(1.0, 1.0) atan2;
\`\`\`

| atan2          |
| -------------- |
| 0.785398163397 |

## radians

\`radians(angleDegrees)\` converts an angle measured in degrees to the equivalent
angle measured in radians.

### Arguments

- \`angleDegrees\` numeric value for the angle in degrees.

### Return value

Return value type is \`double\`.

### Examples

\`\`\`questdb-sql
SELECT radians(180);
\`\`\`

| radians        |
| -------------- |
| 3.141592653589 |

## degrees

\`degrees(angleRadians)\` converts an angle measured in radians to the equivalent
angle measured in degrees.

### Arguments

- \`angleRadians\` numeric value for the angle in radians.

### Return value

Return value type is \`double\`.

### Examples

\`\`\`questdb-sql
SELECT degrees(pi());
\`\`\`

| degrees |
| ------- |
| 180     |

## pi

\`pi()\` returns the constant pi as a double.

### Arguments

None.

### Return value

Return value type is \`double\`.

### Examples

\`\`\`questdb-sql
SELECT pi();
\`\`\`

| pi             |
| -------------- |
| 3.141592653589 |
`
  },
  {
    path: "function/uuid.md",
    title: "UUID functions",
    headers: ["to_uuid"],
    content: `This page describes the available functions related to UUID data type.

## to_uuid

\`to_uuid(value, value)\` combines two 64-bit \`long\` into a single 128-bit \`uuid\`.

### Arguments

- \`value\` is any \`long\`

### Return value

Return value type is \`uuid\`.

### Examples

\`\`\`questdb-sql
SELECT to_uuid(2, 1)
AS uuid FROM long_sequence(1);
\`\`\`

Returns:

\`\`\`
00000000-0000-0001-0000-000000000002
\`\`\`
`
  },
  {
    path: "function/window.md",
    title: "Window Functions",
    headers: ["avg()", "count()", "dense_rank()", "first_not_null_value()", "first_value()", "max()", "min()", "lag()", "last_value()", "lead()", "rank()", "row_number()", "sum()", "Common window function examples"],
    content: `Window functions perform calculations across sets of table rows that are related to the current row. Unlike aggregate functions that return a single result for a group of rows, window functions return a value for every row while considering a window of rows defined by the OVER clause.

For details about window functions syntax and components, please visit the [OVER Keyword reference](/docs/reference/sql/over/)


## avg()

In the context of window functions, \`avg(value)\` calculates the average of
\`value\` over the set of rows defined by the window frame.

**Arguments:**

- \`value\`: The column of numeric values to calculate the average of.

**Return value:**

- The average of \`value\` for the rows in the window frame.

**Description**

When used as a window function, \`avg()\` operates on a "window" of rows defined
by the \`OVER\` clause. The rows in this window are determined by the
\`PARTITION BY\`, \`ORDER BY\`, and frame specification components of the \`OVER\`
clause.

The \`avg()\` function respects the frame clause, meaning it only includes rows
within the specified frame in the calculation. The result is a separate average
for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
\`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="avg() syntax"
avg(value) OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="avg() example" demo
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

## count()

Counts rows or non-null values over the window frame.

**Syntax:**
\`\`\`questdb-sql title="count() syntax"
count(*) OVER (window_definition)
count(value) OVER (window_definition)
\`\`\`

**Arguments:**
- \`*\`: Counts all rows
- \`value\`: Counts non-null values

**Example:**
\`\`\`questdb-sql title="count() example" demo
SELECT
    symbol,
    count(*) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW
    ) AS trades_last_second
FROM trades;
\`\`\`

## dense_rank()

In the context of window functions, \`dense_rank()\` assigns a unique rank to each row
within the window frame. Rows with equal values may have the same rank,
but there are no gaps in the rank numbers - it increases sequentially.

**Arguments:**

- \`dense_rank()\` does not require arguments.

**Return value:**

- The increasing consecutive rank numbers of each row within the window frame. Return value type is \`long\`.

**Description**

When used as a window function, \`dense_rank()\` operates on a "window" of rows defined
by the \`OVER\` clause. The rows in this window are determined by the
\`PARTITION BY\` and \`ORDER BY\` components of the \`OVER\` clause.

The \`dense_rank()\` function assigns a unique rank to each row within its window, with the same rank for the same values in the \`ORDER BY\` clause of
the \`OVER\` clause. However, there are no gaps in the counter, unlike with \`rank()\` - it is guaranteed to be sequential.
It ignores the frame clause, meaning it considers all rows in each partition, regardless of the frame specification.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
\`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="dense_rank() syntax"
dense_rank() OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="dense_rank() example" demo
SELECT
    symbol,
    price,
    timestamp,
    dense_rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_rank
FROM trades;
\`\`\`

## first_not_null_value()

In the context of window functions, \`first_not_null_value(value)\` returns the first non-null value in the set of rows defined by the window frame.

**Arguments:**

- \`value\`: Any numeric value.

**Return value:**

- The first non-null occurrence of \`value\` for the rows in the window frame. Returns \`NaN\` if no non-null values are found.

**Description**

When used as a window function, \`first_not_null_value()\` operates on a "window" of rows defined by the \`OVER\` clause. The rows in this window are determined by the \`PARTITION BY\`, \`ORDER BY\`, and frame specification components of the \`OVER\` clause.

The \`first_not_null_value()\` function respects the frame clause, meaning it only includes rows within the specified frame in the calculation. The result is a separate value for each row, based on the corresponding window of rows.

Unlike \`first_value()\`, this function skips null values and returns the first non-null value it encounters in the window frame. This is particularly useful when dealing with sparse data or when you want to ignore null values in your analysis.

Note that the order of rows in the result set is not guaranteed to be the same with each execution of the query. To ensure a consistent order, use an \`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**

\`\`\`questdb-sql title="first_not_null_value() syntax"
first_not_null_value(value) OVER (window_definition)
\`\`\`

**Example:**

\`\`\`questdb-sql title="first_not_null_value() example" demo
SELECT
    symbol,
    price,
    timestamp,
    first_not_null_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS first_valid_price
FROM trades;
\`\`\`


## first_value()

In the context of window functions, \`first_value(value)\` calculates the first
\`value\` in the set of rows defined by the window frame.

**Arguments:**

- \`value\`: Any numeric value.

**Return value:**

- The first occurrence of \`value\` (including null) for the rows in the window
  frame.

**Description**

\`first_value()\` operates on a "window" of rows defined by the \`OVER\` clause. The
rows in this window are determined by the \`PARTITION BY\`, \`ORDER BY\`, and frame
specification components of the \`OVER\` clause.

The \`first_value()\` function respects the frame clause, meaning it only includes
rows within the specified frame in the calculation. The result is a separate
value for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
\`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="first_value() syntax"
first_value(value) OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="first_value() example" demo
SELECT
    symbol,
    price,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS first_price
FROM trades;
\`\`\`

## max()

In the context of window functions, \`max(value)\` calculates the maximum value within the set of rows defined by the window frame.

**Arguments:**

- \`value\`: Any numeric value.

**Return value:**

- The maximum value (excluding null) for the rows in the window frame.

**Description**

When used as a window function, \`max()\` operates on a "window" of rows defined by the \`OVER\` clause. The rows in this window are determined by the \`PARTITION BY\`, \`ORDER BY\`, and frame specification components of the \`OVER\` clause.

The \`max()\` function respects the frame clause, meaning it only includes rows within the specified frame in the calculation. The result is a separate value for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same with each execution of the query. To ensure a consistent order, use an \`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="max() syntax"
max(value) OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="max() example" demo
SELECT
    symbol,
    price,
    timestamp,
    max(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS highest_price
FROM trades;
\`\`\`

## min()

In the context of window functions, \`min(value)\` calculates the minimum value within the set of rows defined by the window frame.

**Arguments:**

- \`value\`: Any numeric value.

**Return value:**

- The minimum value (excluding null) for the rows in the window frame.

**Description**

When used as a window function, \`min()\` operates on a "window" of rows defined by the \`OVER\` clause. The rows in this window are determined by the \`PARTITION BY\`, \`ORDER BY\`, and frame specification components of the \`OVER\` clause.

The \`min()\` function respects the frame clause, meaning it only includes rows within the specified frame in the calculation. The result is a separate value for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same with each execution of the query. To ensure a consistent order, use an \`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="min() syntax"
min(value) OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="min() example" demo
SELECT
    symbol,
    price,
    timestamp,
    min(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS lowest_price
FROM trades;
\`\`\`

## lag()

In the context of window functions, \`lag()\` accesses data from previous rows in the result set without using a self-join. For each row, \`lag()\` returns the value from a row at a specified offset before the current row within the partition.

The \`lag()\` function provides access to a row at a given physical offset that precedes the current row, returning NULL if the offset goes beyond the bounds of the window or partition (unless a default is specified).

- When \`offset\` is 0, returns the current row value
- \`IGNORE NULLS\` makes the function act as if NULL value rows don't exist
- \`RESPECT NULLS\` (default) includes NULL values in offset counting
- Does not support ROWS/RANGE frame clauses (silently ignored if present)
- When ORDER BY is not provided, uses table scan order

**Arguments:**

- \`value\`: The column or expression to get the value from
- \`offset\` (optional): The number of rows backward from the current row. Default is 1
- \`default\` (optional): The value to return when the offset goes beyond the partition bounds. Default is NULL
- \`[IGNORE | RESPECT] NULLS\` (optional): Determines whether NULL values should be ignored. Default is RESPECT NULLS

**Return value:**

- The value from the row at the specified offset before the current row

**Syntax:**
\`\`\`questdb-sql title="lag() syntax"
lag(value [, offset [, default]]) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression] [ORDER BY sort_expression])
\`\`\`

**Example:**
\`\`\`questdb-sql title="lag() example" demo
SELECT
    timestamp,
    price,
    lag(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS previous_price,
    lag(price, 2, 0.0) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS price_two_rows_back
FROM trades;
\`\`\`

This example:
- Gets the previous price for each symbol (\`previous_price\`)
- Gets the price from 2 rows back (\`price_two_rows_back\`)
- Uses 0.0 as default when looking 2 rows back reaches the partition start

## last_value()

In the context of window functions, \`last_value()\` returns the last value in a window frame. The function supports both regular and NULL-aware processing through the \`IGNORE NULLS\` clause.

The \`last_value()\` function provides access to the last value within a window frame. The behavior depends on:
- Window frame definition (\`ROWS\`/\`RANGE\`)
- Presence of \`ORDER BY\` and \`PARTITION BY\` clauses
- \`IGNORE/RESPECT NULLS\` setting

In addition, note the following:

- When no \`ORDER BY\` is provided, uses table scan order
- Supports both \`ROWS\` and \`RANGE\` frame specifications
- When neither \`ORDER BY\` nor \`ROWS\`/\`RANGE\` is specified, the default frame becomes \`ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING\`
- When \`ORDER BY\` is provided but \`ROWS\`/\`RANGE\` is not, the default frame becomes \`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\`

**Arguments:**

- \`value\`: The column or expression to get the value from
- \`[IGNORE | RESPECT] NULLS\` (optional): Determines whether NULL values should be ignored. Default is \`RESPECT NULLS\`

**Return value:**

- The last non-NULL value in the window frame when using \`IGNORE NULLS\`
- The last value (including NULL) in the window frame when using \`RESPECT NULLS\`

**Syntax:**
\`\`\`questdb-sql title="last_value() syntax"
last_value(value) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression]
      [ORDER BY sort_expression]
      [frame_clause])
\`\`\`

**Example:**
\`\`\`questdb-sql title="last_value() example" demo
SELECT
    timestamp,
    price,
    last_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS last_price,
    last_value(price) IGNORE NULLS OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS last_non_null_price
FROM trades;
\`\`\`

This example:
- Gets the last price within a 3-row window for each symbol (\`last_price\`)
- Gets the last non-NULL price for each symbol (\`last_non_null_price\`)
- Demonstrates both \`RESPECT NULLS\` (default) and \`IGNORE NULLS\` behavior


## lead()

In the context of window functions, \`lead()\` accesses data from subsequent rows in the result set without using a self-join. For each row, \`lead()\` returns the value from a row at a specified offset following the current row within the partition.

The \`lead()\` function provides access to a row at a given physical offset that follows the current row, returning NULL if the offset goes beyond the bounds of the window or partition (unless a default is specified).

- When \`offset\` is 0, returns the current row value
- \`IGNORE NULLS\` makes the function act as if \`NULL\` value rows don't exist
- \`RESPECT NULLS\` (default) includes \`NULL\` values in offset counting
- Does not support \`ROWS/RANGE\` frame clauses (silently ignored if present)
- When \`ORDER BY\` is not provided, uses table scan order

**Arguments:**

- \`value\`: The column or expression to get the value from
- \`offset\` (optional): The number of rows forward from the current row. Default is 1
- \`default\` (optional): The value to return when the offset goes beyond the partition bounds. Default is \`NULL\`
- \`[IGNORE | RESPECT] NULLS\` (optional): Determines whether \`NULL\` values should be ignored. Default is \`RESPECT NULLS\`

**Return value:**

- The value from the row at the specified offset after the current row

**Syntax:**
\`\`\`questdb-sql title="lead() syntax"
lead(value [, offset [, default]]) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression] [ORDER BY sort_expression])
\`\`\`

**Example:**
\`\`\`questdb-sql title="lead() example" demo
SELECT
    timestamp,
    price,
    lead(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS next_price,
    lead(price, 2, 0.0) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS price_after_next
FROM trades;
\`\`\`

This example:
- Gets the next price for each symbol (\`next_price\`)
- Gets the price from 2 rows ahead (\`price_after_next\`)
- Uses 0.0 as default when looking 2 rows ahead reaches the partition end


## rank()

In the context of window functions, \`rank()\` assigns a unique rank to each row
within the window frame, with the same rank assigned to rows with the same
values. Rows with equal values receive the same rank, and a gap appears in the
sequence for the next distinct value; that is, the \`row_number\` of the first row
in its peer group.

**Arguments:**

- \`rank()\` does not require arguments.

**Return value:**

- The rank of each row within the window frame. Return value type is \`long\`.

**Description**

When used as a window function, \`rank()\` operates on a "window" of rows defined
by the \`OVER\` clause. The rows in this window are determined by the
\`PARTITION BY\` and \`ORDER BY\` components of the \`OVER\` clause.

The \`rank()\` function assigns a unique rank to each row within its window, with
the same rank assigned to rows with the same values in the \`ORDER BY\` clause of
the \`OVER\` clause. It ignores the frame clause, meaning it considers all rows in
each partition, regardless of the frame specification.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
\`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="rank() syntax"
rank() OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="rank() example" demo
SELECT
    symbol,
    price,
    timestamp,
    rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_rank
FROM trades;
\`\`\`

## row_number()

In the context of window functions, \`row_number()\` assigns a unique row number
to each row within the window frame. For each partition, the row number starts
with one and increments by one.

**Arguments:**

- \`row_number()\` does not require arguments.

**Return value:**

- The row number of each row within the window frame. Return value type is
  \`long\`.

**Description**

When used as a window function, \`row_number()\` operates on a "window" of rows
defined by the \`OVER\` clause. The rows in this window are determined by the
\`PARTITION BY\` and \`ORDER BY\` components of the \`OVER\` clause.

The \`row_number()\` function assigns a unique row number to each row within its
window, starting at one for the first row in each partition and incrementing by
one for each subsequent row. It ignores the frame clause, meaning it considers
all rows in each partition, regardless of the frame specification.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
\`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="row_number() syntax"
row_number() OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="row_number() example" demo
SELECT
    symbol,
    price,
    timestamp,
    row_number() OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS trade_number
FROM trades;
\`\`\`

## sum()

In the context of window functions, \`sum(value)\` calculates the cumulative sum of \`value\`
in the set of rows defined by the window frame. Also known as "cumulative sum".

**Arguments:**

- \`value\`: Any numeric value.

**Return value:**

- The sum of \`value\` for the rows in the window frame.

**Description**

When used as a window function, \`sum()\` operates on a "window" of rows defined
by the \`OVER\` clause. The rows in this window are determined by the
\`PARTITION BY\`, \`ORDER BY\`, and frame specification components of the \`OVER\`
clause.

The \`sum()\` function respects the frame clause, meaning it only includes rows
within the specified frame in the calculation. The result is a separate value
for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
\`ORDER BY\` clause outside of the \`OVER\` clause.

**Syntax:**
\`\`\`questdb-sql title="sum() syntax"
sum(value) OVER (window_definition)
\`\`\`

**Example:**
\`\`\`questdb-sql title="sum() example" demo
SELECT
    symbol,
    amount,
    timestamp,
    sum(amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_amount
FROM trades;
\`\`\`

## Common window function examples

### Moving average of best bid price

\`\`\`questdb-sql title="Calculate 4-row moving average of best bid price" demo
SELECT
    timestamp,
    symbol,
    bid_px_00 as best_bid,
    avg(bid_px_00) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS bid_moving_avg
FROM AAPL_orderbook
WHERE bid_px_00 > 0;
\`\`\`

This example:
- Uses the best bid price (\`bid_px_00\`)
- Filters out zero/null bids
- Calculates average over 4 rows (current + 3 preceding)
- Groups by symbol (though in this case it's all AAPL)

### Cumulative bid size

\`\`\`questdb-sql title="Calculate cumulative size for top 3 bid levels" demo
SELECT
    timestamp,
    bid_px_00,
    bid_sz_00,
    sum(bid_sz_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '5' SECONDS PRECEDING AND CURRENT ROW
    ) as bid_volume_1min,
    bid_sz_00 + bid_sz_01 + bid_sz_02 as total_bid_size
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
\`\`\`

This example:
- Shows best bid price and size
- Calculates 1-minute rolling volume at best bid
- Sums size across top 3 price levels
- Filters out empty bids

### Order count analysis

\`\`\`questdb-sql title="Compare order counts across price levels" demo
SELECT
    timestamp,
    bid_px_00,
    bid_ct_00 as best_bid_orders,
    sum(bid_ct_00) OVER (
        ORDER BY timestamp
        ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as rolling_order_count,
    bid_ct_00 + bid_ct_01 + bid_ct_02 as total_bid_orders
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
\`\`\`

This example:
- Shows best bid price and order count
- Calculates rolling sum of orders at best bid
- Sums orders across top 3 price levels
- Uses ROWS frame for precise control

### Moving sum of bid volume

\`\`\`questdb-sql title="Calculate 1-minute rolling bid volume" demo
SELECT
    timestamp,
    bid_px_00,
    bid_sz_00,
    sum(bid_sz_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) as bid_volume_1min,
    bid_sz_00 + bid_sz_01 + bid_sz_02 as total_bid_size
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
\`\`\`

This example:
- Shows best bid price and size
- Calculates rolling 1-minute volume at best bid
- Also shows total size across top 3 levels
- Filters out empty bids

### Order frequency analysis

\`\`\`questdb-sql title="Calculate order updates per minute" demo
SELECT
    timestamp,
    symbol,
    COUNT(*) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) as updates_per_min,
    COUNT(CASE WHEN action = 'A' THEN 1 END) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) as new_orders_per_min
FROM AAPL_orderbook
LIMIT 10;
\`\`\`

This example:

- Counts all order book updates in last minute
- Specifically counts new orders (action = 'A')
- Uses rolling 1-minute window
- Shows order book activity patterns
`
  }
]
