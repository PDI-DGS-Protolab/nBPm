var nBPM = require('../nBPM.js');

var activities = {};
var rollBackExecuted = false;
var rollBackTag = 'transactionTAG1'

activities['activityA'] = {
  exec: function (dataActivities, event, next, nextExc, end) {
    console.log('executing activity A');
    //Activity A code

    next(['activityB', 'activityC'], dataActivities[0] + 'A');
    nBPM.insertTag(rollBackTag);
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit) {
    console.log('This activity cannot be undone...');
    return 0;
  }
};

activities['activityB'] = {
  exec: function (dataActivities, event, next, nextExc, end) {
    console.log('executing activity B');
    //Activity B code
    next(['activityD'], dataActivities[0] + 'B' + event.data, 2);
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
    console.log('Undoing Activity B');
    return 0;
  }
};

activities['activityC'] = {
  exec: function (dataActivities, event, next, nextExc, end) {
    console.log('executing activity C');
    //Activity C code
    next(['activityD'], dataActivities[0] + 'C', 2);
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
    console.log('Undoing Activity C');
    return 0;
  }
};

activities['activityD'] = {
  exec: function (dataActivities, event, next, nextExc, end) {

    if (!rollBackExecuted) {
      nBPM.rollBack(rollBackTag);
      rollBackExecuted = true;
    } else {
      console.log('executing activity D');
      //Activity D code
      console.log('Received data = ' + dataActivities);
      end(dataActivities);
    }
  },

  filter: function (dataActivities, event) {
    return true;
  },

  rollback: function (exit) {
    console.log('This activity cannot be undone...');
    return 0;
  }
};

nBPM.process(activities);

setTimeout(function () {
  //To be replaced by start function.
  nBPM.start('activityA', '¡EXAMPLE!');
}, 100);