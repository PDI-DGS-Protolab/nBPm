var http = require('http');
var globals = require('./globals.js');

//Stores information about the activities that have been executed and will be executed
var processActivities = {};
var executionPool = [];

//HTTP Server to receive events
var server = http.createServer(function (req, res) {

  var chunked = '';

  req.on('data', function (data) {

    chunked += data;
  });

  req.on('end', function (data) {

    var event = JSON.parse(chunked);

    //Elements can be pushed when an activity is executed, but this
    //activities must not receive the event
    var actualLength = executionPool.length;

    for (var i = 0; i < actualLength; i++) {

      var tag = executionPool[i].tag;

      if (executionPool[i].state == globals.states.WAITING &&
          processActivities[tag].filter(executionPool[i].dataActivities, event)) {
        executeActivity(i, event);
      }
    }

    res.end();
    req.destroy();

  });

}).listen(5001, 'localhost');

var next = function (indexCompletedActivity, nextExc, tag, data, cardinality) {

  if (indexCompletedActivity !== -1) {   //-1 when start
    executionPool[indexCompletedActivity].state = globals.states.COMPLETED;
  }

  //Look for the tag in the execution pool
  var found = false;
  var indexNextActivity = -1;

  for (var i = 0; i < executionPool.length && !found; i++) {

    //and not finished and/or executed

    if (executionPool[i].tag === tag && (executionPool[i].state === globals.states.WAITING
        || executionPool[i].state === globals.states.CARDINALITY_NOT_REACHED)) {

      var actualCardinality = executionPool[i].actualCardinality;

      //Set data
      executionPool[i].dataActivities[actualCardinality] = data;
      //executionPool[indexNextActivity].
      //    dataActivities[executionPool[indexCompletedActivity].state] = data;

      //Increase cardinality
      executionPool[i].actualCardinality = actualCardinality + 1;

      found = true;
      indexNextActivity = i;
    }
  }

  if (!found) {
    var activityInfo = {};

    //Set tag
    activityInfo.tag = tag;

    //Set data
    activityInfo.dataActivities = [];
    //activityInfo.dataActivities[executionPool[indexCompletedActivity].state] = data;
    activityInfo.dataActivities[0] = data;

    //Set cardinality
    activityInfo.actualCardinality = 1;

    //Push activity into the execution Pool
    indexNextActivity = executionPool.push(activityInfo) - 1;
  }

  //Default value
  cardinality = cardinality || 1;

  //Execute the activity only if the cardinality has been reached
  if (executionPool[indexNextActivity].actualCardinality === cardinality) {

    executionPool[indexNextActivity].state = globals.states.WAITING;

    //Execute only if filter function returns true
    if (nextExc || processActivities[tag].filter(executionPool[indexNextActivity].dataActivities)) {
      executeActivity(indexNextActivity);
    }

  } else {
    executionPool[indexNextActivity].state = globals.states.CARDINALITY_NOT_REACHED;
  }
}

var end = function () {
  server.close();
}

var executeActivity = function (index, event) {

  var tag = executionPool[index].tag;

  executionPool[index].state = globals.states.PROCESSING;
  processActivities[tag].exec(executionPool[index].dataActivities, event,
      next.bind({}, index, false), next.bind({}, index, true), end);
}

exports.process = function (activities) {
  processActivities = activities;
}

exports.start = function (tag, input) {
  next(-1, false, tag, input, 1);
}





