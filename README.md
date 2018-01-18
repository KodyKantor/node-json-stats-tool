# node-json-stats: streaming stats from JSON files
This program is useful for getting simple statistics from JSON formatted files.

## Install
```
npm install json-stats-tool
```

## Sample Usage
Given this sample input file:
```
{"name": "john", "age": 10, "occupation": "student"}
{"name": "bob", "age": 10, "occupation": "student"}
{"name": "lucy", "age": 16, "occupation": "student"}
{"name": "linus", "age": 18, "occupation": "student"}
{"name": "charlie", "age": 18, "occupation": "student"}
{"name": "larry", "age": 50, "occupation": "doctor"}
{"name": "steve", "age": 50, "occupation": "doctor"}
{"name": "edna", "age": 45, "occupation": "programmer"}
{"name": "marcy", "age": 33, "occupation": "programmer"}
{"name": "darcy", "age": 30, "occupation": "programmer"}
```
We can get the average age of people by occupation:
```
$ ./json-stats-tool.js -o average -m age -d occupation < sample.json
OCCUPATION METRIC    AVERAGE
student    age         14
doctor     age         50
programmer age         36
```

Or the sum of their ages:
```
$ ./json-stats-tool.js -o sum -m age -d occupation < sample.json
OCCUPATION METRIC        SUM
student    age         72
doctor     age        100
programmer age        108
```

Or the count of people who are at the same age:
```
$ ./json-stats-tool.js -o count -m age < sample.json
          METRIC      COUNT
          10          2
          16          1
          18          2
          30          1
          33          1
          45          1
          50          2
```

Or do lots of stuff at once!
```
$ ./json-stats-tool.js -o sum,average,median -m age -d occupation < sample.json
OCCUPATION METRIC        SUM    AVERAGE     MEDIAN
student    age         72         14         16
doctor     age        100         50         50
programmer age        108         36         33
```

This works for nested objects too.

For example, say we're looking at a log file from a web server. Maybe we want to
know which HTTP routes are sending back certain HTTP return codes.

If we have a JSON structure that looks something like this:
```
{ "route": <route_name>, "res": { "statusCode": <statusCode>, "headers": <headers> } }
```
We could easily find the count of status codes returned by each route:
```
$ grep '_audit' < muskie.log | ./json-stats-tool.js -m res.statusCode -d route -o count
ROUTE       METRIC      COUNT
headrootdir 200          3
getrootdir  200          2
unknown     404          7
headstorage 200          2
putobject   204          2
getstorage  200          2
```

Or if you wanted to see where the most requests are coming from you can pipe
the output from this tool into other things:
```
$ grep 'audit' < webserver.log | ./json-stats-tool.js -m remoteAddress -o count -H | sort -n -k 2 | tail -n 5
          172.29.1.101       1644
          172.27.1.64        2201
          172.29.1.103       3309
          172.29.2.104       3765
          172.29.1.235      30724
```

json-stats also supports streaming operation where the results are calculated
and printed every second. The examples above would also work with the input
being `tail -f` instead of a redirected file.

## License
MIT
