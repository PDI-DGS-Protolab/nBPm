var nBPM = require('../nBPM.js');

var activities = {};
var processName = 'processA';
var rollBackExecuted = false;
var rollBackTag = 'transactionTAG1'

activities['activityA'] = {
  exec: function (dataActivities, event, next, end) {

    console.log('Executing Activity A');

    //Activity A code
    //...

    next([{tag: 'activityB'}, {tag: 'activityC', nextExc: true}], dataActivities[0] + ' + Activity A');
    nBPM.setTransactionTag(rollBackTag);
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

  rollback: function (exit) {
    console.log('Undoing Activity B. Exit: ' + exit);
    return 0;
  }
};

activities['activityC'] = {
  exec: function (dataActivities, event, next, end) {

    console.log('Executing Activity C');

    //Activity C code
    //...

    next([{tag: 'activityD', cardinality: 2}], dataActivities[0] + ' + Activity C: ');
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

  rollback: function (exit) {
    console.log('Undoing Activity C. Exit: ' + exit);
    return 0;
  }
};

activities['activityD'] = {
  exec: function (dataActivities, event, next, end) {

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