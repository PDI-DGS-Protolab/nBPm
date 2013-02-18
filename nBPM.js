var http = require('http');
var globals = require('./globals.js');
var mongodb = require('mongodb');
var configMongo = require('./config.js').mongoConfig;

var processActivities = {};
var executionPool = [];
var processName;

//MongoDB Client
var mongoClient = new mongodb.Db(configMongo.mongoDB, new mongodb.Server(
    configMongo.mongoHost, configMongo.mongoPort, {}));

mongoClient.open(function (err, pClient) {
  if (err) {
    console.log('Cannot connect to MongoDB...')
  }
});

var insertDataIntoCollection = function (doc, callback) {

  mongoClient.collection(processName, function (err, collection) {
    if (err) {
      console.log('Error: cannot create/access to the collection of the process ' + processName);
    } else {

      collection.insert(doc, function (err, docs) {
        if (err) {
          console.log('Error: The document cannot be stored in MongoBD');
        }

        if (callback) {
          callback();
        }
      });
    }
  });
};

//HTTP Server to receive events
var server = http.createServer(function (req, res) {

  var chunked = '';

  req.on('data', function (data) {
    chunked += data;
  });

  req.on('end', function (data) {

    var event = JSON.parse(chunked);
    var activitiesAcceptEvent = [];

    //Elements can be pushed when an activity is executed, but this
    //activities must not receive the event
    var actualLength = executionPool.length;

    for (var i = 0; i < actualLength; i++) {

      var tag = executionPool[i].tag;

      if (executionPool[i].state == globals.states.WAITING &&
          processActivities[tag].filter(executionPool[i].dataActivities, event)) {
        executeActivity(i, event);
        activitiesAcceptEvent.push(executionPool[i].tag);
      }
    }

    var doc = {
      type: globals.trackType.EVENT,
      event: event,
      activitiesAcceptEvent: activitiesAcceptEvent
    };
    insertDataIntoCollection(doc);

    res.end();
    req.destroy();

  });

}).listen(5001, 'localhost');

var next = function (indexCompletedActivity, tagsAndCardinalities, data) {

  var tags = [];
  //Array with the tags
  for (var i = 0; i < tagsAndCardinalities.length; i++) {
    tags.push(tagsAndCardinalities[i].tag);
  }

  if (indexCompletedActivity !== -1) {   //-1 when start

    executionPool[indexCompletedActivity].state = globals.states.COMPLETED;

    var doc = {
      id: indexCompletedActivity,
      type: globals.trackType.ACTIVITY,
      tag: executionPool[indexCompletedActivity].tag,
      result: data,
      nextTags: tags
    };

    insertDataIntoCollection(doc);
  }

  for (var j = 0; j < tagsAndCardinalities.length; j++) {

    var tag = tagsAndCardinalities[j].tag;
    var cardinality = tagsAndCardinalities[j].cardinality || 1;
    var nextExc = tagsAndCardinalities[j].nextExc || false;

    //Look for the tag in the execution pool
    var indexNextActivity = -1;

    for (var i = 0; i < executionPool.length && indexNextActivity === -1; i++) {

      //and its cardinality has not been reached
      if (executionPool[i].tag === tag &&
          executionPool[i].state === globals.states.CARDINALITY_NOT_REACHED) {

        var totalInvocations = executionPool[i].invocations;

        //Set data
        executionPool[i].dataActivities[totalInvocations] = data;
        //executionPool[indexNextActivity].
        //    dataActivities[executionPool[indexCompletedActivity].state] = data;

        //Increase cardinality
        executionPool[i].invocations = totalInvocations + 1;

        indexNextActivity = i;
      }
    }

    if (indexNextActivity === -1) {
      var activityInfo = {};

      //Set tag
      activityInfo.tag = tag;

      //Set nextExc
      activityInfo.nextExc = nextExc;

      //Set data
      activityInfo.dataActivities = [];
      //activityInfo.dataActivities[executionPool[indexCompletedActivity].state] = data;
      activityInfo.dataActivities[0] = data;

      //Set cardinality
      activityInfo.invocations = 1;

      //Push activity into the execution Pool
      indexNextActivity = executionPool.push(activityInfo) - 1;
    }

    //If the cardinality is reached, the state will be waiting (for new events)
    if (executionPool[indexNextActivity].invocations === cardinality) {

      executionPool[indexNextActivity].state = globals.states.WAITING;


      //Execute either nextExc was executed or filter returns true
      if (nextExc || processActivities[tag].filter(executionPool[indexNextActivity].dataActivities)) {
        executeActivity(indexNextActivity);
      }

    } else {
      executionPool[indexNextActivity].state = globals.states.CARDINALITY_NOT_REACHED;
    }
  }
};

var end = function (index, data) {
  var doc = {
    id: index,
    tag: executionPool[index].tag,
    type: globals.trackType.PROCESS_END,
    data: data
  };

  insertDataIntoCollection(doc, function () {
    mongoClient.close();
    server.close();
  });
};

var executeActivity = function (index, event) {

  var tag = executionPool[index].tag;
  executionPool[index].state = globals.states.PROCESSING;

  process.nextTick(processActivities[tag].exec.bind({}, executionPool[index].dataActivities, event,
      next.bind({}, index), end.bind({}, index)));

}

exports.process = function (procName, activities) {
  processName = procName;
  processActivities = activities;
};

exports.setTransactionTag = function(tag){
  var doc={
    type: globals.trackType.TAG,
    name: tag,
    executionPool: executionPool
  };

  insertDataIntoCollection(doc);
};

exports.rollBack = function(tag) {

  mongoClient.collection(processName, function (err, collection) {
    if (err) {
      console.log('Error: the event collection cannot be created');
    } else {

      collection.find().toArray(function(err, docs) {
        if (err) {
          console.log('Rollback cannot be executed due a MongoDB failure');
        } else {

          var indexTag = -1;
          var tmpExcPool;
          for (var i = 0; i < docs.length && indexTag === -1; i++) {
            var doc = docs[i];

            if (doc.type === globals.trackType.TAG && doc.name === tag) {
              tmpExcPool = doc.executionPool;
              indexTag = i;
            }
          }

          //Once the tag has been found, activities should be undone in reverse order
          for (var j = docs.length - 1; j > indexTag; j--){

            var doc = docs[j];

            if (doc.type === globals.trackType.ACTIVITY) {
              //Execute RollBack
              processActivities[executionPool[doc.id].tag].rollback(doc.result);
            }

            //FIXME: Delete log from MongoDB?
            collection.findAndRemove(doc, [['id', 1]], function(err) {

            });
          }

          if (indexTag !== -1) {
            executionPool = tmpExcPool;

            //Waiting activities which was executed with nextExc tag must be executed.
            //Waiting activities ready to execute (filter), must me started even if nextExc === false
            for (var i = 0; i < executionPool.length; i++) {

              //FIXME: Think me: state should be only WAITING??!
              if ((executionPool[i].state !== globals.states.COMPLETED
                  && executionPool[i].state !== globals.states.CARDINALITY_NOT_REACHED) &&
                  (executionPool[i].nextExc === true ||
                      processActivities[executionPool[i].tag].filter(executionPool[i].dataActivities))){

                executeActivity(i);
              }
            }
          } else {
            console.log('RollBack cannot be executed because the ID ' + tag + ' has not been found');
          }
        }
      });
    }
  });
};

exports.start = function (tag, input) {
  next(-1, [{tag: tag}], input);
};