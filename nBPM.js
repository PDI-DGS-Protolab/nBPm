var http = require('http');

//Stores information about the activities that have been executed and will be executed
var processActivities = {};
var executionPool = [];

//HTTP Server to receive events
var server = http.createServer(function (req, res) {

  var chunked = '';

  req.on('data', function(data) {

    chunked += data;
  });

  req.on('end', function(data) {

    var event = JSON.parse(chunked);

    //Elements can be pushed when an activity is executed, but this
    //activities must not receive the event
    var actualLength = executionPool.length;

    for (var i = 0; i < actualLength; i++) {

      var tag = executionPool[i].tag;

      if (!executionPool[i].executed &&
          processActivities[tag].filter(executionPool[i].dataActivities, event)){
        executeActivity(i, event);
      }
    }

    res.end();
    req.destroy();

  });

}).listen(5001, 'localhost');

var next = function(tag, data, cardinality) {

  //Look for the tag in the execution pool
  var found = false;
  for (var i = 0; i < executionPool.length && !found; i++) {

    //and not finished and/or executed

    if (executionPool[i].tag === tag) {
      found = true;
    }
  }

  var index = i - 1;

  if (!found) {
    var activityInfo = {};

    //Set tag
    activityInfo.tag = tag;

    //Set executed as false
    activityInfo.executed = false;

    //Set data
    activityInfo.dataActivities = [];
    activityInfo.dataActivities[0] = data;

    //Set cardinality
    activityInfo.actualCardinality = 1;

    //Push activity into the execution Pool
    index = executionPool.push(activityInfo) - 1;
  } else {
    var actualCardinality = executionPool[index].actualCardinality;

    //Set data
    executionPool[index].dataActivities[actualCardinality] = data;

    //Increase cardinality
    executionPool[index].actualCardinality = actualCardinality + 1;
  }

  //Default value
  cardinality = cardinality || 1;

  //Execute the activity only if the cardinality has been reached
  if (executionPool[index].actualCardinality === cardinality) {

    //Execute only if filter function returns true
    if (processActivities[tag].filter(executionPool[index].dataActivities)) {
      executeActivity(index);
    }

  }
}

var end = function() {
  server.close();
}

var executeActivity = function(index, event) {

  var tag = executionPool[index].tag;

  processActivities[tag].exec(executionPool[index].dataActivities, event, next, end);
  executionPool[index].executed = true;
}

exports.process = function(activities) {
  processActivities = activities;
}

exports.start = function(tag, input) {
  next(tag, input, 1);
}





