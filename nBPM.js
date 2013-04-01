var async = require('async');
var http = require('http');
var uuid = require('node-uuid');
var execPool = require('./executionPool.js');
var history = require('./historyManager.js');
var globals = require('./globals.js');

var Process = function(procName, activities) {

  var processUUID = uuid.v4();
  var processName = procName;
  var procID = processName + ':' + processUUID;
  var processActivities = activities;
  var executionPool = execPool.createExecutionPool(procID);
  var historyManager = history.createHistoryManager(procID);
  var pendingTransaction = null;
  var nextExecuting = 0;
  var savingTag = false;
  var pendingActivities = [];

  //HTTP Server to receive events
  var server = http.createServer(function (req, res) {

    var chunked = '';

    req.on('data', function (data) {
      chunked += data;
    });

    req.on('end', function (data) {

      var event = JSON.parse(chunked);
      var activitiesAcceptEvent = [];

      executionPool.getArray(function(err, executionPool) {

        //Elements can be pushed when an activity is executed, but this
        //activities must not receive the event
        var actualLength = executionPool.length;

        for (var i = 0; i < actualLength; i++) {

          var tag = executionPool[i].tag;

          if (executionPool[i].state == globals.states.WAITING &&
              processActivities[tag].filter(executionPool[i].dataActivities, event)) {
            executeActivity(executionPool[i]['_id'], event);
            activitiesAcceptEvent.push(executionPool[i].tag);
          }
        }

        var doc = {
          type: globals.trackType.EVENT,
          event: event,
          activitiesAcceptEvent: activitiesAcceptEvent
        };

        historyManager.insertHistoryEvent(doc);

      });

      res.end();
      req.destroy();

    });

  });

  //Private Functions
  var next = function (indexCompletedActivity, tagsAndCardinalities, data) {

    nextExecuting++;

    executionPool.findByID(indexCompletedActivity, function(err, doc) {

      if (doc && doc.state === globals.states.COMPLETED) {
        console.log('ERROR: This activity already executed next()');
      } else {

        var onMarkedAsCompleted = function(err, records) {

          for (var j = 0; j < tagsAndCardinalities.length; j++) {

            var tag = tagsAndCardinalities[j].tag,
                cardinality = tagsAndCardinalities[j].cardinality || 1,
                nextExc = tagsAndCardinalities[j].nextExc || false;

            //Look for the tag in the execution pool
            executionPool.findByTagCardinalityNotReached(tag, function(tag, cardinality, nextExc, last, err, doc) {

              //If the document does not exist, we have to create it
              if (!doc) {
                doc = {};
                doc.tag = tag;
                doc.nextExc = nextExc;
                doc.dataActivities = [];
                doc.invocations = 0;
              }

              var totalInvocations = doc.invocations;
              doc.invocations = (totalInvocations !== cardinality) ? totalInvocations + 1 : totalInvocations;
              doc.dataActivities[totalInvocations] = data;

              //Set new state
              doc.state = (doc.invocations === cardinality) ? globals.states.WAITING :
                  globals.states.CARDINALITY_NOT_REACHED;

              //Update execution pool
              executionPool.save(doc, function(err, records) {

                var indexNextActivity = doc['_id'] || records['_id'];

                //activity will be executed either nextExc === true or activity filter returns true
                if (doc.state === globals.states.WAITING &&
                    (nextExc || processActivities[tag].filter(doc.dataActivities))) {

                  executeActivity(indexNextActivity);
                }

                if (last) {
                  nextExecuting--;

                  //Transactions will be stored once all activities have been updated in the data base
                  if (nextExecuting === 0 && pendingTransaction) {
                    insertTag();
                  }
                }
              });

            }.bind({}, tag, cardinality, nextExc, j === tagsAndCardinalities.length - 1));
          }
        };

        //Tags Array
        var tags = [];
        for (var i = 0; i < tagsAndCardinalities.length; i++) {
          tags.push(tagsAndCardinalities[i].tag);
        }

        if (indexCompletedActivity !== -1) {   //-1 when start

          executionPool.updateState(indexCompletedActivity, globals.states.COMPLETED, onMarkedAsCompleted);

          var docHistory = {
            id: indexCompletedActivity,
            type: globals.trackType.ACTIVITY,
            tag: doc.tag,
            result: data,
            nextTags: tags
          };

          historyManager.insertHistoryEvent(docHistory);
        } else {
          onMarkedAsCompleted(null, null);
        }
      }
    });
  };

  var end = function (index, data) {

    executionPool.findByID(index, function(err, doc) {

      var historyDoc = {
        id: index,
        tag: doc.tag,
        type: globals.trackType.PROCESS_END,
        data: data
      };

      historyManager.insertHistoryEvent(historyDoc, function () {
        server.close();
        historyManager.finalize();
        executionPool.finalize();
      });

    });
  };

  var executeActivity = function (index, event) {

    executionPool.findByID(index, function(err, doc) {

      if (err) {
        console.log('Error reading execution pool from MongoDB');

      } else {

        //Activities should not be executed until the tag has been properly saved
        if (!savingTag) {
          executionPool.updateState(index, globals.states.PROCESSING, function(err, count) {
            process.nextTick(processActivities[doc.tag].exec.bind({}, doc.dataActivities, event,
                next.bind(this, index), end.bind(this, index)));
          });
        } else {
          pendingActivities.push({index: index, event: event});
        }
      }
    });
  };

  var insertTag = function() {

    //Tags can only be created when no activities are either running or executing next
    if (nextExecuting === 0) {

      savingTag = true;

      executionPool.getArray(function(err, executionPool) {

        //FIXME: Look for a processing activity?!

        var processing = false;
        for (var i = 0; i < executionPool.length && !processing; i++) {
          if(executionPool[i].status === globals.states.PROCESSING) {
            processing = true;
          }
        }

        //Transactions can only be stored when there is no activities being processed
        if (!processing) {

          var doc = {
            type: globals.trackType.TAG,
            name: pendingTransaction,
            executionPool: executionPool
          };

          historyManager.insertHistoryEvent(doc);
          console.log('Transaction ' + pendingTransaction + ' created!');
          pendingTransaction = undefined;

        }

        savingTag = false;

        var activity = pendingActivities.shift();
        while (activity) {
          executeActivity(activity.index, activity.event);
          activity = pendingActivities.shift();
        }
      });
    }
  };

  this.start = function(tag, input) {

    //Initalize Execution Pool
    executionPool.initialize(function(err, results) {
      if (err) {
        console.log('Unable to start the process:  Cannot connect to MongoDB')
      } else {

        //Initialize history manager
        historyManager.initialize(function(err, results) {
          if (err) {
            console.log('Unable to start the process:  Cannot connect to MongoDB')
            executionPool.finalize();
          } else {

            //Start server
            server.listen(0, 'localhost', function() {
              var address = server.address();
              console.log('Process ' + processName + ' (ID: ' + processUUID + ') listening events on '
                  + address.address + ':' + address.port);

              //Launch the process
              next(-1, [{tag: tag}], input);
            });
          }
        })
      }
    });
  };

  this.setTransactionTag = function(tag) {
    if (pendingTransaction) {

      console.log('The transaction ' + pendingTransaction + ' has not been created yet. Please create a new ' +
          'transaction when this transaction is created');
    } else {

      historyManager.findTagByID(tag, function(err, doc) {
        if (!doc){

          //FIXME: Processing Activities should change its state to Waiting before saving the execution pool?
          //FIXME: Activities are waited to finish and then the transaction is set
          pendingTransaction = tag;
          insertTag();
        } else {
          console.log('The tag ' + tag + ' already exists');
        }
      });
    }
  };

  this.rollback = function(tag, callback) {


    historyManager.getArray(function(err, history) {

      if (err) {
        callback({ error: 'MongoDB Error' });
      } else {

        var tagIndex = -1;
        var tmpExcPool;

        for (var i = 0; i < history.length && tagIndex === -1; i++) {
          var doc = history[i];

          if (doc.type === globals.trackType.TAG && doc.name === tag) {
            tmpExcPool = doc.executionPool;
            tagIndex = i;
          }
        }

        if (tagIndex !== -1) {

          var rollbackArray = [];
          //Fill the array with the rollbacks that should be executed
          for (var j = history.length -1; j > tagIndex; j--) {

            var doc = history[j];
            if (doc.type === globals.trackType.ACTIVITY) {
              rollbackArray.push(processActivities[doc.tag].rollback.bind({}, doc.result));
            }
          }

          //Execute rollbacks
          async.series(rollbackArray, function(err, results) {
            if (!err) {

              //Remove history
              for (var j= history.length -1; j > tagIndex; j--) {
                historyManager.removeDoc(history[j], function(err) {});
              }

              executionPool.replaceExecutionPool(tmpExcPool, function(err, records) {
                //Waiting activities which was executed with nextExc tag must be executed.
                //Waiting activities ready to execute (filter), must me started even if nextExc === false
                for (var j = 0; j < tmpExcPool.length; j++) {
                  if (tmpExcPool[j].state === globals.states.WAITING && (tmpExcPool[j].nextExc === true ||
                      processActivities[tmpExcPool[j].tag].filter(tmpExcPool[j].dataActivities))){
                    executeActivity(tmpExcPool[j]['_id']);
                  }
                }

                //Null argument to indicate that rollback has been executed without problems
                callback(null);
              });

            } else {

              //Error should include the tag (err.tag) and an error description (err.error)
              var rollBackError = {
                type: globals.trackType.ROLLBACK_ERROR,
                tag: tag,
                activityError: err.tag,
                error: err.error
              }

              historyManager.insertHistoryEvent(rollBackError);

              callback(err);
            }
          });

        } else {
          callback({error: 'Tag ' + tag + ' has not been found'});
        }
      }
    });
  };

};

exports.createProcess = function (procName, activities) {
  return new Process(procName, activities);
};