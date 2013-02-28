var xml2js = require('xml2js');
var fs = require('fs');
var catalogue = require('./catalogue.js');

var getPrice = function(catalogue, concept){

  if (!catalogue.CATALOGUE[concept]) {
    console.log('missing code: ' + concept);
    return -1;
  }

  return catalogue.CATALOGUE[concept].price;
}

var getDescription = function(catalogue, concept){

  if (!catalogue.CATALOGUE[concept]) {
    console.log('missing code: ' + concept);
    return '';
  }

  return catalogue.CATALOGUE[concept].description;
}

var roundPrice = function(price) {
  return Math.round(price*100)/100;
}

var createInvoiceEntry = function(concept, price, description, amount) {
  return {
    'concept': concept,
    'price': price,
    'description': description,
    'amount': amount,
    'total': roundPrice(price*amount)
  }
}

var rating = function(data, callback) {

  var file = data['consumption'];
  var fileName = data['file'];

  var parser = new xml2js.Parser();
  fs.readFile(file, function(err, data) {
    parser.parseString(data, function (err, result) {

      var res = {};
      res['items'] = [];
      res['subtotal'] = 0;

      var root = result.fichero_consumos_variables;
      var date = root.fecha_envio[0];
      var consumption = root.consumos_variables[0].consumo_variable;

      var firstContract = consumption[0].contrato[0];
      if (!firstContract) {
        console.log('ERROR: NOT detected contracts');
        callback(-1);
      }

      for (var i = 1; i < consumption.length; i++) {

        if (consumption[i].contrato[0] !== firstContract) {
          console.log('ERROR: TOO MANY different contracts!!!');
          callback(-1);
        }
      }

      res['contract'] = firstContract;

      for (var i = 0; i < consumption.length; i++) {
        var concept = consumption[i].concepto_facturable[0];
        var amount = consumption[i].unidades[0];

        var price = getPrice(catalogue, concept);
        var description = getDescription(catalogue, concept);

        var invoice_entry = createInvoiceEntry(concept, price, description, amount);

        res['items'].push(invoice_entry);

        res['subtotal'] += invoice_entry['total'];
      }

      res['total'] = roundPrice(catalogue.TAX * res['subtotal']);

      //Computing subtotal
      res['tax_rate'] = Math.round((catalogue.TAX - 1) * 100);

      //Computing taxes
      res['taxes'] = roundPrice(res['total'] - res['subtotal']);

      //Adding file_name for naming PDF
      res['sdr_file_name'] = fileName;

      callback(res);
    });
  });
};

exports.rating = rating;