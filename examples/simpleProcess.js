var nBPM = require('../nBPM.js');

var activities = {};
var processName = 'processA';
var rollBackExecuted = false;
var rollBackTag = 'transactionTAG1';

activities['activityA'] = {
  exec: function (dataActivities, event, next, end) {

    console.log('Executing Activity A');

    //Activity A code
    //...

    next([{tag: 'activityB'}, {tag: 'activityC', nextExc: true}], dataActivities[0] + ' + Activity A');
    process.setTransactionTag(rollBackTag);
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit, callback) {
    console.log('This activity cannot be undone...');
    callback(-1, null);
  }
};

activities['activityB'] = {
  exec: function (dataActivities, event, next, end) {

    console.log('Executing Activity B');

    //Activity B code
    //...

    next([{tag: 'activityD', cardinality: 2}], dataActivities[0] + ' + Activity B: ' + event.data);
  },

  filter: function (dataActivities, event) {

    if (!event) {
      return false;
    } else {
      if (!event.data) {
        return false
      } else {
        return true;
      }
    }
  },

  rollback: function (exit, callback) {
    console.log('Undoing Activity B. Exit: ' + exit);
    callback(null, 0);
  }
};

activities['activityC'] = {
  exec: function (dataActivities, event, next, end) {

    console.log('Executing Activity C');

    //Activity C code
    //...

    next([{tag: 'activityD', cardinality: 2}], dataActivities[0] + ' + Activity C: OWN PROCESSING');
  },

  filter: function (dataActivities, event) {

    return true;

    /*if (!event) {
      return false;
    } else {
      if (!event.data2) {
        return false
      } else {
        return true;
      }
    }*/
  },

  rollback: function (exit, callback) {
    console.log('Undoing Activity C. Exit: ' + exit);
    callback(null, 0);
  }
};

activities['activityD'] = {
  exec: function (dataActivities, event, next, end) {

    //Execute Rollback the first time...
    if (!rollBackExecuted) {

      process.rollback(rollBackTag, function(err) {
        if (err) {
          console.log(err);
        } else {
          console.log('Callback executed without problems!');
        }
      });
      rollBackExecuted = true;

    } else {

      console.log('executing activity D');

      //Activity D code
      //...

      console.log('Received data = ' + dataActivities);
      end(dataActivities);
    }
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit, callback) {
    console.log('This activity cannot be undone...');
    callback(-1, null);
  }
};

var process = nBPM.createProcess(processName, activities);
process.start('activityA', '¡EXAMPLE!');
