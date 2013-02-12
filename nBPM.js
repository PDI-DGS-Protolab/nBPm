var http = require('http');

//Stores information about the activities that have been executed and will be executed
var processActivities = {};
var executionPool = {};

//HTTP Server to receive events
var server = http.createServer(function (req, res) {

  var chunked = '';

  req.on('data', function(data) {

    chunked += data;
  });

  req.on('end', function(data) {

    var event = JSON.parse(chunked);

    for (var tag in executionPool) {
      if (!executionPool[tag].executed &&
          processActivities[tag].filter(executionPool[tag].dataActivities, event)){
        executeActivity(tag, event);
      }
    }

    res.end();
    req.destroy();
  });

}).listen(5001, 'localhost');

var end = function() {
  server.close();
}

var next = function(tag, data, cardinality) {

  //Increase the cardinality
  if (!executionPool[tag]) {
    executionPool[tag] = {};

    //Set executed as false
    executionPool[tag].executed = false;

    //Set data
    executionPool[tag].dataActivities = [];
    executionPool[tag].dataActivities[0] = data;

    //Set cardinality
    executionPool[tag].actualCardinality = 1;
  } else {

    var actualCardinality = executionPool[tag].actualCardinality;

    //Set data
    executionPool[tag].dataActivities[actualCardinality] = data;

    //Increase cardinality
    executionPool[tag].actualCardinality = actualCardinality + 1;
  }

  //Default value
  cardinality = cardinality || 1;

  //Execute the activity only if the cardinality has been reached
  if (executionPool[tag].actualCardinality == cardinality) {

    //Execute only if filter function returns true
    if (processActivities[tag].filter(executionPool[tag].dataActivities)) {
      executeActivity(tag);
    }

  }
}

var executeActivity = function(tag, event) {
  processActivities[tag].exec(executionPool[tag].dataActivities, event, next, end);
  executionPool[tag].executed = true;
}

exports.process = function(activities) {
  processActivities = activities;
}

exports.start = function(tag, input) {
  next(tag, input, 1);
}





