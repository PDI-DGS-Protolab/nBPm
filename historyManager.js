var async = require('async');
var mongodb = require('mongodb');
var globals = require('./globals.js');
var configMongo = require('./config.js').mongoConfig;

var HistoryManager = function(procID) {

  var mongoIdentifier = procID, collection,
      mongoClient = new mongodb.Db(configMongo.mongoDB,
          new mongodb.Server(configMongo.mongoHost, configMongo.mongoPort), { w: 1 });

  this.initialize = function(callback) {
    mongoClient.open(function(err, pClient) {
      mongoClient.collection(mongoIdentifier, function (err, col) {
        collection = col;
        callback(err, null);
      });
    });
  };

  this.finalize = function(callback) {
    mongoClient.close(callback);
  };

  this.insertHistoryEvent = function (doc, callback) {

    collection.insert(doc, function (err, docs) {
      if (err) {
        console.log('Error: The document cannot be stored in MongoBD');
      }

      if (callback) {
        callback();
      }
    });
  };

  this.findTagByID = function(id, callback) {
    collection.findOne({ type: globals.trackType.TAG, name: id }, callback);
  };

  this.getArray = function(callback) {
    collection.find().toArray(callback);
  };

  this.removeDoc = function(doc, callback) {
    collection.findAndRemove(doc, [['id', 1]], callback);
  }
}

exports.createHistoryManager = function (procID) {
  return new HistoryManager(procID);
};