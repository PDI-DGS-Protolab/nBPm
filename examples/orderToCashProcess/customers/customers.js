var getCustomers = function(accountID) {

  if (accountID === 'test1') {

    var contact = {};

    contact.Name = 'Telefonica';
    contact.MailingStreet = 'Ronda de la Comunicación s/n, Madrid, Spain';
    contact.MailingCity = 'Madrid';
    contact.MailingPostalCode = '28000';
    contact.Email = 'amagan@conwet.com';
    contact.MailingCountry = 'Spain';
    contact.TefAccount__c = 'TID-5457137';

    return contact;
  } else {
    return undefined;
  }
};

var getCustomer = function(data, callback) {
  var account_id = data['contract'];

  var contact = getCustomers(account_id)

  if (!contact) {
    callback({});
  }

  callback( {
    'name'       : contact.Name,
    'address'    : contact.MailingStreet,
    'city'       : contact.MailingCity,
    'postal_code': contact.MailingPostalCode,
    'email'      : contact.Email,
    'country'    : contact.MailingCountry,
    'tef_account': contact.TefAccount__c
  });
};

exports.getCustomer = getCustomer;