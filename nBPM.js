var http = require('http');
var mongodb = require('mongodb');
var uuid = require('node-uuid');
var globals = require('./globals.js');
var configMongo = require('./config.js').mongoConfig;

var Process = function(procName, activities) {
  var processUUID = uuid.v4();
  var processName = procName;
  var mongoIdentifier = processName + ':' + processUUID;
  var processActivities = activities;
  var pendingTransaction = null;

  //MongoDB Client
  var mongoClient = new mongodb.Db(configMongo.mongoDB, new mongodb.Server(
    configMongo.mongoHost, configMongo.mongoPort, {}));

  //HTTP Server to receive events
  var server = http.createServer(function (req, res) {

    var chunked = '';

    req.on('data', function (data) {
      chunked += data;
    });

    req.on('end', function (data) {

      var event = JSON.parse(chunked);
      var activitiesAcceptEvent = [];

      mongoClient.collection(mongoIdentifier + ':' + globals.EXCPOOL_SUFFIX, function (err, collection) {
        collection.find().toArray(function(err, executionPool) {

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
          insertDataIntoCollection(doc);

        });
      });

      res.end();
      req.destroy();

    });

  });

  //Private Functions
  var insertDataIntoCollection = function (doc, callback) {

    mongoClient.collection(mongoIdentifier, function (err, collection) {
      if (err) {
        console.log('Error: cannot create/access to the collection of the process ' + processName +
            ' (ID: ' + processUUID + ')');
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

  var next = function (indexCompletedActivity, tagsAndCardinalities, data) {

    mongoClient.collection(mongoIdentifier + ':' + globals.EXCPOOL_SUFFIX, function (err, collection) {

      collection.findOne({_id: indexCompletedActivity}, function(err, doc) {

        if (doc && doc.state === globals.states.COMPLETED) {
          console.log('ERROR: This activity already executed next()');
        } else {

          var onMarkedAsCompleted = function(err, count) {
            for (var j = 0; j < tagsAndCardinalities.length; j++) {

              var tag = tagsAndCardinalities[j].tag;
              var cardinality = tagsAndCardinalities[j].cardinality || 1;
              var nextExc = tagsAndCardinalities[j].nextExc || false;

              //Look for the tag in the execution pool
              collection.findOne({tag: tag}, function(tag, cardinality, nextExc, err, doc) {

                if (!doc) {

                  doc = {};

                  //Set tag
                  doc.tag = tag;

                  //Set nextExc
                  doc.nextExc = nextExc;

                  //Set data
                  doc.dataActivities = [];
                  doc.dataActivities[0] = data;

                  //Set cardinality
                  doc.invocations = 1;

                } else {

                  var totalInvocations = doc.invocations;

                  if (totalInvocations !== cardinality) {
                    doc.invocations = totalInvocations + 1;
                  }

                  doc.dataActivities[totalInvocations] = data;
                }

                if (doc.invocations === cardinality) {
                  doc.state = globals.states.WAITING;
                } else {
                  doc.state = globals.states.CARDINALITY_NOT_REACHED;
                }

                var onInserted = function(indexNextActivity) {
                  if (doc.state === globals.states.WAITING &&
                      (nextExc || processActivities[tag].filter(doc.dataActivities))) {
                    executeActivity(indexNextActivity);
                  }
                }

                if (!doc['_id']) {
                  collection.insert(doc, {safe: true}, function(err, records) {
                    var indexNextActivity = records[0]['_id'];
                    onInserted(indexNextActivity);
                  });
                } else {
                  var indexNextActivity = doc['_id'];
                  collection.update({_id: doc['_id']}, doc, onInserted.bind({}, indexNextActivity));
                }
              }.bind({}, tag, cardinality, nextExc));
            }
          };

          //Tags Array
          var tags = [];
          for (var i = 0; i < tagsAndCardinalities.length; i++) {
            tags.push(tagsAndCardinalities[i].tag);
          }

          if (indexCompletedActivity !== -1) {   //-1 when start

            collection.update({_id: indexCompletedActivity}, {$set: {state: globals.states.COMPLETED}}, onMarkedAsCompleted);

            var docHistory = {
              id: indexCompletedActivity,
              type: globals.trackType.ACTIVITY,
              tag: doc.tag,
              result: data,
              nextTags: tags
            };

            insertDataIntoCollection(docHistory);

            if(pendingTransaction) {
              insertTag();
            }
          } else {
            onMarkedAsCompleted();
          }
        }
      });
    });
  };

  var end = function (index, data) {


    mongoClient.collection(mongoIdentifier + ':' + globals.EXCPOOL_SUFFIX, function (err, collection) {

      collection.findOne({_id: index}, function(err, doc) {

        var doc = {
          id: index,
          tag: doc.tag,
          type: globals.trackType.PROCESS_END,
          data: data
        };

        insertDataIntoCollection(doc, function () {
          mongoClient.close();
          server.close();
        });
      });
    });
  };

  var executeActivity = function (index, event) {

    mongoClient.collection(mongoIdentifier + ':' + globals.EXCPOOL_SUFFIX, function (err, collection) {

      collection.findOne({_id: index}, function(err, doc) {
        if (err) {

          console.log('Error reading execution pool from MongoDB');
        } else {

          var tag = doc.tag;

          collection.update({_id: index}, {$set: {state: globals.states.PROCESSING}}, function(err, count) {
            process.nextTick(processActivities[tag].exec.bind({}, doc.dataActivities, event,
                next.bind(this, index), end.bind(this, index)));
          });
        }
      });
    });
  };

  var insertTag = function() {

    var processing = false;
    for (var i = 0; i < executionPool && !processing; i++) {
      if(executionPool[i].status === globals.states.PROCESSING) {
        processing = true;
      }
    }

    if (!processing) {

      var doc={
        type: globals.trackType.TAG,
        name: pendingTransaction,
        executionPool: executionPool
      };

      insertDataIntoCollection(doc);
      console.log('Transaction ' + pendingTransaction + ' created!');
      pendingTransaction = undefined;

    }
  };

  this.start = function(tag, input) {

    //Start MongoClient
    mongoClient.open(function (err, pClient) {
      if (err) {
        console.log('Unable to start the process:  Cannot connect to MongoDB')
      } else {
        //Start server
        server.listen(0, 'localhost', function() {
          var address = server.address();
          console.log('Process ' + processName + ' (ID: ' + processUUID + ') listening events on ' + address.address + ':' + address.port);

          //Launch the process
          next(-1, [{tag: tag}], input);
        });
      }
    });
  };

  this.setTransactionTag = function(tag) {
    if (pendingTransaction) {

      console.log('The transaction ' + pendingTransaction + ' has not been created yet. Please create a new ' +
          'transaction when this transaction is created');
    } else {
      mongoClient.collection(mongoIdentifier, function(err, collection) {
        collection.findOne({ type: globals.trackType.TAG, name: tag }, function (err, doc) {

          if (!doc){

            //FIXME: Processing Activities should change its state to Waiting before saving the execution pool?
            //FIXME: Activities are waited to finish and then the transaction is set
            pendingTransaction = tag;
            insertTag();
          } else {
            console.log('The tag ' + tag + ' already exists');
          }
        });
      });
    }
  };

  this.rollBack = function(tag) {
    mongoClient.collection(processName, function (err, collection) {
      if (err) {
        console.log('Error: the event collection cannot be accessed');
      } else {

        collection.find().toArray(function(err, docs) {
          if (err) {
            console.log('Rollback cannot be executed due a MongoDB failure');
          } else {

            var tagIndex = -1;
            var tmpExcPool;
            for (var i = 0; i < docs.length && tagIndex === -1; i++) {
              var doc = docs[i];

              if (doc.type === globals.trackType.TAG && doc.name === tag) {
                tmpExcPool = doc.executionPool;
                tagIndex = i;
              }
            }

            var rollBackErrorIndex = -1;

            //Once the tag has been found, activities should be undone in reverse order
            for (var j = docs.length - 1; j > tagIndex && rollBackErrorIndex === -1; j--){

              var doc = docs[j];

              if (doc.type === globals.trackType.ACTIVITY) {

                //Execute RollBack
                var error = processActivities[executionPool[doc.id].tag].rollback(doc.result);
                if (error !== 0){
                  rollBackErrorIndex = j;
                }
              }

              //FIXME: Delete log from MongoDB? At this point or later when all rollbacks have been executed properly?
              collection.findAndRemove(doc, [['id', 1]], function(err) {

              });
            }

            //If there was an error executing rollback
            if (rollBackErrorIndex !== -1) {

              console.log('ERROR: There was an error executing a rollback function. Abort');

              var rollBackError = {
                type: globals.trackType.ROLLBACK_ERROR,
                actualState: executionPool,
                rollBackState: tmpExcPool,
                activityError: executionPool[docs[rollBackErrorIndex].id].tag,
                input: docs[rollBackErrorIndex].result,
                error: error
              }

              insertDataIntoCollection(rollBackError);

            } else if (tagIndex !== -1) {

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

};

exports.createProcess = function (procName, activities) {
  return new Process(procName, activities);
};