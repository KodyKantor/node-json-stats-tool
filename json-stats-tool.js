#!/usr/bin/env node

var mod_dashdash = require('dashdash');
var mod_jsprim = require('jsprim');
var mod_lstream = require('lstream');
var mod_stats = require('stats-tool');
var mod_tab = require('tab');


var SUPPORTED_OPERATIONS = [ 'sum', 'average', 'median', 'count' ];

function main() {
	var opts = parseOpts();
	var stream = new mod_lstream({ encoding: 'utf8' });
	var stats = new mod_stats.Stats();
	var interval = -1;

	stream.on('data', function (data) {
		var obj = JSON.parse(data);

		/*
		 * For each metric that the user asks to track, retrieve the
		 * value from the input stream and pass it into the stats
		 * collector.
		 */
		opts.metrics.forEach(function (met) {
			var labels = {};
			var val = getValue(obj, met);
			if (val === undefined) {
				/*
				 * XXX should we return zero so there isn't a
				 * hole in the output?
				 */
				return; /* nothing to observe */
			}

			if (opts.decomp) {
				labels['decomposition'] =
				    getValue(obj, opts.decomp);
				if (labels['decomposition'] === undefined) {
					labels['decomposition'] = 'unknown';
				}
			}
			if (opts.operation === 'count') {
				labels['metric'] = val;
				stats.observe(labels, 1);
			} else {
				labels['metric'] = met;
				stats.observe(labels, val);
			}
		});
	});
	stream.on('end', function () {
		clearInterval(interval);
		print_metrics(opts, compute_stats(opts, stats));
	});

	if (!opts.summary) {
		/* print stats every second */
		interval = setInterval(function () {
			print_metrics(opts, compute_stats(opts, stats));
		}, 1000);
	}

	/* pipe in stdin */
	process.stdin.pipe(stream);
}

function compute_stats(opts, stats) {
	var i;
	var completed_operations = opts.operations.map(function (op) {
		switch (op) {
			case 'average':
				return (stats.average(opts.count));
			case 'sum':
				return (stats.sum(opts.count));
			case 'count':
				return (stats.sum(opts.count));
			case 'median':
				return (stats.median());
			default:
				return (null);
		}
	});

	/* chop off decimals in first operation output */
	completed_operations[0].forEach(function (metric, ind) {
		completed_operations[0][ind][1] = (metric[1]).toFixed(0);
	});

	/*
	 * copy the values from subsequent operations into the first operation
	 * output
	 */
	for (i = 1; i < completed_operations.length; i++) {
		completed_operations[i].forEach(function (metric, ind) {
			completed_operations[0][ind].push(
			    (metric[1]).toFixed(0));
		});
	}

	return (completed_operations[0]);
}

function getValue(obj, field) {
	return (new Function('obj', 'return (obj.' + field + ')')(obj));
}

/*
 * Serialize and print metrics coming from the stats module.
 *
 * Metrics come in looking like this:
 * [
 *  [
 *   { decomposition: 'headrootdir', metric: 'req.timers.getMetadata' },
 *   33458.333333333336
 *  ],
 *  [
 *   { decomposition: 'getrootdir', metric: 'req.timers.getMetadata' },
 *   19772
 *  ],
 *  [
 *   { decomposition: 'headstorage', metric: 'req.timers.getMetadata' },
 *   130487
 *  ],
 *  [
 *   { decomposition: 'putobject', metric: 'req.timers.getMetadata' },
 *   135716
 *  ],
 *  [
 *   { decomposition: 'getstorage', metric: 'req.timers.getMetadata' },
 *   156382
 *  ]
 * ]
 *
 * Which this function flattens into this:
 * [
 *  [ 'headrootdir', 'req.timers.getMetadata', 33458 ],
 *  [ 'getrootdir', 'req.timers.getMetadata', 19772 ],
 *  [ 'headstorage', 'req.timers.getMetadata', 130487 ],
 *  [ 'putobject', 'req.timers.getMetadata', 135716 ],
 *  [ 'getstorage', 'req.timers.getMetadata', 156382 ]
 * ]
 *
 * Which ultimately gets printed as this:
 *
 * ROUTE       METRIC                    AVERAGE
 * headrootdir req.timers.getMetadata      33458
 * getrootdir  req.timers.getMetadata      19772
 * headstorage req.timers.getMetadata     130487
 * putobject   req.timers.getMetadata     135716
 * getstorage  req.timers.getMetadata     156382
 *
 */
