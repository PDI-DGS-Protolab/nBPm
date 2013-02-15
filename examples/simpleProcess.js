var nBPM = require('../nBPM.js');

var activities = {};
var processName = 'processA';
var rollBackExecuted = false;
var rollBackTag = 'transactionTAG1'

activities['activityA'] = {
  exec: function (dataActivities, event, next, nextExc, end) {

    console.log('Executing Activity A');

    //Activity A code
    //...

    next(['activityB', 'activityC'], dataActivities[0] + ' + Activity A');
    nBPM.insertTag(rollBackTag);
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit) {
    console.log('This activity cannot be undone...');
    return -1;
  }
};

activities['activityB'] = {
  exec: function (dataActivities, event, next, nextExc, end) {

    console.log('Executing Activity B');

    //Activity B code
    //...

    next(['activityD'], dataActivities[0] + ' + Activity B: ' + event.data, 2);
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

  rollback: function (exit) {
    console.log('Undoing Activity B. Exit: ' + exit);
    return 0;
  }
};

activities['activityC'] = {
  exec: function (dataActivities, event, next, nextExc, end) {

    console.log('Executing Activity C');

    //Activity C code
    //...

    next(['activityD'], dataActivities[0] + ' + Activity C: ' + event.data, 2);
  },

  filter: function (dataActivities, event) {

    if (!event) {
      return false;
    } else {
      if (!event.data2) {
        return false
      } else {
        return true;
      }
    }
  },

  rollback: function (exit) {
    console.log('Undoing Activity C. Exit: ' + exit);
    return 0;
  }
};

activities['activityD'] = {
  exec: function (dataActivities, event, next, nextExc, end) {

    //Execute Rollback the first time...
    if (!rollBackExecuted) {

      nBPM.rollBack(rollBackTag);
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

  rollback: function (exit) {
    console.log('This activity cannot be undone...');
    return -1;
  }
};

nBPM.process('processA', activities);

setTimeout(function () {
  //To be replaced by start function.
  nBPM.start('activityA', '¡EXAMPLE!');
}, 100);