var generateUUID4 = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

var orderData = function(tef_account, total, currency, country, statement, order_code) {

  return {
    tef_account : tef_account,
    total       : total,
    currency    : currency,
    country     : country,
    statement   : statement,
    order_code  : order_code
  };

};

var processRecurrentPayment = function(orderData, callback) {
  var tef_account = orderData.tef_account;
  var country = orderData.country;


  callback(true);
};

var processPayment = function(data, callback) {
  var customer_data = data['customer'];

  var total    = parseInt(data['total'] * 100);
  var currency = 'EUR';

  var tef_account = customer_data['tef_account'];
  var country     = customer_data['country'];
  var statement   = "statement";
  var order_code  = generateUUID4();

  var paymentData = orderData(tef_account, total, currency, country, statement, order_code)

  processRecurrentPayment(data, callback);


};

exports.processPayment = processPayment;