function print_metrics(opts, metrics) {
	var columns;
	var metric_map = {};
	var rows;
	var prev_decomp;
	var max_decomp_len, max_metric_len;
	/* build the object that we will flatten */
	metrics.forEach(function (met) {
		/* if we haven't seen this decomp before, create a new object */
		if (metric_map[met[0]['decomposition']] === undefined) {
			metric_map[met[0]['decomposition']] = {};
		}
		/*
		 * metric_map[decomp_value][metric_name] = metric_values
		 * e.g. { 'putobject': { 'req.timers.getMetadata': [ 156382 ]} }
		 */
		metric_map[met[0]['decomposition']][met[0]['metric']] =
		    met.slice(1);
	});

	/* flatten the object */
	rows = mod_jsprim.flattenObject(metric_map, 2);

	/* trim repeated decomp fields, figure out longest names */
	max_decomp_len = max_metric_len = 0;
	prev_decomp = '';
	rows.forEach(function (row) {
		/* find the longest strings to help formatting */
		if (row[0].length > max_decomp_len) {
			max_decomp_len = row[0].length;
		}
		if (row[1].length > max_metric_len) {
			max_metric_len = row[1].length;
		}

		if (!opts.verbose) {
			/* swap blanks for repeated decomp values */
			if (row[0] === prev_decomp || row[0] == 'undefined') {
				row[0] = '';
			} else {
				prev_decomp = row[0];
			}
		} else {
			if (row[0] === 'undefined') {
				row[0] = '';
			}
		}
	});

	/* make a column for each operation (e.g. median, average) */
	columns = [ {
		'label': opts.decomp.toUpperCase(),
		'width': max_decomp_len
	}, {
		'label': 'METRIC',
		'width': max_metric_len
	} ];
	opts.operations.forEach(function (op) {
		columns.push({
			'label': op.toUpperCase(),
			'width': 10,
			'align': 'right'
		});
	});

	/* print the table */
	mod_tab.emitTable({
		'columns': columns,
		'rows': rows,
		'omitHeader': opts.no_header
	});

	/* print an extra line to make streaming output more readable */
	console.log();
}

function parseCommaSepStringNoEmpties(option, optstr, arg) {
	/* JSSTYLED */
	return arg.trim().split(/\s*,\s*/g)
	    .filter(function (part) { return part; });
}

/* parse arguments */
function parseOpts() {
	mod_dashdash.addOptionType({
		'name': 'commaSepString',
		'takesArg': true,
		'helpArg': 'STRING',
		'parseArg': parseCommaSepStringNoEmpties
	});

	var options = [ {
		'names': ['help', 'h'],
		'type': 'bool',
		'help': 'print help and exit'
	}, {
		'names': ['metrics', 'm'],
		'type': 'commaSepString',
		'helpArg': 'FIELD[,FIELD]',
		'help': 'comma separated list of JSON fields to track'
	}, {
		'names': ['operations', 'o'],
		'type': 'commaSepString',
		'helpArg': '[sum,average,median,count]',
		'help': 'name of the operation(s) to perform on observed'
		    + ' metrics'
	}, {
		'names': ['decomp', 'd'],
		'type': 'string',
		'helpArg': 'FIELD',
		'help': '[optional] JSON field to use to break down metrics',
		'default': ''
	}, {
		'names': ['num', 'n'],
		'type': 'positiveInteger',
		'helpArg': 'NUM',
		'help': '[optional] number of readings to keep'
	}, {
		'names': ['summary', 's'],
		'type': 'bool',
		'help': '[optional] only print table when input is done'
	}, {
		'names': ['no-header', 'H'],
		'type': 'bool',
		'help': '[optional] do not print header row'
	}, {
		'name': 'v',
		'type': 'bool',
		'help': '[optional] always print decomp values'
	} ];

	var parser = mod_dashdash.createParser({'options': options});
	try {
		var opts = parser.parse(process.argv);
	} catch (e) {
		console.error('error: %s', e.message);
		process.exit(1);
	}

	function usage() {
		var help = parser.help({includeEnv: true}).trimRight();
		console.log('usage: node ' + __filename + ' [OPTIONS]\n' +
		    'options:\n' +
		    help);
	}

	if (opts.help) {
		usage();
		process.exit(0);
	}

	if (!opts.metrics) {
		console.log('list of metrics required (-m, --metrics)');
		usage();
		process.exit(1);
	}

	if (!opts.operations) {
		console.log('operation(s) required (-o, --operation)');
		usage();
		process.exit(1);
	}

	opts.operations.forEach(function (op) {
		if (SUPPORTED_OPERATIONS.indexOf(op) < 0) {
			console.log('invalid operation name. Must be one of',
			    SUPPORTED_OPERATIONS);
			usage();
			process.exit(1);
		}
	});

	return ({
		'metrics': opts.metrics,
		'decomp': opts.decomp,
		'count': opts.num,
		'operations': opts.operations,
		'summary': opts.summary,
		'no_header': opts.no_header,
		'verbose': opts.v
	});
}

main();
