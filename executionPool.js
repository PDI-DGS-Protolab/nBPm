var async = require('async');
var mongodb = require('mongodb');
var configMongo = require('./config.js').mongoConfig;
var globals = require('./globals.js');

var ExecutionPool = function(procID) {

  var mongoIdentifier = procID, collection,
      mongoClient = new mongodb.Db(configMongo.mongoDB,
          new mongodb.Server(configMongo.mongoHost, configMongo.mongoPort), { w: 1 });

  this.initialize = function(callback) {
    mongoClient.open(function(err, pClient) {
      mongoClient.collection(mongoIdentifier + ':' + globals.EXCPOOL_SUFFIX, function (err, col) {
        collection = col;
        callback(err, null);
      });
    });
  };

  this.finalize = function(callback) {
    mongoClient.close(callback);
  };

  this.findByID = function(id, callback) {
    collection.findOne({_id: id}, callback);
  };

  this.findByTagCardinalityNotReached = function(tag, callback) {
    collection.findOne({tag: tag, state: globals.states.CARDINALITY_NOT_REACHED}, callback);
  }

  this.save = function(doc, callback) {
    collection.save(doc, { safe: true } , callback);
  };

  this.updateState = function(id, newState, callback) {
    collection.update({ _id: id }, { $set: { state: newState } }, callback);
  };

  this.getArray = function(callback) {
    collection.find().toArray(callback);
  }

  this.replaceExecutionPool = function(newExecutionPool, callback) {
    collection.drop(function() {

      var mongoPetitions = [];

      for (var i = 0; i < newExecutionPool.length; i++) {
        mongoPetitions.push(function(i, callback) {
          collection.insert(newExecutionPool[i], {safe: true}, callback);
        }.bind({}, i));
      }

      async.parallel(mongoPetitions, callback);
    });
  };
}

exports.createExecutionPool = function (procID) {
  return new ExecutionPool(procID);
};